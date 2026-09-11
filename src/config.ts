/**
 * dsh-browser-plugin 配置（Schemastery `Config`）。
 *
 * 声明接口里每个字段都可选；schemastery 的 `Config` 为每一项提供默认值，cordis
 * 的插件加载器会在 `apply(ctx, config)` 之前校验 profile 里的原始配置。
 *
 * @module dsh-browser-plugin/src/config
 */

import z from '@deepseek-ai/schemastery'

/** 默认 Chrome/Chromium 可执行文件（Windows；可通过配置覆盖）。 */
export const DEFAULT_CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

/** 新页面的默认视口。 */
export const DEFAULT_VIEWPORT = { width: 1920, height: 1080 } as const

/** `page.goto` 导航超时（毫秒）。 */
export const DEFAULT_NAV_TIMEOUT_MS = 45_000

/** `page.setDefaultTimeout` —— 脚本/求值的通用超时（毫秒）。 */
export const DEFAULT_SCRIPT_TIMEOUT_MS = 20_000

/** 单个工具的执行超时（毫秒）。 */
export const DEFAULT_TOOL_TIMEOUT_MS = 60_000

/** 默认是否显示 Chrome 窗口：默认无头（不弹窗）。 */
export const DEFAULT_HEADED = false

/** 默认开启实时视图：只要 GUI 带有 Web 服务器就提供。 */
export const DEFAULT_PANE = true

/** 默认不允许子智能体驱动浏览器（共享登录态，委派出去的子 agent 不该碰）。 */
export const DEFAULT_ALLOW_SUBAGENTS = false

/** 视图路由等待串行队列的默认上限（毫秒）。 */
export const DEFAULT_QUEUE_TIMEOUT_MS = 30_000

/** 默认用户数据目录：留空 = 用默认位置（见 `userDataDir` 的说明）。 */
export const DEFAULT_USER_DATA_DIR = ''

/**
 * 默认按**会话隔离**：每个对话一只 Chrome、一份独立 profile。
 *
 * 这是「A 对话登录过的东西 B 对话不该顺手就能用」的直接答案。代价写在
 * `browser-sessions.ts` 里：每会话一个进程、每个会话各自登录一次。
 */
export const DEFAULT_ISOLATION = 'session'

/** 同时最多保留几只 Chrome（超出时先关最久未用的空闲那只）。 */
export const DEFAULT_MAX_BROWSERS = 4

/** 一个会话的浏览器空闲多久就关掉（毫秒）：没有视图在看、也没有调用在跑。 */
export const DEFAULT_IDLE_TIMEOUT_MS = 10 * 60 * 1000

/** 隔离粒度。 */
export type Isolation = 'session' | 'shared'

/** 配置中接受的视口形状。 */
export interface Viewport {
  width: number
  height: number
}

/** 插件配置面（声明接口；默认值来自 `Config`）。 */
export interface Config {
  /** Chrome/Chromium 可执行文件的绝对路径。默认：Windows 上的系统 Chrome。 */
  chromePath?: string
  /** 应用于新页面的默认视口。默认 1920x1080。 */
  viewport?: Viewport
  /** `page.goto` 导航超时（毫秒）。默认 45000。 */
  navTimeoutMs?: number
  /** `page.setDefaultTimeout`（脚本/求值通用超时，毫秒）。默认 20000。 */
  scriptTimeoutMs?: number
  /** 单个工具的执行超时（毫秒）。默认 60000。 */
  timeoutMs?: number
  /**
   * 是否启动一个可见的 Chrome 窗口，而不是无头运行。该窗口就是智能体工具所驱动
   * 的同一个共享页面，因此它同时充当浏览过程的实时视图。默认 false（无头）。
   */
  headed?: boolean
  /**
   * 只要当前组合带有 Web 服务器，就提供实时浏览器视图（右侧边栏标签页 +
   * SSE 画面流 + 合成鼠标/键盘输入 + 地址栏）。默认 true；设为 false 可关闭。
   */
  pane?: boolean
  /**
   * Chrome 用户数据目录。
   *
   * - 共享模式（`isolation: 'shared'`）：就是它本身；留空 = 每次启动用全新的临时
   *   profile，什么都不保留。
   * - 按会话隔离（默认）：它是**各会话子目录的父目录**（每个会话用
   *   `<它>/<sessionId>`）；留空 = 默认 `~/.dsh/browser-profiles`。
   *
   * 无论哪种模式，填绝对路径都会让 Cookie、登录态与 localStorage 跨启动保留。
   */
  userDataDir?: string
  /**
   * 浏览器归属：`session`（默认）每个会话一只 Chrome 与一份独立 profile；`shared`
   * 全部会话共用一只（旧行为）。
   *
   * 隔离的代价：每会话一个 Chrome 进程（约 150–250MB），且**每个对话要各自登录一次**
   * —— 已有 profile 里的 Cookie 搬不过去（Chrome 的 App-Bound Encryption 会让拷贝
   * 过去的 Cookie 失效）。不需要隔离时可切回 `shared`。
   */
  isolation?: Isolation
  /** 同时最多保留几只 Chrome（默认 4）；超出时先关最久未用的空闲那只。 */
  maxBrowsers?: number
  /**
   * 一个会话的浏览器空闲多久就关掉（毫秒，默认 10 分钟）。
   *
   * 「空闲」= 没有视图连着看、队列里也没有调用在跑。关掉只是释放内存，profile 留在
   * 磁盘上，下次这个会话再用浏览器时重新拉起，登录态还在。
   */
  idleTimeoutMs?: number
  /**
   * 隐身模式：由本插件启动一个 **不带** puppeteer 自动化参数
   * （`--enable-automation`）的 Chrome，有界面、关闭 `AutomationControlled`、
   * 使用持久 profile —— 这样 `navigator.webdriver` 为 false，反爬墙（如 Cloudflare
   * Turnstile）看到的是一个真实得多的会话。成功率高于普通 puppeteer，但仍不是你
   * 本人的指纹。默认 false（普通 puppeteer 启动）。
   */
  stealth?: boolean
  /**
   * 是否允许 subagent / workflow 的子智能体驱动浏览器。默认 false。
   *
   * 所有会话共用**同一个** Chrome 与同一批登录态，而子 agent 背后的提示词可能来自
   * 别处（网络内容、被处理的文档），让它顺手操作主对话已登录的页面是这里最不该留的
   * 口子。需要时再显式打开。
   */
  allowSubagents?: boolean
  /**
   * 视图路由等待串行队列的上限（毫秒）。默认 30000。
   *
   * 浏览器同一时刻只有一个调用在跑（工具与视图共用一把锁）。人点击侧边栏时若智能体
   * 正占用，会排队等待；超过这个上限就返回「稍后重试」，而不是无限期挂住。工具侧不设
   * 这个上限，走的是调用方自己的 `exec.signal`。
   */
  queueTimeoutMs?: number
}

/** 带默认值的 schemastery 配置；cordis 会在 `apply` 之前套用它。 */
export const Config: z<Config> = z.object({
  chromePath: z.string().default(DEFAULT_CHROME_PATH),
  viewport: z.object({
    width: z.number().default(DEFAULT_VIEWPORT.width),
    height: z.number().default(DEFAULT_VIEWPORT.height),
  }).default(DEFAULT_VIEWPORT),
  navTimeoutMs: z.number().default(DEFAULT_NAV_TIMEOUT_MS),
  scriptTimeoutMs: z.number().default(DEFAULT_SCRIPT_TIMEOUT_MS),
  timeoutMs: z.number().default(DEFAULT_TOOL_TIMEOUT_MS),
  headed: z.boolean().default(DEFAULT_HEADED),
  pane: z.boolean().default(DEFAULT_PANE),
  userDataDir: z.string().default(DEFAULT_USER_DATA_DIR),
  isolation: z.union([z.const('session'), z.const('shared')]).default(DEFAULT_ISOLATION),
  maxBrowsers: z.number().default(DEFAULT_MAX_BROWSERS),
  idleTimeoutMs: z.number().default(DEFAULT_IDLE_TIMEOUT_MS),
  stealth: z.boolean().default(false),
  allowSubagents: z.boolean().default(DEFAULT_ALLOW_SUBAGENTS),
  queueTimeoutMs: z.number().default(DEFAULT_QUEUE_TIMEOUT_MS),
})

/** 套用默认值之后解析完成的配置。 */
export type ResolvedConfig = Required<Config>
