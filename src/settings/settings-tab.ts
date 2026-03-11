import type { ThemeName } from '../packages/shared/configs'
import type { App } from 'obsidian'
import type WeChatPublisherPlugin from '../main'
import type { WxAccount } from '../types'
import { codeBlockThemeOptions, colorOptions, fontFamilyOptions, fontSizeOptions, legendOptions, serviceOptions, themeOptions } from '../packages/shared/configs'
import { Notice, PluginSettingTab, Setting, SettingGroup, TFolder } from 'obsidian'
import { clearTokenCache, wxGetToken } from '../core/wechat-api'
/* eslint-disable no-new */
export class WeChatPublisherSettingTab extends PluginSettingTab {
  plugin: WeChatPublisherPlugin
  private saveTimers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(app: App, plugin: WeChatPublisherPlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  /** 延迟保存：文本输入停止 500ms 后才写入磁盘 */
  private debouncedSave(key: string, apply: () => void): void {
    const existing = this.saveTimers.get(key)
    if (existing)
      clearTimeout(existing)
    apply()
    this.saveTimers.set(key, setTimeout(async () => {
      this.saveTimers.delete(key)
      await this.plugin.saveSettings()
    }, 500))
  }

  hide(): void {
    // 面板关闭时立即保存所有待保存的变更
    for (const [key, timer] of this.saveTimers) {
      clearTimeout(timer)
      this.saveTimers.delete(key)
    }
    this.plugin.saveSettings()
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()

    // 主题设置
    new SettingGroup(containerEl)
      .setHeading('主题设置')
      .addSetting(s => s
        .setName('预设主题')
        .setDesc('选择排版主题风格')
        .addDropdown((dropdown) => {
          for (const opt of themeOptions) {
            dropdown.addOption(opt.value, opt.label)
          }
          dropdown.setValue(this.plugin.settings.theme)
          dropdown.onChange(async (value) => {
            this.plugin.settings.theme = value as ThemeName
            await this.plugin.saveSettings()
          })
        }))
      .addSetting(s => s
        .setName('主色调')
        .setDesc('主题强调色')
        .addDropdown((dropdown) => {
          for (const opt of colorOptions) {
            dropdown.addOption(opt.value, opt.label)
          }
          dropdown.setValue(this.plugin.settings.primaryColor)
          dropdown.onChange(async (value) => {
            this.plugin.settings.primaryColor = value
            await this.plugin.saveSettings()
          })
        }))

    // 排版设置
    new SettingGroup(containerEl)
      .setHeading('排版设置')
      .addSetting(s => s
        .setName('字体')
        .addDropdown((dropdown) => {
          for (const opt of fontFamilyOptions) {
            dropdown.addOption(opt.value, opt.label)
          }
          dropdown.setValue(this.plugin.settings.fontFamily)
          dropdown.onChange(async (value) => {
            this.plugin.settings.fontFamily = value
            await this.plugin.saveSettings()
          })
        }))
      .addSetting(s => s
        .setName('字号')
        .addDropdown((dropdown) => {
          for (const opt of fontSizeOptions) {
            dropdown.addOption(opt.value, opt.label)
          }
          dropdown.setValue(this.plugin.settings.fontSize)
          dropdown.onChange(async (value) => {
            this.plugin.settings.fontSize = value
            await this.plugin.saveSettings()
          })
        }))
      .addSetting(s => s
        .setName('首行缩进')
        .addToggle((toggle) => {
          toggle.setValue(this.plugin.settings.isUseIndent)
          toggle.onChange(async (value) => {
            this.plugin.settings.isUseIndent = value
            await this.plugin.saveSettings()
          })
        }))
      .addSetting(s => s
        .setName('两端对齐')
        .addToggle((toggle) => {
          toggle.setValue(this.plugin.settings.isUseJustify)
          toggle.onChange(async (value) => {
            this.plugin.settings.isUseJustify = value
            await this.plugin.saveSettings()
          })
        }))

    // 代码块设置
    new SettingGroup(containerEl)
      .setHeading('代码块')
      .addSetting(s => s
        .setName('Mac 风格窗口')
        .addToggle((toggle) => {
          toggle.setValue(this.plugin.settings.isMacCodeBlock)
          toggle.onChange(async (value) => {
            this.plugin.settings.isMacCodeBlock = value
            await this.plugin.saveSettings()
          })
        }))
      .addSetting(s => s
        .setName('显示行号')
        .addToggle((toggle) => {
          toggle.setValue(this.plugin.settings.isShowLineNumber)
          toggle.onChange(async (value) => {
            this.plugin.settings.isShowLineNumber = value
            await this.plugin.saveSettings()
          })
        }))
      .addSetting(s => s
        .setName('代码主题')
        .setDesc('highlight.js 语法高亮主题')
        .addDropdown((dropdown) => {
          for (const opt of codeBlockThemeOptions) {
            dropdown.addOption(opt.value, opt.label)
          }
          dropdown.setValue(this.plugin.settings.codeBlockTheme)
          dropdown.onChange(async (value) => {
            this.plugin.settings.codeBlockTheme = value
            await this.plugin.saveSettings()
          })
        }))

    // 渲染设置
    new SettingGroup(containerEl)
      .setHeading('渲染设置')
      .addSetting(s => s
        .setName('链接脚注')
        .setDesc('将链接转换为脚注引用')
        .addToggle((toggle) => {
          toggle.setValue(this.plugin.settings.citeStatus)
          toggle.onChange(async (value) => {
            this.plugin.settings.citeStatus = value
            await this.plugin.saveSettings()
          })
        }))
      .addSetting(s => s
        .setName('字数统计')
        .setDesc('显示阅读时间和字数')
        .addToggle((toggle) => {
          toggle.setValue(this.plugin.settings.countStatus)
          toggle.onChange(async (value) => {
            this.plugin.settings.countStatus = value
            await this.plugin.saveSettings()
          })
        }))
      .addSetting(s => s
        .setName('图片题注')
        .addDropdown((dropdown) => {
          for (const opt of legendOptions) {
            dropdown.addOption(opt.value, opt.label)
          }
          dropdown.setValue(this.plugin.settings.legend)
          dropdown.onChange(async (value) => {
            this.plugin.settings.legend = value
            await this.plugin.saveSettings()
          })
        }))

    // Obsidian 语法
    new SettingGroup(containerEl)
      .setHeading('Obsidian 语法')
      .addSetting(s => s
        .setName('移除标签')
        .setDesc('渲染时移除 #标签')
        .addToggle((toggle) => {
          toggle.setValue(this.plugin.settings.removeTags)
          toggle.onChange(async (value) => {
            this.plugin.settings.removeTags = value
            await this.plugin.saveSettings()
          })
        }))

    // 导入设置
    new SettingGroup(containerEl)
      .setHeading('导入设置')
      .addSetting(s => s
        .setName('导入文件夹')
        .setDesc('导入笔记的保存路径，选择「Vault 根目录」则保存到根目录')
        .addDropdown((dropdown) => {
          dropdown.addOption('', 'Vault 根目录')
          const root = this.app.vault.getRoot()
          for (const child of root.children) {
            if (child instanceof TFolder) {
              dropdown.addOption(child.path, child.path)
            }
          }
          dropdown.setValue(this.plugin.settings.importFolder)
          dropdown.onChange(async (value) => {
            this.plugin.settings.importFolder = value
            await this.plugin.saveSettings()
          })
        }))
      .addSetting(s => s
        .setName('Anything-MD API 地址')
        .setDesc('留空则使用默认地址 https://anything-md.doocs.org/')
        .addText((text) => {
          text.setPlaceholder('https://anything-md.doocs.org/')
          text.setValue(this.plugin.settings.anythingMdApi)
          text.onChange((value) => {
            this.debouncedSave('anythingMdApi', () => {
              this.plugin.settings.anythingMdApi = value
            })
          })
        }))

    // Jina Reader 设置
    new SettingGroup(containerEl)
      .setHeading('Jina Reader 设置')
      .addSetting(s => s
        .setName('API Key')
        .setDesc('留空则使用内置默认 Key')
        .addText((text) => {
          text.inputEl.type = 'password'
          text.setPlaceholder('jina_...')
          text.setValue(this.plugin.settings.jinaApiKey)
          text.onChange((value) => {
            this.debouncedSave('jinaApiKey', () => {
              this.plugin.settings.jinaApiKey = value
            })
          })
        }))
      .addSetting(s => s
        .setName('强调符号')
        .setDesc('X-Md-Em-Delimiter')
        .addDropdown((dropdown) => {
          dropdown.addOption('*', '* (星号)')
          dropdown.addOption('_', '_ (下划线)')
          dropdown.setValue(this.plugin.settings.jinaEmDelimiter)
          dropdown.onChange(async (value) => {
            this.plugin.settings.jinaEmDelimiter = value
            await this.plugin.saveSettings()
          })
        }))
      .addSetting(s => s
        .setName('引擎')
        .setDesc('X-Engine')
        .addDropdown((dropdown) => {
          dropdown.addOption('browser', 'browser')
          dropdown.addOption('readability', 'readability')
          dropdown.addOption('direct', 'direct')
          dropdown.setValue(this.plugin.settings.jinaEngine)
          dropdown.onChange(async (value) => {
            this.plugin.settings.jinaEngine = value
            await this.plugin.saveSettings()
          })
        }))
      .addSetting(s => s
        .setName('标题风格')
        .setDesc('X-Md-Heading-Style')
        .addDropdown((dropdown) => {
          dropdown.addOption('setext', 'setext')
          dropdown.addOption('atx', 'atx')
          dropdown.setValue(this.plugin.settings.jinaHeadingStyle)
          dropdown.onChange(async (value) => {
            this.plugin.settings.jinaHeadingStyle = value
            await this.plugin.saveSettings()
          })
        }))

    // 自定义 CSS
    new SettingGroup(containerEl)
      .setHeading('自定义 CSS')
      .addSetting(s => s
        .setName('自定义样式')
        .setDesc('输入自定义 CSS，优先级最高')
        .addTextArea((text) => {
          text.inputEl.rows = 8
          text.inputEl.cols = 50
          text.inputEl.style.fontFamily = 'monospace'
          text.inputEl.style.fontSize = '12px'
          text.setValue(this.plugin.settings.customCSS)
          text.onChange((value) => {
            this.debouncedSave('customCSS', () => {
              this.plugin.settings.customCSS = value
            })
          })
        }))

    // AI 润色
    const aiGroup = new SettingGroup(containerEl)
      .setHeading('AI 润色')

    aiGroup.addSetting((s) => {
      s.setName('AI 服务')
        .setDesc('选择 AI 服务提供商')
        .addDropdown((dropdown) => {
          for (const opt of serviceOptions) {
            dropdown.addOption(opt.value, opt.label)
          }
          dropdown.setValue(this.plugin.settings.aiServiceType)
          dropdown.onChange(async (value) => {
            this.plugin.settings.aiServiceType = value
            const selected = serviceOptions.find(o => o.value === value)
            if (selected) {
              this.plugin.settings.aiEndpoint = selected.endpoint
              this.plugin.settings.aiModel = selected.models[0] || ''
            }
            await this.plugin.saveSettings()
            this.display()
          })
        })
    })

    aiGroup.addSetting((s) => {
      s.setName('API 端点')
        .addText((text) => {
          text.setPlaceholder('https://api.openai.com/v1')
          text.setValue(this.plugin.settings.aiEndpoint)
          text.onChange((value) => {
            this.debouncedSave('aiEndpoint', () => {
              this.plugin.settings.aiEndpoint = value.replace(/\/+$/, '')
            })
          })
        })
    })

    // 模型下拉
    const currentService = serviceOptions.find(o => o.value === this.plugin.settings.aiServiceType)
    const modelList = currentService?.models || []

    aiGroup.addSetting((s) => {
      s.setName('模型')
      if (modelList.length > 0) {
        s.addDropdown((dropdown) => {
          for (const m of modelList) {
            dropdown.addOption(m, m)
          }
          dropdown.setValue(this.plugin.settings.aiModel)
          dropdown.onChange(async (value) => {
            this.plugin.settings.aiModel = value
            await this.plugin.saveSettings()
          })
        })
      }
      else {
        s.addText((text) => {
          text.setPlaceholder('输入模型名称')
          text.setValue(this.plugin.settings.aiModel)
          text.onChange((value) => {
            this.debouncedSave('aiModel', () => {
              this.plugin.settings.aiModel = value
            })
          })
        })
      }
    })

    aiGroup.addSetting(s => s
      .setName('API Key')
      .setDesc('内置服务无需填写')
      .addText((text) => {
        text.inputEl.type = 'password'
        text.setPlaceholder('sk-...')
        text.setValue(this.plugin.settings.aiApiKey)
        text.onChange((value) => {
          this.debouncedSave('aiApiKey', () => {
            this.plugin.settings.aiApiKey = value
          })
        })
      }))

    aiGroup.addSetting(s => s
      .setName('温度')
      .setDesc('0-2，值越大输出越随机')
      .addText((text) => {
        text.setPlaceholder('1')
        text.setValue(String(this.plugin.settings.aiTemperature))
        text.onChange((value) => {
          this.debouncedSave('aiTemperature', () => {
            const num = Number.parseFloat(value)
            if (!Number.isNaN(num) && num >= 0 && num <= 2) {
              this.plugin.settings.aiTemperature = num
            }
          })
        })
      }))

    aiGroup.addSetting(s => s
      .setName('最大 Token 数')
      .addText((text) => {
        text.setPlaceholder('4096')
        text.setValue(String(this.plugin.settings.aiMaxTokens))
        text.onChange((value) => {
          this.debouncedSave('aiMaxTokens', () => {
            const num = Number.parseInt(value, 10)
            if (!Number.isNaN(num) && num > 0) {
              this.plugin.settings.aiMaxTokens = num
            }
          })
        })
      }))

    aiGroup.addSetting(s => s
      .setName('润色提示词')
      .setDesc('自定义 AI 润色的 system prompt')
      .addTextArea((text) => {
        text.inputEl.rows = 6
        text.inputEl.cols = 50
        text.inputEl.style.fontFamily = 'monospace'
        text.inputEl.style.fontSize = '12px'
        text.setValue(this.plugin.settings.aiPolishPrompt)
        text.onChange((value) => {
          this.debouncedSave('aiPolishPrompt', () => {
            this.plugin.settings.aiPolishPrompt = value
          })
        })
      }))

    // 微信公众号推送
    new SettingGroup(containerEl)
      .setHeading('微信公众号推送')
      .addSetting(s => s
        .setName('代理服务器地址')
        .setDesc('默认使用 https://wx-proxy.codeby.cc/，也可自行部署代理服务器（见项目 README）')
        .addText((text) => {
          text.setPlaceholder('https://wx-proxy.codeby.cc/')
          text.setValue(this.plugin.settings.wxProxyUrl)
          text.onChange((value) => {
            this.debouncedSave('wxProxyUrl', () => {
              this.plugin.settings.wxProxyUrl = value.replace(/\/+$/, '')
              clearTokenCache()
            })
          })
        }))
      .addSetting(s => s
        .setName('默认作者')
        .setDesc('文章默认作者名，可在 frontmatter 中用 author 字段覆盖')
        .addText((text) => {
          text.setPlaceholder('作者名')
          text.setValue(this.plugin.settings.wxDefaultAuthor)
          text.onChange((value) => {
            this.debouncedSave('wxDefaultAuthor', () => {
              this.plugin.settings.wxDefaultAuthor = value
            })
          })
        }))

    // 公众号账号列表
    this.renderAccountList(containerEl)
  }

  private renderAccountList(containerEl: HTMLElement): void {
    const listContainer = containerEl.createDiv({ cls: 'wx-account-list' })

    const accounts = this.plugin.settings.wxAccounts

    for (let i = 0; i < accounts.length; i++) {
      this.renderAccountCard(listContainer, accounts[i], i)
    }

    // 添加公众号按钮
    new Setting(containerEl)
      .addButton((btn) => {
        btn.setButtonText('+ 添加公众号')
        btn.setCta()
        btn.onClick(async () => {
          this.plugin.settings.wxAccounts.push({
            name: `公众号 ${this.plugin.settings.wxAccounts.length + 1}`,
            appId: '',
            appSecret: '',
            enabled: true,
          })
          await this.plugin.saveSettings()
          this.display()
        })
      })
  }

  private renderAccountCard(container: HTMLElement, account: WxAccount, index: number): void {
    const card = container.createDiv({ cls: 'wx-account-card' })
    card.style.cssText = 'border:1px solid var(--background-modifier-border);border-radius:8px;padding:12px;margin-bottom:12px;'

    // 头部：名称 + 启用开关 + 删除按钮
    new Setting(card)
      .setName(`#${index + 1}`)
      .addText((text) => {
        text.setPlaceholder('账号名称')
        text.setValue(account.name)
        text.onChange((value) => {
          this.debouncedSave(`account-name-${index}`, () => {
            account.name = value
          })
        })
      })
      .addToggle((toggle) => {
        toggle.setTooltip('启用/禁用')
        toggle.setValue(account.enabled)
        toggle.onChange(async (value) => {
          account.enabled = value
          await this.plugin.saveSettings()
        })
      })
      .addButton((btn) => {
        btn.setIcon('trash')
        btn.setTooltip('删除此账号')
        btn.onClick(async () => {
          this.plugin.settings.wxAccounts.splice(index, 1)
          clearTokenCache(account.appId)
          await this.plugin.saveSettings()
          this.display()
        })
      })

    new Setting(card)
      .setName('AppID')
      .addText((text) => {
        text.setPlaceholder('wx...')
        text.setValue(account.appId)
        text.onChange((value) => {
          this.debouncedSave(`account-appId-${index}`, () => {
            clearTokenCache(account.appId)
            account.appId = value.trim()
          })
        })
      })

    new Setting(card)
      .setName('AppSecret')
      .addText((text) => {
        text.inputEl.type = 'password'
        text.setPlaceholder('输入 AppSecret')
        text.setValue(account.appSecret)
        text.onChange((value) => {
          this.debouncedSave(`account-appSecret-${index}`, () => {
            clearTokenCache(account.appId)
            account.appSecret = value.trim()
          })
        })
      })

    new Setting(card)
      .addButton((btn) => {
        btn.setButtonText('测试连接')
        btn.onClick(async () => {
          const { wxProxyUrl } = this.plugin.settings
          if (!wxProxyUrl || !account.appId || !account.appSecret) {
            new Notice('请先填写代理地址、AppID 和 AppSecret')
            return
          }
          btn.setButtonText('测试中...')
          btn.setDisabled(true)
          try {
            clearTokenCache(account.appId)
            await wxGetToken(wxProxyUrl, account.appId, account.appSecret)
            new Notice(`「${account.name || '未命名'}」连接成功`)
          }
          catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            new Notice(`「${account.name || '未命名'}」连接失败: ${msg}`, 5000)
          }
          finally {
            btn.setButtonText('测试连接')
            btn.setDisabled(false)
          }
        })
      })
  }
}
