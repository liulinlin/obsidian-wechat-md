import type WeChatPublisherPlugin from '../main'
import { Modal, normalizePath, Notice, SettingGroup } from 'obsidian'
import { extractTitle, fetchViaAnythingMd, fetchViaJina, sanitizeFilename } from '../core/url-importer'

type ImportMethod = 'anything-md' | 'jina'
/* eslint-disable no-new */
export class ImportUrlModal extends Modal {
  private plugin: WeChatPublisherPlugin
  private url = ''
  private method: ImportMethod = 'anything-md'
  private statusEl: HTMLElement | null = null

  constructor(plugin: WeChatPublisherPlugin) {
    super(plugin.app)
    this.plugin = plugin
  }

  onOpen(): void {
    const { contentEl } = this
    contentEl.empty()
    // URL 输入 + 导入方式 + 导入按钮
    new SettingGroup(contentEl)
      .setHeading('导入网页')
      .addSetting(s => s
        .setName('网页链接')
        .setDesc('输入要转换的网页 URL')
        .addText((text) => {
          text.setPlaceholder('https://example.com/article')
          text.onChange((value) => {
            this.url = value.trim()
          })
          // Enter 快捷键触发导入
          text.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              this.doImport()
            }
          })
          // 自动聚焦
          setTimeout(() => text.inputEl.focus(), 50)
        }))
      .addSetting(s => s
        .setName('导入方式')
        .setDesc('Jina Reader 适合twitter，Anything-MD 在某些特定网站（如掘金）表现更好')
        .addDropdown((dropdown) => {
          dropdown.addOption('anything-md', 'Anything-MD')
          dropdown.addOption('Jina', 'Jina Reader')
          dropdown.setValue(this.method)
          dropdown.onChange((value) => {
            this.method = value as ImportMethod
          })
        }))
      .addSetting(s => s
        .addButton((btn) => {
          btn.setButtonText('导入')
          btn.setCta()
          btn.onClick(() => this.doImport())
        }))

    // 状态行
    this.statusEl = contentEl.createEl('div', {
      cls: 'import-url-status',
    })
    this.statusEl.style.cssText = 'margin-top:8px;font-size:12px;color:var(--text-error);'
  }

  onClose(): void {
    this.contentEl.empty()
  }

  private async doImport(): Promise<void> {
    if (!this.url) {
      this.showStatus('请输入 URL')
      return
    }

    try {
      new URL(this.url)
    }
    catch {
      this.showStatus('请输入有效的 URL')
      return
    }

    if (!/^https?:\/\//i.test(this.url)) {
      this.showStatus('仅支持 http/https 链接')
      return
    }

    this.showStatus('')

    // 禁用交互
    const buttons = this.contentEl.querySelectorAll('button')
    const inputs = this.contentEl.querySelectorAll('input, select')
    buttons.forEach(b => (b as HTMLButtonElement).disabled = true)
    inputs.forEach(i => (i as HTMLInputElement).disabled = true)

    try {
      this.showStatus('正在导入...', false)

      const content = this.method === 'jina'
        ? await fetchViaJina(this.url, this.plugin.settings)
        : await fetchViaAnythingMd(this.url, this.plugin.settings)

      await this.createNote(content)
      this.close()
      new Notice('导入成功')
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.showStatus(msg)
    }
    finally {
      buttons.forEach(b => (b as HTMLButtonElement).disabled = false)
      inputs.forEach(i => (i as HTMLInputElement).disabled = false)
    }
  }

  private showStatus(msg: string, isError = true): void {
    if (!this.statusEl)
      return
    this.statusEl.textContent = msg
    this.statusEl.style.color = isError ? 'var(--text-error)' : 'var(--text-muted)'
  }

  private async createNote(content: string): Promise<void> {
    const title = extractTitle(content) || new URL(this.url).hostname
    const filename = sanitizeFilename(title)

    const folder = this.plugin.settings.importFolder.trim()
    if (folder) {
      const folderExists = this.app.vault.getAbstractFileByPath(normalizePath(folder))
      if (!folderExists) {
        await this.app.vault.createFolder(normalizePath(folder))
      }
    }

    const basePath = folder ? `${normalizePath(folder)}/${filename}` : filename
    let filePath = `${basePath}.md`

    // 避免文件名冲突
    let counter = 1
    while (this.app.vault.getAbstractFileByPath(filePath)) {
      filePath = `${basePath} ${counter}.md`
      counter++
    }

    const file = await this.app.vault.create(filePath, content)
    await this.app.workspace.getLeaf(false).openFile(file)
  }
}
