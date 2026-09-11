/**
 * 实时视图的宿主侧路由：在共享 Web 服务器上注册视图要用的全部端点。
 *
 * 路由只注册**一次**，每个请求按 `?session=<sessionId>` 分发到该会话自己的浏览器与它
 * 自己的实时视图（浏览器按会话隔离，见 `browser-sessions.ts`）。视图接入时把自己的会话
 * id 带在查询串上 —— 它来自槽位框架注入的 `sessionId`，与工具侧的 `exec.agent.id` 是
 * 同一个值。
 *
 * - `GET  /browser-pane/stream?session=…` —— SSE 画面流。帧来自 Chrome DevTools 协议的
 *   `Page.startScreencast`（只在画面变化时推 JPEG），因此视图是在“看”智能体所看
 *   的东西，而不是靠轮询截图。首个 `state` 事件告诉视图浏览器是否存活。
 * - `POST /browser-pane/input?session=…` —— 往页面注入合成输入（CDP `Input.dispatchMouseEvent`
 *   / `Input.dispatchKeyEvent`），正是它让视图成为双向遥控器，而不只是一路视频。
 * - `POST /browser-pane/goto?session=…` —— 从视图里导航该会话的页面。
 * - 标签页、模式与历史路由 —— 视图上的标签条、浏览器切换与前进/后退/刷新。
 *
 * 只有在存在 `webServer` 服务（Web 界面）时才会挂载。
 *
 * @module dsh-browser-plugin/src/pane
 */

import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage } from 'node:http'
import type { ResolvedConfig } from './config.js'
import type { BrowserSessions, SessionBrowser } from './browser-sessions.js'
import { QueueAbortError } from './browser-queue.js'
import { PaneStream } from './pane-stream.js'
import {
  PaneGotoSchema,
  PaneInputSchema,
  PaneModeSchema,
  PaneTabIndexSchema,
  PaneTabOpenSchema,
  PaneViewportSchema,
  handleJsonRoute,
  readBody,
  type PaneResponse,
} from './pane-wire.js'

// 仅类型：激活 cordis 对 `ctx.webServer` 的 Context 合并。
import type {} from '@deepseek-ai/dsh-host-webserver'

/** 实时视图路由基址。 */
export const PANE_BASE = '/browser-pane'

/** 视图带自己会话 id 的查询参数名。 */
export const SESSION_PARAM = 'session'

/**
 * 在共享 Web 服务器上注册视图路由。返回拆除函数；在没有 Web 服务器
 * （无头/TUI 组合）时返回 undefined。
 *
 * 会**驱动浏览器**的路由都从该会话的队列过（和它的工具调用同一个队列）。视图是同一条
 * 通路的第二个入口：不排队的话，人在侧边栏点一下就能插进智能体正在跑的调用中间。人类
 * 点击不该被无限阻塞，因此这里带一个等待上限。
 */
export function registerBrowserPane(
  ctx: Context,
  sessions: BrowserSessions,
  config: ResolvedConfig,
): (() => void) | undefined {
  const webServer = ctx.get('webServer')
  if (!webServer) return undefined

  /** 这个请求属于哪个会话；没带就是无名会话（无视图的组合）。 */
  const sessionOf = (req: IncomingMessage): string | null => {
    const raw = new URL(req.url ?? '/', 'http://127.0.0.1').searchParams.get(SESSION_PARAM)
    return raw === null || raw === '' ? null : raw
  }

  /**
   * 取该请求对应的会话浏览器，并确保它的视图控制器已经备好。
   *
   * 视图控制器在这里懒建（而不是由工具侧建）：它代表「有一扇窗在看这只浏览器」，而只
   * 有视图路由才知道 Web 服务器确实存在。
   */
  const browserOf = (req: IncomingMessage): SessionBrowser => {
    const entry = sessions.forSession(sessionOf(req))
    entry.stream ??= new PaneStream(entry.runtime, entry.queue)
    return entry
  }

  /**
   * 把一次会驱动浏览器的操作放进该会话的串行队列，带等待上限。
   *
   * 超时用自建的 `AbortController` 取消排队，因此不会在队列里留下幽灵条目 —— 超时
   * 之后它永远不会再突然开始驱动浏览器。
   */
  const enqueue = async (
    entry: SessionBrowser,
    label: string,
    run: () => Promise<PaneResponse>,
  ): Promise<PaneResponse> => {
    const controller = new AbortController()
    const timer = setTimeout(() => { controller.abort() }, config.queueTimeoutMs)
    try {
      return await entry.queue.run(`${PANE_BASE}${label}`, controller.signal, run)
    } catch (error) {
      if (error instanceof QueueAbortError) {
        return {
          ok: false,
          message: `智能体正在使用本对话的浏览器，请稍后重试（已等待 ${String(Math.round(config.queueTimeoutMs / 1000))} 秒）。`,
        }
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  /** 注册一条会驱动浏览器的 POST 路由：读 body、按 schema 解析、排队执行。 */
  const post = <T>(
    path: string,
    parse: (raw: unknown) => T,
    run: (entry: SessionBrowser, value: T) => Promise<PaneResponse>,
  ): (() => void) => webServer.register({
    kind: 'exact',
    path: `${PANE_BASE}${path}`,
    handler: async (req, res) => {
      await handleJsonRoute(res, async () => {
        const raw = await readBody(req)
        const value = parse(JSON.parse(raw))
        const entry = browserOf(req)
        return enqueue(entry, path, () => run(entry, value))
      })
    },
  })

  /** 注册一条无 body、会驱动浏览器的 POST 路由。 */
  const action = (
    path: string,
    run: (entry: SessionBrowser) => Promise<PaneResponse>,
  ): (() => void) => webServer.register({
    kind: 'exact',
    path: `${PANE_BASE}${path}`,
    handler: async (req, res) => {
      await handleJsonRoute(res, async () => {
        const entry = browserOf(req)
        return enqueue(entry, path, () => run(entry))
      })
    },
  })

  const disposeStream = webServer.register({
    kind: 'exact',
    path: `${PANE_BASE}/stream`,
    handler: (req, res) => {
      const entry = browserOf(req)
      const stream = entry.stream
      if (stream === undefined) return
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      })
      res.write('retry: 2000\n\n')
      stream.addClient(res)
      // 重放当前状态、标签页集合与最后一帧，让迟到或刚刷新的视图立刻是最新的。
      stream.send(res, 'state', stream.state())
      stream.send(res, 'tabs', stream.tabs())
      const frame = stream.frame()
      if (frame !== null) stream.send(res, 'frame', frame)
      void stream.startScreencast()
      void entry.runtime.tabs().then(tabs => stream.send(res, 'tabs', tabs)).catch(() => {})
      req.on('close', () => {
        stream.removeClient(res)
      })
    },
  })

  const disposeInput = post('/input', (raw) => PaneInputSchema(raw), async (entry, event) => {
    await entry.stream?.dispatchInput(event)
    return { ok: true }
  })

  const disposeGoto = post('/goto', (raw) => PaneGotoSchema(raw), async (entry, request) => {
    return { ok: true, result: await entry.runtime.goto(request.url) }
  })

  const disposeTabOpen = post('/tab-open', (raw) => PaneTabOpenSchema(raw), async (entry, request) => {
    return { ok: true, result: await entry.runtime.openTab(request.url) }
  })

  const disposeTabSwitch = post('/tab-switch', (raw) => PaneTabIndexSchema(raw), async (entry, request) => {
    return { ok: true, result: await entry.runtime.switchTab(request.index) }
  })

  const disposeTabClose = post('/tab-close', (raw) => PaneTabIndexSchema(raw), async (entry, request) => {
    return { ok: true, result: await entry.runtime.closeTab(request.index) }
  })

  const disposeMode = post('/mode', (raw) => PaneModeSchema(raw), async (entry, request) => {
    const tabs = await entry.runtime.switchMode(request.mode)
    entry.stream?.clearFrame()
    entry.stream?.setState({
      active: true,
      url: tabs.find(row => row.active)?.url ?? '',
      mode: entry.runtime.currentMode(),
    })
    entry.stream?.setTabs(tabs)
    void entry.stream?.startScreencast()
    return { ok: true, result: tabs }
  })

  // 视图报告面板可用尺寸：该会话页面的视口随后跟着面板的形状走，于是画面铺满侧边栏，
  // 而不是留一大块空白。
  //
  // 这条路由**不**在 HTTP 边界排队：它只是登记一个目标尺寸，真正的变更发生在流控制器
  // 防抖 200ms 之后（拖动侧边栏时每帧都上报，逐个排队毫无意义）。排队在变更点做 ——
  // 见 `PaneStream` 里的 `applyViewport`。因此这里可以让请求立刻返回。
  const disposeViewport = webServer.register({
    kind: 'exact',
    path: `${PANE_BASE}/viewport`,
    handler: async (req, res) => {
      await handleJsonRoute(res, async () => {
        const raw = await readBody(req)
        const request = PaneViewportSchema(JSON.parse(raw))
        browserOf(req).stream?.requestViewport(request.width, request.height)
        return { ok: true }
      })
    },
  })

  const disposeBack = action('/back', async (entry) => ({ ok: true, result: await entry.runtime.back() }))
  const disposeForward = action('/forward', async (entry) => ({ ok: true, result: await entry.runtime.forward() }))
  const disposeReload = action('/reload', async (entry) => ({ ok: true, result: await entry.runtime.reload() }))

  return () => {
    disposeStream()
    disposeInput()
    disposeGoto()
    disposeTabOpen()
    disposeTabSwitch()
    disposeTabClose()
    disposeMode()
    disposeViewport()
    disposeBack()
    disposeForward()
    disposeReload()
  }
}
