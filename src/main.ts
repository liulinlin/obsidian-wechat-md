import type { WorkspaceLeaf } from 'obsidian'
import type { PluginSettings } from './types'
import { Plugin } from 'obsidian'
import { clearTokenCache } from './core/wechat-api'
import { ImportUrlModal } from './modals/import-url-modal'
import { WeChatPublisherSettingTab } from './settings/settings-tab'
import { DEFAULT_SETTINGS, PREVIEW_VIEW_TYPE } from './types'
import { PreviewView } from './views/preview-view'

const MATHJAX_CDN = 'https://cdn-doocs.oss-cn-shenzhen.aliyuncs.com/npm/mathjax@3/es5/tex-svg.js'

/** 保存 MathJax 完整运行时引用，防止被 Obsidian 或其他插件覆盖 */
let mathJaxRuntime: any = null

/**
 * 动态加载 MathJax 3 运行时
 * @md/core 的 KaTeX 扩展依赖 window.MathJax.texReset() / tex2svg()
 * Web 端通过 <script> 标签加载，Obsidian 环境需要动态注入
 */
async function loadMathJax(): Promise<void> {
  // 已有完整运行时，无需重复加载
  if (typeof (window as any).MathJax?.tex2svg === 'function')
    return

  // 插件重载时 script 标签可能残留在 DOM 中，但 window.MathJax 已被覆盖丢失运行时方法
  // 必须移除旧标签，重新注入以触发 MathJax 初始化
  const existingScript = document.getElementById('MathJax-script')
  if (existingScript)
    existingScript.remove()

  // 合并已有配置（Obsidian 可能已设置 MathJax 配置对象）
  const existing = (window as any).MathJax || {}
  ;(window as any).MathJax = {
    ...existing,
    tex: { tags: 'ams', ...existing.tex },
    svg: { fontCache: 'none', ...existing.svg },
  }

  // 注入 script 标签加载 CDN（带超时，防止移动端阻塞 onload）
  await Promise.race([
    new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.id = 'MathJax-script'
      script.src = MATHJAX_CDN
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Failed to load MathJax from CDN'))
      document.head.appendChild(script)
    }),
    new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('MathJax load timeout (5s)')), 5000),
    ),
  ])

  // 等待 MathJax 完成内部初始化
  await (window as any).MathJax?.startup?.promise

  // 验证运行时方法确实可用，否则抛出让 catch 安装降级 stub
  if (typeof (window as any).MathJax?.tex2svg !== 'function')
    throw new Error('MathJax loaded but tex2svg is not available')

  // 保存完整运行时引用
  mathJaxRuntime = (window as any).MathJax
}

/**
 * 确保 MathJax 运行时可用
 * Obsidian 切换文档时可能将 window.MathJax 重置为纯配置对象，
 * 导致 @md/core 的 katex 扩展调用 texReset()/tex2svg() 时报错。
 * 每次渲染前调用此函数，从保存的引用恢复运行时。
 */
export function ensureMathJax(): void {
  if (typeof (window as any).MathJax?.tex2svg === 'function')
    return
  if (mathJaxRuntime) {
    ;(window as any).MathJax = mathJaxRuntime
  }
}

/** MathJax 加载失败时的降级 stub */
function installMathJaxFallback(): void {
  const mj = ((window as any).MathJax ??= {}) as Record<string, any>
  if (typeof mj?.texReset !== 'function') {
    mj.texReset = () => {}
  }
  if (typeof mj?.tex2svg !== 'function') {
    mj.tex2svg = (text: string, options?: { display?: boolean }) => {
      const span = document.createElement('span')
      span.style.cssText = 'font-family:monospace;font-size:0.9em;color:#555;'
      span.textContent = options?.display ? `$$${text}$$` : `$${text}$`
      const container = document.createElement('div')
      container.appendChild(span)
      return container
    }
  }
}

export default class WeChatPublisherPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS

  async onload(): Promise<void> {
    // 优先加载 MathJax 运行时，失败则降级为纯文本显示
    try {
      await loadMathJax()
    }
    catch (err) {
      console.warn('[WeChat Publisher] MathJax 加载失败，公式将降级显示:', err)
      installMathJaxFallback()
    }

    await this.loadSettings()

    // 注册预览视图
    this.registerView(
      PREVIEW_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new PreviewView(leaf, this),
    )

    // 注册命令：打开预览
    this.addCommand({
      id: 'open-preview',
      name: '打开微信排版预览',
      callback: () => this.activatePreview(),
    })

    // 注册命令：复制为微信格式
    this.addCommand({
      id: 'copy-wechat',
      name: '复制为微信公众号格式',
      callback: () => this.copyCurrentFile(),
    })

    // 注册命令：推送到微信草稿箱
    this.addCommand({
      id: 'push-wechat',
      name: '推送到微信公众号草稿箱',
      callback: () => this.pushToWechat(),
    })

    // 注册命令：从 URL 导入 Markdown
    this.addCommand({
      id: 'import-from-url',
      name: '从 URL 导入 Markdown',
      callback: () => new ImportUrlModal(this).open(),
    })

    // 注册设置面板
    this.addSettingTab(new WeChatPublisherSettingTab(this.app, this))

    // 添加 Ribbon 图标
    this.addRibbonIcon('file-text', '微信排版预览', () => {
      this.activatePreview()
    })
  }

  onunload(): void {
    clearTokenCache()
    this.app.workspace.detachLeavesOfType(PREVIEW_VIEW_TYPE)
  }

  async loadSettings(): Promise<void> {
    const data = await this.loadData() || {}
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data)

    // 迁移旧的单账号配置到 wxAccounts 数组
    if (data.wxAppId && (!this.settings.wxAccounts || this.settings.wxAccounts.length === 0)) {
      this.settings.wxAccounts = [{
        name: '默认公众号',
        appId: data.wxAppId,
        appSecret: data.wxAppSecret || '',
        enabled: true,
      }]
      // 清除旧字段
      delete this.settings.wxAppId
      delete this.settings.wxAppSecret
      await this.saveData(this.settings)
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings)

    // 通知预览视图刷新
    const leaves = this.app.workspace.getLeavesOfType(PREVIEW_VIEW_TYPE)
    for (const leaf of leaves) {
      const view = leaf.view as PreviewView
      if (view?.updatePreview) {
        view.updatePreview()
        view.updatePushBtnVisibility()
        view.updatePolishBtnVisibility()
      }
    }
  }

  private async activatePreview(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(PREVIEW_VIEW_TYPE)

    if (existing.length > 0) {
      // 已有预览面板，激活它
      this.app.workspace.revealLeaf(existing[0])
      return
    }

    // 在右侧打开新面板
    const leaf = this.app.workspace.getRightLeaf(false)
    if (leaf) {
      await leaf.setViewState({
        type: PREVIEW_VIEW_TYPE,
        active: true,
      })
      this.app.workspace.revealLeaf(leaf)
    }
  }

  private async copyCurrentFile(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(PREVIEW_VIEW_TYPE)

    if (leaves.length === 0) {
      // 先打开预览，再复制
      await this.activatePreview()
    }

    // 等待视图就绪后触发复制
    const updatedLeaves = this.app.workspace.getLeavesOfType(PREVIEW_VIEW_TYPE)
    if (updatedLeaves.length > 0) {
      const view = updatedLeaves[0].view as PreviewView
      if (view?.updatePreview) {
        await view.updatePreview()
        await view.handleCopy()
      }
    }
  }

  private async pushToWechat(): Promise<void> {
    // 确保预览面板已打开并渲染
    await this.activatePreview()

    const leaves = this.app.workspace.getLeavesOfType(PREVIEW_VIEW_TYPE)
    if (leaves.length > 0) {
      const view = leaves[0].view as PreviewView
      if (view?.updatePreview) {
        await view.updatePreview()
        await view.handlePush()
      }
    }
  }
}
