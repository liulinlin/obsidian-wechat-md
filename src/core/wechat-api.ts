import { requestUrl } from 'obsidian'

// ---- Error handling ----

const ERROR_MESSAGES: Record<number, string> = {
  40001: 'access_token 无效或不属于该公众号，请检查 AppID 和 AppSecret',
  40125: 'AppSecret 不正确，请到公众号后台重置',
  40164: 'IP 不在白名单中，请在公众号后台将代理服务器 IP 加入白名单',
  45009: '接口调用超过限制，请稍后再试',
  48001: '该接口未获得授权，请确认公众号已认证并开通相关权限',
}

export class WeChatApiError extends Error {
  constructor(public errcode: number, public errmsg: string) {
    const hint = ERROR_MESSAGES[errcode] || errmsg
    super(`微信 API 错误 ${errcode}: ${hint}`)
    this.name = 'WeChatApiError'
  }
}

function checkResponse(data: any): void {
  if (data.errcode && data.errcode !== 0) {
    throw new WeChatApiError(data.errcode, data.errmsg || '')
  }
}

// ---- Token cache (per appId) ----

const tokenCache = new Map<string, { token: string, expiresAt: number }>()

export async function wxGetToken(proxyUrl: string, appid: string, secret: string): Promise<string> {
  // Return cached token if still valid (refresh 5 min before expiry)
  const cached = tokenCache.get(appid)
  if (cached && Date.now() < cached.expiresAt - 5 * 60 * 1000) {
    return cached.token
  }

  const res = await requestUrl({
    url: `${proxyUrl}/cgi-bin/stable_token`,
    method: 'POST',
    contentType: 'application/json',
    body: JSON.stringify({
      grant_type: 'client_credential',
      appid,
      secret,
    }),
  })

  const data = res.json
  checkResponse(data)

  if (!data.access_token) {
    throw new Error('获取 access_token 失败：响应中无 token')
  }

  tokenCache.set(appid, {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 7200) * 1000,
  })

  return data.access_token
}

export function clearTokenCache(appid?: string): void {
  if (appid) {
    tokenCache.delete(appid)
  }
  else {
    tokenCache.clear()
  }
}

// ---- Multipart helper ----

function buildMultipart(fieldName: string, filename: string, data: ArrayBuffer): { body: ArrayBuffer, contentType: string } {
  const boundary = `----WeChatPublisher${Array.from({ length: 16 }, () => Math.random().toString(36)[2]).join('')}`

  const pre = `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`
  const post = `\r\n--${boundary}--`

  const preBytes = new TextEncoder().encode(pre)
  const postBytes = new TextEncoder().encode(post)
  const dataBytes = new Uint8Array(data)

  const combined = new Uint8Array(preBytes.length + dataBytes.length + postBytes.length)
  combined.set(preBytes, 0)
  combined.set(dataBytes, preBytes.length)
  combined.set(postBytes, preBytes.length + dataBytes.length)

  return {
    body: combined.buffer,
    contentType: `multipart/form-data; boundary=${boundary}`,
  }
}

// ---- Upload article image (returns CDN URL) ----

export async function wxUploadImage(
  proxyUrl: string,
  token: string,
  data: ArrayBuffer,
  filename: string,
): Promise<string> {
  const mp = buildMultipart('media', filename, data)

  const res = await requestUrl({
    url: `${proxyUrl}/cgi-bin/media/uploadimg?access_token=${token}`,
    method: 'POST',
    contentType: mp.contentType,
    body: mp.body,
  })

  const json = res.json
  checkResponse(json)

  if (!json.url) {
    throw new Error('上传图片失败：响应中无 URL')
  }

  return json.url
}

// ---- Upload cover image as permanent material (returns media_id) ----

export async function wxUploadCover(
  proxyUrl: string,
  token: string,
  data: ArrayBuffer,
  filename: string,
): Promise<string> {
  const mp = buildMultipart('media', filename, data)

  const res = await requestUrl({
    url: `${proxyUrl}/cgi-bin/material/add_material?access_token=${token}&type=image`,
    method: 'POST',
    contentType: mp.contentType,
    body: mp.body,
  })

  const json = res.json
  checkResponse(json)

  if (!json.media_id) {
    throw new Error('上传封面失败：响应中无 media_id')
  }

  return json.media_id
}

// ---- Create draft ----

export interface DraftArticle {
  title: string
  content: string
  thumb_media_id: string
  author?: string
  digest?: string
  content_source_url?: string
}

export async function wxAddDraft(
  proxyUrl: string,
  token: string,
  article: DraftArticle,
): Promise<string> {
  const res = await requestUrl({
    url: `${proxyUrl}/cgi-bin/draft/add?access_token=${token}`,
    method: 'POST',
    body: JSON.stringify({
      articles: [{
        title: article.title,
        content: article.content,
        thumb_media_id: article.thumb_media_id,
        ...(article.author && { author: article.author }),
        ...(article.digest && { digest: article.digest }),
        ...(article.content_source_url && { content_source_url: article.content_source_url }),
      }],
    }),
  })

  const json = res.json
  checkResponse(json)

  return json.media_id || ''
}

// ---- Get material list (for default cover) ----

export async function wxBatchGetMaterial(
  proxyUrl: string,
  token: string,
): Promise<string | null> {
  const res = await requestUrl({
    url: `${proxyUrl}/cgi-bin/material/batchget_material?access_token=${token}`,
    method: 'POST',
    body: JSON.stringify({ type: 'image', offset: 0, count: 1 }),
  })

  const json = res.json
  checkResponse(json)

  const items = json.item
  if (Array.isArray(items) && items.length > 0) {
    return items[0].media_id || null
  }

  return null
}
