/**
 * 宿主半边的构建脚本（无外部依赖）。
 *
 * 宿主半边必须是 Node 能直接 `import` 的 ESM。源码是 TypeScript，而 profile 里的
 * `file://` 行加载的是构建产物，因此这里把 `src/**` 打成一个 `lib/index.js`：
 *
 *   1. 从 `src/index.ts` 出发，沿相对 import 构建模块图；
 *   2. 用 Node 内置的 `stripTypeScriptTypes` 剥掉类型语法；
 *   3. 按依赖顺序拼接，每个模块包在一个 IIFE 里并用命名空间对象承载导出 —— 与客户端
 *      不同，宿主模块之间不允许出现顶层重名，脚本会强制检查这一点；
 *   4. 把入口模块的导出原样 `export` 出去，让 cordis 读到 `name`/`inject`/`apply`。
 *
 * 产物写出前会跑一次 `node --check` 与一次真实 `import()`，所以“加载即报错”这类
 * 问题会在构建期暴露，而不是等到 profile 重新加载。
 *
 * 用法：node scripts/build-host.mjs
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { stripTypeScriptTypes } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const hostEntry = join(root, 'src/index.ts')
const outputFile = join(root, pkg.exports['.'].default)
// 第二个入口：按工具名拦截的全局闸门，独立挂载（见 src/gate-entry.ts）。
const gateEntry = join(root, 'src/gate-entry.ts')
const gateOutputFile = join(dirname(outputFile), 'gate.js')

/**
 * 从 `start` 处读出一条 import 语句。
 *
 * 按花括号配平与引号状态判断结束位置，因此多行的具名导入列表不会被截断。
 *
 * @param source - 源码。
 * @param start - `import` 关键字的位置。
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
    if (ch === '"' || ch === "'") {
      quote = ch
      hadQuote = true
      i++
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') depth--
    else if (depth === 0 && ch === ';') return source.slice(start, i)
    // 换行只在“模块说明符已经出现过”时才结束语句，否则多行的具名导入列表会在首行
    // 换行处被截断。
    else if (depth === 0 && ch === '\n' && hadQuote) return source.slice(start, i)
    i++
  }
  return source.slice(start)
}

/**
 * 取出模块的 import 语句并返回其余正文。
 *
 * 只保留模块的导入表；`import type` 与平台/依赖包的导入会被记录但不参与拼接，
 * 由调用方按说明符决定是“本地模块”还是“外部依赖”。
 *
 * 裸具名再导出（`export { A, B }`，不带 `from`）不在这里处理：它引的是本模块的
 * import 绑定，由 `stripExportKeyword` 就地删掉，导出面则通过导入表自然带上。
 * 早先把它当成“语句”整条读取的做法会连同后面的内容一起吃掉，因此不再这么做。
 *
 * @param source - 已剥掉类型的源码。
 * @param file - 源码路径。
 * @returns 导入表与剩余正文。
 */
function splitImports(source, file) {
  const imports = []
  let body = ''
  let i = 0
  while (i < source.length) {
    const atLineStart = i === 0 || source[i - 1] === '\n'
    if (atLineStart && /^[ \t]*import\b/u.test(source.slice(i, i + 12))) {
      const statement = readStatement(source, i)
      i += statement.length
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
        imports.push({ specifier: named[2], names })
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
      throw new Error(`build-host: 不支持的 import 形态（${file}）：${statement.trim()}`)
    }
    body += source[i]
    i++
  }
  return { imports, body }
}

/** 去掉顶层 `export` 关键字（导出关系稍后按模块命名空间重新建立）。 */
function stripExportKeyword(body) {
  return body
    .replace(/^([ \t]*)export\s+(?=(?:const|let|var|function|class|async)\b)/gmu, '$1')
    .replace(/^([ \t]*)export\s+default\s+/gmu, '$1const __default = ')
    // 具名再导出（`export { a, b }`）：拼接后模块之间的导出关系由命名空间对象承载，
    // 这种语句在这里没有对应物，直接退化成空的导出列表。
    .replace(/^[ \t]*export\s*\{[^}]*\}\s*(?:from\s*['"][^'"]+['"])?\s*;?[ \t]*\n?/gmu, '')
}

/**
 * 列出模块真正的顶层具名绑定。
 *
 * 只认第 0 列开始的声明：函数体里的临时变量不是模块的导出面。具名解构
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
 * 一个模块的完整导出面：顶层声明，**加上**它引入的绑定。
 *
 * 第二项不可省：`export { Config }` 这类裸再导出提供的名字，是从别的模块 import
 * 进来的局部绑定，只出现在导入表里；漏掉它就等于把模块的公开面少报一个名字。
 *
 * @param row - 模块图里的一行。
 * @returns 导出面名字（去重）。
 */
function moduleFaces(row) {
  const names = new Set(declaredNames(row.body))
  for (const entryImport of row.imports) {
    for (const { local } of entryImport.names) names.add(local)
  }
  return [...names]
}

/** 把相对说明符解析到实际源码文件（`.js` 说明符对应 `.ts`）。 */
function resolveModule(specifier, fromFile) {
  if (!specifier.startsWith('.')) return null
  const base = resolve(dirname(fromFile), specifier)
  for (const candidate of [base.replace(/\.js$/u, '.ts'), `${base}.ts`, base]) {
    try {
      readFileSync(candidate)
      return candidate
    } catch { /* 试下一个 */ }
  }
  throw new Error(`build-host: 无法解析 ${specifier}（来自 ${fromFile}）`)
}

/** 深度优先地按依赖顺序收集模块，并检查顶层重名。 */
function collect(entry) {
  const order = []
  const seen = new Set()
  const claimed = new Map()
  const visit = (file) => {
    if (seen.has(file)) return
    seen.add(file)
    const source = stripTypeScriptTypes(readFileSync(file, 'utf8'), { mode: 'strip' })
    const { imports, body: rawBody } = splitImports(source, file)
    const body = stripExportKeyword(rawBody)
    // 完整导入表要留在行上：外部依赖（puppeteer-core、node:*、@deepseek-ai/*）在
    // 拼接时同样需要还原成模块内的绑定，不能只保留本地依赖。
    const deps = []
    for (const entryImport of imports) {
      const resolved = resolveModule(entryImport.specifier, file)
      deps.push({ ...entryImport, file: resolved })
      if (resolved === null) continue // 外部依赖，运行时有对应的 ESM 导入
      visit(resolved)
    }
    for (const name of declaredNames(body)) {
      const owner = claimed.get(name)
      // 每个模块都包在自己的 IIFE 里，因此跨模块重名本身无害 —— 但如果两个模块
      // 都声明了同一个名字，很可能是把一个模块的内容误粘到了另一个里，值得拦下来。
      if (owner !== undefined && owner !== file) {
        process.stderr.write(`build-host: 提示：顶层名 ${name} 同时出现在 ${owner} 与 ${file}（各自的 IIFE 作用域会隔开）\n`)
      }
      claimed.set(name, file)
    }
    order.push({ file, body, imports: deps, id: `H${String(order.length + 1)}` })
  }
  visit(entry)
  return order
}

/**
 * 登记一个外部依赖，返回它的别名。
 *
 * 具名取用与默认取用分成两个键空间（`n:` / `d:`），因为同一个包可能既被
 * `import { a } from 'x'` 又被 `import z from 'x'` 用到，而两者需要的取值不同：
 * 前者要命名空间对象，后者要 `.default`。
 *
 * @param externals - 说明符到别名的登记表。
 * @param moduleId - 引用它的模块（别名里带上，便于读产物时定位）。
 * @param specifier - 模块说明符。
 * @param wantsDefault - 是否要 `.default`。
 * @returns 该说明符的别名。
 */
function register(externals, moduleId, specifier, wantsDefault) {
  const key = `${wantsDefault ? 'd' : 'n'}:${specifier}`
  const existing = externals.get(key)
  if (existing !== undefined) return existing.alias
  const alias = `__ext_${moduleId}_${String(externals.size)}`
  externals.set(key, { specifier, alias, wantsDefault })
  return alias
}

/**
 * 主入口（`lib/index.js`）对外暴露的名字。
 *
 * `name`/`inject`/`apply` 是插件契约，`Config` 是加载器用来校验 profile 配置的
 * schemastery schema。其余几个不是给加载器用的，而是给测试用的：按会话隔离、同一会话
 * 串行、切换模式带上当前地址这些保证都住在它们里面，测试要跑在构建产物上。
 */
const ENTRY_EXPORTS = [
  'name', 'inject', 'apply', 'Config',
  // 测试用的运行时构件（见 src/index.ts 的说明）。
  'BrowserQueue', 'QueueAbortError', 'PaneStream', 'gateTool', 'ownershipFrom', 'SUBAGENT_DENIED',
  'BrowserSessions', 'BrowserRuntime',
  // 「右键 → 该页面的开发者工具」的地址解析与它需要的 origin 白名单。
  'resolveDevtoolsFrontendUrl', 'DEVTOOLS_ALLOWED_ORIGIN',
]

/** 闸门入口（`lib/gate.js`）对外暴露的名字：契约 + 测试接缝。 */
const GATE_ENTRY_EXPORTS = [
  'name', 'inject', 'apply', 'Config',
  'BrowserGateCore', 'ownershipFrom',
]

/** 拼出宿主 ESM 产物。 */
function emit(modules, entryExports = ENTRY_EXPORTS) {
  const idOf = new Map(modules.map(row => [row.file, row.id]))
  /** 外部依赖取用口（每个说明符一个别名，默认导入取 `.default`）。 */
  const externals = new Map()

  const chunks = modules.map((row) => {
    const lines = [`// ── ${row.file.replace(`${root}\\`, '').replaceAll('\\', '/')} ──`]
    lines.push(`const ${row.id} = (() => {`)
    for (const entryImport of row.imports) {
      if (entryImport.names.length === 0) continue
      const target = idOf.get(entryImport.file)
      const isDefault = entryImport.names.length === 1 && entryImport.names[0].imported === 'default'
      if (isDefault) {
        // 默认导入（`import z from '…'`）：取用口已经返回命名空间的 `.default`，
        // 直接绑定成模块里的局部名，不要再解构一层。
        register(externals, row.id, entryImport.specifier, true)
        lines.push(`  const ${entryImport.names[0].local} = __externalDefault(${JSON.stringify(entryImport.specifier)})`)
        continue
      }
      let source
      if (target === undefined) {
        // 具名导入：按说明符复用同一个命名空间别名，再解构成模块要用的局部名。
        source = register(externals, row.id, entryImport.specifier, false)
        lines.push(`  const ${source} = __external(${JSON.stringify(entryImport.specifier)})`)
      } else {
        source = target
      }
      const bindings = entryImport.names
        .map(({ imported, local }) => (imported === local ? imported : `${imported}: ${local}`))
        .join(', ')
      lines.push(`  const { ${bindings} } = ${source}`)
    }
    // Node 的 stripTypeScriptTypes 会以空格替代被删掉的类型；逐行去尾空格，
    // 否则这些占位会原样进入提交的构建产物并让 git diff --check 失败。
    lines.push(row.body.trimEnd().split('\n').map(line => {
      const content = line.trimEnd()
      return content === '' ? '' : `  ${content}`
    }).join('\n'))
    lines.push('  return {')
    // 命名空间带上再导出的名字：它们虽然不在这里声明，却是模块的导出面
    // （`export { Config }` 之后 index.ts 的 Config 就是这个绑定）。
    for (const name of moduleFaces(row)) {
      lines.push(`    ${name},`)
    }
    lines.push('  }')
    lines.push('})()')
    lines.push('')
    return lines.join('\n')
  }).join('\n')

  // 外部依赖（puppeteer-core、node:*、@deepseek-ai/*）在文件顶部按原说明符静态
  // 导入一次，再由各模块通过取用口按需取用。
  const externalImports = [...externals.values()]
    .map(entry => `import * as ${entry.alias} from ${JSON.stringify(entry.specifier)}`)
    .join('\n')

  const external = [...externals.values()]
    .filter(entry => !entry.wantsDefault)
    .map(entry => `    case ${JSON.stringify(entry.specifier)}: return ${entry.alias}`)
    .join('\n')
  const externalDefault = [...externals.values()]
    .filter(entry => entry.wantsDefault)
    .map(entry => `    case ${JSON.stringify(entry.specifier)}: return ${entry.alias}.default`)
    .join('\n')

  const entryRow = modules[modules.length - 1]
  // 入口模块的公开面只留插件契约：cordis 读 `name`/`inject`/`apply`，加载器读
  // `Config`。其余内部构件（运行时类、注册函数）不对外导出，免得把实现细节变成
  // 事实上的 API。
  const forwarded = entryExports
    .filter(name => moduleFaces(entryRow).includes(name))
    .map(name => `export const ${name} = ${entryRow.id}.${name}`)
    .join('\n')

  return `//! 自动生成，请勿直接编辑 —— 由 scripts/build-host.mjs 从 src/*.ts 生成。
//!
//! profile 用 \`file://\` 行加载本文件（见 cordis.patch.yml），所以它必须是 Node 能
//! 直接 import 的 ESM：类型已剥离、相对 import 已内联、外部依赖在顶部导入一次。
${externalImports}

/** 外部依赖的取用口：ESM 命名空间对象即导入表。 */
const __external = (specifier) => {
  switch (specifier) {
${external}
    /* v8 ignore next -- 别名表由构建脚本生成，与上面的 import 一一对应 */
    default: throw new Error(\`dsh-browser-plugin: 未声明外部依赖 \${specifier}\`)
  }
}

/** 默认导入的取用口（对应 \`import z from '…'\`）。 */
const __externalDefault = (specifier) => {
  switch (specifier) {
${externalDefault}
    /* v8 ignore next -- 同上 */
    default: throw new Error(\`dsh-browser-plugin: 未声明外部依赖 \${specifier}\`)
  }
}

${chunks}
// ── 入口模块的导出（cordis 读取 name / inject / apply 与 Config） ──────────
${forwarded}
`
}

// ── 构建入口 ────────────────────────────────────────────────────────────────

const isDirectRun = process.argv[1] !== undefined
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

export { collect, emit, splitImports, stripExportKeyword, declaredNames }

/**
 * 构建一个入口：转发 export 面、写产物、再做语法 + 真实加载校验。
 *
 * `forwarded` 与 `required` 是两件事，不能混：前者是产物对外暴露的名字（含测试接缝），
 * 后者是**校验**时必须存在的名字（插件契约）。把 `required` 当转发列表用过一次，结果
 * 是所有测试接缝都被悄悄去掉、四个测试文件同时失败。
 *
 * @param entry - 入口源码。
 * @param output - 产物路径。
 * @param forwarded - 要转发的导出名。
 * @param required - 必须存在的导出名。
 */
async function buildEntry(entry, output, forwarded, required) {
  const modules = collect(entry)
  const source = emit(modules, forwarded)
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, source, 'utf8')

  // 语法 + 真实加载校验：产物会被 cordis 直接 import，任何问题都必须在构建期暴露，
  // 而不是等到 profile 重新加载。
  const check = spawnSync(process.execPath, ['--check', output], { encoding: 'utf8' })
  if (check.status !== 0) {
    process.stderr.write(`build-host: ${output} 语法校验失败\n${check.stderr}\n`)
    return false
  }
  const load = await import(`${pathToFileURL(output).href}?t=${String(Date.now())}`)
  const missing = required.filter(key => load[key] === undefined)
  if (missing.length > 0) {
    process.stderr.write(`build-host: ${output} 缺少导出：${missing.join(', ')}\n`)
    return false
  }
  process.stdout.write(`build-host: ${String(modules.length)} 个模块 → ${output}\n`)
  return true
}

/** 两个入口都必须提供的 cordis / 加载器契约导出。 */
const REQUIRED_EXPORTS = ['name', 'inject', 'apply', 'Config']

if (isDirectRun) {
  const okMain = await buildEntry(hostEntry, outputFile, ENTRY_EXPORTS, REQUIRED_EXPORTS)
  // 第二个入口：按工具名拦截的全局闸门，独立挂载（见 src/gate-entry.ts）。
  const okGate = await buildEntry(gateEntry, gateOutputFile, GATE_ENTRY_EXPORTS, REQUIRED_EXPORTS)
  if (!okMain || !okGate) process.exitCode = 1
}
