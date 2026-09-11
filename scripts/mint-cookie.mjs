/**
 * Mint the DSH Web browser-session cookie for the locally running `dsh web`
 * server, so an agent (or a human with the launch token) can reach the GUI
 * without the one-shot `?token=` URL.
 *
 * The server mints this cookie itself at `GET /?token=<launchToken>`; this
 * script reproduces that computation from the persisted signing secret in
 * `$DSH_HOME/.credentials.yaml`, which is the same secret the running process
 * loaded at activation. Output is a `Cookie:` header value.
 *
 * Usage: node scripts/mint-cookie.mjs [authority]
 */

import { createHash, createHmac } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Cookie payload version the server writes and verifies. */
const COOKIE_PAYLOAD_VERSION = 1
/** Signing secret length in bytes. */
const SECRET_BYTES = 32
/** Cookie name prefix. */
const COOKIE_PREFIX = 'dsh-auth-'
/** Server default lifetime for a browser session cookie. */
const COOKIE_MAX_AGE_DAYS = 30
const DAY_MILLISECONDS = 1440 * 60 * 1000

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/

/** Encode bytes as unpadded base64url, matching the server's encoding. */
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

/** Read the `client-connection/browser-session` secret out of the credentials file. */
async function readSecret(home) {
  const raw = await readFile(join(home, '.credentials.yaml'), 'utf8')
  const line = raw.split(/\r?\n/u).find(row => /^\s*secret:\s*\S/u.test(row))
  if (line === undefined) throw new Error('no browser-session secret found in .credentials.yaml')
  const handle = line.slice(line.indexOf('secret:') + 'secret:'.length).trim()
  const secret = decodeBase64Url(handle)
  if (secret === undefined || secret.byteLength !== SECRET_BYTES) {
    throw new Error('browser-session secret is not a 32-byte base64url value')
  }
  return secret
}

/** Cookie name for one request authority. */
function cookieName(authority) {
  return COOKIE_PREFIX + encodeBase64Url(createHash('sha256').update(authority).digest())
}

/** HMAC-SHA256 signature over the encoded body. */
function signature(secret, body) {
  return createHmac('sha256', secret).update(body).digest()
}

/** Serialize and sign one cookie payload. */
function encodeCookie(payload, secret) {
  const body = encodeBase64Url(Buffer.from(JSON.stringify(payload), 'utf8'))
  return `v1.${body}.${encodeBase64Url(signature(secret, body))}`
}

const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
// The server keys the cookie to the request authority (`Host`), so a full URL
// argument must be reduced to its `host` — `new URL(...).host` is the only
// accepted form; a bare `host:port` is normalized through `URL` as well.
const authority = new URL(process.argv[2] ?? process.env.DSH_WEB_URL ?? 'http://127.0.0.1:3080').host

const secret = await readSecret(home)
const issuedAt = Date.now()
const expiresAt = issuedAt + COOKIE_MAX_AGE_DAYS * DAY_MILLISECONDS
const value = encodeCookie({ version: COOKIE_PAYLOAD_VERSION, authority, issuedAt, expiresAt }, secret)

process.stdout.write(`${cookieName(authority)}=${value}\n`)
