/**
 * 页面内容抽取：把一页 DOM 压成模型可读的文本与链接列表。
 *
 * 这些函数都在页面上下文里求值（`Page.evaluate`），因此不能引用本模块的任何
 * Node 侧绑定 —— 它们会被序列化后送进渲染进程。
 *
 * @module dsh-browser-plugin/src/extract
 */

import type { Page } from 'puppeteer-core'

/**
 * 把长页面压成可读文本：前五个标题，加上段落/列表文字，上限 6000 字符。
 */
export function pageToText(handle: Page): Promise<string> {
  return handle.evaluate(() => {
    const parts: string[] = []
    const pick = (sel: string) => {
      try {
        return Array.from(document.querySelectorAll(sel)).slice(0, 5)
      } catch {
        return []
      }
    }
    for (const el of pick('h1, h2, h3')) {
      const t = (el.textContent || '').trim()
      if (t) parts.push(t)
    }
    for (const el of pick('p, li')) {
      const t = (el.textContent || '').trim()
      if (t) parts.push(t)
    }
    return parts.join('\n').slice(0, 6000)
  })
}

/** 抽取最多 25 条锚点链接（文字 + 解析后的 href）。 */
export function pageLinks(handle: Page): Promise<Array<{ text: string; href: string }>> {
  return handle.evaluate(() =>
    Array.from(document.querySelectorAll('a'))
      .map(a => ({ text: (a.textContent || '').trim().slice(0, 120), href: a.href || '' }))
      .filter(l => l.text && l.href)
      .slice(0, 25),
  )
}

/** 读取某个选择器的 innerText（默认整页 body），上限 6000 字符。 */
export function readText(handle: Page, selector?: string): Promise<{ text: string; count: number }> {
  const target = selector && selector.trim() !== '' ? selector : 'body'
  return handle.evaluate((sel) => {
    const nodes = Array.from(document.querySelectorAll(sel))
    const text = nodes
      .map(el => (el instanceof HTMLElement ? el.innerText : el.textContent || ''))
      .join('\n')
      .trim()
      .slice(0, 6000)
    return { text, count: nodes.length }
  }, target)
}
