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

import { createElement as h, type ReactElement } from 'react'

/** 图标组件收到的属性，与 DSH `IconProps` 的形状一致。 */
export interface IconProps {
  /** 渲染边长（像素）；不传时按 16 走，和产品自带图标一致。 */
  readonly size?: number
  /** 追加的类名；本图标不需要配色钩子，因此通常不传。 */
  readonly className?: string
}

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
export function ChromeGlyph({ size = 16, className }: IconProps): ReactElement {
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
function strokeIcon(props: IconProps, children: ReactElement[]): ReactElement {
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
export function ArrowLeftGlyph(props: IconProps): ReactElement {
  return strokeIcon(props, [
    h('path', { d: 'M5.79889 24H41.7989' }),
    h('path', { d: 'M17.7988 36L5.79883 24L17.7988 12' }),
  ])
}

/** 前进（右箭头）。 */
export function ArrowRightGlyph(props: IconProps): ReactElement {
  return strokeIcon(props, [
    h('path', { d: 'M41.9999 24H5.99994' }),
    h('path', { d: 'M30 12L42 24L30 36' }),
  ])
}

/** 刷新（两个缺口圆弧 + 两段端头）。 */
export function ReloadGlyph(props: IconProps): ReactElement {
  return strokeIcon(props, [
    h('path', { d: 'M42 8V24' }),
    h('path', { d: 'M6 24L6 40' }),
    h('path', { d: 'M42 24C42 14.0589 33.9411 6 24 6C18.9145 6 14.3216 8.10896 11.0481 11.5M6 24C6 33.9411 14.0589 42 24 42C28.8556 42 33.2622 40.0774 36.5 36.9519' }),
  ])
}
