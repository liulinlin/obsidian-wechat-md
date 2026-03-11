import type { App, TFile } from 'obsidian'
import type { PluginSettings, WxAccount } from '../types'
import { requestUrl } from 'obsidian'
import { resolveFile } from '../utils/resolve-file'
import { inlineCSS } from './clipboard'
import {
  wxAddDraft,
  wxBatchGetMaterial,
  wxGetToken,
  wxUploadCover,
  wxUploadImage,
} from './wechat-api'

/**
 * 通用 HTTP GET 请求，自动携带微信所需的 Referer 和 User-Agent
 */
async function fetchWithWxHeaders(url: string) {
  return requestUrl({
    url,
    method: 'GET',
    headers: {
      'Referer': 'https://mp.weixin.qq.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  })
}

/**
 * 下载远程图片并返回 ArrayBuffer + 文件名，失败时返回 null
 */
async function fetchRemoteImage(url: string, prefix = 'image', defaultExt = 'jpg'): Promise<{ data: ArrayBuffer, filename: string } | null> {
  try {
    const res = await fetchWithWxHeaders(url)
    const urlObj = new URL(url)
    let ext = urlObj.searchParams.get('format') || urlObj.pathname.split('.').pop() || defaultExt
    if (ext.includes('/'))
      ext = defaultExt
    return { data: res.arrayBuffer, filename: `${prefix}.${ext}` }
  }
  catch {
    return null
  }
}

interface PublishResult {
  mediaId: string
}

export interface AccountPublishResult {
  account: WxAccount
  success: boolean
  mediaId?: string
  error?: string
}

/**
 * 从 frontmatter 读取文章元数据
 */
function getFrontmatter(app: App, file: TFile): Record<string, any> {
  const cache = app.metadataCache.getFileCache(file)
  return cache?.frontmatter || {}
}

/**
 * 将 base64 data URI 解码为 ArrayBuffer + 文件名
 */
function decodeDataUri(dataUri: string): { data: ArrayBuffer, ext: string } | null {
  const match = dataUri.match(/^data:image\/([\w+]+);base64,(.+)$/)
  if (!match)
    return null

  const ext = match[1] === 'svg+xml' ? 'svg' : match[1]
  const binary = atob(match[2])
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return { data: bytes.buffer, ext }
}

/**
 * 从 HTML 内容中提取第一个 <img> 的 src
 */
function extractFirstImage(html: string): string | null {
  const match = html.match(/<img\s[^>]*src="([^"]+)"/)
  return match ? match[1] : null
}

/**
 * 将图片 src 转为 ArrayBuffer + 文件名，支持 data URI、HTTP(S) URL 和本地 vault 文件路径
 */
async function fetchImageAsBuffer(
  src: string,
  app?: App,
  currentFile?: TFile,
): Promise<{ data: ArrayBuffer, filename: string } | null> {
  if (src.startsWith('data:image')) {
    const decoded = decodeDataUri(src)
    if (!decoded)
      return null
    return { data: decoded.data, filename: `cover.${decoded.ext}` }
  }

  if (src.startsWith('http://') || src.startsWith('https://')) {
    return fetchRemoteImage(src, 'cover')
  }

  // 本地文件路径（多级回退：链接解析 → 精确路径 → 附件文件夹）
  if (app && currentFile) {
    const file = resolveFile(app, src, currentFile)
    if (file) {
      const data = await app.vault.readBinary(file)
      return { data, filename: file.name }
    }
  }

  return null
}

/**
 * 推送编排器：将渲染好的 HTML 推送到指定公众号的草稿箱
 */
export async function publish(
  app: App,
  settings: PluginSettings,
  html: string,
  css: string,
  title: string,
  file: TFile,
  account: WxAccount,
): Promise<PublishResult> {
  const { wxProxyUrl } = settings
  const { appId, appSecret } = account

  if (!wxProxyUrl || !appId || !appSecret) {
    throw new Error('推送参数不完整，请检查代理地址和账号配置')
  }

  // 1. 获取 access_token
  const token = await wxGetToken(wxProxyUrl, appId, appSecret)
  // console.log(html)
  // 2. CSS 内联
  let content = inlineCSS(html, css)

  // 3. 处理封面图
  const fm = getFrontmatter(app, file)
  let thumbMediaId = ''

  if (fm.cover) {
    console.log('[WeChat Publisher] frontmatter 中指定了封面:', fm.cover)
    // frontmatter 指定了封面 → 上传为永久素材
    const coverData = await fetchCoverImage(app, file, fm.cover)
    console.log('[WeChat Publisher] 获取封面数据:', coverData ? '成功' : '失败')
    if (coverData) {
      thumbMediaId = await wxUploadCover(wxProxyUrl, token, coverData.data, coverData.filename)
    }
  }

  if (!thumbMediaId) {
    // 尝试从文章内容提取第一张图片作为封面
    const firstImgSrc = extractFirstImage(content)
    if (firstImgSrc) {
      // console.log('尝试使用文章中的第一张图片作为封面:', firstImgSrc)
      const imgBuffer = await fetchImageAsBuffer(firstImgSrc, app, file)
      if (imgBuffer) {
        try {
          thumbMediaId = await wxUploadCover(wxProxyUrl, token, imgBuffer.data, imgBuffer.filename)
        }
        catch {
          // 上传失败，降级到素材库
        }
      }
    }
  }

  if (!thumbMediaId) {
    // 尝试从素材库取第一个图片素材
    thumbMediaId = await wxBatchGetMaterial(wxProxyUrl, token) || ''
  }

  // if (!thumbMediaId) {
  //   throw new Error('未找到封面图。请在 frontmatter 中设置 cover 字段，或在公众号后台上传至少一张图片素材。')
  // }

  // 4. 上传图片并替换 URL（含本地 vault 图片）
  content = await replaceImages(wxProxyUrl, token, content, app, file)

  // 5. 组装文章
  const articleTitle = fm.title || title
  const author = fm.author || settings.wxDefaultAuthor || ''
  const digest = fm.digest || ''
  const need_open_comment =  1

  // 6. 创建草稿
  // 文档地址：https://developers.weixin.qq.com/doc/subscription/api/draftbox/draftmanage/api_draft_add.html#%E8%AF%B7%E6%B1%82%E4%BD%93-Request-Payload
  const mediaId = await wxAddDraft(wxProxyUrl, token, {
    title: articleTitle,
    content,
    thumb_media_id: thumbMediaId,
    author,
    digest,
    need_open_comment,
  })

  return { mediaId }
}

/**
 * 提取并上传 HTML 中所有 <img> 的图片，替换为微信 CDN URL
 * 并发下载和上传（最多 5 个并行），使用精确位置替换避免误替换
 */
async function replaceImages(proxyUrl: string, token: string, html: string, app: App, sourceFile: TFile): Promise<string> {
  const imgRegex = /<img\s[^>]*src="([^"]+)"[^>]*>/g
  const matches = [...html.matchAll(imgRegex)]

  // 阶段 1：并发准备所有图片数据
  interface ImageTask {
    src: string
    fullMatch: string
    imageData: ArrayBuffer
    filename: string
  }

  const prepareTask = async (match: RegExpExecArray): Promise<ImageTask | null> => {
    const src = match[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')

    if (src.startsWith('data:image')) {
      const decoded = decodeDataUri(src)
      if (!decoded)
        return null
      return { src, fullMatch: match[0], imageData: decoded.data, filename: `image.${decoded.ext}` }
    }

    if (src.startsWith('http://') || src.startsWith('https://')) {
      if (src.includes('mmbiz.qpic.cn'))
        return null
      const result = await fetchRemoteImage(src, 'image', 'png')
      if (!result)
        return null
      return { src, fullMatch: match[0], imageData: result.data, filename: result.filename }
    }

    // 本地 vault 文件路径（如 attachments/IMG_8371.jpeg）
    const localFile = resolveFile(app, src, sourceFile)
    if (localFile) {
      const data = await app.vault.readBinary(localFile)
      return { src, fullMatch: match[0], imageData: data, filename: localFile.name }
    }

    console.warn('[WeChat Publisher] 无法解析图片路径:', src)
    return null
  }

  const tasks = (await Promise.all(matches.map(m => prepareTask(m)))).filter((t): t is ImageTask => t !== null)

  // console.log(`[WeChat Publisher] 找到 ${matches.length} 个图片，准备上传 ${tasks.length} 个`)

  // 阶段 2：串行上传（避免微信 API 并发限制）
  const urlMap = new Map<string, string>()

  for (const task of tasks) {
    try {
      console.log(`[WeChat Publisher] 上传图片: ${task.filename}`)
      const cdnUrl = await wxUploadImage(proxyUrl, token, task.imageData, task.filename)
      console.log(`[WeChat Publisher] 上传成功: ${cdnUrl}`)
      urlMap.set(task.src, cdnUrl)
    }
    catch (error) {
      console.warn('[WeChat Publisher] Image upload failed:', error)
    }
  }

  // 阶段 3：从后往前精确替换 <img> 标签中的 src，避免误替换其他位置
  for (const match of [...matches].reverse()) {
    const src = match[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
    const cdnUrl = urlMap.get(src)
    if (!cdnUrl || match.index === undefined)
      continue
    const newTag = match[0].replace(match[1], cdnUrl)
    html = html.slice(0, match.index) + newTag + html.slice(match.index + match[0].length)
  }

  // console.log('[WeChat Publisher] 替换后的 HTML (前500字符):', html.slice(0, 500))

  return html
}

/**
 * 获取封面图数据
 */
async function fetchCoverImage(
  app: App,
  currentFile: TFile,
  cover: string,
): Promise<{ data: ArrayBuffer, filename: string } | null> {
  // 剥离 Obsidian wiki-link 语法，如 [[image.jpg]] 或 [[image.jpg|别名]]
  cover = cover.replace(/^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/, '$1').trim()

  if (cover.startsWith('http://') || cover.startsWith('https://')) {
    return fetchRemoteImage(cover, 'cover')
  }

  // 本地文件路径（多级回退：链接解析 → 精确路径 → 附件文件夹）
  const file = resolveFile(app, cover, currentFile)
  console.log('[WeChat Publisher] 尝试解析封面路径:', cover, '解析结果:', file?.path)
  if (file) {
    const data = await app.vault.readBinary(file)
    return { data, filename: file.name }
  }

  return null
}

/**
 * 批量推送到所有已启用的公众号账号（并行执行）
 */
export async function publishToAll(
  app: App,
  settings: PluginSettings,
  html: string,
  css: string,
  title: string,
  file: TFile,
  accounts?: WxAccount[],
): Promise<AccountPublishResult[]> {
  const enabledAccounts = accounts ?? settings.wxAccounts.filter(a => a.enabled && a.appId && a.appSecret)

  if (enabledAccounts.length === 0) {
    throw new Error('没有已启用且配置完整的公众号账号，请先在设置中添加')
  }

  const results = await Promise.allSettled(
    enabledAccounts.map(account => publish(app, settings, html, css, title, file, account)),
  )

  return enabledAccounts.map((account, i) => {
    const result = results[i]
    if (result.status === 'fulfilled') {
      return { account, success: true, mediaId: result.value.mediaId }
    }
    const msg = result.reason instanceof Error ? result.reason.message : String(result.reason)
    return { account, success: false, error: msg }
  })
}
