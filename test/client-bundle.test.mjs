/**
 * 客户端产物的结构测试。
 *
 * 客户端半边必须是 DSH 的 lazy-CJS 插件格式，且不能 require 平台种子之外的任何
 * 说明符 —— 这两条一旦破坏，失败会发生在浏览器启动时而不是构建时，所以在这里守住。
 *
 * 用法：node test/client-bundle.test.mjs
 */

import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { collect, emit, splitImports, stripTypes } from '../scripts/build-client.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bundlePath = join(root, 'lib/client.js')
const bundle = readFileSync(bundlePath, 'utf8')

// ── 打包层 ──────────────────────────────────────────────────────────────────

assert.ok(
  bundle.includes('window.__ModuleLoader__.load({'),
  '产物必须以 __ModuleLoader__.load 包装（lazy-CJS 契约）',
)
assert.ok(
  /id:\s*"dsh-browser-plugin"/u.test(bundle),
  'id 必须是本包名：客户端 HMR 按它清理样式与失效缓存',
)
assert.ok(bundle.includes('factory: (require) =>'), '必须是工厂形式（执行时只注册，不运行）')
assert.ok(/exports\.apply\s*=/u.test(bundle), '必须导出 apply')
assert.ok(/exports\.inject\s*=/u.test(bundle), '必须导出 inject')

// ── 平台种子纯度 ────────────────────────────────────────────────────────────
// 只允许 require 外壳预置的模块；其余一切必须内联。
const ALLOWED = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
])
const required = [...bundle.matchAll(/require\(\s*["']([^"']+)["']\s*\)/gu)].map(match => match[1])
for (const specifier of new Set(required)) {
  assert.ok(ALLOWED.has(specifier), `产物 require 了非平台种子模块：${specifier}`)
}

// ── 类型语法必须已被剥离 ────────────────────────────────────────────────────
for (const pattern of [/\binterface\s+\w+\s*\{/u, /\btype\s+\w+\s*=/u, /\bas\s+const\b/u, /\bsatisfies\s+\w/u]) {
  assert.ok(!pattern.test(bundle), `产物里残留了类型语法：${String(pattern)}`)
}

// ── 会话 plumbing：视图必须自报会话 ─────────────────────────────────────────
// 浏览器按会话隔离，视图不带会话参数就会连到「无名会话」那只浏览器上，看到的不是本对话
// 的画面 —— 而且一切看起来都正常。这条只能在产物上守。
assert.ok(
  bundle.includes('/browser-pane${path}'),
  '客户端必须能拼出带会话参数的路由地址',
)
assert.ok(
  bundle.includes('?session=${encodeURIComponent(sessionId)}'),
  '客户端路由必须带上 session 查询参数',
)
assert.ok(
  bundle.includes('new EventSource(') && bundle.includes('paneRoute('),
  '画面流必须经 paneRoute 拼地址（否则拿不到本会话的画面）',
)
assert.ok(
  /sessionId/u.test(bundle),
  '正文组件必须从框架注入的 props 里取 sessionId 并往下传',
)

// ── 语法可解析 ──────────────────────────────────────────────────────────────
const check = spawnSync(process.execPath, ['--check', bundlePath], { encoding: 'utf8' })
assert.equal(check.status, 0, `产物语法错误：\n${check.stderr}`)

// ── 模块拆分 ────────────────────────────────────────────────────────────────

const modules = collect(join(root, 'src/client/index.ts'))
assert.ok(modules.length >= 5, `模块图太小（${String(modules.length)}），依赖解析可能漏了相对 import`)
assert.equal(modules[modules.length - 1].file, join(root, 'src/client/index.ts'), '入口模块必须最后拼接')

// 多行 import 必须被完整解析（曾经因为只截到行尾而漏掉整条语句）。
const multiLine = splitImports(
  stripTypes("import {\n  a,\n  b,\n} from './x.js'\n", 'probe.ts'),
  'probe.ts',
)
assert.deepEqual(multiLine.imports, [{ specifier: './x.js', names: [{ imported: 'a', local: 'a' }, { imported: 'b', local: 'b' }] }])

// ── 拼接结果必须引用真实存在的绑定 ──────────────────────────────────────────
// 命名空间里指向函数内局部变量的引用会是 ReferenceError，这里静态拦住。
const emitted = emit(modules)
const declared = new Set()
for (const match of emitted.matchAll(/^\s*(?:const|let|var|function|class)\s+(?:_M\d+_)?([A-Za-z_$][\w$]*)/gmu)) {
  declared.add(match[1])
}
for (const match of emitted.matchAll(/\{\s*([^}]*)\}\s*=\s*(M\d+)/gu)) {
  for (const part of match[1].split(',')) {
    const local = part.split(':')[0]?.trim()
    if (local) declared.add(local)
  }
}
const referenced = [...emitted.matchAll(/\b(M\d)_([A-Za-z_$][\w$]*)/gu)].map(match => `${match[1]}_${match[2]}`)
const missing = [...new Set(referenced)].filter(name => !declared.has(name))
assert.deepEqual(missing, [], `拼接产物引用了未声明的绑定：${missing.join(', ')}`)

process.stdout.write('client-bundle: 全部通过\n')
