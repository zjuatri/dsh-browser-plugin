/**
 * DSH 侧的浏览器闸门：按**工具名**拦截，因此不关心工具由谁提供。
 *
 * 为什么要有这一层：它订阅 `tools/pre-execute` 瀑布 —— 按名字分发，与「谁注册了这个
 * 名字、谁最终执行」无关，所以无论 `browser_*` 落到哪里，这一层都会先经过。
 *
 * （这里曾经写着「同名工具另有一个更高优先级的提供方在赢」。那是误判：真正的原因是旧包
 * `@try-works/dsh-browser-agent` 当时仍挂在 profile bundles 里，两边注册同一批名字、先
 * 注册的那份先赢，于是本插件的工具被遮住、闸门守的是没人走的代码路径。把旧包从 bundles
 * 摘掉之后，本插件的注册就是唯一提供方。这一层仍然保留：它按名字工作，将来若又出现第二
 * 个提供方，子智能体策略与同会话串行也不会被绕开。）
 *
 * 干两件事：
 *
 * 1. **同会话串行**：`browser_*` 调用按会话各自排队。浏览器已经按会话隔离（每会话一只
 *    Chrome，见 `browser-sessions.ts`），因此**不同会话之间不互相阻塞**；同一个会话里
 *    「智能体的调用」与「人在侧边栏上的点击」共用一把锁 —— 那一把在 `browser-sessions`
 *    里，这里的是按名字的兜底。
 * 2. **子智能体策略**：subagent / workflow 的子 agent 各有独立 session id，默认拒绝。
 *
 * 排队不设等待上限（见 {@link BrowserGateCore.intercept}）。
 *
 * @module dsh-browser-plugin/src/dsh-gate
 */

import { BrowserQueue } from './browser-queue.js'
// 文案与判定各只有一份：闸门挂在插件工具上还是挂在全局瀑布上，用户看到的拒绝理由与
// 判定结果都应当一致。
import { SUBAGENT_DENIED, ownershipFrom, type AgentOwnership } from './tool-session.js'

/** 需要过闸门的工具名前缀。 */
const BROWSER_TOOL_PREFIX = 'browser_'

/** 无名会话（没有 agent 上下文）在队列表里的键。 */
const ANONYMOUS_KEY = ''

/** `tools/pre-execute` 上的执行上下文（只取这里用得到的字段）。 */
interface GateExecution {
  readonly name: string
  readonly agent?: { readonly id: string }
}

export { SUBAGENT_DENIED, ownershipFrom }

/** 闸门配置。 */
export interface GateConfig {
  /** 是否允许子智能体驱动浏览器。默认 false。 */
  allowSubagents?: boolean
}

/** 宿主 agent 注册表的最小形状。 */
export interface AgentRegistryLike {
  list: () => Array<{ id: string }>
  roots?: () => Array<{ id: string }>
  isOwnedBy: (id: string, owner: unknown) => boolean
}

/** 闸门的可测试内核：每会话队列 + 判定 + 拦截逻辑，与 cordis 接线分开。 */
export class BrowserGateCore {
  private readonly queues = new Map<string, BrowserQueue>()
  private readonly ownership: AgentOwnership | undefined
  private readonly allowSubagents: boolean
  private lastDriver: string | null = null

  constructor(config: GateConfig, ownership: AgentOwnership | undefined) {
    this.allowSubagents = config.allowSubagents === true
    this.ownership = ownership
  }

  /** 最近一次取得锁的会话 id（诊断用）。 */
  get driver(): string | null {
    return this.lastDriver
  }

  /** 这个工具名是否需要过闸门。 */
  handles(name: string): boolean {
    return name.startsWith(BROWSER_TOOL_PREFIX)
  }

  /**
   * 取某个会话的队列，没有就地建一个。
   *
   * 队列本身只是个 FIFO（没有定时器、没有句柄），因此为每个见过的会话保留一个是廉价的：
   * 会话数量级是「用户开过的对话数」，不是「调用数」。
   *
   * @param sessionId - 会话 id；null 表示无 agent 上下文。
   * @returns 该会话的队列。
   */
  queueFor(sessionId: string | null): BrowserQueue {
    const key = sessionId ?? ANONYMOUS_KEY
    const existing = this.queues.get(key)
    if (existing !== undefined) return existing
    const created = new BrowserQueue()
    this.queues.set(key, created)
    return created
  }

  /**
   * 判定一次调用，并在允许时把它纳入**该会话**的串行队列。
   *
   * 排队不设等待上限：等多久由调用方自己的超时决定（工具调用有 `timeoutMs`，由
   * `dsh-tool-call-timeout-policy` 经 `exec.signal` 中止；视图路由另有 `queueTimeoutMs`）。
   * 在这里再叠一层上限只会把「合法但较慢的排队」当成错误。
   *
   * @param exec - 待执行的调用。
   * @param next - 继续瀑布。
   * @returns 拒绝决定或 `next()` 的结果。
   */
  async intercept<T>(exec: GateExecution, next: () => Promise<T>): Promise<T | { kind: 'deny'; reason: string }> {
    const agentId = exec.agent?.id
    if (!this.allowSubagents && agentId !== undefined && this.ownership?.isChild(agentId) === true) {
      return { kind: 'deny', reason: SUBAGENT_DENIED }
    }
    // 持锁跑完整个调用（含 dispatch）。`next()` 就是这次调用的其余瀑布。
    return this.queueFor(agentId ?? null).run(exec.name, undefined, async () => {
      this.lastDriver = agentId ?? null
      return next()
    })
  }
}
