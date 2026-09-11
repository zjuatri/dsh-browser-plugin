/**
 * 客户端打包器的测试。
 *
 * 客户端半边是自写打包器拼出来的，其中两个 bug 都只在浏览器里才炸得很远：多行
 * 具名 import 被截断成 `import {`（整条导入丢掉），以及平台种子模块的具名绑定没被
 * 写进模块命名空间（消费方拿到 `undefined`）。这里把这两类问题钉在构建期。
 *
 * 用法：node test/client-modules.test.mjs
 */

import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collect, moduleFaces, splitImports, stripTypes } from '../scripts/build-client.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bundle = readFileSync(join(root, 'lib/client.js'), 'utf8')
const modules = collect(join(root, 'src/client/index.ts'))

// ── 多行具名导入必须完整解析 ────────────────────────────────────────────────

const multi = splitImports(
  stripTypes([
    'import {',
    '  useEffect,',
    '  useRef,',
    '  useState,',
    '} from \'react\'',
    'const after = 1',
  ].join('\n'), 'probe.ts'),
  'probe.ts',
)
assert.deepEqual(
  multi.imports,
  [{ specifier: 'react', names: [
    { imported: 'useEffect', local: 'useEffect' },
    { imported: 'useRef', local: 'useRef' },
    { imported: 'useState', local: 'useState' },
  ] }],
  '多行具名导入必须整条解析，且每个名字都要保留',
)
assert.ok(multi.body.includes('const after = 1'), 'import 之后的正文不能被吃掉')

// ── 每个模块的导出面必须包含它引入的绑定 ────────────────────────────────────

for (const row of modules) {
  const faces = moduleFaces(row.body, row.imports)
  for (const entryImport of row.imports) {
    for (const { local } of entryImport.names) {
      assert.ok(faces.includes(local), `${row.file} 的导出面缺少引入的绑定 ${local}`)
    }
  }
}

// ── 平台种子模块的绑定必须真的可用 ──────────────────────────────────────────
// 模块正文里的 `const { useState } = react` 会从工厂作用域取 `react`，因此工厂
// 必须把模块用到的每个 React 具名导出都绑出来。
const factoryBindings = /const \{([^}]*)\} = react;/u.exec(bundle)
assert.ok(factoryBindings !== null, '工厂必须从 react 绑出具名导出')
const available = new Set(factoryBindings[1].split(',').map(name => name.trim()).filter(Boolean))

const requested = new Set()
for (const match of bundle.matchAll(/const \{([^}]*)\} = react;/gu)) {
  for (const part of match[1].split(',')) {
    const name = part.split(':').pop()?.trim()
    if (name) requested.add(name)
    if (name) requested.add(part.trim().split(':')[0].trim())
  }
}
for (const name of requested) {
  assert.ok(available.has(name), `模块解构了 react.${name}，但工厂没有绑定它`)
}

// ── 生成物必须带齐模块命名空间 ──────────────────────────────────────────────

for (const row of modules) {
  assert.ok(bundle.includes(`const ${row.id} = (() => {`), `产物缺少模块 ${row.id}（${row.file}）`)
}

process.stdout.write('client-modules: 全部通过\n')
