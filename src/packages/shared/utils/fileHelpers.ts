/**
 * 通用文件下载函数
 * @param content - 文件内容
 * @param filename - 文件名
 * @param mimeType - MIME 类型，默认为 text/plain
 */
export function downloadFile(content: string, filename: string, mimeType: string = `text/plain`) {
  if (typeof document === `undefined`) {
    throw new TypeError(`downloadFile can only be used in browser environment`)
  }

  const downLink = document.createElement(`a`)
  downLink.download = filename
  downLink.style.display = `none`

  // 检查是否是 base64 data URL
  if (content.startsWith(`data:`)) {
    downLink.href = content
  }
  else if (mimeType === `text/html`) {
    downLink.href = `data:text/html;charset=utf-8,${encodeURIComponent(content)}`
  }
  else {
    const blob = new Blob([content], { type: mimeType })
    downLink.href = URL.createObjectURL(blob)
  }

  document.body.appendChild(downLink)
  downLink.click()
  document.body.removeChild(downLink)

  // 如果是 blob URL，释放内存
  if (!content.startsWith(`data:`) && mimeType !== `text/html`) {
    URL.revokeObjectURL(downLink.href)
  }
}
