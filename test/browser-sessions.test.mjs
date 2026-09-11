/**
 * 按会话隔离的浏览器注册表的测试（跑在构建产物 `lib/index.js` 上）。
 *
 * 这一版的核心承诺是「每个会话一只 Chrome、各自一份 profile」。它坏掉的方式很安静：
 * 少写一个 key 就退回全局共享，而所有工具照常工作 —— 只是 A 对话的登录态悄悄出现在
 * B 对话里。所以这里把「不同会话拿到不同运行时」「同一个会话复用同一只」「空闲回收
 * 不会掐掉正在用的」「超过上限先关最久未用的」逐条钉在产物上。
 *
 * 不启动任何 Chrome：注册表只**建对象**，Chrome 在第一次真正用到时才懒启动。因此
 * `runtime.close` 用替身，`profileDir` 直接断言计算出来的路径（注册表本身不建目录）。
 *
 * 用法：node --no-warnings test/browser-sessions.test.mjs
 */

import { strict as assert } from 'node:assert'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bundle = await import(`${pathToFileURL(join(root, 'lib/index.js')).href}?t=${String(Date.now())}`)
const { BrowserSessions, Config } = bundle

/** 造一份已解析配置（走真实 schema，默认值才是被测对象的一部分）。 */
function configOf(overrides = {}) {
  return Config({ isolation: 'session', userDataDir: 'C:\\profiles', ...overrides })
}

/** 把运行时的 `close` 换成替身，记录被关掉的会话键（不启动任何 Chrome）。 */
function trackClose() {
  const closed = []
  return {
    closed,
    stub(entry) {
      entry.runtime.close = async () => { closed.push(entry.key) }
    },
  }
}

/** 占住一个会话的锁，直到调用返回的 release。 */
function hold(entry) {
  let release = () => {}
  const holding = entry.queue.run('browser_goto', undefined, () => new Promise((resolveHeld) => {
    release = () => { resolveHeld('done') }
  }))
  return { release: () => { release() }, holding }
}

/** 造一个「视图正看着」的流控制器替身。 */
function watchingStream() {
  return { watching: true, noteDriver: () => {}, dispose: () => {} }
}

// ── 不同会话：不同运行时、不同队列、不同 profile ────────────────────────────

{
  const sessions = new BrowserSessions(configOf())
  const a1 = sessions.forSession('session-a')
  const a2 = sessions.forSession('session-a')
  const b = sessions.forSession('session-b')
  const anon = sessions.forSession(null)

  assert.equal(a1, a2, '同一个会话必须复用同一只浏览器')
  assert.notEqual(a1.runtime, b.runtime, '不同会话必须是不同的运行时')
  assert.notEqual(a1.queue, b.queue, '不同会话必须是不同的锁')
  assert.equal(sessions.size, 3, '无名会话也各占一只')
  assert.equal(anon.key, '', '拿不到会话 id 时落到无名键')

  assert.equal(a1.profileDir, join('C:\\profiles', 'session-a'), '每个会话一份独立 profile')
  assert.equal(b.profileDir, join('C:\\profiles', 'session-b'))
  assert.equal(anon.profileDir, null, '无名会话用临时 profile，不落盘')
  assert.notEqual(a1.profileDir, b.profileDir)

  await sessions.dispose()
}

// ── 会话 id 里的危险字符不能逃出 profile 目录 ───────────────────────────────

{
  const sessions = new BrowserSessions(configOf())
  const weird = sessions.forSession('../../etc/passwd')
  assert.equal(
    weird.profileDir,
    join('C:\\profiles', '.._.._etc_passwd'),
    '会话 id 必须被消毒成安全目录名',
  )
  await sessions.dispose()
}

// ── 共享模式：退回一只 Chrome（旧行为，留给不需要隔离的场景） ────────────────

{
  const sessions = new BrowserSessions(configOf({ isolation: 'shared' }))
  const a = sessions.forSession('session-a')
  const b = sessions.forSession('session-b')
  assert.equal(a.runtime, b.runtime, '共享模式下所有会话共用一只浏览器')
  assert.equal(a.queue, b.queue, '共享模式下所有会话共用一把锁')
  assert.equal(sessions.size, 1, '共享模式下注册表里只该有一只浏览器')
  assert.equal(a.profileDir, 'C:\\profiles', '共享模式直接用配置里的目录')
  await sessions.dispose()
}

// ── 闸门按会话取锁，驱动者报到该会话自己的视图上 ────────────────────────────

{
  const sessions = new BrowserSessions(configOf())
  const a = sessions.forSession('session-a')
  sessions.forSession('session-b')
  assert.notEqual(sessions.gateFor('session-a').queue, sessions.gateFor('session-b').queue)

  const noted = []
  a.stream = { noteDriver: (id) => { noted.push(id) }, watching: false, dispose: () => {} }
  sessions.gateFor('session-a').onDriver('session-a')
  assert.deepEqual(noted, ['session-a'], '驱动者必须报到该会话自己的视图上')
  sessions.gateFor('session-b').onDriver('session-b')
  assert.deepEqual(noted, ['session-a'], '另一个会话的驱动不该出现在本会话的视图上')

  assert.equal(sessions.runtimeFor('session-a'), a.runtime, 'runtimeFor 必须给出该会话的运行时')
  await sessions.dispose()
}

// ── 空闲回收：超时的关掉，正在用的绝不关 ────────────────────────────────────

{
  const sessions = new BrowserSessions(configOf({ idleTimeoutMs: 1000, maxBrowsers: 8 }))
  const idle = sessions.forSession('session-idle')
  const watched = sessions.forSession('session-watched')
  const busy = sessions.forSession('session-busy')
  const track = trackClose()
  for (const entry of [idle, watched, busy]) track.stub(entry)

  const longAgo = Date.now() - 60_000
  idle.lastUsed = longAgo
  watched.lastUsed = longAgo
  busy.lastUsed = longAgo
  watched.stream = watchingStream()
  const held = hold(busy)

  await sessions.sweep()
  assert.deepEqual(track.closed, ['session-idle'], '只该关掉真正空闲的那只')
  assert.equal(sessions.size, 2)

  // 锁放开、视图也走了之后，剩下的两只才轮得到回收。
  held.release()
  await held.holding
  watched.stream = undefined
  await sessions.sweep()
  assert.deepEqual(
    [...track.closed].sort(),
    ['session-busy', 'session-idle', 'session-watched'],
    '空闲窗口一到就该回收',
  )
  assert.equal(sessions.size, 0)
  await sessions.dispose()
}

// ── 超过上限：先关最久未用的空闲会话 ────────────────────────────────────────

{
  const sessions = new BrowserSessions(configOf({ idleTimeoutMs: 60_000, maxBrowsers: 2 }))
  const first = sessions.forSession('session-1')
  const second = sessions.forSession('session-2')
  const track = trackClose()
  track.stub(first)
  track.stub(second)
  first.lastUsed = Date.now() - 5_000
  second.lastUsed = Date.now() - 1_000

  track.stub(sessions.forSession('session-3'))
  await sessions.sweep()

  assert.deepEqual(track.closed, ['session-1'], '超上限时先关最久未用的那只')
  assert.equal(sessions.size, 2)
  assert.deepEqual(sessions.keys().sort(), ['session-2', 'session-3'])
  await sessions.dispose()
}

// ── 上限是软目标：没有空闲会话可关时不掐掉正在用的 ──────────────────────────

{
  const sessions = new BrowserSessions(configOf({ idleTimeoutMs: 60_000, maxBrowsers: 1 }))
  const one = sessions.forSession('session-one')
  const two = sessions.forSession('session-two')
  const track = trackClose()
  track.stub(one)
  track.stub(two)
  const first = hold(one)
  const second = hold(two)

  await sessions.sweep()
  assert.deepEqual(track.closed, [], '正在跑的会话绝不能被回收')
  assert.equal(sessions.size, 2, '宁可暂时超出上限')

  first.release()
  second.release()
  await first.holding
  await second.holding
  await sessions.dispose()
}

// ── idleTimeoutMs = 0 表示不做空闲回收 ──────────────────────────────────────

{
  const sessions = new BrowserSessions(configOf({ idleTimeoutMs: 0 }))
  const entry = sessions.forSession('session-a')
  const track = trackClose()
  track.stub(entry)
  entry.lastUsed = Date.now() - 86_400_000
  await sessions.sweep()
  assert.deepEqual(track.closed, [], '关掉回收开关后不该再按空闲时间关浏览器')
  await sessions.dispose()
}

// ── 拆除：所有会话一起关掉 ──────────────────────────────────────────────────

{
  const sessions = new BrowserSessions(configOf({ idleTimeoutMs: 60_000 }))
  const keys = ['session-1', 'session-2', 'session-3']
  const track = trackClose()
  for (const key of keys) track.stub(sessions.forSession(key))
  await sessions.dispose()
  assert.deepEqual(track.closed.sort(), [...keys].sort(), '插件卸载必须关掉所有会话的浏览器')
  assert.equal(sessions.size, 0)
}

process.stdout.write('browser-sessions: 全部通过\n')
