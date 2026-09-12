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
