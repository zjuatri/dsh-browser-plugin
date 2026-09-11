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

import { createElement as h, useRef, useState, type ReactNode } from 'react'
import { BrowserLive } from './browser-live.js'
import { post, usePaneStream, type BrowserMode, type PaneTab } from './state.js'
import type { Translate } from './text.js'
import { useViewportReport } from './viewport.js'

/**
 * 标签页组件的属性。
 *
 * `t` 由注册时的 `locale` 注入；`sessionId` 由槽位框架注入（这个槽位是
 * `scope: 'session'`，框架把所在会话的标识一并交给正文）—— 视图靠它认领**本对话自己**
 * 的那只浏览器，实测与工具侧的 `exec.agent.id` 是同一个值。
 */
export interface BrowserTabProps {
  t: Translate
  sessionId?: string
}

/** 浏览器模式的显示顺序（两值，与运行时一致；没有「我的 Chrome」这一档）。 */
const MODES: readonly BrowserMode[] = ['own', 'stealth']

/** 每个模式在文案表里的键。 */
const MODE_LABEL = {
  own: 'mode.own',
  stealth: 'mode.stealth',
} as const

/** 每个模式在文案表里的提示键。 */
const MODE_TITLE = {
  own: 'mode.own.title',
  stealth: 'mode.stealth.title',
} as const

/** 一行标签页的显示文字：优先标题，其次主机名，最后“新标签页”。 */
function tabLabel(tab: PaneTab, fallback: string): string {
  if (tab.title && tab.title !== 'New Tab' && tab.title !== 'about:blank') return tab.title
  if (tab.url && tab.url !== 'about:blank') {
    const withoutScheme = tab.url.replace(/^[a-z]+:\/\//iu, '')
    return withoutScheme.split('/')[0] ?? tab.url
  }
  return fallback
}

/** 标签条：切换/关闭标签页，以及新建一个。 */
function TabStrip(props: { t: Translate; tabs: PaneTab[]; sessionId?: string }): ReactNode {
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
        onClick: (event: { stopPropagation: () => void }) => {
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
function ModeSwitch(props: {
  t: Translate
  mode: BrowserMode
  busy: boolean
  onSwitch: (mode: BrowserMode) => void
}): ReactNode {
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
export function BrowserTab(props: BrowserTabProps): ReactNode {
  const { t, sessionId } = props
  const { frame, state, tabs } = usePaneStream(sessionId)
  const [pending, setPending] = useState<BrowserMode | null>(null)
  // 宿主确认模式已经变过来之后，就不再显示“正在切换”。
  const switching = pending !== null && pending !== state.mode
  // 视图容器就是面板的可用区域：把它的尺寸报给宿主，浏览器视口便与面板同形。
  const viewRef = useRef<HTMLDivElement | null>(null)
  useViewportReport(viewRef, true, sessionId)

  /** 切换智能体使用的浏览器；切换期间禁用按钮避免连点。 */
  const switchMode = (mode: BrowserMode): void => {
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
      onOpen: (url: string) => { post('/goto', { url }, sessionId) },
      toolbar: null,
      viewRef,
    }),
    h(ModeSwitch, { t, mode: state.mode, busy: switching, onSwitch: switchMode }))
}
