/**
 * 客户端插入点：把浏览器注册为**右侧边栏的一个标签页**。
 *
 * 与原 `@try-works/dsh-browser-agent` 的浮层方案相比，这里走的是产品自带的标签页
 * 机制，共两处插入：
 *
 * 1. `sidebarRightTabs.register` —— 声明一个标签页类型 `browser`，并给指南页贡献
 *    一个入口卡片（图标是本包的 Chrome 标），于是“浏览器”和“飞书”一样，是右侧
 *    边栏里可以选的一项。
 * 2. `sidebar.right.pane.tab` —— 该类型标签页的正文（实时画面）。
 *
 * 第三处插入曾经存在：`conversation.session.header.actions` 上的一键打开按钮。它
 * 和右边栏自己的展开按钮并排挤在会话标题栏里，重复且抢位置，已按需求移除 ——
 * 入口只保留指南页卡片这一处。
 *
 * 注册时带 `locale: NS`，槽位框架会把绑定好的 `t` 作为 prop 注入正文组件，所以
 * 界面文案全部来自 `text.ts`。这个槽位的作用域是 `session`，框架同时注入 **`sessionId`**
 * —— 正文靠它认领本对话自己的那只浏览器（见 `state.ts` 的 `paneRoute`）。
 *
 * @module dsh-browser-plugin/src/client/index
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// 仅类型：引入右侧边栏的 SlotMap 与 `sidebarRight*` 服务声明。
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { BrowserTab } from './browser-tab.js'
import { ChromeGlyph } from './icons.js'
import { en, NS, zh, type Translate } from './text.js'
import { ensureStyles } from './styles.js'

/** 标签页类型的判别值：`openTab('browser')` 打开的就是它。 */
export const TAB_KIND = 'browser'

/** 该实现的唯一标识；正文与标题都按它在槽位里注册。 */
export const TAB_ID = 'dsh-browser-plugin/tab'

/** 本插件依赖的浏览器侧服务。 */
export const inject = ['slots', 'locale', 'sidebarRightTabs']

/**
 * 客户端插件主体：字典、标签页类型与标签页正文。
 *
 * @param ctx - 客户端根上下文。
 */
export function apply(ctx: ClientContext): void {
  ensureStyles()
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-browser-plugin: 界面文案')
  const t = ctx.locale.bind(NS) as Translate

  // 第一步：这个类型“是什么” —— 一个按 kind 打开的页面类型，外加指南页入口。
  // 入口卡片的 glyph 用内联的 Chrome 标，不给的话指南页会画产品自带的立方体占位图。
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: TAB_ID,
    kind: TAB_KIND,
    priority: 'extension',
    title: () => t('tab.title'),
    guide: [{
      order: 40,
      title: () => t('tab.guide.title'),
      description: () => t('tab.guide.description'),
      icon: ChromeGlyph,
    }],
  }), 'dsh-browser-plugin: 标签页类型')

  // 第二步：这个类型的正文。`locale` 让槽位框架注入绑定好的 `t`。
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: TAB_ID,
    locale: NS,
  }, BrowserTab)), 'dsh-browser-plugin: 标签页正文')
}
