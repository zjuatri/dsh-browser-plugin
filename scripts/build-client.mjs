/**
 * 客户端产物的构建脚本（无外部依赖）。
 *
 * 本包的宿主半边是普通的 ESM，Node 直接加载 `lib/index.js` 即可；客户端半边则必须
 * 是 DSH 的 **lazy-CJS 插件格式**：一个 `window.__ModuleLoader__.load({id, factory})`
 * 包装，其中 `factory(require)` 只能用平台种子说明符
 * （`react`、`react-dom`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-*` …）
 * 去 `require`，其余一切都要内联 —— 客户端插件没有构建产物，本文件就是那个构建。
 *
 * 脚本做四件事：
 *   1. 从入口出发，沿相对 import 构建模块图（`.js` 说明符映射到同名的 `.ts`/`.tsx`）；
 *   2. 剥掉 TypeScript 语法 —— 交给 Node 内置的 `stripTypeScriptTypes`，它按真正的
 *      TypeScript 解析器工作，联合类型、泛型、断言、`interface`/`type` 声明全都覆盖；
 *   3. 按依赖顺序拼接模块，用模块命名空间对象（`M1`、`M2` …）承载跨模块导出；
 *   4. 包上 lazy-CJS 包装并写入 `lib/client.js`。
 *
 * 唯一自写的逻辑是 import/export 的识别与重接：客户端插件里每个模块的 import 都要
 * 变成对前一个模块命名空间的解构，这是打包器才关心的信息，类型解析器不管。
 *
 * 产物在写出前会逐个模块交给 `node --check` 校验，任何转写错误都会在构建期失败，
 * 而不是等到浏览器里。
 *
 * 用法：node scripts/build-client.mjs
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { stripTypeScriptTypes } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const clientEntry = join(root, 'src/client/index.ts')
const outputFile = join(root, pkg.exports['./client'].default)

// ── 源码处理 ────────────────────────────────────────────────────────────────

/**
 * 用 Node 内置解析器剥掉 TypeScript 类型语法。
 *
 * `mode: 'strip'` 只删类型、不做转换，因此 import/export 语句会原样保留，正好交给
 * 下面的模块图与拼接处理。
 *
 * @param source - TypeScript 源码。
 * @param file - 源码路径（仅用于报错信息）。
 * @returns 纯 JavaScript 源码。
 */
function stripTypes(source, file) {
  try {
    return stripTypeScriptTypes(source, { mode: 'strip' })
  } catch (error) {
    throw new Error(`build-client: 类型剥离失败 ${file}\n${error.message}`)
  }
}

/**
 * 从 `start` 处读出一条以分号或换行结束的语句（import/export 专用）。
 *
 * 需要处理多行的具名列表，因此按花括号配平与引号状态判断结束位置：引号已闭合、
 * 花括号已配平，遇到分号或换行即为语句结束。
 *
 * @param source - 源码。
 * @param start - 语句起点。
 * @returns 语句文本。
 */
function readStatement(source, start) {
  let i = start
  let depth = 0
  let quote = null
  let hadQuote = false
  while (i < source.length) {
    const ch = source[i]
    if (quote !== null) {
      if (ch === '\\') { i += 2; continue }
      if (ch === quote) quote = null
      i++
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      hadQuote = true
      i++
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') depth--
    else if (depth === 0 && ch === ';') return source.slice(start, i)
    // 换行只在“模块说明符已经出现过”时才结束语句：`import {\n a,\n} from 'x'` 的
    // 首行换行必须继续读下去，否则整条导入会被截断成 `import {`。
    else if (depth === 0 && ch === '\n' && hadQuote) return source.slice(start, i)
    i++
  }
  return source.slice(start)
}

/**
 * 取出模块的全部 import 语句并返回其余正文。
 *
 * 在类型剥离之后再解析，因此这里面对的是标准 JavaScript 的 import 语法：多行具名
 * 列表、默认导入、副作用导入都能正确处理，字符串里的分号也不会造成误判。
 *
 * @param source - 已剥掉类型的源码。
 * @param file - 源码路径。
 * @returns 值导入表（跳过 `import type`）与剩余正文。
 */
function splitImports(source, file) {
  const imports = []
  let body = ''
  let i = 0
  while (i < source.length) {
    const atLineStart = i === 0 || source[i - 1] === '\n'
    if (atLineStart && /^[ \t]*import\b/u.test(source.slice(i, i + 12))) {
      const statement = readStatement(source, i)
      const consumed = statement.length
      i += consumed
      if (source[i] === ';' || source[i] === '\n') i++
      if (/^[ \t]*import\s+type\b/u.test(statement)) continue
      if (/^[ \t]*import\s*\(/u.test(statement)) {
        body += statement
        continue
      }
      const named = /^[ \t]*import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]/u.exec(statement)
      const defaultImport = /^[ \t]*import\s+([A-Za-z_$][\w$]*)\s*(?:,\s*\{[\s\S]*?\})?\s*from\s*['"]([^'"]+)['"]/u.exec(statement)
      const bare = /^[ \t]*import\s*['"]([^'"]+)['"]/u.exec(statement)
      if (named) {
        const names = named[1].split(',')
          .map(part => part.trim())
          .filter(Boolean)
          .map(part => part.split(/\s+as\s+/u))
          .map(([imported, local]) => ({ imported, local: local ?? imported }))
          .filter(entry => entry.imported !== '')
        if (names.length > 0) imports.push({ specifier: named[2], names })
        continue
      }
      if (defaultImport) {
        imports.push({ specifier: defaultImport[2], names: [{ imported: 'default', local: defaultImport[1] }] })
        continue
      }
      if (bare) {
        imports.push({ specifier: bare[1], names: [] })
        continue
      }
      throw new Error(`build-client: 不支持的 import 形态（${file}）：${statement.trim()}`)
    }
    body += source[i]
    i++
  }
  return { imports, body }
}

/** 去掉 `export` 关键字与 `export { … }`（导出关系稍后按模块命名空间重新建立）。 */
function stripExportKeyword(body) {
  return body
    .replace(/^([ \t]*)export\s+(?=(?:const|let|var|function|class|async)\b)/gmu, '$1')
    .replace(/\n[ \t]*export\s*\{[^}]*\}\s*(?:from\s*['"][^'"]+['"])?\s*;?/gu, '\n')
}

/**
 * 列出一个模块的导出面：顶层的具名声明，**加上**它从别的模块引入的绑定。
 *
 * 第二项是关键：`const { useState } = react` 这类跨模块导入在拼接后是本模块作用域里
 * 的普通局部名，模块命名空间如果不带上它，消费方就会拿到 `undefined` —— 而失败现场
 * 距离原因很远（例如「useState is not defined」）。
 *
 * @param body - 已剥掉类型的模块正文。
 * @param imports - 该模块的导入表。
 * @returns 导出面名字（去重）。
 */
function moduleFaces(body, imports) {
  const names = new Set(declaredNames(body))
  for (const entryImport of imports) {
    for (const { local } of entryImport.names) names.add(local)
  }
  return [...names]
}

/**
 * 列出一个模块真正的**顶层**具名绑定。
 *
 * 只认第 0 列开始的声明：函数体里的 `const view = …` 之类不是模块导出面。具名解构
 * （`const { a, b } = …`）是跨模块导入的落点，必须一并列出。
 *
 * @param body - 已剥掉类型的模块正文。
 * @returns 顶层绑定名（去重）。
 */
function declaredNames(body) {
  const names = new Set()
  for (const match of body.matchAll(/^(?:const|let|var|function|class|async function)\s+([A-Za-z_$][\w$]*)/gmu)) {
    names.add(match[1])
  }
  for (const match of body.matchAll(/^(?:const|let|var)\s*\{([^}]*)\}\s*=/gmu)) {
    for (const part of match[1].split(',')) {
      const name = part.split(':').pop()?.trim().split(/\s*=/u)[0]?.trim()
      if (name && /^[A-Za-z_$][\w$]*$/u.test(name)) names.add(name)
    }
  }
  return [...names]
}

/**
 * 读入并处理一个模块：先做一次最小归一化，再交给 Node 剥类型，最后拆出 import。
 *
 * 归一化只做一件事：把“重新导出”改写成本地声明再导出。Node 的剥离模式遇到
 * `export type { X } from './y'`、`export { X } from './y'` 会自行保留或解析失败，
 * 而本包是打包式加载（每个模块一个命名空间），所以这类语句在这里没有任何意义，
 * 直接退化成 `export {}` 即可。
 *
 * @param file - 模块路径。
 * @returns 值导入表与剥完类型的正文。
 */
function processModule(file) {
  const raw = readFileSync(file, 'utf8')
  const normalized = raw
    .replace(/^[ \t]*export\s+type\s+\{[^}]*\}\s*from\s*['"][^'"]+['"]\s*;?/gmu, 'export {}')
    .replace(/^[ \t]*export\s*\{[^}]*\}\s*from\s*['"][^'"]+['"]\s*;?/gmu, 'export {}')
    .replace(/^[ \t]*export\s+\*\s+from\s*['"][^'"]+['"]\s*;?/gmu, 'export {}')
  return splitImports(stripTypes(normalized, file), file)
}

// ── 模块图 ──────────────────────────────────────────────────────────────────

/** 把相对说明符解析到实际源码文件（`.js` 说明符可能对应 `.ts`/`.tsx`）。 */
function resolveModule(specifier, fromFile) {
  if (!specifier.startsWith('.')) return null
  const base = resolve(dirname(fromFile), specifier)
  const candidates = [
    base.replace(/\.js$/u, '.ts'),
    base.replace(/\.js$/u, '.tsx'),
    `${base}.ts`,
    `${base}.tsx`,
    base,
  ]
  for (const candidate of candidates) {
    try {
      readFileSync(candidate)
      return candidate
    } catch { /* 试下一个 */ }
  }
  throw new Error(`build-client: 无法解析 ${specifier}（来自 ${fromFile}）`)
}

/** 深度优先地按依赖顺序收集模块。 */
function collect(entry) {
  const order = []
  const seen = new Set()
  const visit = (file) => {
    if (seen.has(file)) return
    seen.add(file)
    const { imports, body } = processModule(file)
    // 导入表要**完整**留在行上：平台种子模块（`react` 等）虽然没有本地文件可递归，
    // 但它的具名绑定必须进入该模块的命名空间，否则消费方拿到的是 undefined。
    // `file` 只在本地依赖上有值，拼接时据此区分两者。
    const deps = []
    for (const entryImport of imports) {
      const resolved = resolveModule(entryImport.specifier, file)
      deps.push({ ...entryImport, file: resolved ?? null })
      if (resolved !== null) visit(resolved)
    }
    order.push({ file, body: stripExportKeyword(body), imports: deps, id: `M${String(order.length + 1)}` })
  }
  visit(entry)
  return order
}

// ── 生成 ────────────────────────────────────────────────────────────────────

/**
 * 入口模块必须暴露给插件系统的两个契约导出。
 *
 * 只转发这两个：客户端插件模型只读 `apply` 与 `inject`，其余的具名解构与常量都是
 * 包内部实现，暴露出去只会让产物看起来像有别的入口。
 */
const ENTRY_EXPORTS = new Set(['apply', 'inject'])

/** 拼出 lazy-CJS 插件产物。 */
function emit(modules) {
  const idOf = new Map(modules.map(row => [row.file, row.id]))

  // 每个模块一个 IIFE，它自成作用域，因此各模块的局部名（包括解构出来的同名导入）
  // 互不冲突；IIFE 返回自己的导出面，成为该模块的命名空间对象。
  const chunks = modules.map((row) => {
    const lines = [`    // ── ${row.file.replace(`${root}\\`, '').replaceAll('\\', '/')} ──`]
    lines.push(`    const ${row.id} = (() => {`)
    for (const entryImport of row.imports) {
      if (entryImport.names.length === 0) continue
      const target = idOf.get(entryImport.file)
      // 只有本地模块才有命名空间对象可解构；平台种子模块的绑定由工厂顶部的
      // `require` 提供，这里不能再写一行（否则会覆盖真实的 React 模块对象）。
      if (target === undefined) continue
      const bindings = entryImport.names
        .map(({ imported, local }) => (imported === local ? imported : `${imported}: ${local}`))
        .join(', ')
      lines.push(`      const { ${bindings} } = ${target}`)
    }
    // Node 的 stripTypeScriptTypes 会以空格替代被删掉的类型；逐行去尾空格，
    // 避免占位空格污染提交的客户端构建产物。
    lines.push(row.body.trimEnd().split('\n').map(line => {
      const content = line.trimEnd()
      return content === '' ? '' : `    ${content}`
    }).join('\n'))
    const exported = moduleFaces(row.body, row.imports)
      .map(name => `        ${name},`)
      .join('\n')
    lines.push('      return {')
    lines.push(exported)
    lines.push('      }')
    lines.push('    })()')
    lines.push('')
    return lines.join('\n')
  }).join('\n')

  const entryRow = modules[modules.length - 1]
  const forwarded = declaredNames(entryRow.body)
    // 入口模块的导出面只有插件契约本身；内部的具名解构不必转发。
    .filter(name => ENTRY_EXPORTS.has(name))
    .map(name => `    exports.${name} = ${entryRow.id}.${name}`)
    .join('\n')

  return `//! 自动生成，请勿直接编辑 —— 由 scripts/build-client.mjs 从 src/client/*.ts 生成。
//!
//! 本文件是 DSH 的 lazy-CJS 客户端插件格式：执行它只会**注册**工厂，什么都不会
//! 运行；真正的模块体（含样式注入）在模块系统实体化插件时才执行。
//! 包装、\`id\` 与 \`apply\`/\`inject\` 导出就是全部契约。
//!
//! 只允许 require 平台种子说明符：\`react\`、\`react/jsx-runtime\`、\`react-dom\`、
//! \`react-dom/client\`、\`@deepseek-ai/cordis\`、\`@deepseek-ai/dsh-client-store\`、
//! \`@deepseek-ai/dsh-client-ui-slots\`、\`@deepseek-ai/dsh-client-ui-primitives\`、
//! \`@deepseek-ai/dsh-client-ui-dockkit\`。其余一切都已内联在本文件里。
window.__ModuleLoader__.load({
  id: ${JSON.stringify(pkg.name)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const react = require("react");
    const h = react.createElement;
    // React 的具名导出也属于平台种子：各模块会从 react 具名导入 useState 等，
    // 因此这里在工厂作用域里绑定一次，模块内的具名解构才有东西可解构。
    const { useEffect, useLayoutEffect, useMemo, useReducer, useCallback, useRef, useState, useContext, useSyncExternalStore, Fragment, memo, forwardRef, createContext, createElement, cloneElement, Children } = react;

${chunks}
    // ── 入口模块的具名导出（插件系统读取 apply / inject） ─────────────────
${forwarded}

    return module.exports;
  },
});
`
}

// ── 构建入口 ────────────────────────────────────────────────────────────────

// 只有在被当作脚本直接执行时才构建，这样测试可以 import 上面的纯函数。
const isDirectRun = process.argv[1] !== undefined
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

export { stripTypes, splitImports, stripExportKeyword, collect, emit, moduleFaces, declaredNames }

if (isDirectRun) {
  const modules = collect(clientEntry)

  // 逐个模块过一遍语法检查：任何拼接或转写错误都会在构建期暴露，而不是等到浏览器
  // 里才炸。导入的具名绑定先用空对象占位，校验只关心语法。
  const checkDir = join(root, '.build-client-check')
  mkdirSync(checkDir, { recursive: true })
  let failures = 0
  for (const row of modules) {
    const probe = join(checkDir, `module-${row.id}.mjs`)
    const bindings = row.imports
      .filter(entryImport => entryImport.names.length > 0)
      .map(entryImport => `const { ${entryImport.names.map(entry => entry.local).join(', ')} } = {};`)
      .join('\n')
    writeFileSync(probe, `${bindings}\n${row.body}\nexport {}\n`, 'utf8')
    const result = spawnSync(process.execPath, ['--check', probe], { encoding: 'utf8' })
    if (result.status !== 0) {
      failures++
      process.stderr.write(`build-client: 语法校验失败 ${row.file}\n${result.stderr}\n`)
    }
  }

  if (failures > 0) {
    process.stderr.write(`build-client: ${String(failures)} 个模块未通过语法校验，已终止。\n`)
    process.exitCode = 1
  } else {
    const output = emit(modules)
    // 整个产物再校验一次：包装、模块命名空间与导出转发都属于拼接层，只有把完整
    // 文件交给解析器才能覆盖。模块体里对 DOM/React 的引用不会被执行，因此只做语法
    // 检查，不实际运行。
    const bundleProbe = join(checkDir, 'bundle-check.cjs')
    writeFileSync(bundleProbe, output, 'utf8')
    const bundleCheck = spawnSync(process.execPath, ['--check', bundleProbe], { encoding: 'utf8' })
    if (bundleCheck.status !== 0) {
      process.stderr.write(`build-client: 产物语法校验失败\n${bundleCheck.stderr}\n`)
      process.exitCode = 1
    } else {
      mkdirSync(dirname(outputFile), { recursive: true })
      writeFileSync(outputFile, output, 'utf8')
      process.stdout.write(`build-client: ${String(modules.length)} 个模块 → ${outputFile}\n`)
    }
  }
}
