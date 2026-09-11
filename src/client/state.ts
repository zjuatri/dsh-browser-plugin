/**
 * 浏览器标签页的状态层：订阅宿主的 SSE 画面流，并封装各条 POST 路由。
 *
 * 视图只是这份状态的一个渲染结果；“共享页面在做什么”完全由画面流事件驱动，因此
 * 组件里不需要轮询。
 *
 * @module dsh-browser-plugin/src/client/state
 */

import { useEffect, useState } from 'react'

/** 一帧画面（对应宿主 pane-wire 的载荷）。 */
export interface PaneFrame {
  data: string
  width: number
  height: number
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
}

/**
 * 订阅本会话的 SSE 画面流。`EventSource` 自己会重连，因此这里不需要重试逻辑。
 *
 * @param sessionId - 本视图所属的会话；变化时重新订阅（换会话就该换一只浏览器）。
 * @returns 当前的画面/状态/标签页快照。
 */
export function usePaneStream(sessionId?: string): PaneSnapshot {
  const [frame, setFrame] = useState<PaneFrame | null>(null)
  const [state, setState] = useState<PaneState>({ active: false, url: '', mode: 'own' })
  const [tabs, setTabs] = useState<PaneTab[]>([])

  useEffect(() => {
    const source = new EventSource(paneRoute('/stream', sessionId))
    source.addEventListener('frame', (event) => {
      // 安全性：这条通道只由本插件自己的宿主侧（同一个包）提供，写入的就是它自己
      // 产生的 PaneFrame JSON —— 第三方无法往这个事件名上塞别的载荷。
      const payload = JSON.parse((event as MessageEvent<string>).data) as PaneFrame
      setFrame(payload)
      setState(previous => ({ ...previous, active: true, url: payload.url, error: undefined }))
    })
    source.addEventListener('state', (event) => {
      // 安全性：与上面的 frame 监听同属本包独占的通道；宿主侧只会发出它自己产生的
      // PaneState JSON。
      setState(JSON.parse((event as MessageEvent<string>).data) as PaneState)
    })
    source.addEventListener('tabs', (event) => {
      // 安全性：同属本包独占通道；宿主侧只发出它为这个视图生成的 TabInfo 行。
      setTabs(JSON.parse((event as MessageEvent<string>).data) as PaneTab[])
    })
    return () => { source.close() }
  }, [sessionId])

  return { frame, state, tabs }
}
