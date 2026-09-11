/**
 * `BrowserRuntime` 的浏览器生命周期部分：启动、隐身启动与模式切换。
 *
 * 实现按职责拆成两个文件（浏览器生命周期 / 页面与标签页操作），两部分都是同一个
 * 类的声明合并成员：本模块声明 `BrowserRuntime` 的私有状态与启动相关方法，
 * `browser.ts` 声明其余部分。这样每个文件都保持在 500 行以内，而运行时仍然只有
 * 一个类。
 *
 * @module dsh-browser-plugin/src/browser-launch
 */

import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Browser, LaunchOptions, Page, Target } from 'puppeteer-core'
import type { BrowserMode, TabInfo } from './browser-types.js'
import type { ResolvedConfig } from './config.js'

/** 模式切换后把地址带过去的等待上限（毫秒）；超过就让它继续在后台加载。 */
const CARRY_TIMEOUT_MS = 8000

/** 浏览器启动与连接（声明合并到 `BrowserRuntime`）。 */
export class BrowserRuntime {
  protected browser: Browser | null = null
  protected pages: Page[] = []
  protected targets: Target[] = []
  protected active = 0
  protected mode: BrowserMode = 'own'
  /** 隐身启动的子进程（拆除时的兜底清理目标）。 */
  protected stealthChild: import('node:child_process').ChildProcess | null = null
  /** 已发现但尚未归并的外部页面 target（空白页等待 URL 出现）。 */
  protected readonly foreignTargets = new Set<Target>()
  /** 标签页集合监听者（视图在切换标签时重启画面流）。 */
  protected readonly tabListeners = new Set<(tabs: TabInfo[]) => void>()
  /** 已解析的插件配置。 */
  protected readonly config: ResolvedConfig
  /**
   * 实时视图要求的视口尺寸。
   *
   * 视图接管后页面就按侧边栏的形状渲染，因此这个尺寸必须跨页留存：切换模式或标签
   * 页会新建页面，新页面得沿用同一个视口，否则画面会在两套比例之间跳一下。
   */
  protected viewportOverride: { width: number; height: number } | null = null
  /** 启动尝试的串行链（见 `ensureBrowser` 的说明）。 */
  private launchChain: Promise<void> = Promise.resolve()
  /** 浏览器世代：切换模式或拆除时递增，用来作废还在启动中的那一次。 */
  private generation = 0

  // 显式声明并赋值，而不用 TypeScript 的参数属性（`constructor(private x)`）：
  // 构建脚本依赖 Node 的 strip-only 类型剥离，而它不支持参数属性。
  constructor(config: ResolvedConfig) {
    this.config = config
    // `stealth` 配置决定启动时的初始模式；此后由视图上的模式切换按钮实时切换。
    this.mode = config.stealth ? 'stealth' : 'own'
  }

  /** 当前的浏览器模式。 */
  currentMode(): BrowserMode {
    return this.mode
  }

  /** 订阅标签页集合变化；返回取消订阅函数。 */
  onTabsChanged(listener: (tabs: TabInfo[]) => void): () => void {
    this.tabListeners.add(listener)
    return () => {
      this.tabListeners.delete(listener)
    }
  }

  /** 用最新快照通知标签页监听者（单个监听者出错不影响其余）。 */
  protected notifyTabs(): void {
    if (this.tabListeners.size === 0) return
    void this.tabs().then((tabs) => {
      for (const listener of this.tabListeners) {
        try {
          listener(tabs)
        } catch { /* 一个坏订阅者不能饿死其他订阅者 */ }
      }
    }).catch(() => {})
  }

  /**
   * 设置超时（以及我们自行创建的页面的视口）。
   *
   * `resize` 为 false 时不动视口：隐身的 Chrome 是我们**自己**拉起来的可见窗口，
   * 它的尺寸由 `--window-size` 决定，再叠一层 CDP 视口模拟只会让画面和窗口对不上。
   * 否则优先用实时视图要求的尺寸（这样新开的标签页一开始就是侧边栏的形状），没有
   * 视图时退回配置里的默认视口。
   */
  protected async setupPage(page: Page, resize: boolean): Promise<void> {
    page.setDefaultNavigationTimeout(this.config.navTimeoutMs)
    page.setDefaultTimeout(this.config.scriptTimeoutMs)
    if (resize) {
      const size = this.viewportOverride ?? this.config.viewport
      await page.setViewport({ width: size.width, height: size.height })
    }
  }

  /** 挂上共享的浏览器事件处理（启动与连接一视同仁）。 */
  protected wireBrowser(browser: Browser): void {
    browser.on('disconnected', () => {
      this.browser = null
      this.pages = []
      this.targets = []
      this.active = 0
      this.foreignTargets.clear()
    })
    browser.on('targetcreated', (target) => {
      this.trackForeignTarget(target)
    })
    browser.on('targetchanged', (target) => {
      if (this.foreignTargets.has(target)) void this.foldTarget(target)
    })
  }

  /** 启动本插件自己的 Chrome（`own` 模式：普通 puppeteer，默认无头）。 */
  protected async launchBrowser(): Promise<Browser> {
    const { launch } = await import('puppeteer-core')
    const cfg = this.config
    const headed = cfg.headed
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--mute-audio',
      // backgroundThrottling: false（参考模型）：被遮挡的有界面窗口仍须持续产出
      // 画面帧，而不是降频到静止。（puppeteer-core 对 Chrome 也默认带上这些参数；
      // 这里显式写出来，以便更换启动器后该保证依然成立。）
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      `--window-size=${cfg.viewport.width},${cfg.viewport.height}`,
    ]
    // 有界面模式保留 GPU，让可见窗口正常渲染。
    if (!headed) args.push('--disable-gpu')
    const launchOptions: LaunchOptions = {
      executablePath: cfg.chromePath,
      headless: !headed,
      pipe: false,
      dumpio: false,
      args,
      defaultViewport: { width: cfg.viewport.width, height: cfg.viewport.height },
    }
    if (cfg.userDataDir !== '') launchOptions.userDataDir = cfg.userDataDir
    const browser = await launch(launchOptions)
    this.wireBrowser(browser)
    return browser
  }

  /**
   * 隐身启动（`own` 模式 + `stealth: true`）：自己拼参数拉起 Chrome —— 不带
   * `--enable-automation`（于是 `navigator.webdriver` 保持 false）、有界面、关闭
   * `AutomationControlled`、持久 profile —— 然后通过 CDP 挂上去。Chrome 会把临时
   * 调试端口写进 profile 目录下的 `DevToolsActivePort` 文件；我们就是用
   * `--remote-debugging-port=0` 配合这个文件找到它的。
   */
  protected async launchStealthBrowser(): Promise<Browser> {
    const { spawn } = await import('node:child_process')
    const { connect } = await import('puppeteer-core')
    const cfg = this.config
    const profileDir = cfg.userDataDir !== ''
      ? cfg.userDataDir
      : join(homedir(), '.dsh', 'browser-stealth-profile')
    mkdirSync(profileDir, { recursive: true })
    // 残留的 DevToolsActivePort 属于上一次（可能被强杀的）实例；只有我们自己拉起的
    // 进程才允许写我们要读的那个文件。
    const portFile = join(profileDir, 'DevToolsActivePort')
    rmSync(portFile, { force: true })
    const args = [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--disable-blink-features=AutomationControlled',
      `--window-size=${cfg.viewport.width},${cfg.viewport.height}`,
      '--remote-debugging-port=0',
      `--user-data-dir=${profileDir}`,
      'about:blank',
    ]
    const child = spawn(cfg.chromePath, args, { stdio: 'ignore' })
    this.stealthChild = child
    child.on('exit', () => {
      if (this.stealthChild === child) this.stealthChild = null
    })
    // 调试服务器就绪后，Chrome 会在这里写下 `<port>\n<ws-path>`。
    let portLine = ''
    for (let attempt = 0; attempt < 100; attempt++) {
      if (existsSync(portFile)) {
        const content = readFileSync(portFile, 'utf8').trim()
        const lines = content.split(/\r?\n/)
        if (lines[0] && lines[0] !== '') {
          portLine = lines[0]
          break
        }
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (portLine === '') {
      this.stealthChild = null
      child.kill()
      throw new Error('隐身启动失败：Chrome 始终没有写出 DevToolsActivePort 文件')
    }
    // 交接检测：如果该 profile 已被另一个 Chrome 实例占用，我们拉起的进程会立刻
    // 退出（Chrome 把请求转交给已在运行的实例），于是刚读到的 DevToolsActivePort
    // 其实属于**那个**实例 —— 通常就是上一次进程遗留的孤儿插件 Chrome。连上去就会
    // 悄悄驱动错误的浏览器。
    if (child.exitCode !== null) {
      this.stealthChild = null
      throw new Error(
        `隐身启动失败：已有另一个 Chrome 实例正在使用 profile ${profileDir}`
        + '（拉起的进程立刻退出了）。请关掉那个实例（或清理残留的 chrome 进程）后重试。',
      )
    }
    const browser = await connect({ browserURL: `http://127.0.0.1:${portLine}` })
    this.wireBrowser(browser)
    return browser
  }

  /**
   * 确保当前模式对应一个可用的浏览器；幂等，且**并发安全**。
   *
   * 为什么不能只是「有就返回，没有就启动」：视图（SSE 一接入就开画面流）与工具调用是两个
   * 入口，都可能在「这个会话还没有浏览器」的同一刻动手 —— 而按会话隔离之后，每个会话都从
   * 「没有浏览器」开始，这个窗口比以前常见得多。两次同时启动同一个 profile 会被 Chrome
   * 拒绝（`The browser is already running for …`），而且第二次拉起的进程会把请求移交给第
   * 一个后立刻退出，连上它等于连到别人的实例。
   *
   * 因此启动尝试一律串行（`launchChain`），并带一个世代号：切换模式会递增它，把还在启动
   * 中的那一次作废，免得它在新模式生效后又把旧模式的浏览器装回来。
   */
  protected async ensureBrowser(): Promise<Browser> {
    if (this.browser && this.browser.connected) return this.browser
    const generation = this.generation
    const run = this.launchChain.then(() => this.launchOnce(generation))
    // 链上只保留「前一次已经结束」这个事实，不传播错误：一次失败的启动不该连累下一次。
    this.launchChain = run.then(() => {}, () => {})
    return run
  }

  /** 真正启动一次（只在 `launchChain` 里串行执行）。 */
  private async launchOnce(generation: number): Promise<Browser> {
    // 排队期间可能已经有人启动好了。
    if (this.browser && this.browser.connected) return this.browser
    this.assertCurrent(generation)
    const browser = this.mode === 'stealth'
      ? await this.launchStealthBrowser()
      : await this.launchBrowser()
    if (generation !== this.generation) {
      // 启动期间模式被切走（或插件被拆）：这只浏览器已经没有归属，关掉它。
      await browser.close().catch(() => {})
      throw new Error('浏览器已被切换，这只启动中的实例已作废')
    }
    this.browser = browser
    this.notifyTabs()
    return browser
  }

  /** 世代号对不上就说明这次启动已经被切换模式作废。 */
  private assertCurrent(generation: number): void {
    if (generation !== this.generation) throw new Error('浏览器已被切换，这只启动中的实例已作废')
  }

  /**
   * 实时切换浏览器模式。旧浏览器由本插件自己拉起（普通或隐身），所以一律关掉：
   * 换模式就是换一个浏览器实例。
   *
   * 换实例会丢掉标签页，但**不该丢掉「你在看的那一页」** —— 登录态本来就在 profile
   * 目录里（两种模式共用同一个目录），只有地址需要手工带一次：切换后在新浏览器里重新
   * 导航到旧地址。带不过去就留在空白页，这是体验优化，不会让切换失败。
   *
   * 新浏览器起不来时（Chrome 路径不对、隐身的 profile 被另一个实例占着……）把模式
   * 退回切换前的那个：`mode` 决定了 `ensureBrowser` 去拉哪种浏览器，留在那个拉不
   * 起来的模式上，之后每一次工具调用都会以同一个错误失败 —— 一次失败的模式切换
   * 不该把整个浏览器运行时永久钉死。
   */
  async switchMode(mode: BrowserMode): Promise<TabInfo[]> {
    if (mode === this.mode && this.browser?.connected) return this.tabs()
    const previous = this.mode
    const carry = this.carriedUrl()
    // 递增世代：任何还在启动中的实例就此作废（它会自己关掉，不会装回 `this.browser`）。
    this.generation += 1
    const browser = this.browser
    this.browser = null
    this.pages = []
    this.targets = []
    this.active = 0
    this.foreignTargets.clear()
    if (browser) {
      try {
        await browser.close()
      } catch { /* 尽力而为的拆除 */ }
    }
    const child = this.stealthChild
    this.stealthChild = null
    if (child && child.exitCode === null) {
      try {
        child.kill()
      } catch { /* 已经退出了 */ }
    }
    this.mode = mode
    try {
      await this.ensureBrowser()
    } catch (error) {
      this.mode = previous
      throw error
    }
    if (carry !== '') {
      // 用 `goto`（而不是直接 page.goto）是刻意的：它认识「全新浏览器里第一次导航
      // 触发的假超时」这种冷启动竞态。慢站点不该把切换本身拖住，所以加一个等待上限，
      // 超时后让它在后台接着加载 —— 画面流随后会把那一页推上来。
      const restore = this.goto(carry).catch(() => {})
      await Promise.race([
        restore,
        new Promise(resolve => { setTimeout(resolve, CARRY_TIMEOUT_MS) }),
      ])
    }
    return this.tabs()
  }

  /** 当前活动页的地址；空白页、浏览器内部页与空值一律返回空串（不值得带过去）。 */
  private carriedUrl(): string {
    const page = this.pages[this.active]
    if (page === undefined || page.isClosed()) return ''
    let url = ''
    try {
      url = page.url()
    } catch {
      return ''
    }
    if (url === '' || url === 'about:blank') return ''
    if (/^(about|chrome|devtools|chrome-extension):/iu.test(url)) return ''
    return url
  }

  // 以下成员在 browser.ts 的声明合并部分实现。
  /** 标签页集合（永不为空：最后一个标签页不会被关掉）。 */
  declare tabs: () => Promise<TabInfo[]>
  /** 关闭浏览器。可重复调用。 */
  declare close: () => Promise<void>
  /** 认领一个外部页面 target 并尝试立即接管。 */
  protected declare trackForeignTarget: (target: Target) => void
  /** 把一个外部页面 target 接管为新标签页。 */
  protected declare foldTarget: (target: Target) => Promise<void>
  /** 丢弃已关闭的标签页。 */
  protected declare prune: () => void
}
