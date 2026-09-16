/**
 * 实时视图组件：画面帧的渲染，以及把指针/键盘事件送回宿主。
 *
 * 这里刻意使用 `React.createElement`（不用 JSX）：客户端产物由本包手写为 DSH 的
 * lazy-CJS 插件格式，没有 JSX 转换步骤，`react` 本身是外壳提供的平台模块。
 *
 * @module dsh-browser-plugin/src/client/browser-live
 */

import {
  createElement as h,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import { ContextMenu } from './context-menu.js'
import { keyDownText, modBits, mouseButton, mouseMessage, shouldPreventKeyDefault, toDevice } from './input.js'
import { ArrowLeftGlyph, ArrowRightGlyph, ReloadGlyph } from './icons.js'
import { fill, type Translate } from './text.js'
import { post, type PaneFrame, type PaneState } from './state.js'

/** 实时视图组件的属性。 */
export interface BrowserLiveProps {
  t: Translate
  frame: PaneFrame | null
  state: PaneState
  /**
   * 本视图所属的会话 id（槽位框架注入）。
   *
   * 视图里的每一次操作都要带上它：宿主按会话分发到**本对话自己的**那只浏览器，否则
   * 点下去动的是别的会话的页面。
   */
  sessionId?: string
  /** 可选：插在工具栏与状态行之间的一行（例如标签条）。 */
  toolbar?: ReactNode
  /** 打开某个地址（空地址表示新标签页）。 */
  onOpen: (url: string) => void
  /**
   * 实时视图容器的 ref。
   *
   * 由上层持有：容器尺寸就是面板的可用区域，向宿主上报它，浏览器视口才会与面板
   * 同形（见 `viewport.ts`）。
   */
  viewRef?: React.RefObject<HTMLDivElement | null>
}

/** 画面上仍被按住的键（code -> key），离开焦点时释放。 */
type HeldKeys = Map<string, string>

/** 右键菜单的近似尺寸（像素）：只用来把菜单夹在面板内，不必精确。 */
const MENU_WIDTH = 208
const MENU_HEIGHT = 36

/** 活动画面的两向遥控视图。 */
export function BrowserLive(props: BrowserLiveProps): ReactNode {
  const { t, frame, state, sessionId, toolbar, onOpen, viewRef } = props
  const imgRef = useRef<HTMLImageElement | null>(null)
  const heldRef = useRef<HeldKeys>(new Map())
  const rootRef = useRef<HTMLDivElement | null>(null)
  /** 右键菜单位置（相对面板可用区域左上角）；null = 没开。 */
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  /** 把指针事件换算到设备坐标后发往宿主。 */
  const send = useCallback((event: { clientX: number; clientY: number }, build: (
    point: { x: number; y: number },
    frame: PaneFrame,
  ) => void): void => {
    const img = imgRef.current
    if (!img || !frame) return
    const point = toDevice(img.getBoundingClientRect(), frame, event.clientX, event.clientY)
    if (!point) return
    build(point, frame)
  }, [frame, sessionId])

  const onMouseDown = (event: ReactMouseEvent<HTMLImageElement>): void => {
    send(event, (point) => {
      post('/input', mouseMessage('mouse-down', point.x, point.y, mouseButton(event.button), modBits(event)), sessionId)
    })
  }

  const onMouseUp = (event: ReactMouseEvent<HTMLImageElement>): void => {
    send(event, (point) => {
      post('/input', mouseMessage('mouse-up', point.x, point.y, mouseButton(event.button), modBits(event)), sessionId)
    })
  }

  const onMouseMove = (event: ReactMouseEvent<HTMLImageElement>): void => {
    // 只在按住拖动时上报移动：页面里的 hover 效果不值得为每一次指针移动付一次
    // 往返（CDP 的 mouseMoved 也不便宜）。
    if (event.buttons === 0) return
    send(event, (point) => {
      post('/input', mouseMessage('mouse-move', point.x, point.y, mouseButton(event.button), modBits(event)), sessionId)
    })
  }

  const onWheel = (event: ReactWheelEvent<HTMLImageElement>): void => {
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

  const onKeyDown = (event: ReactKeyboardEvent<HTMLImageElement>): void => {
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

  const onKeyUp = (event: ReactKeyboardEvent<HTMLImageElement>): void => {
    heldRef.current.delete(event.code)
    post('/input', {
      type: 'key-up',
      key: event.key,
      code: event.code,
      modifiers: modBits(event),
    }, sessionId)
  }

  /** 焦点离开画面时，释放仍被按住的键，免得页面以为它们一直按着。 */
  const onBlur = (): void => {
    for (const [code, key] of heldRef.current) {
      post('/input', { type: 'key-up', key, code, modifiers: 0 }, sessionId)
    }
    heldRef.current.clear()
  }

  /** 地址栏：把宿主的地址同步进去，但**绝不重建**这个输入框（原因见下面的 effect）。 */
  const addrRef = useRef<HTMLInputElement | null>(null)
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
  const onAddrBlur = (): void => {
    const input = addrRef.current
    if (input !== null && input.value === syncedUrl.current) input.value = state.url
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
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
  const onContextMenu = (event: ReactMouseEvent<HTMLImageElement>): void => {
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
    const close = (): void => { setMenu(null) }
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') close() }
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
