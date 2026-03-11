# iOS 移动端功能限制分析

> 文档版本：v1.0
> 分析日期：2026-03-11
> 基于代码版本：当前 main 分支

---

## 概述

该项目 `manifest.json` 中设置了 `"isDesktopOnly": false`（声称支持移动端），但实际代码存在大量隐藏的移动端限制。整体情况：

- ✅ **仅 1 处明确移动端检查**（`preview-view.ts` 中的 MD 复制按钮）
- ❌ **6 类核心功能在移动端完全不可用**
- ⚠️ **2 类功能不稳定**
- 🐛gg **1 处代码缺陷**（Infographic 文档说禁用但代码未实现）

---

## 一、完全不可用的功能 🔴

### 1. Mermaid 流程图

**文件**：`src/packages/core/extensions/mermaid.ts`

**根因**：`mermaid` 在 `esbuild.config.mjs` 中被标记为 `external`（不打包），需运行时全局对象 `window.mermaid`。Obsidian 移动端不提供该全局对象，动态导入的备选路径也因 external 标记在构建时被剔除。

```typescript
// mermaid.ts L31-44
if ((window as any).mermaid) {
  // 桌面端：使用全局对象
} else {
  import('mermaid')  // ← external，移动端不可用
    .catch(handleError)
}
```

**现象**：Mermaid 图表区域显示错误或空白，无任何降级方案。

**代码状态**：无 `Platform.isMobile` 检查。

---

### 2. 信息图表（Infographic）🐛

**文件**：`src/packages/core/extensions/infographic.ts`

**根因**：`@antv/infographic` 同样是 `external`，移动端无法加载。

**代码缺陷**：CLAUDE.md 文档明确标注「移动端禁用」，但代码中**没有 `Platform.isMobile` 检查**：

```typescript
// infographic.ts L13-88
async function renderInfographic(...) {
  if (typeof window === 'undefined') return
  // ❌ 缺少：if (Platform.isMobile) return

  try {
    const { Infographic, ... } = await import('@antv/infographic')
    // ...
  } catch (error) {
    // 向用户显示红色错误框
    console.error('Failed to render Infographic:', error)
  }
}
```

**现象**：移动端用户会看到红色错误提示框，体验极差。

---

### 3. 微信推送

**文件**：`src/core/wechat-publisher.ts`、`src/views/preview-view.ts`

**根因**：整个推送链路使用 Obsidian 的 `requestUrl` API 发送 HTTP 请求，移动端 WebView 存在 CORS 限制导致失败。

```typescript
// wechat-publisher.ts
const token = await wxGetToken(wxProxyUrl, appId, appSecret)
thumbMediaId = await wxUploadCover(wxProxyUrl, token, coverData.data, ...)
content = await replaceImages(wxProxyUrl, token, content, app, file)
const mediaId = await wxAddDraft(wxProxyUrl, token, { ... })
```

**其他问题**：
- 无超时配置（可能无限等待）
- 无重试机制
- 推送按钮在移动端仍然可见，无任何提示

**现象**：点击推送后请求失败，无有效错误提示。

---

### 4. AI 润色

**文件**：`src/core/ai-polish.ts`、`src/views/preview-view.ts`

**根因**：同样使用 `requestUrl` 调用 LLM API，移动端 CORS 限制。

```typescript
// ai-polish.ts L40-44
const response = await requestUrl({
  url: `${aiEndpoint.replace(/\/+$/, '')}/chat/completions`,
  method: 'POST',
  headers,
  body,
})
```

**其他问题**：无超时设置，无网络错误处理，润色按钮在移动端仍可见。

---

### 5. URL 导入（Jina Reader / Anything-MD）

**文件**：`src/core/url-importer.ts`

**根因**：同样使用 `requestUrl`，移动端 CORS 限制。

```typescript
// url-importer.ts
// Anything-MD
const res = await requestUrl({ url: apiUrl, method: 'POST', ... })

// Jina Reader
const res = await requestUrl({ url: `${JINA_READER_API}${url}`, ... })
```

**现象**：命令面板中"从 URL 导入 Markdown"命令仍可触发，但执行失败。

---

### 6. 富文本复制（核心功能）

**文件**：`src/core/clipboard.ts`

这是移动端**最关键的限制**，直接影响插件的核心使用场景。

```
优先方案：ClipboardItem API（L20-30）
  → iOS Safari 不支持 text/html 类型 ❌
  → 抛出异常，降级执行

降级方案：execCommand('copy')（L32-55）
  → 只能复制纯文本，CSS 样式全部丢失
  → 粘贴到微信编辑器后排版完全失效 ❌
```

代码中唯一的移动端专属处理（`preview-view.ts` L58）是额外显示"MD 复制"纯文本按钮，侧面印证了富文本复制在移动端有问题：

```typescript
// preview-view.ts L58-61
if (Platform.isMobile) {
  const copyMdBtn = toolbar.createEl('button', { text: 'MD复制' })
  copyMdBtn.addEventListener('click', () => this.handleCopyMarkdown())
}
```

**现象**：复制后粘贴到微信编辑器，排版样式完全丢失，与预览效果不符。

---

## 二、功能不稳定 🟠

### 7. MathJax 数学公式

**文件**：`src/main.ts`

**根因**：依赖国内阿里云 CDN，5 秒超时在移动端弱网下极易触发，且无重试机制。

```typescript
// main.ts
const MATHJAX_CDN = 'https://cdn-doocs.oss-cn-shenzhen.aliyuncs.com/npm/mathjax@3/es5/tex-svg.js'

await Promise.race([
  loadScript(MATHJAX_CDN),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('MathJax load timeout (5s)')), 5000)
  ),
])
```

**降级行为**：超时后公式显示为原始 LaTeX 代码（如 `$$E=mc^2$$`），而非渲染效果。

**影响**：移动端网络不稳定，公式超时概率估计 30–50%。

---

### 8. PlantUML 图表

**文件**：`src/packages/core/extensions/plantuml.ts`

**根因**：使用原生 `fetch`（非 Obsidian `requestUrl`）请求 plantuml.com，在移动端 WebView 中可能因 CORS 限制或网络问题失败。

```typescript
// plantuml.ts L204-224
const response = await fetch(svgUrl)  // 原生 fetch，非 requestUrl
```

**降级行为**：显示「PlantUML 图表加载失败」文本。

---

## 三、存在风险的功能 🟡

### 9. 大图片嵌入（内存问题）

**文件**：`src/core/preprocessor.ts`

```typescript
private async fileToBase64(file: TFile): Promise<string> {
  // 无文件大小限制
  const buffer = await this.app.vault.readBinary(file)
  const base64 = this.arrayBufferToBase64(buffer)
  return `data:${mimeType};base64,${base64}`
}
```

**风险**：多张大图片同时转 base64，移动端内存（通常比桌面端紧张）可能溢出，导致 Obsidian 崩溃。

### 10. 文件路径解析 Level-4 兜底

**文件**：`src/utils/resolve-file.ts`

```typescript
// 第 4 级兜底
const allFiles = app.vault.getFiles()  // 返回全部文件列表
const found = allFiles.find(f => f.name === fileName)
```

**风险**：大型 vault（数万文件）下，在移动端此操作可能阻塞 UI 线程。

---

## 四、正常工作的功能 ✅

| 功能 | 说明 |
|------|------|
| Markdown 基础渲染 | 正常 |
| 代码语法高亮 | highlight.js 已打包，正常 |
| GFM Alert / Obsidian Callout | 正常 |
| 脚注渲染 | 正常 |
| Ruby 注音 | 正常 |
| 高亮 / 下划线 / 波浪线 | 正常 |
| TOC 目录生成 | 正常 |
| 图片滑动组 | 正常 |
| 预览面板显示 | 正常 |
| 复制 Markdown 纯文本 | 正常（移动端专属"MD 复制"按钮）|

---

## 五、功能兼容性总览

| 功能 | iOS 状态 | 风险等级 | 根因摘要 |
|------|---------|---------|---------|
| 富文本复制（粘贴到微信） | ❌ 不可用 | 🔴 严重 | ClipboardItem 不支持 text/html |
| Mermaid 流程图 | ❌ 不可用 | 🔴 严重 | external 包，无全局对象 |
| Infographic（代码缺陷） | ❌ 不可用 | 🔴 严重 | external 包 + 缺少平台检查 |
| 微信推送 | ❌ 不可用 | 🔴 严重 | requestUrl CORS 限制 |
| AI 润色 | ❌ 不可用 | 🔴 严重 | requestUrl CORS 限制 |
| URL 导入 | ❌ 不可用 | 🔴 严重 | requestUrl CORS 限制 |
| MathJax 数学公式 | ⚠️ 不稳定 | 🟠 高 | CDN 超时，降级为纯文本 |
| PlantUML 图表 | ⚠️ 不稳定 | 🟠 高 | CORS + 网络限制 |
| 大图片嵌入 | ⚠️ 有风险 | 🟡 中 | 无大小限制，可能 OOM |
| 复制 Markdown 纯文本 | ✅ 正常 | 🟢 低 | 有专属按钮 |
| 基础渲染（代码、Callout 等）| ✅ 正常 | 🟢 低 | 均已打包 |

---

## 六、修复建议

### P0 — 立即修复（代码缺陷）

**`infographic.ts` 补充平台检查**：

```typescript
// src/packages/core/extensions/infographic.ts
import { Platform } from 'obsidian'

async function renderInfographic(...) {
  if (typeof window === 'undefined') return
  if (Platform.isMobile) return  // ← 补充此行
  // ...
}
```

### P1 — 短期改进（体验问题）

1. **隐藏移动端不可用的按钮**：推送、润色按钮在 `Platform.isMobile` 时隐藏或显示 tooltip 提示「仅桌面端支持」
2. **命令注册加平台过滤**：`push-wechat`、`import-from-url` 等命令在移动端不注册或提示不支持
3. **MathJax 超时优化**：增加重试机制，或在超时时给出明确提示

### P2 — 长期规划

1. **考虑改为 `"isDesktopOnly": true`**：当前移动端核心功能（富文本复制）无法使用，对用户有误导
2. **剪贴板方案研究**：研究 iOS Obsidian 插件的富文本剪贴板实现方案
3. **图片大小限制**：`fileToBase64` 添加文件大小上限（如 5MB），超出时提示用户

---

*最后更新：2026-03-11*
