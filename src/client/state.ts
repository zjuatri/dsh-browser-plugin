/**
 * 浏览器标签页的状态层：订阅宿主的 SSE 画面流，并封装各条 POST 路由。
 *
 * 视图只是这份状态的一个渲染结果；“共享页面在做什么”完全由画面流事件驱动，因此
 * 组件里不需要轮询。
 *
 * @module dsh-browser-plugin/src/client/state
 */

import { useEffect, useState } from 'react'
import { subscribeStream } from './stream-registry.js'

/** 一帧画面（对应宿主 pane-wire 的载荷）。 */
export interface PaneFrame {
  data: string
  /** 帧的像素宽度（**设备**像素 = CSS 视口宽 × 抓帧倍率）。 */
  width: number
  /** 帧的像素高度（设备像素）。 */
  height: number
  /**
   * 这一帧对应的页面 **CSS** 视口尺寸；指针坐标要按它换算（见 `input.ts`）。
   *
   * 高清档下 `width` 是它的两倍。旧宿主（客户端刷新了、宿主还没重启）不发这个字段，
   * 那时两者必然相等，换算处会退回 `width`/`height`。
   */
  cssWidth: number
  cssHeight: number
  url: string
}

/** 浏览器存活状态（对应宿主 pane-wire 的载荷）。 */
export interface PaneState {
  active: boolean
  url: string
  error?: string
  mode: BrowserMode
  /** 最近取得锁的会话 id；与当前会话不同时说明另一个对话正在驱动浏览器。 */
  driver?: string
  /** 当前画质档（全局）：所有已开的窗一起跟着变。旧宿主不发时为 undefined。 */
  quality?: BrowserQuality
}

/** 一行标签页（对应宿主 TabInfo 载荷）。 */
export interface PaneTab {
  index: number
  url: string
  title: string
  active: boolean
}

/**
 * 智能体所使用的浏览器种类。
 *
 * 只有两值，与运行时 `BrowserMode` 一致：`own` 是无头 puppeteer 启动，`stealth` 是
 * 插件自己拉起的持久 profile Chrome（走 CDP 挂载）。**不存在**「连我自己开的 Chrome」
 * 这一档 —— 它曾被移除，因为 stealth 已经覆盖了同一种需求（持久 profile、真实指纹），
 * 而多一个只声明不实现的选项，会让视图上出现一个按下去会换掉浏览器的按钮。
 */
export type BrowserMode = 'own' | 'stealth'

/**
 * 实时视图的画质档（与宿主 `BrowserQuality` 一致）。
 *
 * - `perf` —— 每个 CSS 像素抓一个点：帧最小、最省，但在缩放过的屏幕上那块画面是放大
 *   出来的，比周围的原生文字糊。
 * - `hd` —— 每个物理像素抓一个点（2 倍抓帧）：与周围界面一样锐，代价是每帧 4 倍像素。
 */
export type BrowserQuality = 'perf' | 'hd'

/** 视图发往宿主的输入消息。 */
export type PaneInputMessage =
  | { type: 'mouse-move' | 'mouse-down' | 'mouse-up'; x: number; y: number; button: 'left' | 'right' | 'middle' | 'none'; modifiers: number }
  | { type: 'wheel'; x: number; y: number; deltaX: number; deltaY: number; deltaMode: number; modifiers: number }
  | { type: 'key-down'; key: string; code: string; text?: string; modifiers: number }
  | { type: 'key-up'; key: string; code: string; modifiers: number }

/** 各条 POST 路由接受的 body。 */
export type PanePostBody =
  | PaneInputMessage
  | { url?: string }
  | { index: number }
  | { action: 'back' | 'forward' | 'reload' }
  | { mode: BrowserMode }
  | { quality: BrowserQuality }

/**
 * 把会话 id 拼进路由地址。
 *
 * 浏览器按会话隔离（宿主侧见 `browser-sessions.ts`），因此视图必须自报家门：不带会话
 * 参数就落到「无名会话」那只浏览器上，看到的不是本对话的画面。会话 id 由右侧边栏的槽位
 * 框架注入到正文组件的 props 里（与工具侧的 `exec.agent.id` 是同一个值）。
 *
 * @param path - 路由路径（`/stream`、`/input` 等）。
 * @param sessionId - 本视图所属的会话；缺失时退化为无名会话。
 * @returns 带 `?session=` 的完整路径。
 */
export function paneRoute(path: string, sessionId?: string): string {
  if (sessionId === undefined || sessionId === '') return `/browser-pane${path}`
  return `/browser-pane${path}?session=${encodeURIComponent(sessionId)}`
}

/** 往宿主路由发一条 POST，失败时静默（画面流会体现真实状态）。 */
export function post(path: string, body: PanePostBody, sessionId?: string): void {
  void fetch(paneRoute(path, sessionId), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {})
}

/** 画面流与标签页状态的实时快照。 */
export interface PaneSnapshot {
  frame: PaneFrame | null
  state: PaneState
  tabs: PaneTab[]
  /**
   * 这是第几次连上画面流（每次「连上」递增，含 `EventSource` 的自动重连）。
   *
   * 视图靠它判断「我刚接上宿主」：有些偏好（画质档）存在浏览器本机，每次重新接上都
   * 该再报一次 —— 宿主重启后档次会回到配置默认值，而重连是它唯一能察觉的时机。
   */
  connection: number
}

/**
 * 订阅本会话的 SSE 画面流。`EventSource` 自己会重连，因此这里不需要重试逻辑。
 *
 * 连接是**按会话共享**的（见 `stream-registry.ts`）：同一个会话开几个面板、或者组件被
 * 重新挂载，都只占一条浏览器连接。这不只是省资源 —— 浏览器对同一 origin 只有 6 条并发
 * 连接，每个实例各开一条的写法一旦漏关，攒到 6 条就会让**整个页面**的所有请求都排不上队
 * （面板按钮、连聊天发送一起假死）。
 *
 * @param sessionId - 本视图所属的会话；变化时改订另一条连接（换会话就该换一只浏览器）。
 * @returns 当前的画面/状态/标签页快照。
 */
export function usePaneStream(sessionId?: string): PaneSnapshot {
  const [frame, setFrame] = useState<PaneFrame | null>(null)
  const [state, setState] = useState<PaneState>({ active: false, url: '', mode: 'own' })
  const [tabs, setTabs] = useState<PaneTab[]>([])
  const [connection, setConnection] = useState(0)

  useEffect(() => subscribeStream(sessionId ?? '', paneRoute('/stream', sessionId), {
    // 每次建立（或重建）连接都算一次：宿主重启后这里会再响一次。
    open: () => { setConnection(previous => previous + 1) },
    // 安全性：这条通道只由本插件自己的宿主侧（同一个包）提供，写入的就是它自己产生的
    // PaneFrame / PaneState / TabInfo JSON —— 第三方无法往这些事件名上塞别的载荷。
    frame: (payload) => {
      setFrame(payload)
      setState(previous => ({ ...previous, active: true, url: payload.url, error: undefined }))
    },
    state: (payload) => { setState(payload) },
    tabs: (payload) => { setTabs(payload) },
  }), [sessionId])

  return { frame, state, tabs, connection }
}
