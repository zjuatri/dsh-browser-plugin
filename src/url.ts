/**
 * URL 归一化：把用户输入变成可导航的地址。
 *
 * 沿用 terminal-browser 的参考模型：
 *
 * - `scheme://…` 以及无主机名的 scheme（`data:`、`mailto:`、`about:` …）原样
 *   通过（经 URL 归一化；解析失败时返回原始输入，好让 `view-source:` 这类少见的
 *   scheme 仍能交给 Chrome）。
 * - 磁盘上真实存在的绝对路径或 `~` 路径会变成 file URL。
 * - 形如主机名的输入（`example.com/path`、`localhost:5173`）补 `https://`，
 *   localhost/127.0.0.1 例外，补 `http://`。
 * - 其余输入（含空格、不含点）会变成 Google 搜索。
 *
 * 不做相对路径解析：插件没有可用来解析 `./…` 的 cwd 锚点（参考实现是从它的终端
 * 会话 cwd 解析的）。
 *
 * @module dsh-browser-plugin/src/url
 */

import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const HAS_AUTHORITY = /^[a-z][a-z0-9+.-]*:\/\//i
const SCHEMES_WITHOUT_HOST = /^(?:data|mailto|tel|about|blob|chrome|view-source):/i

/** 把绝对路径或 `~` 路径解析为磁盘上存在的本地文件；不存在则返回 null。 */
function localFile(input: string): string | null {
  const expanded = input === '~' || input.startsWith('~/')
    ? join(homedir(), input.slice(1))
    : input
  if (!isAbsolute(expanded)) return null
  return existsSync(expanded) ? expanded : null
}

/** 把用户输入归一化为可导航的 URL。 */
export function normalizeUrl(input: string): string {
  const value = input.trim()
  if (!value) throw new Error('url is required')
  if (HAS_AUTHORITY.test(value) || SCHEMES_WITHOUT_HOST.test(value)) {
    try {
      return new URL(value).toString()
    } catch {
      return value
    }
  }
  const file = localFile(value)
  if (file) return pathToFileURL(file).toString()
  if (/^[\w.-]+(?::\d+)?(?:\/.*)?$/.test(value)) {
    const host = (value.split(/[:/]/)[0] ?? '').toLowerCase()
    const scheme = host === 'localhost' || host === '127.0.0.1' ? 'http' : 'https'
    return `${scheme}://${value}`
  }
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`
}
