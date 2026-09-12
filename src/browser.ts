/** 视图要求的最小视口边长（CSS 像素）：再小页面就没有可用布局宽度了。 */
export const MIN_VIEWPORT_WIDTH = 320
export const MIN_VIEWPORT_HEIGHT = 240
/** 视图要求的最大视口边长（CSS 像素）：挡住病态尺寸让渲染进程白烧 CPU。 */
export const MAX_VIEWPORT_SIDE = 4096
/**
 * 抓帧的最大设备边长（像素）。
 *
 * 倍率是乘在 CSS 尺寸上的，所以 2 倍档会让 4096 的视口变成 8192 的帧。这里给设备侧
 * 单独设一条上限：超了就降倍率（见 `setViewport`），而不是让一帧大到编不动。
 */
export const MAX_DEVICE_SIDE = 4096

/** 把一个视口边长夹到合法范围；非有限值退回下限。 */
function clampViewport(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

/**
 * 无头 Chrome 运行时：页面与标签页操作部分。
 *
 * 一个懒启动的 Puppeteer（puppeteer-core）浏览器加一个共享页面，服务于
 * `browser_* 系列工具。Chrome 作为独立的操作系统进程运行（由本 Node 运行时通过
 * puppeteer-core 拉起），因此浏览器崩溃不会拖垮 harness —— `disconnected` 事件
 * 只会清空缓存的句柄，下一次调用会重新启动。
 *
 * 浏览器生命周期（启动 / 隐身启动 / 连接 / 模式切换）在 `browser-launch.ts` 中
 * 实现，并以接口合并的方式并入本类。实例状态与构造器在那边声明。
 *
 * @module dsh-browser-plugin/src/browser
 */

import type { Page, Target } from 'puppeteer-core'
import type { JsonValue } from '@deepseek-ai/dsh-tools'
import type { BrowserMode, GotoResult, HistoryResult, ScreenshotResult, TabInfo } from './browser-types.js'
import { resolveDevtoolsFrontendUrl } from './devtools.js'
import { pageLinks, pageToText, readText } from './extract.js'
import { normalizeUrl } from './url.js'
import { BrowserRuntime as BrowserRuntimeBase } from './browser-launch.js'

/** 浏览器生命周期成员（实现见 browser-launch.ts）。 */
export interface BrowserRuntime {
  /** 实时切换浏览器模式。 */
  switchMode(mode: BrowserMode): Promise<TabInfo[]>
}

/**
 * 无头浏览器运行时。每个插件 fiber 一个实例；`close()` 就是插件让出的拆除函数，
 * 卸载时会关掉 Chrome。
 *
 * 会话模型：任意多个标签页，其中一个处于活动状态。智能体工具永远作用于**活动**
 * 标签页；视图镜像它，并且自己也能切换标签页。弹窗与 `target=_blank` 链接会作为
 * 新标签页打开（terminal-browser 的“弹窗即标签页”模型）。
 *
 * 两种模式：`own` 用普通 puppeteer 启动一个无头（或按配置有界面）的 Chrome；
 * `stealth` 同样由本插件拉起，但去掉自动化参数并使用持久 profile，让反爬墙看到的
 * 会话真实得多。两种模式的浏览器都由本插件持有，拆除时一律关掉。模式可实时切换。
 */
export class BrowserRuntime extends BrowserRuntimeBase {
  /** 某个 target 是否属于我们自己的标签页。 */
  private isSharedTarget(target: Target): boolean {
    if (this.targets.includes(target)) return true
    return this.pages.some(page => !page.isClosed() && page.target() === target)
  }

  /** 丢弃已关闭的标签页。 */
  protected prune(): void {
    let removed = false
    for (let i = this.pages.length - 1; i >= 0; i--) {
      if (this.pages[i].isClosed()) {
        this.pages.splice(i, 1)
        this.targets.splice(i, 1)
        removed = true
      }
    }
    if (this.pages.length === 0) {
      this.active = 0
      return
    }
    if (this.active >= this.pages.length) this.active = this.pages.length - 1
    if (removed) this.notifyTabs()
  }

  /** 记下一个外部页面 target，并立即尝试接管。 */
  protected trackForeignTarget(target: Target): void {
    if (target.type() !== 'page') return
    if (this.isSharedTarget(target)) return
    this.foreignTargets.add(target)
    void this.foldTarget(target)
  }

  /**
   * 把一个外部页面 target 接管为新标签页。空白 target 永远不会被关掉 ——
   * `window.open` 在首次导航前是以 `about:blank` 出现的，而我们自己的页面在创建
   * 过程中也同样会经过 `targetcreated`。空白 target 会等待 `targetchanged`。
   */
  protected async foldTarget(target: Target): Promise<void> {
    // 重新核对身份：等一个创建时还是空白的 target 触发 targetchanged 时，它可能
    // 已经是我们自己的页面了（在创建事件之后才被记录）。
    if (this.isSharedTarget(target)) {
      this.foreignTargets.delete(target)
      return
    }
    let url: string
    try {
      url = target.url()
    } catch {
      this.foreignTargets.delete(target)
      return // target 在我们检查之前就消失了
    }
    if (!url || url === 'about:blank') return // 等待 targetchanged
    this.foreignTargets.delete(target)
    const page = await target.page().catch(() => null)
    if (!page) return
    if (url.startsWith('chrome://') || url.startsWith('devtools://')) {
      void page.close().catch(() => {})
      return
    }
    await this.setupPage(page, this.mode === 'own')
    this.pages.push(page)
    this.targets.push(target)
    this.active = this.pages.length - 1
    this.notifyTabs()
  }

  /** 新建一个标签页页面，追加并激活它。 */
  private async createPage(): Promise<Page> {
    const browser = await this.ensureBrowser()
    const page = await browser.newPage()
    await this.setupPage(page, this.mode === 'own')
    const target = page.target()
    this.pages.push(page)
    this.targets.push(target)
    this.active = this.pages.length - 1
    this.foreignTargets.delete(target)
    this.notifyTabs()
    return page
  }

  /** 懒创建（或复用）**活动**标签页的页面。 */
  private async ensurePage(): Promise<Page> {
    this.prune()
    const current = this.pages[this.active]
    if (current && !current.isClosed()) return current
    return this.createPage()
  }

  /** 活动标签页的页面，首次使用时会启动 Chrome —— 供视图/画面流消费者使用。 */
  async sharedPage(): Promise<Page> {
    return this.ensurePage()
  }

  /**
   * 活动标签页的页面，**不**启动任何东西：没有页面时返回 null。
   *
   * 与 `sharedPage()` 的区别正是这一点 —— 有些操作用户只是「看一眼现状」，不该顺手把
   * 一只 Chrome 拉起来（例如右键要的开发者工具）。
   */
  activePage(): Page | null {
    this.prune()
    const current = this.pages[this.active]
    return current === undefined || current.isClosed() ? null : current
  }

  /**
   * 「在当前浏览器里打开这一页的开发者工具」所需的地址。
   *
   * 视图是另一只 Chrome 的 JPEG 流，右键只能拿到宿主浏览器自己的 DevTools；真正的入口是
   * 调试端口给出的 DevTools 前端地址（见 `devtools.ts`）。这里只负责把它取出来 ——
   * 打不打开由调用方决定。
   *
   * @returns 可在宿主机浏览器里打开的地址。
   * @throws 该会话还没有活动页，或调试端口不可达／没给出前端地址时抛出可读错误。
   */
  async devtoolsFrontendUrl(): Promise<string> {
    const page = this.activePage()
    if (page === null) throw new Error('这个会话的浏览器还没有打开任何页面')
    return await resolveDevtoolsFrontendUrl(page, this.browser?.wsEndpoint() ?? null)
  }

  /**
   * 把共享页面的视口设成给定尺寸，并按给定倍率抓帧。
   *
   * 实时视图在侧边栏里量出自己的可用区域后把尺寸发过来，于是画面与面板同比例：
   * 既不出现上下留白，页面也不会被等比缩小到读不清。面板是窄栏时，站点收到的是
   * 一个真实存在的窄视口 —— 它会自己切到窄屏布局，而不是被压扁。
   *
   * 尺寸在这里就被夹到合法范围，不依赖调用方守规矩：路由是网络边界，任何一块都
   * 可能送来荒谬的数字。小于 1 的尺寸会让 CDP 直接报错。
   *
   * @param width - 目标视口宽度（CSS 像素）。
   * @param height - 目标视口高度（CSS 像素）。
   * @param deviceScaleFactor - 抓帧倍率（1 = 每 CSS 像素一个点，2 = 每物理像素一个点）。
   * @returns 实际生效的尺寸（CSS 像素）。
   */
  async setViewport(
    width: number,
    height: number,
    deviceScaleFactor = 1,
  ): Promise<{ width: number; height: number }> {
    const size = {
      width: clampViewport(width, MIN_VIEWPORT_WIDTH, MAX_VIEWPORT_SIDE),
      height: clampViewport(height, MIN_VIEWPORT_HEIGHT, MAX_VIEWPORT_SIDE),
    }
    // 倍率只取整数档，并且要保证设备边长不失控：2 倍叠在 4096 的 CSS 上限上会得到
    // 8192 的帧，那种帧既编不动也没人看得清 —— 宁可退回 1 倍。取整而不是取小数，是
    // 因为非整数倍会让源像素落不到整数栅格上，笔画粗细不匀，比干净的 2 倍更难看。
    const widest = Math.max(size.width, size.height)
    const scale = Math.max(1, Math.min(Math.round(deviceScaleFactor), Math.floor(MAX_DEVICE_SIDE / widest)))
    this.viewportOverride = { ...size, deviceScaleFactor: scale }
    const page = await this.ensurePage()
    await page.setViewport({ ...size, deviceScaleFactor: scale })
    return size
  }

  /**
   * 视图上次要求的视口尺寸与抓帧倍率；没有视图接管时为空。
   *
   * 倍率也一并给出，因为「尺寸没变」并不等于「不用重新应用」：画质档换了而面板大小没变
   * 时，视口要按新倍率重设一次，调用方得能看出这一点。
   */
  viewportSize(): { width: number; height: number; deviceScaleFactor: number } | null {
    return this.viewportOverride
  }

  /** 标签页列表（永不为空：最后一个标签页不会被留着关闭）。 */
  async tabs(): Promise<TabInfo[]> {
    this.prune()
    if (this.pages.length === 0) await this.createPage()
    const rows: TabInfo[] = []
    for (let index = 0; index < this.pages.length; index++) {
      const page = this.pages[index]
      rows.push({
        index,
        url: page.url(),
        title: await page.title().catch(() => ''),
        active: index === this.active,
      })
    }
    return rows
  }

  /** 新开一个标签页（给了 URL 就顺带导航过去）并激活它。 */
  async openTab(rawUrl?: string): Promise<TabInfo[]> {
    await this.createPage()
    if (rawUrl && rawUrl.trim() !== '') {
      await this.goto(rawUrl)
    }
    return this.tabs()
  }

  /** 激活指定下标的标签页。 */
  async switchTab(index: number): Promise<TabInfo[]> {
    this.prune()
    if (!Number.isInteger(index) || index < 0 || index >= this.pages.length) {
      throw new Error(`没有下标为 ${index} 的标签页`)
    }
    if (this.active !== index) {
      this.active = index
      this.notifyTabs()
    }
    return this.tabs()
  }

  /** 关闭指定下标的标签页（最后一个会被一个新的空白页替换）。 */
  async closeTab(index: number): Promise<TabInfo[]> {
    this.prune()
    if (!Number.isInteger(index) || index < 0 || index >= this.pages.length) {
      throw new Error(`没有下标为 ${index} 的标签页`)
    }
    const page = this.pages[index]
    this.pages.splice(index, 1)
    this.targets.splice(index, 1)
    void page.close().catch(() => {})
    if (this.pages.length === 0) {
      await this.createPage()
      return this.tabs()
    }
    if (index === this.active) {
      this.active = Math.min(index, this.pages.length - 1)
    } else if (index < this.active) {
      this.active -= 1
    }
    this.notifyTabs()
    return this.tabs()
  }

  /** 导航共享页面并给出摘要。 */
  async goto(rawUrl: string): Promise<GotoResult> {
    const url = normalizeUrl(rawUrl)
    const page = await this.ensurePage()
    let response = null
    try {
      response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.config.navTimeoutMs })
    } catch (error) {
      // 冷启动竞态：全新浏览器里的第一次导航可能触发 puppeteer 的超时看门狗，
      // 即便页面其实已经提交并加载完成。若页面已不再是空白且有了真实 URL，就优雅
      // 恢复，而不是抛出这个假超时错误。
      const currentUrl = page.url()
      const settled = currentUrl && currentUrl !== 'about:blank' && currentUrl !== ''
      if (!settled) throw error
    }
    const title = await page.title()
    const text = await pageToText(page)
    const links = await pageLinks(page)
    const finalUrl = page.url()
    // 标签页的标题/地址跟着这次导航变了：不通知的话，侧边栏标签条上还挂着上一页的名字，
    // 直到用户自己去切标签页才纠正。
    this.notifyTabs()
    return {
      url,
      finalUrl,
      status: response ? response.status() : null,
      title,
      text,
      links,
    }
  }

  /** 在页面里求值一段脚本并返回 JSON 安全的值。 */
  async evaluate(expression: string): Promise<JsonValue> {
    // 工具 schema 已把 `expression` 声明为字符串；这里只需运行时校验非空。
    if (!expression.trim()) {
      throw new Error('evaluate 需要一个非空表达式')
    }
    const page = await this.ensurePage()
    const value = await page.evaluate(expression)
    try {
      // 安全性：JSON 往返会把值物化成纯 JSON；其中的不可序列化内容会在此坍缩，
      // 而这正是本方法承诺的 JsonValue 取值域。
      return JSON.parse(JSON.stringify(value)) as JsonValue
    } catch {
      return String(value)
    }
  }

  /** 把页面截成 PNG/JPEG 的 data URL。 */
  async screenshot(options: { fullPage?: boolean; type?: string; quality?: number } = {}): Promise<ScreenshotResult> {
    const page = await this.ensurePage()
    const type = options.type === 'jpeg' ? 'jpeg' : 'png'
    const buf = await page.screenshot({
      fullPage: Boolean(options.fullPage),
      type,
      quality: options.quality,
    })
    const mime = type === 'jpeg' ? 'image/jpeg' : 'image/png'
    const b64 = Buffer.from(buf).toString('base64')
    return { dataUrl: `data:${mime};base64,${b64}`, mime, bytes: buf.length }
  }

  /** 在共享页面的历史里后退（无历史时返回无效结果而不是抛错）。 */
  async back(): Promise<HistoryResult> {
    const page = await this.ensurePage()
    try {
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: this.config.navTimeoutMs })
      return { ok: true, url: page.url() }
    } catch (error) {
      return { ok: false, url: page.url(), message: error instanceof Error ? error.message : String(error) }
    }
  }

  /** 在共享页面的历史里前进。 */
  async forward(): Promise<HistoryResult> {
    const page = await this.ensurePage()
    try {
      await page.goForward({ waitUntil: 'domcontentloaded', timeout: this.config.navTimeoutMs })
      return { ok: true, url: page.url() }
    } catch (error) {
      return { ok: false, url: page.url(), message: error instanceof Error ? error.message : String(error) }
    }
  }

  /** 刷新共享页面。 */
  async reload(): Promise<HistoryResult> {
    const page = await this.ensurePage()
    try {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: this.config.navTimeoutMs })
      return { ok: true, url: page.url() }
    } catch (error) {
      return { ok: false, url: page.url(), message: error instanceof Error ? error.message : String(error) }
    }
  }

  /** 点击第一个匹配该 CSS 选择器的元素。 */
  async click(selector: string): Promise<{ ok: boolean; tag: string; text: string; message?: string }> {
    const page = await this.ensurePage()
    const handle = await page.$(selector).catch(() => null)
    if (!handle) {
      return { ok: false, tag: '', text: '', message: `没有匹配 "${selector}" 的元素` }
    }
    try {
      // 点击**之前**读取元素信息：点击本身可能触发导航，而导航会销毁点击后再读
      // 所需的执行上下文。
      const info = await handle.evaluate((el) => ({
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || '').trim().slice(0, 200),
      }))
      await handle.click()
      return { ok: true, tag: info.tag, text: info.text }
    } catch (error) {
      return { ok: false, tag: '', text: '', message: error instanceof Error ? error.message : String(error) }
    } finally {
      await handle.dispose().catch(() => {})
    }
  }

  /** 往第一个匹配该 CSS 选择器的元素里输入文字（真实按键事件）。 */
  async type(selector: string, text: string): Promise<{ ok: boolean; value: string; message?: string }> {
    const page = await this.ensurePage()
    try {
      await page.type(selector, text, { delay: 0 })
      const value = await page.$eval(selector, (el) => {
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
          return el.value
        }
        return (el.textContent || '').slice(0, 200)
      })
      return { ok: true, value: value.slice(0, 200) }
    } catch (error) {
      return { ok: false, value: '', message: error instanceof Error ? error.message : String(error) }
    }
  }

  /** 读取某个选择器的 innerText（默认整页 body）。 */
  async read(selector?: string): Promise<{ text: string; count: number }> {
    const page = await this.ensurePage()
    return readText(page, selector)
  }

  /** 等待某个选择器出现，然后返回它的文字。 */
  async waitFor(selector: string, timeoutMs: number): Promise<{ found: boolean; text: string }> {
    const page = await this.ensurePage()
    const handle = await page.waitForSelector(selector, { timeout: timeoutMs }).catch(() => null)
    if (!handle) return { found: false, text: '' }
    const text = await handle.evaluate(el => el.textContent || '').catch(() => '')
    await handle.dispose().catch(() => {})
    return { found: true, text: text.trim().slice(0, 2000) }
  }

  /**
   * 页面精简版无障碍树（角色/名称/取值行）。AX 树正是屏幕阅读器消费的东西 ——
   * 对智能体来说，它比直接翻 DOM 稳定得多。
   */
  async a11yTree(maxNodes = 400): Promise<Array<{ role: string; name: string; value: string }>> {
    const page = await this.ensurePage()
    const session = await page.createCDPSession()
    try {
      const { nodes } = await session.send('Accessibility.getFullAXTree')
      return nodes
        .filter(node => (node.role?.value ?? '') !== '' || (node.name?.value ?? '') !== '')
        .map(node => ({
          role: node.role?.value ?? '',
          name: node.name?.value ?? '',
          value: node.value?.value ?? '',
        }))
        .slice(0, maxNodes)
    } finally {
      await session.detach().catch(() => {})
    }
  }

  /** 拆除浏览器。可安全地多次调用。 */
  async close(): Promise<void> {
    // 作废任何还在启动中的实例：拆除之后它不该再把浏览器装回来（那会漏一个进程）。
    this.generation += 1
    for (const page of this.pages) {
      try {
        if (!page.isClosed()) await page.close()
      } catch { /* 忽略 */ }
    }
    this.pages = []
    this.targets = []
    this.active = 0
    this.foreignTargets.clear()
    try {
      if (this.browser) await this.browser.close()
    } catch { /* 忽略 */ }
    this.browser = null
    // 隐身子进程的兜底清理：CDP 关闭通常会让它优雅退出；卡住的子进程不能活得比
    // 插件 fiber 更久。
    const child = this.stealthChild
    this.stealthChild = null
    if (child && child.exitCode === null) {
      try {
        child.kill()
      } catch { /* 已经退出了 */ }
    }
  }
}

// `normalizeUrl` 与公共类型由本模块汇聚，`index.ts` 与 `tools.ts` 从一处取用即可。
export { normalizeUrl }
export type { BrowserMode, GotoResult, HistoryResult, ScreenshotResult, TabInfo }
