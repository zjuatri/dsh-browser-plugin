/**
 * 视图状态广播的测试。
 *
 * 「谁在驱动浏览器」是跨会话争用**可见**的唯一手段：不给这个信号，用户看到的现象只是
 * 「我点了没反应」，而这正是这次要修的问题之一。这里用假的运行时与假的 SSE 客户端断言
 * 它确实被广播出去，而不是依赖在真实 GUI 上碰运气点中标签页。
 *
 * 另一半是地址跟随：状态行上的地址来自 `state`，必须在导航发生时就跟上，不能等下一帧
 * （帧只在画面变化时才来）。
 *
 * 用法：node --no-warnings test/pane-stream.test.mjs
 */

import { strict as assert } from 'node:assert'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// 跑在构建产物上，而不是源码上：源码里用的是 `./x.js` 说明符，Node 直接 import 时
// 解析不到同名的 `.ts`；产物才是真正上线的东西，也才有测试价值。
const bundle = await import(`${pathToFileURL(join(root, 'lib/index.js')).href}?t=${String(Date.now())}`)
const { BrowserQueue, PaneStream } = bundle

/** 造一个只满足 PaneStream 需要的运行时替身。 */
function fakeRuntime() {
  return {
    onTabsChanged: () => () => {},
    sharedPage: async () => { throw new Error('not needed') },
    currentMode: () => 'own',
    tabs: async () => [],
    viewportSize: () => null,
    setViewport: async () => ({ width: 0, height: 0 }),
  }
}

/** 造一个记录写入的 SSE 响应替身。 */
function fakeClient() {
  const frames = []
  return {
    frames,
    writableEnded: false,
    write: (chunk) => { frames.push(chunk); return true },
    end: () => {},
  }
}

/**
 * 造一个页面替身：地址可以改，导航事件可以手动派发，帧可以手动灌进来。
 *
 * 画面流只在**画面变化**时推帧，而地址变化不一定改画面 —— 这正是「智能体已经跳到
 * 别的网站，侧边栏地址栏还停在上一页」的成因。要断言地址跟随，就必须能分别制造
 * 「地址变了」与「画面变了」两件事，所以这里把两者都做成显式动作。
 */
function fakePage(initialUrl) {
  let url = initialUrl
  const pageHandlers = new Map()
  const sessionHandlers = new Map()
  const sent = []
  return {
    url: () => url,
    setUrl: (next) => { url = next },
    on: (name, handler) => { pageHandlers.set(name, handler) },
    off: (name, handler) => { if (pageHandlers.get(name) === handler) pageHandlers.delete(name) },
    emit: (name) => { pageHandlers.get(name)?.() },
    listenerCount: () => pageHandlers.size,
    createCDPSession: async () => ({
      on: (name, handler) => { sessionHandlers.set(name, handler) },
      send: async (method, params) => { sent.push({ method, params }) },
      detach: async () => {},
    }),
    /** 让画面流以为页面重绘了一帧。 */
    emitFrame: (data) => {
      sessionHandlers.get('Page.screencastFrame')?.({
        data,
        sessionId: sent.length,
        metadata: { deviceWidth: 800, deviceHeight: 600 },
      })
    },
    sent,
  }
}

/** 在上面的替身之上造一个运行时：共享页面就是它。 */
function streamingRuntime(page) {
  return { ...fakeRuntime(), sharedPage: async () => page }
}

/** 取出某个事件名最后一次广播的载荷。 */
function lastEvent(client, event) {
  const prefix = `event: ${event}\ndata: `
  for (let index = client.frames.length - 1; index >= 0; index--) {
    const frame = client.frames[index]
    if (frame.startsWith(prefix)) return JSON.parse(frame.slice(prefix.length))
  }
  return undefined
}

// ── noteDriver 必须广播出去 ─────────────────────────────────────────────────

{
  const stream = new PaneStream(fakeRuntime(), new BrowserQueue())
  const client = fakeClient()
  stream.addClient(client)

  stream.noteDriver('session-a')
  const state = lastEvent(client, 'state')
  assert.ok(state !== undefined, 'noteDriver 必须广播 state 事件')
  assert.equal(state.driver, 'session-a', 'state 里必须带驱动者 id')

  // 同一个驱动者重复上报不应制造无谓的广播。
  const before = client.frames.length
  stream.noteDriver('session-a')
  assert.equal(client.frames.length, before, '驱动者没变时不应重复广播')

  // 换人必须再次广播。
  stream.noteDriver('session-b')
  assert.equal(lastEvent(client, 'state').driver, 'session-b')

  // 释放回 null 时字段应当是 undefined，而不是字符串 "null"。
  stream.noteDriver(null)
  assert.equal(lastEvent(client, 'state').driver, undefined)

  stream.dispose()
}

// ── 新客户端连上时能拿到最近的驱动者 ────────────────────────────────────────

{
  const stream = new PaneStream(fakeRuntime(), new BrowserQueue())
  stream.noteDriver('session-a')
  const late = fakeClient()
  stream.addClient(late)
  stream.send(late, 'state', stream.state())
  assert.equal(lastEvent(late, 'state').driver, 'session-a', '重放的状态必须带当前驱动者')
  stream.dispose()
}

// ── 地址跟随页面：导航后状态行必须立刻更新，而不是等下一帧 ──────────────────

{
  const page = fakePage('https://a.example/')
  const stream = new PaneStream(streamingRuntime(page), new BrowserQueue())
  const client = fakeClient()
  stream.addClient(client)

  await stream.startScreencast()
  assert.equal(lastEvent(client, 'state').url, 'https://a.example/', '建立画面流时状态里就要有地址')
  assert.equal(lastEvent(client, 'state').active, true)

  // 地址变了但画面还没变：状态也必须跟着变，而且只广播一次。
  const before = client.frames.length
  page.setUrl('https://b.example/')
  page.emit('framenavigated')
  assert.equal(lastEvent(client, 'state').url, 'https://b.example/', '导航事件必须同步地址')
  assert.equal(client.frames.length, before + 1, '地址变化只该广播一条 state')
  page.emit('framenavigated')
  assert.equal(client.frames.length, before + 1, '地址没变时不应重复广播')

  // 帧到了：缓存帧带着当时的地址，而且不会把「谁在驱动」抹掉。
  stream.noteDriver('session-a')
  page.emitFrame('frame-b')
  assert.equal(stream.frame().url, 'https://b.example/', '缓存帧要记下它属于哪一页')
  assert.equal(stream.state().driver, 'session-a', '每一帧都不该抹掉驱动者')

  // 跨文档导航：旧画面画的是别的页面，缓存帧必须丢掉，免得新连上的视图把旧画面
  // 配上新地址。
  page.setUrl('https://c.example/x')
  page.emit('framenavigated')
  assert.equal(stream.frame(), null, '跨文档导航后缓存帧必须作废')
  assert.equal(stream.state().url, 'https://c.example/x')

  // 同文档跳转（只有锚点不同）：画面仍然有效，只把地址改过来。
  page.emitFrame('frame-c')
  page.setUrl('https://c.example/x#part')
  page.emit('framenavigated')
  assert.equal(stream.frame().url, 'https://c.example/x#part', '同文档跳转保留画面，只改地址')
  assert.equal(stream.state().url, 'https://c.example/x#part')

  // 迟到的视图（刚刷新/刚打开侧边栏）拿到的必须是当前地址。
  const late = fakeClient()
  stream.addClient(late)
  stream.send(late, 'state', stream.state())
  assert.equal(lastEvent(late, 'state').url, 'https://c.example/x#part', '重放的状态必须是当前地址')

  // 停流：导航监听必须解绑，轮询定时器必须清掉（否则每开一次就漏一个）。
  stream.stopScreencast()
  page.setUrl('https://d.example/')
  let created = 0
  let cleared = 0
  const realSetInterval = globalThis.setInterval
  const realClearInterval = globalThis.clearInterval
  globalThis.setInterval = (...args) => { created++; return realSetInterval(...args) }
  globalThis.clearInterval = (handle) => { cleared++; return realClearInterval(handle) }
  try {
    page.emit('framenavigated')
    assert.equal(
      lastEvent(client, 'state').url,
      'https://c.example/x#part',
      '停流之后导航事件不应再广播',
    )
    assert.equal(page.listenerCount(), 0, '停流必须解绑页面监听')
    await stream.startScreencast()
    assert.equal(created, 1, '建立画面流时要开始地址兜底轮询')
    stream.stopScreencast()
    assert.equal(cleared, created, '建立过的轮询都必须被清掉')
  } finally {
    stream.stopScreencast()
    globalThis.setInterval = realSetInterval
    globalThis.clearInterval = realClearInterval
  }

  stream.dispose()
}

process.stdout.write('pane-stream: 全部通过\n')
