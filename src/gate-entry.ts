/**
 * DSH 侧的浏览器闸门（按工具名拦截，见 `dsh-gate.ts` 的说明）。
 *
 * 这是一个**独立挂载**的插件：它不改 `dsh-browser-plugin` 的宿主半边，只订阅
 * `tools/pre-execute`。这样即使将来 `browser_*` 这个名字由别处提供/执行，子智能体策略与
 * 同会话串行也不会被绕开。
 *
 * 挂载方式（profile 补丁插一行 `file://` 即可）：
 *
 * ```yaml
 * - insert:
 *     - id: dsh-browser-gate
 *       name: "file:///D:/desktop/repos/dsh-browser-plugin/lib/gate.js"
 * ```
 *
 * @module dsh-browser-plugin/src/gate-entry
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { BrowserGateCore, ownershipFrom } from './dsh-gate.js'

/** cordis 插件名。 */
export const name = 'dsh-browser-gate'

/**
 * 本插件依赖的服务。
 *
 * `agents` 是**必需**的，不是可选：子智能体判定全靠它。取不到就挡不住子 agent，而
 * 「看起来装了、其实没挡住」比不装更危险。因此让它成为硬依赖 —— 服务缺失时插件保持
 * 待命，而不是静默降级。
 */
export const inject = ['agents']

/** 默认不允许子智能体驱动浏览器。 */
export const DEFAULT_ALLOW_SUBAGENTS = false

/** schemastery 配置；cordis 会在 `apply` 之前套用它。 */
export const Config = z.object({
  allowSubagents: z.boolean().default(DEFAULT_ALLOW_SUBAGENTS),
})

// 测试接缝：闸门内核与判定函数一并导出。测试跑在**构建产物**上（`lib/gate.js`），因为
// 源码里的 `./x.js` 说明符在 Node 下解析不到同名 `.ts`；而这两件东西正是「串行」与
// 「挡子智能体」两条保证的载体，必须在产物上可验证。
export { BrowserGateCore, ownershipFrom } from './dsh-gate.js'

/** 已解析的配置。 */
interface Resolved {
  allowSubagents: boolean
}

/**
 * 套用插件：把闸门接到 `tools/pre-execute` 瀑布上。
 *
 * 只订阅、不注册工具：工具仍由各自提供方注册，这里只拦调用。
 *
 * @param ctx - 宿主 context（`agents` 已就绪）。
 * @param config - 已解析配置。
 */
export function apply(ctx: Context, config: Resolved): void {
  const core = new BrowserGateCore(
    { allowSubagents: config.allowSubagents === true },
    ownershipFrom(ctx.get('agents')),
  )

  ctx.on('tools/pre-execute', async (exec, next) => {
    if (!core.handles(exec.name)) return next()
    return core.intercept(exec, () => next())
  })
}
