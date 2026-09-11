/**
 * 浏览器生命周期里两件容易出错的事（跑在构建产物 `lib/index.js` 上）。
 *
 * 1. **切换模式** = 关掉旧 Chrome、拉起新 Chrome：标签页不会跟过去，但用户能看见的那一页
 *    应该还在 —— 登录态本来就在 profile 目录里（两种模式共用同一个目录），只有地址需要
 *    手工带一次。这里钉住「哪些地址值得带」这条规则与产物里的接线。
 * 2. **启动是并发安全的**：视图（SSE 一接入就开画面流）与工具调用是两个入口，都可能在
 *    「这个会话还没有浏览器」的同一刻动手；同时启动同一个 profile 会被 Chrome 拒绝，而且
 *    第二次拉起的进程会移交请求后立刻退出，连上它等于连到别人的实例。
 *
 * 不启动任何 Chrome：页面直接塞假的（`carriedUrl` 只读 `pages[active].url()`），启动函数
 * 也换成替身。
 *
 * 用法：node --no-warnings test/mode-switch.test.mjs
 */

import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bundlePath = join(root, 'lib/index.js')
const bundle = await import(`${pathToFileURL(bundlePath).href}?t=${String(Date.now())}`)
const { BrowserRuntime, Config } = bundle

/** 造一个只满足 `carriedUrl` 需要的假页面。 */
const fakePage = (url, closed = false) => ({ isClosed: () => closed, url: () => url })

/** 造一个运行时（不启动任何东西），并把活动页设成给定 URL。 */
function runtimeAt(url, closed = false) {
  const runtime = new BrowserRuntime(Config({ pane: false, isolation: 'shared' }))
  runtime.pages = [fakePage(url, closed)]
  runtime.active = 0
  return runtime
}

// ── 值得带过去的地址 ────────────────────────────────────────────────────────

{
  for (const url of [
    'https://example.com/',
    'http://127.0.0.1:3080/some/path?q=1#frag',
    'file:///C:/tmp/page.html',
    'data:text/html,<b>hi</b>',
  ]) {
    assert.equal(runtimeAt(url).carriedUrl(), url, `这个地址应该被带过去：${url}`)
  }
}

// ── 不值得带的：没有页面、空白页、浏览器内部页、已关闭的页面 ────────────────

{
  const empty = new BrowserRuntime(Config({ pane: false, isolation: 'shared' }))
  assert.equal(empty.carriedUrl(), '', '还没有页面时不该带任何地址')

  assert.equal(runtimeAt('about:blank').carriedUrl(), '', '空白页不值得带')
  assert.equal(runtimeAt('').carriedUrl(), '', '空地址不值得带')
  assert.equal(runtimeAt('chrome://settings/').carriedUrl(), '', '浏览器内部页不值得带')
  assert.equal(runtimeAt('devtools://devtools/bundled/x.html').carriedUrl(), '', '调试页不值得带')
  assert.equal(runtimeAt('chrome-extension://abc/x.html').carriedUrl(), '', '扩展页不值得带')
  assert.equal(runtimeAt('https://example.com/', true).carriedUrl(), '', '已关闭的页面读不得')

  // url() 抛错（target 刚好消失）时不能把切换搞崩，只当没有可带地址。
  const broken = runtimeAt('https://example.com/')
  broken.pages = [{ isClosed: () => false, url: () => { throw new Error('gone') } }]
  assert.equal(broken.carriedUrl(), '', '读不出地址时按「没有」处理')
}

// ── 接线：切换模式时确实会去带地址 ──────────────────────────────────────────

{
  const source = readFileSync(bundlePath, 'utf8')
  assert.ok(source.includes('carriedUrl()'), 'switchMode 必须取一次当前地址')
  assert.ok(source.includes('this.goto(carry)'), '切换后必须在新浏览器里导航到该地址')
  assert.ok(source.includes('CARRY_TIMEOUT_MS'), '慢站点必须有等待上限，不能拖住切换本身')
}

// ── 启动是并发安全的：视图与工具同时要求启动时只能起一只 ────────────────────
// 按会话隔离之后每个会话都从「还没有浏览器」开始，而视图（SSE 一接入就开画面流）与工具
// 调用是两个入口，很容易在同一刻都发现「没有浏览器」。同时启动同一个 profile 会被 Chrome
// 拒绝（`The browser is already running for …`）。

{
  const runtime = new BrowserRuntime(Config({ pane: false, isolation: 'shared' }))
  let launches = 0
  const fake = { connected: true, close: async () => {} }
  runtime.launchBrowser = async () => {
    launches += 1
    await new Promise(resolve => setTimeout(resolve, 20))
    return fake
  }

  const [first, second] = await Promise.all([runtime.ensureBrowser(), runtime.ensureBrowser()])
  assert.equal(launches, 1, `并发调用只该真正启动一次，实际启动 ${String(launches)} 次`)
  assert.equal(first, fake)
  assert.equal(second, fake)
  assert.equal(await runtime.ensureBrowser(), fake, '已经启动好之后直接复用')
  assert.equal(launches, 1)
}

// ── 启动中被切换模式作废：那只实例必须被关掉，不能装回来 ────────────────────

{
  // 作废发生在**启动之前**（切换几乎同时发生）：什么都不该启动。
  const early = new BrowserRuntime(Config({ pane: false, isolation: 'shared' }))
  let earlyLaunches = 0
  early.launchBrowser = async () => { earlyLaunches += 1; return { connected: true, close: async () => {} } }
  const earlyPending = early.ensureBrowser()
  // `switchMode` 在拆掉旧浏览器时做的就是这件事（这里直接模拟，免得真去启动隐身 Chrome）。
  early.generation += 1
  await assert.rejects(earlyPending, /作废/u, '被作废的启动必须失败而不是把旧实例装回来')
  assert.equal(early.browser, null, '不能把作废的实例记成当前浏览器')
  assert.equal(earlyLaunches, 0, '作废早于启动时，连启动都不该发生（省一个进程）')

  // 作废发生在**启动过程中**（切换慢一步）：必须把已经拉起来的那只关掉。
  const late = new BrowserRuntime(Config({ pane: false, isolation: 'shared' }))
  let closedStale = false
  const stale = { connected: true, close: async () => { closedStale = true } }
  late.launchBrowser = async () => {
    await new Promise(resolve => setTimeout(resolve, 30))
    return stale
  }
  const latePending = late.ensureBrowser()
  await new Promise(resolve => setTimeout(resolve, 10))
  late.generation += 1
  await assert.rejects(latePending, /作废/u, '启动中被作废的实例必须失败')
  assert.equal(closedStale, true, '被作废的实例必须关掉，否则漏一个 Chrome 进程')
  assert.equal(late.browser, null, '不能把作废的实例记成当前浏览器')
}

process.stdout.write('mode-switch: 全部通过\n')
