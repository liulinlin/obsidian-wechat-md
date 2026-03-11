import juice from 'juice'

/**
 * 将 HTML + CSS 转换为内联样式的 HTML，适合粘贴到微信编辑器
 */
export function inlineCSS(html: string, css: string): string {
  const fullHtml = `<style>${css}</style><div id="output">${html}</div>`
  return juice(fullHtml, {
    removeStyleTags: true,
    preserveImportant: true,
  })
}

/**
 * 复制富文本 HTML 到剪贴板
 * 优先使用 Clipboard API，移动端不支持时降级到 execCommand
 */
export async function copyToClipboard(html: string): Promise<void> {
  // 优先使用现代 Clipboard API（桌面端 Electron 支持）
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      const blob = new Blob([html], { type: 'text/html' })
      const item = new ClipboardItem({ 'text/html': blob })
      await navigator.clipboard.write([item])
      return
    }
    catch {
      // Clipboard API 失败，降级到 execCommand
    }
  }

  // 降级方案：使用 execCommand('copy')（兼容移动端 WebView）
  const container = document.createElement('div')
  container.innerHTML = html
  container.style.position = 'fixed'
  container.style.left = '-9999px'
  container.style.opacity = '0'
  document.body.appendChild(container)

  const range = document.createRange()
  range.selectNodeContents(container)
  const selection = window.getSelection()
  if (selection) {
    selection.removeAllRanges()
    selection.addRange(range)
  }

  try {
    document.execCommand('copy')
  }
  finally {
    selection?.removeAllRanges()
    document.body.removeChild(container)
  }
}
