import type { PluginSettings } from '../types'
import { requestUrl } from 'obsidian'

export interface PolishResult {
  content: string
}

export async function polishMarkdown(
  settings: PluginSettings,
  markdown: string,
): Promise<PolishResult> {
  const { aiEndpoint, aiModel, aiApiKey, aiTemperature, aiMaxTokens, aiPolishPrompt, aiServiceType } = settings

  if (!aiEndpoint || !aiModel) {
    throw new Error('请先在插件设置中配置 AI 服务的 API 端点和模型')
  }

  const url = `${aiEndpoint.replace(/\/+$/, '')}/chat/completions`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  // 内置服务不发送 Authorization header
  if (aiServiceType !== 'default' && aiApiKey) {
    headers.Authorization = `Bearer ${aiApiKey}`
  }

  const body = JSON.stringify({
    model: aiModel,
    messages: [
      { role: 'system', content: aiPolishPrompt },
      { role: 'user', content: markdown },
    ],
    temperature: aiTemperature,
    max_tokens: aiMaxTokens,
    stream: false,
  })

  const response = await requestUrl({
    url,
    method: 'POST',
    headers,
    body,
  })

  if (response.status !== 200) {
    throw new Error(`AI 服务返回错误 (${response.status}): ${response.text}`)
  }

  const data = response.json
  const content = data?.choices?.[0]?.message?.content

  if (!content) {
    throw new Error('AI 服务返回了空内容')
  }

  return { content: content.trim() }
}
