# Obsidian 微信公众号排版插件 - 完整实施方案

> 将现有的 Markdown 转微信公众号排版功能移植到 Obsidian 插件
>
> 文档版本：v1.2（补充开发踩坑记录及实际修复方案）
> 最后更新：2026-02-13

---

## 📋 目录

- [1. 可行性分析](#1-可行性分析)
- [2. 技术架构](#2-技术架构)
- [3. 功能设计](#3-功能设计)
- [4. 实施步骤](#4-实施步骤)
- [5. 部署方案](#5-部署方案)
- [6. 测试计划](#6-测试计划)

---

## 1. 可行性分析

### 1.1 核心优势

✅ **高度可行** - 核心渲染引擎 `@md/core` 是纯 TypeScript 实现，无框架依赖
✅ **成熟的实现参考** - VSCode 扩展提供了最小化集成模式（仅 4 个核心 API 调用）
✅ **跨平台兼容** - Obsidian 基于 Electron，所有浏览器端依赖（Mermaid、MathJax 等）可直接运行
✅ **Callout 原生支持** - `@md/core` 的 `markedAlert` 扩展已内置 Obsidian Callout 语法（20+ 变体）

### 1.2 关键挑战

| 挑战                  | 影响 | 解决方案                                                                                                                                                                                                            |
| --------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Obsidian 特有语法处理 | 中   | 仅需处理 `[[wikilink]]`、`![[embed]]`、`%%注释%%`；Callout 已由 `markedAlert` 支持                                                                                                                                  |
| MathJax 脚本加载      | 中   | `@md/core` 的 KaTeX 扩展依赖 `window.MathJax.texReset()` / `tex2svg()`，Obsidian 环境可能已有 MathJax 配置对象但缺少运行时方法，需在插件 `onload()` 中动态注入 CDN 脚本并等待初始化完成，加载失败时降级为纯文本显示 |
| 图片路径处理          | 中   | 集成图床上传或转换为 base64，利用 Obsidian Vault API 读取本地图片                                                                                                                                                   |
| `@md/shared` 导入路径 | 高   | 必须使用子路径导入 `@md/shared/configs` 而非 `@md/shared`，否则会拉入 CodeMirror 编辑器依赖导致插件加载失败                                                                                                         |
| npm 包可用性          | 低   | `@types/obsidian` 不存在于 npm，类型由 `obsidian` 包自带；`@types/node` 应继承 workspace 根配置避免信任策略冲突                                                                                                     |
| 移动端性能            | 低   | 禁用 Mermaid/Infographic 重度扩展                                                                                                                                                                                   |
| CSS 作用域            | 低   | `ThemeInjector` 注入 `<style>` 到 `document.head`，需确认 Obsidian Webview 隔离性                                                                                                                                   |

---

## 2. 技术架构

### 2.1 整体架构

```
apps/obsidian/                    # 新增插件目录
├── src/
│   ├── main.ts                   # 插件入口（集成 @md/core 渲染）
│   ├── views/
│   │   └── preview-view.ts       # 独立预览面板（Webview）
│   ├── settings/
│   │   └── settings-tab.ts       # 设置界面（复用 @md/shared/configs 选项）
│   ├── core/
│   │   ├── preprocessor.ts       # Obsidian 语法预处理
│   │   └── clipboard.ts          # 剪贴板处理（juice CSS 内联）
│   ├── utils/
│   │   └── image-uploader.ts     # 图片上传
│   └── types/
│       └── index.ts              # TypeScript 类型定义
├── styles/
│   └── styles.css                # 插件样式（工具栏、预览容器）
├── manifest.json                 # 插件元数据
├── versions.json                 # 版本兼容性
├── esbuild.config.mjs            # 构建配置
├── package.json
└── README.md
```

### 2.2 核心依赖

> 以下依赖基于 VSCode 扩展（`apps/vscode/package.json`）的实际集成模式整理。

```json
{
  "dependencies": {
    "@md/core": "workspace:*", // 核心渲染引擎（initRenderer, modifyHtmlContent, generateCSSVariables）
    "@md/shared": "workspace:*", // 共享配置（themeMap, baseCSSContent, colorOptions 等）
    "isomorphic-dompurify": "^2.35.0", // @md/core 的 peer dependency，XSS 清洗
    "juice": "^11.0.3" // CSS 内联（复制到微信时使用）
  },
  "devDependencies": {
    "builtin-modules": "^4.0.0", // esbuild external 配置需要
    "cross-env": "^7.0.3", // 开发模式注入 OBSIDIAN_VAULT_PATH 环境变量
    "esbuild": "^0.23.1",
    "obsidian": "latest", // 类型定义由此包自带，无需 @types/obsidian
    "typescript": "^5.9.0"
  }
}
```

> **⚠️ 依赖踩坑记录**：
>
> - `@types/obsidian` 不存在于 npm，类型定义由 `obsidian` 包自带
> - `@types/node` 不要显式声明，应继承 workspace 根配置，否则可能触发 pnpm 信任策略冲突（`ERR_PNPM_TRUST_DOWNGRADE`）
> - **导入路径必须使用子路径** `@md/shared/configs` 而非 `@md/shared`，后者会拉入 CodeMirror 编辑器相关依赖（`@codemirror/lang-css` 等），导致打包产物膨胀且插件加载失败

### 2.3 渲染流程

> 基于 `@md/core` 实际 API（参考 `apps/vscode/src/extension.ts` 集成模式）。

```
插件加载（onload）
    ↓
动态加载 MathJax 3 运行时（CDN）
    ├── 检测 window.MathJax.tex2svg 是否已存在
    ├── 合并已有配置（Obsidian 可能已设置 MathJax 配置对象）
    ├── 注入 <script> 加载 tex-svg.js
    ├── 等待 MathJax.startup.promise 完成初始化
    └── 失败时安装降级 stub（公式显示为原始文本）
    ↓
用户触发（打开预览 / 文档变更）
    ↓
预处理 Obsidian 语法
    ├── resolveWikiLinks()     [[link]] → [link](path)
    ├── resolveEmbeds()        ![[file]] → 展开内容 / 上传图片
    └── 移除 %%注释%%
    ↓
modifyHtmlContent(markdown, renderer)
    └── 内部已封装: marked.parse() + 扩展处理 + DOMPurify 清洗
    ↓
组装 CSS（顺序重要）
    ├── 1. generateCSSVariables({ primaryColor, fontFamily, fontSize, ... })
    ├── 2. baseCSSContent（from @md/shared）
    ├── 3. themeMap[currentTheme]（from @md/shared，scoped to #output）
    └── 4. customCSS（用户自定义，最高优先级）
    ↓
注入到预览面板 Webview HTML
    ↓
复制时: juice 内联所有 CSS → ClipboardItem API
```

---

## 3. 功能设计

### 3.1 功能模式：独立预览面板

**设计决策**：采用侧边栏独立视图模式（类似 PDF 预览）

**原因**：

- ✅ 不干扰 Obsidian 原生编辑/预览体验
- ✅ 避免与其他插件冲突
- ✅ 支持并排对比（编辑器 + 预览）
- ✅ 实现简单，性能可控

**用户体验**：

```
┌──────────────────┬──────────────────┐
│                  │                  │
│   编辑器窗口      │  公众号预览面板   │
│   (原生 MD)      │  (样式化输出)    │
│                  │                  │
│                  │  [主题选择]       │
│                  │  [复制] [刷新]    │
│                  │                  │
│                  │  渲染结果...      │
└──────────────────┴──────────────────┘
```

### 3.2 扩展支持

> 以下扩展均已在 `@md/core/extensions/` 中实现，可直接复用。

| 扩展                    | 桌面端 | 移动端 | 说明                                                    |
| ----------------------- | ------ | ------ | ------------------------------------------------------- |
| **数学公式** (MathJax)  | ✅     | ✅     | 依赖 `window.MathJax`，需在 Webview 中加载 MathJax CDN  |
| **Mermaid 流程图**      | ✅     | ❌     | 依赖 DOM，移动端显示占位符或源码                        |
| **代码高亮**            | ✅     | ✅     | highlight.js，30+ 常用语言预注册，支持 CDN 动态加载更多 |
| **GFM Alert / Callout** | ✅     | ✅     | `markedAlert` 已支持 Obsidian Callout 语法（20+ 变体）  |
| **脚注引用**            | ✅     | ✅     | `markedFootnotes`，底部汇总显示                         |
| **Ruby 注音**           | ✅     | ✅     | `[文字]{读音}` 和 `[文字]^(读音)` 两种语法              |
| **高亮/下划线/波浪线**  | ✅     | ✅     | `==高亮==` `++下划线++` `~波浪线~`                      |
| **PlantUML**            | ⚠️     | ⚠️     | 需外部服务器渲染，可选                                  |
| **TOC 目录**            | ✅     | ✅     | `[TOC]` 自动生成目录（`markedToc`）                     |
| **图片滑动**            | ✅     | ✅     | `<![](url),![](url)>` 水平滚动图片组（`markedSlider`）  |
| **信息图表**            | ✅     | ❌     | `@antv/infographic`，仅桌面端（`markedInfographic`）    |
| **图片上传**            | ✅     | ✅     | 支持多种图床服务                                        |
| **Obsidian 语法**       | ✅     | ✅     | `[[链接]]` `![[嵌入]]` 转换（需预处理器）               |

### 3.3 主题系统

**五层架构**（基于 `@md/core/theme/themeApplicator.ts` 实际处理顺序）：

```
1. CSS Variables    — generateCSSVariables({ primaryColor, fontFamily, fontSize, ... })
       ↓
2. Base CSS         — baseCSSContent（from @md/shared/configs，全局基础样式）
       ↓
3. Theme CSS        — themeMap[themeName]（from @md/shared/configs，scoped to #output）
       ↓
4. Heading Styles   — generateHeadingStyles()（可选，按级别自定义标题样式）
       ↓
5. Custom CSS       — 用户自定义 CSS（最高优先级）
       ↓
   PostCSS Processing — calc 简化、CSS 变量替换
```

**核心 API 调用**（参考 `apps/vscode/src/extension.ts`）：

```typescript
import { generateCSSVariables } from '@md/core/theme'
import { baseCSSContent, themeMap } from '@md/shared/configs' // ⚠️ 必须用子路径

// 组装完整 CSS
const variables = generateCSSVariables({
  primaryColor: settings.primaryColor,
  fontFamily: settings.fontFamily,
  fontSize: settings.fontSize,
  isUseIndent: settings.isUseIndent,
  isUseJustify: settings.isUseJustify,
})
const themeCSS = themeMap[settings.theme] // 'default' | 'grace' | 'simple'
const completeCss = `${variables}\n\n${baseCSSContent}\n\n${themeCSS}\n\n${customCSS}`
```

**可配置选项**：

1. **预设主题** (3 个内置)

   - `default` - 默认主题
   - `grace` - 优雅主题
   - `simple` - 简洁主题

2. **颜色配置**

   - 主色调 (Primary Color) — 11 个预设色（经典蓝、翡翠绿等，来自 `colorOptions`）

3. **排版选项**

   - 字体族（Sans-serif / Serif / Monospace，来自 `fontFamilyOptions`）
   - 字号（14px - 18px，来自 `fontSizeOptions`）
   - 行高（1.5 - 2.0）
   - 首行缩进（开/关）
   - 两端对齐（开/关）

4. **代码块样式**

   - Mac 风格窗口
   - 显示行号
   - 语言标签

5. **高级自定义**
   - CSS 编辑器（仅桌面端）
   - 支持完整 CSS 语法
   - 实时预览效果

### 3.4 Obsidian 语法处理

**需要转换的语法**：

| Obsidian 语法     | 转换结果               | 处理逻辑                    |
| ----------------- | ---------------------- | --------------------------- |
| `[[笔记名称]]`    | `[笔记名称](相对路径)` | 使用 MetadataCache API 解析 |
| `[[笔记\|别名]]`  | `[别名](相对路径)`     | 提取别名作为显示文本        |
| `![[图片.png]]`   | `![](图片URL)`         | 读取文件并上传/转 base64    |
| `![[笔记]]`       | 展开笔记内容           | 递归读取（限制深度 1 级）   |
| `![[PDF#page=3]]` | 移除或转为链接         | 微信不支持嵌入              |
| `#标签`           | 保持或移除             | 可配置                      |
| `%%注释%%`        | 移除                   | 注释不显示                  |

**实现示例**：

> 注意：`getFirstLinkpathDest` 是同步 API，`resolveWikiLinks` 无需 async。
> `resolveEmbeds` 使用从后往前替换，避免 offset 偏移导致的错误替换。

```typescript
class ObsidianSyntaxPreprocessor {
  constructor(
    private app: App,
    private currentFile: TFile,
    private settings: PluginSettings
  ) {}

  async process(markdown: string): Promise<string> {
    // 1. 处理 Wiki 链接（同步操作）
    markdown = this.resolveWikiLinks(markdown)

    // 2. 处理嵌入（异步：涉及文件读取和图片上传）
    markdown = await this.resolveEmbeds(markdown)

    // 3. 移除注释
    markdown = markdown.replace(/%%.*?%%/gs, '')

    // 4. 处理标签（可选）
    if (this.settings.removeTags) {
      markdown = markdown.replace(/#[\w\u4E00-\u9FFF-]+/g, '')
    }

    return markdown
  }

  // 同步方法：getFirstLinkpathDest 是同步 API
  private resolveWikiLinks(markdown: string): string {
    const linkRegex = /\[\[([^\]|]+)(\|([^\]]+))?\]\]/g

    return markdown.replace(linkRegex, (match, target, _, alias) => {
      const file = this.app.metadataCache
        .getFirstLinkpathDest(target, this.currentFile.path)

      if (!file)
        return alias || target // 链接失效，保持文本

      const displayText = alias || target
      return `[${displayText}](${this.getRelativePath(file)})`
    })
  }

  private async resolveEmbeds(markdown: string): Promise<string> {
    const embedRegex = /!\[\[([^\]]+)\]\]/g
    const matches = [...markdown.matchAll(embedRegex)]

    // 从后往前替换，避免 offset 偏移导致错误替换
    for (const match of matches.reverse()) {
      const target = match[1]
      const file = this.app.metadataCache
        .getFirstLinkpathDest(target, this.currentFile.path)

      if (!file || match.index === undefined)
        continue

      let replacement = ''

      if (file.extension.match(/^(png|jpg|jpeg|gif|svg|webp)$/i)) {
        // 图片：上传并替换 URL
        const url = await this.uploadImage(file)
        replacement = `![](${url})`
      }
      else if (file.extension === 'md') {
        // 笔记：展开内容（限制深度 1 级，不递归处理嵌入）
        const content = await this.app.vault.read(file)
        replacement = content
      }
      else {
        // 其他类型：转为链接
        replacement = `[${file.name}](${this.getRelativePath(file)})`
      }

      // 使用精确位置替换，避免重复内容误替换
      markdown = markdown.slice(0, match.index)
        + replacement
        + markdown.slice(match.index + match[0].length)
    }

    return markdown
  }
}
```

### 3.5 图片上传

**支持的图床服务**（复用 Web 版配置）：

1. **SM.MS** - 免费 5GB
2. **阿里云 OSS**
3. **腾讯云 COS**
4. **七牛云**
5. **GitHub** - 利用仓库存储
6. **自定义服务器** - 支持自部署

**上传流程**：

```typescript
class ImageUploader {
  async processImages(markdown: string): Promise<string> {
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g
    const matches = [...markdown.matchAll(imageRegex)]

    for (const match of matches) {
      const [fullMatch, alt, originalPath] = match

      // 跳过已经是 HTTP 的图片
      if (originalPath.startsWith('http'))
        continue

      // 解析本地路径
      const file = this.resolveImagePath(originalPath)
      if (!file)
        continue

      // 上传图片
      const publicUrl = await this.upload(file)

      // 替换 URL
      markdown = markdown.replace(
        fullMatch,
        `![${alt}](${publicUrl})`
      )
    }

    return markdown
  }

  private async upload(file: TFile): Promise<string> {
    const cacheKey = `upload_${file.path}_${file.stat.mtime}`

    // 检查缓存
    const cached = this.cache.get(cacheKey)
    if (cached)
      return cached

    // 读取文件
    const content = await this.app.vault.readBinary(file)

    // 调用上传服务
    const url = await this.uploadProvider.upload({
      name: file.name,
      data: content,
      type: this.getMimeType(file.extension)
    })

    // 缓存结果
    this.cache.set(cacheKey, url)

    return url
  }
}
```

---

## 4. 实施步骤

### 4.1 项目初始化

**Step 1: 创建插件目录结构**

```bash
# 在项目根目录执行
mkdir -p apps/obsidian/{src/{views,settings,core,utils,types},styles}
```

在 `apps/obsidian/package.json` 创建：

```json
{
  "name": "@md/obsidian",
  "version": "1.0.0",
  "description": "Obsidian plugin for converting Markdown to WeChat format",
  "main": "main.js",
  "scripts": {
    "dev": "cross-env OBSIDIAN_VAULT_PATH=/path/to/your/vault node esbuild.config.mjs",
    "build": "tsc -noEmit && node esbuild.config.mjs production",
    "version": "node version-bump.mjs && git add manifest.json versions.json"
  },
  "keywords": ["obsidian", "wechat", "markdown"],
  "dependencies": {
    "@md/core": "workspace:*",
    "@md/shared": "workspace:*",
    "isomorphic-dompurify": "^2.35.0",
    "juice": "^11.0.3"
  },
  "devDependencies": {
    "builtin-modules": "^4.0.0",
    "cross-env": "^7.0.3",
    "esbuild": "^0.23.1",
    "obsidian": "latest",
    "typescript": "^5.9.0"
  }
}
```

**Step 2: 配置 TypeScript**

`apps/obsidian/tsconfig.json`:

```json
{
  "extends": "../../packages/config/tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "target": "ES2021",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "outDir": "./dist",
    "lib": ["ES2021", "DOM"],
    "types": ["node"],
    "paths": {
      "@md/core/*": ["../../packages/core/src/*"],
      "@md/shared/*": ["../../packages/shared/src/*"]
    }
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules"]
}
```

**Step 3: 配置构建工具**

`apps/obsidian/esbuild.config.mjs`:

```javascript
import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import builtins from 'builtin-modules'
import esbuild from 'esbuild'

const banner = `/*
THIS IS A GENERATED/BUNDLED FILE BY ESBUILD
Repository: https://github.com/doocs/md
*/`

const prod = process.argv[2] === 'production'

// 开发模式：输出到 Obsidian 测试仓库的插件目录
const vaultPath = process.env.OBSIDIAN_VAULT_PATH
const pluginDir = vaultPath
  ? path.join(vaultPath, '.obsidian', 'plugins', 'wechat-publisher')
  : null

// ⚠️ 必需：@md/shared 的主题 CSS 使用 Vite 的 ?raw 后缀导入
// esbuild 不识别 ?raw，需要自定义插件将其解析为普通文件路径
const rawImportPlugin = {
  name: 'raw-import',
  setup(build) {
    build.onResolve({ filter: /\?raw$/ }, (args) => {
      const resolved = path.resolve(args.resolveDir, args.path.replace(/\?raw$/, ''))
      return { path: resolved }
    })
  },
}

// 开发模式下构建完成后自动复制 manifest.json 和 styles.css 到测试仓库
const deployPlugin = {
  name: 'deploy-to-vault',
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length > 0 || !pluginDir)
        return
      await mkdir(pluginDir, { recursive: true })
      const src = path.dirname(new URL(import.meta.url).pathname)
      await copyFile(path.join(src, 'manifest.json'), path.join(pluginDir, 'manifest.json'))
      await copyFile(path.join(src, 'styles', 'styles.css'), path.join(pluginDir, 'styles.css'))
      console.log(`Deployed to ${pluginDir}`)
    })
  },
}

const outfile = prod
  ? 'dist/main.js'
  : pluginDir
    ? path.join(pluginDir, 'main.js')
    : 'main.js'

const plugins = [rawImportPlugin]
if (!prod && pluginDir)
  plugins.push(deployPlugin)

const context = await esbuild.context({
  banner: { js: banner },
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: [
    'obsidian',
    'electron',
    '@codemirror/*',
    ...builtins
  ],
  format: 'cjs',
  target: 'es2021',
  logLevel: 'info',
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  outfile,
  minify: prod,
  plugins,
  define: {
    'process.env.NODE_ENV': JSON.stringify(prod ? 'production' : 'development')
  },
  loader: {
    '.css': 'text', // CSS 文件作为字符串内联（与 VSCode 扩展一致）
    '.txt': 'text'
  }
})

if (prod) {
  await context.rebuild()
  await context.dispose()

  await mkdir('dist', { recursive: true })
  await copyFile('manifest.json', 'dist/manifest.json')
  await copyFile('styles/styles.css', 'dist/styles.css')

  console.log('Build complete!')
}
else {
  await context.watch()
  console.log(`Watching for changes...${pluginDir ? ` (deploying to ${pluginDir})` : ''}`)
}
```

**Step 4: 创建元数据文件**

`apps/obsidian/manifest.json`:

```json
{
  "id": "wechat-publisher",
  "name": "WeChat Publisher",
  "version": "1.0.0",
  "minAppVersion": "1.4.0",
  "description": "将 Markdown 文档转换为微信公众号排版格式，支持自定义主题、数学公式、Mermaid 图表、代码高亮等功能。",
  "author": "Doocs",
  "authorUrl": "https://github.com/doocs/md",
  "fundingUrl": "https://github.com/doocs/md#donate",
  "isDesktopOnly": false
}
```

`apps/obsidian/versions.json`:

```json
{
  "1.0.0": "1.4.0"
}
```

### 4.2 核心功能实现

**Step 5: 插件主入口**

> 核心集成模式参考 `apps/vscode/src/extension.ts`，仅需 4 个 API 调用。

`apps/obsidian/src/main.ts` 关键逻辑：

```typescript
import type { WorkspaceLeaf } from 'obsidian'
import { initRenderer } from '@md/core/renderer'
import { generateCSSVariables } from '@md/core/theme'
import { modifyHtmlContent } from '@md/core/utils'
import { baseCSSContent, themeMap } from '@md/shared/configs' // ⚠️ 必须用子路径，避免拉入 CodeMirror
import { Plugin } from 'obsidian'

const MATHJAX_CDN = 'https://cdn-doocs.oss-cn-shenzhen.aliyuncs.com/npm/mathjax@3/es5/tex-svg.js'

/**
 * 动态加载 MathJax 3 运行时
 * @md/core 的 KaTeX 扩展依赖 window.MathJax.texReset() / tex2svg()
 * Web 端通过 <script> 标签加载，Obsidian 环境需要动态注入
 *
 * ⚠️ 踩坑：Obsidian 环境中 window.MathJax 可能已存在为配置对象（无运行时方法），
 * 不能简单判断 `if (!window.MathJax)` 来决定是否加载，必须检测具体方法是否为 function
 */
async function loadMathJax(): Promise<void> {
  if (typeof (window as any).MathJax?.tex2svg === 'function')
    return

  // 合并已有配置（不覆盖 Obsidian 可能已设置的 MathJax 配置对象）
  const existing = (window as any).MathJax || {}
  ;(window as any).MathJax = {
    ...existing,
    tex: { tags: 'ams', ...existing.tex },
    svg: { fontCache: 'none', ...existing.svg },
  }

  if (!document.getElementById('MathJax-script')) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.id = 'MathJax-script'
      script.src = MATHJAX_CDN
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Failed to load MathJax from CDN'))
      document.head.appendChild(script)
    })
  }

  await (window as any).MathJax?.startup?.promise
}

/** MathJax 加载失败时的降级 stub（公式显示为原始文本） */
function installMathJaxFallback(): void {
  const mj = ((window as any).MathJax ??= {}) as Record<string, any>
  if (typeof mj.texReset !== 'function')
    mj.texReset = () => {}
  if (typeof mj.tex2svg !== 'function') {
    mj.tex2svg = (text: string, options?: { display?: boolean }) => {
      const span = document.createElement('span')
      span.textContent = options?.display ? `$$${text}$$` : `$${text}$`
      const container = document.createElement('div')
      container.appendChild(span)
      return container
    }
  }
}

export default class WeChatPublisherPlugin extends Plugin {
  async onload(): Promise<void> {
    // 优先加载 MathJax 运行时，失败则降级
    try { await loadMathJax() }
    catch (err) {
      console.warn('[WeChat Publisher] MathJax 加载失败，公式将降级显示:', err)
      installMathJaxFallback()
    }

    // ... 注册视图、命令、设置面板
  }

  renderToHtml(markdown: string): { html: string, css: string } {
    const renderer = initRenderer({
      citeStatus: this.settings.citeStatus,
      isMacCodeBlock: this.settings.isMacCodeBlock,
      isShowLineNumber: this.settings.isShowLineNumber,
      legend: this.settings.legend,
    })

    const html = modifyHtmlContent(markdown, renderer)

    const variables = generateCSSVariables({
      primaryColor: this.settings.primaryColor,
      fontFamily: this.settings.fontFamily,
      fontSize: this.settings.fontSize,
      isUseIndent: this.settings.isUseIndent,
      isUseJustify: this.settings.isUseJustify,
    })
    const themeCSS = themeMap[this.settings.theme]
    const css = `${variables}\n${baseCSSContent}\n${themeCSS}\n${this.settings.customCSS}`

    return { html, css }
  }
}
```

完整的实现代码包括：

- 插件主入口 (`main.ts`) — 生命周期管理、命令注册
- 预览视图 (`preview-view.ts`) — Webview 渲染、工具栏
- 语法预处理器 (`preprocessor.ts`) — Wiki 链接、嵌入、注释处理
- 剪贴板处理器 (`clipboard.ts`) — juice CSS 内联 + ClipboardItem API
- 图片上传器 (`image-uploader.ts`) — 多图床支持、缓存
- 设置面板 (`settings-tab.ts`) — 复用 `@md/shared/configs` 选项列表
- 类型定义 (`types/index.ts`)

### 4.3 样式文件

**Step 13: 插件样式**

`apps/obsidian/styles/styles.css` - 包含工具栏样式、预览容器样式、移动端适配等。

---

## 5. 部署方案

### 5.1 本地开发测试

```bash
# 1. 安装依赖
pnpm install

# 2. 开发模式（cross-env 注入测试仓库路径，esbuild watch + 自动部署）
# dev 脚本已在 package.json 中配置 cross-env OBSIDIAN_VAULT_PATH=...
# 构建产物会直接输出到 <vault>/.obsidian/plugins/wechat-publisher/
pnpm --filter @md/obsidian dev

# 3. 在 Obsidian 中启用插件
# Settings → Community plugins → Reload plugins
# 启用 "WeChat Publisher"
```

> **开发模式工作原理**：`cross-env` 注入 `OBSIDIAN_VAULT_PATH` 环境变量，esbuild 的 `deployPlugin` 在每次构建完成后自动将 `main.js`、`manifest.json`、`styles.css` 复制到测试仓库的插件目录，无需手动 deploy 步骤。

**热重载调试**：

- Obsidian 开发者工具：`Cmd+Option+I` (Mac) 或 `Ctrl+Shift+I` (Win/Linux)
- 每次修改代码后按 `Cmd+R` 重载 Obsidian

### 5.2 构建生产版本

```bash
# 构建
pnpm --filter @md/obsidian build

# 打包发布文件（构建产物在 dist/ 目录）
cd apps/obsidian
zip -r wechat-publisher-v1.0.0.zip dist/main.js dist/manifest.json dist/styles.css
```

### 5.3 手动安装（用户）

用户安装步骤：

1. 下载 `wechat-publisher-v1.0.0.zip`
2. 解压到 Obsidian 仓库的插件目录：`<vault>/.obsidian/plugins/wechat-publisher/`
3. 重启 Obsidian
4. Settings → Community plugins → Enable "WeChat Publisher"

### 5.4 官方插件市场发布

**前置要求**：

- GitHub 公开仓库
- 至少 1 个 Release 版本
- README 包含使用说明
- MIT 或类似开源许可证

**首次发布流程**：

```bash
# 1. 创建独立仓库（或使用 Git Subtree）
git remote add obsidian-plugin git@github.com:yourusername/obsidian-wechat-publisher.git

# 2. 推送插件代码
git subtree push --prefix=apps/obsidian obsidian-plugin main

# 3. 创建 Release
git tag 1.0.0
git push obsidian-plugin --tags
```

**提交到官方仓库**：

1. Fork [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases)
2. 编辑 `community-plugins.json` 添加插件信息
3. 提交 Pull Request
4. 等待审核（通常 1-2 周）

### 5.5 CI/CD 自动化

创建 `.github/workflows/release-obsidian.yml` 实现自动化构建和发布。

### 5.6 Beta 测试渠道

使用 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 插件进行测试版分发。

---

## 6. 测试计划

### 6.1 功能测试矩阵

| 功能        | 桌面端 Windows | 桌面端 macOS | 桌面端 Linux | 移动端 iOS | 移动端 Android |
| ----------- | -------------- | ------------ | ------------ | ---------- | -------------- |
| 基础渲染    | ✅             | ✅           | ✅           | ✅         | ✅             |
| 数学公式    | ✅             | ✅           | ✅           | ✅         | ✅             |
| Mermaid     | ✅             | ✅           | ✅           | ⚠️ 降级    | ⚠️ 降级        |
| Infographic | ✅             | ✅           | ✅           | ❌ 禁用    | ❌ 禁用        |
| 代码高亮    | ✅             | ✅           | ✅           | ✅         | ✅             |
| 主题切换    | ✅             | ✅           | ✅           | ✅         | ✅             |
| 剪贴板复制  | ✅             | ✅           | ✅           | ⚠️ 待测    | ⚠️ 待测        |
| 图片上传    | ✅             | ✅           | ✅           | ✅         | ✅             |
| Wiki 链接   | ✅             | ✅           | ✅           | ✅         | ✅             |
| 嵌入解析    | ✅             | ✅           | ✅           | ✅         | ✅             |
| TOC 目录    | ✅             | ✅           | ✅           | ✅         | ✅             |
| 自定义 CSS  | ✅             | ✅           | ✅           | ❌ 禁用    | ❌ 禁用        |

### 6.2 测试用例

创建 `test-cases.md` 测试文档，涵盖所有功能点。

### 6.3 性能测试

- **渲染时间** < 2 秒（5000 行文档）
- **内存占用** < 100MB
- **无明显卡顿**

### 6.4 兼容性测试

测试与 Dataview、Tasks、Kanban 等常见插件的共存。

---

## 7. 附录

### 7.1 关键文件路径速查

```
apps/obsidian/
├── src/
│   ├── main.ts                      # 插件入口（集成 @md/core）
│   ├── views/preview-view.ts        # 预览视图
│   ├── settings/settings-tab.ts     # 设置面板
│   ├── core/
│   │   ├── preprocessor.ts          # 语法预处理
│   │   └── clipboard.ts             # 剪贴板处理
│   ├── utils/
│   │   └── image-uploader.ts        # 图片上传
│   └── types/index.ts               # 类型定义
├── styles/styles.css                # 样式文件
├── manifest.json                    # 插件元数据
├── versions.json                    # 版本兼容
├── esbuild.config.mjs               # 构建配置
└── package.json                     # 依赖管理
```

### 7.2 开发踩坑记录

以下是实际开发过程中遇到的问题及解决方案：

| 问题                                | 现象                                                                 | 根因                                                                                                                                                                                                                                                                                                                    | 解决方案                                                                                                                                                                                                                                                            |
| ----------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@types/obsidian` 安装失败          | `pnpm install` 报包不存在                                            | npm 上没有 `@types/obsidian`，类型定义由 `obsidian` 包自带                                                                                                                                                                                                                                                              | 从 devDependencies 中移除                                                                                                                                                                                                                                           |
| `@types/node` 信任策略冲突          | `ERR_PNPM_TRUST_DOWNGRADE`                                           | 显式声明的版本与 workspace 根配置冲突                                                                                                                                                                                                                                                                                   | 不显式声明，继承 workspace 根配置                                                                                                                                                                                                                                   |
| esbuild 不识别 `?raw` 导入          | 构建报错找不到模块                                                   | `@md/shared` 的主题 CSS 使用 Vite 的 `?raw` 后缀导入，esbuild 不支持                                                                                                                                                                                                                                                    | 自定义 `rawImportPlugin`，用 `path.resolve()` 将 `?raw` 后缀剥离并解析为绝对路径                                                                                                                                                                                    |
| 插件加载失败（CodeMirror）          | Obsidian 控制台报 `require("@codemirror/...")` 错误                  | `import from '@md/shared'` 拉入了整个 shared 包，包含编辑器相关的 CodeMirror 依赖                                                                                                                                                                                                                                       | 改用子路径导入 `@md/shared/configs`，只引入配置相关导出                                                                                                                                                                                                             |
| MathJax `texReset` undefined        | 渲染失败：`Cannot read properties of undefined (reading 'texReset')` | `@md/core` 的 KaTeX 扩展调用 `window.MathJax.texReset()`，Obsidian 环境未加载 MathJax 运行时                                                                                                                                                                                                                            | 在 `onload()` 中动态加载 MathJax CDN 脚本                                                                                                                                                                                                                           |
| MathJax `tex2svg` not a function    | 第一次修复后仍报错：`window.MathJax.tex2svg is not a function`       | `window.MathJax` 在 Obsidian 中已存在为配置对象（无运行时方法），简单的 `if (!window.MathJax)` 判断会跳过加载                                                                                                                                                                                                           | 改为检测具体方法 `typeof mj.tex2svg !== 'function'`，合并已有配置后注入 CDN 脚本，失败时安装降级 stub                                                                                                                                                               |
| Node 内建模块 shim 不能全部为空对象 | 桌面端报错：`util2.inherits is not a function`                       | `reading-time@1.5.0` 的 `index.js` 无条件 `require('./lib/stream')`，`stream.js` 调用 `util.inherits(ReadingTimeStream, Transform)`。将所有 Node 内建模块 shim 为 `module.exports = {}` 导致 `util.inherits` 为 `undefined`。esbuild 对 CJS `require` 无法 tree-shake，即使运行时不使用 stream 功能，模块加载时也会执行 | `nodeShimPlugin` 中对 `util` 和 `stream` 提供最小 polyfill：`util` 需包含 `inherits` 函数实现（原型链继承），`stream` 需导出 `Transform` 构造函数。其余模块仍可用空对象。**约束：新增 Node 内建模块 shim 时，必须检查被 shim 模块的实际调用链，不能一律返回空对象** |
| 移动端插件无法启用                  | 手机端 Obsidian 启用插件时失败，无明确报错                           | 待排查（可能与 Node 内建模块 shim、MathJax CDN 加载超时、或移动端 WebView 环境差异有关）                                                                                                                                                                                                                                | MathJax 加载已加 5s 超时 + 降级 stub；剪贴板已加 `execCommand` 降级；Node shim 已从 external 改为 bundle + polyfill。**仍需移动端实际调试确认根因**                                                                                                                 |
| multipart boundary 格式不匹配       | 图片上传可能在严格服务端失败                                         | `buildMultipart` 中 boundary 变量已含 `----` 前缀，body 中又加 `------`（6 dash），Content-Type 中加 `----`（4 dash），导致声明（8 dash）与实际分隔符（10 dash）不一致。微信 API 容错所以未暴露                                                                                                                         | boundary 变量不含前缀 dash，body 用 `--${boundary}`，Content-Type 声明 `boundary=${boundary}`，严格遵循 RFC 2046                                                                                                                                                    |
| `decodeDataUri` 无法匹配 svg+xml    | SVG base64 图片无法解码，`svg+xml` 分支为死代码                      | 正则 `(\w+)` 不匹配 `+` 字符，`data:image/svg+xml;base64,...` 永远不会被捕获                                                                                                                                                                                                                                            | 正则改为 `([\w+]+)` 以匹配含 `+` 的 MIME 子类型                                                                                                                                                                                                                     |
| multipart Content-Type 值带多余引号 | 技术上不符合 RFC 2046，依赖服务端容错                                | `Content-Type: "application/octet-stream"` 中的引号不应存在                                                                                                                                                                                                                                                             | 移除引号，改为 `Content-Type: application/octet-stream`                                                                                                                                                                                                             |
| 预处理顺序导致 `![[image]]` 失效    | 含空格的图片嵌入 `![[Pasted image xxx.png]]` 无法预览，变成纯文本    | `resolveWikiLinks` 的正则 `/\[\[...\]\]/g` 会匹配 `![[...]]` 内部的 `[[...]]`，将其转为纯文本（如 `!Pasted image xxx.png`），导致后续 `resolveEmbeds` 找不到 `![[...]]` 语法。**这是预处理顺序 bug：wiki 链接处理在嵌入处理之前执行**                                                                                   | `preprocessor.ts` 中将 `resolveEmbeds`（处理 `![[...]]`）移到 `resolveWikiLinks`（处理 `[[...]]`）之前执行。**约束：预处理顺序必须为 ① 移除注释 → ②resolveEmbeds → ③resolveWikiLinks → ④resolveMarkdownImages → ⑤ 处理标签**                                        |
| 图片路径含空格时 marked 不解析      | `![alt](path/Pasted image.png)` 被 marked 当作纯文本，不生成 `<img>` | marked 的图片语法要求 URL 部分不能含未编码的空格。`resolveEmbeds` 输出的 `![name](vault path)` 如果路径含空格，marked 无法解析                                                                                                                                                                                          | `resolveEmbeds` 和 `resolveMarkdownImages` 中使用 `encodeURI(file.path)` 编码路径，空格变为 `%20`；`fixLocalImageSources` 和 `resolveMarkdownImages` 中用 `decodeURIComponent(src)` 解码后再调用 `resolveFile`                                                      |
| DOMPurify 剥离本地图片路径          | `<img src="attachments/image.png">` 经 sanitize 后 src 被移除        | DOMPurify 默认 `ALLOWED_URI_REGEXP` 只允许 `http/https/data` 等协议开头的 URI，vault 相对路径（无协议前缀）不匹配白名单，src 属性被整个剥离                                                                                                                                                                             | `markdownHelpers.ts` 的 `sanitizeHtml` 中扩展 `ALLOWED_URI_REGEXP`，添加对相对路径的支持（同时仍拦截 `javascript:` 等危险协议）                                                                                                                                     |
| Obsidian API 内部崩溃               | `Cannot read properties of null (reading 'extension')`               | `getFirstLinkpathDest()` 在 metadata cache 未完全就绪或文件名含空格时，内部访问 `.extension` 属性的对象可能为 null，抛出异常。**错误不在插件代码中，而在 Obsidian API 内部**                                                                                                                                            | `resolve-file.ts` 中用 try/catch 包裹整个解析逻辑（`resolveFileInner`），catch 中降级到 `vault.getFiles()` 全局文件名搜索                                                                                                                                           |
| 附件文件夹路径解析不完整            | `attachmentFolderPath: "attachments"` 时找不到同级目录下的附件       | 源文件在 `02-创作中/article.md`，附件在 `attachments/image.png`（同级目录），但 `resolveFile` 第 3 级只尝试了 vault 根目录和当前文件目录下的附件文件夹，未向上级目录查找                                                                                                                                                | `resolve-file.ts` 固定附件文件夹分支增加逐级向上查找父目录逻辑；新增第 4 级兜底：按文件名全局搜索 `vault.getFiles()`                                                                                                                                                |
| 图片嵌入转 base64 导致渲染问题      | 大图片的 base64 data URI 可能被 DOMPurify 剥离或导致性能问题         | `resolveEmbeds` 将图片读取为 base64 内嵌到 markdown 中，大图片产生巨大字符串，且与 `resolveMarkdownImages`（仅规范化路径）的设计不一致                                                                                                                                                                                  | `resolveEmbeds` 图片分支改为输出 vault 路径 `![name](encodeURI(path))`，与 `resolveMarkdownImages` 保持一致。预览由 `fixLocalImageSources` 转为 resource URL，推送由 `replaceImages` 从 vault 读取上传                                                              |

### 7.3 待优化项（已记录，按优先级排列）

| 优先级 | 问题                                           | 文件                                  | 状态                                                         |
| ------ | ---------------------------------------------- | ------------------------------------- | ------------------------------------------------------------ |
| 中     | 预览更新无 debounce，存在竞态                  | `preview-view.ts`                     | ✅ 已修复：300ms debounce + renderVersion 竞态守卫           |
| 中     | 图片上传串行执行                               | `wechat-publisher.ts` `replaceImages` | ✅ 已修复：并发下载 + 分批上传（并发数 5）                   |
| 中     | `publishToAll` 串行推送                        | `wechat-publisher.ts`                 | ✅ 已修复：`Promise.allSettled` 并行推送                     |
| 中     | `html.split(src).join(cdnUrl)` 全局替换        | `wechat-publisher.ts`                 | ✅ 已修复：从后往前精确位置替换 `<img>` 标签内的 src         |
| 低     | `copyCurrentFile` 通过 DOM 查询点击按钮        | `main.ts`                             | ✅ 已修复：`handleCopy()` 改为 public，直接调用              |
| 低     | 设置面板文本输入每次按键都 `saveSettings()`    | `settings-tab.ts`                     | ✅ 已修复：`debouncedSave` 延迟 500ms，`hide()` 时立即 flush |
| 低     | token 缓存在 `onunload` 时未清理               | `wechat-api.ts:29`                    | ✅ 已修复：`onunload()` 中调用 `clearTokenCache()`           |
| 低     | `extractFirstImage` 含 Markdown 语法匹配死代码 | `wechat-publisher.ts`                 | ✅ 已修复：移除 Markdown 分支，仅匹配 `<img>` 标签           |
| 低     | 硬编码 Jina API Key                            | `url-importer.ts:6`                   | 暂不修改：项目公共共享的默认 key，用户可在设置中覆盖         |

### 7.4 常见问题 FAQ

**Q: 为什么不需要单独的 renderer.ts 包装类？**
A: `@md/core` 已提供完整的 API（`initRenderer` + `modifyHtmlContent` + `generateCSSVariables`），VSCode 扩展验证了直接调用即可，无需额外封装层。

**Q: 为什么选择独立视图而不是替换原生渲染？**
A: 避免与其他插件冲突，保持 Obsidian 原生体验，用户可自由选择使用。

**Q: 移动端为什么禁用 Mermaid？**
A: Mermaid 渲染需要较多 DOM 操作，移动端性能有限，显示占位符或源码。

**Q: 图片上传失败怎么办？**
A: 检查网络连接、API Token 配置，或切换到 base64 内嵌模式（不推荐）。

**Q: 如何处理循环嵌入？**
A: 限制嵌入展开深度为 1 级，避免无限递归。

**Q: 自定义 CSS 不生效？**
A: 确保 CSS 语法正确，使用开发者工具查看样式优先级。

### 7.4 参考资源

- [Obsidian 插件开发文档](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
- [Obsidian API 参考](https://github.com/obsidianmd/obsidian-api)
- [现有项目文档](./CLAUDE.md)
- [VSCode 扩展实现](apps/vscode/src/extension.ts) — 最小化集成模式参考
- [核心渲染器](packages/core/src/renderer/renderer-impl.ts) — `initRenderer()` API
- [核心工具函数](packages/core/src/utils/markdownHelpers.ts) — `modifyHtmlContent()` / `renderMarkdown()`
- [主题系统](packages/core/src/theme/) — `generateCSSVariables()` / `applyTheme()`
- [扩展系统](packages/core/src/extensions/) — 10 个 marked 扩展
- [共享配置](packages/shared/src/configs/) — 选项列表、主题 CSS、样式常量
- [Web 版渲染逻辑](apps/web/src/stores/render.ts) — 完整渲染管线参考

---

## 总结

将微信公众号排版功能做成 Obsidian 插件**完全可行**：

- 核心渲染通过 `initRenderer()` + `modifyHtmlContent()` + `generateCSSVariables()` 三个 API 集成
- `markedAlert` 已原生支持 Obsidian Callout 语法，预处理器仅需处理 Wiki 链接、嵌入和注释
- Obsidian 基于 Electron，所有浏览器端扩展（Mermaid、MathJax 等）桌面端可直接运行

**立即开始？**运行以下命令创建项目结构：

```bash
mkdir -p apps/obsidian/{src/{views,settings,core,utils,types},styles}
cd apps/obsidian
pnpm init
```
