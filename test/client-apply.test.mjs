/**
 * 客户端插件主体的行为测试。
 *
 * 产物“语法正确、能被浏览器加载”并不等于“注册成功”：`apply` 里的任何一次 throw
 * 都会让右侧边栏少掉整个浏览器标签页，而且现象是静默的（面板只是空的）。因此这里
 * 在 Node 里搭一个最小的 lazily-CJS 宿主环境，真正执行一遍 `apply`，断言它注册了
 * 标签页类型（含指南页入口与它的 Chrome 标）与标签页正文，都带上了语言命名空间，
 * 并且**没有**再往会话标题栏塞按钮。
 *
 * 用法：node test/client-apply.test.mjs
 */

import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bundlePath = join(root, 'lib/client.js')
const bundle = readFileSync(bundlePath, 'utf8')

/**
 * 测试用的最小 React 替身。
 *
 * 本测试只关心**注册**行为，不渲染界面，因此 `createElement` 记下参数即可；这样
 * 测试就不需要真的装上 React，也不会因为某个组件在渲染时抛错而误判注册失败。
 */
const reactShim = {
  createElement: (type, props, ...children) => ({ $$typeof: 'element', type, props, children }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useRef: (initial) => ({ current: initial ?? null }),
  useCallback: (callback) => callback,
  Fragment: Symbol('Fragment'),
}

// ── 最小宿主环境 ────────────────────────────────────────────────────────────

/** 收集客户端插件通过 ctx 做过的每一项注册。 */
function createRecordingContext() {
  const record = {
    dictionaries: [],
    types: [],
    bodies: [],
    titles: [],
    headers: [],
    effects: 0,
  }
  const slots = {
    inject: (name, register) => {
      record.injected = [...(record.injected ?? []), name]
      return register()
    },
    register: (registration, component) => {
      if (registration.name === 'sidebar.right.pane.tab') record.bodies.push({ registration, component })
      else if (registration.name === 'sidebar.right.pane.tab.title') record.titles.push({ registration, component })
      else if (registration.name === 'conversation.session.header.actions') record.headers.push({ registration, component })
      else record.bodies.push({ registration, component })
      return () => {}
    },
  }
  const ctx = {
    slots,
    locale: {
      register: (ns, dictionaries) => {
        record.dictionaries.push({ ns, dictionaries })
        return () => {}
      },
      bind: (ns) => {
        record.bound = ns
        return (key) => {
          const zh = record.dictionaries.find(item => item.ns === ns)?.dictionaries.zh
          return zh?.[key] ?? `«${key}»`
        }
      },
    },
    sidebarRightTabs: {
      register: (definition) => {
        record.types.push(definition)
        return () => {}
      },
    },
    effect: (callback) => {
      record.effects++
      return callback()
    },
  }
  return { ctx, record }
}

/** 最小 DOM 替身：只覆盖 `ensureStyles` 用到的两个调用。 */
function createDocumentShim() {
  const children = []
  return {
    created: [],
    head: {
      querySelector: (selector) => children.find(node => `style[data-plugin="${node.dataset.plugin}"]` === selector) ?? null,
      appendChild: (node) => {
        children.push(node)
        return node
      },
    },
    createElement: () => {
      const node = { dataset: {}, textContent: '' }
      return node
    },
  }
}

/** 在宿主环境里实体化插件产物。 */
function materialize() {
  const factories = new Map()
  globalThis.window = {
    __ModuleLoader__: {
      load: ({ id, factory }) => factories.set(id, factory),
    },
  }
  globalThis.document = createDocumentShim()
  // 产物只 require 平台种子模块；测试只需 `react`，用上面的替身即可。
  const require = (specifier) => {
    if (specifier === 'react') return reactShim
    throw new Error(`测试宿主没有提供平台模块：${specifier}`)
  }
  // eslint-disable-next-line no-eval
  ;(0, eval)(bundle)
  const factory = factories.get('dsh-browser-plugin')
  assert.ok(factory !== undefined, '产物必须注册 id 为 dsh-browser-plugin 的工厂')
  return factory(require)
}

// ── 断言 ────────────────────────────────────────────────────────────────────

const exportsObject = materialize()
assert.equal(typeof exportsObject.apply, 'function', '产物必须导出 apply')
assert.ok(Array.isArray(exportsObject.inject), '产物必须导出 inject')

const { ctx, record } = createRecordingContext()
exportsObject.apply(ctx)

// 1) 文案字典
assert.equal(record.dictionaries.length, 1, '必须注册一份界面文案字典')
const dictionary = record.dictionaries[0].dictionaries
assert.ok(Object.keys(dictionary.zh).length > 10, '中文文案太少，界面可能有硬编码')
assert.deepEqual(
  Object.keys(dictionary.zh).sort(),
  Object.keys(dictionary.en).sort(),
  '中英文案必须一一对应',
)

// 2) 标签页类型与指南页入口：这是“和飞书一样作为侧边栏一个选项”的落点
assert.equal(record.types.length, 1, '必须注册一个标签页类型')
const definition = record.types[0]
assert.equal(definition.kind, 'browser', '标签页类型判别值应为 browser')
assert.equal(definition.priority, 'extension', '插件类型应声明 extension 优先级')
assert.ok(typeof definition.title === 'function', '类型必须提供标题 thunk')
assert.equal(definition.title(), '浏览器', '标签页标题必须是中文')
assert.ok(Array.isArray(definition.guide) && definition.guide.length === 1, '必须贡献一个指南页入口')
assert.equal(definition.guide[0].title(), '浏览器')
assert.ok(definition.guide[0].description().length > 0, '指南页入口必须有说明文字')

// 2b) 指南页入口的图标：不给图标时指南页会画产品自带的立方体占位图，因此这里
// 必须真的是本包内联的 Chrome 标 —— 八个色块，外加一个不和别人撞名的渐变 id。
const guideIcon = definition.guide[0].icon
assert.equal(typeof guideIcon, 'function', '指南页入口必须带自己的图标，而不是用占位图')
const glyph = guideIcon({ size: 26 })
assert.equal(glyph.type, 'svg', '指南页图标必须渲染成内联 svg')
assert.equal(glyph.props.width, 26, '图标必须跟随槽位给的尺寸')
assert.equal(glyph.props.height, 26)
assert.equal(glyph.props.viewBox, '0 0 435.816 437.46', 'viewBox 必须是所给 SVG 的')
const glyphPaths = glyph.children.filter(child => child.type === 'path')
assert.ok(glyphPaths.length >= 8, `Chrome 标应有 8 个色块，实际 ${String(glyphPaths.length)} 个`)
const gradientId = glyph.children.find(child => child.type === 'defs')?.children[0]?.props.id
assert.ok(
  typeof gradientId === 'string' && gradientId.includes('dsh-browser-plugin'),
  '渐变 id 必须带包名：内联 SVG 的 id 是全文档可见的，裸 id 会被别人的 url(#…) 抢走',
)
assert.ok(
  glyphPaths.some(path => path.props.fill === `url(#${String(gradientId)})`),
  '蓝环必须引用本图标自己的渐变',
)

// 3) 标签页正文注册到正确的槽位、按类型 id 键控
assert.equal(record.bodies.length, 1, '必须注册一个标签页正文')
assert.equal(record.bodies[0].registration.name, 'sidebar.right.pane.tab')
assert.equal(record.bodies[0].registration.key, definition.id, '正文必须按类型 id 键控')
assert.equal(record.bodies[0].registration.locale, record.dictionaries[0].ns, '正文必须带上语言命名空间')
assert.equal(typeof record.bodies[0].component, 'function', '正文必须是组件')

// 3b) 会话标题栏按钮已按需求移除：入口只保留指南页卡片这一处，标题栏里不再多一个
// 和右边栏展开按钮抢位置的按钮。
assert.deepEqual(record.headers, [], '不得再往会话标题栏注册任何按钮')

// 4) 注入的服务声明必须覆盖用到的每一个 ctx 成员；标题栏按钮移除后 `sidebarRight`
// 不再被用到（它只服务于 openTab），因此也不该再声明。
for (const service of ['slots', 'locale', 'sidebarRightTabs']) {
  assert.ok(exportsObject.inject.includes(service), `inject 缺少服务 ${service}`)
}
assert.ok(!exportsObject.inject.includes('sidebarRight'), '标题栏按钮已移除，不应再声明 sidebarRight')

// 5) 样式注入：apply 必须挂上自己的 <style>，且归属标记是本包名（HMR 依赖它清理）
const injected = globalThis.document.head.querySelector('style[data-plugin="dsh-browser-plugin"]')
assert.ok(injected !== null, 'apply 必须注入本包的样式表')
assert.ok(injected.textContent.includes('--dsw-alias-'), '样式必须使用 DSH 设计令牌，而不是写死的颜色')
assert.ok(!/#[0-9a-f]{6}/iu.test(injected.textContent.replace(/,#[0-9a-f]{3,8}/giu, '')), '样式里不应残留写死的十六进制颜色')

process.stdout.write('client-apply: 全部通过\n')
