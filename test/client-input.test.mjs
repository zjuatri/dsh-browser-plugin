/**
 * 指针坐标换算的测试。
 *
 * `toDevice()` 是画面（一张 `<img>`）与真实页面之间唯一的语义层，而它踩在一个**巧合**
 * 上很久了：低画质档的抓帧倍率是 1，于是「帧的设备像素数」恰好等于「页面的 CSS 视口」，
 * 拿帧宽当分母看着完全正确。高清档把倍率提到 2 之后，这个巧合没了 —— 同样的写法会让
 * 每一次点击都落到两倍远的位置（甚至掉出视口右侧/下方）。
 *
 * 因此这里把「分母必须是 CSS 视口，而不是帧宽」钉住，并且覆盖三种输入：正常档、高清档，
 * 以及旧宿主（客户端已刷新、宿主还没重启，帧里没有 cssWidth）。
 *
 * 用法：node --no-warnings test/client-input.test.mjs
 */

import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripTypes } from '../scripts/build-client.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// 源码是 TS，且只从 state.js 做**类型**导入（会被剥掉），所以剥完就是一个能直接当模块
// 执行的纯 JS —— 用 data: URL 导入，不必落临时文件。
const source = readFileSync(join(root, 'src/client/input.ts'), 'utf8')
const stripped = stripTypes(source, 'input.ts')
assert.ok(!/^\s*import\s/mu.test(stripped), '类型剥离后不应残留任何 import 语句')
const { toDevice } = await import(`data:text/javascript,${encodeURIComponent(stripped)}`)

/** 一个 567×642 CSS 像素的画面元素，放在视口的 (100, 50) 处。 */
const rect = { left: 100, top: 50, width: 567, height: 642 }

/** 画面中心在视口里的坐标（点击它应该得到页面的中心）。 */
const centreX = rect.left + rect.width / 2
const centreY = rect.top + rect.height / 2

/** 浮点噪声下的比较：坐标只要到像素就够，断言里四舍五入。 */
const round = (point) => (point === null ? null : { x: Math.round(point.x), y: Math.round(point.y) })

// ── 低画质档：帧宽 == CSS 宽，换算就是 1:1 ─────────────────────────────────

const perfFrame = { width: 567, height: 642, cssWidth: 567, cssHeight: 642, data: '', url: '' }
assert.deepEqual(
  toDevice(rect, perfFrame, centreX, centreY),
  { x: 283.5, y: 321 },
  '低画质档：画面中心应换算成页面中心',
)
assert.deepEqual(toDevice(rect, perfFrame, rect.left, rect.top), { x: 0, y: 0 }, '左上角应是 (0,0)')
assert.deepEqual(
  toDevice(rect, perfFrame, rect.left + rect.width, rect.top + rect.height),
  { x: 567, y: 642 },
  '右下角应是 CSS 视口的右下角',
)

// ── 高清档：帧是 CSS 的两倍，但坐标空间仍然是 CSS ──────────────────────────

const hdFrame = { width: 1134, height: 1284, cssWidth: 567, cssHeight: 642, data: '', url: '' }
assert.deepEqual(
  toDevice(rect, hdFrame, centreX, centreY),
  { x: 283.5, y: 321 },
  '高清档：同一个点击必须得到同一个页面坐标（拿帧宽当分母会得到 567/642，落点翻倍）',
)
assert.deepEqual(
  toDevice(rect, hdFrame, rect.left + rect.width, rect.top + rect.height),
  { x: 567, y: 642 },
  '高清档：右下角仍然对应 CSS 视口的右下角，而不是 1134×1284',
)

// ── 旧宿主：帧里没有 cssWidth（客户端刷新了、宿主还没重启）时退回帧宽 ──────

const legacyFrame = { width: 567, height: 642, data: '', url: '' }
assert.deepEqual(
  toDevice(rect, legacyFrame, centreX, centreY),
  { x: 283.5, y: 321 },
  '缺 cssWidth 时退回帧宽：那时倍率必然是 1，两者相等，换算结果不变',
)

// ── 退化输入 ────────────────────────────────────────────────────────────────

assert.equal(
  toDevice({ left: 0, top: 0, width: 0, height: 100 }, perfFrame, 10, 10),
  null,
  '包围盒退化（宽为 0）时返回 null，而不是除出 Infinity',
)

// ── contain 留边：画面没铺满元素框时，必须按画出来的那一块换算 ──────────────

// 实测到的真实形态：面板只有 408×56，而页面 CSS 视口被下限抬到 408×408 ——
// `object-fit: contain` 会把画面缩成中间 56×56 的一小块，四周全是留白。
{
  const box = { left: 1000, top: 200, width: 408, height: 56 }
  const framed = { width: 408, height: 408, cssWidth: 408, cssHeight: 408, data: '', url: '' }
  const paintedLeft = box.left + 176 // 左右各留 (408-56)/2
  const middleY = box.top + 28

  assert.deepEqual(
    round(toDevice(box, framed, paintedLeft + 28, middleY)),
    { x: 204, y: 204 },
    '画面中心必须映射到页面中心',
  )
  assert.deepEqual(
    round(toDevice(box, framed, paintedLeft, box.top)),
    { x: 0, y: 0 },
    '画面的左上角必须映射到页面左上角（而不是元素框的左上角）',
  )
  assert.equal(
    toDevice(box, framed, box.left + 10, middleY),
    null,
    '左侧留白里的点击不属于页面，必须丢掉：旧算法会把它算成页面 x≈10，于是点哪儿都错',
  )
}

// 纵向留白：元素框比画面「胖」时，上下也会留边。
{
  const box = { left: 0, top: 0, width: 400, height: 400 }
  const framed = { width: 800, height: 200, cssWidth: 800, cssHeight: 200, data: '', url: '' }
  // fit = min(400/800, 400/200) = 0.5 → 画面 400×100，上下各留 150。
  assert.deepEqual(round(toDevice(box, framed, 200, 200)), { x: 400, y: 100 }, '画面中心 → 页面中心')
  assert.equal(toDevice(box, framed, 200, 50), null, '上方留白里的点击必须丢掉')
  assert.equal(toDevice(box, framed, 200, 360), null, '下方留白里的点击必须丢掉')
}

// 高清档与留边同时存在时，两个修正要叠加生效。
{
  const box = { left: 0, top: 0, width: 600, height: 300 }
  const framed = { width: 1134, height: 1284, cssWidth: 567, cssHeight: 642, data: '', url: '' }
  // 按高度贴合：fit = 300/642 → 画面 265×300，左右各留 (600-265)/2 = 167.5。
  const point = toDevice(box, framed, 300, 150)
  assert.ok(point !== null, '画面内部的点击不该被丢掉')
  // 横向：画面左边缘在 167.52，宽 264.95 → (300-167.52)/264.95*567 = 283.5
  assert.ok(Math.abs(point.x - 283.5) < 0.5, `横向应落在页面 x≈283.5，实际 ${point.x}`)
  assert.equal(Math.round(point.y), 321, '纵向：页面 CSS 高度的一半')
}

process.stdout.write('client-input: 全部通过\n')
