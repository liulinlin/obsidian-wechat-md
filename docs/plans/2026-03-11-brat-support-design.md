# BRAT 支持 - 版本管理脚本设计

> 日期：2026-03-11
> 范围：仅版本管理脚本（不含 CI 工作流）

## 背景

BRAT（Beta Reviewers Auto-update Tool）是 Obsidian 的 Beta 插件分发工具。
BRAT v1.1.0+ 直接读取 GitHub Release 资产中的 `manifest.json`，要求 Release tag、Release name、`manifest.json` 中的 `version` 字段三者完全一致。

## 目标

提供 `version-bump.mjs` 脚本，一条命令同步所有版本号，确保 BRAT 能正确识别和安装插件。

## 方案

### 脚本：`version-bump.mjs`

**用法：**
```bash
node version-bump.mjs 1.0.1-beta.0
```

**行为：**
1. 读取当前 `manifest.json` 的 `minAppVersion`
2. 更新 `manifest.json` 的 `version` 字段
3. 更新 `versions.json`，新增 `"<version>": "<minAppVersion>"` 条目
4. 更新 `package.json` 的 `version` 字段

### 配套 npm script

```json
"version": "node version-bump.mjs && git add manifest.json versions.json package.json"
```

支持通过 `npm version 1.0.1-beta.0` 触发，自动 stage 相关文件。

## 文件变更清单

| 文件 | 变更 |
|------|------|
| `version-bump.mjs` | 新增 |
| `package.json` | 新增 `"version"` script |
