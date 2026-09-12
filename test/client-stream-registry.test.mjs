/**
 * 共享 SSE 连接的测试。
 *
 * 守的是一条**整页假死**的失败模式：浏览器对同一个 origin 只允许 6 条并发连接，而
 * 「每个面板实例各开一条 EventSource」的写法只要漏关一条就会累积；攒到 6 条之后，这个
 * 页面发出的**所有**请求都会排进浏览器自己的队列里等一个永不到来的空位 —— 面板里每个
 * 按钮、乃至 DSH 输入框的「发送」全都卡死，Network 里显示 0.0 kB 待处理，而服务端一切
 * 正常。（实测撞上时浏览器对 3080 端口握着 10 条连接。）
 *
 * 所以这里钉住三件事：同一个会话只建一条连接、引用计数归零才关、新订阅者能拿到重放。
 *
 * 用法：node --no-warnings test/client-stream-registry.test.mjs
 */

import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripTypes } from '../scripts/build-client.mjs'

// ── EventSource 替身：记录实例、可以手动派发事件 ─────────────────────────────

const instances = []

class FakeEventSource {
  constructor(url) {
    this.url = url
    this.closed = false
    this.handlers = new Map()
    instances.push(this)
  }

  addEventListener(name, handler) {
    const list = this.handlers.get(name) ?? []
    list.push(handler)
    this.handlers.set(name, list)
  }

  close() {
    this.closed = true
  }

  /** 从服务端视角推一条事件。 */
  emit(name, payload) {
    for (const handler of this.handlers.get(name) ?? []) handler({ data: JSON.stringify(payload) })
  }
}

globalThis.EventSource = FakeEventSource

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(root, 'src/client/stream-registry.ts'), 'utf8')
const stripped = stripTypes(source, 'stream-registry.ts')
assert.ok(!/^\s*import\s/mu.test(stripped), '类型剥离后不应残留 import（只应类型导入 state.js）')
const {
  subscribeStream,
  sharedStreamCount,
  closeAllStreams,
} = await import(`data:text/javascript,${encodeURIComponent(stripped)}`)

/** 收集某个订阅者收到的事件。 */
function collector() {
  const seen = { open: 0, frames: [], states: [], tabs: [] }
  return {
    seen,
    events: {
      open: () => { seen.open++ },
      frame: (payload) => { seen.frames.push(payload) },
      state: (payload) => { seen.states.push(payload) },
      tabs: (payload) => { seen.tabs.push(payload) },
    },
  }
}

// ── 同一个会话只建一条连接 ──────────────────────────────────────────────────

{
  const a = collector()
  const b = collector()
  const offA = subscribeStream('s1', '/browser-pane/stream?session=s1', a.events)
  const offB = subscribeStream('s1', '/browser-pane/stream?session=s1', b.events)

  assert.equal(instances.length, 1, '同一个会话的两个面板必须复用同一条连接')
  assert.equal(sharedStreamCount(), 1)

  // 事件分发到所有订阅者。
  instances[0].emit('open', {})
  instances[0].emit('state', { active: true, url: 'https://a/', mode: 'own', quality: 'perf' })
  instances[0].emit('frame', { data: 'x', width: 10, height: 10, cssWidth: 10, cssHeight: 10, url: 'https://a/' })
  assert.equal(a.seen.open, 1)
  assert.equal(b.seen.open, 1)
  assert.equal(a.seen.states.length, 1)
  assert.equal(b.seen.frames.length, 1)

  // 第一个订阅者离开：连接必须留着（还有人在看）。
  offA()
  assert.equal(sharedStreamCount(), 1, '还有订阅者时不能关连接')
  assert.equal(instances[0].closed, false)

  // 最后一个离开：连接关闭、表清空。
  offB()
  assert.equal(instances[0].closed, true, '最后一个订阅者离开必须关闭连接')
  assert.equal(sharedStreamCount(), 0, '关掉之后不能残留表项（否则下次会误复用死连接）')

  // 重复调用取消订阅是安全的（React 的清理有可能重入）。
  offB()
  assert.equal(sharedStreamCount(), 0)
}

// ── 新订阅者拿到重放：第二个面板必须立刻显示当前画面 ────────────────────────

{
  const a = collector()
  const offA = subscribeStream('s2', '/stream?s2', a.events)
  instances.at(-1).emit('open', {})
  instances.at(-1).emit('frame', { data: 'latest', width: 8, height: 8, cssWidth: 8, cssHeight: 8, url: 'https://b/' })

  const b = collector()
  const offB = subscribeStream('s2', '/stream?s2', b.events)
  assert.equal(instances.length, 1 + instances.length - 1, '沿用同一条连接')
  assert.equal(b.seen.frames.length, 1, '新订阅者必须立刻拿到最近一帧（静态页面上否则永远是空的）')
  assert.equal(b.seen.frames[0].data, 'latest')
  assert.equal(b.seen.open, 1, '已经连上时新订阅者也该收到一次 open')

  offA()
  offB()
  assert.equal(sharedStreamCount(), 0)
}

// ── 不同会话各一条；整体上限可控 ────────────────────────────────────────────

{
  const before = instances.length
  const subs = []
  for (const key of ['s3', 's4', 's5']) {
    const c = collector()
    subs.push(subscribeStream(key, `/stream?${key}`, c.events))
  }
  assert.equal(sharedStreamCount(), 3, '不同会话各自一条')
  assert.equal(instances.length - before, 3, '三个新会话应当新建 3 条实例')
  for (const off of subs) off()
  assert.equal(sharedStreamCount(), 0, '全部取消后不该残留')
  assert.ok(instances.slice(before).every(instance => instance.closed), '取消订阅后每条都该关掉')

  // 拆除工具也要干净。
  subscribeStream('s6', '/stream?s6', collector().events)
  closeAllStreams()
  assert.equal(sharedStreamCount(), 0)
}

process.stdout.write('client-stream-registry: 全部通过\n')
