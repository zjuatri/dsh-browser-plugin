/**
 * 画质档的本机记忆。
 *
 * 为什么记忆在**浏览器**这一侧，而不是宿主：档位是「看的人」的偏好，而宿主进程里的
 * 那份值会随 `dsh web` 重启回到配置默认值。写进本机 `localStorage` 之后，选择就活过了
 * 刷新页面、新开窗口、新开会话，也活过了宿主重启 —— 视图一接入就把记住的档位发回去
 * （见 `browser-tab.tsx`），宿主于是重新认它。
 *
 * 为什么存在 `localStorage` 这种「本机」粒度是对的：它天然是**全局**的（同一个源下的
 * 每一扇窗、每一个会话共享一份），正好对上「选了性能，新开的窗口也还是性能」这条要求；
 * 而它是「每台浏览器」而不是「每个 dsh 进程」的，换一台机器看同一个 GUI 时，那边有那边
 * 的选择，这也说得通。
 *
 * 读写在隐私模式、禁用存储、被 iframe 沙箱拦住时都可能抛异常，因此这里一律吞掉异常并
 * 降级成「这次记得、下次忘了」—— 记忆失效不该让侧边栏打不开。
 *
 * @module dsh-browser-plugin/src/client/quality
 */

import type { BrowserQuality } from './state.js'

/** 存储键。带上包名，免得和 GUI 自己的键撞车。 */
const STORAGE_KEY = 'dsh-browser-plugin.paneQuality'

/** 收到的值是不是一个认识的画质档。 */
function isQuality(value: unknown): value is BrowserQuality {
  return value === 'perf' || value === 'hd'
}

/**
 * 读本机记住的画质档。
 *
 * @returns 记住的档位；从没选过、或存的值不认识时返回 null（调用方退回宿主广播的值）。
 */
export function readStoredQuality(): BrowserQuality | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return isQuality(raw) ? raw : null
  } catch {
    return null
  }
}

/**
 * 记住画质档。
 *
 * @param quality - 要记住的档位。
 */
export function storeQuality(quality: BrowserQuality): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, quality)
  } catch { /* 存不下就算了：本次会话里档位依然生效 */ }
}
