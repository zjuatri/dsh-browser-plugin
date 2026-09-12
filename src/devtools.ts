/**
 * 「这个页面的开发者工具」地址的解析。
 *
 * 侧边栏里的画面是**另一只 Chrome** 的 JPEG 流，所以在那儿右键拿到的只能是宿主浏览器
 * 自己的菜单与 DevTools —— 想看那一页的 DevTools，得把它的调试前端打开到别处。Chrome
 * 自己就给出了这个地址：调试端口的 `/json/list` 上每个目标都带 `devtoolsFrontendUrl`
 * （`https://chrome-devtools-frontend.appspot.com/serve_rev/@<rev>/inspector.html?ws=…`），
 * 那正是 `chrome://inspect` 这类远程调试用的同一个前端。把它交回给宿主浏览器新开一个
 * 标签页，用户就得到了那一页真正的 DevTools —— 无头模式下也一样（不需要窗口）。
 *
 * 前端页面的 origin 必须被 Chrome 放行，否则 WebSocket 升级会被拒（实测不带
 * `--remote-allow-origins` 时返回 403）。因此启动参数里放行 {@link DEVTOOLS_ALLOWED_ORIGIN}，
 * 而不是 `--remote-allow-origins=*`：调试端口虽然只绑回环，但 `*` 意味着用户浏览器里
 * 任意网页都能连上它、进而驱动那只已经登录的 Chrome。
 *
 * @module dsh-browser-plugin/src/devtools
 */

import type { Page } from 'puppeteer-core'

/** 允许连接调试端口的 origin。只放行 Chrome 自己给出的 DevTools 前端。 */
export const DEVTOOLS_ALLOWED_ORIGIN = 'https://chrome-devtools-frontend.appspot.com'

/** 读 `/json/list` 的超时（毫秒）；调试端口在本机，慢到这个数就是出问题了。 */
const LIST_TIMEOUT_MS = 5000

/** `/json/list` 条目里我们用得到的字段。 */
interface DebugTarget {
  id?: string
  devtoolsFrontendUrl?: string
  webSocketDebuggerUrl?: string
}

/** 拉一个 JSON 端点（注入以便测试）。 */
export type FetchJson = (url: string) => Promise<unknown>

/** 默认实现：`fetch` + 短超时。 */
const defaultFetchJson: FetchJson = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(LIST_TIMEOUT_MS) })
  if (!response.ok) throw new Error(`调试端口应答 HTTP ${String(response.status)}`)
  return await response.json()
}

/** 从浏览器的 ws endpoint 里取出调试端口。 */
function portOf(endpoint: string | null): string {
  if (endpoint === null || endpoint === '') throw new Error('拿不到浏览器的调试端点')
  let parsed: URL
  try {
    parsed = new URL(endpoint)
  } catch {
    throw new Error(`浏览器的调试端点不是合法 URL：${endpoint}`)
  }
  if (parsed.port === '') throw new Error(`浏览器的调试端点里没有端口：${endpoint}`)
  return parsed.port
}

/** 从一条前端地址里取出前端版本号（`serve_rev/@<rev>/`）。 */
function revisionOf(url: string | undefined): string {
  if (url === undefined) return ''
  return /serve_rev\/@([^/]+)\//u.exec(url)?.[1] ?? ''
}

/** 取一个 ws 地址的路径部分（`/devtools/page/<id>`）。 */
function pathOf(url: string | undefined): string {
  if (url === undefined) return ''
  try {
    return new URL(url).pathname
  } catch {
    return ''
  }
}

/**
 * 解析出「在当前浏览器里打开这一页的 DevTools」所需的地址。
 *
 * @param page - 要调试的页面（必须是该浏览器自己的页面）。
 * @param endpoint - 浏览器的 ws endpoint（`browser.wsEndpoint()`），用来定位调试端口。
 * @param fetchJson - 拉 `/json/list` 的实现；测试注入。
 * @returns 可在宿主机浏览器里打开的 DevTools 前端地址。
 * @throws 页面没有调试目标、端口不可达、或调试端口没给出前端版本号时抛出可读错误。
 */
export async function resolveDevtoolsFrontendUrl(
  page: Page,
  endpoint: string | null,
  fetchJson: FetchJson = defaultFetchJson,
): Promise<string> {
  const port = portOf(endpoint)

  // 目标 id 从页面自己的 CDP 会话问：`Target.getTargetInfo` 不带参数时用的就是本会话
  // 关联的那个目标。会话用完就 detach，别把 CDP 会话攒下来。
  const session = await page.createCDPSession()
  let targetId = ''
  try {
    const info = await session.send('Target.getTargetInfo', {}) as { targetInfo?: { targetId?: string } }
    targetId = info.targetInfo?.targetId ?? ''
  } finally {
    await session.detach().catch(() => { /* 已经断了就算了 */ })
  }
  if (targetId === '') throw new Error('拿不到这个页面的调试目标 id')

  let payload: unknown
  try {
    payload = await fetchJson(`http://127.0.0.1:${port}/json/list`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`读不到调试端口（127.0.0.1:${port}）的目标列表：${message}`)
  }
  const rows: DebugTarget[] = Array.isArray(payload) ? payload as DebugTarget[] : []
  const target = rows.find(row => row.id === targetId)
  if (target?.devtoolsFrontendUrl !== undefined && target.devtoolsFrontendUrl !== '') {
    return target.devtoolsFrontendUrl
  }

  // 回退：自己拼一份。版本号只能从别的条目上借（Chrome 每个条目都带同一个 rev）。
  const revision = rows.map(row => revisionOf(row.devtoolsFrontendUrl)).find(value => value !== '') ?? ''
  if (revision === '') throw new Error('调试端口没有给出 DevTools 前端地址，无法在浏览器里打开')
  const path = pathOf(target?.webSocketDebuggerUrl) || `/devtools/page/${targetId}`
  return `${DEVTOOLS_ALLOWED_ORIGIN}/serve_rev/@${revision}/inspector.html?ws=127.0.0.1:${port}${path}`
}
