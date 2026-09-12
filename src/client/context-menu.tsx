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

import { createElement as h, type ReactNode } from 'react'
import { paneRoute } from './state.js'
import type { Translate } from './text.js'

/** 右键菜单的属性。 */
export interface ContextMenuProps {
  t: Translate
  /** 相对面板可用区域左上角的坐标（像素）。 */
  x: number
  y: number
  /** 该会话的浏览器是否已经活着；没活就只显示禁用项，免得点进一个错误页。 */
  active: boolean
  /** 本视图所属的会话（宿主按它分发到该会话自己的浏览器）。 */
  sessionId?: string
  /** 关闭菜单（点条目、点别处、按 Esc 都会调）。 */
  onClose: () => void
}

/** 画面上的右键菜单。 */
export function ContextMenu(props: ContextMenuProps): ReactNode {
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
    onMouseDown: (event: { stopPropagation: () => void }) => { event.stopPropagation() },
  }, item)
}
