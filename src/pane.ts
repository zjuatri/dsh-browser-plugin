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
import type { BrowserQuality } from './browser-types.js'
import type { ResolvedConfig } from './config.js'
import type { BrowserSessions, SessionBrowser } from './browser-sessions.js'
import { QueueAbortError } from './browser-queue.js'
import { PaneStream } from './pane-stream.js'
import {
  PaneGotoSchema,
  PaneInputSchema,
  PaneModeSchema,
  PaneQualitySchema,
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

  /**
   * 当前画质档。
   *
   * **不是**每会话状态：档位表达的是「看的人」想要流畅还是清晰，跟哪只浏览器无关。
   * 所以某一扇窗按了开关，所有已开的窗一起跟着变（`sessions.streams()` 挨个推），
   * 而新开的会话在建流时直接拿当前值（见 `browserOf`）。跨进程重启的持久化不在这里
   * —— 那份记忆在浏览器本地的 `localStorage` 里（见客户端 `quality.ts`），视图接入
   * 时会把记住的档位重新发过来。
   */
  let quality: BrowserQuality = config.paneQuality

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
    entry.stream ??= new PaneStream(entry.runtime, entry.queue, quality)
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

  // 视图切换画质档。和 `/viewport` 一样**不**在 HTTP 边界排队：它本身不驱动浏览器，
  // 真正的变更（`setViewport` + 重启画面流）由每个会话自己的流控制器走各自的队列。
  // 档位是全局的，所以这里要挨个通知每一扇已经打开的窗。
  const disposeQuality = webServer.register({
    kind: 'exact',
    path: `${PANE_BASE}/quality`,
    handler: async (req, res) => {
      await handleJsonRoute(res, async () => {
        const raw = await readBody(req)
        const request = PaneQualitySchema(JSON.parse(raw))
        quality = request.quality
        for (const stream of sessions.streams()) stream.setQuality(quality)
        return { ok: true }
      })
    },
  })

  const disposeBack = action('/back', async (entry) => ({ ok: true, result: await entry.runtime.back() }))
  const disposeForward = action('/forward', async (entry) => ({ ok: true, result: await entry.runtime.forward() }))
  const disposeReload = action('/reload', async (entry) => ({ ok: true, result: await entry.runtime.reload() }))

  // 该页面的开发者工具：视图上的右键菜单直接以**链接**指向这里，因此这条路由要让浏览器
  // 自己跟下去 —— 成功就 302 到 Chrome 给出的 DevTools 前端地址，失败则回一小段 HTML 说明
  // 原因（回 JSON 会在新标签页里显示一坨原始文本，很难看）。
  //
  // 也**不**经过串行队列：它不改变页面，只是为了取一个地址；排在智能体那 30 秒的锁后面
  // 会让用户以为菜单坏了。同理不懒启动浏览器 —— 没页面就直接说清楚。
  const disposeDevtools = webServer.register({
    kind: 'exact',
    path: `${PANE_BASE}/devtools`,
    handler: async (req, res) => {
      try {
        const url = await browserOf(req).runtime.devtoolsFrontendUrl()
        if (res.writableEnded) return
        res.writeHead(302, { location: url, 'cache-control': 'no-store' })
        res.end()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (res.writableEnded) return
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
        res.end(errorPage(message))
      }
    },
  })

  return () => {
    disposeStream()
    disposeInput()
    disposeGoto()
    disposeTabOpen()
    disposeTabSwitch()
    disposeTabClose()
    disposeMode()
    disposeViewport()
    disposeQuality()
    disposeDevtools()
    disposeBack()
    disposeForward()
    disposeReload()
  }
}

/** 开不了开发者工具时给用户看的一小段页面。 */
function errorPage(message: string): string {
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
    + '<title>打开开发者工具失败</title></head>'
    + '<body style="font:14px/1.6 system-ui;padding:24px;max-width:40em">'
    + '<h1 style="font-size:16px;margin:0 0 8px">打不开该页面的开发者工具</h1>'
    + `<p style="margin:0;color:#61666b">${escapeHtml(message)}</p>`
    + '<p style="margin:16px 0 0"><a href="javascript:window.close()">关闭这个标签页</a></p>'
    + '</body></html>'
}

/** 把消息塞进 HTML 前先转义，免得页面内容把标记搞乱。 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, char => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>
  )[char] ?? char)
}
