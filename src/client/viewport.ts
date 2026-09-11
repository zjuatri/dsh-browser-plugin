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

import { useEffect, type RefObject } from 'react'
import { post } from './state.js'

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
export function useViewportReport(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  sessionId?: string,
): void {
  useEffect(() => {
    const element = ref.current
    if (!enabled || element === null) return

    let lastSentAt = 0
    let lastWidth = 0
    let lastHeight = 0

    const report = (force: boolean): void => {
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
