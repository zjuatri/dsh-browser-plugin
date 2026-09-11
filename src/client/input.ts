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
 * 把视口内的指针坐标换算成画面帧的设备坐标。
 *
 * @param rect - `<img>` 的包围盒。
 * @param frame - 当前帧（其 width/height 是设备坐标）。
 * @param clientX - 指针的视口 X 坐标。
 * @param clientY - 指针的视口 Y 坐标。
 * @returns 设备坐标；包围盒退化时返回 null。
 */
export function toDevice(
  rect: { left: number; top: number; width: number; height: number },
  frame: PaneFrame,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  if (rect.width <= 0 || rect.height <= 0) return null
  return {
    x: (clientX - rect.left) / rect.width * frame.width,
    y: (clientY - rect.top) / rect.height * frame.height,
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
