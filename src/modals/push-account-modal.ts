import type { WxAccount } from '../types'
import { Modal, Setting } from 'obsidian'

export class PushAccountModal extends Modal {
  private accounts: WxAccount[]
  private selected: Set<number>
  private resolve: ((accounts: WxAccount[] | null) => void) | null = null

  constructor(app: import('obsidian').App, accounts: WxAccount[]) {
    super(app)
    this.accounts = accounts
    this.selected = new Set(accounts.map((_, i) => i))
  }

  onOpen(): void {
    const { contentEl } = this
    contentEl.empty()
    contentEl.createEl('h2', { text: '选择推送的公众号' })

    this.accounts.forEach((account, index) => {
      const name = account.name || account.appId
      new Setting(contentEl)
        .setName(name)
        .addToggle((toggle) => {
          toggle.setValue(true)
          toggle.onChange((value) => {
            if (value)
              this.selected.add(index)
            else
              this.selected.delete(index)
          })
        })
    })

    new Setting(contentEl)
      .addButton((btn) => {
        btn.setButtonText('推送')
        btn.setCta()
        btn.onClick(() => {
          const chosen = this.accounts.filter((_, i) => this.selected.has(i))
          this.resolve?.(chosen)
          this.resolve = null
          this.close()
        })
      })
      .addButton((btn) => {
        btn.setButtonText('取消')
        btn.onClick(() => {
          this.resolve?.(null)
          this.resolve = null
          this.close()
        })
      })
  }

  onClose(): void {
    this.resolve?.(null)
    this.resolve = null
    this.contentEl.empty()
  }

  openAndGetAccounts(): Promise<WxAccount[] | null> {
    return new Promise((resolve) => {
      this.resolve = resolve
      this.open()
    })
  }
}
