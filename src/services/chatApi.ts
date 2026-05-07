import type { AppSettings, AssistantReplyResult, PromptBundle } from '../domain/types'
import { getSavedCloudToken } from './cloudSync'

export async function requestAssistantReply(bundle: PromptBundle, settings: AppSettings): Promise<AssistantReplyResult> {
  let response: Response
  const apiBaseUrl = getApiBaseUrl()

  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 90_000)
  try {
    response = await fetch(`${apiBaseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getChatAuthHeaders(),
      },
      body: JSON.stringify({ bundle, settings }),
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('聊天请求超时（90 秒）：模型响应太慢，请稍后再试或换一组模型配置。', { cause: error })
    }
    if (isStaticPreviewHost()) return { reply: createBrowserDemoReply(bundle) }
    throw error
  } finally {
    window.clearTimeout(timeoutId)
  }

  if (!response.ok) {
    if (response.status === 404 && isStaticPreviewHost()) return { reply: createBrowserDemoReply(bundle) }
    const detail = await readChatError(response)
    throw new Error(formatChatError(response.status, detail))
  }

  const data = await response.json()
  return {
    reply: String(data.reply ?? ''),
    agent: data.agent,
  }
}

function getApiBaseUrl(): string {
  const configuredUrl = import.meta.env.VITE_API_BASE_URL
  if (!configuredUrl) return ''
  return stripTrailingSlash(configuredUrl)
}

function getChatAuthHeaders(): Record<string, string> {
  const token = getSavedCloudToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function readChatError(response: Response): Promise<string> {
  const detail = await response.text()
  if (!detail) return ''

  try {
    const parsed = JSON.parse(detail) as { error?: string; message?: string }
    return parsed.error || parsed.message || detail
  } catch {
    return detail
  }
}

function formatChatError(status: number, detail: string): string {
  const suffix = detail ? ` ${detail}` : ''
  if (status === 400) return `400 参数错误：模型名、上下文或接口格式可能不被上游接受。${suffix}`
  if (status === 401) return `401 授权失败：请先保存云端口令，或检查模型中转站密钥。${suffix}`
  if (status === 402 || status === 403) return `${status} 额度或权限不足：请检查中转站余额、套餐额度或模型权限。${suffix}`
  if (status === 404) return `404 入口不存在：当前后端没有找到聊天接口或模型资源。${suffix}`
  if (status === 429) return `429 请求过快：上游限流了，稍等一下再试。${suffix}`
  if (status === 502 || status === 503 || status === 504) {
    return `${status} 上游不可用：通常是中转站或模型供应商临时波动。${suffix}`
  }
  if (status >= 500) return `${status} 服务异常：模型后端或上游服务报错。${suffix}`
  return `${status} 聊天请求失败。${suffix}`
}

function isStaticPreviewHost(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.hostname.endsWith('github.io') && !getApiBaseUrl()
}

function createBrowserDemoReply(bundle: PromptBundle): string {
  const lastUserMessage = [...bundle.messages].reverse().find((message) => message.role === 'user')
  const memoryHint = bundle.contextBlocks
    .map((block) => block.title)
    .slice(0, 3)
    .join(' / ')

  return [
    '这是 GitHub Pages 静态预览模式：页面、角色、记忆和三端适配都能体验，但还没有连接云端模型后端。',
    lastUserMessage ? `妹妹刚才说：${lastUserMessage.content}` : '妹妹可以先随便发一句话试试界面。',
    memoryHint ? `本轮准备调用的记忆：${memoryHint}` : '这轮没有命中长期记忆。',
    '要让手机也真正调用模型，需要把云服务器配置成安全后端，再用 VITE_API_BASE_URL 指向它。',
  ].join('\n\n')
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}
