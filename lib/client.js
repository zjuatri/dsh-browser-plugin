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

    // ── src/client/stream-registry.ts ──
    const M1 = (() => {
    /**
     * 每个会话**共享一条** SSE 连接（带引用计数）。
     *
     * 为什么必须共享：浏览器对同一个 origin 只允许 **6 条并发连接**（HTTP/1.1 上限）。此前是
     * 「每个面板实例各开一条 EventSource」，只要挂载/卸载有任何一次不成对就会漏一条；漏到第
     * 6 条之后，这个页面**所有**新请求都会排进浏览器自己的队列里等一个永不到来的空位 ——
     * 现象是面板里每个按钮、乃至 DSH 输入框的"发送"全都**卡死**（Network 里显示 0.0 kB 待处理），
     * 而服务端其实一切正常、连日志都没有。实测撞上时浏览器对 3080 端口握着 10 条连接。
     *
     * 共享之后，泄漏最多也只泄漏**一条**（一个会话一条），而正常的挂载/卸载靠引用计数归零时
     * 关闭连接，不会残留。新加入的订阅者还会收到最近一帧/状态/标签页的重放，因此第二个面板
     * 打开时立刻就能看到当前画面（否则静态页面上要等下一次变化才有画面）。
     *
     * 只依赖全局 `EventSource`，不依赖 React —— 这样它可以脱离渲染器单独测试
     * （见 `test/client-stream-registry.test.mjs`）。
     *
     * @module dsh-browser-plugin/src/client/stream-registry
     */



    /** 一个订阅者要收的事件；每个回调都可省略。 */








    /** 一条共享连接。 */










    /** 按 key（会话）共享的连接。 */
    const shared = new Map                ()

    /** 解析一条 SSE 事件的 JSON 载荷。 */
    function payloadOf(event       )          {
      return JSON.parse((event                        ).data)
    }

    /** 建一条连接并把事件分发/缓存下来。 */
    function open(key        , url        )         {
      const entry         = {
        // eslint-disable-next-line no-undef -- 浏览器全局；测试里会替换成替身
        source: new EventSource(url),
        listeners: new Set(),
        refs: 0,
        connected: false,
        last: {},
      }
      // 先放进表里再挂监听：监听回调里要用到同一个 entry。
      shared.set(key, entry)
      entry.source.addEventListener('open', () => {
        entry.connected = true
        for (const listener of [...entry.listeners]) listener.open?.()
      })
      entry.source.addEventListener('frame', (event) => {
        entry.last.frame = payloadOf(event)
        for (const listener of [...entry.listeners]) listener.frame?.(entry.last.frame)
      })
      entry.source.addEventListener('state', (event) => {
        entry.last.state = payloadOf(event)
        for (const listener of [...entry.listeners]) listener.state?.(entry.last.state)
      })
      entry.source.addEventListener('tabs', (event) => {
        entry.last.tabs = payloadOf(event)
        for (const listener of [...entry.listeners]) listener.tabs?.(entry.last.tabs)
      })
      return entry
    }

    /**
     * 订阅某个会话的画面流；同一个 key 复用同一条连接。
     *
     * @param key - 会话标识（无名会话用空串）。
     * @param url - 该会话的画面流地址。
     * @param events - 事件回调；返回值是取消订阅函数。
     * @returns 取消订阅；最后一个订阅者离开时关闭连接。
     */
    function subscribeStream(key        , url        , events              )             {
      const entry = shared.get(key) ?? open(key, url)
      entry.refs++
      entry.listeners.add(events)
      // 重放：连接已经连上、并且手上有缓存载荷时，让新订阅者立刻进入当前状态。
      if (entry.connected) events.open?.()
      if (entry.last.frame !== undefined) events.frame?.(entry.last.frame)
      if (entry.last.state !== undefined) events.state?.(entry.last.state)
      if (entry.last.tabs !== undefined) events.tabs?.(entry.last.tabs)

      let done = false
      return () => {
        if (done) return
        done = true
        // 重新取一次：期间可能已经被别人关掉并重建过。
        const current = shared.get(key)
        if (current !== entry) return
        entry.listeners.delete(events)
        entry.refs--
        if (entry.refs > 0) return
        shared.delete(key)
        try {
          entry.source.close()
        } catch { /* 已经关了 */ }
      }
    }

    /** 当前共享连接数（诊断与测试用）。 */
    function sharedStreamCount()         {
      return shared.size
    }

    /** 关掉所有共享连接（测试与拆除用）。 */
    function closeAllStreams()       {
      for (const [key, entry] of [...shared]) {
        shared.delete(key)
        try {
          entry.source.close()
        } catch { /* 已经关了 */ }
        entry.listeners.clear()
        entry.refs = 0
      }
      shared.clear()
    }
      return {
        shared,
        payloadOf,
        open,
        subscribeStream,
        sharedStreamCount,
        closeAllStreams,
      }
    })()

    // ── src/client/state.ts ──
    const M2 = (() => {
      const { subscribeStream } = M1
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


    /**
     * 实时视图的画质档（与宿主 `BrowserQuality` 一致）。
     *
     * - `perf` —— 每个 CSS 像素抓一个点：帧最小、最省，但在缩放过的屏幕上那块画面是放大
     *   出来的，比周围的原生文字糊。
     * - `hd` —— 每个物理像素抓一个点（2 倍抓帧）：与周围界面一样锐，代价是每帧 4 倍像素。
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
     * 连接是**按会话共享**的（见 `stream-registry.ts`）：同一个会话开几个面板、或者组件被
     * 重新挂载，都只占一条浏览器连接。这不只是省资源 —— 浏览器对同一 origin 只有 6 条并发
     * 连接，每个实例各开一条的写法一旦漏关，攒到 6 条就会让**整个页面**的所有请求都排不上队
     * （面板按钮、连聊天发送一起假死）。
     *
     * @param sessionId - 本视图所属的会话；变化时改订另一条连接（换会话就该换一只浏览器）。
     * @returns 当前的画面/状态/标签页快照。
     */
    function usePaneStream(sessionId         )               {
      const [frame, setFrame] = useState                  (null)
      const [state, setState] = useState           ({ active: false, url: '', mode: 'own' })
      const [tabs, setTabs] = useState           ([])
      const [connection, setConnection] = useState(0)

      useEffect(() => subscribeStream(sessionId ?? '', paneRoute('/stream', sessionId), {
        // 每次建立（或重建）连接都算一次：宿主重启后这里会再响一次。
        open: () => { setConnection(previous => previous + 1) },
        // 安全性：这条通道只由本插件自己的宿主侧（同一个包）提供，写入的就是它自己产生的
        // PaneFrame / PaneState / TabInfo JSON —— 第三方无法往这些事件名上塞别的载荷。
        frame: (payload) => {
          setFrame(payload)
          setState(previous => ({ ...previous, active: true, url: payload.url, error: undefined }))
        },
        state: (payload) => { setState(payload) },
        tabs: (payload) => { setTabs(payload) },
      }), [sessionId])

      return { frame, state, tabs, connection }
    }
      return {
        paneRoute,
        post,
        usePaneStream,
        useEffect,
        useState,
        subscribeStream,
      }
    })()

    // ── src/client/context-menu.tsx ──
    const M3 = (() => {
      const { paneRoute } = M2
    /**
     * 画面上的右键菜单。
     *
     * 为什么需要它：侧边栏里的画面是**另一只 Chrome** 的 JPEG 流，在那儿右键只会弹出宿主
     * 浏览器自己的菜单 —— 也就是 DSH Web UI 的开发者工具，而不是画面里那一页的。这里接管
     * 画面区域的右键，给出真正想要的那个入口。
     *
     * 菜单项是一个**链接**，指向宿主路由 `/browser-pane/devtools`，由宿主 302 到 Chrome 给出
     * 的 DevTools 前端地址。用链接而不是 `fetch` + `window.open` 是刻意的：取地址要等一次
     * 宿主往返，异步 `window.open` 会被弹窗拦截，而链接是用户手势本身的一部分，并且还能中键
     * 新开、右键复制链接。
     *
     * 只接管画面：地址栏、状态行等处的右键仍然是宿主浏览器的默认菜单（那里需要「粘贴」之类）。
     *
     * @module dsh-browser-plugin/src/client/context-menu
     */



    /** 右键菜单的属性。 */













    /** 画面上的右键菜单。 */
    function ContextMenu(props                  )            {
      const { t, x, y, active, sessionId, onClose } = props
      const item = active
        ? h('a', {
          className: 'dsh-browser-menuItem',
          href: paneRoute('/devtools', sessionId),
          target: '_blank',
          rel: 'noopener noreferrer',
          onClick: onClose,
        }, t('menu.devtools'))
        : h('span', {
          className: 'dsh-browser-menuItem',
          'data-disabled': 'true',
          title: t('menu.devtoolsDisabled'),
        }, t('menu.devtools'))

      return h('div', {
        className: 'dsh-browser-menu',
        role: 'menu',
        style: { left: `${String(x)}px`, top: `${String(y)}px` },
        onMouseDown: (event                                 ) => { event.stopPropagation() },
      }, item)
    }
      return {
        ContextMenu,
        h,
        paneRoute,
      }
    })()

    // ── src/client/input.ts ──
    const M4 = (() => {
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
     * 把视口内的指针坐标换算成 CDP 期望的页面坐标。
     *
     * 两件事必须同时做对：
     *
     * 1. 分母是帧的 **CSS** 视口尺寸，不是帧的设备像素数 —— CDP 的
     *    `Input.dispatchMouseEvent` 收的是页面 CSS 像素，而高清档下帧宽是 CSS 宽的两倍。
     * 2. 换算要按 `object-fit: contain` **实际画出来的那一块**。比例不一致时画面只占元素框
     *    中间的一块（四周是留白），拿整个框当分母的话，点在留白上也会被算成一个页面坐标 ——
     *    面板比视口下限还矮时（画面缩成一个小方块），点哪儿都落不到对的地方。留白里的点击
     *    不属于页面，这里直接返回 null（调用方会丢弃）。
     *
     * @param rect - `<img>` 的包围盒。
     * @param frame - 当前帧（`width`/`height` 是设备像素，`cssWidth`/`cssHeight` 是页面 CSS 视口）。
     * @param clientX - 指针的视口 X 坐标。
     * @param clientY - 指针的视口 Y 坐标。
     * @returns 页面 CSS 坐标；落在画面之外或包围盒退化时返回 null。
     */
    function toDevice(
      rect                                                              ,
      frame           ,
      clientX        ,
      clientY        ,
    )                                  {
      if (rect.width <= 0 || rect.height <= 0) return null
      // 旧宿主（客户端已刷新、宿主还没重启）不发 cssWidth：那时倍率必然是 1，两者相等。
      const width = frame.cssWidth > 0 ? frame.cssWidth : frame.width
      const height = frame.cssHeight > 0 ? frame.cssHeight : frame.height
      if (!(width > 0) || !(height > 0)) return null
      // contain：取较小的那个比例，画面在框内居中。
      const fit = Math.min(rect.width / width, rect.height / height)
      const paintedWidth = width * fit
      const paintedHeight = height * fit
      const left = rect.left + (rect.width - paintedWidth) / 2
      const top = rect.top + (rect.height - paintedHeight) / 2
      // 半个像素的容差：正好点在画面边缘时别因为浮点误差被丢掉。
      const slack = 0.5
      if (
        clientX < left - slack || clientX > left + paintedWidth + slack
        || clientY < top - slack || clientY > top + paintedHeight + slack
      ) return null
      return {
        x: (clientX - left) / paintedWidth * width,
        y: (clientY - top) / paintedHeight * height,
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
    const M5 = (() => {
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
    const M6 = (() => {
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

      'quality.legend': '画面画质',
      'quality.perf': '性能',
      'quality.hd': '高清',
      'quality.perf.title': '每个 CSS 像素抓一个点：最省，帧小、跟得上；代价是在缩放过的屏幕上画面比周围文字糊',
      'quality.hd.title': '每个物理像素抓一个点（2 倍抓帧）：和周围界面一样锐；代价是每帧 4 倍像素',

      'state.busy': '智能体正在使用本对话的浏览器，正在排队…',
      'view.live': '实时画面',

      'menu.devtools': '打开该页面的开发者工具',
      'menu.devtoolsDisabled': '本对话的浏览器还没启动',
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

      'quality.legend': 'Picture quality',
      'quality.perf': 'Performance',
      'quality.hd': 'HD',
      'quality.perf.title': 'One point per CSS pixel: cheapest, small frames; soft on a scaled display',
      'quality.hd.title': 'One point per physical pixel (2× capture): as crisp as the surrounding UI, at 4× the pixels per frame',

      'state.busy': 'The agent is using this conversation\'s browser — queued…',
      'view.live': 'Live view',

      'menu.devtools': 'Open DevTools for this page',
      'menu.devtoolsDisabled': 'This conversation\'s browser is not running yet',
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

    // ── src/client/browser-live.tsx ──
    const M7 = (() => {
      const { ContextMenu } = M3
      const { keyDownText, modBits, mouseButton, mouseMessage, shouldPreventKeyDefault, toDevice } = M4
      const { ArrowLeftGlyph, ArrowRightGlyph, ReloadGlyph } = M5
      const { fill } = M6
      const { post } = M2
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


    /** 右键菜单的近似尺寸（像素）：只用来把菜单夹在面板内，不必精确。 */
    const MENU_WIDTH = 208
    const MENU_HEIGHT = 36

    /** 活动画面的两向遥控视图。 */
    function BrowserLive(props                  )            {
      const { t, frame, state, sessionId, toolbar, onOpen, viewRef } = props
      const imgRef = useRef                         (null)
      const heldRef = useRef          (new Map())
      const rootRef = useRef                       (null)
      /** 右键菜单位置（相对面板可用区域左上角）；null = 没开。 */
      const [menu, setMenu] = useState                                 (null)

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

      /** 地址栏：把宿主的地址同步进去，但**绝不重建**这个输入框（原因见下面的 effect）。 */
      const addrRef = useRef                         (null)
      /** 上一次同步进地址栏的地址，用来判断「用户是不是改过它」。 */
      const syncedUrl = useRef(state.url)

      /**
       * 把当前地址同步进地址栏。
       *
       * 关键在**不重建 input**：以前这里给输入框挂了 `key={state.url}`，而 `state.url` 每一帧
       * 都会更新 —— 镜像页面的地址一变（重定向、锚点、路由跳转、初始 `about:blank` → 真地址、
       * 宿主每 400ms 的地址同步），React 就重建这个输入框，**正在敲的内容被清空**；这时回车提交
       * 的是空值，`onSubmit` 里 `if (!url) return` 直接返回，看起来就是「在网址栏敲回车没用」。
       *
       * 用户在编辑、且内容与上次同步的地址不同时，宁可让地址栏暂时旧一点，也不覆盖他正在敲的。
       */
      useEffect(() => {
        const input = addrRef.current
        if (input === null) return
        const previous = syncedUrl.current
        syncedUrl.current = state.url
        const dirty = input.value !== previous
        if (dirty && document.activeElement === input) return
        if (input.value !== state.url) input.value = state.url
      }, [state.url])

      /** 失焦时把「没被改过」的地址栏刷新成最新地址（改过的保留：用户可能正要重新提交）。 */
      const onAddrBlur = ()       => {
        const input = addrRef.current
        if (input !== null && input.value === syncedUrl.current) input.value = state.url
      }

      const onSubmit = (event                            )       => {
        event.preventDefault()
        const input = event.currentTarget.elements.namedItem('address')
        if (!(input instanceof HTMLInputElement)) return
        const url = input.value.trim()
        if (!url) return
        onOpen(url)
      }

      /**
       * 画面上的右键：接管菜单。
       *
       * 必须 `preventDefault()`：不拦的话弹出的是**宿主浏览器**的菜单，里面的「检查」打开的是
       * DSH Web UI 自己的开发者工具 —— 而用户想看的是画面里那一页的。右键本身仍照旧作为合成
       * 输入送进页面（上面的 mousedown/up 没动），页面自己的 JS 右键行为不受影响。
       */
      const onContextMenu = (event                                   )       => {
        event.preventDefault()
        const box = rootRef.current?.getBoundingClientRect()
        if (box === undefined) return
        // 菜单挂在根节点上，因此坐标相对它；再夹一下，免得贴着面板边缘时溢出。
        setMenu({
          x: Math.max(4, Math.min(event.clientX - box.left, box.width - MENU_WIDTH - 4)),
          y: Math.max(4, Math.min(event.clientY - box.top, box.height - MENU_HEIGHT - 4)),
        })
      }

      // 菜单打开时：点别处或按 Esc 关掉。监听挂在 document 上，因此点面板外面也有效。
      useEffect(() => {
        if (menu === null) return
        const close = ()       => { setMenu(null) }
        const onKey = (event               )       => { if (event.key === 'Escape') close() }
        document.addEventListener('mousedown', close)
        document.addEventListener('keydown', onKey)
        return () => {
          document.removeEventListener('mousedown', close)
          document.removeEventListener('keydown', onKey)
        }
      }, [menu])

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
          onContextMenu,
        })
        : h('div', { className: 'dsh-browser-note', 'data-tone': state.error ? 'error' : undefined },
          state.error ? fill(t('state.error'), { message: state.error }) : t('state.idleHint'))

      return h('div', { className: 'dsh-browser-root', ref: rootRef },
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
              ref: addrRef,
              name: 'address',
              className: 'dsh-browser-addr',
              defaultValue: state.url,
              placeholder: t('nav.addressPlaceholder'),
              spellCheck: false,
              autoComplete: 'off',
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
        h('div', { className: 'dsh-browser-view', ref: viewRef }, view),
        menu === null
          ? null
          : h(ContextMenu, {
            t,
            x: menu.x,
            y: menu.y,
            active: state.active,
            sessionId,
            onClose: () => { setMenu(null) },
          }))
    }
      return {
        MENU_WIDTH,
        MENU_HEIGHT,
        BrowserLive,
        h,
        useCallback,
        useEffect,
        useRef,
        useState,
        ContextMenu,
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

    // ── src/client/quality.ts ──
    const M8 = (() => {
    /**
     * 画质档的本机记忆。
     *
     * 为什么记忆在**浏览器**这一侧，而不是宿主：档位是「看的人」的偏好，而宿主进程里的
     * 那份值会随 `dsh web` 重启回到配置默认值。写进本机 `localStorage` 之后，选择就活过了
     * 刷新页面、新开窗口、新开会话，也活过了宿主重启 —— 视图一接入就把记住的档位发回去
     * （见 `browser-tab.tsx`），宿主于是重新认它。
     *
     * 为什么存在 `localStorage` 这种「本机」粒度是对的：它天然是**全局**的（同一个源下的
     * 每一扇窗、每一个会话共享一份），正好对上「选了性能，新开的窗口也还是性能」这条要求；
     * 而它是「每台浏览器」而不是「每个 dsh 进程」的，换一台机器看同一个 GUI 时，那边有那边
     * 的选择，这也说得通。
     *
     * 读写在隐私模式、禁用存储、被 iframe 沙箱拦住时都可能抛异常，因此这里一律吞掉异常并
     * 降级成「这次记得、下次忘了」—— 记忆失效不该让侧边栏打不开。
     *
     * @module dsh-browser-plugin/src/client/quality
     */



    /** 存储键。带上包名，免得和 GUI 自己的键撞车。 */
    const STORAGE_KEY = 'dsh-browser-plugin.paneQuality'

    /** 收到的值是不是一个认识的画质档。 */
    function isQuality(value         )                          {
      return value === 'perf' || value === 'hd'
    }

    /**
     * 读本机记住的画质档。
     *
     * @returns 记住的档位；从没选过、或存的值不认识时返回 null（调用方退回宿主广播的值）。
     */
    function readStoredQuality()                        {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        return isQuality(raw) ? raw : null
      } catch {
        return null
      }
    }

    /**
     * 记住画质档。
     *
     * @param quality - 要记住的档位。
     */
    function storeQuality(quality                )       {
      try {
        window.localStorage.setItem(STORAGE_KEY, quality)
      } catch { /* 存不下就算了：本次会话里档位依然生效 */ }
    }
      return {
        STORAGE_KEY,
        isQuality,
        readStoredQuality,
        storeQuality,
      }
    })()

    // ── src/client/viewport.ts ──
    const M9 = (() => {
      const { post } = M2
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
    const M10 = (() => {
      const { BrowserLive } = M7
      const { readStoredQuality, storeQuality } = M8
      const { post, usePaneStream } = M2
      const { useViewportReport } = M9
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

    /** 画质档的显示顺序（两值：省流 vs 像素级）。 */
    const QUALITIES                            = ['perf', 'hd']

    /** 每个画质档在文案表里的键。 */
    const QUALITY_LABEL = {
      perf: 'quality.perf',
      hd: 'quality.hd',
    }

    /** 每个画质档在文案表里的提示键。 */
    const QUALITY_TITLE = {
      perf: 'quality.perf.title',
      hd: 'quality.hd.title',
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

    /** 底部一行：浏览器模式切换 + 画面画质切换（切换过程中才补一句状态文字）。 */
    function PaneFooter(props






     )            {
      const { t, mode, quality, busy, onSwitchMode, onSwitchQuality } = props
      return h('div', { className: 'dsh-browser-modes' },
        h('div', { className: 'dsh-browser-seg', title: t('mode.legend') },
          ...MODES.map(candidate => h('button', {
            key: candidate,
            type: 'button',
            className: 'dsh-browser-segBtn',
            'data-active': candidate === mode ? 'true' : 'false',
            title: t(MODE_TITLE[candidate]),
            disabled: busy,
            onClick: () => { onSwitchMode(candidate) },
          }, t(MODE_LABEL[candidate])))),
        // 两组按钮之间点一个分隔符：两排都是两字按钮，挨在一起会被读成同一组。
        h('span', { 'aria-hidden': 'true' }, '·'),
        h('div', { className: 'dsh-browser-seg', title: t('quality.legend') },
          ...QUALITIES.map(candidate => h('button', {
            key: candidate,
            type: 'button',
            className: 'dsh-browser-segBtn',
            'data-active': candidate === quality ? 'true' : 'false',
            title: t(QUALITY_TITLE[candidate]),
            onClick: () => { onSwitchQuality(candidate) },
          }, t(QUALITY_LABEL[candidate])))),
        // 平时不解释「这几个按钮是什么」——按钮自己的 title 里已经写清楚了；只在切换过程
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
      const { frame, state, tabs, connection } = usePaneStream(sessionId)
      const [pending, setPending] = useState                    (null)
      // 宿主确认模式已经变过来之后，就不再显示“正在切换”。
      const switching = pending !== null && pending !== state.mode
      // 本机记住的档位：只在挂载时读一次，之后由下面的写入与宿主广播维持。
      const [stored] = useState(readStoredQuality)
      // 真值优先取宿主广播的：它可能是别的窗口刚改的、也可能是配置默认值。首次渲染时广播
      // 还没到，先拿本机记忆顶上，免得按钮先闪一下默认档。
      const quality = state.quality ?? stored ?? 'perf'
      // 视图容器就是面板的可用区域：把它的尺寸报给宿主，浏览器视口便与面板同形。
      const viewRef = useRef                       (null)
      useViewportReport(viewRef, true, sessionId)

      useEffect(() => {
        // 每接上一次画面流都报一次本机记住的档位：宿主进程里的档位会随 `dsh web` 重启回到
        // 配置默认值，而重连正是视图唯一能察觉「对面换了一个进程」的时机。记忆在本机，
        // 真值在宿主。
        if (stored !== null) post('/quality', { quality: stored }, sessionId)
      }, [stored, sessionId, connection])

      useEffect(() => {
        // 宿主广播的档位就是当前真值（包括别的窗口改的）：记下来，于是它也成了本机的记忆。
        if (state.quality !== undefined) storeQuality(state.quality)
      }, [state.quality])

      /** 切换智能体使用的浏览器；切换期间禁用按钮避免连点。 */
      const switchMode = (mode             )       => {
        if (mode === state.mode) return
        setPending(mode)
        post('/mode', { mode }, sessionId)
      }

      /** 切换画面画质：先记住再上报，这样即使请求失败（宿主刚重启等）选择也不会丢。 */
      const switchQuality = (next                )       => {
        if (next === quality) return
        storeQuality(next)
        post('/quality', { quality: next }, sessionId)
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
        h(PaneFooter, {
          t,
          mode: state.mode,
          quality,
          busy: switching,
          onSwitchMode: switchMode,
          onSwitchQuality: switchQuality,
        }))
    }
      return {
        MODES,
        MODE_LABEL,
        MODE_TITLE,
        QUALITIES,
        QUALITY_LABEL,
        QUALITY_TITLE,
        tabLabel,
        TabStrip,
        PaneFooter,
        BrowserTab,
        h,
        useEffect,
        useRef,
        useState,
        BrowserLive,
        readStoredQuality,
        storeQuality,
        post,
        usePaneStream,
        useViewportReport,
      }
    })()

    // ── src/client/styles.ts ──
    const M11 = (() => {
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
      position:relative; /* 右键菜单相对它定位 */
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
     *
     * 指针用普通箭头（default），不用十字：这是「一面看着页面的窗」，不是取色器或选框，
     * 十字会让人以为进入了某种拾取模式。真正的指针形状本该由页面自己决定 —— 那只有真内嵌
     * 页面才做得到，JPEG 流做不到，所以取最少干扰的那一个。
     */
    .dsh-browser-frame{
      display:block;width:100%;height:100%;outline:none;object-fit:contain;
      cursor:default;background:#fff;
    }
    .dsh-browser-note{
      padding:20px 16px;color:var(--dsw-alias-label-tertiary,#81858c);
      line-height:1.7;text-align:center;
    }
    .dsh-browser-note[data-tone="error"]{
      color:var(--dsw-alias-state-error-primary,#ec1313);
    }
    .dsh-browser-modes{
      display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding:6px 8px;flex:0 0 auto;
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

    /*
     * 画面上的右键菜单：接管了宿主浏览器的默认菜单（否则「检查」打开的是 DSH Web UI 自己的
     * 开发者工具）。层级压在画面之上，样式与工具栏同一套令牌。
     */
    .dsh-browser-menu{
      position:absolute;z-index:20;min-width:200px;padding:4px;
      border-radius:8px;
      background:var(--dsw-alias-bg-layer-1,#fff);
      border:.5px solid var(--dsw-alias-border-l3,#0000001f);
      box-shadow:0 6px 20px var(--dsw-alias-shadow-l2,#00000026);
    }
    .dsh-browser-menuItem{
      display:block;padding:6px 10px;border-radius:6px;
      font:inherit;text-decoration:none;
      color:var(--dsw-alias-label-primary,#0f1115);
      cursor:pointer;
    }
    .dsh-browser-menuItem:hover{background:var(--dsw-alias-interactive-bg-hover,#2631480f)}
    .dsh-browser-menuItem[data-disabled="true"]{
      color:var(--dsw-alias-label-caption,#adb2b8);cursor:not-allowed;background:transparent;
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
    const M12 = (() => {
      const { BrowserTab } = M10
      const { ChromeGlyph } = M5
      const { en, NS, zh } = M6
      const { ensureStyles } = M11
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
    exports.inject = M12.inject
    exports.apply = M12.apply

    return module.exports;
  },
});
