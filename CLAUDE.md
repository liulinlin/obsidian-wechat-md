# Obsidian 微信公众号排版插件 - 项目文档

> 将 Markdown 转微信公众号排版的 Obsidian 插件（独立仓库版本）
>
> 文档版本：v2.0（基于实际代码结构更新）
> 最后更新：2026-03-11

---

## 📋 目录

- [1. 项目概览](#1-项目概览)
- [2. 目录结构](#2-目录结构)
- [3. 技术架构](#3-技术架构)
- [4. 功能设计](#4-功能设计)
- [5. 开发指南](#5-开发指南)
- [6. 部署发布](#6-部署发布)
- [7. 开发踩坑记录](#7-开发踩坑记录)
- [8. 待优化项](#8-待优化项)

---

## 1. 项目概览

### 1.1 项目定位

这是一个**完全自包含**的 Obsidian 插件，将 `@md/core` 和 `@md/shared` 核心逻辑内嵌到 `src/packages/` 目录，无需依赖外部 monorepo。

**主要功能**：
- ✅ 预览面板：侧边栏独立视图，实时渲染微信公众号样式
- ✅ 一键复制：CSS 内联后复制，可直接粘贴到微信编辑器
- ✅ 微信推送：直接发布草稿到微信公众号（支持多账号）
- ✅ AI 润色：调用 LLM API 优化文章内容
- ✅ URL 导入：通过 Jina Reader / Anything-MD 导入网页内容
- ✅ Obsidian 语法：Wiki 链接、嵌入、注释自动转换
- ✅ 10 个 Markdown 扩展：数学公式、Mermaid、代码高亮、Callout 等

### 1.2 技术栈

| 技术 | 用途 |
|------|------|
| TypeScript | 主开发语言 |
| esbuild | 构建工具（CJS 输出，兼容 Obsidian） |
| marked | Markdown 解析引擎 |
| highlight.js | 代码语法高亮 |
| MathJax 3 | 数学公式渲染（CDN 动态加载） |
| juice | CSS 内联（微信兼容） |
| isomorphic-dompurify | XSS 防护 |
| postcss | CSS 处理 |

---

## 2. 目录结构

```
obsidian-wechat-md/
├── src/
│   ├── main.ts                          # 插件入口（生命周期、命令注册）[248 行]
│   ├── types/
│   │   └── index.ts                     # 设置接口 + 常量 [109 行]
│   ├── views/
│   │   └── preview-view.ts              # 预览面板（渲染、工具栏）[~300 行]
│   ├── settings/
│   │   └── settings-tab.ts              # 设置界面 [~400 行]
│   ├── core/                            # 核心业务逻辑
│   │   ├── preprocessor.ts              # Obsidian 语法预处理 [~150 行]
│   │   ├── clipboard.ts                 # 剪贴板处理（CSS 内联）[56 行]
│   │   ├── wechat-api.ts                # 微信 API 封装 [~250 行]
│   │   ├── wechat-publisher.ts          # 文章推送、图片处理 [~250 行]
│   │   ├── ai-polish.ts                 # AI 润色调用 [60 行]
│   │   └── url-importer.ts              # URL 内容导入 [~200 行]
│   ├── modals/                          # 模态对话框
│   │   ├── push-account-modal.ts        # 账号选择 [69 行]
│   │   └── import-url-modal.ts          # URL 导入 [~150 行]
│   ├── utils/
│   │   └── resolve-file.ts              # 文件路径解析（4 级回退）[90 行]
│   └── packages/                        # 内嵌核心包（源自 @md/core + @md/shared）
│       ├── core/
│       │   ├── renderer/
│       │   │   ├── index.ts
│       │   │   └── renderer-impl.ts     # 渲染引擎实现 [~300 行]
│       │   ├── extensions/              # 10 个 Markdown 扩展
│       │   │   ├── index.ts
│       │   │   ├── alert.ts             # GFM Alert / Obsidian Callout
│       │   │   ├── footnotes.ts         # 脚注
│       │   │   ├── katex.ts             # 数学公式（依赖 MathJax）
│       │   │   ├── markup.ts            # 高亮、下划线、波浪线
│       │   │   ├── mermaid.ts           # Mermaid 流程图
│       │   │   ├── ruby.ts              # Ruby 注音
│       │   │   ├── slider.ts            # 图片组滑动
│       │   │   ├── toc.ts               # 目录自动生成
│       │   │   ├── infographic.ts       # 信息图表
│       │   │   └── plantuml.ts          # PlantUML
│       │   ├── theme/                   # 主题系统（7 个模块）
│       │   │   ├── index.ts
│       │   │   ├── cssVariables.ts      # CSS 变量生成
│       │   │   ├── cssProcessor.ts      # CSS 处理
│       │   │   ├── cssScopeWrapper.ts   # 作用域隔离
│       │   │   ├── themeApplicator.ts   # 主题应用
│       │   │   ├── themeExporter.ts     # 主题导出
│       │   │   ├── themeInjector.ts     # 样式注入
│       │   │   └── selectorMapping.ts   # 选择器映射
│       │   └── utils/
│       │       ├── index.ts
│       │       ├── markdownHelpers.ts   # HTML 渲染工具 [~200 行]
│       │       ├── basicHelpers.ts      # 基础工具函数
│       │       ├── languages.ts         # highlight.js 语言注册
│       │       └── initializeMermaid.ts # Mermaid 初始化
│       └── shared/
│           ├── configs/                 # 配置选项 + 主题 CSS
│           │   ├── index.ts
│           │   ├── theme.ts             # 主题选项
│           │   ├── style.ts             # 排版选项
│           │   ├── ai-service-options.ts
│           │   ├── prefix.ts
│           │   ├── shortcut-key.ts
│           │   ├── store.ts
│           │   ├── api.ts
│           │   └── theme-css/
│           │       ├── index.ts         # 导出 baseCSSContent + themeMap
│           │       ├── base.css         # 全局基础样式
│           │       ├── default.css      # 经典主题
│           │       ├── grace.css        # 优雅主题
│           │       └── simple.css       # 简洁主题
│           ├── constants/
│           │   ├── index.ts
│           │   └── ai-config.ts
│           ├── types/
│           │   ├── index.ts
│           │   ├── common.ts
│           │   ├── renderer-types.ts
│           │   ├── ai-services-types.ts
│           │   ├── template.ts
│           │   └── raw-imports.d.ts     # ?raw 导入的类型声明
│           └── utils/
│               ├── index.ts
│               └── fileHelpers.ts
├── styles/
│   └── styles.css                       # 插件样式（工具栏、预览容器）[86 行]
├── docs/
│   └── plans/                           # 功能设计文档
├── dist/                                # 构建输出
│   ├── main.js
│   ├── manifest.json
│   └── styles.css
├── manifest.json                        # 插件元数据
├── versions.json                        # 版本兼容性
├── package.json
├── tsconfig.json
├── esbuild.config.mjs                   # 构建配置 [147 行]
├── version-bump.mjs                     # 版本管理脚本
└── CLAUDE.md
```

---

## 3. 技术架构

### 3.1 核心渲染流程

```
用户触发（打开预览 / 文档变更）
    ↓
ObsidianSyntaxPreprocessor.process()
    ├── ① 移除注释 %%...%%
    ├── ② resolveEmbeds()      ![[file]] → base64 或展开内容
    ├── ③ resolveWikiLinks()   [[link]] → [text](path)
    ├── ④ resolveMarkdownImages() ![](local-path) → base64
    └── ⑤ 处理标签（可选）
    ↓
ensureMathJax()（恢复可能被 Obsidian 覆盖的运行时）
    ↓
initRenderer(options)
    └── 配置 marked + 注册 10 个扩展
    ↓
modifyHtmlContent(markdown, renderer)
    └── marked.parse() + DOMPurify 清洗 + fixLocalImageSources()
    ↓
组装 CSS（5 层优先级）
    ├── 1. generateCSSVariables()    CSS 变量
    ├── 2. baseCSSContent            全局基础样式
    ├── 3. themeMap[theme]           主题 CSS（scoped to #output）
    ├── 4. generateHeadingStyles()   标题样式（可选）
    └── 5. customCSS                 用户自定义（最高优先级）
    ↓
注入到预览 Webview
    ↓
复制时: inlineCSS(html, css) → copyToClipboard()
```

> **⚠️ 预处理顺序约束**：必须严格按照 ①②③④⑤ 顺序执行。
> 若 ③ 在 ② 之前，`[[...]]` 正则会匹配到 `![[...]]` 内部，将嵌入语法破坏为普通文本。

### 3.2 MathJax 集成

```typescript
// 插件加载时（onload）
await loadMathJax()      // 动态注入 CDN 脚本，5s 超时
// 失败时降级：安装 stub，公式显示为原始文本

// 每次渲染前（ensureMathJax）
// ⚠️ 踩坑：Obsidian 更新后可能覆盖 window.MathJax 对象
// 需要从保存的副本恢复 tex2svg / texReset 等方法

const MATHJAX_CDN = 'https://cdn-doocs.oss-cn-shenzhen.aliyuncs.com/npm/mathjax@3/es5/tex-svg.js'
```

### 3.3 esbuild 插件机制

| 插件 | 作用 |
|------|------|
| `rawImportPlugin` | 处理 `?raw` 后缀（主题 CSS 文件使用 Vite 语法，esbuild 不识别） |
| `nodeShimPlugin` | Node 内建模块 polyfill（`util.inherits`、`stream.Transform` 等） |
| `deployPlugin` | 开发模式：构建完成后自动复制到 vault 插件目录 |

**外部依赖**（不打包，运行时由 Obsidian/环境提供）：
```javascript
external: [
  'obsidian',       // Obsidian 核心 API
  'electron',       // Electron 环境 API
  '@codemirror/*',  // 编辑器（Obsidian 内置，避免重复打包）
  'mermaid',        // 全局加载
  '@antv/infographic', // 全局加载
]
```

### 3.4 类型定义（src/types/index.ts）

```typescript
interface PluginSettings {
  // 主题
  theme: ThemeName                    // 'default' | 'grace' | 'simple'
  primaryColor: string
  fontFamily: string
  fontSize: string
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
  removeTags: boolean
  customCSS: string

  // URL 导入
  importFolder: string
  anythingMdApi: string
  jinaApiKey: string
  jinaEmDelimiter: string
  jinaEngine: string
  jinaHeadingStyle: string

  // AI 润色
  aiServiceType: string
  aiEndpoint: string
  aiModel: string
  aiApiKey: string
  aiTemperature: number
  aiMaxTokens: number
  aiPolishPrompt: string

  // 微信推送（多账号）
  wxAccounts: WxAccount[]
  wxProxyUrl: string
  wxDefaultAuthor: string
}

interface WxAccount {
  name: string
  appId: string
  appSecret: string
  enabled: boolean
}
```

---

## 4. 功能设计

### 4.1 预览面板

侧边栏独立视图（类似 PDF 预览），`PREVIEW_VIEW_TYPE = 'wechat-publisher-preview'`。

**工具栏按钮**：
- 复制（CSS 内联后写入剪贴板）
- 复制 Markdown（原始文本，移动端）
- 刷新（手动重新渲染）
- 润色（AI 优化内容，需配置 AI 服务）
- 推送（发布草稿到微信，需配置账号）

**性能保障**：
- 300ms debounce：减少频繁编辑时的渲染次数
- `renderVersion` 竞态守卫：防止旧请求覆盖新结果

### 4.2 扩展支持

| 扩展 | 桌面端 | 移动端 | 说明 |
|------|--------|--------|------|
| **数学公式** (MathJax) | ✅ | ✅ | 依赖 MathJax CDN |
| **Mermaid 流程图** | ✅ | ❌ | 移动端降级为源码 |
| **代码高亮** | ✅ | ✅ | highlight.js，30+ 语言 |
| **GFM Alert / Callout** | ✅ | ✅ | 支持 Obsidian 20+ Callout 变体 |
| **脚注引用** | ✅ | ✅ | 底部汇总显示 |
| **Ruby 注音** | ✅ | ✅ | `[文字]{读音}` 和 `[文字]^(读音)` |
| **高亮/下划线/波浪线** | ✅ | ✅ | `==高亮==` `++下划线++` `~波浪线~` |
| **PlantUML** | ⚠️ | ⚠️ | 需外部服务器 |
| **TOC 目录** | ✅ | ✅ | `[TOC]` 自动生成 |
| **图片滑动** | ✅ | ✅ | `<![](url),![](url)>` 水平滚动 |
| **信息图表** | ✅ | ❌ | `@antv/infographic`，移动端禁用 |

### 4.3 Obsidian 语法处理

**预处理顺序**（严格遵循，不可调换 ② 和 ③）：

| 步骤 | 语法 | 处理逻辑 |
|------|------|----------|
| ① | `%%注释%%` | 移除 |
| ② | `![[image.png]]` | 读取文件 → base64 data URI |
| ② | `![[note.md]]` | 展开笔记内容（深度 1 级）|
| ② | `![[other]]` | 转为链接 |
| ③ | `[[笔记\|别名]]` | `[别名](path)` |
| ③ | `[[笔记]]` | `[笔记](path)` |
| ④ | `![alt](local)` | 读取文件 → base64 data URI |
| ⑤ | `#标签` | 可选移除 |

**文件路径解析**（4 级回退，`src/utils/resolve-file.ts`）：
1. `metadataCache.getFirstLinkpathDest()` — 标准 Obsidian 链接解析
2. `vault.getAbstractFileByPath()` — 精确 vault 路径
3. 附件文件夹查找 — 支持相对路径 `./` 和固定路径，逐级向上查找父目录
4. `vault.getFiles()` 全局文件名搜索 — 兜底

### 4.4 微信推送

**流程**：
```
选择账号（PushAccountModal）
    ↓
预处理 + 渲染 + CSS 内联
    ↓
提取首图（fetchImageAsBuffer）
    ↓
replaceImages()：上传文章内所有图片到微信
  ├── base64 → wxUploadImage（返回 CDN URL）
  ├── HTTP URL → 下载 → wxUploadImage
  └── vault 路径 → 读取 → wxUploadImage
    ↓
wxGetToken(appId, appSecret)：获取 access_token
  └── Token 缓存 2 小时，提前 5 分钟刷新
    ↓
wxUploadCover()：上传封面（返回 media_id）
    ↓
wxAddDraft()：创建草稿（标题从 Frontmatter 或文件名）
```

**多账号支持**：
- 账号列表存储在 `settings.wxAccounts[]`
- 每个账号独立的 Token 缓存
- 推送时弹出账号选择对话框
- `onunload()` 时清理所有 Token 缓存

### 4.5 AI 润色

支持以下 AI 服务（`src/core/ai-polish.ts`）：
- OpenAI / 兼容接口（如 DeepSeek、本地模型）
- Anthropic Claude
- 其他 OpenAI 兼容 API

配置项：端点 URL、模型名、API Key、温度、最大 Token、自定义 Prompt。

### 4.6 URL 导入

通过以下方式导入网页内容为 Markdown（`src/core/url-importer.ts`）：
- **Jina Reader**：`https://r.jina.ai/{url}`，默认共享 API Key，可自定义
- **Anything-MD**：自定义 API 端点

导入的内容自动保存到配置的 `importFolder` 目录。

---

## 5. 开发指南

### 5.1 环境准备

```bash
# 1. 安装依赖
pnpm install

# 2. 配置 Obsidian 测试仓库路径（两种方式）

# 方式 A：修改 package.json 的 dev 脚本中的路径
# 方式 B：设置环境变量
export OBSIDIAN_VAULT_PATH=/path/to/your/vault  # macOS/Linux
set OBSIDIAN_VAULT_PATH=C:\path\to\vault        # Windows
```

### 5.2 开发模式

```bash
pnpm run dev
# 效果：
# - esbuild 监听 src/ 目录变更
# - 构建完成后自动部署到 <vault>/.obsidian/plugins/wechat-publisher/
# - Obsidian 检测到文件变更，自动重载插件
```

**调试**：
- 开发者工具：`Ctrl+Shift+I`（Win/Linux）或 `Cmd+Option+I`（macOS）
- 手动重载：`Ctrl+R` / `Cmd+R`

### 5.3 构建生产版本

```bash
pnpm run build
# 输出到 dist/：main.js、manifest.json、styles.css
```

### 5.4 版本管理

```bash
node version-bump.mjs 1.1.0
# 自动更新 manifest.json、versions.json、package.json 中的版本号
# 并输出后续 git 操作提示
```

### 5.5 关键 API 调用模式

```typescript
// 渲染 Markdown → HTML
import { initRenderer } from './packages/core/renderer'
import { modifyHtmlContent } from './packages/core/utils'
import { generateCSSVariables } from './packages/core/theme'
import { baseCSSContent, themeMap } from './packages/shared/configs/theme-css'

const renderer = initRenderer({
  citeStatus: settings.citeStatus,
  isMacCodeBlock: settings.isMacCodeBlock,
  isShowLineNumber: settings.isShowLineNumber,
  legend: settings.legend,
})

const html = modifyHtmlContent(markdown, renderer)

const variables = generateCSSVariables({
  primaryColor: settings.primaryColor,
  fontFamily: settings.fontFamily,
  fontSize: settings.fontSize,
  isUseIndent: settings.isUseIndent,
  isUseJustify: settings.isUseJustify,
})
const css = `${variables}\n${baseCSSContent}\n${themeMap[settings.theme]}\n${settings.customCSS}`
```

---

## 6. 部署发布

### 6.1 手动安装（用户）

1. 下载最新 Release 的 `main.js`、`manifest.json`、`styles.css`
2. 创建目录：`<vault>/.obsidian/plugins/wechat-publisher/`
3. 将三个文件放入该目录
4. 重启 Obsidian
5. Settings → Community plugins → Enable "WeChat Publisher"

### 6.2 BRAT 安装（测试版）

1. 安装 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 插件
2. BRAT 设置 → Add Beta plugin → 输入本仓库地址
3. 自动获取最新 beta 版本

### 6.3 官方插件市场发布

**前置要求**：GitHub 公开仓库、至少 1 个 Release、MIT 许可证

**提交流程**：
1. Fork [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases)
2. 编辑 `community-plugins.json` 添加插件信息
3. 提交 Pull Request，等待审核（约 1-2 周）

### 6.4 CI/CD

`.github/workflows/release.yml` 实现：
- 触发：推送 `x.y.z` 格式 tag
- 构建：`npm run build`
- 发布：创建 GitHub Release，上传 `main.js`、`manifest.json`、`styles.css`

---

## 7. 开发踩坑记录

| 问题 | 现象 | 根因 | 解决方案 |
|------|------|------|----------|
| esbuild 不识别 `?raw` 导入 | 构建报错找不到模块 | 主题 CSS 使用 Vite 的 `?raw` 后缀，esbuild 不支持 | `rawImportPlugin`：剥离 `?raw` 后缀，解析为绝对路径 |
| Node 内建模块 shim 不能全为空对象 | `util2.inherits is not a function` | `reading-time` 无条件 `require` 了 `stream`，`stream.js` 调用 `util.inherits()`；CJS 无法 tree-shake | `nodeShimPlugin` 对 `util` 提供含 `inherits` 的 polyfill，对 `stream` 提供含 `Transform` 的 polyfill；**约束：新增 shim 时必须检查实际调用链** |
| MathJax `texReset` undefined | 渲染失败 | Obsidian 环境未加载 MathJax 运行时 | `onload()` 中动态加载 MathJax CDN 脚本（5s 超时 + 降级 stub）|
| MathJax `tex2svg` not a function | 第一次修复后仍报错 | `window.MathJax` 已存在为配置对象（无运行时方法），`if (!window.MathJax)` 判断跳过加载 | 改为检测 `typeof mj.tex2svg !== 'function'`，合并已有配置后注入 CDN |
| MathJax 运行时被 Obsidian 覆盖 | 渲染时 `tex2svg` 消失 | Obsidian 某些操作后会重置 `window.MathJax` 配置对象 | `main.ts` 中保存 MathJax 运行时副本，每次渲染前调用 `ensureMathJax()` 恢复 |
| 预处理顺序导致 `![[image]]` 失效 | 含空格的图片嵌入变成纯文本 | `resolveWikiLinks` 的正则匹配到 `![[...]]` 内的 `[[...]]`，破坏嵌入语法 | **预处理顺序必须为 ① 注释 → ② 嵌入 → ③ 链接 → ④ 图片 → ⑤ 标签** |
| 图片路径含空格时 marked 不解析 | `![alt](Pasted image.png)` 不生成 `<img>` | marked 要求图片 URL 不能含未编码空格 | `encodeURI(file.path)` 编码路径，`decodeURIComponent` 解码后再 `resolveFile` |
| DOMPurify 剥离本地图片路径 | `<img src="relative/path">` 的 src 被移除 | 默认 `ALLOWED_URI_REGEXP` 只允许 `http/https/data`，相对路径不匹配 | 扩展 `ALLOWED_URI_REGEXP`，支持相对路径（同时保持拦截 `javascript:` 等危险协议）|
| Obsidian API 内部崩溃 | `Cannot read properties of null (reading 'extension')` | `getFirstLinkpathDest()` 在某些情况下内部对象为 null | `resolve-file.ts` 用 try/catch 包裹，catch 中降级到 `vault.getFiles()` 全局搜索 |
| 附件文件夹路径解析不完整 | `attachments/` 配置下找不到附件 | 只在 vault 根和当前目录查找，未向上级目录查找 | 增加逐级向上查找父目录逻辑；兜底用 `vault.getFiles()` 全局搜索 |
| 图片嵌入转 base64 的问题 | 大图片 base64 被 DOMPurify 剥离或性能差 | base64 data URI 过长，与路径规范化设计不一致 | 改为输出 vault 路径（`encodeURI(path)`），预览由 `fixLocalImageSources` 转为 resource URL |
| multipart boundary 格式不匹配 | 图片上传可能在严格服务端失败 | boundary 变量含前缀 dash，body 中又加 dash，导致声明与实际不符 | boundary 变量不含前缀 dash，body 用 `--${boundary}`，严格遵循 RFC 2046 |
| `decodeDataUri` 无法匹配 svg+xml | SVG base64 图片无法解码 | 正则 `(\w+)` 不匹配 `+` 字符 | 正则改为 `([\w+]+)` |
| 移动端插件无法启用 | 手机端启用失败，无明确报错 | 待确认（Node shim、MathJax CDN 超时或移动端 WebView 差异） | MathJax 加 5s 超时 + stub；剪贴板加 `execCommand` 降级；Node shim 改为 bundle + polyfill。**仍需移动端实际调试** |
| `html.split(src).join(url)` 全局替换 | 相同 src 出现多次时替换错乱 | 全局字符串替换不精确 | 改为从后往前精确位置替换 `<img>` 标签内的 src |

---

## 8. 待优化项

| 优先级 | 问题 | 文件 | 状态 |
|--------|------|------|------|
| 中 | 预览更新无 debounce，存在竞态 | `preview-view.ts` | ✅ 已修复：300ms debounce + renderVersion 竞态守卫 |
| 中 | 图片上传串行执行 | `wechat-publisher.ts` | ✅ 已修复：并发下载 + 分批上传（并发数 5）|
| 中 | `publishToAll` 串行推送 | `wechat-publisher.ts` | ✅ 已修复：`Promise.allSettled` 并行推送 |
| 中 | `html.split(src).join(cdnUrl)` 全局替换 | `wechat-publisher.ts` | ✅ 已修复：从后往前精确替换 |
| 低 | 设置面板文本输入每次按键都 `saveSettings()` | `settings-tab.ts` | ✅ 已修复：500ms debounce，`hide()` 时立即 flush |
| 低 | Token 缓存在 `onunload` 时未清理 | `wechat-api.ts` | ✅ 已修复：`onunload()` 中调用 `clearTokenCache()` |
| 低 | `extractFirstImage` 含 Markdown 语法匹配死代码 | `wechat-publisher.ts` | ✅ 已修复：移除 Markdown 分支，仅匹配 `<img>` |
| 低 | `copyCurrentFile` 通过 DOM 查询点击按钮 | `main.ts` | ✅ 已修复：`handleCopy()` 改为 public 直接调用 |
| 低 | 硬编码 Jina API Key | `url-importer.ts` | 暂不修改：项目公共默认 key，用户可在设置中覆盖 |
| 低 | 移动端插件无法启用 | `esbuild.config.mjs` / `main.ts` | 待移动端实际调试确认根因 |

---

## 附录：依赖说明

### 生产依赖

| 包 | 用途 |
|----|------|
| `es-toolkit` | 工具函数（替代 lodash）|
| `fflate` | 压缩算法 |
| `front-matter` | YAML Frontmatter 解析 |
| `highlight.js` | 代码语法高亮 |
| `isomorphic-dompurify` | XSS 清洗（浏览器/Node 双环境）|
| `juice` | CSS 内联化（微信兼容）|
| `marked` | Markdown 解析引擎 |
| `postcss` | CSS 处理 |
| `reading-time` | 阅读时间估算 |

### 开发依赖

| 包 | 用途 |
|----|------|
| `builtin-modules` | 获取 Node 内建模块列表（用于 esbuild external）|
| `cross-env` | 跨平台注入环境变量（`OBSIDIAN_VAULT_PATH`）|
| `esbuild` | 构建工具 |
| `obsidian` | Obsidian API 类型定义（无需 `@types/obsidian`）|
| `typescript` | TypeScript 编译器 |

> **⚠️ 注意**：不要显式添加 `@types/node`，会与环境冲突。
