import type { ThemeName } from '../packages/shared/configs'
import type { WorkspaceLeaf } from 'obsidian'
import type WeChatPublisherPlugin from '../main'
import { initRenderer } from '../packages/core/renderer'
import { generateCSSVariables } from '../packages/core/theme'
import { modifyHtmlContent } from '../packages/core/utils'
import { baseCSSContent, themeMap } from '../packages/shared/configs'
import { ItemView, Notice, Platform } from 'obsidian'
import { polishMarkdown } from '../core/ai-polish'
import { copyToClipboard, inlineCSS } from '../core/clipboard'
import { ObsidianSyntaxPreprocessor } from '../core/preprocessor'
import { publishToAll } from '../core/wechat-publisher'
import { ensureMathJax } from '../main'
import { PushAccountModal } from '../modals/push-account-modal'
import { PREVIEW_VIEW_TYPE } from '../types'
import { resolveFile } from '../utils/resolve-file'
/* eslint-disable no-new */
export class PreviewView extends ItemView {
  plugin: WeChatPublisherPlugin
  private previewEl!: HTMLElement
  private pushBtn!: HTMLButtonElement
  private polishBtn!: HTMLButtonElement
  private polishAbortController: AbortController | null = null
  private lastHtml = ''
  private lastCss = ''
  private renderVersion = 0
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private hljsCache = new Map<string, string>()

  constructor(leaf: WorkspaceLeaf, plugin: WeChatPublisherPlugin) {
    super(leaf)
    this.plugin = plugin
  }

  getViewType(): string {
    return PREVIEW_VIEW_TYPE
  }

  getDisplayText(): string {
    return '微信排版预览'
  }

  getIcon(): string {
    return 'file-text'
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1]
    container.empty()
    container.addClass('wechat-publisher-container')

    // 工具栏
    const toolbar = container.createDiv({ cls: 'wechat-publisher-toolbar' })

    const copyBtn = toolbar.createEl('button', { text: '复制' })
    copyBtn.addEventListener('click', () => this.handleCopy())

    if (Platform.isMobile) {
      const copyMdBtn = toolbar.createEl('button', { text: 'MD复制' })
      copyMdBtn.addEventListener('click', () => this.handleCopyMarkdown())
    }

    const refreshBtn = toolbar.createEl('button', { text: '刷新' })
    refreshBtn.addEventListener('click', () => this.updatePreview())

    // 润色按钮（AI 未配置时隐藏）
    this.polishBtn = toolbar.createEl('button', { text: '润色' })
    this.polishBtn.addEventListener('click', () => this.handlePolish())
    this.updatePolishBtnVisibility()

    // 推送按钮（配置不完整时隐藏）
    this.pushBtn = toolbar.createEl('button', { text: '推送' })
    this.pushBtn.addEventListener('click', () => this.handlePush())
    this.updatePushBtnVisibility()

    // 预览区域
    const previewWrapper = container.createDiv({ cls: 'wechat-publisher-preview' })
    this.previewEl = previewWrapper.createDiv({ cls: 'wechat-publisher-preview-inner' })

    // 初始渲染
    await this.updatePreview()

    // 监听编辑器变化
    this.registerEvent(
      this.app.workspace.on('editor-change', () => {
        this.debouncedUpdatePreview()
      }),
    )

    // 监听活动文件切换
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        this.debouncedUpdatePreview()
      }),
    )
  }

  async onClose(): Promise<void> {
    if (this.debounceTimer)
      clearTimeout(this.debounceTimer)
    this.polishAbortController?.abort()
    this.polishAbortController = null
    this.previewEl?.empty()
  }

  private debouncedUpdatePreview(): void {
    if (this.debounceTimer)
      clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      this.updatePreview()
    }, 300)
  }

  async updatePreview(): Promise<void> {
    const version = ++this.renderVersion
    const activeFile = this.app.workspace.getActiveFile()
    if (!activeFile || activeFile.extension !== 'md')
      return

    try {
      const rawMarkdown = await this.app.vault.read(activeFile)

      // 预处理 Obsidian 语法
      const preprocessor = new ObsidianSyntaxPreprocessor(
        this.app,
        activeFile,
        this.plugin.settings,
      )
      const markdown = await preprocessor.process(rawMarkdown)

      // 竞态守卫：如果有更新的渲染请求，丢弃当前结果
      if (version !== this.renderVersion)
        return

      // 确保 MathJax 运行时未被 Obsidian 覆盖
      ensureMathJax()

      // 渲染 HTML
      const renderer = initRenderer({
        citeStatus: this.plugin.settings.citeStatus,
        countStatus: this.plugin.settings.countStatus,
        isMacCodeBlock: this.plugin.settings.isMacCodeBlock,
        isShowLineNumber: this.plugin.settings.isShowLineNumber,
        legend: this.plugin.settings.legend,
      })

      const html = modifyHtmlContent(markdown, renderer)

      // 组装 CSS
      const variables = generateCSSVariables({
        primaryColor: this.plugin.settings.primaryColor,
        fontFamily: this.plugin.settings.fontFamily,
        fontSize: this.plugin.settings.fontSize,
        isUseIndent: this.plugin.settings.isUseIndent,
        isUseJustify: this.plugin.settings.isUseJustify,
      })

      const themeCSS = themeMap[this.plugin.settings.theme as ThemeName]

      // 获取 highlight.js 代码高亮主题 CSS
      const hljsCSS = await this.fetchCodeBlockTheme(this.plugin.settings.codeBlockTheme)

      const css = `${variables}\n${baseCSSContent}\n${themeCSS}\n${hljsCSS}\n${this.plugin.settings.customCSS}`

      // 竞态守卫：渲染完成后再次检查，避免覆盖更新的结果
      if (version !== this.renderVersion)
        return

      this.lastHtml = html
      this.lastCss = css

      // 注入到预览区域
      this.previewEl.empty()

      const styleEl = document.createElement('style')
      styleEl.textContent = css
      this.previewEl.appendChild(styleEl)

      const outputEl = this.previewEl.createDiv({ attr: { id: 'output' } })
      outputEl.innerHTML = html

      // 将本地 vault 路径替换为 Obsidian resource URL 以便预览显示
      this.fixLocalImageSources(outputEl)
    }
    catch (err) {
      console.error('[WeChat Publisher] Render error:', err)
      this.previewEl.empty()
      const errorEl = this.previewEl.createDiv({ cls: 'wechat-publisher-error' })
      errorEl.style.cssText = 'padding:16px;color:#dc2626;font-family:monospace;font-size:13px;white-space:pre-wrap;word-break:break-all;'
      const error = err instanceof Error ? err : new Error(String(err))
      errorEl.textContent = `渲染失败:\n\n${error.message}\n\n${error.stack || ''}`
    }
  }

  /**
   * 将 HTML 中本地 vault 路径的 <img> src 替换为 Obsidian resource URL
   * 仅影响预览显示，不修改 lastHtml（推送时使用原始 vault 路径）
   */
  private fixLocalImageSources(container: HTMLElement): void {
    const activeFile = this.app.workspace.getActiveFile()
    if (!activeFile)
      return

    const imgs = Array.from(container.querySelectorAll('img'))
    for (const img of imgs) {
      const src = img.getAttribute('src')
      if (!src)
        continue
      // 跳过已是远程 URL、data URI 或已处理的 app:// URL
      if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:') || src.startsWith('app://'))
        continue

      try {
        const decodedSrc = decodeURIComponent(src)
        const file = resolveFile(this.app, decodedSrc, activeFile)
        if (file) {
          img.setAttribute('src', this.app.vault.getResourcePath(file))
        }
      }
      catch {
        // 路径解析失败，保持原样
      }
    }
  }

  private async fetchCodeBlockTheme(url: string): Promise<string> {
    if (!url)
      return ''
    const cached = this.hljsCache.get(url)
    if (cached)
      return cached
    try {
      const resp = await fetch(url)
      if (!resp.ok)
        return ''
      const css = await resp.text()
      this.hljsCache.set(url, css)
      return css
    }
    catch {
      return ''
    }
  }

  updatePushBtnVisibility(): void {
    if (!this.pushBtn)
      return
    const { wxProxyUrl, wxAccounts } = this.plugin.settings
    const hasValidAccount = wxAccounts.some(a => a.enabled && a.appId && a.appSecret)
    this.pushBtn.style.display = (wxProxyUrl && hasValidAccount) ? '' : 'none'
  }

  updatePolishBtnVisibility(): void {
    if (!this.polishBtn)
      return
    const { aiEndpoint, aiModel } = this.plugin.settings
    this.polishBtn.style.display = (aiEndpoint && aiModel) ? '' : 'none'
  }

  async handlePolish(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile()
    if (!activeFile || activeFile.extension !== 'md') {
      new Notice('请先打开一个 Markdown 文件', 1500)
      return
    }

    const originalText = this.polishBtn.textContent
    this.polishBtn.textContent = '润色中...'
    this.polishBtn.disabled = true

    try {
      const markdown = await this.app.vault.read(activeFile)
      const result = await polishMarkdown(this.plugin.settings, markdown)
      await this.app.vault.modify(activeFile, result.content)
      new Notice('润色完成', 1500)
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[WeChat Publisher] Polish failed:', err)
      new Notice(`润色失败: ${msg}`, 5000)
    }
    finally {
      this.polishBtn.textContent = originalText
      this.polishBtn.disabled = false
    }
  }

  async handlePush(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile()
    if (!activeFile || activeFile.extension !== 'md') {
      new Notice('请先打开一个 Markdown 文件', 1500)
      return
    }

    if (!this.lastHtml) {
      new Notice('没有可推送的内容，请先刷新预览', 1500)
      return
    }

    const { wxProxyUrl, wxAccounts } = this.plugin.settings
    const enabledAccounts = wxAccounts.filter(a => a.enabled && a.appId && a.appSecret)
    if (!wxProxyUrl || enabledAccounts.length === 0) {
      new Notice('请先在插件设置中配置微信公众号推送参数', 3000)
      return
    }

    // 多个账号时弹窗选择，单个账号直接推送
    let selectedAccounts: typeof enabledAccounts
    if (enabledAccounts.length > 1) {
      const chosen = await new PushAccountModal(this.app, enabledAccounts).openAndGetAccounts()
      if (!chosen || chosen.length === 0)
        return
      selectedAccounts = chosen
    }
    else {
      selectedAccounts = enabledAccounts
    }

    new Notice(`正在推送到 ${selectedAccounts.length} 个公众号...`, 2000)

    try {
      const results = await publishToAll(
        this.app,
        this.plugin.settings,
        this.lastHtml,
        this.lastCss,
        activeFile.basename,
        activeFile,
        selectedAccounts,
      )

      const successCount = results.filter(r => r.success).length
      const failCount = results.length - successCount

      const details = results.map((r) => {
        const name = r.account.name || r.account.appId
        return r.success
          ? `✓ ${name}: ${r.mediaId}`
          : `✗ ${name}: ${r.error}`
      }).join('\n')

      if (failCount === 0) {
        new Notice(`全部推送成功（${successCount} 个账号）\n${details}`, 5000)
      }
      else {
        new Notice(`推送完成：${successCount} 成功，${failCount} 失败\n${details}`, 8000)
      }
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[WeChat Publisher] Push failed:', err)
      new Notice(`推送失败: ${msg}`, 5000)
    }
  }

  async handleCopyMarkdown(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile()
    if (!activeFile || activeFile.extension !== 'md') {
      new Notice('请先打开一个 Markdown 文件', 1500)
      return
    }

    try {
      const markdown = await this.app.vault.read(activeFile)
      await navigator.clipboard.writeText(markdown)
      new Notice('Markdown 已复制到剪贴板', 1500)
    }
    catch (err) {
      console.error('Copy markdown failed:', err)
      new Notice('复制失败，请重试', 1500)
    }
  }

  async handleCopy(): Promise<void> {
    if (!this.lastHtml) {
      new Notice('没有可复制的内容', 1500)
      return
    }

    try {
      const inlinedHtml = inlineCSS(this.lastHtml, this.lastCss)
      await copyToClipboard(inlinedHtml)
      new Notice('已复制到剪贴板，可直接粘贴到微信编辑器', 1500)
    }
    catch (err) {
      console.error('Copy failed:', err)
      new Notice('复制失败，请重试', 1500)
    }
  }
}
