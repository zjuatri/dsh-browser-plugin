/**
 * 浏览器工具的会话闸门：按会话取锁 + 子智能体策略。
 *
 * 两件事收敛在**一处**，避免 15 个工具各自重复一遍（也让 `tools.ts` 不必为每个工具
 * 都长三行）：
 *
 * 1. **按会话取锁**：浏览器按会话隔离（每会话一只 Chrome，见 `browser-sessions.ts`），
 *    因此锁也是每会话一把 —— 同一个会话里「智能体的调用」与「人在侧边栏上的点击」共用
 *    它，不同会话之间互不阻塞。工具侧不设排队上限，靠 `exec.signal` 取消（工具已声明
 *    `timeoutMs`，`dsh-tool-call-timeout-policy` 会 abort）。
 * 2. **子智能体策略**：subagent / workflow 的子 agent 各有独立 session id，且由
 *    `ctx.agents.isOwnedBy(childId, parentAgent)` 可查，默认不让他们驱动浏览器。
 *    隔离之后这条已是**策略**而非必需（子 agent 本可拿到自己的一只 Chrome，碰不到主
 *    对话的登录态），保留默认关闭是因为每委派一次就可能多起一个浏览器进程，而子 agent
 *    背后可能是别处来的提示词。需要时用 `allowSubagents` 打开。
 *
 * 包装只替换 `execute`，`parameters`/`output`/`description` 一律原样透传，因此**模型
 * 看到的工具面完全不变**。
 *
 * @module dsh-browser-plugin/src/tool-session
 */

import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { BrowserQueue } from './browser-queue.js'
import type { BrowserRuntime } from './browser.js'

/** 判定「某个 agent 是否由别的 agent 创建」所需的最小注册表形状。 */
export interface AgentOwnership {
  /** 是否有一个不同的、已注册的 agent 拥有这个 id。 */
  isChild: (id: string) => boolean
}

/** 一个会话的闸门依赖：它自己的锁，以及「谁在驱动」的上报落点。 */
export interface BrowserGate {
  /** 这个会话的串行队列（工具调用与视图操作共用）。 */
  queue: BrowserQueue
  /** 该会话取得锁时回调（该会话的视图用来显示「智能体正在使用」）。 */
  onDriver: (sessionId: string | null) => void
}

/** 工具侧入口：按会话取该会话的浏览器与它的闸门。 */
export interface BrowserGateway {
  /** 是否允许子智能体驱动浏览器。默认 false。 */
  allowSubagents: boolean
  /** 宿主 agent 注册表；缺失时跳过子智能体判定。 */
  ownership?: AgentOwnership
  /**
   * 取某个会话的闸门；首次取用会为该会话建一只浏览器（Chrome 仍然懒启动）。
   *
   * @param sessionId - 会话 id；无 agent 上下文时为 null。
   */
  gateFor: (sessionId: string | null) => BrowserGate
  /**
   * 取某个会话的浏览器运行时 —— 工具真正操作的对象。
   *
   * @param sessionId - 会话 id；无 agent 上下文时为 null。
   */
  runtimeFor: (sessionId: string | null) => BrowserRuntime
}

/** 工具定义里闸门关心的那部分。 */
interface Executable {
  name: string
  execute: (args: unknown, exec: ToolRunContext) => Promise<unknown>
}

/** 子智能体被拒时的错误信息。必须可操作：说清为什么、以及该怎么做。 */
export const SUBAGENT_DENIED = [
  '子智能体默认不能驱动浏览器。',
  '这是一条策略：浏览器按会话隔离，子智能体本可拿到自己的一只 Chrome，但每委派一次就可能多起一个浏览器进程，',
  '而子 agent 背后可能是别处来的提示词。',
  '请在主对话里直接调用浏览器工具，或把需要的信息描述给主对话；确实需要放开时把 allowSubagents 设为 true。',
].join('')

/**
 * 用该会话的串行队列与子智能体策略包住一个工具定义。
 *
 * 子智能体判定放在**取闸门之前**：被拒的调用不该顺手把一个会话的浏览器建出来。
 *
 * @param definition - 原始工具定义（`execute` 会被替换，其余字段不变）。
 * @param gateway - 按会话取闸门的入口。
 * @returns 包装后的工具定义，可直接交给 `ctx.tools.register`。
 */
export function gateTool<T extends Executable>(definition: T, gateway: BrowserGateway): T {
  const guarded: T = {
    ...definition,
    async execute(args: unknown, exec: ToolRunContext): Promise<unknown> {
      const agentId = exec.agent?.id
      if (!gateway.allowSubagents && agentId !== undefined && gateway.ownership?.isChild(agentId) === true) {
        throw new Error(SUBAGENT_DENIED)
      }
      const gate = gateway.gateFor(agentId ?? null)
      return gate.queue.run(definition.name, exec.signal, async () => {
        gate.onDriver(agentId ?? null)
        try {
          return await definition.execute(args, exec)
        } finally {
          // 放锁时把「谁在驱动」清掉。不清的话视图会永远显示「智能体正在使用本对话的
          // 浏览器，正在排队…」—— 工具其实早就跑完了，人却以为点什么都没反应。
          gate.onDriver(null)
        }
      })
    },
  }
  return guarded
}

/**
 * 由宿主 agent 注册表构造「是否子智能体」的判定。
 *
 * 两个判据取或，任一成立即为子智能体：
 *
 * - **被别的 agent 拥有**：`isOwnedBy(id, owner)`，这是运行时创建关系，最直接。
 * - **不是顶层 agent**：`roots()` 里的都不是它。这一条覆盖「拥有者已经卸载、但子 agent
 *   还在跑」的窗口 —— 那时 `isOwnedBy` 已经没有活的拥有者可查，只看拥有关系会漏。
 *
 * 按 `id` 比较而不是对象身份：`list()`/`roots()` 每次调用都返回新数组，且 `Agent`
 * 对外只承诺 `id` 一个字段。
 *
 * @param agents - `ctx.agents`（无宿主注册表时传 undefined）。
 * @returns 判定函数；`agents` 缺失时返回 undefined，闸门将跳过该检查。
 */
export function ownershipFrom(agents: {
  list: () => Array<{ id: string }>
  roots?: () => Array<{ id: string }>
  isOwnedBy: (id: string, owner: unknown) => boolean
} | undefined): AgentOwnership | undefined {
  if (agents === undefined) return undefined
  return {
    isChild: (id) => {
      if (agents.list().some(candidate => candidate.id !== id && agents.isOwnedBy(id, candidate))) return true
      const roots = agents.roots?.()
      if (roots === undefined) return false
      // 有顶层名单却说不出它是谁，就说明它是被委派出来的。
      return !roots.some(root => root.id === id)
    },
  }
}
