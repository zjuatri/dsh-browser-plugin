/**
 * dsh-browser-plugin 宿主侧入口：为 DeepSeek Harness 提供**按会话隔离**的 Chrome。
 *
 * 在宿主的 `tools` 注册表上注册浏览工具：
 *   - `browser_goto`       —— 导航并摘要一个页面
 *   - `browser_evaluate`   —— 在页面里跑 JS，返回 JSON
 *   - `browser_screenshot` —— 截取 PNG/JPEG 的 data URL
 *   - 以及点击/输入/读取/等待/无障碍树等结构化工具
 *
 * 浏览器引擎沿用 zenbu-labs/terminal-browser 的分支：把原来的 React Ink 终端界面
 * 换成 DSH 的工具面，外加一个**右侧边栏标签页**里的实时视图。Chrome 由本 Node
 * 运行时通过 `puppeteer-core` 直接拉起（独立的操作系统进程），因此浏览器崩溃不会
 * 拖垮 harness。
 *
 * 与更早版本的差异：**每个会话一只 Chrome、一份独立 profile**（见
 * `browser-sessions.ts`）。此前所有对话共用一只，登录态因此是隐式共享的，跨会话争用也
 * 要靠一把全局锁压住；现在两侧都按会话分：工具侧取 `exec.agent.id`，视图侧取槽位框架
 * 注入的 `sessionId`（实测两者完全一致）。
 *
 * @module dsh-browser-plugin/src/index
 */

import type { Context } from '@deepseek-ai/cordis'
// 仅类型导入：激活 cordis 对 `ctx.tools` 与 `ctx.skills` 的 Context 合并。
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-skill'
import { Config, type ResolvedConfig } from './config.js'
import { registerBrowserTools } from './tools.js'
import { registerBrowserSkills } from './skills.js'
import { BrowserSessions } from './browser-sessions.js'
import { BrowserRuntime } from './browser.js'
import { PaneStream } from './pane-stream.js'
import { registerBrowserPane } from './pane.js'
import { BrowserQueue, QueueAbortError } from './browser-queue.js'
import { ownershipFrom, gateTool, SUBAGENT_DENIED } from './tool-session.js'

// 重新导出 schemastery 的 `Config`：cordis 的插件加载器要用它校验原始 profile
// 配置，并在 `apply` 运行之前补上默认值。
//
// `BrowserQueue`/`PaneStream`/`BrowserSessions`/`BrowserRuntime` 也一并导出：不是给加载器
// 用的，而是给测试用的 —— 「同一会话内只有一个调用在驱动浏览器」「按会话隔离」「切换模式
// 会把当前地址带过去」这些保证都住在它们里面，而测试应该跑在**构建产物**上（源码里的
// `./x.js` 说明符在 Node 下解析不到同名的 `.ts`）。它们在这里是值绑定，因此 `moduleFaces`
// 能把它们转发出去。
export {
  Config,
  BrowserQueue,
  BrowserRuntime,
  BrowserSessions,
  QueueAbortError,
  PaneStream,
  gateTool,
  ownershipFrom,
  SUBAGENT_DENIED,
}
export type { Config as BrowserPluginConfig, ResolvedConfig, Viewport } from './config.js'

/** cordis 插件名，用于加载器诊断。 */
export const name = 'dsh-browser-plugin'

/** 本插件依赖的服务；`tools` 与 `skills` 是它要消费的东西。 */
export const inject = ['tools', 'skills']

/**
 * 套用插件：注册浏览工具与打包技能，并在 Web 服务器就绪后挂上实时视图路由。
 *
 * 工具与技能绑定在本插件 fiber 上，因此它们的拆除函数在一个 `ctx.effect` 生成器里
 * 被收集并 yield（递归模式）：卸载插件会关掉所有会话的 Chrome 并注销工具与技能。
 *
 * 视图路由则必须**等** `webServer` 真正存在再注册，不能用 `ctx.get('webServer')` 顺手
 * 探一下：插件可能在 Web 服务器挂载之前就被应用（排列顺序由 profile 的补丁层决定，
 * 不是本插件能假设的），那时服务还不存在，探到的是 `undefined`。而 fiber 一旦跑完，
 * 就再没有人会因为服务后来出现而回头补跑一次 —— 结果是浏览器工具一切正常、视图路由
 * 却整批缺失，表现为侧边栏能打开标签页但画面永远是空的，而且没有任何报错。
 *
 * `ctx.inject(['webServer'], …)` 正是为这种情况准备的：它建一个子 fiber，服务就绪时
 * 才执行回调，服务缺席时该子 fiber 保持待命。因此没有 Web 服务器的组合（无头/TUI）
 * 不会因为这条依赖而永远不激活，只是不会有视图。
 */
export function apply(ctx: Context, config: Config): void {
  // 安全性：cordis 已在 `apply` 运行之前用导出的 `Config` schema 校验原始 profile
  // 配置并补齐全部默认值，因此运行时对象恰好带有下面这个类型所声明的已解析字段。
  const resolved = config as ResolvedConfig

  // 按会话管理浏览器：一个实例持有全部会话的运行时、各自的锁与各自的视图。
  const sessions = new BrowserSessions(resolved, ownershipFrom(ctx.get('agents')))

  ctx.effect(function* () {
    const disposers = registerBrowserTools(ctx, resolved, sessions)
    const disposeSkills = registerBrowserSkills(ctx)
    yield () => {
      for (const dispose of disposers) dispose()
      for (const dispose of disposeSkills) dispose()
      void sessions.dispose()
    }
  })

  if (resolved.pane) {
    // 子 fiber 的生命周期挂在父 fiber 上：卸载插件时视图路由一并撤下。
    ctx.inject(['webServer'], (scoped: Context) => registerBrowserPane(scoped, sessions, resolved))
  }
}
