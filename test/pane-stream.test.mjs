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
  const viewports = []
  return {
    viewports,
    onTabsChanged: () => () => {},
    sharedPage: async () => { throw new Error('not needed') },
    currentMode: () => 'own',
    tabs: async () => [],
    viewportSize: () => null,
    setViewport: async (width, height, deviceScaleFactor) => {
      viewports.push({ width, height, deviceScaleFactor })
      return { width, height }
    },
  }
}

/** 造一个记录写入的 SSE 响应替身。 */
function fakeClient() {
  const frames = []
  const client = {
    frames,
    ended: false,
    writableEnded: false,
    write: (chunk) => { frames.push(chunk); return true },
    end: () => { client.ended = true },
  }
  return client
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
      send: async (method, params) => {
        sent.push({ method, params })
        // 高清档要用的两条：滚动偏移与那张 2 倍截图。
        if (method === 'Page.getLayoutMetrics') {
          return { cssVisualViewport: { pageX: 0, pageY: 120, clientWidth: 400, clientHeight: 300 } }
        }
        if (method === 'Page.captureScreenshot') return { data: 'HD-JPEG' }
        return undefined
      },
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

// ── 画质档：换档必须带着新倍率重来一遍，并且广播出去 ────────────────────────

{
  const runtime = fakeRuntime()
  runtime.viewportSize = () => ({ width: 800, height: 600 })
  const stream = new PaneStream(runtime, new BrowserQueue(), 'perf')
  const client = fakeClient()
  stream.addClient(client)

  // 档位一上来就要在状态里（视图据此点亮按钮）。
  assert.equal(stream.state().quality, 'perf', '状态里必须带当前画质档')

  stream.setQuality('hd')
  // 广播先行：按钮立刻跟着变，画面慢一步到（可能要等串行队列）。
  assert.equal(lastEvent(client, 'state').quality, 'hd', '换档必须立刻广播新的档位')
  // 视口按新倍率重新应用一次。
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(
    runtime.viewports.at(-1),
    { width: 800, height: 600, deviceScaleFactor: 2 },
    '高清档必须按 2 倍抓帧重新应用视口',
  )

  // 同一个档位重复设置不该白推一次视口。
  const before = runtime.viewports.length
  stream.setQuality('hd')
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(runtime.viewports.length, before, '档位没变时不应重新应用视口')

  // 切回去也要生效。
  stream.setQuality('perf')
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(runtime.viewports.at(-1).deviceScaleFactor, 1, '切回性能档必须退回 1 倍')

  stream.dispose()
}

// ── 帧必须同时带上设备尺寸与页面 CSS 视口 ──────────────────────────────────

{
  // 性能档：帧就是画面流那一帧，设备尺寸来自 CDP 元数据。
  const page = fakePage('https://a.example/')
  const runtime = streamingRuntime(page)
  runtime.viewportSize = () => ({ width: 400, height: 300 })
  const stream = new PaneStream(runtime, new BrowserQueue(), 'perf')
  const client = fakeClient()
  stream.addClient(client)

  await stream.startScreencast()
  // 替身给出的帧元数据是 800×600（设备像素），页面 CSS 视口是 400×300。
  page.emitFrame('frame-a')
  const frame = lastEvent(client, 'frame')
  assert.equal(frame.data, 'frame-a', '性能档发出的就是画面流那一帧')
  assert.equal(frame.width, 800, '帧的设备宽度来自 CDP 元数据')
  assert.equal(
    frame.cssWidth,
    400,
    '帧必须同时带上 CSS 视口宽度：指针坐标按它换算，拿设备宽度当分母会让点击落到两倍远',
  )
  assert.equal(frame.cssHeight, 300)

  stream.dispose()
}

// ── 高清档：画面流只当信号，真正发出的是 2 倍截图 ───────────────────────────

{
  const page = fakePage('https://a.example/')
  const runtime = streamingRuntime(page)
  runtime.viewportSize = () => ({ width: 400, height: 300 })
  const stream = new PaneStream(runtime, new BrowserQueue(), 'hd')
  const client = fakeClient()
  stream.addClient(client)

  await stream.startScreencast()
  await new Promise(resolve => setTimeout(resolve, 0))
  const first = lastEvent(client, 'frame')
  assert.equal(first.data, 'HD-JPEG', '高清档发出的必须是截图那一张，不是画面流的低分帧')

  // 第一次信号帧只是记录基准（建立画面流时已经主动取过一张了），不该再取一次。
  const afterStart = client.frames.length
  page.emitFrame('signal-1')
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(client.frames.length, afterStart, '第一次信号帧不该重复触发取图')

  // 内容真的变了，才取图。
  page.emitFrame('signal-2')
  await new Promise(resolve => setTimeout(resolve, 0))
  const shot = lastEvent(client, 'frame')
  assert.notEqual(shot.data, 'signal-2', '高清档不该把画面流那一帧转发出去')
  assert.equal(shot.width, 800, '截图是 CSS 视口的 2 倍宽')
  assert.equal(shot.height, 600)
  assert.equal(shot.cssWidth, 400, 'CSS 尺寸同时带上，指针坐标才换算得对')
  assert.equal(shot.cssHeight, 300)

  // 关键：内容没变就不再取图。取图自己会让合成器产生 damage、画面流随即再推一帧**同样的
  // 画面**，不比一下就是「取图 → damage → 再取图」的自激环（实测静态页面 2 秒 33 帧）。
  const afterChange = client.frames.length
  page.emitFrame('signal-2')
  page.emitFrame('signal-2')
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(client.frames.length, afterChange, '内容相同的信号帧必须被忽略，否则会自激')

  // clip 的两个要点：倍率 2、原点是**页面**坐标（要带滚动偏移）。
  const capture = page.sent.filter(entry => entry.method === 'Page.captureScreenshot').at(-1)
  assert.equal(capture.params.clip.scale, 2, '截图必须按 2 倍重新光栅化')
  assert.equal(capture.params.clip.width, 400)
  assert.equal(capture.params.clip.height, 300)
  assert.equal(capture.params.clip.y, 120, 'clip 用页面坐标，必须带上滚动偏移，否则拍的是页面顶部')
  assert.equal(capture.params.captureBeyondViewport, false, '只要可见的那一屏')

  stream.dispose()
}

// ── 视图客户端数量必须封顶（否则会把浏览器的 6 条并发连接吃光）────────────────

{
  const stream = new PaneStream(fakeRuntime(), new BrowserQueue(), 'perf')
  const clients = []
  for (let index = 0; index < 7; index++) {
    const client = fakeClient()
    clients.push(client)
    stream.addClient(client)
  }
  // MAX_CLIENTS = 4：最旧的三个被结束掉，最近四个留着。
  assert.deepEqual(
    clients.map(client => client.ended),
    [true, true, true, false, false, false, false],
    '超过上限时必须结束最旧的响应：泄漏的视图不能把连接配额占满',
  )
  // 广播只写给还活着的四个。
  stream.broadcast('state', stream.state())
  assert.equal(clients.filter(client => client.frames.length > 0).length, 4, '广播不该再写给已结束的客户端')
  stream.dispose()
}

// ── 编辑键必须带虚拟键码（否则退格/Delete/方向键在页面里毫无反应）──────────

{
  const page = fakePage('https://a.example/')
  const stream = new PaneStream(streamingRuntime(page), new BrowserQueue(), 'perf')
  await stream.startScreencast()

  /** 最后一次发出的按键事件参数。 */
  const lastKey = () => page.sent.filter(entry => entry.method === 'Input.dispatchKeyEvent').at(-1).params

  await stream.dispatchInput({ type: 'key-down', key: 'Backspace', code: 'Backspace', text: '', modifiers: 0 })
  assert.equal(
    lastKey().windowsVirtualKeyCode,
    8,
    '退格键必须带 windowsVirtualKeyCode：实测只给 key/code 时输入框纹丝不动，补 8 才真删一个字',
  )
  await stream.dispatchInput({ type: 'key-down', key: 'Delete', code: 'Delete', text: '', modifiers: 0 })
  assert.equal(lastKey().windowsVirtualKeyCode, 46, 'Delete 同理')
  await stream.dispatchInput({ type: 'key-down', key: 'ArrowRight', code: 'ArrowRight', text: '', modifiers: 0 })
  assert.equal(lastKey().windowsVirtualKeyCode, 39, '方向键同理：没有键码光标不动')
  await stream.dispatchInput({ type: 'key-down', key: 'a', code: 'KeyA', text: 'a', modifiers: 0 })
  assert.equal(lastKey().windowsVirtualKeyCode, 65, '文字键也带上键码，页面里的 event.keyCode 才和真人一致')
  await stream.dispatchInput({ type: 'key-up', key: 'a', code: 'KeyA', modifiers: 0 })
  assert.equal(lastKey().windowsVirtualKeyCode, 65, 'keyUp 也要带，否则页面看到的键码不成对')

  stream.dispose()
}

process.stdout.write('pane-stream: 全部通过\n')