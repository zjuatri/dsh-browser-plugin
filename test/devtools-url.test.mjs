/**
 * 「该页面的开发者工具」地址的测试（跑在构建产物 `lib/index.js` 上）。
 *
 * 这条路径的失败方式都很安静：地址拼错了，用户点开的是一个连不上的 DevTools 页面，而错误
 * 只出现在那个新标签页里。所以这里钉住：目标 id 从页面自己的 CDP 会话问、端口从 ws endpoint
 * 取、优先用 Chrome 给出的 `devtoolsFrontendUrl`、拿不到时按同一 rev 自己拼、
 * 以及各种拿不到时的可读错误。
 *
 * 不启动任何 Chrome，也不真的发请求：页面、`/json/list` 的应答都是替身。
 *
 * 用法：node --no-warnings test/devtools-url.test.mjs
 */

import { strict as assert } from 'node:assert'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bundle = await import(`${pathToFileURL(join(root, 'lib/index.js')).href}?t=${String(Date.now())}`)
const { BrowserRuntime, Config, DEVTOOLS_ALLOWED_ORIGIN, resolveDevtoolsFrontendUrl } = bundle

const REV = 'abc123def'
const PORT = 4321
const TARGET = 'TARGET-ID-1'
const ENDPOINT = `ws://127.0.0.1:${PORT}/devtools/browser/0000-1111`

/** 造一个只满足这段逻辑需要的页面替身。 */
function fakePage(targetId = TARGET, { failInfo = false } = {}) {
  const session = { detached: 0 }
  return {
    session,
    isClosed: () => false,
    createCDPSession: async () => ({
      send: async (method) => {
        assert.equal(method, 'Target.getTargetInfo', '只该问这一个命令')
        if (failInfo) throw new Error('CDP 挂了')
        return { targetInfo: { targetId } }
      },
      detach: async () => { session.detached += 1 },
    }),
  }
}

/** 造一个 `/json/list` 替身，并记录被请求的地址。 */
function fakeList(rows) {
  const calls = []
  const fetchJson = async (url) => { calls.push(url); return rows }
  return { fetchJson, calls }
}

/** Chrome 会给出的那种前端地址。 */
const frontendUrl = (id) => `${DEVTOOLS_ALLOWED_ORIGIN}/serve_rev/@${REV}/inspector.html?ws=127.0.0.1:${PORT}/devtools/page/${id}`

/** 一条 `/json/list` 条目。 */
const row = (id, extra = {}) => ({ id, webSocketDebuggerUrl: `ws://127.0.0.1:${PORT}/devtools/page/${id}`, ...extra })

// ── 直接用 Chrome 给出的前端地址 ────────────────────────────────────────────

{
  const page = fakePage()
  const { fetchJson, calls } = fakeList([row(TARGET, { devtoolsFrontendUrl: frontendUrl(TARGET) })])
  const url = await resolveDevtoolsFrontendUrl(page, ENDPOINT, fetchJson)
  assert.equal(url, frontendUrl(TARGET), '应原样返回 Chrome 给出的前端地址')
  assert.equal(calls.length, 1)
  assert.ok(calls[0].includes(`127.0.0.1:${PORT}/json/list`), `应从 ws endpoint 推出端口：${calls[0]}`)
  assert.equal(page.session.detached, 1, 'CDP 会话必须用完就 detach，不能攒着')
}

// ── 该条目没给前端地址时自己拼（rev 从别的条目借） ──────────────────────────

{
  const page = fakePage()
  const { fetchJson } = fakeList([
    { id: 'other', devtoolsFrontendUrl: frontendUrl('other') },
    row(TARGET),
  ])
  const url = await resolveDevtoolsFrontendUrl(page, ENDPOINT, fetchJson)
  assert.equal(url, frontendUrl(TARGET), '应按同一 rev 拼出该目标的前端地址')
}

// ── 整个列表都没给前端地址：只报可读错误，不猜 ──────────────────────────────

{
  const page = fakePage()
  const { fetchJson } = fakeList([{ id: TARGET }])
  await assert.rejects(
    resolveDevtoolsFrontendUrl(page, ENDPOINT, fetchJson),
    /没有给出 DevTools 前端地址/u,
    '连 rev 都拿不到时必须明确报错，而不是拼一个连不上的地址',
  )
}

// ── 目标 id 问不到 ─────────────────────────────────────────────────────────

{
  const page = fakePage('', {})
  const { fetchJson } = fakeList([])
  await assert.rejects(
    resolveDevtoolsFrontendUrl(page, ENDPOINT, fetchJson),
    /调试目标 id/u,
    '没有目标 id 就没有可靠的入口',
  )
  assert.equal(page.session.detached, 1, '即使取 id 失败也必须 detach')
}

// ── 端点与端口的问题 ───────────────────────────────────────────────────────

{
  const { fetchJson } = fakeList([])
  await assert.rejects(resolveDevtoolsFrontendUrl(fakePage(), null, fetchJson), /调试端点/u)
  await assert.rejects(resolveDevtoolsFrontendUrl(fakePage(), '', fetchJson), /调试端点/u)
  await assert.rejects(resolveDevtoolsFrontendUrl(fakePage(), 'not-a-url', fetchJson), /不是合法 URL/u)
  await assert.rejects(resolveDevtoolsFrontendUrl(fakePage(), 'ws://127.0.0.1/devtools/browser/x', fetchJson), /没有端口/u)
}

// ── 调试端口不可达（浏览器已退出／空闲回收） ────────────────────────────────

{
  const page = fakePage()
  const fetchJson = async () => { throw new Error('connect ECONNREFUSED') }
  await assert.rejects(
    resolveDevtoolsFrontendUrl(page, ENDPOINT, fetchJson),
    /读不到调试端口.*ECONNREFUSED/u,
    '必须把底层原因带出来，方便判断是不是浏览器已经关了',
  )
}

// ── 只放行 Chrome 的前端 origin，绝不放行 `*` ───────────────────────────────

{
  assert.match(DEVTOOLS_ALLOWED_ORIGIN, /^https:\/\//u)
  assert.ok(!DEVTOOLS_ALLOWED_ORIGIN.includes('*'), '白名单里不能出现通配符')
}

// ── 运行时入口：没有页面时不懒启动 ──────────────────────────────────────────

{
  const runtime = new BrowserRuntime(Config({ pane: false, isolation: 'shared' }))
  await assert.rejects(runtime.devtoolsFrontendUrl(), /还没有打开任何页面/u, '没有页面就直说，不要顺手拉起一只 Chrome')

  // 有页面但浏览器句柄没了（调试端点取不到）时，也要是可读错误。
  runtime.pages = [fakePage()]
  runtime.active = 0
  await assert.rejects(runtime.devtoolsFrontendUrl(), /调试端点/u)
  assert.equal(runtime.activePage(), runtime.pages[0], 'activePage 必须给出活动页')
}

process.stdout.write('devtools-url: 全部通过\n')
