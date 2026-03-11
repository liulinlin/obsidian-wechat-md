import type { App, TFile } from 'obsidian'
import type { PluginSettings } from '../types'
import { resolveFile } from '../utils/resolve-file'

/**
 * Obsidian 语法预处理器
 * 将 Obsidian 特有语法转换为标准 Markdown
 */
export class ObsidianSyntaxPreprocessor {
  constructor(
    private app: App,
    private currentFile: TFile,
    private settings: PluginSettings,
  ) {}

  async process(markdown: string): Promise<string> {
    // 1. 移除注释 %%...%%
    markdown = markdown.replace(/%%.*?%%/gs, '')

    // 2. 处理嵌入（必须在 Wiki 链接之前，否则 ![[...]] 中的 [[...]] 会被 resolveWikiLinks 吞掉）
    markdown = await this.resolveEmbeds(markdown)

    // 3. 处理 Wiki 链接（同步）
    markdown = this.resolveWikiLinks(markdown)

    // 4. 处理标准 Markdown 本地图片 ![alt](local-path) → base64
    markdown = await this.resolveMarkdownImages(markdown)

    // 5. 处理标签（可选）
    if (this.settings.removeTags) {
      markdown = markdown.replace(/(^|\s)#[\w\u4E00-\u9FFF-]+/g, '$1')
    }

    return markdown
  }

  /**
   * 解析 Wiki 链接 [[target|alias]] → [alias](path)
   */
  private resolveWikiLinks(markdown: string): string {
    const linkRegex = /\[\[([^\]|]+)(\|([^\]]+))?\]\]/g

    return markdown.replace(linkRegex, (_match, target, _pipe, alias) => {
      const file = resolveFile(this.app, target, this.currentFile)

      if (!file)
        return alias || target

      const displayText = alias || target
      return `[${displayText}](${this.getRelativePath(file)})`
    })
  }

  /**
   * 解析嵌入 ![[target]] → 展开内容或图片
   */
  private async resolveEmbeds(markdown: string): Promise<string> {
    const embedRegex = /!\[\[([^\]]+)\]\]/g
    const matches = [...markdown.matchAll(embedRegex)]

    // 从后往前替换，避免 offset 偏移
    for (const match of matches.reverse()) {
      const target = match[1]
      const file = resolveFile(this.app, target.split('#')[0], this.currentFile)

      if (!file || match.index === undefined)
        continue

      let replacement = ''

      if (this.isImageFile(file)) {
        // 图片：转为 base64
        const base64 = await this.fileToBase64(file)
        replacement = `![${file.basename}](${base64})`
      }
      else if (file.extension === 'md') {
        // 笔记：展开内容（限制深度 1 级）
        const content = await this.app.vault.read(file)
        replacement = content
      }
      else {
        // 其他类型：转为文本链接
        replacement = `[${file.name}](${this.getRelativePath(file)})`
      }

      markdown = markdown.slice(0, match.index)
        + replacement
        + markdown.slice(match.index + match[0].length)
    }

    return markdown
  }

  /**
   * 解析标准 Markdown 图片 ![alt](local-path) → base64 data URI
   */
  private async resolveMarkdownImages(markdown: string): Promise<string> {
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g
    const matches = [...markdown.matchAll(imageRegex)]

    // 从后往前替换，避免 offset 偏移
    for (const match of matches.reverse()) {
      const [, alt, src] = match

      // 跳过远程 URL 和 data URI
      if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:'))
        continue

      if (match.index === undefined)
        continue

      const file = resolveFile(this.app, decodeURIComponent(src), this.currentFile)
      if (!file || !this.isImageFile(file))
        continue

      // 转换为 base64
      const base64 = await this.fileToBase64(file)
      const replacement = `![${alt}](${base64})`
      markdown = markdown.slice(0, match.index)
        + replacement
        + markdown.slice(match.index + match[0].length)
    }

    return markdown
  }

  private isImageFile(file: TFile): boolean {
    return /^(?:png|jpg|jpeg|gif|svg|webp|bmp)$/i.test(file.extension)
  }

  private getRelativePath(file: TFile): string {
    return file.path
  }

  private async fileToBase64(file: TFile): Promise<string> {
    const buffer = await this.app.vault.readBinary(file)
    const base64 = this.arrayBufferToBase64(buffer)
    const mimeType = this.getMimeType(file.extension)
    return `data:${mimeType};base64,${base64}`
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  private getMimeType(extension: string): string {
    const mimeTypes: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      svg: 'image/svg+xml',
      webp: 'image/webp',
      bmp: 'image/bmp',
    }
    return mimeTypes[extension.toLowerCase()] || 'image/png'
  }
}
