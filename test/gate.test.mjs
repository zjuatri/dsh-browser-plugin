/**
 * 全局闸门的测试（跑在构建产物 `lib/gate.js` 上）。
 *
 * 为什么值得单独测：这一层是**按工具名**兜底的判定点 —— 与「谁注册了这个名字」无关，
 * 因此无论 `browser_*` 最终由谁执行都会先经过它。所以「按名字拦截」「子智能体被拒」
 * 「主对话放行」「同会话串行、跨会话不阻塞」这几条必须钉死。
 *
 * 用法：node --no-warnings test/gate.test.mjs
 */

import { strict as assert } from 'node:assert'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const gate = await import(`${pathToFileURL(join(root, 'lib/gate.js')).href}?t=${String(Date.now())}`)

/** 造一个执行上下文。 */
const exec = (name, agentId) => ({
  name,
  agent: agentId === undefined ? undefined : { id: agentId },
})

/** 假注册表：`child-1` 由 `root` 创建。 */
const registry = {
  list: () => [{ id: 'root' }, { id: 'child-1' }],
  roots: () => [{ id: 'root' }],
  isOwnedBy: (id, owner) => id === 'child-1' && owner.id === 'root',
}

// ── 按名字拦截：只碰 browser_* ──────────────────────────────────────────────

{
  const core = new gate.BrowserGateCore({}, gate.ownershipFrom(registry))
  assert.equal(core.handles('browser_goto'), true)
  assert.equal(core.handles('browser_a11y'), true, 'a11y 也必须是浏览器工具')
  assert.equal(core.handles('read'), false)
  assert.equal(core.handles('pwsh'), false)
  assert.equal(core.handles('browserX'), false, '前缀必须带下划线，不能误伤同名开头的其他工具')
}

// ── 子智能体被拒，主对话放行 ────────────────────────────────────────────────

{
  const core = new gate.BrowserGateCore({}, gate.ownershipFrom(registry))
  let ran = 0
  const next = async () => { ran += 1; return 'ok' }

  const denied = await core.intercept(exec('browser_goto', 'child-1'), next)
  assert.equal(denied.kind, 'deny', '子智能体必须被拒')
  assert.match(denied.reason, /子智能体/u, '拒绝理由必须说明是谁被拒')
  assert.match(denied.reason, /allowSubagents/u, '拒绝理由必须给出放开办法')
  assert.equal(ran, 0, '被拒的调用绝不能继续瀑布')

  assert.equal(await core.intercept(exec('browser_goto', 'root'), next), 'ok', '主对话必须放行')
  assert.equal(ran, 1)
  assert.equal(core.driver, 'root', '放行后应记录驱动者')
}

// ── allowSubagents 打开时放行 ───────────────────────────────────────────────

{
  const core = new gate.BrowserGateCore({ allowSubagents: true }, gate.ownershipFrom(registry))
  assert.equal(await core.intercept(exec('browser_goto', 'child-1'), async () => 'ok'), 'ok')
}

// ── 无注册表时不误拒（只串行） ──────────────────────────────────────────────

{
  const core = new gate.BrowserGateCore({}, undefined)
  assert.equal(await core.intercept(exec('browser_goto', 'child-1'), async () => 'ok'), 'ok')
}

// ── 同会话串行：临界区不重叠 ────────────────────────────────────────────────

{
  const core = new gate.BrowserGateCore({}, gate.ownershipFrom(registry))
  let inside = 0
  let maxInside = 0
  const order = []

  await Promise.all(
    Array.from({ length: 8 }, (_, index) => core.intercept(exec('browser_goto', 'root'), async () => {
      inside += 1
      maxInside = Math.max(maxInside, inside)
      order.push(index)
      await delay(4)
      inside -= 1
      return 'ok'
    })),
  )

  assert.equal(maxInside, 1, `同一会话的调用出现了重叠：最多 ${String(maxInside)} 个同时在跑`)
  assert.deepEqual(order, [0, 1, 2, 3, 4, 5, 6, 7], '必须按提交顺序执行（FIFO）')
}

// ── 跨会话不阻塞：两个对话各自的队列互不相干 ────────────────────────────────

{
  // 没有注册表 => 不做子智能体判定，这个用例只关心队列是不是按会话分的。
  const core = new gate.BrowserGateCore({}, undefined)
  let inside = 0
  let peak = 0
  const hold = async () => {
    inside += 1
    peak = Math.max(peak, inside)
    await delay(8)
    inside -= 1
    return 'ok'
  }

  await Promise.all([
    core.intercept(exec('browser_goto', 'root'), hold),
    core.intercept(exec('browser_goto', 'other'), hold),
  ])

  assert.ok(peak >= 2, `不同会话不该互相阻塞，实际同时在跑的最大值只有 ${String(peak)}`)
  assert.notEqual(
    core.queueFor('root'),
    core.queueFor('other'),
    '每个会话必须有自己的队列',
  )
}

// ── 一次失败不锁死后续调用 ──────────────────────────────────────────────────

{
  const core = new gate.BrowserGateCore({}, gate.ownershipFrom(registry))
  await assert.rejects(
    core.intercept(exec('browser_goto', 'root'), async () => { throw new Error('boom') }),
    /boom/u,
  )
  assert.equal(core.queueFor('root').busy, false, '失败的调用必须释放锁')
  assert.equal(await core.intercept(exec('browser_goto', 'root'), async () => 'ok'), 'ok')
}

// ── ownershipFrom 的两个判据 ────────────────────────────────────────────────

{
  assert.equal(gate.ownershipFrom(undefined), undefined, '没有注册表时不判定')

  const byOwnership = gate.ownershipFrom(registry)
  assert.equal(byOwnership.isChild('child-1'), true)
  assert.equal(byOwnership.isChild('root'), false)

  // 拥有者已卸载、子 agent 仍在跑：靠 roots() 兜住。
  const orphan = gate.ownershipFrom({ list: () => [{ id: 'orphan' }], roots: () => [], isOwnedBy: () => false })
  assert.equal(orphan.isChild('orphan'), true)
}

// ── 配置默认值 ──────────────────────────────────────────────────────────────

{
  assert.equal(gate.Config({}).allowSubagents, false, '默认必须禁止子智能体')
}

process.stdout.write('gate: 全部通过\n')
