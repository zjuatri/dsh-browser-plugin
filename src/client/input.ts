/**
 * 视图上的输入映射：把 DOM 事件翻译成 CDP 期望的取值。
 *
 * 这些函数很小，但它们是画面（一张 `<img>`）与真实页面之间唯一的语义层，单独放
 * 一处以免散落在事件处理器里。
 *
 * @module dsh-browser-plugin/src/client/input
 */

import type { PaneFrame, PaneInputMessage } from './state.js'

/** 把 DOM 的 button 下标映射为 CDP 的鼠标键名。 */
export function mouseButton(button: number): 'left' | 'right' | 'middle' | 'none' {
  if (button === 1) return 'middle'
  if (button === 2) return 'right'
  return 'left'
}

/** 由 DOM 事件算出 CDP 修饰键位掩码（alt=1、ctrl=2、meta=4、shift=8）。 */
export function modBits(event: { shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }): number {
  return (event.altKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) | (event.metaKey ? 4 : 0) | (event.shiftKey ? 8 : 0)
}

/** 交给 CDP 的可打印键文本；控制键返回 undefined。 */
export function keyText(key: string): string | undefined {
  return key.length === 1 ? key : undefined
}

/**
 * 把一次键盘按下翻译成 CDP 所需的 `text`。
 *
 * 带修饰键时不给文本：Ctrl+C 必须是复制，而不是打出字母 c。回车给换行符
 * （参考模型），这样 textarea 与表单能收到它。
 */
export function keyDownText(event: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): string | undefined {
  if (event.ctrlKey || event.metaKey || event.altKey) return undefined
  if (event.key === 'Enter') return '\r'
  return keyText(event.key)
}

/** 键盘按下后是否应当阻止浏览器默认行为（否则按键会被 GUI 自己吃掉）。 */
export function shouldPreventKeyDefault(text: string | undefined, key: string): boolean {
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
export function toDevice(
  rect: { left: number; top: number; width: number; height: number },
  frame: PaneFrame,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
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
export function mouseMessage(
  type: 'mouse-move' | 'mouse-down' | 'mouse-up',
  x: number,
  y: number,
  button: 'left' | 'right' | 'middle' | 'none',
  modifiers: number,
): PaneInputMessage {
  return { type, x, y, button, modifiers }
}
