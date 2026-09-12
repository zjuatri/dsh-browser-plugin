/**
 * 实时视图的流与输入控制器：画面流（CDP `Page.startScreencast`）、合成输入
 * （CDP `Input` 域）、以及向已连接视图广播状态。
 *
 * 画面流会话由本模块持有，并跟随 SSE 客户端：第一个订阅者启动它，最后一个订阅者
 * 停止它，插件拆除时一并清理。
 *
 * 输入保真度沿用 terminal-browser 的参考模型：双击/三击计数、鼠标与键盘事件的
 * 修饰键位掩码、带行模式的滚轮小数累积与刻度换算、客户端离开时释放仍被按住的
 * 键，以及视图持有页面期间开启焦点模拟。
 *
 * @module dsh-browser-plugin/src/pane-stream
 */

import type { CDPSession, Page } from 'puppeteer-core'
import type { ServerResponse } from 'node:http'
import type { BrowserRuntime } from './browser.js'
import { QueueAbortError, type BrowserQueue } from './browser-queue.js'
import type { BrowserQuality, TabInfo } from './browser-types.js'
import { createInputMemory, dispatchInput, releaseHeldKeys } from './pane-input.js'
import {
  FRAME_QUALITY,
  createFrameMemory,
  noteScreencastFrame,
  queueHdCapture,
  type FrameHost,
  type FrameMemory,
} from './pane-frames.js'
import { QUALITY_SCALE, type PaneFrame, type PaneInputEvent, type PaneState } from './pane-wire.js'

/** 画面流断开后延迟多久重启（毫秒）。 */
const RESTART_DELAY_MS = 500
/**
 * 一条流上最多同时保留几个视图客户端。
 *
 * 正常情况就是一个会话一个面板（多开几个窗口也就两三个）。给到 4 是留余量，同时保证
 * 泄漏的视图不会把浏览器的 6 条并发连接配额吃光。
 */
const MAX_CLIENTS = 4
/**
 * 视口变更的防抖窗口（毫秒）：拖侧边栏时尺寸每帧都变，逐次改视口会让页面连续重排；
 * 等手停下来再改一次，用户看到的是「松手后按新宽度重排」而不是一路抖动。
 */
const VIEWPORT_DEBOUNCE_MS = 200
/**
 * 地址同步的兜底轮询间隔（毫秒）。主路径是页面导航事件，但导航事件不覆盖全部地址
 * 变化（历史 API 改地址等），低频轮询兜住它们：`page.url()` 是本地缓存读取。
 */
const URL_SYNC_INTERVAL_MS = 400

/** 去掉锚点后的地址：用来判断两次导航是否落在同一个文档里。 */
function documentKey(url: string): string {
  const hash = url.indexOf('#')
  return hash === -1 ? url : url.slice(0, hash)
}

/** 实时视图的流与输入控制器。 */
export class PaneStream {
  private readonly clients = new Set<ServerResponse>()
  private cdp: CDPSession | null = null
  private screencastPage: Page | null = null
  /** 合成输入的跨事件记忆（双击计数、滚轮余额、按住的键）；派发逻辑在 `pane-input.ts`。 */
  private readonly input = createInputMemory()
  /**
   * 送帧记忆（最近一帧、当前档位、取图状态）。
   *
   * 两个档位怎么送、什么时候补一张 2 倍截图，都在 `pane-frames.ts`；这里只提供它要问的
   * 东西（会话、页面、视口、有没有人在看）与「发出一帧」这个动作。
   */
  private readonly frames: FrameMemory
  /** 交给 `pane-frames` 的宿主接口。 */
  private readonly frameHost: FrameHost
  private lastState: PaneState
  private lastTabs: TabInfo[] = []
  /** 画面流丢失后的延迟重启定时器（拆除时清除）。 */
  private restartTimer: ReturnType<typeof setTimeout> | null = null
  /** 地址兜底轮询定时器与导航监听（随画面流建立/拆除）。 */
  private urlTimer: ReturnType<typeof setInterval> | null = null
  private offNavigated: (() => void) | null = null
  /** 视口尺寸的防抖定时器与最后一次请求（面板拖动时会连续上报）。 */
  private viewportTimer: ReturnType<typeof setTimeout> | null = null
  private pendingViewport: { width: number; height: number } | null = null
  private readonly offTabsChanged: () => void
  /** 被镜像的浏览器运行时。 */
  private readonly runtime: BrowserRuntime
  /** 与智能体工具共用的串行队列（视口变更也要从它过）。 */
  private readonly queue: BrowserQueue

  // 显式声明并赋值，而不用 TypeScript 的参数属性：构建脚本依赖 Node 的 strip-only
  // 类型剥离，而它不支持参数属性。
  //
  // `quality` 给默认值是为了「忘了传」时退化成本插件一贯的行为（1 倍抓帧），而不是
  // 让 `QUALITY_SCALE[undefined]` 变成 NaN 一路传到 `page.setViewport`。
  constructor(runtime: BrowserRuntime, queue: BrowserQueue, quality: BrowserQuality = 'perf') {
    this.runtime = runtime
    this.queue = queue
    this.frames = createFrameMemory(quality)
    this.frameHost = {
      session: () => this.cdp,
      page: () => this.screencastPage,
      viewport: () => this.runtime.viewportSize(),
      watched: () => this.clients.size > 0,
      publish: (frame) => { this.publishFrame(frame) },
    }
    this.lastState = { active: false, url: '', mode: 'own', quality }
    // 跟随会话的活动标签页：广播标签页集合，并在活动页面变化时重启画面流
    // （画面流镜像的正是智能体工具所作用的那个页面）。
    this.offTabsChanged = runtime.onTabsChanged((tabs) => {
      this.lastTabs = tabs
      this.broadcast('tabs', tabs)
      const activeRow = tabs.find(row => row.active)
      if (activeRow !== undefined && this.screencastPage !== null) {
        void runtime.sharedPage().catch(() => null).then((page) => {
          if (page !== null && page !== this.screencastPage && this.clients.size > 0) {
            this.frames.lastFrame = null
            void this.startScreencast()
          }
        })
      }
    })
  }

  /** 当前状态快照（新客户端连接时重放）。 */
  state(): PaneState {
    return this.lastState
  }

  /** 标签页快照（新客户端连接时重放）。 */
  tabs(): TabInfo[] {
    return this.lastTabs
  }

  /** 最近一帧（新客户端连接时重放）。 */
  frame(): PaneFrame | null {
    return this.frames.lastFrame
  }

  /**
   * 新增一个 SSE 客户端并重放当前状态。
   *
   * 超过 {@link MAX_CLIENTS} 时把**最旧**的一条结束掉：浏览器对同一 origin 只有 6 条并发
   * 连接，而泄漏的视图（旧代码里每个面板实例一条）会把配额占满，进而让整个页面的请求都排
   * 不上队。结束的对面 `EventSource` 会自己重连，功能不丢，但服务端不再需要同时为十几条
   * 僵尸响应重复广播每一帧。
   *
   * @param res - 这条 SSE 响应。
   */
  addClient(res: ServerResponse): void {
    while (this.clients.size >= MAX_CLIENTS) {
      const oldest = this.clients.values().next().value
      if (oldest === undefined) break
      this.clients.delete(oldest)
      try {
        oldest.end()
      } catch { /* 客户端早就走了 */ }
    }
    this.clients.add(res)
  }

  /** 移除一个 SSE 客户端；没有客户端时停止画面流。 */
  removeClient(res: ServerResponse): void {
    this.clients.delete(res)
    if (this.clients.size === 0) {
      releaseHeldKeys(this.cdp, this.input)
      this.stopScreencast()
    }
  }

  /** 是否已有视图在看。 */
  get watching(): boolean {
    return this.clients.size > 0
  }

  /** 向所有客户端广播一个 SSE 事件。 */
  broadcast(event: string, payload: PaneFrame | PaneState | TabInfo[]): void {
    const line = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
    for (const res of this.clients) {
      try {
        res.write(line)
      } catch {
        this.clients.delete(res)
      }
    }
  }

  /** 只给一个客户端写一条 SSE 事件（连接时重放用）。 */
  send(res: ServerResponse, event: string, payload: PaneFrame | PaneState | TabInfo[]): void {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
    } catch {
      this.clients.delete(res)
    }
  }

  /**
   * 视图报告面板尺寸，防抖后把共享页面的视口改成同一个形状。只在尺寸真正变化时才
   * 应用，避免拖到一半停下也白推一次视口。
   *
   * @param width - 面板可用宽度（CSS 像素）。
   * @param height - 面板可用高度（CSS 像素）。
   */
  requestViewport(width: number, height: number): void {
    const target = { width: Math.round(width), height: Math.round(height) }
    const current = this.runtime.viewportSize()
    // 尺寸**和**抓帧倍率都一样才算无需变更：画质换了而面板大小没变时，视口要按新倍率
    // 重设一次，否则页面会一直停在旧倍率上。
    if (
      current !== null
      && current.width === target.width
      && current.height === target.height
      && current.deviceScaleFactor === QUALITY_SCALE[this.frames.quality]
    ) return
    this.pendingViewport = target
    if (this.viewportTimer !== null) clearTimeout(this.viewportTimer)
    this.viewportTimer = setTimeout(() => {
      this.viewportTimer = null
      const pending = this.pendingViewport
      this.pendingViewport = null
      if (pending === null) return
      void this.applyViewport(pending.width, pending.height)
    }, VIEWPORT_DEBOUNCE_MS)
  }

  /**
   * 应用一次视口变更，然后让画面流按新尺寸重来。
   *
   * 从串行队列过：`setViewport` 会触发页面重排，正好插在智能体的调用中间时会干扰它
   * （例如刚点开的下拉框被重排掉）。重启画面流而不是只改视口：CDP 已经在按旧尺寸出帧
   * 了，而换尺寸那一刻的帧仍带着旧尺寸，视图按比例铺满时会短暂变形。
   */
  private async applyViewport(width: number, height: number): Promise<void> {
    try {
      await this.queue.run('viewport', undefined, async () => {
        await this.runtime.setViewport(width, height, QUALITY_SCALE[this.frames.quality])
        if (this.clients.size > 0) {
          this.frames.lastFrame = null
          this.stopScreencast()
          await this.startScreencast()
        }
      })
    } catch (error) {
      if (error instanceof QueueAbortError) return
      const message = error instanceof Error ? error.message : String(error)
      this.setState({ active: false, url: '', error: message, mode: this.runtime.currentMode(), quality: this.frames.quality })
    }
  }

  /**
   * 换画质档并立刻按新倍率重来一遍画面流。
   *
   * 档位是全局偏好，但倍率是**每只浏览器**的视口属性，所以宿主改了档要挨个通知每个
   * 会话的流（见 `BrowserSessions.streams()`），这里负责其中一只。重来而不是只改一次
   * dsf：CDP 已经在按旧档位出帧了，不重启的话视图会继续收到旧倍率的帧，而那时帧的
   * `cssWidth` 与视图算出来的宽度已经对不上 —— 点击会整体错位。
   */
  setQuality(quality: BrowserQuality): void {
    if (this.frames.quality === quality) return
    this.frames.quality = quality
    // 先把档位广播出去：按钮立刻跟着变，画面慢一步到（可能还在等串行队列）。
    this.setState({ ...this.lastState, quality })
    const size = this.runtime.viewportSize()
    // 还没有视图报过尺寸：等它报，那次 `setViewport` 自然带上新档位。
    if (size === null) return
    void this.applyViewport(size.width, size.height)
  }

  /**
   * 发出一帧：缓存、状态与广播在一处做，两个档位走的都是这条路（`pane-frames` 的回调）。
   *
   * @param frame - 要广播的帧（设备像素 + CSS 视口两套尺寸都在里面）。
   */
  private publishFrame(frame: PaneFrame): void {
    this.frames.lastFrame = frame
    // 保留其余字段（尤其是 `driver`）：否则每一帧都会把「谁在驱动」抹掉。
    this.lastState = { ...this.lastState, active: true, url: frame.url, mode: this.runtime.currentMode() }
    this.broadcast('frame', frame)
  }

  /** 拆掉视口防抖定时器。 */
  private clearViewportTimer(): void {
    if (this.viewportTimer !== null) clearTimeout(this.viewportTimer)
    this.viewportTimer = null
    this.pendingViewport = null
  }

  /** 记录并广播「哪个会话正在驱动浏览器」。跨会话争用因此变成可见状态。 */
  noteDriver(sessionId: string | null): void {
    if (this.lastState.driver === sessionId) return
    this.syncUrl()
    this.setState({ ...this.lastState, driver: sessionId ?? undefined })
  }

  /**
   * 把状态里的地址同步成页面当前的地址（变了才广播）。
   *
   * 画面帧只在**画面变化**时才推，而地址变化不一定改画面 —— 于是会出现「智能体已经
   * 跳到别的网站，侧边栏的地址栏还停在上一页」。地址因此不能只靠帧来更新，必须由
   * 页面导航事件加一次低频轮询兜住。
   */
  syncUrl(): void {
    const page = this.screencastPage
    if (page === null) return
    let url: string
    try {
      url = page.url()
    } catch {
      return
    }
    if (url === this.lastState.url) return
    // 同文档（只有锚点不同）时画面仍然有效，只把地址改过来；跨文档导航后缓存帧画的
    // 是旧页面，直接丢掉 —— 否则刚连上的视图会把旧画面配上新地址。
    if (this.frames.lastFrame !== null) {
      this.frames.lastFrame = documentKey(url) === documentKey(this.lastState.url)
        ? { ...this.frames.lastFrame, url }
        : null
    }
    this.setState({ ...this.lastState, active: true, error: undefined, url, mode: this.runtime.currentMode() })
  }

  /** 解绑地址监听并停掉兜底轮询。 */
  private stopUrlWatch(): void {
    if (this.urlTimer !== null) clearInterval(this.urlTimer)
    this.urlTimer = null
    const off = this.offNavigated
    this.offNavigated = null
    if (off !== null) off()
  }

  /** 更新并广播浏览器状态。 */
  setState(next: PaneState): void {
    this.lastState = next
    this.broadcast('state', next)
  }

  /** 清掉缓存帧（换页或换模式后旧画面已经不代表现状）。 */
  clearFrame(): void {
    this.frames.lastFrame = null
  }

  /** 重播标签页集合并记住它。 */
  setTabs(tabs: TabInfo[]): void {
    this.lastTabs = tabs
    this.broadcast('tabs', tabs)
  }

  /** 停止画面流并断开 CDP 会话。 */
  stopScreencast(): void {
    // 先解绑监听与轮询：`disconnected` 会把 `cdp` 置空，若放在早退之后清理，
    // 这条路径上的定时器就再也没人管了。
    this.stopUrlWatch()
    const session = this.cdp
    this.cdp = null
    this.screencastPage = null
    if (session === null) return
    releaseHeldKeys(this.cdp, this.input)
    void session.send('Emulation.setFocusEmulationEnabled', { enabled: false }).catch(() => {})
    void session.send('Page.stopScreencast').catch(() => {})
    void session.detach().catch(() => {})
  }

  /** 启动（或重启）画面流。 */
  async startScreencast(): Promise<void> {
    try {
      const page = await this.runtime.sharedPage()
      if (this.cdp !== null && this.screencastPage === page) {
        // 已经有画面流了，但期间页面可能已经导航过（视图关着的那段时间）：
        // 至少把地址补上，不能等下一帧。
        this.syncUrl()
        return
      }
      if (this.cdp !== null) this.stopScreencast()
      this.stopUrlWatch()
      // 新的一次画面流：上一轮的信号帧不再有可比性。
      this.frames.lastSignalData = null
      const session = await page.createCDPSession()
      this.cdp = session
      this.screencastPage = page
      const onNavigated = (): void => { this.syncUrl() }
      page.on('framenavigated', onNavigated)
      this.offNavigated = () => { page.off('framenavigated', onNavigated) }
      this.urlTimer = setInterval(() => { this.syncUrl() }, URL_SYNC_INTERVAL_MS)
      session.on('Page.screencastFrame', (frame) => {
        const { data, sessionId, metadata } = frame
        // CDP 只有在帧被确认后才会继续推送。
        void session.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
        // 性能档：这一帧就是最终画面。高清档：它只是「画面变了」的信号，`pane-frames`
        // 会判断内容是否真的变了，再补一张 2 倍截图。
        noteScreencastFrame(this.frames, this.frameHost, {
          data,
          width: metadata.deviceWidth,
          height: metadata.deviceHeight,
          url: page.url(),
        })
      })
      session.on('disconnected', () => {
        if (this.cdp === session) this.cdp = null
        if (this.screencastPage === page) this.screencastPage = null
        // 自愈：一直连着的视图否则永远等不到新的画面流（重启原本只发生在新的
        // 客户端接入时）。
        if (this.clients.size > 0) {
          this.setState({ active: false, url: '', error: '画面流已断开，正在重连…', mode: this.runtime.currentMode(), quality: this.frames.quality })
          if (this.restartTimer !== null) clearTimeout(this.restartTimer)
          this.restartTimer = setTimeout(() => {
            this.restartTimer = null
            void this.startScreencast()
          }, RESTART_DELAY_MS)
        }
      })
      await session.send('Page.enable')
      // 帧按**模拟视口的原始尺寸**推送：视图那边的页面尺寸就是面板尺寸，所以既
      // 不需要放大（糊）也不需要缩小（浪费）。不设 maxWidth/maxHeight，CDP 便按
      // 设备尺寸出帧 —— 也就是 CSS 视口 × 抓帧倍率（见 `setViewport`）。
      await session.send('Page.startScreencast', {
        format: 'jpeg',
        quality: FRAME_QUALITY,
        everyNthFrame: 1,
      })
      // 画面流期间由视图持有页面：开启焦点模拟，让依赖焦点的页面行为
      // （动画、:focus 状态）保持真实。
      void session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {})
      this.setState({ active: true, url: page.url(), mode: this.runtime.currentMode(), quality: this.frames.quality })
      // 高清档：画面流本身只能当变化信号用，所以建立/重建之后先主动取一张 2 倍的 —— 否则
      // 切到高清、或者刚打开视图时，要等页面**下一次**变化才会变清晰。
      if (this.frames.quality === 'hd') queueHdCapture(this.frames, this.frameHost)
    } catch (error) {
      this.stopUrlWatch()
      this.cdp = null
      this.screencastPage = null
      const message = error instanceof Error ? error.message : String(error)
      this.setState({ active: false, url: '', error: message, mode: this.runtime.currentMode(), quality: this.frames.quality })
    }
  }

  /**
   * 把一条视图输入事件派发进页面。
   *
   * 真正的翻译在 `pane-input.ts`（双击计数、滚轮余额、按住键的记账都在那儿）；这里只负责
   * 取当前会话与「还没就绪」这个错误。
   */
  async dispatchInput(event: PaneInputEvent): Promise<void> {
    const session = this.cdp
    if (session === null) throw new Error('浏览器尚未就绪 —— 还没有打开任何页面')
    await dispatchInput(session, this.input, event)
  }

  /** 彻底拆除：停流、解绑、结束所有客户端。 */
  dispose(): void {
    this.offTabsChanged()
    this.clearViewportTimer()
    if (this.restartTimer !== null) clearTimeout(this.restartTimer)
    this.restartTimer = null
    this.stopScreencast()
    for (const res of this.clients) {
      try {
        res.end()
      } catch { /* 客户端早就走了 */ }
    }
    this.clients.clear()
  }
}
