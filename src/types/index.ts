import type { ThemeName } from '../packages/shared/configs'

export interface WxAccount {
  name: string
  appId: string
  appSecret: string
  enabled: boolean
}

export interface PluginSettings {
  // 主题
  theme: ThemeName
  primaryColor: string
  fontFamily: string
  fontSize: string

  // 排版
  isUseIndent: boolean
  isUseJustify: boolean

  // 代码块
  isMacCodeBlock: boolean
  isShowLineNumber: boolean
  codeBlockTheme: string

  // 渲染
  citeStatus: boolean
  countStatus: boolean
  legend: string

  // Obsidian 语法
  removeTags: boolean

  // 导入设置
  importFolder: string
  anythingMdApi: string

  // Jina Reader 设置
  jinaApiKey: string
  jinaEmDelimiter: string
  jinaEngine: string
  jinaHeadingStyle: string

  // 自定义 CSS
  customCSS: string

  // AI 润色
  aiServiceType: string
  aiEndpoint: string
  aiModel: string
  aiApiKey: string
  aiTemperature: number
  aiMaxTokens: number
  aiPolishPrompt: string

  // 微信公众号推送
  wxAccounts: WxAccount[]
  wxProxyUrl: string
  wxDefaultAuthor: string

  // 旧字段（迁移用，运行时不再使用）
  wxAppId?: string
  wxAppSecret?: string
}

export const DEFAULT_SETTINGS: PluginSettings = {
  theme: 'default',
  primaryColor: '#0F4C81',
  fontFamily: '-apple-system-font,BlinkMacSystemFont, Helvetica Neue, PingFang SC, Hiragino Sans GB , Microsoft YaHei UI , Microsoft YaHei ,Arial,sans-serif',
  fontSize: '16px',

  isUseIndent: false,
  isUseJustify: false,

  isMacCodeBlock: true,
  isShowLineNumber: false,
  codeBlockTheme: 'https://cdn-doocs.oss-cn-shenzhen.aliyuncs.com/npm/highlightjs/11.11.1/styles/github-dark.min.css',

  citeStatus: false,
  countStatus: false,
  legend: 'none',

  removeTags: false,

  importFolder: '',
  anythingMdApi: '',

  jinaApiKey: '',
  jinaEmDelimiter: '*',
  jinaEngine: 'browser',
  jinaHeadingStyle: 'setext',

  customCSS: '',

  aiServiceType: 'default',
  aiEndpoint: 'https://proxy-ai.doocs.org/v1',
  aiModel: 'Qwen/Qwen2.5-7B-Instruct',
  aiApiKey: '',
  aiTemperature: 1,
  aiMaxTokens: 4096,
  aiPolishPrompt: '你是一名资深的微信公众号科技长文写手。请将以下科技素材深度改写为适合微信公众号发布的长文。\n\n写作约束：\n1. 去噪重构：剔除广告、水词、冗余，用全新叙事逻辑重组内容\n2. 保留图片：原文所有 ![](...) 必须保留在相关段落旁，链接不变，去掉外链追踪参数\n3. 风格：中文，专业不晦涩，长短句交替，段落简洁，适配手机阅读\n4. 开头：一句有冲击力的 hook（数据 / 反直觉观点 / 场景描写）\n5. 结尾：点题升华，留有思考空间\n6. 格式：小节标题带序号（## 1. 标题），**加粗** 强调核心概念\n7. 结构：3-5 个小节，逻辑递进\n8. 只输出改写后的 Markdown 内容，不要输出任何额外说明',

  wxAccounts: [],
  wxProxyUrl: 'https://wx-proxy.codeby.cc',
  wxDefaultAuthor: '',
}

export const PREVIEW_VIEW_TYPE = 'wechat-publisher-preview'
