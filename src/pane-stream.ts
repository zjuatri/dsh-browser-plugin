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
import type { TabInfo } from './browser-types.js'
import type { PaneFrame, PaneInputEvent, PaneState } from './pane-wire.js'

/** 行模式（deltaMode 1）滚轮每个刻度对应的像素。 */
const WHEEL_DETENT_PX = 120
/** 双击/三击判定的时间窗口（毫秒）。 */
const MULTI_CLICK_MS = 500
/** 双击/三击判定的像素容差。 */
const MULTI_CLICK_PX = 4
/** 画面流断开后延迟多久重启（毫秒）。 */
const RESTART_DELAY_MS = 500
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

/** 上一次点击的记忆，用于双击/三击判定。 */
interface ClickState {
  button: string
  at: number
  x: number
  y: number
  count: number
}

/** 把带符号的小数增量朝零取整。 */
function wholeDelta(value: number): number {
  return value < 0 ? Math.ceil(value) : Math.floor(value)
}

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
  /** 双击/三击判定状态（同键、500ms 内、4px 内则计数 +1，上限 3）。 */
  private clickState: ClickState = { button: 'none', at: 0, x: 0, y: 0, count: 0 }
  /** 滚轮小数增量累积到整数像素后再发出。 */
  private wheelRemainderX = 0
  private wheelRemainderY = 0
  /** 页面里当前被按住的键：code -> key，视图客户端离开时释放。 */
  private readonly heldKeys = new Map<string, string>()
  /** 最近一帧/状态/标签页：重放给后连上的客户端，让刷新的视图立刻是最新的。 */
  private lastFrame: PaneFrame | null = null
  private lastState: PaneState = { active: false, url: '', mode: 'own' }
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
  constructor(runtime: BrowserRuntime, queue: BrowserQueue) {
    this.runtime = runtime
    this.queue = queue
    // 跟随会话的活动标签页：广播标签页集合，并在活动页面变化时重启画面流
    // （画面流镜像的正是智能体工具所作用的那个页面）。
    this.offTabsChanged = runtime.onTabsChanged((tabs) => {
      this.lastTabs = tabs
      this.broadcast('tabs', tabs)
      const activeRow = tabs.find(row => row.active)
      if (activeRow !== undefined && this.screencastPage !== null) {
        void runtime.sharedPage().catch(() => null).then((page) => {
          if (page !== null && page !== this.screencastPage && this.clients.size > 0) {
            this.lastFrame = null
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
    return this.lastFrame
  }

  /** 新增一个 SSE 客户端并重放当前状态。 */
  addClient(res: ServerResponse): void {
    this.clients.add(res)
  }

  /** 移除一个 SSE 客户端；没有客户端时停止画面流。 */
  removeClient(res: ServerResponse): void {
    this.clients.delete(res)
    if (this.clients.size === 0) {
      this.releaseHeldKeys()
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
    if (current !== null && current.width === target.width && current.height === target.height) return
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
        await this.runtime.setViewport(width, height)
        if (this.clients.size > 0) {
          this.lastFrame = null
          this.stopScreencast()
          await this.startScreencast()
        }
      })
    } catch (error) {
      if (error instanceof QueueAbortError) return
      const message = error instanceof Error ? error.message : String(error)
      this.setState({ active: false, url: '', error: message, mode: this.runtime.currentMode() })
    }
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
    if (this.lastFrame !== null) {
      this.lastFrame = documentKey(url) === documentKey(this.lastState.url)
        ? { ...this.lastFrame, url }
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
    this.lastFrame = null
  }

  /** 重播标签页集合并记住它。 */
  setTabs(tabs: TabInfo[]): void {
    this.lastTabs = tabs
    this.broadcast('tabs', tabs)
  }

  /** 释放页面里仍被按住的键。 */
  private releaseHeldKeys(): void {
    const session = this.cdp
    if (session === null || this.heldKeys.size === 0) return
    for (const [code, key] of this.heldKeys) {
      void session.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code }).catch(() => {})
    }
    this.heldKeys.clear()
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
    this.releaseHeldKeys()
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
        const url = page.url()
        this.lastFrame = { data, width: metadata.deviceWidth, height: metadata.deviceHeight, url }
        // 保留其余字段（尤其是 `driver`）：否则每一帧都会把「谁在驱动」抹掉。
        this.lastState = { ...this.lastState, active: true, url, mode: this.runtime.currentMode() }
        this.broadcast('frame', this.lastFrame)
      })
      session.on('disconnected', () => {
        if (this.cdp === session) this.cdp = null
        if (this.screencastPage === page) this.screencastPage = null
        // 自愈：一直连着的视图否则永远等不到新的画面流（重启原本只发生在新的
        // 客户端接入时）。
        if (this.clients.size > 0) {
          this.setState({ active: false, url: '', error: '画面流已断开，正在重连…', mode: this.runtime.currentMode() })
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
      // 设备尺寸出帧，元数据里的 deviceWidth/Height 也正好是页面 CSS 尺寸。
      await session.send('Page.startScreencast', {
        format: 'jpeg',
        quality: 60,
        everyNthFrame: 1,
      })
      // 画面流期间由视图持有页面：开启焦点模拟，让依赖焦点的页面行为
      // （动画、:focus 状态）保持真实。
      void session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {})
      this.setState({ active: true, url: page.url(), mode: this.runtime.currentMode() })
    } catch (error) {
      this.stopUrlWatch()
      this.cdp = null
      this.screencastPage = null
      const message = error instanceof Error ? error.message : String(error)
      this.setState({ active: false, url: '', error: message, mode: this.runtime.currentMode() })
    }
  }

  /** 计算本次点击的 clickCount（双击/三击）。 */
  private nextClickCount(button: string, x: number, y: number): number {
    const now = Date.now()
    const close = Math.abs(x - this.clickState.x) <= MULTI_CLICK_PX
      && Math.abs(y - this.clickState.y) <= MULTI_CLICK_PX
    const count = this.clickState.button === button && now - this.clickState.at <= MULTI_CLICK_MS && close
      ? Math.min(this.clickState.count + 1, 3)
      : 1
    this.clickState = { button, at: now, x, y, count }
    return count
  }

  /** 把一条视图输入事件派发进页面。 */
  async dispatchInput(event: PaneInputEvent): Promise<void> {
    const session = this.cdp
    if (session === null) throw new Error('浏览器尚未就绪 —— 还没有打开任何页面')
    switch (event.type) {
      case 'mouse-move':
        await session.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: event.x,
          y: event.y,
          modifiers: event.modifiers,
        })
        return
      case 'mouse-down': {
        const clickCount = this.nextClickCount(event.button, event.x, event.y)
        await session.send('Input.dispatchMouseEvent', {
          type: 'mousePressed',
          x: event.x,
          y: event.y,
          button: event.button,
          clickCount,
          modifiers: event.modifiers,
        })
        return
      }
      case 'mouse-up':
        await session.send('Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          x: event.x,
          y: event.y,
          button: event.button,
          clickCount: Math.max(1, this.clickState.count),
          modifiers: event.modifiers,
        })
        return
      case 'wheel': {
        const step = event.deltaMode === 1 ? WHEEL_DETENT_PX : event.deltaMode === 2 ? 600 : 1
        this.wheelRemainderX += event.deltaX * step
        this.wheelRemainderY += event.deltaY * step
        const deltaX = wholeDelta(this.wheelRemainderX)
        const deltaY = wholeDelta(this.wheelRemainderY)
        this.wheelRemainderX -= deltaX
        this.wheelRemainderY -= deltaY
        if (deltaX === 0 && deltaY === 0) return
        await session.send('Input.dispatchMouseEvent', {
          type: 'mouseWheel',
          x: event.x,
          y: event.y,
          deltaX,
          deltaY,
          modifiers: event.modifiers,
        })
        return
      }
      case 'key-down': {
        if (!this.heldKeys.has(event.code) && event.code !== '') this.heldKeys.set(event.code, event.key)
        await session.send('Input.dispatchKeyEvent', {
          type: 'keyDown',
          key: event.key,
          code: event.code,
          text: event.text === '' ? undefined : event.text,
          modifiers: event.modifiers,
        })
        return
      }
      case 'key-up':
        this.heldKeys.delete(event.code)
        await session.send('Input.dispatchKeyEvent', {
          type: 'keyUp',
          key: event.key,
          code: event.code,
          modifiers: event.modifiers,
        })
        return
    }
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
