/**
 * 每个会话**共享一条** SSE 连接（带引用计数）。
 *
 * 为什么必须共享：浏览器对同一个 origin 只允许 **6 条并发连接**（HTTP/1.1 上限）。此前是
 * 「每个面板实例各开一条 EventSource」，只要挂载/卸载有任何一次不成对就会漏一条；漏到第
 * 6 条之后，这个页面**所有**新请求都会排进浏览器自己的队列里等一个永不到来的空位 ——
 * 现象是面板里每个按钮、乃至 DSH 输入框的"发送"全都**卡死**（Network 里显示 0.0 kB 待处理），
 * 而服务端其实一切正常、连日志都没有。实测撞上时浏览器对 3080 端口握着 10 条连接。
 *
 * 共享之后，泄漏最多也只泄漏**一条**（一个会话一条），而正常的挂载/卸载靠引用计数归零时
 * 关闭连接，不会残留。新加入的订阅者还会收到最近一帧/状态/标签页的重放，因此第二个面板
 * 打开时立刻就能看到当前画面（否则静态页面上要等下一次变化才有画面）。
 *
 * 只依赖全局 `EventSource`，不依赖 React —— 这样它可以脱离渲染器单独测试
 * （见 `test/client-stream-registry.test.mjs`）。
 *
 * @module dsh-browser-plugin/src/client/stream-registry
 */

import type { PaneFrame, PaneState, PaneTab } from './state.js'

/** 一个订阅者要收的事件；每个回调都可省略。 */
export interface StreamEvents {
  /** 连接建立（或重建）时回调一次。 */
  open?: () => void
  frame?: (payload: PaneFrame) => void
  state?: (payload: PaneState) => void
  tabs?: (payload: PaneTab[]) => void
}

/** 一条共享连接。 */
interface Shared {
  source: EventSource
  listeners: Set<StreamEvents>
  refs: number
  /** 是否已经连上过（新订阅者据此补一次 open）。 */
  connected: boolean
  /** 最近一次载荷，用于给新订阅者重放。 */
  last: { frame?: PaneFrame; state?: PaneState; tabs?: PaneTab[] }
}

/** 按 key（会话）共享的连接。 */
const shared = new Map<string, Shared>()

/** 解析一条 SSE 事件的 JSON 载荷。 */
function payloadOf(event: Event): unknown {
  return JSON.parse((event as MessageEvent<string>).data)
}

/** 建一条连接并把事件分发/缓存下来。 */
function open(key: string, url: string): Shared {
  const entry: Shared = {
    // eslint-disable-next-line no-undef -- 浏览器全局；测试里会替换成替身
    source: new EventSource(url),
    listeners: new Set(),
    refs: 0,
    connected: false,
    last: {},
  }
  // 先放进表里再挂监听：监听回调里要用到同一个 entry。
  shared.set(key, entry)
  entry.source.addEventListener('open', () => {
    entry.connected = true
    for (const listener of [...entry.listeners]) listener.open?.()
  })
  entry.source.addEventListener('frame', (event) => {
    entry.last.frame = payloadOf(event) as PaneFrame
    for (const listener of [...entry.listeners]) listener.frame?.(entry.last.frame)
  })
  entry.source.addEventListener('state', (event) => {
    entry.last.state = payloadOf(event) as PaneState
    for (const listener of [...entry.listeners]) listener.state?.(entry.last.state)
  })
  entry.source.addEventListener('tabs', (event) => {
    entry.last.tabs = payloadOf(event) as PaneTab[]
    for (const listener of [...entry.listeners]) listener.tabs?.(entry.last.tabs)
  })
  return entry
}

/**
 * 订阅某个会话的画面流；同一个 key 复用同一条连接。
 *
 * @param key - 会话标识（无名会话用空串）。
 * @param url - 该会话的画面流地址。
 * @param events - 事件回调；返回值是取消订阅函数。
 * @returns 取消订阅；最后一个订阅者离开时关闭连接。
 */
export function subscribeStream(key: string, url: string, events: StreamEvents): () => void {
  const entry = shared.get(key) ?? open(key, url)
  entry.refs++
  entry.listeners.add(events)
  // 重放：连接已经连上、并且手上有缓存载荷时，让新订阅者立刻进入当前状态。
  if (entry.connected) events.open?.()
  if (entry.last.frame !== undefined) events.frame?.(entry.last.frame)
  if (entry.last.state !== undefined) events.state?.(entry.last.state)
  if (entry.last.tabs !== undefined) events.tabs?.(entry.last.tabs)

  let done = false
  return () => {
    if (done) return
    done = true
    // 重新取一次：期间可能已经被别人关掉并重建过。
    const current = shared.get(key)
    if (current !== entry) return
    entry.listeners.delete(events)
    entry.refs--
    if (entry.refs > 0) return
    shared.delete(key)
    try {
      entry.source.close()
    } catch { /* 已经关了 */ }
  }
}

/** 当前共享连接数（诊断与测试用）。 */
export function sharedStreamCount(): number {
  return shared.size
}

/** 关掉所有共享连接（测试与拆除用）。 */
export function closeAllStreams(): void {
  for (const [key, entry] of [...shared]) {
    shared.delete(key)
    try {
      entry.source.close()
    } catch { /* 已经关了 */ }
    entry.listeners.clear()
    entry.refs = 0
  }
  shared.clear()
}
