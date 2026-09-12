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

/**
 * 实时视图的画质档。
 *
 * - `perf` —— 每个 **CSS** 像素抓一个点（`deviceScaleFactor: 1`）。最省：帧小、编码快，
 *   但在 2× 屏上那块画面是插值放大出来的，比周围的原生文字糊。
 * - `hd` —— 每个 **物理** 像素抓一个点（`deviceScaleFactor: 2`）。2× 屏上像素级清晰，
 *   1× 屏上是超采样后缩小（字更匀）；代价是每帧 4 倍像素，编码与传输跟着涨。
 *
 * 它描述的是「看的人」想要什么，与哪只浏览器无关，因此是**全局偏好**而不是每会话状态。
 */
export type BrowserQuality = 'perf' | 'hd'
