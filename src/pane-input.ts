/**
 * 合成输入的派发：把视图发来的鼠标/键盘/滚轮事件翻译成 CDP `Input` 域的调用。
 *
 * 这几个函数很小，但输入保真度全在这里：双击/三击计数、滚轮的行模式小数累积、按住键的
 * 记账（视图失焦时要补发 keyUp）。它们原来是 `PaneStream` 的方法，但和画面流是两件独立
 * 的事 —— 拆出来之后 `pane-stream.ts` 只管「画面怎么送出去」。
 *
 * 坐标约定：这里收到的 `x`/`y` 已经是**页面 CSS 像素**（视图侧用帧的 `cssWidth`/`cssHeight`
 * 换算过，见客户端 `input.ts`），CDP 要的正是这个坐标系，所以这里原样转发，不做任何缩放。
 *
 * @module dsh-browser-plugin/src/pane-input
 */

import type { CDPSession } from 'puppeteer-core'
import type { PaneInputEvent } from './pane-wire.js'

/** 行模式（deltaMode 1）滚轮每个刻度对应的像素。 */
const WHEEL_DETENT_PX = 120
/** 双击/三击判定的时间窗口（毫秒）。 */
const MULTI_CLICK_MS = 500
/** 双击/三击判定的像素容差。 */
const MULTI_CLICK_PX = 4

/**
 * DOM `code` → Windows 虚拟键码。
 *
 * 为什么必须有这张表：CDP 的 `Input.dispatchKeyEvent` 对**不产生文字**的键（退格、Delete、
 * 方向键、Home/End、Tab、Esc…）是**靠虚拟键码**判断"这是哪个编辑/移动动作"的。只给
 * `key`/`code` 时它们**什么都不会发生** —— 实测（真 Chrome，输入框里放 `abcde`）：
 *
 * | 发出去的参数 | 结果 |
 * | --- | --- |
 * | 只有 `key`/`code` 的 Backspace | 值仍是 `abcde`（没删） |
 * | 补上 `windowsVirtualKeyCode: 8` | `abcd` ✓ |
 * | 只有 `key`/`code` 的 Delete | 没删 |
 * | 补上 `46` | `abd` ✓ |
 * | 只有 `key`/`code` 的 ArrowRight | 光标停在 0 不动 |
 * | 补上 `39` | 光标到 1 ✓ |
 *
 * 字母/数字/功能键也一并带上：它们本来靠 `text` 就能输入，但键码一致能让页面的快捷键与
 * `event.keyCode` 分支（不少老站点还在用）看到和真人按键一样的东西。
 */
const VK_BY_CODE: Record<string, number> = {
  Backspace: 8,
  Tab: 9,
  Enter: 13,
  NumpadEnter: 13,
  Escape: 27,
  Space: 32,
  PageUp: 33,
  PageDown: 34,
  End: 35,
  Home: 36,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
  Insert: 45,
  Delete: 46,
  PrintScreen: 44,
  Pause: 19,
  ContextMenu: 93,
  CapsLock: 20,
  NumLock: 144,
  ScrollLock: 145,
  ShiftLeft: 16,
  ShiftRight: 16,
  ControlLeft: 17,
  ControlRight: 17,
  AltLeft: 18,
  AltRight: 18,
  MetaLeft: 91,
  MetaRight: 92,
  NumpadMultiply: 106,
  NumpadAdd: 107,
  NumpadSubtract: 109,
  NumpadDecimal: 110,
  NumpadDivide: 111,
  Semicolon: 186,
  Equal: 187,
  Comma: 188,
  Minus: 189,
  Period: 190,
  Slash: 191,
  Backquote: 192,
  BracketLeft: 219,
  Backslash: 220,
  BracketRight: 221,
  Quote: 222,
}
// 字母、数字、功能键按规律补上（写全表只会更难核对）。
for (let index = 0; index < 26; index++) VK_BY_CODE[`Key${String.fromCharCode(65 + index)}`] = 65 + index
for (let index = 0; index <= 9; index++) {
  VK_BY_CODE[`Digit${index}`] = 48 + index
  VK_BY_CODE[`Numpad${index}`] = 96 + index
}
for (let index = 1; index <= 24; index++) VK_BY_CODE[`F${index}`] = 111 + index

/**
 * 没有 `code` 时的兜底：按 `key` 认。
 *
 * 只列"靠它才能工作"的那些 —— 其余键没有虚拟键码也不影响（文字键靠 `text` 输入）。
 */
const VK_BY_KEY: Record<string, number> = {
  Backspace: 8,
  Tab: 9,
  Enter: 13,
  Escape: 27,
  ' ': 32,
  PageUp: 33,
  PageDown: 34,
  End: 35,
  Home: 36,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
  Insert: 45,
  Delete: 46,
}

/**
 * 这个键对应的 Windows 虚拟键码（认不出来就返回空对象）。
 *
 * @param code - DOM `KeyboardEvent.code`（物理键位）。
 * @param key - DOM `KeyboardEvent.key`（逻辑键值）。
 * @returns 可直接展开进 CDP 参数的 `windowsVirtualKeyCode`/`nativeVirtualKeyCode`。
 */
export function virtualKeyCodes(code: string, key: string): {
  windowsVirtualKeyCode?: number
  nativeVirtualKeyCode?: number
} {
  const vk = VK_BY_CODE[code] ?? VK_BY_KEY[key]
  if (vk === undefined) return {}
  return { windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }
}

/** 上一次点击的记忆，用于双击/三击判定。 */
interface ClickState {
  button: string
  at: number
  x: number
  y: number
  count: number
}

/**
 * 派发期间需要跨事件记住的东西。
 *
 * 由调用方持有（一个视图一份），这里只做读写，因此本模块没有自己的状态。
 */
export interface InputMemory {
  /** 双击/三击判定状态（同键、500ms 内、4px 内则计数 +1，上限 3）。 */
  clickState: ClickState
  /** 滚轮小数增量累积到整数像素后再发出。 */
  wheelRemainderX: number
  wheelRemainderY: number
  /** 页面里当前被按住的键：code -> key，视图客户端离开时释放。 */
  heldKeys: Map<string, string>
}

/** 造一份空的输入记忆。 */
export function createInputMemory(): InputMemory {
  return {
    clickState: { button: 'none', at: 0, x: 0, y: 0, count: 0 },
    wheelRemainderX: 0,
    wheelRemainderY: 0,
    heldKeys: new Map(),
  }
}

/** 把带符号的小数增量朝零取整。 */
function wholeDelta(value: number): number {
  return value < 0 ? Math.ceil(value) : Math.floor(value)
}

/** 计算本次点击的 clickCount（双击/三击）。 */
function nextClickCount(memory: InputMemory, button: string, x: number, y: number): number {
  const now = Date.now()
  const close = Math.abs(x - memory.clickState.x) <= MULTI_CLICK_PX
    && Math.abs(y - memory.clickState.y) <= MULTI_CLICK_PX
  const count = memory.clickState.button === button && now - memory.clickState.at <= MULTI_CLICK_MS && close
    ? Math.min(memory.clickState.count + 1, 3)
    : 1
  memory.clickState = { button, at: now, x, y, count }
  return count
}

/**
 * 把一条视图输入事件派发进页面。
 *
 * @param session - 该页面的 CDP 会话。
 * @param memory - 这一份视图的输入记忆（跨事件累积）。
 * @param event - 视图发来的输入事件。
 */
export async function dispatchInput(
  session: CDPSession,
  memory: InputMemory,
  event: PaneInputEvent,
): Promise<void> {
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
      const clickCount = nextClickCount(memory, event.button, event.x, event.y)
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
        clickCount: Math.max(1, memory.clickState.count),
        modifiers: event.modifiers,
      })
      return
    case 'wheel': {
      const step = event.deltaMode === 1 ? WHEEL_DETENT_PX : event.deltaMode === 2 ? 600 : 1
      memory.wheelRemainderX += event.deltaX * step
      memory.wheelRemainderY += event.deltaY * step
      const deltaX = wholeDelta(memory.wheelRemainderX)
      const deltaY = wholeDelta(memory.wheelRemainderY)
      memory.wheelRemainderX -= deltaX
      memory.wheelRemainderY -= deltaY
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
      if (!memory.heldKeys.has(event.code) && event.code !== '') memory.heldKeys.set(event.code, event.key)
      await session.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: event.key,
        code: event.code,
        text: event.text === '' ? undefined : event.text,
        modifiers: event.modifiers,
        // 退格/Delete/方向键这些没有文字的键，全靠它才会真的生效（见 VK_BY_CODE）。
        ...virtualKeyCodes(event.code, event.key),
      })
      return
    }
    case 'key-up':
      memory.heldKeys.delete(event.code)
      await session.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: event.key,
        code: event.code,
        modifiers: event.modifiers,
        ...virtualKeyCodes(event.code, event.key),
      })
      return
  }
}

/**
 * 释放页面里仍被按住的键。
 *
 * 视图失焦或断开时页面收不到 keyUp，键会一直「按着」（输入框里出现连打、快捷键卡住），
 * 所以由视图这一侧补发。
 *
 * @param session - 该页面的 CDP 会话；没有会话时只清记账。
 * @param memory - 这一份视图的输入记忆。
 */
export function releaseHeldKeys(session: CDPSession | null, memory: InputMemory): void {
  if (session === null || memory.heldKeys.size === 0) {
    memory.heldKeys.clear()
    return
  }
  for (const [code, key] of memory.heldKeys) {
    void session.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code }).catch(() => {})
  }
  memory.heldKeys.clear()
}
