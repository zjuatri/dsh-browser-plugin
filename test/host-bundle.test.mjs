/**
 * 宿主半边产物的测试。
 *
 * 这里守住一个只在真实部署里才暴露、现象又极其误导的接线错误：视图路由必须等
 * `webServer` 服务就绪再注册。如果 `apply` 里直接用 `ctx.get('webServer')` 探一下，
 * 而插件恰好排在 Web 服务器之前被应用，探到的是 `undefined` —— 于是工具一切正常、
 * 视图路由整批缺失，侧边栏里标签页能打开但画面永远空白，没有任何报错。
 *
 * 用法：node --no-warnings test/host-bundle.test.mjs
 */

import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bundlePath = join(root, 'lib/index.js')
const bundle = readFileSync(bundlePath, 'utf8')

// ── 契约导出 ────────────────────────────────────────────────────────────────

const load = await import(`${pathToFileURL(bundlePath).href}?t=${String(Date.now())}`)
for (const key of ['name', 'inject', 'apply', 'Config']) {
  assert.ok(load[key] !== undefined, `宿主产物必须导出 ${key}`)
}
assert.equal(load.name, 'dsh-browser-plugin')
assert.deepEqual(load.inject, ['tools', 'skills'], '插件只硬依赖工具与技能两个服务')

// ── 延迟注册：视图路由必须等 webServer ──────────────────────────────────────

assert.ok(
  bundle.includes("ctx.inject(['webServer']"),
  'apply 必须用 ctx.inject([\'webServer\'], …) 延迟注册视图路由：'
  + '直接用 ctx.get(\'webServer\') 探一下会在插件早于 Web 服务器应用时静默丢掉整批路由',
)

// ── 视图路由齐全 ────────────────────────────────────────────────────────────

// 会驱动浏览器的路由都从串联队列走，因此注册形态是 post()/action()。
for (const path of ['/input', '/goto', '/tab-open', '/tab-switch', '/tab-close', '/mode', '/back', '/forward', '/reload']) {
  assert.ok(
    bundle.includes(`post('${path}'`) || bundle.includes(`action('${path}'`),
    `宿主产物缺少视图路由 ${path}`,
  )
}
assert.ok(bundle.includes('${PANE_BASE}/stream'), '宿主产物缺少画面流路由')
// /viewport 刻意**不**在 HTTP 边界排队：它只登记目标尺寸，真正的变更在防抖之后由
// 流控制器入队。因此它直接 webServer.register，而不是 post()。
assert.ok(bundle.includes('${PANE_BASE}/viewport'), '宿主产物缺少视口路由')
// /quality 同理不排队：它本身不驱动浏览器，真正的变更（改倍率 + 重启画面流）由每个会话
// 自己的流控制器入队。档位是全局偏好，因此这条路由还要能遍历所有已挂视图的会话。
assert.ok(bundle.includes('${PANE_BASE}/quality'), '宿主产物缺少画质路由')
assert.ok(bundle.includes('setQuality'), '画质路由必须把新档位推给已有的视图')
// 「右键 → 该页面的开发者工具」：视图上的菜单项是个链接，因此这条路由必须让浏览器自己跟
// 下去（302 到 Chrome 给出的 DevTools 前端地址）；回 JSON 会在新标签页里显示一坨原始文本。
assert.ok(bundle.includes('${PANE_BASE}/devtools'), '宿主产物缺少开发者工具路由')
assert.ok(bundle.includes('302'), '开发者工具路由必须用 302 把浏览器带到前端地址')

// ── 调试端口：两条启动路径都必须放行 DevTools 前端的 origin ─────────────────
// 实测：不带 --remote-allow-origins 时，带 Origin 的 WebSocket 升级会被 Chrome 403，
// 于是那个新标签页里的 DevTools 永远连不上。启动参数只写一处常量、两处引用。
{
  assert.ok(
    bundle.includes('`--remote-allow-origins=${DEVTOOLS_ALLOWED_ORIGIN}`'),
    '放行的 origin 必须由常量拼出（而不是写死或通配）',
  )
  const uses = [...bundle.matchAll(/DEVTOOLS_ORIGIN_ARG/gu)].length
  assert.ok(uses >= 3, `两条启动路径都要用上该参数（1 处定义 + 2 处使用），实际 ${String(uses)} 处`)
  assert.equal(
    load.DEVTOOLS_ALLOWED_ORIGIN,
    'https://chrome-devtools-frontend.appspot.com',
    '白名单就是 Chrome 自己给出的 DevTools 前端 origin',
  )
}

// ── 按会话分发：工具与视图都必须落到会话自己的浏览器上 ──────────────────────

assert.ok(bundle.includes('class BrowserQueue'), '宿主产物必须带串行队列')
assert.ok(bundle.includes('function gateTool'), '宿主产物必须带工具闸门')
assert.ok(bundle.includes('class BrowserSessions'), '宿主产物必须带按会话的浏览器注册表')
// 每个工具都要经过闸门：注册点只能有一处 ctx.tools.register 调用。
const registerCalls = [...bundle.matchAll(/ctx\.tools\.register\(/gu)].length
assert.equal(registerCalls, 1, `工具注册点应集中在闸门助手里，实际发现 ${String(registerCalls)} 处`)
assert.ok(bundle.includes('gateTool(definition, gateway)'), '注册点必须套上闸门')
// 工具侧按会话取运行时：闭包捕获一只共享 Chrome 的写法会让所有会话又回到共用。
assert.ok(bundle.includes('gateway.runtimeFor(exec.agent?.id ?? null)'), '工具必须按会话取运行时')
// 视图侧按会话分发：请求上的 ?session= 决定落到哪只浏览器。
assert.ok(bundle.includes("SESSION_PARAM = 'session'"), '视图路由必须按 session 查询参数分发')
assert.ok(bundle.includes('sessions.forSession(sessionOf(req))'), '视图请求必须解析出会话再取浏览器')
// 同一个会话里「工具调用」与「视图操作」必须共用一把锁，因此视图也走 entry.queue。
assert.ok(bundle.includes('entry.queue.run('), '视图操作必须走该会话的队列')
assert.ok(
  bundle.includes("ctx.inject(['webServer']"),
  'apply 必须用 ctx.inject([\'webServer\'], …) 延迟注册视图路由：'
  + '直接用 ctx.get(\'webServer\') 探一下会在插件早于 Web 服务器应用时静默丢掉整批路由',
)

// ── 模式取值与运行时严格一致 ────────────────────────────────────────────────

// 早期这里漏过 `'connect'`，导致视图上的按钮被边界 schema 拒掉；反过来的错误更危险 ——
// 声明一档运行时没有的模式，会让越界请求通过校验、换掉一个正在工作的浏览器。这里只
// 断言两值都存在，且**没有**第三值。
assert.match(bundle, /z\.const\('own'\s*\)/u, '模式 schema 必须接受 own')
assert.match(bundle, /z\.const\('stealth'\s*\)/u, '模式 schema 必须接受 stealth')
assert.doesNotMatch(bundle, /z\.const\('connect'\s*\)/u, "运行时没有 connect 模式，schema 不得声明它")
// PaneState 是纯类型、不进产物，因此断言它的**行为**：驱动者变化要广播出去。
assert.match(bundle, /noteDriver\(/u, 'PaneStream 必须能广播当前驱动者')
assert.match(bundle, /driver:/u, '广播的状态里必须带 driver')

// ── 视口尺寸在运行时被夹紧 ──────────────────────────────────────────────────

assert.ok(bundle.includes('MIN_VIEWPORT_WIDTH'), '视口宽度必须有下限常量')
assert.ok(bundle.includes('MAX_VIEWPORT_SIDE'), '视口边长必须有上限常量')

// ── 新增配置项 ──────────────────────────────────────────────────────────────

assert.ok(load.Config({}).allowSubagents === false, 'allowSubagents 默认必须是 false')
assert.ok(
  typeof load.Config({}).queueTimeoutMs === 'number' && load.Config({}).queueTimeoutMs > 0,
  'queueTimeoutMs 必须有正数默认值',
)
assert.equal(load.Config({}).isolation, 'session', '默认必须按会话隔离')
assert.ok(load.Config({}).maxBrowsers > 0, 'maxBrowsers 必须有正数默认值')
assert.ok(load.Config({}).idleTimeoutMs > 0, 'idleTimeoutMs 必须有正数默认值')

// ── 语法可加载 ──────────────────────────────────────────────────────────────

const check = spawnSync(process.execPath, ['--check', bundlePath], { encoding: 'utf8' })
assert.equal(check.status, 0, `宿主产物语法错误：\n${check.stderr}`)

process.stdout.write('host-bundle: 全部通过\n')
