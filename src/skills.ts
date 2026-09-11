/**
 * 打包进来的技能注册。
 *
 * 每个技能位于自己的目录 `skills/<name>/SKILL.md`，并以目录形式的 `resourceBase`
 * 注册到打包副本上，这样 SKILL.md 内部的相对引用会针对本包自身的文件解析
 * （dsh-plugin 打包技能标准）。
 *
 * 这些技能覆盖浏览器面向智能体的几项能力：`browser-search`（查找并阅读网页来源）、
 * `browser-navigation`（在共享页面上移动）、`browser-interaction`（通过 evaluate 做
 * DOM 自动化）、`browser-visual-check`（截图与实时视图）以及 `browser-multitab`
 * （多标签页）。
 *
 * @module dsh-browser-plugin/src/skills
 */

import { readFileSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
// 仅类型导入：激活 cordis 对 `ctx.skills` 的 Context 合并。
import type {} from '@deepseek-ai/dsh-skill'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 打包的技能名，每个对应 skills/ 下的一个目录。 */
const SKILL_NAMES = [
  'browser-search',
  'browser-navigation',
  'browser-interaction',
  'browser-visual-check',
  'browser-multitab',
] as const

/** 技能发现所用的路由描述（与各 SKILL.md 的 frontmatter 保持一致）。 */
const SKILL_DESCRIPTIONS = {
  'browser-search': 'Use when you need to find and read web sources through the browser tools (browser_goto / browser_evaluate / browser_screenshot) or the built-in web_search tool, especially when the search path fails — web_search errors, search engines return captcha / HTTP 403/429 / decoy results, or a page tears down a search-engine session. Covers route triage and a full runbook.',
  'browser-navigation': 'Use when navigating the shared Chrome page with browser_goto — choosing URLs (full URLs, hostnames, localhost ports, file paths, or search text), reading the navigation summary, handling redirects/statuses/timeouts, and working within the single shared-page model.',
  'browser-interaction': 'Use when interacting with a page through browser_evaluate — reading DOM state, clicking, typing, filling forms, scrolling, waiting for async content, and returning JSON-safe results, all on the shared page the agent and the user watch together.',
  'browser-visual-check': 'Use when verifying how a page looks — capture the shared page with browser_screenshot (viewport or full page, PNG or JPEG), confirm renders and layouts after DOM changes, and keep the shared page presentable for the human watching the live pane.',
  'browser-multitab': 'Use when working with more than one page in the shared browser — opening, listing, switching, and closing tabs, understanding which tab the other browser tools act on, and how popups and target=_blank links become tabs.',
} satisfies Record<(typeof SKILL_NAMES)[number], string>

/** 某个技能的打包目录（本模块位于打包产物的 lib/index.js）。 */
export function skillDirectory(name: (typeof SKILL_NAMES)[number]): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', `skills/${name}`)
}

/** 技能正文：从打包技能目录原样读取 SKILL.md。 */
export function skillBody(name: (typeof SKILL_NAMES)[number]): string {
  return readFileSync(join(skillDirectory(name), 'SKILL.md'), 'utf8')
}

/** 注册全部打包技能，返回 cordis 的 effect 拆除函数。 */
export function registerBrowserSkills(ctx: Context): Array<() => void> {
  return SKILL_NAMES.map(name => ctx.skills.register({
    name,
    description: SKILL_DESCRIPTIONS[name],
    source: 'bundled',
    content: skillBody(name),
    resourceBase: { kind: 'directory', path: skillDirectory(name) },
  }))
}
