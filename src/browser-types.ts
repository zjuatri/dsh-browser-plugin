/**
 * 浏览器运行时的公共数据形状与浏览器模式。
 *
 * @module dsh-browser-plugin/src/browser-types
 */

/** `browser_goto` 一次导航的结果。 */
export interface GotoResult {
  url: string
  finalUrl: string
  status: number | null
  title: string
  text: string
  links: Array<{ text: string; href: string }>
}

/** `browser_screenshot` 一次截图的结果。 */
export interface ScreenshotResult {
  dataUrl: string
  mime: string
  bytes: number
}

/** 上报给视图与 tabs 工具的一行标签页信息。 */
export interface TabInfo {
  index: number
  url: string
  title: string
  active: boolean
}

/** 前进/后退/刷新这类历史操作的结果。 */
export interface HistoryResult {
  ok: boolean
  url: string
  message?: string
}

/** 会话所驱动的浏览器种类。 */
export type BrowserMode = 'own' | 'stealth'
