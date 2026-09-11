/**
 * Dev-only bootstrap: serve one page from `http://127.0.0.1:<port>` that
 * installs the DSH browser-session cookie in the visiting browser, then sends
 * it on to the GUI.
 *
 * Why a server instead of a `file://` page: Chrome refuses to store cookies
 * from an opaque `file://` origin, and cookies are port-agnostic for a
 * host-only cookie, so a page on any `127.0.0.1` port can set the cookie the
 * GUI on another `127.0.0.1` port needs.
 *
 * Usage: node scripts/serve-bootstrap.mjs <port> <guiBaseUrl>
 */

import { createHash, createHmac } from 'node:crypto'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const COOKIE_PAYLOAD_VERSION = 1
const SECRET_BYTES = 32
const COOKIE_PREFIX = 'dsh-auth-'
const COOKIE_MAX_AGE_DAYS = 30
const DAY_MILLISECONDS = 1440 * 60 * 1000
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/

const port = Number(process.argv[2] ?? 3099)
const gui = new URL(process.argv[3] ?? process.env.DSH_WEB_URL ?? 'http://127.0.0.1:3080')

/** Encode bytes as unpadded base64url. */
function encodeBase64Url(value) {
  return Buffer.from(value).toString('base64')
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

/** Decode unpadded base64url, rejecting anything that does not round-trip. */
function decodeBase64Url(value) {
  if (!BASE64URL_PATTERN.test(value) || value.length % 4 === 1) return undefined
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const decoded = Buffer.from(value.replaceAll('-', '+').replaceAll('_', '/') + padding, 'base64')
  return encodeBase64Url(decoded) === value ? decoded : undefined
}

const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const raw = await readFile(join(home, '.credentials.yaml'), 'utf8')
const line = raw.split(/\r?\n/u).find(row => /^\s*secret:\s*\S/u.test(row))
if (line === undefined) throw new Error('no browser-session secret in .credentials.yaml')
const secret = decodeBase64Url(line.slice(line.indexOf('secret:') + 'secret:'.length).trim())
if (secret === undefined || secret.byteLength !== SECRET_BYTES) throw new Error('bad secret')

const authority = gui.host
const issuedAt = Date.now()
const expiresAt = issuedAt + COOKIE_MAX_AGE_DAYS * DAY_MILLISECONDS
const body = encodeBase64Url(Buffer.from(JSON.stringify({ version: COOKIE_PAYLOAD_VERSION, authority, issuedAt, expiresAt }), 'utf8'))
const name = COOKIE_PREFIX + encodeBase64Url(createHash('sha256').update(authority).digest())
const cookie = `${name}=v1.${body}.${encodeBase64Url(createHmac('sha256', secret).update(body).digest())}`

const page = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>DSH 会话引导</title></head>
<body style="font:14px system-ui;padding:24px">
<p id="out">正在写入会话…</p>
<script>
  document.cookie = ${JSON.stringify(`${cookie}; Path=/; SameSite=Strict`)};
  const ok = document.cookie.length > 0;
  document.getElementById('out').textContent = ok ? '会话已写入，正在进入 GUI…' : '会话写入失败';
  if (ok) location.replace(${JSON.stringify(gui.origin + '/')});
</script>
</body></html>`

const server = createServer((req, res) => {
  // 浏览器在 cookie 写入后立刻跳走，会把连接掐断；这属于正常流程，不该让服务退出。
  res.on('error', () => {})
  req.on('error', () => {})
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
  res.end(page)
})
server.on('clientError', (_error, socket) => socket.destroy())
server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`bootstrap: http://127.0.0.1:${String(port)}/ → ${gui.origin}/\n`)
  process.stdout.write('bootstrap: 打开上面的地址即可写入会话并跳转到 GUI；用完 Ctrl+C 停掉。\n')
})
