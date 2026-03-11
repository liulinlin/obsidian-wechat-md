import type { App, TFile } from 'obsidian'

/**
 * 多级回退解析文件路径，兼容 Obsidian 附件文件夹配置
 *
 * 解析顺序：
 * 1. metadataCache 链接解析（标准 wiki-link 解析）
 * 2. vault 精确路径查找
 * 3. 附件文件夹下查找（支持固定路径和 ./ 相对路径）
 */
export function resolveFile(app: App, nameOrPath: string, sourceFile: TFile): TFile | null {
  if (!nameOrPath)
    return null

  try {
    return resolveFileInner(app, nameOrPath, sourceFile)
  }
  catch {
    // Obsidian API（如 getFirstLinkpathDest）在 metadata cache 未就绪
    // 或文件名含空格等情况下可能内部抛出异常，降级到全局搜索
    const fileName = nameOrPath.split('/').pop() || nameOrPath
    const found = app.vault.getFiles().find(f => f.name === fileName)
    return found ?? null
  }
}

function resolveFileInner(app: App, nameOrPath: string, sourceFile: TFile): TFile | null {
  // 第 1 级：标准链接解析
  const linked = app.metadataCache.getFirstLinkpathDest(nameOrPath, sourceFile.path)
  if (linked)
    return linked

  // 第 2 级：按精确 vault 路径查找
  const byPath = app.vault.getFileByPath(nameOrPath)
  if (byPath)
    return byPath

  // 第 3 级：在附件文件夹下查找
  const attachmentFolder = (app.vault as any).config?.attachmentFolderPath as string | undefined
  if (attachmentFolder) {
    const sourceDir = sourceFile.path.substring(0, sourceFile.path.lastIndexOf('/'))

    if (attachmentFolder.startsWith('./')) {
      // 相对于当前文件所在目录
      const relative = attachmentFolder.slice(2)
      const folderPath = sourceDir ? `${sourceDir}/${relative}` : relative
      const fullPath = folderPath ? `${folderPath}/${nameOrPath}` : nameOrPath
      const inAttachments = app.vault.getFileByPath(fullPath)
      if (inAttachments)
        return inAttachments
    }
    else {
      // 固定文件夹路径：先尝试 vault 根目录下的固定路径
      const rootPath = `${attachmentFolder}/${nameOrPath}`
      const inRoot = app.vault.getFileByPath(rootPath)
      if (inRoot)
        return inRoot

      // 再尝试当前文件所在目录下的同名文件夹
      if (sourceDir) {
        const relativePath = `${sourceDir}/${attachmentFolder}/${nameOrPath}`
        const inRelative = app.vault.getFileByPath(relativePath)
        if (inRelative)
          return inRelative
      }

      // 逐级向上查找父目录下的附件文件夹
      let dir = sourceDir
      while (dir.includes('/')) {
        dir = dir.substring(0, dir.lastIndexOf('/'))
        const parentPath = dir
          ? `${dir}/${attachmentFolder}/${nameOrPath}`
          : `${attachmentFolder}/${nameOrPath}`
        const inParent = app.vault.getFileByPath(parentPath)
        if (inParent)
          return inParent
      }
    }
  }

  // 第 4 级：按文件名全局搜索（metadata cache 未就绪时的兜底）
  const fileName = nameOrPath.split('/').pop() || nameOrPath
  const allFiles = app.vault.getFiles()
  const found = allFiles.find(f => f.name === fileName)
  if (found)
    return found

  return null
}
