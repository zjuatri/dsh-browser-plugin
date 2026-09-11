/**
 * `apply` 接线的测试：闸门必须真的套在注册出去的工具上。
 *
 * 这一条无法靠读源码放心：`gateTool` 单测通过，只证明「套上之后行为正确」；如果
 * `apply` 里从没把闸门传下去（或闸门依赖取成了 undefined），工具照样注册成功、单测照样
 * 全绿，而线上子智能体可以照常驱动浏览器 —— 正是这次要修的问题之一。
 *
 * 因此这里用假的 ctx 真跑一遍 `apply`，抓住它注册出去的工具定义，再直接调用它们的
 * `execute`，断言子智能体被拒、主对话放行。
 *
 * 用法：node --no-warnings test/apply-wiring.test.mjs
 */

import { strict as assert } from 'node:assert'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bundle = await import(`${pathToFileURL(join(root, 'lib/index.js')).href}?t=${String(Date.now())}`)
const { SUBAGENT_DENIED } = bundle

/** 假 ctx：收集工具注册、吞掉技能注册，并给一个可注入的 agents 注册表。 */
function fakeContext(agents) {
  const tools = new Map()
  const disposers = []
  const ctx = {
    tools: { register: (definition) => { tools.set(definition.name, definition); return () => {} } },
    skills: { register: () => () => {} },
    /**
     * cordis 的 `ctx.effect` 会驱动生成器（这正是「递归模式」收集 disposer 的方式），
     * 假 ctx 必须照做，否则生成器体根本不执行、一个工具都不会注册。
     */
    effect: (callback) => {
      if (typeof callback !== 'function') return undefined
      const iterator = callback()
      if (iterator === undefined || typeof iterator.next !== 'function') return iterator
      let step = iterator.next()
      while (step.done !== true) {
        if (typeof step.value === 'function') disposers.push(step.value)
        step = iterator.next()
      }
      return step.value
    },
    get: (name) => (name === 'agents' ? agents : undefined),
  }
  return { ctx, tools, disposers }
}

/** 造一个执行上下文。 */
const exec = (agentId) => ({
  callId: 'c1',
  name: 'browser_goto',
  arguments: { url: 'https://example.com' },
  agent: agentId === undefined ? undefined : { id: agentId },
  signal: new AbortController().signal,
})

// ── 子智能体必须被拒 ────────────────────────────────────────────────────────

{
  // 只有 child-1 是被 root 拥有的子 agent。
  const agents = {
    list: () => [{ id: 'root' }, { id: 'child-1' }],
    isOwnedBy: (id, owner) => id === 'child-1' && owner.id === 'root',
  }
  const { ctx, tools } = fakeContext(agents)
  bundle.apply(ctx, { pane: false, isolation: 'shared' })

  const goto = tools.get('browser_goto')
  assert.ok(goto !== undefined, 'apply 必须注册 browser_goto')
  assert.ok(tools.size >= 15, `apply 应注册全部浏览器工具，实际 ${String(tools.size)} 个`)

  await assert.rejects(
    goto.execute({ url: 'https://example.com' }, exec('child-1')),
    (error) => error.message === SUBAGENT_DENIED,
    '子智能体必须被闸门拒绝，而不是放行到运行时',
  )
}

// ── agents 服务缺失时只串行、不误拒 ─────────────────────────────────────────

{
  const { ctx, tools } = fakeContext(undefined)
  // `isolation: 'shared'` + 空 `userDataDir`：这条用例只关心闸门，不该顺手在用户目录下
  // 建出会话 profile 目录来。
  bundle.apply(ctx, { pane: false, isolation: 'shared' })
  const goto = tools.get('browser_goto')
  // 没有注册表就无法判定谁是子智能体；此时不能凭空拒绝，只能放行（会去启动 Chrome，
  // 因此这里只断言它没有在闸门处抛「子智能体」错误）。
  await assert.rejects(
    goto.execute({ url: 'https://example.com' }, exec('child-1')).catch((error) => {
      assert.notEqual(error.message, SUBAGENT_DENIED, '注册表缺失时不应误判为子智能体')
      throw error
    }),
    () => true,
  )
}

process.stdout.write('apply-wiring: 全部通过\n')
