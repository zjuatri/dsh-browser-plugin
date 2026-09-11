//! 自动生成，请勿直接编辑 —— 由 scripts/build-client.mjs 从 src/client/*.ts 生成。
//!
//! 本文件是 DSH 的 lazy-CJS 客户端插件格式：执行它只会**注册**工厂，什么都不会
//! 运行；真正的模块体（含样式注入）在模块系统实体化插件时才执行。
//! 包装、`id` 与 `apply`/`inject` 导出就是全部契约。
//!
//! 只允许 require 平台种子说明符：`react`、`react/jsx-runtime`、`react-dom`、
//! `react-dom/client`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-store`、
//! `@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives`、
//! `@deepseek-ai/dsh-client-ui-dockkit`。其余一切都已内联在本文件里。
window.__ModuleLoader__.load({
  id: "dsh-browser-plugin",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const react = require("react");
    const h = react.createElement;
    // React 的具名导出也属于平台种子：各模块会从 react 具名导入 useState 等，
    // 因此这里在工厂作用域里绑定一次，模块内的具名解构才有东西可解构。
    const { useEffect, useLayoutEffect, useMemo, useReducer, useCallback, useRef, useState, useContext, useSyncExternalStore, Fragment, memo, forwardRef, createContext, createElement, cloneElement, Children } = react;

    // ── src/client/input.ts ──
    const M1 = (() => {
    /**
     * 视图上的输入映射：把 DOM 事件翻译成 CDP 期望的取值。
     *
     * 这些函数很小，但它们是画面（一张 `<img>`）与真实页面之间唯一的语义层，单独放
     * 一处以免散落在事件处理器里。
     *
     * @module dsh-browser-plugin/src/client/input
     */

                                                                 

    /** 把 DOM 的 button 下标映射为 CDP 的鼠标键名。 */
    function mouseButton(button        )                                       {
      if (button === 1) return 'middle'
      if (button === 2) return 'right'
      return 'left'
    }

    /** 由 DOM 事件算出 CDP 修饰键位掩码（alt=1、ctrl=2、meta=4、shift=8）。 */
    function modBits(event                                                                            )         {
      return (event.altKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) | (event.metaKey ? 4 : 0) | (event.shiftKey ? 8 : 0)
    }

    /** 交给 CDP 的可打印键文本；控制键返回 undefined。 */
    function keyText(key        )                     {
      return key.length === 1 ? key : undefined
    }

    /**
     * 把一次键盘按下翻译成 CDP 所需的 `text`。
     *
     * 带修饰键时不给文本：Ctrl+C 必须是复制，而不是打出字母 c。回车给换行符
     * （参考模型），这样 textarea 与表单能收到它。
     */
    function keyDownText(event                                                                      )                     {
      if (event.ctrlKey || event.metaKey || event.altKey) return undefined
      if (event.key === 'Enter') return '\r'
      return keyText(event.key)
    }

    /** 键盘按下后是否应当阻止浏览器默认行为（否则按键会被 GUI 自己吃掉）。 */
    function shouldPreventKeyDefault(text                    , key        )          {
      return text !== undefined || key === 'Backspace' || key === 'Delete'
    }

    /**
     * 把视口内的指针坐标换算成画面帧的设备坐标。
     *
     * @param rect - `<img>` 的包围盒。
     * @param frame - 当前帧（其 width/height 是设备坐标）。
     * @param clientX - 指针的视口 X 坐标。
     * @param clientY - 指针的视口 Y 坐标。
     * @returns 设备坐标；包围盒退化时返回 null。
     */
    function toDevice(
      rect                                                              ,
      frame           ,
      clientX        ,
      clientY        ,
    )                                  {
      if (rect.width <= 0 || rect.height <= 0) return null
      return {
        x: (clientX - rect.left) / rect.width * frame.width,
        y: (clientY - rect.top) / rect.height * frame.height,
      }
    }

    /** 组装一条鼠标输入消息。 */
    function mouseMessage(
      type                                          ,
      x        ,
      y        ,
      button                                      ,
      modifiers        ,
    )                   {
      return { type, x, y, button, modifiers }
    }
      return {
        mouseButton,
        modBits,
        keyText,
        keyDownText,
        shouldPreventKeyDefault,
        toDevice,
        mouseMessage,
      }
    })()

    // ── src/client/icons.ts ──
    const M2 = (() => {
    /**
     * 本插件用到的图标。
     *
     * 两类：
     *
     * - `ChromeGlyph` —— 右侧边栏指南页里「浏览器」入口的 Chrome 标。指南页的入口卡片会
     *   画在 `sidebar.right.pane.tab` 的空态上，卡片左边那格 glyph 由贡献该类型的包自己
     *   提供（`SidebarRightGuideEntry.icon`）；不给就退化成产品自带的立方体占位图。
     * - `ArrowLeftGlyph`/`ArrowRightGlyph`/`ReloadGlyph` —— 视图工具栏上的后退、前进与刷新。
     *   此前用的是 `‹` `›` `⟳` 三个字符，字号与形状都跟着字体走（不同平台差很多），换成
     *   描边图标后三个按钮的视觉重量一致。
     *
     * 为什么内联而不是放一个 `.svg` 文件：客户端半边交付的是一个 lazy-CJS 插件产物
     * （`lib/client.js`），没有资源管线，也没有 fetch 图标的时机 —— 图标必须在渲染时
     * 就是代码。图标用 `createElement` 手写，理由同 `browser-tab.tsx`：产物没有 JSX
     * 转换步骤。
     *
     * 两点与原始 SVG 的差异，都是为了在页面里不打架：
     *
     * - 高亮那圈蓝环的渐变 `id` 由 `a` 改成带包名的名字。内联 SVG 的 `id` 是**全文档**
     *   可见的，`url(#a)` 会命中页面上第一个叫 `a` 的元素 —— 别的内联图标正好用了这个
     *   名字时，蓝环就会变成别人的渐变。
     * - `width`/`height` 固定用的 `2491`/`2500` 换成槽位给的 `size`，让图标跟着宿主的
     *   字号走；`viewBox` 原样保留，所以任何尺寸下比例都不变。
     *
     * 配色上分两种：Chrome 标是 Chrome 的品牌色，刻意不走 `currentColor`（它不是跟随主题
     * 的单色线性图标，而是一枚识别标志）；工具栏那三个是单色描边图标，用 `currentColor`，
     * 于是跟随按钮的文字颜色，亮/暗主题与 hover 态都自动一致。
     *
     * @module dsh-browser-plugin/src/client/icons
     */


    /** 图标组件收到的属性，与 DSH `IconProps` 的形状一致。 */
                                
                                          
                            
                                     
                                 
     

    /** 高亮蓝环所用渐变的 `id`：带上包名，避免和页面上别的内联 SVG 撞车。 */
    const RIM_GRADIENT_ID = 'dsh-browser-plugin-chrome-rim'

    /**
     * Chrome 标。
     *
     * 八个色块按原图顺序叠放（红 / 黄 / 绿 / 深绿 / 白底 / 蓝环 / 黄 / 深红），
     * 因此遮挡关系与原图一致；渐变定义提到最前面只是组织上的选择，SVG 的 `defs`
     * 与绘制顺序无关。
     *
     * @param props - 渲染边长与类名。
     * @returns 一个可缩放的内联 Chrome 标。
     */
    function ChromeGlyph({ size = 16, className }           )               {
      return h('svg', {
        xmlns: 'http://www.w3.org/2000/svg',
        width: size,
        height: size,
        viewBox: '0 0 435.816 437.46',
        className,
        'aria-hidden': 'true',
        focusable: 'false',
      },
        h('defs', null,
          h('linearGradient', {
            id: RIM_GRADIENT_ID,
            gradientUnits: 'userSpaceOnUse',
            x1: '-829.128',
            y1: '1417.339',
            x2: '-829.128',
            y2: '1261.441',
            gradientTransform: 'matrix(1 0 0 -1 1045.93 1557.636)',
          },
            h('stop', { offset: '0', stopColor: '#a2c0e6' }),
            h('stop', { offset: '1', stopColor: '#406cb1' }))),
        h('path', {
          fill: '#c6352e',
          d: 'M217.341.039s128.478-5.783 196.57 123.337H206.416s-39.188-1.289-72.593 46.255c-9.634 19.916-19.91 40.473-8.349 80.937C108.773 222.309 36.823 97.04 36.823 97.04S87.578 5.176 217.341.039z',
        }),
        h('path', {
          fill: '#f4d911',
          d: 'M407.223 327.871s-59.247 114.143-205.118 108.533c17.995-31.148 103.772-179.682 103.772-179.682s20.709-33.289-3.744-85.991c-12.431-18.305-25.09-37.486-65.919-47.713 32.836-.326 177.285.021 177.285.021s54.168 89.891-6.276 204.832z',
        }),
        h('path', {
          fill: '#81b354',
          d: 'M28.373 328.738s-69.224-108.395 8.58-231.908c17.979 31.16 103.71 179.72 103.71 179.72s18.469 34.578 76.341 39.756c22.061-1.609 45.007-2.982 74.279-33.223-16.139 28.594-88.673 153.521-88.673 153.521S97.681 438.56 28.373 328.738z',
        }),
        h('path', {
          fill: '#7baa50',
          d: 'M202.105 437.46l29.187-121.793s32.092-2.504 58.982-32.017c-16.693 29.365-88.169 153.81-88.169 153.81z',
        }),
        h('path', {
          fill: '#fff',
          d: 'M119.59 220.093c0-53.69 43.52-97.215 97.215-97.215 53.69 0 97.214 43.524 97.214 97.215 0 53.693-43.522 97.219-97.214 97.219-53.695 0-97.215-43.525-97.215-97.219z',
        }),
        h('path', {
          fill: `url(#${RIM_GRADIENT_ID})`,
          d: 'M135.86 220.093c0-44.702 36.238-80.941 80.945-80.941 44.698 0 80.94 36.239 80.94 80.941 0 44.703-36.242 80.945-80.94 80.945-44.707.001-80.945-36.244-80.945-80.945z',
        }),
        h('path', {
          fill: '#e7ce12',
          d: 'M413.5 123.039l-120.183 35.237s-18.123-26.596-57.104-35.258c33.776-.115 177.287.021 177.287.021z',
        }),
        h('path', {
          fill: '#bc332c',
          d: 'M123.137 246.197c-16.89-29.25-86.31-149.16-86.31-149.16l89.029 88.07s-9.149 18.82-5.68 45.7l2.961 15.39z',
        }))
    }

    /** 工具栏描边图标的公共属性：48×48 视框、线宽 3、圆头圆角、跟随文字颜色。 */
    function strokeIcon(props           , children                )               {
      const { size = 16, className } = props
      return h('svg', {
        xmlns: 'http://www.w3.org/2000/svg',
        width: size,
        height: size,
        viewBox: '0 0 48 48',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 3,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        className,
        'aria-hidden': 'true',
        focusable: 'false',
      }, ...children)
    }

    /** 后退（左箭头）。 */
    function ArrowLeftGlyph(props           )               {
      return strokeIcon(props, [
        h('path', { d: 'M5.79889 24H41.7989' }),
        h('path', { d: 'M17.7988 36L5.79883 24L17.7988 12' }),
      ])
    }

    /** 前进（右箭头）。 */
    function ArrowRightGlyph(props           )               {
      return strokeIcon(props, [
        h('path', { d: 'M41.9999 24H5.99994' }),
        h('path', { d: 'M30 12L42 24L30 36' }),
      ])
    }

    /** 刷新（两个缺口圆弧 + 两段端头）。 */
    function ReloadGlyph(props           )               {
      return strokeIcon(props, [
        h('path', { d: 'M42 8V24' }),
        h('path', { d: 'M6 24L6 40' }),
        h('path', { d: 'M42 24C42 14.0589 33.9411 6 24 6C18.9145 6 14.3216 8.10896 11.0481 11.5M6 24C6 33.9411 14.0589 42 24 42C28.8556 42 33.2622 40.0774 36.5 36.9519' }),
      ])
    }
      return {
        RIM_GRADIENT_ID,
        ChromeGlyph,
        strokeIcon,
        ArrowLeftGlyph,
        ArrowRightGlyph,
        ReloadGlyph,
        h,
      }
    })()

    // ── src/client/text.ts ──
    const M3 = (() => {
    /**
     * 浏览器标签页的全部界面文案（简体中文 + 英文）。
     *
     * 默认语言是中文：DSH 会按当前界面语言在 `zh`/`en` 之间挑选，`zh` 是这里的主
     * 文案。所有面向用户的字符串都必须出现在本文件里 —— 组件里不允许有硬编码文案，
     * 否则翻译会随代码漂移。
     *
     * @module dsh-browser-plugin/src/client/text
     */

    /** 文案命名空间（必须与本文件注册所用的命名空间一致）。 */
    const NS = 'browserTab'

    /** 中文文案（默认语言）。 */
    const zh = {
      'tab.title': '浏览器',
      'tab.guide.title': '浏览器',
      'tab.guide.description': '查看并操作本对话的 Chrome（每个对话各自一只，登录态互不可见）',

      'state.live': '已连接',
      'state.idle': '未启动',
      'state.idleHint': '本对话的浏览器还没有打开任何页面。在上面的地址栏里输入网址开始浏览，或者直接让智能体去浏览。',
      'state.error': '浏览器出错了：{message}',

      'nav.back': '后退',
      'nav.forward': '前进',
      'nav.reload': '刷新',
      'nav.go': '打开',
      'nav.addressPlaceholder': '输入网址或搜索内容',

      'tabs.new': '新建标签页',
      'tabs.close': '关闭标签页',
      'tabs.untitled': '新标签页',

      'mode.legend': '智能体使用哪个浏览器',
      'mode.own': '无头',
      'mode.stealth': '插件',
      'mode.own.title': '使用插件自带的无头 Chrome',
      'mode.stealth.title': '使用插件启动的独立 Chrome 窗口（持久 profile，更不容易被识别为自动化）',
      'mode.switching': '正在切换浏览器…',

      'state.busy': '智能体正在使用本对话的浏览器，正在排队…',
      'view.live': '实时画面',
    }         

    /** 英文文案。 */
    const en                                  = {
      'tab.title': 'Browser',
      'tab.guide.title': 'Browser',
      'tab.guide.description': 'View and drive this conversation\'s Chrome (one per conversation; logins are not shared)',

      'state.live': 'Connected',
      'state.idle': 'Not started',
      'state.idleHint': 'This conversation\'s browser has no page open yet. Type a URL in the address bar above to start browsing, or just ask the agent to browse.',
      'state.error': 'Browser error: {message}',

      'nav.back': 'Back',
      'nav.forward': 'Forward',
      'nav.reload': 'Reload',
      'nav.go': 'Go',
      'nav.addressPlaceholder': 'Enter a URL or search',

      'tabs.new': 'New tab',
      'tabs.close': 'Close tab',
      'tabs.untitled': 'New tab',

      'mode.legend': 'Which browser the agent uses',
      'mode.own': 'Headless',
      'mode.stealth': 'Plugin',
      'mode.own.title': 'Use the headless Chrome that ships with the plugin',
      'mode.stealth.title': 'Use a separate Chrome window launched by the plugin (persistent profile, less detectable as automation)',
      'mode.switching': 'Switching browser…',

      'state.busy': 'The agent is using this conversation\'s browser — queued…',
      'view.live': 'Live view',
    }

    /** 把 `{name}` 占位符替换成实际值。 */
    function fill(template        , values                        )         {
      return template.replace(/\{(\w+)\}/gu, (match, key        ) => values[key] ?? match)
    }

    /**
     * 本插件用到的翻译函数形状。
     *
     * 之所以在这里声明而不是从 locale 包导入完整类型：插件对客户端包只做平台种子式
     * 的 `require`，本地声明让客户端半边可以独立类型检查（也能单独测试），而注册时
     * 传入的真实绑定在结构上与本类型兼容。
     */
      return {
        NS,
        zh,
        en,
        fill,
      }
    })()

    // ── src/client/state.ts ──
    const M4 = (() => {
    /**
     * 浏览器标签页的状态层：订阅宿主的 SSE 画面流，并封装各条 POST 路由。
     *
     * 视图只是这份状态的一个渲染结果；“共享页面在做什么”完全由画面流事件驱动，因此
     * 组件里不需要轮询。
     *
     * @module dsh-browser-plugin/src/client/state
     */


    /** 一帧画面（对应宿主 pane-wire 的载荷）。 */
                                
                  
                   
                    
                 
     

    /** 浏览器存活状态（对应宿主 pane-wire 的载荷）。 */
                                
                     
                 
                    
                       
                                                
                     
     

    /** 一行标签页（对应宿主 TabInfo 载荷）。 */
                              
                   
                 
                   
                     
     

    /**
     * 智能体所使用的浏览器种类。
     *
     * 只有两值，与运行时 `BrowserMode` 一致：`own` 是无头 puppeteer 启动，`stealth` 是
     * 插件自己拉起的持久 profile Chrome（走 CDP 挂载）。**不存在**「连我自己开的 Chrome」
     * 这一档 —— 它曾被移除，因为 stealth 已经覆盖了同一种需求（持久 profile、真实指纹），
     * 而多一个只声明不实现的选项，会让视图上出现一个按下去会换掉浏览器的按钮。
     */
                                               

    /** 视图发往宿主的输入消息。 */
                                  
                                                                                                                                                 
                                                                                                                     
                                                                                         
                                                                        

    /** 各条 POST 路由接受的 body。 */
                              
                        
                        
                         
                                                 
                             

    /**
     * 把会话 id 拼进路由地址。
     *
     * 浏览器按会话隔离（宿主侧见 `browser-sessions.ts`），因此视图必须自报家门：不带会话
     * 参数就落到「无名会话」那只浏览器上，看到的不是本对话的画面。会话 id 由右侧边栏的槽位
     * 框架注入到正文组件的 props 里（与工具侧的 `exec.agent.id` 是同一个值）。
     *
     * @param path - 路由路径（`/stream`、`/input` 等）。
     * @param sessionId - 本视图所属的会话；缺失时退化为无名会话。
     * @returns 带 `?session=` 的完整路径。
     */
    function paneRoute(path        , sessionId         )         {
      if (sessionId === undefined || sessionId === '') return `/browser-pane${path}`
      return `/browser-pane${path}?session=${encodeURIComponent(sessionId)}`
    }

    /** 往宿主路由发一条 POST，失败时静默（画面流会体现真实状态）。 */
    function post(path        , body              , sessionId         )       {
      void fetch(paneRoute(path, sessionId), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }).catch(() => {})
    }

    /** 画面流与标签页状态的实时快照。 */
                                   
                             
                      
                     
     

    /**
     * 订阅本会话的 SSE 画面流。`EventSource` 自己会重连，因此这里不需要重试逻辑。
     *
     * @param sessionId - 本视图所属的会话；变化时重新订阅（换会话就该换一只浏览器）。
     * @returns 当前的画面/状态/标签页快照。
     */
    function usePaneStream(sessionId         )               {
      const [frame, setFrame] = useState                  (null)
      const [state, setState] = useState           ({ active: false, url: '', mode: 'own' })
      const [tabs, setTabs] = useState           ([])

      useEffect(() => {
        const source = new EventSource(paneRoute('/stream', sessionId))
        source.addEventListener('frame', (event) => {
          // 安全性：这条通道只由本插件自己的宿主侧（同一个包）提供，写入的就是它自己
          // 产生的 PaneFrame JSON —— 第三方无法往这个事件名上塞别的载荷。
          const payload = JSON.parse((event                        ).data)             
          setFrame(payload)
          setState(previous => ({ ...previous, active: true, url: payload.url, error: undefined }))
        })
        source.addEventListener('state', (event) => {
          // 安全性：与上面的 frame 监听同属本包独占的通道；宿主侧只会发出它自己产生的
          // PaneState JSON。
          setState(JSON.parse((event                        ).data)             )
        })
        source.addEventListener('tabs', (event) => {
          // 安全性：同属本包独占通道；宿主侧只发出它为这个视图生成的 TabInfo 行。
          setTabs(JSON.parse((event                        ).data)             )
        })
        return () => { source.close() }
      }, [sessionId])

      return { frame, state, tabs }
    }
      return {
        paneRoute,
        post,
        usePaneStream,
        useEffect,
        useState,
      }
    })()

    // ── src/client/browser-live.tsx ──
    const M5 = (() => {
      const { keyDownText, modBits, mouseButton, mouseMessage, shouldPreventKeyDefault, toDevice } = M1
      const { ArrowLeftGlyph, ArrowRightGlyph, ReloadGlyph } = M2
      const { fill } = M3
      const { post } = M4
    /**
     * 实时视图组件：画面帧的渲染，以及把指针/键盘事件送回宿主。
     *
     * 这里刻意使用 `React.createElement`（不用 JSX）：客户端产物由本包手写为 DSH 的
     * lazy-CJS 插件格式，没有 JSX 转换步骤，`react` 本身是外壳提供的平台模块。
     *
     * @module dsh-browser-plugin/src/client/browser-live
     */


    /** 实时视图组件的属性。 */
                                       
                  
                             
                      
         
                             
        
                                                  
                       
         
                        
                                      
                         
                               
                                   
         
                     
        
                                              
                             
         
                                                      
     

    /** 画面上仍被按住的键（code -> key），离开焦点时释放。 */
                                       

    /** 活动画面的两向遥控视图。 */
    function BrowserLive(props                  )            {
      const { t, frame, state, sessionId, toolbar, onOpen, viewRef } = props
      const imgRef = useRef                         (null)
      const heldRef = useRef          (new Map())
      const addrFocusRef = useRef(false)

      /** 把指针事件换算到设备坐标后发往宿主。 */
      const send = useCallback((event                                      , build   
                                        
                         
               )       => {
        const img = imgRef.current
        if (!img || !frame) return
        const point = toDevice(img.getBoundingClientRect(), frame, event.clientX, event.clientY)
        if (!point) return
        build(point, frame)
      }, [frame, sessionId])

      const onMouseDown = (event                                   )       => {
        send(event, (point) => {
          post('/input', mouseMessage('mouse-down', point.x, point.y, mouseButton(event.button), modBits(event)), sessionId)
        })
      }

      const onMouseUp = (event                                   )       => {
        send(event, (point) => {
          post('/input', mouseMessage('mouse-up', point.x, point.y, mouseButton(event.button), modBits(event)), sessionId)
        })
      }

      const onMouseMove = (event                                   )       => {
        // 只在按住拖动时上报移动：页面里的 hover 效果不值得为每一次指针移动付一次
        // 往返（CDP 的 mouseMoved 也不便宜）。
        if (event.buttons === 0) return
        send(event, (point) => {
          post('/input', mouseMessage('mouse-move', point.x, point.y, mouseButton(event.button), modBits(event)), sessionId)
        })
      }

      const onWheel = (event                                   )       => {
        send(event, (point) => {
          post('/input', {
            type: 'wheel',
            x: point.x,
            y: point.y,
            deltaX: event.deltaX,
            deltaY: event.deltaY,
            deltaMode: event.deltaMode,
            modifiers: modBits(event),
          }, sessionId)
        })
      }

      const onKeyDown = (event                                      )       => {
        if (!event.repeat && event.code !== '') heldRef.current.set(event.code, event.key)
        const text = keyDownText(event)
        post('/input', {
          type: 'key-down',
          key: event.key,
          code: event.code,
          text,
          modifiers: modBits(event),
        }, sessionId)
        if (shouldPreventKeyDefault(text, event.key)) event.preventDefault()
      }

      const onKeyUp = (event                                      )       => {
        heldRef.current.delete(event.code)
        post('/input', {
          type: 'key-up',
          key: event.key,
          code: event.code,
          modifiers: modBits(event),
        }, sessionId)
      }

      /** 焦点离开画面时，释放仍被按住的键，免得页面以为它们一直按着。 */
      const onBlur = ()       => {
        for (const [code, key] of heldRef.current) {
          post('/input', { type: 'key-up', key, code, modifiers: 0 }, sessionId)
        }
        heldRef.current.clear()
      }

      /** 地址栏获得焦点时，键应该交给输入框而不是页面。 */
      const onAddrFocus = ()       => { addrFocusRef.current = true }
      const onAddrBlur = ()       => { addrFocusRef.current = false }

      const onSubmit = (event                            )       => {
        event.preventDefault()
        const input = event.currentTarget.elements.namedItem('address')
        if (!(input instanceof HTMLInputElement)) return
        const url = input.value.trim()
        if (!url) return
        onOpen(url)
      }

      const live = state.active && frame !== null
      const driver = state.driver

      const view = live
        ? h('img', {
          ref: imgRef,
          className: 'dsh-browser-frame',
          src: `data:image/jpeg;base64,${frame.data}`,
          alt: t('view.live'),
          tabIndex: 0,
          draggable: false,
          onMouseDown,
          onMouseUp,
          onMouseMove,
          onWheel,
          onKeyDown,
          onKeyUp,
          onBlur,
        })
        : h('div', { className: 'dsh-browser-note', 'data-tone': state.error ? 'error' : undefined },
          state.error ? fill(t('state.error'), { message: state.error }) : t('state.idleHint'))

      return h('div', { className: 'dsh-browser-root' },
        h('div', { className: 'dsh-browser-bar' },
          h('button', {
            type: 'button',
            className: 'dsh-browser-btn',
            title: t('nav.back'),
            'aria-label': t('nav.back'),
            onClick: () => { post('/back', { action: 'back' }, sessionId) },
          }, h(ArrowLeftGlyph, null)),
          h('button', {
            type: 'button',
            className: 'dsh-browser-btn',
            title: t('nav.forward'),
            'aria-label': t('nav.forward'),
            onClick: () => { post('/forward', { action: 'forward' }, sessionId) },
          }, h(ArrowRightGlyph, null)),
          h('button', {
            type: 'button',
            className: 'dsh-browser-btn',
            title: t('nav.reload'),
            'aria-label': t('nav.reload'),
            onClick: () => { post('/reload', { action: 'reload' }, sessionId) },
          }, h(ReloadGlyph, null)),
          h('form', { className: 'dsh-browser-bar', style: { flex: '1 1 auto', padding: 0, border: 0 }, onSubmit },
            h('input', {
              name: 'address',
              className: 'dsh-browser-addr',
              defaultValue: state.url,
              key: state.url,
              placeholder: t('nav.addressPlaceholder'),
              spellCheck: false,
              autoComplete: 'off',
              onFocus: onAddrFocus,
              onBlur: onAddrBlur,
            }),
            h('button', { type: 'submit', className: 'dsh-browser-btn', 'data-variant': 'primary' }, t('nav.go')))),
        toolbar,
        h('div', { className: 'dsh-browser-status' },
          h('span', { className: 'dsh-browser-dot', 'data-live': live ? 'true' : 'false' }),
          h('span', { className: 'dsh-browser-statusText' }, live ? t('state.live') : t('state.idle')),
          // 本对话的智能体正在驱动时就标出来：让人知道「我点了没反应」是因为它正在跑，
          // 而不是界面坏了。
          driver !== undefined ? h('span', { className: 'dsh-browser-driver', title: driver }, t('state.busy')) : null,
          // 地址取自 `state`，而不是 `frame`：帧只在画面变化时来，地址却可能先变
          // （同文档跳转、只改 history 的导航），用帧上的地址会让状态行落后一页。
          state.url !== '' ? h('span', { className: 'dsh-browser-url', title: state.url }, state.url) : null),
        h('div', { className: 'dsh-browser-view', ref: viewRef }, view))
    }
      return {
        BrowserLive,
        h,
        useCallback,
        useRef,
        keyDownText,
        modBits,
        mouseButton,
        mouseMessage,
        shouldPreventKeyDefault,
        toDevice,
        ArrowLeftGlyph,
        ArrowRightGlyph,
        ReloadGlyph,
        fill,
        post,
      }
    })()

    // ── src/client/viewport.ts ──
    const M6 = (() => {
      const { post } = M4
    /**
     * 面板尺寸上报：把实时视图量到的可用区域交给宿主，让浏览器视口与面板同形。
     *
     * 为什么需要它：画面是浏览器视口的等比投影。视口若是 16:9 而侧边栏接近正方形，画面
     * 按宽度铺满后就只能在下面留一大块空白 —— 空白不是样式问题，而是两边比例不一致的
     * 必然结果。把视口改成面板的形状之后，画面正好铺满，页面也按真实尺寸渲染：窄栏里
     * 站点会自己切到窄屏布局，而不是被压小。
     *
     * 节流在这里做（拖动时最多每 150ms 报一次），防抖在宿主做（松手后 200ms 应用一次）。
     * 两边都要：这里挡住每帧一次的洪峰，宿主负责把手停下来的最终尺寸落实。
     *
     * @module dsh-browser-plugin/src/client/viewport
     */


    /**
     * 两次上报之间的最小间隔（毫秒）。
     *
     * 比宿主那边的防抖窗口（200ms）短：这里只做限流，让宿主的防抖计时器在拖动过程中
     * 一直有输入、松手后能立刻收敛到最后尺寸。
     */
    const REPORT_INTERVAL_MS = 150

    /** 面板小于这个尺寸时不值得上报：页面已经没有可用的布局宽度了。 */
    const MIN_REPORT_SIDE = 80

    /**
     * 观察一个元素的尺寸，并在它变化时限流上报。
     *
     * 使用 `ResizeObserver` 而不是 window 的 resize 事件：侧边栏可以靠拖动分隔条变宽，
     * 窗口本身不变，因此 window 事件根本不会触发。
     *
     * @param ref - 要观察的元素（实时视图容器）。
     * @param enabled - 是否上报。视图被折叠或标签页不可见时应传 false。
     * @param sessionId - 本视图所属的会话；视口要设到该会话自己的那只浏览器上。
     */
    function useViewportReport(
      ref                               ,
      enabled         ,
      sessionId         ,
    )       {
      useEffect(() => {
        const element = ref.current
        if (!enabled || element === null) return

        let lastSentAt = 0
        let lastWidth = 0
        let lastHeight = 0

        const report = (force         )       => {
          const width = Math.round(element.clientWidth)
          const height = Math.round(element.clientHeight)
          if (width < MIN_REPORT_SIDE || height < MIN_REPORT_SIDE) return
          if (width === lastWidth && height === lastHeight) return
          const now = Date.now()
          // 限流只作用于连续变化；首次量到尺寸时立刻上报，省掉一次可见的等待。
          if (!force && now - lastSentAt < REPORT_INTERVAL_MS) return
          lastSentAt = now
          lastWidth = width
          lastHeight = height
          post('/viewport', { width, height }, sessionId)
        }

        report(true)
        const observer = new ResizeObserver(() => { report(false) })
        observer.observe(element)
        return () => { observer.disconnect() }
      }, [ref, enabled, sessionId])
    }
      return {
        REPORT_INTERVAL_MS,
        MIN_REPORT_SIDE,
        useViewportReport,
        useEffect,
        post,
      }
    })()

    // ── src/client/browser-tab.tsx ──
    const M7 = (() => {
      const { BrowserLive } = M5
      const { post, usePaneStream } = M4
      const { useViewportReport } = M6
    /**
     * 右侧边栏里的浏览器标签页：标签条 + 实时视图 + 浏览器模式切换。
     *
     * 这是同一份共享页面的“第二扇窗”——与 `browser_* 工具驱动的是同一个页面，因此
     * 智能体导航时这里会立刻跟着走，而人也可以直接在画面上点、滚动、输入。
     *
     * 以 `React.createElement` 手写（不用 JSX）：客户端产物就是本包交付的 lazy-CJS
     * 插件格式，没有 JSX 转换步骤，`react` 是外壳提供的平台模块。
     *
     * @module dsh-browser-plugin/src/client/browser-tab
     */

                                              

    /**
     * 标签页组件的属性。
     *
     * `t` 由注册时的 `locale` 注入；`sessionId` 由槽位框架注入（这个槽位是
     * `scope: 'session'`，框架把所在会话的标识一并交给正文）—— 视图靠它认领**本对话自己**
     * 的那只浏览器，实测与工具侧的 `exec.agent.id` 是同一个值。
     */
                                      
                  
                        
     

    /** 浏览器模式的显示顺序（两值，与运行时一致；没有「我的 Chrome」这一档）。 */
    const MODES                         = ['own', 'stealth']

    /** 每个模式在文案表里的键。 */
    const MODE_LABEL = {
      own: 'mode.own',
      stealth: 'mode.stealth',
    }         

    /** 每个模式在文案表里的提示键。 */
    const MODE_TITLE = {
      own: 'mode.own.title',
      stealth: 'mode.stealth.title',
    }         

    /** 一行标签页的显示文字：优先标题，其次主机名，最后“新标签页”。 */
    function tabLabel(tab         , fallback        )         {
      if (tab.title && tab.title !== 'New Tab' && tab.title !== 'about:blank') return tab.title
      if (tab.url && tab.url !== 'about:blank') {
        const withoutScheme = tab.url.replace(/^[a-z]+:\/\//iu, '')
        return withoutScheme.split('/')[0] ?? tab.url
      }
      return fallback
    }

    /** 标签条：切换/关闭标签页，以及新建一个。 */
    function TabStrip(props                                                       )            {
      const { t, tabs, sessionId } = props
      return h('div', { className: 'dsh-browser-tabs' },
        ...tabs.map(tab => h('div', {
          key: tab.index,
          className: 'dsh-browser-tab',
          'data-active': tab.active ? 'true' : 'false',
          title: tab.url,
          onClick: () => { post('/tab-switch', { index: tab.index }, sessionId) },
        },
          h('span', { className: 'dsh-browser-tabLabel' }, tabLabel(tab, t('tabs.untitled'))),
          h('button', {
            type: 'button',
            className: 'dsh-browser-tabClose',
            title: t('tabs.close'),
            'aria-label': t('tabs.close'),
            onClick: (event                                 ) => {
              event.stopPropagation()
              post('/tab-close', { index: tab.index }, sessionId)
            },
          }, '×'))),
        h('button', {
          type: 'button',
          className: 'dsh-browser-btn',
          style: { padding: '3px 8px' },
          title: t('tabs.new'),
          'aria-label': t('tabs.new'),
          onClick: () => { post('/tab-open', { url: '' }, sessionId) },
        }, '+'))
    }

    /** 底部一行：智能体当前使用哪个浏览器的切换（切换过程中才补一句状态文字）。 */
    function ModeSwitch(props   
                  
                       
                   
                                           
     )            {
      const { t, mode, busy, onSwitch } = props
      return h('div', { className: 'dsh-browser-modes' },
        h('div', { className: 'dsh-browser-seg', title: t('mode.legend') },
          ...MODES.map(candidate => h('button', {
            key: candidate,
            type: 'button',
            className: 'dsh-browser-segBtn',
            'data-active': candidate === mode ? 'true' : 'false',
            title: t(MODE_TITLE[candidate]),
            disabled: busy,
            onClick: () => { onSwitch(candidate) },
          }, t(MODE_LABEL[candidate])))),
        // 平时不解释「这两个按钮是什么」——按钮自己的 title 里已经写清楚了；只在切换过程
        // 中说一句正在切换，否则点了按钮到宿主确认之间的那段时间看着像没反应。
        busy ? h('span', null, t('mode.switching')) : null)
    }

    /**
     * 右侧边栏的标签页正文。
     *
     * 挂载时立刻订阅画面流：即使智能体只是自己在浏览，视图也会跟着刷新（不必先打开
     * 一次）。这是旧浮层做不到的地方 —— 那时只有展开浮层才看得到。
     */
    function BrowserTab(props                 )            {
      const { t, sessionId } = props
      const { frame, state, tabs } = usePaneStream(sessionId)
      const [pending, setPending] = useState                    (null)
      // 宿主确认模式已经变过来之后，就不再显示“正在切换”。
      const switching = pending !== null && pending !== state.mode
      // 视图容器就是面板的可用区域：把它的尺寸报给宿主，浏览器视口便与面板同形。
      const viewRef = useRef                       (null)
      useViewportReport(viewRef, true, sessionId)

      /** 切换智能体使用的浏览器；切换期间禁用按钮避免连点。 */
      const switchMode = (mode             )       => {
        if (mode === state.mode) return
        setPending(mode)
        post('/mode', { mode }, sessionId)
      }

      return h('div', { className: 'dsh-browser-root', 'data-dsh-browser-tab': 'panel' },
        h(TabStrip, { t, tabs, sessionId }),
        h(BrowserLive, {
          t,
          frame,
          state,
          sessionId,
          onOpen: (url        ) => { post('/goto', { url }, sessionId) },
          toolbar: null,
          viewRef,
        }),
        h(ModeSwitch, { t, mode: state.mode, busy: switching, onSwitch: switchMode }))
    }
      return {
        MODES,
        MODE_LABEL,
        MODE_TITLE,
        tabLabel,
        TabStrip,
        ModeSwitch,
        BrowserTab,
        h,
        useRef,
        useState,
        BrowserLive,
        post,
        usePaneStream,
        useViewportReport,
      }
    })()

    // ── src/client/styles.ts ──
    const M8 = (() => {
    /**
     * 浏览器标签页的样式表。
     *
     * 配色不写死任何颜色：全部使用 DSH 的设计令牌（`--dsw-alias-*`、
     * `--dsw-static-neutral-bluish-*`），它们由主题包按当前亮/暗模式定义。于是视图
     * 在默认的亮色主题下就是 DSH 的蓝白配色（白底、蓝灰描边、`--dsw-static-blue-*`
     * 作为强调色），切到暗色主题时也跟着走，不需要两份样式。
     *
     * 每个令牌都带兜底值，因为第三方插件不保证主题包的版本 —— 令牌缺失时仍然得到
     * 一套可读的蓝白配色，而不是透明或黑块。
     *
     * 样式以一段内联 CSS 注入。`<style>` 上的 `data-plugin` 必须是本包的准确名字：
     * 客户端 HMR 驱动就是按这个键清理过期标签页的。
     *
     * @module dsh-browser-plugin/src/client/styles
     */

    /** 本包名，作为 `<style>` 标签的归属标记（HMR 清理用）。 */
    const PLUGIN_TAG = 'dsh-browser-plugin'

    const CSS = `
    .dsh-browser-root{
      display:flex;flex-direction:column;height:100%;min-height:0;flex:1 1 auto;
      background:var(--dsw-alias-bg-layer-1,#fff);
      color:var(--dsw-alias-label-primary,#0f1115);
      font-size:var(--dsh-content-font-size-secondary,13px);
    }
    .dsh-browser-tabs{
      display:flex;align-items:center;gap:4px;padding:6px 8px;
      border-bottom:.5px solid var(--dsw-alias-border-l2,#0000001a);
      overflow-x:auto;flex:0 0 auto;
    }
    .dsh-browser-tab{
      display:flex;align-items:center;gap:4px;flex:0 0 auto;max-width:180px;
      padding:3px 4px 3px 9px;border-radius:6px;cursor:pointer;user-select:none;
      color:var(--dsw-alias-label-secondary,#61666b);
      background:transparent;border:.5px solid transparent;
    }
    .dsh-browser-tab:hover{background:var(--dsw-alias-interactive-bg-hover,#2631480f)}
    .dsh-browser-tab[data-active="true"]{
      color:var(--dsw-alias-label-primary,#0f1115);
      background:var(--dsw-static-blue-50,#eff6ff);
      border-color:var(--dsw-static-blue-100,#dbeafe);
    }
    .dsh-browser-tabLabel{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .dsh-browser-tabClose{
      appearance:none;border:0;background:transparent;cursor:pointer;padding:0 2px;
      color:inherit;opacity:.55;font-size:12px;line-height:1;border-radius:4px;
    }
    .dsh-browser-tabClose:hover{opacity:1;background:var(--dsw-alias-interactive-bg-hover,#2631480f)}

    .dsh-browser-bar{
      display:flex;align-items:center;gap:4px;padding:6px 8px;flex:0 0 auto;
      border-bottom:.5px solid var(--dsw-alias-border-l2,#0000001a);
    }
    .dsh-browser-btn{
      appearance:none;flex:0 0 auto;cursor:pointer;line-height:1;
      padding:5px 8px;border-radius:6px;font:inherit;
      color:var(--dsw-alias-label-secondary,#61666b);
      background:var(--dsw-alias-bg-layer-2,#fff);
      border:.5px solid var(--dsw-alias-border-l3,#0000001f);
    }
    .dsh-browser-btn:hover:not(:disabled){
      background:var(--dsw-alias-interactive-bg-hover,#2631480f);
      border-color:var(--dsw-alias-border-l4,#00000029);
    }
    .dsh-browser-btn:disabled{opacity:.5;cursor:not-allowed}
    /* 图标按钮里的 SVG 按块级排，免得行内基线留出一截空隙把按钮撑高。 */
    .dsh-browser-btn>svg{display:block}
    .dsh-browser-btn[data-variant="primary"]{
      background:var(--dsw-static-blue-600,#2563eb);border-color:transparent;
      color:var(--dsw-alias-label-primary-foreground,#fff);font-weight:500;
    }
    .dsh-browser-btn[data-variant="primary"]:hover:not(:disabled){
      background:var(--dsw-static-blue-500,#3b82f6);
    }
    .dsh-browser-addr{
      flex:1 1 auto;min-width:0;font:inherit;padding:5px 8px;border-radius:6px;
      color:var(--dsw-alias-label-primary,#0f1115);
      background:var(--dsw-alias-bg-base,#fff);
      border:.5px solid var(--dsw-alias-border-l3,#0000001f);
      outline:none;
    }
    .dsh-browser-addr:focus{
      border-color:var(--dsw-static-blue-400,#60a5fa);
      box-shadow:0 0 0 2px var(--dsw-static-blue-75,#e5f0ff);
    }
    .dsh-browser-addr::placeholder{color:var(--dsw-alias-label-caption,#adb2b8)}

    .dsh-browser-status{
      display:flex;align-items:center;gap:5px;padding:4px 10px;flex:0 0 auto;
      color:var(--dsw-alias-label-tertiary,#81858c);
      font-size:var(--dsw-font-xxs-12-font-size,12px);
      border-bottom:.5px solid var(--dsw-alias-border-l1,#0000000a);
    }
    .dsh-browser-dot{
      width:7px;height:7px;border-radius:50%;flex:0 0 auto;
      background:var(--dsw-alias-label-caption,#adb2b8);
    }
    .dsh-browser-dot[data-live="true"]{background:var(--dsw-alias-state-success-primary,#22c55e)}
    .dsh-browser-statusText{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .dsh-browser-url{
      margin-left:auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
      max-width:60%;direction:rtl;text-align:left;
      color:var(--dsw-alias-label-caption,#adb2b8);
    }
    /* 「另一个对话正在用浏览器」的提示：共用资源的状态必须可见，否则像点了没反应。 */
    .dsh-browser-driver{
      flex:0 0 auto;padding:0 6px;border-radius:10px;
      color:var(--dsw-alias-state-warn-label,#dd8629);
      border:.5px solid var(--dsw-alias-state-warn-secondary,#f7ad31);
      background:var(--dsw-alias-state-warn-tertiary,#fef5e7);
    }

    /*
     * 实时视图容器。画面与面板同形（宿主把浏览器视口设成这个容器的尺寸），所以这里不
     * 需要滚动条；overflow:hidden 顺带挡住 1px 级的取整误差。
     */
    .dsh-browser-view{
      flex:1 1 auto;min-height:0;min-width:0;position:relative;overflow:hidden;
      background:var(--dsw-alias-bg-module-platform,#f5f6f7);
    }
    /*
     * 画面铺满容器：高度铺满而不是按宽度算 —— 后者在窄栏里会把画面顶到上方、下面留一
     * 大块空白。两个边长都约束住，任何一端先到即停，剩下的极小误差交给 object-fit，
     * 因此永远不会裁掉页面内容。
     */
    .dsh-browser-frame{
      display:block;width:100%;height:100%;outline:none;object-fit:contain;
      cursor:crosshair;background:#fff;
    }
    .dsh-browser-note{
      padding:20px 16px;color:var(--dsw-alias-label-tertiary,#81858c);
      line-height:1.7;text-align:center;
    }
    .dsh-browser-note[data-tone="error"]{
      color:var(--dsw-alias-state-error-primary,#ec1313);
    }
    .dsh-browser-modes{
      display:flex;align-items:center;gap:6px;padding:6px 8px;flex:0 0 auto;
      border-top:.5px solid var(--dsw-alias-border-l2,#0000001a);
      color:var(--dsw-alias-label-tertiary,#81858c);
      font-size:var(--dsw-font-xxs-12-font-size,12px);
    }
    .dsh-browser-seg{
      display:inline-flex;overflow:hidden;border-radius:6px;
      border:.5px solid var(--dsw-alias-border-l3,#0000001f);
    }
    .dsh-browser-segBtn{
      appearance:none;border:0;cursor:pointer;font:inherit;
      padding:4px 9px;line-height:1.3;
      color:var(--dsw-alias-label-secondary,#61666b);
      background:var(--dsw-alias-bg-layer-2,#fff);
    }
    .dsh-browser-segBtn:hover:not([data-active="true"]){
      background:var(--dsw-alias-interactive-bg-hover,#2631480f);
    }
    .dsh-browser-segBtn[data-active="true"]{
      background:var(--dsw-static-blue-600,#2563eb);
      color:var(--dsw-alias-label-primary-foreground,#fff);
    }
    `

    /** 注入样式表（幂等）。 */
    function ensureStyles()       {
      if (document.head.querySelector(`style[data-plugin="${PLUGIN_TAG}"]`)) return
      const tag = document.createElement('style')
      tag.dataset.plugin = PLUGIN_TAG
      tag.textContent = CSS
      document.head.appendChild(tag)
    }
      return {
        PLUGIN_TAG,
        CSS,
        ensureStyles,
      }
    })()

    // ── src/client/index.ts ──
    const M9 = (() => {
      const { BrowserTab } = M7
      const { ChromeGlyph } = M2
      const { en, NS, zh } = M3
      const { ensureStyles } = M8
    /**
     * 客户端插入点：把浏览器注册为**右侧边栏的一个标签页**。
     *
     * 与原 `@try-works/dsh-browser-agent` 的浮层方案相比，这里走的是产品自带的标签页
     * 机制，共两处插入：
     *
     * 1. `sidebarRightTabs.register` —— 声明一个标签页类型 `browser`，并给指南页贡献
     *    一个入口卡片（图标是本包的 Chrome 标），于是“浏览器”和“飞书”一样，是右侧
     *    边栏里可以选的一项。
     * 2. `sidebar.right.pane.tab` —— 该类型标签页的正文（实时画面）。
     *
     * 第三处插入曾经存在：`conversation.session.header.actions` 上的一键打开按钮。它
     * 和右边栏自己的展开按钮并排挤在会话标题栏里，重复且抢位置，已按需求移除 ——
     * 入口只保留指南页卡片这一处。
     *
     * 注册时带 `locale: NS`，槽位框架会把绑定好的 `t` 作为 prop 注入正文组件，所以
     * 界面文案全部来自 `text.ts`。这个槽位的作用域是 `session`，框架同时注入 **`sessionId`**
     * —— 正文靠它认领本对话自己的那只浏览器（见 `state.ts` 的 `paneRoute`）。
     *
     * @module dsh-browser-plugin/src/client/index
     */

                                                                               
    // 仅类型：引入右侧边栏的 SlotMap 与 `sidebarRight*` 服务声明。
                                                                         

    /** 标签页类型的判别值：`openTab('browser')` 打开的就是它。 */
    const TAB_KIND = 'browser'

    /** 该实现的唯一标识；正文与标题都按它在槽位里注册。 */
    const TAB_ID = 'dsh-browser-plugin/tab'

    /** 本插件依赖的浏览器侧服务。 */
    const inject = ['slots', 'locale', 'sidebarRightTabs']

    /**
     * 客户端插件主体：字典、标签页类型与标签页正文。
     *
     * @param ctx - 客户端根上下文。
     */
    function apply(ctx               )       {
      ensureStyles()
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-browser-plugin: 界面文案')
      const t = ctx.locale.bind(NS)             

      // 第一步：这个类型“是什么” —— 一个按 kind 打开的页面类型，外加指南页入口。
      // 入口卡片的 glyph 用内联的 Chrome 标，不给的话指南页会画产品自带的立方体占位图。
      ctx.effect(() => ctx.sidebarRightTabs.register({
        id: TAB_ID,
        kind: TAB_KIND,
        priority: 'extension',
        title: () => t('tab.title'),
        guide: [{
          order: 40,
          title: () => t('tab.guide.title'),
          description: () => t('tab.guide.description'),
          icon: ChromeGlyph,
        }],
      }), 'dsh-browser-plugin: 标签页类型')

      // 第二步：这个类型的正文。`locale` 让槽位框架注入绑定好的 `t`。
      ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab',
        key: TAB_ID,
        locale: NS,
      }, BrowserTab)), 'dsh-browser-plugin: 标签页正文')
    }
      return {
        TAB_KIND,
        TAB_ID,
        inject,
        apply,
        BrowserTab,
        ChromeGlyph,
        en,
        NS,
        zh,
        ensureStyles,
      }
    })()

    // ── 入口模块的具名导出（插件系统读取 apply / inject） ─────────────────
    exports.inject = M9.inject
    exports.apply = M9.apply

    return module.exports;
  },
});
