/**
 * 子智能体闸门与按会话串行包装的测试。
 *
 * 闸门是「谁可以驱动浏览器」的唯一判定点，因此必须证明三件事：主对话能过、子智能体
 * 被拒（且错误信息可操作）、取消信号被转发。另外还要证明包装**不改**工具面对外可见的
 * 部分 —— 参数、描述、输出 schema 都必须原样透传。
 *
 * 「按会话」这一条同样重要：浏览器已经按会话隔离，锁也必须按会话分 —— 不同对话互相
 * 阻塞会让人以为浏览器坏了，同一个会话里不串行则会让智能体与人的操作互相插队。
 *
 * 用法：node --no-warnings test/tool-session.test.mjs
 */

import { strict as assert } from 'node:assert'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// 跑在构建产物上（源码的 `./x.js` 说明符在 Node 下解析不到同名 `.ts`）。
const { BrowserQueue, gateTool, ownershipFrom, SUBAGENT_DENIED } = await import(
  `${pathToFileURL(join(root, 'lib/index.js')).href}?t=${String(Date.now())}`
)

/** 造一个只带闸门关心字段的执行上下文。 */
function exec(agentId, signal = new AbortController().signal) {
  return { callId: 'c1', name: 'probe', arguments: {}, agent: agentId === undefined ? undefined : { id: agentId }, signal }
}

/** 造一个最小工具定义。 */
function tool(label, run) {
  return {
    name: label,
    description: `${label} description`,
    parameters: { a: { type: 'string', required: true } },
    output: { schema: { type: 'json' }, render: () => [] },
    async execute(args, context) { return run(args, context) },
  }
}

/**
 * 造一个按会话分发的网关替身：每个会话一把队列，各自记录自己的驱动者。
 *
 * 用真队列（而不是假锁）：要断言的正是「谁被谁挡住」，假锁证明不了这件事。
 */
function gatewayFor(overrides = {}) {
  const queues = new Map()
  const drivers = []
  const queueOf = (sessionId) => {
    const key = sessionId ?? ''
    const existing = queues.get(key)
    if (existing !== undefined) return existing
    const created = new BrowserQueue()
    queues.set(key, created)
    return created
  }
  const gateway = {
    allowSubagents: false,
    ownership: undefined,
    ...overrides,
    gateFor: (sessionId) => ({
      queue: queueOf(sessionId),
      onDriver: (driver) => { drivers.push(driver) },
    }),
  }
  return { gateway, drivers, queueOf }
}

// ── 主对话可以通过 ──────────────────────────────────────────────────────────

{
  const { gateway, drivers } = gatewayFor({ ownership: ownershipFrom(undefined) })
  const wrapped = gateTool(tool('browser_probe', async () => 'ran'), gateway)
  assert.equal(await wrapped.execute({ a: 'x' }, exec('session-main')), 'ran')
  assert.deepEqual(drivers, ['session-main'], 'onDriver 必须收到调用方会话 id')
}

// ── 子智能体被拒 ────────────────────────────────────────────────────────────

{
  const ownership = {
    // 只有 child-1 被别的 agent 拥有。
    isChild: (id) => id === 'child-1',
  }
  const { gateway, drivers } = gatewayFor({ ownership })
  let ran = false
  const wrapped = gateTool(tool('browser_probe', async () => { ran = true; return 'ran' }), gateway)

  await assert.rejects(
    wrapped.execute({ a: 'x' }, exec('child-1')),
    (error) => error.message === SUBAGENT_DENIED,
  )
  assert.equal(ran, false, '被拒的子智能体绝不能碰到运行时')
  assert.deepEqual(drivers, [], '被拒的调用不应登记为驱动者')

  // 同一个 agent id 若不是「被拥有」，仍然可以过（不同部署的 id 空间不同）。
  assert.equal(await wrapped.execute({ a: 'x' }, exec('session-main')), 'ran')
}

// ── allowSubagents 打开时放行 ───────────────────────────────────────────────

{
  const { gateway } = gatewayFor({ allowSubagents: true, ownership: { isChild: () => true } })
  const wrapped = gateTool(tool('browser_probe', async () => 'ran'), gateway)
  assert.equal(await wrapped.execute({ a: 'x' }, exec('child-1')), 'ran')
}

// ── ownership 缺失时跳过判定，只做串行 ─────────────────────────────────────

{
  const { gateway } = gatewayFor({ ownership: undefined })
  const wrapped = gateTool(tool('browser_probe', async () => 'ran'), gateway)
  assert.equal(await wrapped.execute({ a: 'x' }, exec('child-1')), 'ran')
}

// ── 取消信号被转发 ──────────────────────────────────────────────────────────

{
  const { gateway, queueOf } = gatewayFor()
  const controller = new AbortController()
  const queue = queueOf('session-main')
  // 先占住这个会话的锁，让被包装的调用真的进入排队。
  const holder = queue.run('holder', undefined, async () => 'held')
  const wrapped = gateTool(tool('browser_probe', async () => 'ran'), gateway)
  await holder

  const pending = wrapped.execute({ a: 'x' }, exec('session-main', controller.signal))
  controller.abort()
  await assert.rejects(pending, (error) => error.name === 'QueueAbortError')
}

// ── 串行是**按会话**的：同会话互斥，跨会话不阻塞 ────────────────────────────

{
  const { gateway } = gatewayFor()
  const insideBySession = new Map()
  const peakBySession = new Map()
  let running = 0
  let globalPeak = 0

  const enter = async (sessionId) => {
    const now = (insideBySession.get(sessionId) ?? 0) + 1
    insideBySession.set(sessionId, now)
    peakBySession.set(sessionId, Math.max(peakBySession.get(sessionId) ?? 0, now))
    running += 1
    globalPeak = Math.max(globalPeak, running)
    await new Promise(resolve => setTimeout(resolve, 5))
    insideBySession.set(sessionId, now - 1)
    running -= 1
    return 'ran'
  }

  const wrapped = gateTool(tool('browser_probe', async (_args, context) => enter(context.agent.id)), gateway)
  await Promise.all([
    wrapped.execute({ a: 'x' }, exec('session-a')),
    wrapped.execute({ a: 'x' }, exec('session-b')),
    wrapped.execute({ a: 'x' }, exec('session-a')),
    wrapped.execute({ a: 'x' }, exec('session-b')),
  ])

  assert.equal(peakBySession.get('session-a'), 1, '同一个会话的调用必须互斥')
  assert.equal(peakBySession.get('session-b'), 1, '同一个会话的调用必须互斥')
  assert.ok(globalPeak >= 2, `不同会话不该互相阻塞，实际同时在跑的最大值只有 ${String(globalPeak)}`)
}

// ── 包装不改对模型可见的部分 ────────────────────────────────────────────────

{
  const { gateway } = gatewayFor()
  const original = tool('browser_probe', async () => 'ran')
  const wrapped = gateTool(original, gateway)
  assert.equal(wrapped.name, original.name, '工具名不能变')
  assert.equal(wrapped.description, original.description, '描述不能变')
  assert.deepEqual(wrapped.parameters, original.parameters, '参数 schema 不能变')
  assert.deepEqual(wrapped.output.schema, original.output.schema, '输出 schema 不能变')
  assert.equal(wrapped.output.render, original.output.render, 'render 不能变')
  // 刻意不声明并发安全：省略即为 exclusive，正是我们要的（插件自己再串行一层）。
  assert.equal(wrapped.isConcurrencySafe, undefined)
}

// ── ownershipFrom ───────────────────────────────────────────────────────────

{
  assert.equal(ownershipFrom(undefined), undefined, '没有注册表时不判定')

  const registry = {
    list: () => [{ id: 'root' }, { id: 'child' }],
    roots: () => [{ id: 'root' }],
    isOwnedBy: (id, owner) => id === 'child' && owner.id === 'root',
  }
  const ownership = ownershipFrom(registry)
  assert.equal(ownership.isChild('child'), true)
  assert.equal(ownership.isChild('root'), false, 'agent 不能算作自己的子节点')
  // 有顶层名单却说不出它是谁 → 判为委派出来的（宁可拒绝，不要放行）。
  assert.equal(ownership.isChild('unknown'), true)
}

// ── 没有 roots() 时退回只看拥有关系 ─────────────────────────────────────────

{
  const ownership = ownershipFrom({
    list: () => [{ id: 'root' }, { id: 'child' }],
    isOwnedBy: (id, owner) => id === 'child' && owner.id === 'root',
  })
  assert.equal(ownership.isChild('child'), true)
  assert.equal(ownership.isChild('root'), false)
  // 没有 roots() 时无法用名单判定，只能退回拥有关系 —— 名单外的一律放行，这是本
  // 退化路径的已知弱点，所以真实注册表必须提供 roots()。
  assert.equal(ownership.isChild('unknown'), false)
}

// ── 拥有者已卸载、但子 agent 仍在跑：靠 roots() 兜住 ────────────────────────

{
  const ownership = ownershipFrom({
    // 拥有者已经不在注册表里了，isOwnedBy 无从查起。
    list: () => [{ id: 'orphan-child' }],
    roots: () => [],
    isOwnedBy: () => false,
  })
  assert.equal(ownership.isChild('orphan-child'), true, '不在顶层名单里就应判为子智能体')
}

process.stdout.write('tool-session: 全部通过\n')
