/**
 * 测试入口：顺序跑完所有测试文件。
 *
 * 每个测试文件都是独立的 ESM 脚本，失败即非零退出；这里把它们串起来，方便
 * `npm test` 一次跑完。
 *
 * 用法：node test/run.mjs
 */

import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const files = readdirSync(here)
  .filter(name => name.endsWith('.test.mjs'))
  .sort()

let failed = 0
for (const file of files) {
  const path = resolve(join(here, file))
  process.stdout.write(`\n── ${file} ──\n`)
  const result = spawnSync(process.execPath, [path], { stdio: 'inherit' })
  if (result.status !== 0) failed++
}

process.stdout.write(`\n${String(files.length - failed)}/${String(files.length)} 个测试文件通过\n`)
if (failed > 0) process.exitCode = 1
