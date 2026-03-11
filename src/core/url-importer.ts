import type { PluginSettings } from '../types'
import { requestUrl } from 'obsidian'

const DEFAULT_ANYTHING_MD_API = 'https://anything-md.doocs.org/'
// const JINA_READER_API = 'https://r.jina.ai/'
const JINA_READER_API = 'https://jina.codeby.cc/'
const DEFAULT_JINA_KEY = 'jina_b2a6bdbd297f4fc2bc890ace1e9dc896eFSHApz4Zu4M_uF5dYQeqFVEkNd-'

export async function fetchViaAnythingMd(url: string, settings: PluginSettings): Promise<string> {
  const apiUrl = settings.anythingMdApi.trim() || DEFAULT_ANYTHING_MD_API

  const res = await requestUrl({
    url: apiUrl,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })

  if (res.status !== 200)
    throw new Error(`请求失败: ${res.status}`)

  const data = res.json
  if (!data.success)
    throw new Error(data.error || '转换失败')

  const markdown = data.markdown?.trim()
  if (!markdown)
    throw new Error('转换结果为空')

  return markdown
}

export async function fetchViaJina(url: string, settings: PluginSettings): Promise<string> {
  const apiKey = settings.jinaApiKey.trim() || DEFAULT_JINA_KEY

  const res = await requestUrl({
    url: `${JINA_READER_API}${url}`,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'X-Md-Em-Delimiter': settings.jinaEmDelimiter,
      'X-Engine': settings.jinaEngine,
      'X-Md-Heading-Style': settings.jinaHeadingStyle,
      'Origin': '', // 尝试覆盖
      'Sec-Fetch-Site': '', // 尝试清除},
    },
  })

  if (res.status !== 200)
    throw new Error(`请求失败: ${res.status}`)

  let content = res.text
  if (!content.trim())
    throw new Error('该链接返回的内容为空')

  // 清理嵌套图片链接 [![alt](img)](link) → ![alt](img)
  content = content.replace(/\[!\[(.*?)\]\((.*?)\)\]\(.*?\)/g, '![$1]($2)')
  return content
}

/** 从 Markdown 内容中提取第一个 H1 标题作为文件名 */
export function extractTitle(content: string): string {
  // 1. 限定空白字符数量（1-100），将回溯深度约束为常数级
  // 2. 要求标题必须以非空白字符开头（\S），消除与前置 \s 的歧义
  // 3. 保留 trim() 处理尾部空格，符合原逻辑
  const match = content.match(/^#\s{1,100}(\S.*)$/m)
  return match ? match[1].trim() : ''
}

/** 清理文件名中的非法字符 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    || 'Untitled'
}
