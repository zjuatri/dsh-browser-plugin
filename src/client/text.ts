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
export const NS = 'browserTab'

/** 中文文案（默认语言）。 */
export const zh = {
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
} as const

/** 英文文案。 */
export const en: Record<keyof typeof zh, string> = {
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
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) => values[key] ?? match)
}

/**
 * 本插件用到的翻译函数形状。
 *
 * 之所以在这里声明而不是从 locale 包导入完整类型：插件对客户端包只做平台种子式
 * 的 `require`，本地声明让客户端半边可以独立类型检查（也能单独测试），而注册时
 * 传入的真实绑定在结构上与本类型兼容。
 */
export type Translate = (key: keyof typeof zh) => string
