/**
 * 实时视图的线上协议：SSE 帧/状态载荷、输入事件形状、各路由的边界 schema，
 * 以及 POST body 读取与 JSON 应答这两个小工具。
 *
 * 把这些放在一处，是为了让路由逻辑只对领域值做分支：每个请求体都在路由边界上由
 * schemastery 校验，路由本身不解析原始 JSON。
 *
 * @module dsh-browser-plugin/src/pane-wire
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import z from '@deepseek-ai/schemastery'
import type { BrowserQuality, GotoResult, TabInfo } from './browser-types.js'

/** 面板输入路由允许的最大 POST body 大小（字节）。 */
export const MAX_BODY_BYTES = 64 * 1024

/** 推送给每个视图客户端的画面帧载荷（JSON 安全）。 */
export interface PaneFrame {
  /** base64 编码的 JPEG 帧（不含 data-URL 前缀；由视图补上）。 */
  data: string
  /** 帧的像素宽度（**设备**像素 = CSS 视口宽 × 抓帧倍率）。 */
  width: number
  /** 帧的像素高度（**设备**像素）。 */
  height: number
  /**
   * 这一帧对应的**页面 CSS 视口**尺寸。
   *
   * 视图必须用它对指针坐标做换算，而不是用 `width`/`height`：CDP 的
   * `Input.dispatchMouseEvent` 收的是 CSS 像素，而高清档下帧宽是 CSS 宽的两倍。低画质
   * 档两者恰好相等，所以这个字段是让「倍率可以不为 1」这件事成立的前提。
   */
  cssWidth: number
  cssHeight: number
  /** 采集时的页面 URL。 */
  url: string
}

/** 推送给视图客户端的浏览器存活状态（JSON 安全）。 */
export interface PaneState {
  active: boolean
  url: string
  error?: string
  /** 智能体当前使用的浏览器种类；两值，与运行时 `BrowserMode` 一致。 */
  mode: 'own' | 'stealth'
  /** 最近取得锁的会话 id；跨会话争用时视图据此显示「谁在驱动浏览器」。 */
  driver?: string
  /** 当前画质档：全局偏好，视图上的开关一按就变，所有已开的窗一起跟着变。 */
  quality: BrowserQuality
}

/** 视图客户端发来的一条输入事件（JSON 安全的线上形状）。 */
export interface PaneInputEvent {
  type: 'mouse-move' | 'mouse-down' | 'mouse-up' | 'wheel' | 'key-down' | 'key-up'
  x: number
  y: number
  button: 'left' | 'right' | 'middle' | 'none'
  deltaX: number
  deltaY: number
  /** WheelEvent.deltaMode：0 = 像素，1 = 行，2 = 页。 */
  deltaMode: number
  key: string
  code: string
  text: string
  /** CDP 修饰键位掩码：alt=1、ctrl=2、meta=4、shift=8。 */
  modifiers: number
}

/** 视图输入路由的边界 schema。 */
export const PaneInputSchema = z.object({
  type: z.union([
    z.const('mouse-move' as const),
    z.const('mouse-down' as const),
    z.const('mouse-up' as const),
    z.const('wheel' as const),
    z.const('key-down' as const),
    z.const('key-up' as const),
  ]),
  x: z.number().default(0),
  y: z.number().default(0),
  button: z.union([
    z.const('left' as const),
    z.const('right' as const),
    z.const('middle' as const),
    z.const('none' as const),
  ]).default('left' as const),
  deltaX: z.number().default(0),
  deltaY: z.number().default(0),
  deltaMode: z.number().default(0),
  key: z.string().default(''),
  code: z.string().default(''),
  text: z.string().default(''),
  modifiers: z.number().default(0),
})

/** 视图导航路由的边界 schema。 */
export const PaneGotoSchema = z.object({
  url: z.string(),
})

/** 视图新建标签页路由的边界 schema。 */
export const PaneTabOpenSchema = z.object({
  url: z.string().default(''),
})

/** 视图切换/关闭标签页路由的边界 schema。 */
export const PaneTabIndexSchema = z.object({
  index: z.number(),
})

/**
 * 浏览器模式切换路由的边界 schema。
 *
 * 两值，必须与运行时 `BrowserMode` 严格一致：多出只声明不实现的一档，会让越界的请求
 * 通过校验、进而换掉一个正在工作的浏览器。
 */
export const PaneModeSchema = z.object({
  mode: z.union([z.const('own' as const), z.const('stealth' as const)]),
})

/**
 * 视图上报面板尺寸的边界 schema。
 *
 * 面板尺寸是视图量出来的连续值，不是用户输入，因此这里只要求它是数字；真正的取值
 * 夹紧放在运行时里（那是所有调用方共享的合法性边界，而不是某一条路由的规矩）。
 */
export const PaneViewportSchema = z.object({
  width: z.number(),
  height: z.number(),
})

/**
 * 画质档切换路由的边界 schema。
 *
 * 与模式不同，这条路由**不是**每会话的：画质是看的人的偏好，改一次所有已开的窗一起变。
 */
export const PaneQualitySchema = z.object({
  quality: z.union([z.const('perf' as const), z.const('hd' as const)]),
})

/**
 * 各画质档对应的抓帧倍率（`deviceScaleFactor`）。
 *
 * 档位到倍率的唯一一处映射。`hd` 取 2 是「每物理像素一个点」在常见 2× 屏上的解；1× 屏
 * 上它退化成超采样（帧比屏幕密，缩小后字更匀），所以两档在任何 dpr 下都有可见差别。
 */
export const QUALITY_SCALE: Record<BrowserQuality, number> = { perf: 1, hd: 2 }

/** 视图路由应答的 JSON body。 */
export type PaneResponse =
  | { ok: true }
  | { ok: false; message: string }
  | { ok: true; result: GotoResult | TabInfo[] | { ok: boolean; url: string; message?: string } }

/** 以硬性大小上限把 POST body 读成原始文本。 */
export function readBody(req: IncomingMessage, limit = MAX_BODY_BYTES): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let finished = false
    const fail = (error: Error): void => {
      if (finished) return
      finished = true
      reject(error)
    }
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) {
        fail(new Error('请求体过大'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (finished) return
      finished = true
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', fail)
  })
}

/** 用一个 JSON body 应答某个请求。 */
export function json(res: ServerResponse, status: number, value: PaneResponse): void {
  if (res.writableEnded) return
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(value))
}

/** 把一条路由处理器的异常统一转成 `{ok:false,message}` 应答。 */
export async function handleJsonRoute(
  res: ServerResponse,
  run: () => Promise<PaneResponse>,
): Promise<void> {
  try {
    json(res, 200, await run())
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    json(res, 400, { ok: false, message })
  }
}
