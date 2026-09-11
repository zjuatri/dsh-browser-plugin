/**
 * 串行队列的测试。
 *
 * 这个队列是「同一时刻只有一个调用在驱动共享浏览器」的唯一保证，因此它必须自己证明
 * 三件事：临界区不重叠、顺序是 FIFO、以及一次失败的调用不会把浏览器永久锁死。
 *
 * 用法：node --no-warnings test/browser-queue.test.mjs
 */

import { strict as assert } from 'node:assert'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// 跑在构建产物上（源码的 `./x.js` 说明符在 Node 下解析不到同名 `.ts`）。
const { BrowserQueue, QueueAbortError } = await import(
  `${pathToFileURL(join(root, 'lib/index.js')).href}?t=${String(Date.now())}`
)

// ── 临界区不重叠 ────────────────────────────────────────────────────────────

{
  const queue = new BrowserQueue()
  let inside = 0
  let maxInside = 0
  const order = []

  await Promise.all(
    Array.from({ length: 10 }, (_, index) => queue.run(`call-${String(index)}`, undefined, async () => {
      inside++
      maxInside = Math.max(maxInside, inside)
      order.push(`in-${String(index)}`)
      await delay(5)
      order.push(`out-${String(index)}`)
      inside--
    })),
  )

  assert.equal(maxInside, 1, `临界区出现了重叠：最多同时有 ${String(maxInside)} 个调用在里面`)
  // FIFO：进入顺序应与提交顺序一致。
  assert.deepEqual(
    order.filter(item => item.startsWith('in-')).map(item => item.slice(3)),
    Array.from({ length: 10 }, (_, index) => String(index)),
    '队列必须是 FIFO',
  )
}

// ── 空闲时同步拿锁 ──────────────────────────────────────────────────────────

{
  const queue = new BrowserQueue()
  assert.equal(queue.busy, false)
  const done = queue.run('solo', undefined, async () => 'ok')
  assert.equal(queue.busy, true, '进入临界区后 busy 必须为真')
  assert.equal(queue.holder, 'solo')
  assert.equal(await done, 'ok')
  assert.equal(queue.busy, false, '释放后必须回到空闲')
  assert.equal(queue.holder, null)
}

// ── 排队取消：不执行，也不阻塞后续 ──────────────────────────────────────────

{
  const queue = new BrowserQueue()
  const first = new AbortController()
  // 用显式 resolve 拿到的门闸占住锁（不写类型参数：Node 的 strip-only 不支持它）。
  const gate = new Promise((resolve) => { first.signal.addEventListener('abort', () => { resolve() }) })

  // 先占住锁。
  const holder = queue.run('holder', undefined, async () => { await gate })

  const cancelled = new AbortController()
  const queued = queue.run('queued', cancelled.signal, async () => 'should not run')
  assert.equal(queue.depth, 1, '第二个调用应处于排队状态')

  cancelled.abort()
  await assert.rejects(queued, (error) => error instanceof QueueAbortError)
  assert.equal(queue.depth, 0, '取消后必须从队列里摘掉，不留幽灵条目')

  // 被取消的那个腾出的位置不能让后续调用卡住。
  const after = queue.run('after', undefined, async () => 'ran')
  first.abort()
  await holder
  assert.equal(await after, 'ran')
}

// ── 已经中止的信号不入队 ────────────────────────────────────────────────────

{
  const queue = new BrowserQueue()
  const aborted = AbortSignal.abort()
  await assert.rejects(
    queue.run('already-aborted', aborted, async () => 'nope'),
    (error) => error instanceof QueueAbortError,
  )
  assert.equal(queue.depth, 0, '已中止的信号不应留在队列里')
  assert.equal(queue.busy, false)
}

// ── 持有者抛错也必须释放锁 ──────────────────────────────────────────────────

{
  const queue = new BrowserQueue()
  await assert.rejects(queue.run('boom', undefined, async () => { throw new Error('boom') }), /boom/u)
  assert.equal(queue.busy, false, '失败的调用绝不能把浏览器永久锁死')
  assert.equal(await queue.run('after-boom', undefined, async () => 'ok'), 'ok')
}

// ── dispose 让等待者全部失败 ────────────────────────────────────────────────

{
  const queue = new BrowserQueue()
  const gate = new Promise((resolve) => { setTimeout(resolve, 20) })
  const holder = queue.run('holder', undefined, async () => { await gate })
  const waiting = queue.run('waiting', undefined, async () => 'never')
  queue.dispose()
  await assert.rejects(waiting, (error) => error instanceof QueueAbortError)
  await holder
  // dispose 之后的调用直接失败，不再入队。
  await assert.rejects(
    queue.run('after-dispose', undefined, async () => 'never'),
    (error) => error instanceof QueueAbortError,
  )
}

process.stdout.write('browser-queue: 全部通过\n')
