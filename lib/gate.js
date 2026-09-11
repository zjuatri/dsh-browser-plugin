//! 自动生成，请勿直接编辑 —— 由 scripts/build-host.mjs 从 src/*.ts 生成。
//!
//! profile 用 `file://` 行加载本文件（见 cordis.patch.yml），所以它必须是 Node 能
//! 直接 import 的 ESM：类型已剥离、相对 import 已内联、外部依赖在顶部导入一次。
import * as __ext_H4_0 from "@deepseek-ai/schemastery"

/** 外部依赖的取用口：ESM 命名空间对象即导入表。 */
const __external = (specifier) => {
  switch (specifier) {

    /* v8 ignore next -- 别名表由构建脚本生成，与上面的 import 一一对应 */
    default: throw new Error(`dsh-browser-plugin: 未声明外部依赖 ${specifier}`)
  }
}

/** 默认导入的取用口（对应 `import z from '…'`）。 */
const __externalDefault = (specifier) => {
  switch (specifier) {
    case "@deepseek-ai/schemastery": return __ext_H4_0.default
    /* v8 ignore next -- 同上 */
    default: throw new Error(`dsh-browser-plugin: 未声明外部依赖 ${specifier}`)
  }
}

// ── src/browser-queue.ts ──
const H1 = (() => {
  /**
   * 共享浏览器的串行队列。
   *
   * 为什么需要它：插件把浏览器工具注册在**全局**工具层，因此每个会话都看得见、都能调；
   * 而它们全部作用于**同一个** Chrome 的同一个活动标签页。`dsh-tools` 的 exclusive 调度
   * 帮不上忙 —— `dsh-agent-loop` 的调度器是**每个 agent 一个 scope**
   * （`createScope(loopCtx, this)`），exclusive 只是单个 agent 回合内的顺序屏障，不跨
   * 会话。两个对话同时跑就会互相抢导航、互相覆盖表单，`browser_read` 读到的是对方刚翻到
   * 的页面 —— 得到的是静默的错误答案，而不是报错。
   *
   * 这个队列把「同一时刻只有一个函数在驱动共享浏览器」变成一条硬约束：工具调用（智能体）
   * 与视图路由（人）都从它这里过。Chrome 的 CDP 会话本来也不支持把多路命令真正交错执行，
   * 所以串行既修掉了语义问题，也符合底层资源的实际能力。
   *
   * @module dsh-browser-plugin/src/browser-queue
   */

  /** 排队被取消时抛出的错误（调用方按 `name` 识别，不必跨模块共享类）。 */
  class QueueAbortError extends Error {
    constructor(message = '浏览器调用已取消') {
      super(message)
      this.name = 'QueueAbortError'
    }
  }

  /** 一个在队列里等待的调用。 */
                    
                 
                               
                                        
                                 
                                          
                       
   

  /**
   * FIFO、可取消的互斥锁。
   *
   * 语义刻意做得很小：谁先到谁先用，锁在**释放的同一刻**移交给队首（同步移交，因此没有
   * 插队窗口），等待者可以带 `AbortSignal` 退出。
   */
  class BrowserQueue {
                     waiting           = []
            current                = null
            disposed = false

    /** 当前是否有调用持有浏览器。 */
    get busy()          {
      return this.current !== null
    }

    /** 当前持有者的标签（工具名或路由名）；空闲时为 null。 */
    get holder()                {
      return this.current
    }

    /** 正在排队等待的调用数（诊断与测试用）。 */
    get depth()         {
      return this.waiting.length
    }

    /**
     * 排队执行 `fn`，保证同一时刻只有一个 `fn` 在跑。
     *
     * @param label - 诊断标签（工具名或路由名）。
     * @param signal - 调用方的取消信号；排队期间被中止则放弃，不会执行 `fn`。
     * @param fn - 临界区。
     * @returns `fn` 的结果。
     * @throws {QueueAbortError} 排队期间被中止，或队列已拆除。
     */
    async run   (label        , signal                         , fn                  )             {
      const release = await this.acquire(label, signal)
      try {
        // 拿到锁之后再看一次：排队期间可能已经被取消，那就不该再驱动浏览器。
        if (signal?.aborted === true) throw new QueueAbortError('浏览器调用已取消')
        return await fn()
      } finally {
        // 释放必须在 finally 里：一次失败的调用绝不能把浏览器永久锁死。
        release()
      }
    }

    /** 放弃所有等待者并让后续调用直接失败（插件卸载用）。 */
    dispose()       {
      this.disposed = true
      for (const waiter of this.waiting.splice(0, this.waiting.length)) {
        waiter.cleanup()
        waiter.abort(new QueueAbortError('浏览器插件已卸载'))
      }
    }

    /**
     * 取得锁；返回「把锁交给下一个」的函数。
     *
     * 空闲时同步兑现，避免最常见的路径绕一圈 promise。忙时登记为等待者，锁由
     * {@link handoff} 移交。
     */
            acquire(label        , signal                         )                      {
      if (this.disposed) return Promise.reject(new QueueAbortError('浏览器插件已卸载'))
      if (signal?.aborted === true) return Promise.reject(new QueueAbortError('浏览器调用已取消'))

      if (this.current === null) {
        this.current = label
        return Promise.resolve(() => { this.handoff() })
      }

      return new Promise            ((resolve, reject) => {
        const waiter         = {
          label,
          grant: resolve,
          abort: reject,
          cleanup: () => {},
        }
        if (signal !== undefined) {
          const onAbort = ()       => {
            if (this.drop(waiter)) reject(new QueueAbortError(`${label} 在等待浏览器时被取消`))
          }
          signal.addEventListener('abort', onAbort, { once: true })
          waiter.cleanup = () => { signal.removeEventListener('abort', onAbort) }
          // 登记与监听之间存在竞态：再查一次，已中止就立刻退出，否则监听器
          // 再也不会触发，这个调用会永远挂着。
          if (signal.aborted) {
            onAbort()
            return
          }
        }
        this.waiting.push(waiter)
      })
    }

    /** 把锁交给队首（同步移交，不给后来者插队的窗口）。 */
            handoff()       {
      const next = this.waiting.shift()
      if (next === undefined) {
        this.current = null
        return
      }
      this.current = next.label
      next.cleanup()
      next.grant(() => { this.handoff() })
    }

    /** 从队列里摘掉一个等待者；已经不在队列里（已被授予）返回 false。 */
            drop(waiter        )          {
      const at = this.waiting.indexOf(waiter)
      if (at < 0) return false
      this.waiting.splice(at, 1)
      waiter.cleanup()
      return true
    }
  }
  return {
    QueueAbortError,
    BrowserQueue,
  }
})()

// ── src/tool-session.ts ──
const H2 = (() => {
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

                                                              
                                                        
                                                    

  /** 判定「某个 agent 是否由别的 agent 创建」所需的最小注册表形状。 */
                                   
                                       
                                    
   

  /** 一个会话的闸门依赖：它自己的锁，以及「谁在驱动」的上报落点。 */
                                
                                  
                       
                                          
                                                
   

  /** 工具侧入口：按会话取该会话的浏览器与它的闸门。 */
                                   
                                  
                           
                                    
                              
       
                                              
      
                                                   
       
                                                      
       
                                 
      
                                                   
       
                                                            
   

  /** 工具定义里闸门关心的那部分。 */
                        
                
                                                                      
   

  /** 子智能体被拒时的错误信息。必须可操作：说清为什么、以及该怎么做。 */
  const SUBAGENT_DENIED = [
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
  function gateTool                      (definition   , gateway                )    {
    const guarded    = {
      ...definition,
      async execute(args         , exec                )                   {
        const agentId = exec.agent?.id
        if (!gateway.allowSubagents && agentId !== undefined && gateway.ownership?.isChild(agentId) === true) {
          throw new Error(SUBAGENT_DENIED)
        }
        const gate = gateway.gateFor(agentId ?? null)
        return gate.queue.run(definition.name, exec.signal, async () => {
          gate.onDriver(agentId ?? null)
          return definition.execute(args, exec)
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
  function ownershipFrom(agents   
                                     
                                       
                                                      
               )                             {
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
  return {
    SUBAGENT_DENIED,
    gateTool,
    ownershipFrom,
  }
})()

// ── src/dsh-gate.ts ──
const H3 = (() => {
  const { BrowserQueue } = H1
  const { SUBAGENT_DENIED, ownershipFrom } = H2
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

  // 文案与判定各只有一份：闸门挂在插件工具上还是挂在全局瀑布上，用户看到的拒绝理由与
  // 判定结果都应当一致。

  /** 需要过闸门的工具名前缀。 */
  const BROWSER_TOOL_PREFIX = 'browser_'

  /** 无名会话（没有 agent 上下文）在队列表里的键。 */
  const ANONYMOUS_KEY = ''

  /** `tools/pre-execute` 上的执行上下文（只取这里用得到的字段）。 */
                           
                         
                                            
   

  /** 闸门配置。 */
                               
                                  
                            
   

  /** 宿主 agent 注册表的最小形状。 */
                                      
                                     
                                       
                                                      
   

  /** 闸门的可测试内核：每会话队列 + 判定 + 拦截逻辑，与 cordis 接线分开。 */
  class BrowserGateCore {
                     queues = new Map                      ()
                     ownership                            
                     allowSubagents         
            lastDriver                = null

    constructor(config            , ownership                            ) {
      this.allowSubagents = config.allowSubagents === true
      this.ownership = ownership
    }

    /** 最近一次取得锁的会话 id（诊断用）。 */
    get driver()                {
      return this.lastDriver
    }

    /** 这个工具名是否需要过闸门。 */
    handles(name        )          {
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
    queueFor(sessionId               )               {
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
    async intercept   (exec               , next                  )                                                {
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
  return {
    BROWSER_TOOL_PREFIX,
    ANONYMOUS_KEY,
    BrowserGateCore,
    BrowserQueue,
    SUBAGENT_DENIED,
    ownershipFrom,
  }
})()

// ── src/gate-entry.ts ──
const H4 = (() => {
  const z = __externalDefault("@deepseek-ai/schemastery")
  const { BrowserGateCore, ownershipFrom } = H3
  /**
   * DSH 侧的浏览器闸门（按工具名拦截，见 `dsh-gate.ts` 的说明）。
   *
   * 这是一个**独立挂载**的插件：它不改 `dsh-browser-plugin` 的宿主半边，只订阅
   * `tools/pre-execute`。这样即使将来 `browser_*` 这个名字由别处提供/执行，子智能体策略与
   * 同会话串行也不会被绕开。
   *
   * 挂载方式（profile 补丁插一行 `file://` 即可）：
   *
   * ```yaml
   * - insert:
   *     - id: dsh-browser-gate
   *       name: "file:///D:/desktop/repos/dsh-browser-plugin/lib/gate.js"
   * ```
   *
   * @module dsh-browser-plugin/src/gate-entry
   */

                                                    

  /** cordis 插件名。 */
  const name = 'dsh-browser-gate'

  /**
   * 本插件依赖的服务。
   *
   * `agents` 是**必需**的，不是可选：子智能体判定全靠它。取不到就挡不住子 agent，而
   * 「看起来装了、其实没挡住」比不装更危险。因此让它成为硬依赖 —— 服务缺失时插件保持
   * 待命，而不是静默降级。
   */
  const inject = ['agents']

  /** 默认不允许子智能体驱动浏览器。 */
  const DEFAULT_ALLOW_SUBAGENTS = false

  /** schemastery 配置；cordis 会在 `apply` 之前套用它。 */
  const Config = z.object({
    allowSubagents: z.boolean().default(DEFAULT_ALLOW_SUBAGENTS),
  })

  // 测试接缝：闸门内核与判定函数一并导出。测试跑在**构建产物**上（`lib/gate.js`），因为
  // 源码里的 `./x.js` 说明符在 Node 下解析不到同名 `.ts`；而这两件东西正是「串行」与
  // 「挡子智能体」两条保证的载体，必须在产物上可验证。
  /** 已解析的配置。 */
                      
                           
   

  /**
   * 套用插件：把闸门接到 `tools/pre-execute` 瀑布上。
   *
   * 只订阅、不注册工具：工具仍由各自提供方注册，这里只拦调用。
   *
   * @param ctx - 宿主 context（`agents` 已就绪）。
   * @param config - 已解析配置。
   */
  function apply(ctx         , config          )       {
    const core = new BrowserGateCore(
      { allowSubagents: config.allowSubagents === true },
      ownershipFrom(ctx.get('agents')),
    )

    ctx.on('tools/pre-execute', async (exec, next) => {
      if (!core.handles(exec.name)) return next()
      return core.intercept(exec, () => next())
    })
  }
  return {
    name,
    inject,
    DEFAULT_ALLOW_SUBAGENTS,
    Config,
    apply,
    z,
    BrowserGateCore,
    ownershipFrom,
  }
})()

// ── 入口模块的导出（cordis 读取 name / inject / apply 与 Config） ──────────
export const name = H4.name
export const inject = H4.inject
export const apply = H4.apply
export const Config = H4.Config
export const BrowserGateCore = H4.BrowserGateCore
export const ownershipFrom = H4.ownershipFrom
