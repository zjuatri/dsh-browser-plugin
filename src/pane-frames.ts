/**
 * 把画面送出去：**性能档**转发画面流那一帧，**高清档**另截一张 2 倍图。
 *
 * 两个档位为什么不能用同一条通道：
 *
 * - `Page.startScreencast` 出来的帧**永远等于 CSS 视口大小**。实测把 `deviceScaleFactor`
 *   提到 2、或者给 `maxWidth`/`maxHeight` 都没用（后两者只是上限，只能缩小不能放大），
 *   所以画面流这条通道**拿不到** 2 倍像素。它快（60fps）、省（每帧几 KB），但糊。
 * - `Page.captureScreenshot` 的 `clip.scale` 会**按该倍率重新光栅化**：实测在 dsf=1 与
 *   dsf=2 下都给出 1134×1284，同样的内容 27KB 对 9KB —— 是真的多出细节，不是插值放大。
 *   代价是每帧要重新光栅化 + 编码一次（约 30–70ms），所以只能十几帧，且必须按需取。
 *
 * 于是高清档拿画面流当**变化信号**：内容变了才去截一张 2 倍的。这里有两个坑都踩过：
 *
 * 1. 取图本身会让合成器产生 damage，画面流随即再推一帧**同样的画面**，于是又触发一次取图
 *    —— 不比内容就是自激环（实测静态页面 2 秒 33 帧）。画面没变时 JPEG 字节是稳定的，所以
 *    直接比 base64 字符串就能断掉它，比解码像素便宜得多。
 * 2. 一次取图要几十毫秒，期间的多次变化必须合并（`capturePending`），否则滚动一下就会堆出
 *    几十次取图。
 *
 * @module dsh-browser-plugin/src/pane-frames
 */

import type { CDPSession, Page } from 'puppeteer-core'
import type { BrowserQuality } from './browser-types.js'
import type { PaneFrame } from './pane-wire.js'

/** 抓帧的 JPEG 质量：画面流与高清截图共用同一个值，换档时观感才没有台阶。 */
export const FRAME_QUALITY = 60

/** 高清档的截图倍率（见模块头）。 */
export const HD_CAPTURE_SCALE = 2

/** 送帧过程中要跨帧记住的东西（由 `PaneStream` 持有）。 */
export interface FrameMemory {
  /** 当前画质档。 */
  quality: BrowserQuality
  /** 最近一帧：重放给后连上的客户端，让刷新的视图立刻是最新的。 */
  lastFrame: PaneFrame | null
  /** 高清档正在取图；期间新来的变化只记一个待办。 */
  captureInFlight: boolean
  capturePending: boolean
  /** 上一帧画面流的 base64，用来识别「画面其实没变」（见模块头第 1 点）。 */
  lastSignalData: string | null
}

/**
 * 造一份空的送帧记忆。
 *
 * @param quality - 初始画质档。
 * @returns 全新的记忆对象。
 */
export function createFrameMemory(quality: BrowserQuality): FrameMemory {
  return { quality, lastFrame: null, captureInFlight: false, capturePending: false, lastSignalData: null }
}

/** 送帧时要问宿主（`PaneStream`）拿的东西：它掌握画面流会话与视图连接。 */
export interface FrameHost {
  /** 画面流所依附的 CDP 会话；没有画面流时为 null。 */
  session: () => CDPSession | null
  /** 当前被镜像的页面。 */
  page: () => Page | null
  /** 页面 CSS 视口；没有视图接管时为 null。 */
  viewport: () => { width: number; height: number } | null
  /** 是否还有视图在看（没人看就不必取图）。 */
  watched: () => boolean
  /** 发出一帧：缓存、同步状态行、广播都由宿主做。 */
  publish: (frame: PaneFrame) => void
}

/** 画面流推来一帧。 */
export interface ScreencastFrame {
  data: string
  width: number
  height: number
  url: string
}

/**
 * 处理画面流的一帧。
 *
 * 性能档：它就是最终画面，直接发。
 * 高清档：它只是「画面变了」的信号，内容真的变了才去截一张 2 倍的（见模块头）。
 *
 * @param memory - 送帧记忆。
 * @param host - 宿主接口。
 * @param frame - 画面流那一帧。
 */
export function noteScreencastFrame(memory: FrameMemory, host: FrameHost, frame: ScreencastFrame): void {
  if (memory.quality === 'hd') {
    const previous = memory.lastSignalData
    memory.lastSignalData = frame.data
    // 第一次信号帧只记基准：建立画面流时宿主已经主动取过一张了。
    if (previous !== null && previous !== frame.data) queueHdCapture(memory, host)
    return
  }
  host.publish({
    data: frame.data,
    width: frame.width,
    height: frame.height,
    // CSS 视口就是我们设的那个模拟尺寸；还没有视图报过尺寸时它是默认视口，而那时倍率
    // 必然是 1，`width` 本身就是 CSS 宽 —— 两者一致。
    cssWidth: host.viewport()?.width ?? frame.width,
    cssHeight: host.viewport()?.height ?? frame.height,
    url: frame.url,
  })
}

/** 排一次高清取图；已有一次在跑时只记一个待办（见模块头第 2 点）。 */
export function queueHdCapture(memory: FrameMemory, host: FrameHost): void {
  if (memory.captureInFlight) {
    memory.capturePending = true
    return
  }
  void runHdCapture(memory, host)
}

/**
 * 高清档的一帧：`Page.captureScreenshot` 带 `clip.scale = HD_CAPTURE_SCALE`。
 *
 * 三条容易踩的地方：`clip` 的原点是**页面**坐标（所以要带滚动偏移，否则页面一滚动拍到的
 * 就是页面顶部）；`captureBeyondViewport: false`（只要可见的那一屏）；取不到就静默放弃 ——
 * 下一次画面变化还会再来一次，这里绝不能把画面流的自愈逻辑带崩。
 */
async function runHdCapture(memory: FrameMemory, host: FrameHost): Promise<void> {
  const session = host.session()
  const page = host.page()
  memory.captureInFlight = true
  try {
    if (session === null || page === null) return
    const css = host.viewport()
    if (css === null || css.width === 0 || css.height === 0) return
    const metrics = await session.send('Page.getLayoutMetrics')
    const view = metrics.cssVisualViewport ?? metrics.visualViewport
    const shot = await session.send('Page.captureScreenshot', {
      format: 'jpeg',
      quality: FRAME_QUALITY,
      fromSurface: true,
      captureBeyondViewport: false,
      clip: {
        x: view?.pageX ?? 0,
        y: view?.pageY ?? 0,
        width: css.width,
        height: css.height,
        scale: HD_CAPTURE_SCALE,
      },
    })
    // 期间可能已经换档或停流：那这一帧就作废。
    if (memory.quality !== 'hd' || host.session() !== session) return
    host.publish({
      data: shot.data,
      width: css.width * HD_CAPTURE_SCALE,
      height: css.height * HD_CAPTURE_SCALE,
      cssWidth: css.width,
      cssHeight: css.height,
      url: page.url(),
    })
  } catch { /* 取不到这一帧就算了，等下一次画面变化 */ } finally {
    memory.captureInFlight = false
    if (memory.capturePending) {
      memory.capturePending = false
      if (memory.quality === 'hd' && host.watched()) queueHdCapture(memory, host)
    }
  }
}
