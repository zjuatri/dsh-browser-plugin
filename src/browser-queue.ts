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
export class QueueAbortError extends Error {
  constructor(message = '浏览器调用已取消') {
    super(message)
    this.name = 'QueueAbortError'
  }
}

/** 一个在队列里等待的调用。 */
interface Waiter {
  label: string
  /** 拿到锁：参数是「把锁交给下一个」的函数。 */
  grant: (release: () => void) => void
  abort: (error: Error) => void
  /** 注销 abort 监听（授予或移除时都要调，避免监听器泄漏）。 */
  cleanup: () => void
}

/**
 * FIFO、可取消的互斥锁。
 *
 * 语义刻意做得很小：谁先到谁先用，锁在**释放的同一刻**移交给队首（同步移交，因此没有
 * 插队窗口），等待者可以带 `AbortSignal` 退出。
 */
export class BrowserQueue {
  private readonly waiting: Waiter[] = []
  private current: string | null = null
  private disposed = false

  /** 当前是否有调用持有浏览器。 */
  get busy(): boolean {
    return this.current !== null
  }

  /** 当前持有者的标签（工具名或路由名）；空闲时为 null。 */
  get holder(): string | null {
    return this.current
  }

  /** 正在排队等待的调用数（诊断与测试用）。 */
  get depth(): number {
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
  async run<T>(label: string, signal: AbortSignal | undefined, fn: () => Promise<T>): Promise<T> {
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
  dispose(): void {
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
  private acquire(label: string, signal: AbortSignal | undefined): Promise<() => void> {
    if (this.disposed) return Promise.reject(new QueueAbortError('浏览器插件已卸载'))
    if (signal?.aborted === true) return Promise.reject(new QueueAbortError('浏览器调用已取消'))

    if (this.current === null) {
      this.current = label
      return Promise.resolve(() => { this.handoff() })
    }

    return new Promise<() => void>((resolve, reject) => {
      const waiter: Waiter = {
        label,
        grant: resolve,
        abort: reject,
        cleanup: () => {},
      }
      if (signal !== undefined) {
        const onAbort = (): void => {
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
  private handoff(): void {
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
  private drop(waiter: Waiter): boolean {
    const at = this.waiting.indexOf(waiter)
    if (at < 0) return false
    this.waiting.splice(at, 1)
    waiter.cleanup()
    return true
  }
}
