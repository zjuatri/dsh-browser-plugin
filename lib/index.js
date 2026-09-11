//! 自动生成，请勿直接编辑 —— 由 scripts/build-host.mjs 从 src/*.ts 生成。
//!
//! profile 用 `file://` 行加载本文件（见 cordis.patch.yml），所以它必须是 Node 能
//! 直接 import 的 ESM：类型已剥离、相对 import 已内联、外部依赖在顶部导入一次。
import * as __ext_H1_0 from "@deepseek-ai/schemastery"
import * as __ext_H3_1 from "@deepseek-ai/dsh-tools"
import * as __ext_H4_2 from "node:fs"
import * as __ext_H4_3 from "node:path"
import * as __ext_H4_4 from "node:url"
import * as __ext_H7_5 from "node:os"

/** 外部依赖的取用口：ESM 命名空间对象即导入表。 */
const __external = (specifier) => {
  switch (specifier) {
    case "@deepseek-ai/dsh-tools": return __ext_H3_1
    case "node:fs": return __ext_H4_2
    case "node:path": return __ext_H4_3
    case "node:url": return __ext_H4_4
    case "node:os": return __ext_H7_5
    /* v8 ignore next -- 别名表由构建脚本生成，与上面的 import 一一对应 */
    default: throw new Error(`dsh-browser-plugin: 未声明外部依赖 ${specifier}`)
  }
}

/** 默认导入的取用口（对应 `import z from '…'`）。 */
const __externalDefault = (specifier) => {
  switch (specifier) {
    case "@deepseek-ai/schemastery": return __ext_H1_0.default
    /* v8 ignore next -- 同上 */
    default: throw new Error(`dsh-browser-plugin: 未声明外部依赖 ${specifier}`)
  }
}

// ── src/config.ts ──
const H1 = (() => {
  const z = __externalDefault("@deepseek-ai/schemastery")
  /**
   * dsh-browser-plugin 配置（Schemastery `Config`）。
   *
   * 声明接口里每个字段都可选；schemastery 的 `Config` 为每一项提供默认值，cordis
   * 的插件加载器会在 `apply(ctx, config)` 之前校验 profile 里的原始配置。
   *
   * @module dsh-browser-plugin/src/config
   */


  /** 默认 Chrome/Chromium 可执行文件（Windows；可通过配置覆盖）。 */
  const DEFAULT_CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

  /** 新页面的默认视口。 */
  const DEFAULT_VIEWPORT = { width: 1920, height: 1080 }         

  /** `page.goto` 导航超时（毫秒）。 */
  const DEFAULT_NAV_TIMEOUT_MS = 45_000

  /** `page.setDefaultTimeout` —— 脚本/求值的通用超时（毫秒）。 */
  const DEFAULT_SCRIPT_TIMEOUT_MS = 20_000

  /** 单个工具的执行超时（毫秒）。 */
  const DEFAULT_TOOL_TIMEOUT_MS = 60_000

  /** 默认是否显示 Chrome 窗口：默认无头（不弹窗）。 */
  const DEFAULT_HEADED = false

  /** 默认开启实时视图：只要 GUI 带有 Web 服务器就提供。 */
  const DEFAULT_PANE = true

  /** 默认不允许子智能体驱动浏览器（共享登录态，委派出去的子 agent 不该碰）。 */
  const DEFAULT_ALLOW_SUBAGENTS = false

  /** 视图路由等待串行队列的默认上限（毫秒）。 */
  const DEFAULT_QUEUE_TIMEOUT_MS = 30_000

  /** 默认用户数据目录：留空 = 用默认位置（见 `userDataDir` 的说明）。 */
  const DEFAULT_USER_DATA_DIR = ''

  /**
   * 默认按**会话隔离**：每个对话一只 Chrome、一份独立 profile。
   *
   * 这是「A 对话登录过的东西 B 对话不该顺手就能用」的直接答案。代价写在
   * `browser-sessions.ts` 里：每会话一个进程、每个会话各自登录一次。
   */
  const DEFAULT_ISOLATION = 'session'

  /** 同时最多保留几只 Chrome（超出时先关最久未用的空闲那只）。 */
  const DEFAULT_MAX_BROWSERS = 4

  /** 一个会话的浏览器空闲多久就关掉（毫秒）：没有视图在看、也没有调用在跑。 */
  const DEFAULT_IDLE_TIMEOUT_MS = 10 * 60 * 1000

  /** 隔离粒度。 */
                                              

  /** 配置中接受的视口形状。 */
                             
                 
                  
   

  /** 插件配置面（声明接口；默认值来自 `Config`）。 */
                           
                                                             
                       
                                    
                       
                                         
                         
                                                           
                            
                                  
                      
       
                                                
                                              
       
                    
       
                                            
                                                       
       
                  
       
                     
      
                                                          
                        
                                         
                                                              
      
                                                      
       
                        
       
                                                              
                     
      
                                                          
                                                                      
                                         
       
                         
                                                
                        
       
                                    
      
                                                   
                                  
       
                          
       
                                           
                                                                     
                                                                        
                                                      
                                       
       
                     
       
                                                    
      
                                                       
                                              
                   
       
                            
       
                                  
      
                                              
                                               
                                    
       
                           
   

  /** 带默认值的 schemastery 配置；cordis 会在 `apply` 之前套用它。 */
  const Config            = z.object({
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
  return {
    DEFAULT_CHROME_PATH,
    DEFAULT_VIEWPORT,
    DEFAULT_NAV_TIMEOUT_MS,
    DEFAULT_SCRIPT_TIMEOUT_MS,
    DEFAULT_TOOL_TIMEOUT_MS,
    DEFAULT_HEADED,
    DEFAULT_PANE,
    DEFAULT_ALLOW_SUBAGENTS,
    DEFAULT_QUEUE_TIMEOUT_MS,
    DEFAULT_USER_DATA_DIR,
    DEFAULT_ISOLATION,
    DEFAULT_MAX_BROWSERS,
    DEFAULT_IDLE_TIMEOUT_MS,
    Config,
    z,
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

// ── src/tools.ts ──
const H3 = (() => {
  const __ext_H3_1 = __external("@deepseek-ai/dsh-tools")
  const { defineTool } = __ext_H3_1
  const { gateTool } = H2
  /**
   * 浏览器工具：导航、结构化交互、历史、截图与无障碍 —— 十五个工具驱动**该会话的**
   * {@link BrowserRuntime}（每会话一只 Chrome，由 `browser-sessions.ts` 按 `exec.agent.id`
   * 分发）。结果是无损 JSON，`render` 把它投影成紧凑的文本卡片。
   *
   * 每个工具都经 `gateway` 包一层（子智能体策略 + 该会话的串行队列，见 `tool-session.ts`）；
   * 包装只替换 `execute`，参数、描述与输出 schema 一律透传，模型看到的工具面不变。
   * @module dsh-browser-plugin/src/tools
   */

                                                    
                                                                            
                                                          
                                                   
                                                    

  /** Register every browser tool against the per-session gateway; returns their disposers. */
  function registerBrowserTools(
    ctx         ,
    config                ,
    gateway                ,
  )                    {
    const disposers                    = []
    /**
     * 这次调用该作用于**哪个**浏览器：浏览器按会话隔离（`browser-sessions.ts`），因此每个
     * 工具都要在调用点上按 `exec.agent.id` 取一次，不能闭包捕获一只共享的 Chrome。
     */
    const at = (exec                )                 => gateway.runtimeFor(exec.agent?.id ?? null)

    /**
     * 注册一个工具：闸门在这里统一套上，工具定义本身只管业务。`defineTool` 把 `execute`
     * 标成可选（对手写定义放宽），而 `gateTool` 需要它必然存在 —— 注册点显式收窄一次。
     */
    const register = (definition                                )       => {
      disposers.push(ctx.tools.register(gateTool(definition, gateway)))
    }

    const goto = defineTool({
      name: 'browser_goto',
      description: 'Navigate this conversation\'s Chrome page to a URL and return a readable summary. '
        + 'Returns the requested url, final url (after redirects), HTTP status, page title, up to 6000 chars of extracted heading/paragraph/list text, and up to 25 links. '
        + 'The page persists between calls, so combine with the other browser tools to interact and verify.',
      parameters: {
        url: { type: 'string', required: true, description: 'URL to navigate to. Accepts full URLs, host-like input (https:// added; http:// for localhost), existing absolute/~ paths (file://), or free text (becomes a Google search).' },
      },
      timeoutMs: config.timeoutMs,
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            url: { type: 'string', required: true, description: 'The normalized requested URL.' },
            finalUrl: { type: 'string', required: true, description: 'The URL after navigation/redirects.' },
            status: { oneOf: [{ type: 'number' }, { type: 'null' }], required: true, description: 'HTTP response status, or null when no response (e.g. data: URL).' },
            title: { type: 'string', required: true },
            text: { type: 'string', required: true, description: 'Extracted heading/paragraph/list text, capped at 6000 chars.' },
            links: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  text: { type: 'string', required: true },
                  href: { type: 'string', required: true },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          const body = `URL: ${value.finalUrl}\nStatus: ${value.status === null ? 'n/a' : value.status}\nTitle: ${value.title}\n\n${value.text}`.trim()
          return [{ type: 'text', text: body }]
        },
      },
      async execute(args, exec) {
        return at(exec).goto(args.url)
      },
      presentCall: (args)               => ({
        card: 'generic',
        title: `Browse ${args.url}`,
        kind: 'fetch',
        rawInput: args.url,
      }),
    })
    register(goto)

    const evaluate = defineTool({
      name: 'browser_evaluate',
      description: 'Evaluate a JavaScript expression in this conversation\'s Chrome page and return the JSON-serializable result. '
        + 'The expression runs in page context (document, window, DOM available). Use it to read page state or interact with the DOM; '
        + 'return value must be JSON-serializable (BigInt/functions collapse to null). Prefer the structured tools (browser_click/type/read/wait) when they fit.',
      parameters: {
        expression: { type: 'string', required: true, description: 'JavaScript expression to evaluate in the page, e.g. "document.title" or "document.querySelectorAll(\'a\').length".' },
      },
      timeoutMs: config.timeoutMs,
      output: {
        schema: { type: 'json', description: 'The JSON-serializable value the expression returned.' },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
      },
      async execute(args, exec) {
        return at(exec).evaluate(args.expression)
      },
      presentCall: (args)               => ({
        card: 'generic',
        title: 'Evaluate in page',
        kind: 'execute',
        rawInput: args.expression,
      }),
    })
    register(evaluate)

    const screenshot = defineTool({
      name: 'browser_screenshot',
      description: 'Capture the current state of this conversation\'s Chrome page as a PNG or JPEG image. '
        + 'Returns a data URL, mime type, and byte size. Pass fullPage: true for the whole page height, type: "jpeg" with quality 0-100 for JPEG.',
      parameters: {
        fullPage: { type: 'boolean', description: 'Capture the full scrollable page height. Default: false (viewport only).' },
        type: { type: 'string', description: 'Image type: "png" (default) or "jpeg".' },
        quality: { type: 'number', description: 'JPEG quality 0-100; ignored for PNG.' },
      },
      timeoutMs: config.timeoutMs,
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            dataUrl: { type: 'string', required: true, description: 'Base64-encoded data URL of the image.' },
            mime: { type: 'string', required: true, description: 'image/png or image/jpeg.' },
            bytes: { type: 'number', required: true, description: 'Byte size of the image.' },
          },
        },
        render: (_args, value) => [{ type: 'text', text: `Captured ${value.mime} (${value.bytes} bytes)` }],
      },
      async execute(args, exec) {
        return at(exec).screenshot({
          fullPage: args.fullPage,
          type: args.type,
          quality: args.quality,
        })
      },
      presentCall: (args)               => ({
        card: 'generic',
        title: 'Screenshot page',
        kind: 'read',
        rawInput: args.fullPage ? 'full page' : 'viewport',
      }),
    })
    register(screenshot)

    // ── structured interaction: safer than raw evaluate strings ───────────────

    const click = defineTool({
      name: 'browser_click',
      description: 'Click the first element matching a CSS selector on the shared page (scrolls it into view). Returns the clicked tag and its text; a missing selector returns ok: false with a message instead of throwing.',
      parameters: {
        selector: { type: 'string', required: true, description: 'CSS selector of the element to click, e.g. "button.submit" or "a[href=\'/login\']".' },
      },
      timeoutMs: config.timeoutMs,
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', required: true },
            tag: { type: 'string', required: true, description: 'Tag name of the clicked element (empty on failure).' },
            text: { type: 'string', required: true, description: 'Text content of the clicked element, capped at 200 chars.' },
            message: { type: 'string', description: 'Failure reason when ok is false.' },
          },
        },
        render: (_args, value) => {
          return [{ type: 'text', text: value.ok ? `Clicked ${value.tag}: ${value.text}` : `Click failed: ${value.message ?? 'unknown'}` }]
        },
      },
      async execute(args, exec) {
        return at(exec).click(args.selector)
      },
      presentCall: (args)               => ({
        card: 'generic',
        title: 'Click element',
        kind: 'execute',
        rawInput: args.selector,
      }),
    })
    register(click)

    const type = defineTool({
      name: 'browser_type',
      description: 'Type text into the first element matching a CSS selector using real keyboard events (works with React-controlled inputs). Returns the element value after typing; a missing selector returns ok: false.',
      parameters: {
        selector: { type: 'string', required: true, description: 'CSS selector of the input, textarea, or select, e.g. "input[name=q]".' },
        text: { type: 'string', required: true, description: 'Text to type. For a <select>, pass the option value.' },
      },
      timeoutMs: config.timeoutMs,
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', required: true },
            value: { type: 'string', required: true, description: 'The element value after typing (capped at 200 chars).' },
            message: { type: 'string', description: 'Failure reason when ok is false.' },
          },
        },
        render: (_args, value) => {
          return [{ type: 'text', text: value.ok ? `Typed (value now: ${value.value})` : `Typing failed: ${value.message ?? 'unknown'}` }]
        },
      },
      async execute(args, exec) {
        return at(exec).type(args.selector, args.text)
      },
      presentCall: (args)               => ({
        card: 'generic',
        title: 'Type into field',
        kind: 'execute',
        rawInput: args.selector,
      }),
    })
    register(type)

    const read = defineTool({
      name: 'browser_read',
      description: 'Read the inner text of elements matching a CSS selector (default: the whole page body). Returns up to 6000 chars and the match count.',
      parameters: {
        selector: { type: 'string', description: 'CSS selector to read; omit for the whole page body.' },
      },
      timeoutMs: config.timeoutMs,
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            text: { type: 'string', required: true, description: 'Joined innerText of the matched elements, capped at 6000 chars.' },
            count: { type: 'number', required: true, description: 'Number of matching elements.' },
          },
        },
        render: (_args, value) => {
          return [{ type: 'text', text: value.text || `(no text from ${value.count} element(s))` }]
        },
      },
      async execute(args, exec) {
        return at(exec).read(args.selector)
      },
      presentCall: (args)               => ({
        card: 'generic',
        title: 'Read page text',
        kind: 'read',
        rawInput: args.selector ?? 'body',
      }),
    })
    register(read)

    const wait = defineTool({
      name: 'browser_wait',
      description: 'Wait until an element matching a CSS selector exists on the shared page (e.g. async content finished rendering), then return its text.',
      parameters: {
        selector: { type: 'string', required: true, description: 'CSS selector to wait for, e.g. ".results li".' },
        timeoutMs: { type: 'number', description: 'Maximum wait in milliseconds. Default: 10000.' },
      },
      timeoutMs: config.timeoutMs,
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', required: true, description: 'Whether the element appeared before the timeout.' },
            text: { type: 'string', required: true, description: 'The element text when found (capped at 2000 chars).' },
          },
        },
        render: (_args, value) => {
          return [{ type: 'text', text: value.found ? `Appeared: ${value.text}` : 'Timed out waiting for the element' }]
        },
      },
      async execute(args, exec) {
        return at(exec).waitFor(args.selector, args.timeoutMs ?? 10_000)
      },
      presentCall: (args)               => ({
        card: 'generic',
        title: 'Wait for element',
        kind: 'read',
        rawInput: args.selector,
      }),
    })
    register(wait)

    // ── history navigation ────────────────────────────────────────────────────

    const historyResultSchema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        ok: { type: 'boolean', required: true },
        url: { type: 'string', required: true, description: 'Page URL after the operation.' },
        message: { type: 'string', description: 'Failure reason when ok is false (e.g. empty history).' },
      },
    }         

    const back = defineTool({
      name: 'browser_back',
      description: 'Go back in the shared page history. Returns ok: false when there is no previous page.',
      parameters: {},
      timeoutMs: config.timeoutMs,
      output: {
        schema: historyResultSchema,
        render: (_args, value) => {
          return [{ type: 'text', text: value.ok ? `Back: ${value.url}` : `Back failed: ${value.message ?? 'empty history'}` }]
        },
      },
      async execute(_args, exec) {
        return at(exec).back()
      },
      presentCall: ()               => ({ card: 'generic', title: 'Go back', kind: 'fetch', rawInput: 'back' }),
    })
    register(back)

    const forward = defineTool({
      name: 'browser_forward',
      description: 'Go forward in the shared page history. Returns ok: false when there is no next page.',
      parameters: {},
      timeoutMs: config.timeoutMs,
      output: {
        schema: historyResultSchema,
        render: (_args, value) => {
          return [{ type: 'text', text: value.ok ? `Forward: ${value.url}` : `Forward failed: ${value.message ?? 'empty history'}` }]
        },
      },
      async execute(_args, exec) {
        return at(exec).forward()
      },
      presentCall: ()               => ({ card: 'generic', title: 'Go forward', kind: 'fetch', rawInput: 'forward' }),
    })
    register(forward)

    const reload = defineTool({
      name: 'browser_reload',
      description: 'Reload the shared page.',
      parameters: {},
      timeoutMs: config.timeoutMs,
      output: {
        schema: historyResultSchema,
        render: (_args, value) => {
          return [{ type: 'text', text: value.ok ? `Reloaded: ${value.url}` : `Reload failed: ${value.message ?? 'unknown'}` }]
        },
      },
      async execute(_args, exec) {
        return at(exec).reload()
      },
      presentCall: ()               => ({ card: 'generic', title: 'Reload page', kind: 'fetch', rawInput: 'reload' }),
    })
    register(reload)

    // ── accessibility snapshot ─────────────────────────────────────────────────

    const a11y = defineTool({
      name: 'browser_a11y',
      description: 'Return a compact accessibility tree of the shared page (role/name/value rows, up to 400 nodes) — what screen readers consume. More stable and semantic than raw DOM for understanding page structure and interactive elements.',
      parameters: {
        maxNodes: { type: 'number', description: 'Maximum nodes to return. Default: 400.' },
      },
      timeoutMs: config.timeoutMs,
      output: {
        schema: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              role: { type: 'string', required: true },
              name: { type: 'string', required: true },
              value: { type: 'string', required: true },
            },
          },
        },
        render: (_args, value) => {
          const rows = value
            .map(node => `${node.role}: ${node.name}${node.value ? ` = ${node.value}` : ''}`)
            .join('\n')
          return [{ type: 'text', text: rows || '(empty accessibility tree)' }]
        },
      },
      async execute(args, exec) {
        return at(exec).a11yTree(args.maxNodes ?? 400)
      },
      presentCall: ()               => ({ card: 'generic', title: 'Read accessibility tree', kind: 'read', rawInput: 'a11y' }),
    })
    register(a11y)

    // ── tabs ───────────────────────────────────────────────────────────────────

    const tabListSchema = {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          index: { type: 'number', required: true, description: 'Zero-based tab index for switch/close.' },
          url: { type: 'string', required: true },
          title: { type: 'string', required: true },
          active: { type: 'boolean', required: true, description: 'Whether this is the tab the other browser tools act on.' },
        },
      },
    }         

    const renderTabs = (value                                                                       )                 => {
      const rows = value
        .map(tab => `${tab.active ? '*' : ' '} [${tab.index}] ${tab.title || tab.url || 'New tab'}`)
        .join('\n')
      return [{ type: 'text', text: rows || '(no tabs)' }]
    }

    const tabs = defineTool({
      name: 'browser_tabs',
      description: 'List the browser tabs. The other browser tools always act on the ACTIVE tab; switch with browser_tab_switch.',
      parameters: {},
      timeoutMs: config.timeoutMs,
      output: {
        schema: tabListSchema,
        render: (_args, value) => renderTabs(value),
      },
      async execute(_args, exec) {
        return at(exec).tabs()
      },
      presentCall: ()               => ({ card: 'generic', title: 'List tabs', kind: 'read', rawInput: 'tabs' }),
    })
    register(tabs)

    const tabOpen = defineTool({
      name: 'browser_tab_open',
      description: 'Open a new tab and make it active. Pass a URL to navigate it (same URL forms as browser_goto); omit for a blank tab.',
      parameters: {
        url: { type: 'string', description: 'URL for the new tab; omit for a blank tab.' },
      },
      timeoutMs: config.timeoutMs,
      output: {
        schema: tabListSchema,
        render: (_args, value) => renderTabs(value),
      },
      async execute(args, exec) {
        return at(exec).openTab(args.url)
      },
      presentCall: (args)               => ({
        card: 'generic',
        title: 'Open tab',
        kind: 'fetch',
        rawInput: args.url ?? 'blank',
      }),
    })
    register(tabOpen)

    const tabSwitch = defineTool({
      name: 'browser_tab_switch',
      description: 'Switch the active tab by index (see browser_tabs). All other browser tools then act on that tab.',
      parameters: {
        index: { type: 'number', required: true, description: 'Zero-based tab index from browser_tabs.' },
      },
      timeoutMs: config.timeoutMs,
      output: {
        schema: tabListSchema,
        render: (_args, value) => renderTabs(value),
      },
      async execute(args, exec) {
        return at(exec).switchTab(args.index)
      },
      presentCall: (args)               => ({
        card: 'generic',
        title: `Switch to tab ${args.index}`,
        kind: 'execute',
        rawInput: String(args.index),
      }),
    })
    register(tabSwitch)

    const tabClose = defineTool({
      name: 'browser_tab_close',
      description: 'Close a tab by index (see browser_tabs). Closing the last tab leaves a fresh blank tab, so there is always an active page.',
      parameters: {
        index: { type: 'number', required: true, description: 'Zero-based tab index from browser_tabs.' },
      },
      timeoutMs: config.timeoutMs,
      output: {
        schema: tabListSchema,
        render: (_args, value) => renderTabs(value),
      },
      async execute(args, exec) {
        return at(exec).closeTab(args.index)
      },
      presentCall: (args)               => ({
        card: 'generic',
        title: `Close tab ${args.index}`,
        kind: 'execute',
        rawInput: String(args.index),
      }),
    })
    register(tabClose)

    return disposers
  }
  return {
    registerBrowserTools,
    defineTool,
    gateTool,
  }
})()

// ── src/skills.ts ──
const H4 = (() => {
  const __ext_H4_2 = __external("node:fs")
  const { readFileSync } = __ext_H4_2
  const __ext_H4_3 = __external("node:path")
  const { dirname, join } = __ext_H4_3
  const __ext_H4_4 = __external("node:url")
  const { fileURLToPath } = __ext_H4_4
  /**
   * 打包进来的技能注册。
   *
   * 每个技能位于自己的目录 `skills/<name>/SKILL.md`，并以目录形式的 `resourceBase`
   * 注册到打包副本上，这样 SKILL.md 内部的相对引用会针对本包自身的文件解析
   * （dsh-plugin 打包技能标准）。
   *
   * 这些技能覆盖浏览器面向智能体的几项能力：`browser-search`（查找并阅读网页来源）、
   * `browser-navigation`（在共享页面上移动）、`browser-interaction`（通过 evaluate 做
   * DOM 自动化）、`browser-visual-check`（截图与实时视图）以及 `browser-multitab`
   * （多标签页）。
   *
   * @module dsh-browser-plugin/src/skills
   */

                                                    
  // 仅类型导入：激活 cordis 对 `ctx.skills` 的 Context 合并。
                                              

  /** 打包的技能名，每个对应 skills/ 下的一个目录。 */
  const SKILL_NAMES = [
    'browser-search',
    'browser-navigation',
    'browser-interaction',
    'browser-visual-check',
    'browser-multitab',
  ]         

  /** 技能发现所用的路由描述（与各 SKILL.md 的 frontmatter 保持一致）。 */
  const SKILL_DESCRIPTIONS = {
    'browser-search': 'Use when you need to find and read web sources through the browser tools (browser_goto / browser_evaluate / browser_screenshot) or the built-in web_search tool, especially when the search path fails — web_search errors, search engines return captcha / HTTP 403/429 / decoy results, or a page tears down a search-engine session. Covers route triage and a full runbook.',
    'browser-navigation': 'Use when navigating the shared Chrome page with browser_goto — choosing URLs (full URLs, hostnames, localhost ports, file paths, or search text), reading the navigation summary, handling redirects/statuses/timeouts, and working within the single shared-page model.',
    'browser-interaction': 'Use when interacting with a page through browser_evaluate — reading DOM state, clicking, typing, filling forms, scrolling, waiting for async content, and returning JSON-safe results, all on the shared page the agent and the user watch together.',
    'browser-visual-check': 'Use when verifying how a page looks — capture the shared page with browser_screenshot (viewport or full page, PNG or JPEG), confirm renders and layouts after DOM changes, and keep the shared page presentable for the human watching the live pane.',
    'browser-multitab': 'Use when working with more than one page in the shared browser — opening, listing, switching, and closing tabs, understanding which tab the other browser tools act on, and how popups and target=_blank links become tabs.',
  }                                                       

  /** 某个技能的打包目录（本模块位于打包产物的 lib/index.js）。 */
  function skillDirectory(name                              )         {
    return join(dirname(fileURLToPath(import.meta.url)), '..', `skills/${name}`)
  }

  /** 技能正文：从打包技能目录原样读取 SKILL.md。 */
  function skillBody(name                              )         {
    return readFileSync(join(skillDirectory(name), 'SKILL.md'), 'utf8')
  }

  /** 注册全部打包技能，返回 cordis 的 effect 拆除函数。 */
  function registerBrowserSkills(ctx         )                    {
    return SKILL_NAMES.map(name => ctx.skills.register({
      name,
      description: SKILL_DESCRIPTIONS[name],
      source: 'bundled',
      content: skillBody(name),
      resourceBase: { kind: 'directory', path: skillDirectory(name) },
    }))
  }
  return {
    SKILL_NAMES,
    SKILL_DESCRIPTIONS,
    skillDirectory,
    skillBody,
    registerBrowserSkills,
    readFileSync,
    dirname,
    join,
    fileURLToPath,
  }
})()

// ── src/browser-queue.ts ──
const H5 = (() => {
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

// ── src/extract.ts ──
const H6 = (() => {
  /**
   * 页面内容抽取：把一页 DOM 压成模型可读的文本与链接列表。
   *
   * 这些函数都在页面上下文里求值（`Page.evaluate`），因此不能引用本模块的任何
   * Node 侧绑定 —— 它们会被序列化后送进渲染进程。
   *
   * @module dsh-browser-plugin/src/extract
   */

                                            

  /**
   * 把长页面压成可读文本：前五个标题，加上段落/列表文字，上限 6000 字符。
   */
  function pageToText(handle      )                  {
    return handle.evaluate(() => {
      const parts           = []
      const pick = (sel        ) => {
        try {
          return Array.from(document.querySelectorAll(sel)).slice(0, 5)
        } catch {
          return []
        }
      }
      for (const el of pick('h1, h2, h3')) {
        const t = (el.textContent || '').trim()
        if (t) parts.push(t)
      }
      for (const el of pick('p, li')) {
        const t = (el.textContent || '').trim()
        if (t) parts.push(t)
      }
      return parts.join('\n').slice(0, 6000)
    })
  }

  /** 抽取最多 25 条锚点链接（文字 + 解析后的 href）。 */
  function pageLinks(handle      )                                                 {
    return handle.evaluate(() =>
      Array.from(document.querySelectorAll('a'))
        .map(a => ({ text: (a.textContent || '').trim().slice(0, 120), href: a.href || '' }))
        .filter(l => l.text && l.href)
        .slice(0, 25),
    )
  }

  /** 读取某个选择器的 innerText（默认整页 body），上限 6000 字符。 */
  function readText(handle      , selector         )                                           {
    const target = selector && selector.trim() !== '' ? selector : 'body'
    return handle.evaluate((sel) => {
      const nodes = Array.from(document.querySelectorAll(sel))
      const text = nodes
        .map(el => (el instanceof HTMLElement ? el.innerText : el.textContent || ''))
        .join('\n')
        .trim()
        .slice(0, 6000)
      return { text, count: nodes.length }
    }, target)
  }
  return {
    pageToText,
    pageLinks,
    readText,
  }
})()

// ── src/url.ts ──
const H7 = (() => {
  const __ext_H4_2 = __external("node:fs")
  const { existsSync } = __ext_H4_2
  const __ext_H7_5 = __external("node:os")
  const { homedir } = __ext_H7_5
  const __ext_H4_3 = __external("node:path")
  const { isAbsolute, join } = __ext_H4_3
  const __ext_H4_4 = __external("node:url")
  const { pathToFileURL } = __ext_H4_4
  /**
   * URL 归一化：把用户输入变成可导航的地址。
   *
   * 沿用 terminal-browser 的参考模型：
   *
   * - `scheme://…` 以及无主机名的 scheme（`data:`、`mailto:`、`about:` …）原样
   *   通过（经 URL 归一化；解析失败时返回原始输入，好让 `view-source:` 这类少见的
   *   scheme 仍能交给 Chrome）。
   * - 磁盘上真实存在的绝对路径或 `~` 路径会变成 file URL。
   * - 形如主机名的输入（`example.com/path`、`localhost:5173`）补 `https://`，
   *   localhost/127.0.0.1 例外，补 `http://`。
   * - 其余输入（含空格、不含点）会变成 Google 搜索。
   *
   * 不做相对路径解析：插件没有可用来解析 `./…` 的 cwd 锚点（参考实现是从它的终端
   * 会话 cwd 解析的）。
   *
   * @module dsh-browser-plugin/src/url
   */


  const HAS_AUTHORITY = /^[a-z][a-z0-9+.-]*:\/\//i
  const SCHEMES_WITHOUT_HOST = /^(?:data|mailto|tel|about|blob|chrome|view-source):/i

  /** 把绝对路径或 `~` 路径解析为磁盘上存在的本地文件；不存在则返回 null。 */
  function localFile(input        )                {
    const expanded = input === '~' || input.startsWith('~/')
      ? join(homedir(), input.slice(1))
      : input
    if (!isAbsolute(expanded)) return null
    return existsSync(expanded) ? expanded : null
  }

  /** 把用户输入归一化为可导航的 URL。 */
  function normalizeUrl(input        )         {
    const value = input.trim()
    if (!value) throw new Error('url is required')
    if (HAS_AUTHORITY.test(value) || SCHEMES_WITHOUT_HOST.test(value)) {
      try {
        return new URL(value).toString()
      } catch {
        return value
      }
    }
    const file = localFile(value)
    if (file) return pathToFileURL(file).toString()
    if (/^[\w.-]+(?::\d+)?(?:\/.*)?$/.test(value)) {
      const host = (value.split(/[:/]/)[0] ?? '').toLowerCase()
      const scheme = host === 'localhost' || host === '127.0.0.1' ? 'http' : 'https'
      return `${scheme}://${value}`
    }
    return `https://www.google.com/search?q=${encodeURIComponent(value)}`
  }
  return {
    HAS_AUTHORITY,
    SCHEMES_WITHOUT_HOST,
    localFile,
    normalizeUrl,
    existsSync,
    homedir,
    isAbsolute,
    join,
    pathToFileURL,
  }
})()

// ── src/browser-launch.ts ──
const H8 = (() => {
  const __ext_H4_2 = __external("node:fs")
  const { existsSync, mkdirSync, readFileSync, rmSync } = __ext_H4_2
  const __ext_H7_5 = __external("node:os")
  const { homedir } = __ext_H7_5
  const __ext_H4_3 = __external("node:path")
  const { join } = __ext_H4_3
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

                                                                            
                                                                
                                                   

  /** 模式切换后把地址带过去的等待上限（毫秒）；超过就让它继续在后台加载。 */
  const CARRY_TIMEOUT_MS = 8000

  /** 浏览器启动与连接（声明合并到 `BrowserRuntime`）。 */
  class BrowserRuntime {
              browser                 = null
              pages         = []
              targets           = []
              active = 0
              mode              = 'own'
    /** 隐身启动的子进程（拆除时的兜底清理目标）。 */
              stealthChild                                                   = null
    /** 已发现但尚未归并的外部页面 target（空白页等待 URL 出现）。 */
                       foreignTargets = new Set        ()
    /** 标签页集合监听者（视图在切换标签时重启画面流）。 */
                       tabListeners = new Set                           ()
    /** 已解析的插件配置。 */
                       config                
    /**
     * 实时视图要求的视口尺寸。
     *
     * 视图接管后页面就按侧边栏的形状渲染，因此这个尺寸必须跨页留存：切换模式或标签
     * 页会新建页面，新页面得沿用同一个视口，否则画面会在两套比例之间跳一下。
     */
              viewportOverride                                           = null
    /** 启动尝试的串行链（见 `ensureBrowser` 的说明）。 */
            launchChain                = Promise.resolve()
    /** 浏览器世代：切换模式或拆除时递增，用来作废还在启动中的那一次。 */
            generation = 0

    // 显式声明并赋值，而不用 TypeScript 的参数属性（`constructor(private x)`）：
    // 构建脚本依赖 Node 的 strip-only 类型剥离，而它不支持参数属性。
    constructor(config                ) {
      this.config = config
      // `stealth` 配置决定启动时的初始模式；此后由视图上的模式切换按钮实时切换。
      this.mode = config.stealth ? 'stealth' : 'own'
    }

    /** 当前的浏览器模式。 */
    currentMode()              {
      return this.mode
    }

    /** 订阅标签页集合变化；返回取消订阅函数。 */
    onTabsChanged(listener                           )             {
      this.tabListeners.add(listener)
      return () => {
        this.tabListeners.delete(listener)
      }
    }

    /** 用最新快照通知标签页监听者（单个监听者出错不影响其余）。 */
              notifyTabs()       {
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
              async setupPage(page      , resize         )                {
      page.setDefaultNavigationTimeout(this.config.navTimeoutMs)
      page.setDefaultTimeout(this.config.scriptTimeoutMs)
      if (resize) {
        const size = this.viewportOverride ?? this.config.viewport
        await page.setViewport({ width: size.width, height: size.height })
      }
    }

    /** 挂上共享的浏览器事件处理（启动与连接一视同仁）。 */
              wireBrowser(browser         )       {
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
              async launchBrowser()                   {
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
      const launchOptions                = {
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
              async launchStealthBrowser()                   {
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
              async ensureBrowser()                   {
      if (this.browser && this.browser.connected) return this.browser
      const generation = this.generation
      const run = this.launchChain.then(() => this.launchOnce(generation))
      // 链上只保留「前一次已经结束」这个事实，不传播错误：一次失败的启动不该连累下一次。
      this.launchChain = run.then(() => {}, () => {})
      return run
    }

    /** 真正启动一次（只在 `launchChain` 里串行执行）。 */
            async launchOnce(generation        )                   {
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
            assertCurrent(generation        )       {
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
    async switchMode(mode             )                     {
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
            carriedUrl()         {
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
                                          
    /** 关闭浏览器。可重复调用。 */
                                      
    /** 认领一个外部页面 target 并尝试立即接管。 */
                                                                  
    /** 把一个外部页面 target 接管为新标签页。 */
                                                                   
    /** 丢弃已关闭的标签页。 */
                                       
  }
  return {
    CARRY_TIMEOUT_MS,
    BrowserRuntime,
    existsSync,
    mkdirSync,
    readFileSync,
    rmSync,
    homedir,
    join,
  }
})()

// ── src/browser.ts ──
const H9 = (() => {
  const { pageLinks, pageToText, readText } = H6
  const { normalizeUrl } = H7
  const { BrowserRuntime: BrowserRuntimeBase } = H8
  /** 视图要求的最小视口边长（CSS 像素）：再小页面就没有可用布局宽度了。 */
  const MIN_VIEWPORT_WIDTH = 320
  const MIN_VIEWPORT_HEIGHT = 240
  /** 视图要求的最大视口边长（CSS 像素）：挡住病态尺寸让渲染进程白烧 CPU。 */
  const MAX_VIEWPORT_SIDE = 4096

  /** 把一个视口边长夹到合法范围；非有限值退回下限。 */
  function clampViewport(value        , min        , max        )         {
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

                                                    
                                                         
                                                                                                             

  /** 浏览器生命周期成员（实现见 browser-launch.ts）。 */
                                   
                     
                                                     
   

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
  class BrowserRuntime extends BrowserRuntimeBase {
    /** 某个 target 是否属于我们自己的标签页。 */
            isSharedTarget(target        )          {
      if (this.targets.includes(target)) return true
      return this.pages.some(page => !page.isClosed() && page.target() === target)
    }

    /** 丢弃已关闭的标签页。 */
              prune()       {
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
              trackForeignTarget(target        )       {
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
              async foldTarget(target        )                {
      // 重新核对身份：等一个创建时还是空白的 target 触发 targetchanged 时，它可能
      // 已经是我们自己的页面了（在创建事件之后才被记录）。
      if (this.isSharedTarget(target)) {
        this.foreignTargets.delete(target)
        return
      }
      let url        
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
            async createPage()                {
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
            async ensurePage()                {
      this.prune()
      const current = this.pages[this.active]
      if (current && !current.isClosed()) return current
      return this.createPage()
    }

    /** 活动标签页的页面，首次使用时会启动 Chrome —— 供视图/画面流消费者使用。 */
    async sharedPage()                {
      return this.ensurePage()
    }

    /**
     * 把共享页面的视口设成给定尺寸。
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
     * @returns 实际生效的尺寸。
     */
    async setViewport(width        , height        )                                             {
      const size = {
        width: clampViewport(width, MIN_VIEWPORT_WIDTH, MAX_VIEWPORT_SIDE),
        height: clampViewport(height, MIN_VIEWPORT_HEIGHT, MAX_VIEWPORT_SIDE),
      }
      this.viewportOverride = size
      const page = await this.ensurePage()
      await page.setViewport(size)
      return size
    }

    /** 视图上次要求的视口尺寸；没有视图接管时为空。 */
    viewportSize()                                           {
      return this.viewportOverride
    }

    /** 标签页列表（永不为空：最后一个标签页不会被留着关闭）。 */
    async tabs()                     {
      this.prune()
      if (this.pages.length === 0) await this.createPage()
      const rows            = []
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
    async openTab(rawUrl         )                     {
      await this.createPage()
      if (rawUrl && rawUrl.trim() !== '') {
        await this.goto(rawUrl)
      }
      return this.tabs()
    }

    /** 激活指定下标的标签页。 */
    async switchTab(index        )                     {
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
    async closeTab(index        )                     {
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
    async goto(rawUrl        )                      {
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
    async evaluate(expression        )                     {
      // 工具 schema 已把 `expression` 声明为字符串；这里只需运行时校验非空。
      if (!expression.trim()) {
        throw new Error('evaluate 需要一个非空表达式')
      }
      const page = await this.ensurePage()
      const value = await page.evaluate(expression)
      try {
        // 安全性：JSON 往返会把值物化成纯 JSON；其中的不可序列化内容会在此坍缩，
        // 而这正是本方法承诺的 JsonValue 取值域。
        return JSON.parse(JSON.stringify(value))             
      } catch {
        return String(value)
      }
    }

    /** 把页面截成 PNG/JPEG 的 data URL。 */
    async screenshot(options                                                          = {})                            {
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
    async back()                         {
      const page = await this.ensurePage()
      try {
        await page.goBack({ waitUntil: 'domcontentloaded', timeout: this.config.navTimeoutMs })
        return { ok: true, url: page.url() }
      } catch (error) {
        return { ok: false, url: page.url(), message: error instanceof Error ? error.message : String(error) }
      }
    }

    /** 在共享页面的历史里前进。 */
    async forward()                         {
      const page = await this.ensurePage()
      try {
        await page.goForward({ waitUntil: 'domcontentloaded', timeout: this.config.navTimeoutMs })
        return { ok: true, url: page.url() }
      } catch (error) {
        return { ok: false, url: page.url(), message: error instanceof Error ? error.message : String(error) }
      }
    }

    /** 刷新共享页面。 */
    async reload()                         {
      const page = await this.ensurePage()
      try {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: this.config.navTimeoutMs })
        return { ok: true, url: page.url() }
      } catch (error) {
        return { ok: false, url: page.url(), message: error instanceof Error ? error.message : String(error) }
      }
    }

    /** 点击第一个匹配该 CSS 选择器的元素。 */
    async click(selector        )                                                                        {
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
    async type(selector        , text        )                                                            {
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
    async read(selector         )                                           {
      const page = await this.ensurePage()
      return readText(page, selector)
    }

    /** 等待某个选择器出现，然后返回它的文字。 */
    async waitFor(selector        , timeoutMs        )                                            {
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
    async a11yTree(maxNodes = 400)                                                                {
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
    async close()                {
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
  return {
    MIN_VIEWPORT_WIDTH,
    MIN_VIEWPORT_HEIGHT,
    MAX_VIEWPORT_SIDE,
    clampViewport,
    BrowserRuntime,
    pageLinks,
    pageToText,
    readText,
    normalizeUrl,
    BrowserRuntimeBase,
  }
})()

// ── src/browser-sessions.ts ──
const H10 = (() => {
  const __ext_H7_5 = __external("node:os")
  const { homedir } = __ext_H7_5
  const __ext_H4_3 = __external("node:path")
  const { join } = __ext_H4_3
  const { BrowserQueue } = H5
  const { BrowserRuntime } = H9
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

                                                   
                                                    
                                                                                      

  /** 拿不到会话 id 时用的键（无名会话：临时 profile，不落盘）。 */
  const DEFAULT_SESSION_KEY = ''

  /** 共享模式下所有会话共用的键（`isolation: 'shared'`）。 */
  const SHARED_SESSION_KEY = 'shared'

  /** 空闲检查的间隔（毫秒）；比 `idleTimeoutMs` 小得多，关掉只会晚一个间隔。 */
  const SWEEP_INTERVAL_MS = 60_000

  /** 默认 profile 父目录（`userDataDir` 留空时）。 */
  const DEFAULT_PROFILE_ROOT = join(homedir(), '.dsh', 'browser-profiles')

  /** 一个会话的浏览器：运行时、它自己的锁、以及它自己的实时视图。 */
                                   
                             
                        
                          
                                    
                                          
                                
                                                     
                                  
                                                           
                                      
                                      
                    
   

  /** 把会话 id 变成安全的目录名（Windows 不允许的字符一律换成 `_`）。 */
  function safeSegment(sessionId        )         {
    return sessionId.replace(/[^A-Za-z0-9._-]/gu, '_').slice(0, 80)
  }

  /** 按会话管理浏览器的注册表。 */
  class BrowserSessions                           {
    /** 是否允许子智能体驱动浏览器（工具侧闸门用）。 */
             allowSubagents         
    /** 宿主 agent 注册表；缺失时跳过子智能体判定。 */
             ownership                            
                     entries = new Map                        ()
                     config                
            timer                                        = null

    /**
     * @param config - 已解析的插件配置（隔离粒度、profile 位置、上限与空闲窗口）。
     * @param ownership - 子智能体判定；`ctx.agents` 缺失时传 undefined。
     */
    constructor(config                , ownership                 ) {
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
    get size()         {
      return this.entries.size
    }

    /** 当前保活的会话键（诊断与测试用）。 */
    keys()           {
      return [...this.entries.keys()]
    }

    /**
     * 取一个会话的浏览器，没有就地建一个（**只建对象，不启动 Chrome** —— Chrome 在第一次
     * 真正用它时懒启动）。
     *
     * @param sessionId - 会话 id；null/undefined 落到无名键。
     * @returns 该会话的浏览器记录。
     */
    forSession(sessionId                           )                 {
      const key = this.keyOf(sessionId)
      const existing = this.entries.get(key)
      if (existing !== undefined) {
        existing.lastUsed = Date.now()
        return existing
      }
      const profileDir = this.profileDirFor(key)
      const entry                 = {
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
    gateFor(sessionId               )              {
      const entry = this.forSession(sessionId)
      return {
        queue: entry.queue,
        onDriver: (driver) => { entry.stream?.noteDriver(driver) },
      }
    }

    /** 取某个会话的浏览器运行时（工具真正操作的对象）。 */
    runtimeFor(sessionId               )                 {
      return this.forSession(sessionId).runtime
    }

    /**
     * 关掉一个会话的浏览器。正在跑调用或有视图看着时不动它（那是用户正在用的东西）。
     *
     * @param entry - 目标会话。
     * @returns 是否真的关掉了。
     */
    async close(entry                )                   {
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
    async sweep()                {
      const now = Date.now()
      const idle                   = []
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
    async dispose()                {
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
            keyOf(sessionId                           )         {
      if (this.config.isolation === 'shared') return SHARED_SESSION_KEY
      if (sessionId === null || sessionId === undefined || sessionId === '') return DEFAULT_SESSION_KEY
      return sessionId
    }

    /** 这个会话的 profile 目录；null = 临时 profile（无名会话，或共享模式且没配目录）。 */
            profileDirFor(key        )                {
      if (this.config.isolation === 'shared') {
        return this.config.userDataDir === '' ? null : this.config.userDataDir
      }
      if (key === DEFAULT_SESSION_KEY) return null
      const base = this.config.userDataDir !== '' ? this.config.userDataDir : DEFAULT_PROFILE_ROOT
      return join(base, safeSegment(key))
    }
  }
  return {
    DEFAULT_SESSION_KEY,
    SHARED_SESSION_KEY,
    SWEEP_INTERVAL_MS,
    DEFAULT_PROFILE_ROOT,
    safeSegment,
    BrowserSessions,
    homedir,
    join,
    BrowserQueue,
    BrowserRuntime,
  }
})()

// ── src/pane-stream.ts ──
const H11 = (() => {
  const { QueueAbortError } = H5
  /**
   * 实时视图的流与输入控制器：画面流（CDP `Page.startScreencast`）、合成输入
   * （CDP `Input` 域）、以及向已连接视图广播状态。
   *
   * 画面流会话由本模块持有，并跟随 SSE 客户端：第一个订阅者启动它，最后一个订阅者
   * 停止它，插件拆除时一并清理。
   *
   * 输入保真度沿用 terminal-browser 的参考模型：双击/三击计数、鼠标与键盘事件的
   * 修饰键位掩码、带行模式的滚轮小数累积与刻度换算、客户端离开时释放仍被按住的
   * 键，以及视图持有页面期间开启焦点模拟。
   *
   * @module dsh-browser-plugin/src/pane-stream
   */

                                                        
                                                 
                                                    
                                                   
                                                                            

  /** 行模式（deltaMode 1）滚轮每个刻度对应的像素。 */
  const WHEEL_DETENT_PX = 120
  /** 双击/三击判定的时间窗口（毫秒）。 */
  const MULTI_CLICK_MS = 500
  /** 双击/三击判定的像素容差。 */
  const MULTI_CLICK_PX = 4
  /** 画面流断开后延迟多久重启（毫秒）。 */
  const RESTART_DELAY_MS = 500
  /**
   * 视口变更的防抖窗口（毫秒）：拖侧边栏时尺寸每帧都变，逐次改视口会让页面连续重排；
   * 等手停下来再改一次，用户看到的是「松手后按新宽度重排」而不是一路抖动。
   */
  const VIEWPORT_DEBOUNCE_MS = 200
  /**
   * 地址同步的兜底轮询间隔（毫秒）。主路径是页面导航事件，但导航事件不覆盖全部地址
   * 变化（历史 API 改地址等），低频轮询兜住它们：`page.url()` 是本地缓存读取。
   */
  const URL_SYNC_INTERVAL_MS = 400

  /** 上一次点击的记忆，用于双击/三击判定。 */
                        
                  
              
             
             
                 
   

  /** 把带符号的小数增量朝零取整。 */
  function wholeDelta(value        )         {
    return value < 0 ? Math.ceil(value) : Math.floor(value)
  }

  /** 去掉锚点后的地址：用来判断两次导航是否落在同一个文档里。 */
  function documentKey(url        )         {
    const hash = url.indexOf('#')
    return hash === -1 ? url : url.slice(0, hash)
  }

  /** 实时视图的流与输入控制器。 */
  class PaneStream {
                     clients = new Set                ()
            cdp                    = null
            screencastPage              = null
    /** 双击/三击判定状态（同键、500ms 内、4px 内则计数 +1，上限 3）。 */
            clickState             = { button: 'none', at: 0, x: 0, y: 0, count: 0 }
    /** 滚轮小数增量累积到整数像素后再发出。 */
            wheelRemainderX = 0
            wheelRemainderY = 0
    /** 页面里当前被按住的键：code -> key，视图客户端离开时释放。 */
                     heldKeys = new Map                ()
    /** 最近一帧/状态/标签页：重放给后连上的客户端，让刷新的视图立刻是最新的。 */
            lastFrame                   = null
            lastState            = { active: false, url: '', mode: 'own' }
            lastTabs            = []
    /** 画面流丢失后的延迟重启定时器（拆除时清除）。 */
            restartTimer                                       = null
    /** 地址兜底轮询定时器与导航监听（随画面流建立/拆除）。 */
            urlTimer                                        = null
            offNavigated                      = null
    /** 视口尺寸的防抖定时器与最后一次请求（面板拖动时会连续上报）。 */
            viewportTimer                                       = null
            pendingViewport                                           = null
                     offTabsChanged            
    /** 被镜像的浏览器运行时。 */
                     runtime                
    /** 与智能体工具共用的串行队列（视口变更也要从它过）。 */
                     queue              

    // 显式声明并赋值，而不用 TypeScript 的参数属性：构建脚本依赖 Node 的 strip-only
    // 类型剥离，而它不支持参数属性。
    constructor(runtime                , queue              ) {
      this.runtime = runtime
      this.queue = queue
      // 跟随会话的活动标签页：广播标签页集合，并在活动页面变化时重启画面流
      // （画面流镜像的正是智能体工具所作用的那个页面）。
      this.offTabsChanged = runtime.onTabsChanged((tabs) => {
        this.lastTabs = tabs
        this.broadcast('tabs', tabs)
        const activeRow = tabs.find(row => row.active)
        if (activeRow !== undefined && this.screencastPage !== null) {
          void runtime.sharedPage().catch(() => null).then((page) => {
            if (page !== null && page !== this.screencastPage && this.clients.size > 0) {
              this.lastFrame = null
              void this.startScreencast()
            }
          })
        }
      })
    }

    /** 当前状态快照（新客户端连接时重放）。 */
    state()            {
      return this.lastState
    }

    /** 标签页快照（新客户端连接时重放）。 */
    tabs()            {
      return this.lastTabs
    }

    /** 最近一帧（新客户端连接时重放）。 */
    frame()                   {
      return this.lastFrame
    }

    /** 新增一个 SSE 客户端并重放当前状态。 */
    addClient(res                )       {
      this.clients.add(res)
    }

    /** 移除一个 SSE 客户端；没有客户端时停止画面流。 */
    removeClient(res                )       {
      this.clients.delete(res)
      if (this.clients.size === 0) {
        this.releaseHeldKeys()
        this.stopScreencast()
      }
    }

    /** 是否已有视图在看。 */
    get watching()          {
      return this.clients.size > 0
    }

    /** 向所有客户端广播一个 SSE 事件。 */
    broadcast(event        , payload                                   )       {
      const line = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
      for (const res of this.clients) {
        try {
          res.write(line)
        } catch {
          this.clients.delete(res)
        }
      }
    }

    /** 只给一个客户端写一条 SSE 事件（连接时重放用）。 */
    send(res                , event        , payload                                   )       {
      try {
        res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
      } catch {
        this.clients.delete(res)
      }
    }

    /**
     * 视图报告面板尺寸，防抖后把共享页面的视口改成同一个形状。只在尺寸真正变化时才
     * 应用，避免拖到一半停下也白推一次视口。
     *
     * @param width - 面板可用宽度（CSS 像素）。
     * @param height - 面板可用高度（CSS 像素）。
     */
    requestViewport(width        , height        )       {
      const target = { width: Math.round(width), height: Math.round(height) }
      const current = this.runtime.viewportSize()
      if (current !== null && current.width === target.width && current.height === target.height) return
      this.pendingViewport = target
      if (this.viewportTimer !== null) clearTimeout(this.viewportTimer)
      this.viewportTimer = setTimeout(() => {
        this.viewportTimer = null
        const pending = this.pendingViewport
        this.pendingViewport = null
        if (pending === null) return
        void this.applyViewport(pending.width, pending.height)
      }, VIEWPORT_DEBOUNCE_MS)
    }

    /**
     * 应用一次视口变更，然后让画面流按新尺寸重来。
     *
     * 从串行队列过：`setViewport` 会触发页面重排，正好插在智能体的调用中间时会干扰它
     * （例如刚点开的下拉框被重排掉）。重启画面流而不是只改视口：CDP 已经在按旧尺寸出帧
     * 了，而换尺寸那一刻的帧仍带着旧尺寸，视图按比例铺满时会短暂变形。
     */
            async applyViewport(width        , height        )                {
      try {
        await this.queue.run('viewport', undefined, async () => {
          await this.runtime.setViewport(width, height)
          if (this.clients.size > 0) {
            this.lastFrame = null
            this.stopScreencast()
            await this.startScreencast()
          }
        })
      } catch (error) {
        if (error instanceof QueueAbortError) return
        const message = error instanceof Error ? error.message : String(error)
        this.setState({ active: false, url: '', error: message, mode: this.runtime.currentMode() })
      }
    }

    /** 拆掉视口防抖定时器。 */
            clearViewportTimer()       {
      if (this.viewportTimer !== null) clearTimeout(this.viewportTimer)
      this.viewportTimer = null
      this.pendingViewport = null
    }

    /** 记录并广播「哪个会话正在驱动浏览器」。跨会话争用因此变成可见状态。 */
    noteDriver(sessionId               )       {
      if (this.lastState.driver === sessionId) return
      this.syncUrl()
      this.setState({ ...this.lastState, driver: sessionId ?? undefined })
    }

    /**
     * 把状态里的地址同步成页面当前的地址（变了才广播）。
     *
     * 画面帧只在**画面变化**时才推，而地址变化不一定改画面 —— 于是会出现「智能体已经
     * 跳到别的网站，侧边栏的地址栏还停在上一页」。地址因此不能只靠帧来更新，必须由
     * 页面导航事件加一次低频轮询兜住。
     */
    syncUrl()       {
      const page = this.screencastPage
      if (page === null) return
      let url        
      try {
        url = page.url()
      } catch {
        return
      }
      if (url === this.lastState.url) return
      // 同文档（只有锚点不同）时画面仍然有效，只把地址改过来；跨文档导航后缓存帧画的
      // 是旧页面，直接丢掉 —— 否则刚连上的视图会把旧画面配上新地址。
      if (this.lastFrame !== null) {
        this.lastFrame = documentKey(url) === documentKey(this.lastState.url)
          ? { ...this.lastFrame, url }
          : null
      }
      this.setState({ ...this.lastState, active: true, error: undefined, url, mode: this.runtime.currentMode() })
    }

    /** 解绑地址监听并停掉兜底轮询。 */
            stopUrlWatch()       {
      if (this.urlTimer !== null) clearInterval(this.urlTimer)
      this.urlTimer = null
      const off = this.offNavigated
      this.offNavigated = null
      if (off !== null) off()
    }

    /** 更新并广播浏览器状态。 */
    setState(next           )       {
      this.lastState = next
      this.broadcast('state', next)
    }

    /** 清掉缓存帧（换页或换模式后旧画面已经不代表现状）。 */
    clearFrame()       {
      this.lastFrame = null
    }

    /** 重播标签页集合并记住它。 */
    setTabs(tabs           )       {
      this.lastTabs = tabs
      this.broadcast('tabs', tabs)
    }

    /** 释放页面里仍被按住的键。 */
            releaseHeldKeys()       {
      const session = this.cdp
      if (session === null || this.heldKeys.size === 0) return
      for (const [code, key] of this.heldKeys) {
        void session.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code }).catch(() => {})
      }
      this.heldKeys.clear()
    }

    /** 停止画面流并断开 CDP 会话。 */
    stopScreencast()       {
      // 先解绑监听与轮询：`disconnected` 会把 `cdp` 置空，若放在早退之后清理，
      // 这条路径上的定时器就再也没人管了。
      this.stopUrlWatch()
      const session = this.cdp
      this.cdp = null
      this.screencastPage = null
      if (session === null) return
      this.releaseHeldKeys()
      void session.send('Emulation.setFocusEmulationEnabled', { enabled: false }).catch(() => {})
      void session.send('Page.stopScreencast').catch(() => {})
      void session.detach().catch(() => {})
    }

    /** 启动（或重启）画面流。 */
    async startScreencast()                {
      try {
        const page = await this.runtime.sharedPage()
        if (this.cdp !== null && this.screencastPage === page) {
          // 已经有画面流了，但期间页面可能已经导航过（视图关着的那段时间）：
          // 至少把地址补上，不能等下一帧。
          this.syncUrl()
          return
        }
        if (this.cdp !== null) this.stopScreencast()
        this.stopUrlWatch()
        const session = await page.createCDPSession()
        this.cdp = session
        this.screencastPage = page
        const onNavigated = ()       => { this.syncUrl() }
        page.on('framenavigated', onNavigated)
        this.offNavigated = () => { page.off('framenavigated', onNavigated) }
        this.urlTimer = setInterval(() => { this.syncUrl() }, URL_SYNC_INTERVAL_MS)
        session.on('Page.screencastFrame', (frame) => {
          const { data, sessionId, metadata } = frame
          // CDP 只有在帧被确认后才会继续推送。
          void session.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
          const url = page.url()
          this.lastFrame = { data, width: metadata.deviceWidth, height: metadata.deviceHeight, url }
          // 保留其余字段（尤其是 `driver`）：否则每一帧都会把「谁在驱动」抹掉。
          this.lastState = { ...this.lastState, active: true, url, mode: this.runtime.currentMode() }
          this.broadcast('frame', this.lastFrame)
        })
        session.on('disconnected', () => {
          if (this.cdp === session) this.cdp = null
          if (this.screencastPage === page) this.screencastPage = null
          // 自愈：一直连着的视图否则永远等不到新的画面流（重启原本只发生在新的
          // 客户端接入时）。
          if (this.clients.size > 0) {
            this.setState({ active: false, url: '', error: '画面流已断开，正在重连…', mode: this.runtime.currentMode() })
            if (this.restartTimer !== null) clearTimeout(this.restartTimer)
            this.restartTimer = setTimeout(() => {
              this.restartTimer = null
              void this.startScreencast()
            }, RESTART_DELAY_MS)
          }
        })
        await session.send('Page.enable')
        // 帧按**模拟视口的原始尺寸**推送：视图那边的页面尺寸就是面板尺寸，所以既
        // 不需要放大（糊）也不需要缩小（浪费）。不设 maxWidth/maxHeight，CDP 便按
        // 设备尺寸出帧，元数据里的 deviceWidth/Height 也正好是页面 CSS 尺寸。
        await session.send('Page.startScreencast', {
          format: 'jpeg',
          quality: 60,
          everyNthFrame: 1,
        })
        // 画面流期间由视图持有页面：开启焦点模拟，让依赖焦点的页面行为
        // （动画、:focus 状态）保持真实。
        void session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {})
        this.setState({ active: true, url: page.url(), mode: this.runtime.currentMode() })
      } catch (error) {
        this.stopUrlWatch()
        this.cdp = null
        this.screencastPage = null
        const message = error instanceof Error ? error.message : String(error)
        this.setState({ active: false, url: '', error: message, mode: this.runtime.currentMode() })
      }
    }

    /** 计算本次点击的 clickCount（双击/三击）。 */
            nextClickCount(button        , x        , y        )         {
      const now = Date.now()
      const close = Math.abs(x - this.clickState.x) <= MULTI_CLICK_PX
        && Math.abs(y - this.clickState.y) <= MULTI_CLICK_PX
      const count = this.clickState.button === button && now - this.clickState.at <= MULTI_CLICK_MS && close
        ? Math.min(this.clickState.count + 1, 3)
        : 1
      this.clickState = { button, at: now, x, y, count }
      return count
    }

    /** 把一条视图输入事件派发进页面。 */
    async dispatchInput(event                )                {
      const session = this.cdp
      if (session === null) throw new Error('浏览器尚未就绪 —— 还没有打开任何页面')
      switch (event.type) {
        case 'mouse-move':
          await session.send('Input.dispatchMouseEvent', {
            type: 'mouseMoved',
            x: event.x,
            y: event.y,
            modifiers: event.modifiers,
          })
          return
        case 'mouse-down': {
          const clickCount = this.nextClickCount(event.button, event.x, event.y)
          await session.send('Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x: event.x,
            y: event.y,
            button: event.button,
            clickCount,
            modifiers: event.modifiers,
          })
          return
        }
        case 'mouse-up':
          await session.send('Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x: event.x,
            y: event.y,
            button: event.button,
            clickCount: Math.max(1, this.clickState.count),
            modifiers: event.modifiers,
          })
          return
        case 'wheel': {
          const step = event.deltaMode === 1 ? WHEEL_DETENT_PX : event.deltaMode === 2 ? 600 : 1
          this.wheelRemainderX += event.deltaX * step
          this.wheelRemainderY += event.deltaY * step
          const deltaX = wholeDelta(this.wheelRemainderX)
          const deltaY = wholeDelta(this.wheelRemainderY)
          this.wheelRemainderX -= deltaX
          this.wheelRemainderY -= deltaY
          if (deltaX === 0 && deltaY === 0) return
          await session.send('Input.dispatchMouseEvent', {
            type: 'mouseWheel',
            x: event.x,
            y: event.y,
            deltaX,
            deltaY,
            modifiers: event.modifiers,
          })
          return
        }
        case 'key-down': {
          if (!this.heldKeys.has(event.code) && event.code !== '') this.heldKeys.set(event.code, event.key)
          await session.send('Input.dispatchKeyEvent', {
            type: 'keyDown',
            key: event.key,
            code: event.code,
            text: event.text === '' ? undefined : event.text,
            modifiers: event.modifiers,
          })
          return
        }
        case 'key-up':
          this.heldKeys.delete(event.code)
          await session.send('Input.dispatchKeyEvent', {
            type: 'keyUp',
            key: event.key,
            code: event.code,
            modifiers: event.modifiers,
          })
          return
      }
    }

    /** 彻底拆除：停流、解绑、结束所有客户端。 */
    dispose()       {
      this.offTabsChanged()
      this.clearViewportTimer()
      if (this.restartTimer !== null) clearTimeout(this.restartTimer)
      this.restartTimer = null
      this.stopScreencast()
      for (const res of this.clients) {
        try {
          res.end()
        } catch { /* 客户端早就走了 */ }
      }
      this.clients.clear()
    }
  }
  return {
    WHEEL_DETENT_PX,
    MULTI_CLICK_MS,
    MULTI_CLICK_PX,
    RESTART_DELAY_MS,
    VIEWPORT_DEBOUNCE_MS,
    URL_SYNC_INTERVAL_MS,
    wholeDelta,
    documentKey,
    PaneStream,
    QueueAbortError,
  }
})()

// ── src/pane-wire.ts ──
const H12 = (() => {
  const z = __externalDefault("@deepseek-ai/schemastery")
  /**
   * 实时视图的线上协议：SSE 帧/状态载荷、输入事件形状、各路由的边界 schema，
   * 以及 POST body 读取与 JSON 应答这两个小工具。
   *
   * 把这些放在一处，是为了让路由逻辑只对领域值做分支：每个请求体都在路由边界上由
   * schemastery 校验，路由本身不解析原始 JSON。
   *
   * @module dsh-browser-plugin/src/pane-wire
   */

                                                                  
                                                               

  /** 面板输入路由允许的最大 POST body 大小（字节）。 */
  const MAX_BODY_BYTES = 64 * 1024

  /** 推送给每个视图客户端的画面帧载荷（JSON 安全）。 */
                              
                                                   
                
                        
                 
                        
                  
                      
               
   

  /** 推送给视图客户端的浏览器存活状态（JSON 安全）。 */
                              
                   
               
                  
                                                  
                           
                                             
                   
   

  /** 视图客户端发来的一条输入事件（JSON 安全的线上形状）。 */
                                   
                                                                                    
             
             
                                                
                  
                  
                                                   
                     
               
                
                
                                                  
                     
   

  /** 视图输入路由的边界 schema。 */
  const PaneInputSchema = z.object({
    type: z.union([
      z.const('mouse-move'         ),
      z.const('mouse-down'         ),
      z.const('mouse-up'         ),
      z.const('wheel'         ),
      z.const('key-down'         ),
      z.const('key-up'         ),
    ]),
    x: z.number().default(0),
    y: z.number().default(0),
    button: z.union([
      z.const('left'         ),
      z.const('right'         ),
      z.const('middle'         ),
      z.const('none'         ),
    ]).default('left'         ),
    deltaX: z.number().default(0),
    deltaY: z.number().default(0),
    deltaMode: z.number().default(0),
    key: z.string().default(''),
    code: z.string().default(''),
    text: z.string().default(''),
    modifiers: z.number().default(0),
  })

  /** 视图导航路由的边界 schema。 */
  const PaneGotoSchema = z.object({
    url: z.string(),
  })

  /** 视图新建标签页路由的边界 schema。 */
  const PaneTabOpenSchema = z.object({
    url: z.string().default(''),
  })

  /** 视图切换/关闭标签页路由的边界 schema。 */
  const PaneTabIndexSchema = z.object({
    index: z.number(),
  })

  /**
   * 浏览器模式切换路由的边界 schema。
   *
   * 两值，必须与运行时 `BrowserMode` 严格一致：多出只声明不实现的一档，会让越界的请求
   * 通过校验、进而换掉一个正在工作的浏览器。
   */
  const PaneModeSchema = z.object({
    mode: z.union([z.const('own'         ), z.const('stealth'         )]),
  })

  /**
   * 视图上报面板尺寸的边界 schema。
   *
   * 面板尺寸是视图量出来的连续值，不是用户输入，因此这里只要求它是数字；真正的取值
   * 夹紧放在运行时里（那是所有调用方共享的合法性边界，而不是某一条路由的规矩）。
   */
  const PaneViewportSchema = z.object({
    width: z.number(),
    height: z.number(),
  })

  /** 视图路由应答的 JSON body。 */
                            
                  
                                    
                                                                                                   

  /** 以硬性大小上限把 POST body 读成原始文本。 */
  function readBody(req                 , limit = MAX_BODY_BYTES)                  {
    return new Promise((resolve, reject) => {
      const chunks           = []
      let size = 0
      let finished = false
      const fail = (error       )       => {
        if (finished) return
        finished = true
        reject(error)
      }
      req.on('data', (chunk        ) => {
        size += chunk.length
        if (size > limit) {
          fail(new Error('请求体过大'))
          req.destroy()
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => {
        if (finished) return
        finished = true
        resolve(Buffer.concat(chunks).toString('utf8'))
      })
      req.on('error', fail)
    })
  }

  /** 用一个 JSON body 应答某个请求。 */
  function json(res                , status        , value              )       {
    if (res.writableEnded) return
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(value))
  }

  /** 把一条路由处理器的异常统一转成 `{ok:false,message}` 应答。 */
  async function handleJsonRoute(
    res                ,
    run                             ,
  )                {
    try {
      json(res, 200, await run())
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      json(res, 400, { ok: false, message })
    }
  }
  return {
    MAX_BODY_BYTES,
    PaneInputSchema,
    PaneGotoSchema,
    PaneTabOpenSchema,
    PaneTabIndexSchema,
    PaneModeSchema,
    PaneViewportSchema,
    readBody,
    json,
    handleJsonRoute,
    z,
  }
})()

// ── src/pane.ts ──
const H13 = (() => {
  const { QueueAbortError } = H5
  const { PaneStream } = H11
  const { PaneGotoSchema, PaneInputSchema, PaneModeSchema, PaneTabIndexSchema, PaneTabOpenSchema, PaneViewportSchema, handleJsonRoute, readBody } = H12
  /**
   * 实时视图的宿主侧路由：在共享 Web 服务器上注册视图要用的全部端点。
   *
   * 路由只注册**一次**，每个请求按 `?session=<sessionId>` 分发到该会话自己的浏览器与它
   * 自己的实时视图（浏览器按会话隔离，见 `browser-sessions.ts`）。视图接入时把自己的会话
   * id 带在查询串上 —— 它来自槽位框架注入的 `sessionId`，与工具侧的 `exec.agent.id` 是
   * 同一个值。
   *
   * - `GET  /browser-pane/stream?session=…` —— SSE 画面流。帧来自 Chrome DevTools 协议的
   *   `Page.startScreencast`（只在画面变化时推 JPEG），因此视图是在“看”智能体所看
   *   的东西，而不是靠轮询截图。首个 `state` 事件告诉视图浏览器是否存活。
   * - `POST /browser-pane/input?session=…` —— 往页面注入合成输入（CDP `Input.dispatchMouseEvent`
   *   / `Input.dispatchKeyEvent`），正是它让视图成为双向遥控器，而不只是一路视频。
   * - `POST /browser-pane/goto?session=…` —— 从视图里导航该会话的页面。
   * - 标签页、模式与历史路由 —— 视图上的标签条、浏览器切换与前进/后退/刷新。
   *
   * 只有在存在 `webServer` 服务（Web 界面）时才会挂载。
   *
   * @module dsh-browser-plugin/src/pane
   */

                                                    
                                                  
                                                   
                                                                              

  // 仅类型：激活 cordis 对 `ctx.webServer` 的 Context 合并。
                                                       

  /** 实时视图路由基址。 */
  const PANE_BASE = '/browser-pane'

  /** 视图带自己会话 id 的查询参数名。 */
  const SESSION_PARAM = 'session'

  /**
   * 在共享 Web 服务器上注册视图路由。返回拆除函数；在没有 Web 服务器
   * （无头/TUI 组合）时返回 undefined。
   *
   * 会**驱动浏览器**的路由都从该会话的队列过（和它的工具调用同一个队列）。视图是同一条
   * 通路的第二个入口：不排队的话，人在侧边栏点一下就能插进智能体正在跑的调用中间。人类
   * 点击不该被无限阻塞，因此这里带一个等待上限。
   */
  function registerBrowserPane(
    ctx         ,
    sessions                 ,
    config                ,
  )                           {
    const webServer = ctx.get('webServer')
    if (!webServer) return undefined

    /** 这个请求属于哪个会话；没带就是无名会话（无视图的组合）。 */
    const sessionOf = (req                 )                => {
      const raw = new URL(req.url ?? '/', 'http://127.0.0.1').searchParams.get(SESSION_PARAM)
      return raw === null || raw === '' ? null : raw
    }

    /**
     * 取该请求对应的会话浏览器，并确保它的视图控制器已经备好。
     *
     * 视图控制器在这里懒建（而不是由工具侧建）：它代表「有一扇窗在看这只浏览器」，而只
     * 有视图路由才知道 Web 服务器确实存在。
     */
    const browserOf = (req                 )                 => {
      const entry = sessions.forSession(sessionOf(req))
      entry.stream ??= new PaneStream(entry.runtime, entry.queue)
      return entry
    }

    /**
     * 把一次会驱动浏览器的操作放进该会话的串行队列，带等待上限。
     *
     * 超时用自建的 `AbortController` 取消排队，因此不会在队列里留下幽灵条目 —— 超时
     * 之后它永远不会再突然开始驱动浏览器。
     */
    const enqueue = async (
      entry                ,
      label        ,
      run                             ,
    )                        => {
      const controller = new AbortController()
      const timer = setTimeout(() => { controller.abort() }, config.queueTimeoutMs)
      try {
        return await entry.queue.run(`${PANE_BASE}${label}`, controller.signal, run)
      } catch (error) {
        if (error instanceof QueueAbortError) {
          return {
            ok: false,
            message: `智能体正在使用本对话的浏览器，请稍后重试（已等待 ${String(Math.round(config.queueTimeoutMs / 1000))} 秒）。`,
          }
        }
        throw error
      } finally {
        clearTimeout(timer)
      }
    }

    /** 注册一条会驱动浏览器的 POST 路由：读 body、按 schema 解析、排队执行。 */
    const post =    (
      path        ,
      parse                     ,
      run                                                            ,
    )               => webServer.register({
      kind: 'exact',
      path: `${PANE_BASE}${path}`,
      handler: async (req, res) => {
        await handleJsonRoute(res, async () => {
          const raw = await readBody(req)
          const value = parse(JSON.parse(raw))
          const entry = browserOf(req)
          return enqueue(entry, path, () => run(entry, value))
        })
      },
    })

    /** 注册一条无 body、会驱动浏览器的 POST 路由。 */
    const action = (
      path        ,
      run                                                  ,
    )               => webServer.register({
      kind: 'exact',
      path: `${PANE_BASE}${path}`,
      handler: async (req, res) => {
        await handleJsonRoute(res, async () => {
          const entry = browserOf(req)
          return enqueue(entry, path, () => run(entry))
        })
      },
    })

    const disposeStream = webServer.register({
      kind: 'exact',
      path: `${PANE_BASE}/stream`,
      handler: (req, res) => {
        const entry = browserOf(req)
        const stream = entry.stream
        if (stream === undefined) return
        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        })
        res.write('retry: 2000\n\n')
        stream.addClient(res)
        // 重放当前状态、标签页集合与最后一帧，让迟到或刚刷新的视图立刻是最新的。
        stream.send(res, 'state', stream.state())
        stream.send(res, 'tabs', stream.tabs())
        const frame = stream.frame()
        if (frame !== null) stream.send(res, 'frame', frame)
        void stream.startScreencast()
        void entry.runtime.tabs().then(tabs => stream.send(res, 'tabs', tabs)).catch(() => {})
        req.on('close', () => {
          stream.removeClient(res)
        })
      },
    })

    const disposeInput = post('/input', (raw) => PaneInputSchema(raw), async (entry, event) => {
      await entry.stream?.dispatchInput(event)
      return { ok: true }
    })

    const disposeGoto = post('/goto', (raw) => PaneGotoSchema(raw), async (entry, request) => {
      return { ok: true, result: await entry.runtime.goto(request.url) }
    })

    const disposeTabOpen = post('/tab-open', (raw) => PaneTabOpenSchema(raw), async (entry, request) => {
      return { ok: true, result: await entry.runtime.openTab(request.url) }
    })

    const disposeTabSwitch = post('/tab-switch', (raw) => PaneTabIndexSchema(raw), async (entry, request) => {
      return { ok: true, result: await entry.runtime.switchTab(request.index) }
    })

    const disposeTabClose = post('/tab-close', (raw) => PaneTabIndexSchema(raw), async (entry, request) => {
      return { ok: true, result: await entry.runtime.closeTab(request.index) }
    })

    const disposeMode = post('/mode', (raw) => PaneModeSchema(raw), async (entry, request) => {
      const tabs = await entry.runtime.switchMode(request.mode)
      entry.stream?.clearFrame()
      entry.stream?.setState({
        active: true,
        url: tabs.find(row => row.active)?.url ?? '',
        mode: entry.runtime.currentMode(),
      })
      entry.stream?.setTabs(tabs)
      void entry.stream?.startScreencast()
      return { ok: true, result: tabs }
    })

    // 视图报告面板可用尺寸：该会话页面的视口随后跟着面板的形状走，于是画面铺满侧边栏，
    // 而不是留一大块空白。
    //
    // 这条路由**不**在 HTTP 边界排队：它只是登记一个目标尺寸，真正的变更发生在流控制器
    // 防抖 200ms 之后（拖动侧边栏时每帧都上报，逐个排队毫无意义）。排队在变更点做 ——
    // 见 `PaneStream` 里的 `applyViewport`。因此这里可以让请求立刻返回。
    const disposeViewport = webServer.register({
      kind: 'exact',
      path: `${PANE_BASE}/viewport`,
      handler: async (req, res) => {
        await handleJsonRoute(res, async () => {
          const raw = await readBody(req)
          const request = PaneViewportSchema(JSON.parse(raw))
          browserOf(req).stream?.requestViewport(request.width, request.height)
          return { ok: true }
        })
      },
    })

    const disposeBack = action('/back', async (entry) => ({ ok: true, result: await entry.runtime.back() }))
    const disposeForward = action('/forward', async (entry) => ({ ok: true, result: await entry.runtime.forward() }))
    const disposeReload = action('/reload', async (entry) => ({ ok: true, result: await entry.runtime.reload() }))

    return () => {
      disposeStream()
      disposeInput()
      disposeGoto()
      disposeTabOpen()
      disposeTabSwitch()
      disposeTabClose()
      disposeMode()
      disposeViewport()
      disposeBack()
      disposeForward()
      disposeReload()
    }
  }
  return {
    PANE_BASE,
    SESSION_PARAM,
    registerBrowserPane,
    QueueAbortError,
    PaneStream,
    PaneGotoSchema,
    PaneInputSchema,
    PaneModeSchema,
    PaneTabIndexSchema,
    PaneTabOpenSchema,
    PaneViewportSchema,
    handleJsonRoute,
    readBody,
  }
})()

// ── src/index.ts ──
const H14 = (() => {
  const { Config } = H1
  const { registerBrowserTools } = H3
  const { registerBrowserSkills } = H4
  const { BrowserSessions } = H10
  const { BrowserRuntime } = H9
  const { PaneStream } = H11
  const { registerBrowserPane } = H13
  const { BrowserQueue, QueueAbortError } = H5
  const { ownershipFrom, gateTool, SUBAGENT_DENIED } = H2
  /**
   * dsh-browser-plugin 宿主侧入口：为 DeepSeek Harness 提供**按会话隔离**的 Chrome。
   *
   * 在宿主的 `tools` 注册表上注册浏览工具：
   *   - `browser_goto`       —— 导航并摘要一个页面
   *   - `browser_evaluate`   —— 在页面里跑 JS，返回 JSON
   *   - `browser_screenshot` —— 截取 PNG/JPEG 的 data URL
   *   - 以及点击/输入/读取/等待/无障碍树等结构化工具
   *
   * 浏览器引擎沿用 zenbu-labs/terminal-browser 的分支：把原来的 React Ink 终端界面
   * 换成 DSH 的工具面，外加一个**右侧边栏标签页**里的实时视图。Chrome 由本 Node
   * 运行时通过 `puppeteer-core` 直接拉起（独立的操作系统进程），因此浏览器崩溃不会
   * 拖垮 harness。
   *
   * 与更早版本的差异：**每个会话一只 Chrome、一份独立 profile**（见
   * `browser-sessions.ts`）。此前所有对话共用一只，登录态因此是隐式共享的，跨会话争用也
   * 要靠一把全局锁压住；现在两侧都按会话分：工具侧取 `exec.agent.id`，视图侧取槽位框架
   * 注入的 `sessionId`（实测两者完全一致）。
   *
   * @module dsh-browser-plugin/src/index
   */

                                                    
  // 仅类型导入：激活 cordis 对 `ctx.tools` 与 `ctx.skills` 的 Context 合并。
                                              
                                              

  // 重新导出 schemastery 的 `Config`：cordis 的插件加载器要用它校验原始 profile
  // 配置，并在 `apply` 运行之前补上默认值。
  //
  // `BrowserQueue`/`PaneStream`/`BrowserSessions`/`BrowserRuntime` 也一并导出：不是给加载器
  // 用的，而是给测试用的 —— 「同一会话内只有一个调用在驱动浏览器」「按会话隔离」「切换模式
  // 会把当前地址带过去」这些保证都住在它们里面，而测试应该跑在**构建产物**上（源码里的
  // `./x.js` 说明符在 Node 下解析不到同名的 `.ts`）。它们在这里是值绑定，因此 `moduleFaces`
  // 能把它们转发出去。
  /** cordis 插件名，用于加载器诊断。 */
  const name = 'dsh-browser-plugin'

  /** 本插件依赖的服务；`tools` 与 `skills` 是它要消费的东西。 */
  const inject = ['tools', 'skills']

  /**
   * 套用插件：注册浏览工具与打包技能，并在 Web 服务器就绪后挂上实时视图路由。
   *
   * 工具与技能绑定在本插件 fiber 上，因此它们的拆除函数在一个 `ctx.effect` 生成器里
   * 被收集并 yield（递归模式）：卸载插件会关掉所有会话的 Chrome 并注销工具与技能。
   *
   * 视图路由则必须**等** `webServer` 真正存在再注册，不能用 `ctx.get('webServer')` 顺手
   * 探一下：插件可能在 Web 服务器挂载之前就被应用（排列顺序由 profile 的补丁层决定，
   * 不是本插件能假设的），那时服务还不存在，探到的是 `undefined`。而 fiber 一旦跑完，
   * 就再没有人会因为服务后来出现而回头补跑一次 —— 结果是浏览器工具一切正常、视图路由
   * 却整批缺失，表现为侧边栏能打开标签页但画面永远是空的，而且没有任何报错。
   *
   * `ctx.inject(['webServer'], …)` 正是为这种情况准备的：它建一个子 fiber，服务就绪时
   * 才执行回调，服务缺席时该子 fiber 保持待命。因此没有 Web 服务器的组合（无头/TUI）
   * 不会因为这条依赖而永远不激活，只是不会有视图。
   */
  function apply(ctx         , config        )       {
    // 安全性：cordis 已在 `apply` 运行之前用导出的 `Config` schema 校验原始 profile
    // 配置并补齐全部默认值，因此运行时对象恰好带有下面这个类型所声明的已解析字段。
    const resolved = config                  

    // 按会话管理浏览器：一个实例持有全部会话的运行时、各自的锁与各自的视图。
    const sessions = new BrowserSessions(resolved, ownershipFrom(ctx.get('agents')))

    ctx.effect(function* () {
      const disposers = registerBrowserTools(ctx, resolved, sessions)
      const disposeSkills = registerBrowserSkills(ctx)
      yield () => {
        for (const dispose of disposers) dispose()
        for (const dispose of disposeSkills) dispose()
        void sessions.dispose()
      }
    })

    if (resolved.pane) {
      // 子 fiber 的生命周期挂在父 fiber 上：卸载插件时视图路由一并撤下。
      ctx.inject(['webServer'], (scoped         ) => registerBrowserPane(scoped, sessions, resolved))
    }
  }
  return {
    name,
    inject,
    apply,
    Config,
    registerBrowserTools,
    registerBrowserSkills,
    BrowserSessions,
    BrowserRuntime,
    PaneStream,
    registerBrowserPane,
    BrowserQueue,
    QueueAbortError,
    ownershipFrom,
    gateTool,
    SUBAGENT_DENIED,
  }
})()

// ── 入口模块的导出（cordis 读取 name / inject / apply 与 Config） ──────────
export const name = H14.name
export const inject = H14.inject
export const apply = H14.apply
export const Config = H14.Config
export const BrowserQueue = H14.BrowserQueue
export const QueueAbortError = H14.QueueAbortError
export const PaneStream = H14.PaneStream
export const gateTool = H14.gateTool
export const ownershipFrom = H14.ownershipFrom
export const SUBAGENT_DENIED = H14.SUBAGENT_DENIED
export const BrowserSessions = H14.BrowserSessions
export const BrowserRuntime = H14.BrowserRuntime
