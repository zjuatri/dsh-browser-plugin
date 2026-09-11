/**
 * 会话浏览器注册表：**一个会话一只 Chrome、一份独立 profile**。
 *
 * 为什么按会话分：此前所有对话共用一只 Chrome，于是 A 对话里登录过的东西，B 对话接着
 * 就能用 —— 登录态是隐式共享的全局状态，而会话之间本该互不可见。共用的另一个后果是
 * 跨会话争用：两个对话同时驱动会互相抢导航、互相覆盖表单，`browser_read` 读到的可能是
 * 对方刚翻到的页面（静默的错误答案）。分到每个会话之后，这两个问题一起消失：各自一只
 * Chrome、各自一把锁（见 `browser-queue.ts`）。
 *
 * 键就是会话 id，两侧用的是同一个值：工具侧取 `exec.agent.id`，视图侧取槽位框架注入
 * 的 `sessionId`（实测二者完全一致）。拿不到 id 时落到 {@link DEFAULT_SESSION_KEY}：
 * 无视图的无头/TUI 组合、以及没有 agent 上下文的调用都走它，用临时 profile，不落盘。
 *
 * 生命周期：`idleTimeoutMs` 内既没有视图在看、也没有调用在跑，就把这只 Chrome 关掉
 * （profile 留在磁盘上，下次这个会话再用时重新拉起，登录态还在）；同时最多保留
 * `maxBrowsers` 只，超出时先关最久未用的空闲那只。插件卸载时全部关掉。
 *
 * @module dsh-browser-plugin/src/browser-sessions
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { BrowserQueue } from './browser-queue.js'
import { BrowserRuntime } from './browser.js'
import type { ResolvedConfig } from './config.js'
import type { PaneStream } from './pane-stream.js'
import type { AgentOwnership, BrowserGate, BrowserGateway } from './tool-session.js'

/** 拿不到会话 id 时用的键（无名会话：临时 profile，不落盘）。 */
export const DEFAULT_SESSION_KEY = ''

/** 共享模式下所有会话共用的键（`isolation: 'shared'`）。 */
export const SHARED_SESSION_KEY = 'shared'

/** 空闲检查的间隔（毫秒）；比 `idleTimeoutMs` 小得多，关掉只会晚一个间隔。 */
const SWEEP_INTERVAL_MS = 60_000

/** 默认 profile 父目录（`userDataDir` 留空时）。 */
const DEFAULT_PROFILE_ROOT = join(homedir(), '.dsh', 'browser-profiles')

/** 一个会话的浏览器：运行时、它自己的锁、以及它自己的实时视图。 */
export interface SessionBrowser {
  /** 会话 id（无名会话为 `''`）。 */
  readonly key: string
  /** 这只 Chrome 的运行时。 */
  readonly runtime: BrowserRuntime
  /** 这只 Chrome 的串行锁：该会话的工具调用与视图操作共用。 */
  readonly queue: BrowserQueue
  /** 该会话的实时视图控制器；没有 Web 服务器（或无头组合）时为 undefined。 */
  stream: PaneStream | undefined
  /** 这只 Chrome 使用的 profile 目录；null = 临时 profile，关闭即清。 */
  readonly profileDir: string | null
  /** 最近一次被用到（工具调用或视图接入），空闲回收的依据。 */
  lastUsed: number
}

/** 把会话 id 变成安全的目录名（Windows 不允许的字符一律换成 `_`）。 */
function safeSegment(sessionId: string): string {
  return sessionId.replace(/[^A-Za-z0-9._-]/gu, '_').slice(0, 80)
}

/** 按会话管理浏览器的注册表。 */
export class BrowserSessions implements BrowserGateway {
  /** 是否允许子智能体驱动浏览器（工具侧闸门用）。 */
  readonly allowSubagents: boolean
  /** 宿主 agent 注册表；缺失时跳过子智能体判定。 */
  readonly ownership: AgentOwnership | undefined
  private readonly entries = new Map<string, SessionBrowser>()
  private readonly config: ResolvedConfig
  private timer: ReturnType<typeof setInterval> | null = null

  /**
   * @param config - 已解析的插件配置（隔离粒度、profile 位置、上限与空闲窗口）。
   * @param ownership - 子智能体判定；`ctx.agents` 缺失时传 undefined。
   */
  constructor(config: ResolvedConfig, ownership?: AgentOwnership) {
    this.config = config
    this.allowSubagents = config.allowSubagents
    this.ownership = ownership
    if (config.idleTimeoutMs > 0) {
      this.timer = setInterval(() => { void this.sweep() }, SWEEP_INTERVAL_MS)
      // 定时器不该拖着进程不放（测试与宿主退出都受益）。
      this.timer.unref?.()
    }
  }

  /** 当前保活的浏览器数量。 */
  get size(): number {
    return this.entries.size
  }

  /** 当前保活的会话键（诊断与测试用）。 */
  keys(): string[] {
    return [...this.entries.keys()]
  }

  /**
   * 取一个会话的浏览器，没有就地建一个（**只建对象，不启动 Chrome** —— Chrome 在第一次
   * 真正用它时懒启动）。
   *
   * @param sessionId - 会话 id；null/undefined 落到无名键。
   * @returns 该会话的浏览器记录。
   */
  forSession(sessionId: string | null | undefined): SessionBrowser {
    const key = this.keyOf(sessionId)
    const existing = this.entries.get(key)
    if (existing !== undefined) {
      existing.lastUsed = Date.now()
      return existing
    }
    const profileDir = this.profileDirFor(key)
    const entry: SessionBrowser = {
      key,
      // 每个会话一份配置：`userDataDir` 换成该会话自己的目录（null = 临时 profile）。
      runtime: new BrowserRuntime({ ...this.config, userDataDir: profileDir ?? '' }),
      queue: new BrowserQueue(),
      stream: undefined,
      profileDir,
      lastUsed: Date.now(),
    }
    this.entries.set(key, entry)
    return entry
  }

  /** 取某个会话的闸门（该会话自己的锁 + 驱动者上报）。 */
  gateFor(sessionId: string | null): BrowserGate {
    const entry = this.forSession(sessionId)
    return {
      queue: entry.queue,
      onDriver: (driver) => { entry.stream?.noteDriver(driver) },
    }
  }

  /** 取某个会话的浏览器运行时（工具真正操作的对象）。 */
  runtimeFor(sessionId: string | null): BrowserRuntime {
    return this.forSession(sessionId).runtime
  }

  /**
   * 关掉一个会话的浏览器。正在跑调用或有视图看着时不动它（那是用户正在用的东西）。
   *
   * @param entry - 目标会话。
   * @returns 是否真的关掉了。
   */
  async close(entry: SessionBrowser): Promise<boolean> {
    if (entry.queue.busy || entry.queue.depth > 0) return false
    if (entry.stream?.watching === true) return false
    if (this.entries.get(entry.key) !== entry) return false
    this.entries.delete(entry.key)
    entry.stream?.dispose()
    entry.queue.dispose()
    await entry.runtime.close().catch(() => {})
    return true
  }

  /**
   * 一轮空闲回收与上限收敛。可反复调用（幂等）。
   *
   * 顺序：先按空闲窗口关掉超时的，再在上限仍然超出时关掉最久未用的空闲会话。两轮都只
   * 动「没人在用」的会话，因此不会把用户正看着的画面或正在跑的调用掐掉。
   */
  async sweep(): Promise<void> {
    const now = Date.now()
    const idle: SessionBrowser[] = []
    for (const entry of this.entries.values()) {
      if (entry.queue.busy || entry.queue.depth > 0) continue
      if (entry.stream?.watching === true) continue
      idle.push(entry)
    }
    const expired = this.config.idleTimeoutMs > 0
      ? idle.filter(entry => now - entry.lastUsed >= this.config.idleTimeoutMs)
      : []
    for (const entry of expired) await this.close(entry)
    // 上限是软目标：没有空闲会话可关时宁可暂时超一点，也不掐掉正在用的浏览器。
    let excess = this.entries.size - this.config.maxBrowsers
    if (excess <= 0) return
    const byAge = idle
      .filter(entry => this.entries.get(entry.key) === entry)
      .sort((left, right) => left.lastUsed - right.lastUsed)
    for (const entry of byAge) {
      if (excess <= 0) return
      if (await this.close(entry)) excess--
    }
  }

  /** 彻底拆除：停掉回收定时器，关掉所有会话的浏览器。 */
  async dispose(): Promise<void> {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
    const all = [...this.entries.values()]
    this.entries.clear()
    for (const entry of all) {
      entry.stream?.dispose()
      entry.queue.dispose()
    }
    await Promise.all(all.map(entry => entry.runtime.close().catch(() => {})))
  }

  /** 这个会话在注册表里的键：共享模式下所有会话同一个键（于是只有一只 Chrome）。 */
  private keyOf(sessionId: string | null | undefined): string {
    if (this.config.isolation === 'shared') return SHARED_SESSION_KEY
    if (sessionId === null || sessionId === undefined || sessionId === '') return DEFAULT_SESSION_KEY
    return sessionId
  }

  /** 这个会话的 profile 目录；null = 临时 profile（无名会话，或共享模式且没配目录）。 */
  private profileDirFor(key: string): string | null {
    if (this.config.isolation === 'shared') {
      return this.config.userDataDir === '' ? null : this.config.userDataDir
    }
    if (key === DEFAULT_SESSION_KEY) return null
    const base = this.config.userDataDir !== '' ? this.config.userDataDir : DEFAULT_PROFILE_ROOT
    return join(base, safeSegment(key))
  }
}
