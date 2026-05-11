import type { ModelProfileInput, ModelProfileSummary, ModelProviderKind } from '../domain/types'
import { getCloudApiBaseUrl } from './cloudSync'
import { apiFetch, isStaticPreviewHost } from './apiClient'

export interface ModelProviderPreset {
  id: string
  label: string
  description: string
  group: 'official' | 'custom'
  kind: ModelProviderKind
  baseUrl: string
  model: string
}

export interface ModelProfileSaveResult {
  profile: ModelProfileSummary
  profiles: ModelProfileSummary[]
}

export interface ModelProfileTestResult {
  ok: boolean
  provider: string
  model: string
  latencyMs: number
  preview: string
}

export interface ModelCatalogItem {
  id: string
  label: string
  ownedBy?: string
}

export interface ModelCatalogResult {
  ok: boolean
  provider: string
  baseUrl: string
  models: ModelCatalogItem[]
}

export interface ModelEmbeddingResult {
  ok: boolean
  provider: string
  model: string
  dimensions: number
  embeddings: number[][]
  latencyMs: number
}

export const modelProviderPresets: ModelProviderPreset[] = [
  {
    id: 'custom',
    label: '自定义平台 / 中转站',
    description: '按平台文档填写 Base URL、接口格式和 API Key，适合任何兼容转发或私有后端。',
    group: 'custom',
    kind: 'openai-compatible',
    baseUrl: '',
    model: '',
  },
  {
    id: 'openai',
    label: 'OpenAI 官方',
    description: '官方 OpenAI API，使用 OpenAI-compatible 格式。',
    group: 'official',
    kind: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-5.5',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek 官方',
    description: 'DeepSeek 官方接口，适合国内常用模型。',
    group: 'official',
    kind: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
  {
    id: 'siliconflow',
    label: '硅基流动官方',
    description: '国内 OpenAI-compatible 官方平台。',
    group: 'official',
    kind: 'openai-compatible',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'deepseek-ai/DeepSeek-V3',
  },
  {
    id: 'dashscope',
    label: '阿里百炼官方',
    description: '百炼兼容模式，模型名如 qwen-plus。',
    group: 'official',
    kind: 'openai-compatible',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
  },
  {
    id: 'moonshot',
    label: '月之暗面官方',
    description: 'Kimi 官方 OpenAI-compatible 接口。',
    group: 'official',
    kind: 'openai-compatible',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
  },
  {
    id: 'zhipu',
    label: '智谱官方',
    description: '智谱兼容接口，模型名按控制台复制。',
    group: 'official',
    kind: 'openai-compatible',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
  },
  {
    id: 'xiaomi-mimo',
    label: '小米 MiMo 官方',
    description: '小米 MiMo 官方 OpenAI-compatible 接口，TTS 可用 mimo-v2.5-tts。',
    group: 'official',
    kind: 'openai-compatible',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    model: 'mimo-v2.5-tts',
  },
  {
    id: 'volcengine-doubao-tts',
    label: '火山引擎豆包 TTS',
    description: '豆包语音合成大模型。API Key 填 appid|access_token|seed-tts-2.0；右侧默认音色 ID 填 speaker/voice_type，小米档案可继续保留。',
    group: 'official',
    kind: 'openai-compatible',
    baseUrl: 'https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse',
    model: 'seed-tts-2.0',
  },
  {
    id: 'anthropic',
    label: 'Anthropic 官方',
    description: 'Claude 官方 messages 接口，不走 OpenAI 格式。',
    group: 'official',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-4-5',
  },
  {
    id: 'gemini',
    label: 'Google Gemini 官方',
    description: 'Gemini generateContent 接口，密钥走 query 参数。',
    group: 'official',
    kind: 'google-gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.5-pro',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter 中转',
    description: '一个密钥接多家模型，支持从 /models 自动拉取列表。',
    group: 'custom',
    kind: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: '',
  },
  {
    id: 'yop-relay',
    label: 'YOP 中转',
    description: 'OpenAI-compatible 中转站，填 Key 后可尝试自动拉模型。',
    group: 'custom',
    kind: 'openai-compatible',
    baseUrl: 'https://api.yop.mom/v1',
    model: '',
  },
  {
    id: 'local-proxy',
    label: '本机代理 / 酒馆转发',
    description: '适合酒馆、代理或本机转发器，手机端通常需要改成云端地址。',
    group: 'custom',
    kind: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:18788/v1',
    model: 'deepseek/deepseek-v4-pro-free',
  },
]

export async function listModelProfiles(token: string): Promise<ModelProfileSummary[]> {
  const response = await modelFetch('/api/model/profiles', token)
  const payload = (await response.json()) as { profiles?: ModelProfileSummary[] }
  return payload.profiles ?? []
}

export async function saveModelProfile(token: string, profile: ModelProfileInput): Promise<ModelProfileSaveResult> {
  const response = await modelFetch('/api/model/profiles', token, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ profile }),
  })
  return response.json()
}

export async function deleteModelProfile(token: string, profileId: string): Promise<ModelProfileSummary[]> {
  const response = await modelFetch(`/api/model/profiles/${encodeURIComponent(profileId)}`, token, { method: 'DELETE' })
  const payload = (await response.json()) as { profiles?: ModelProfileSummary[] }
  return payload.profiles ?? []
}

export async function testModelProfile(
  token: string,
  input: { profileId?: string; profile?: ModelProfileInput },
): Promise<ModelProfileTestResult> {
  const response = await modelFetch('/api/model/test', token, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })
  return response.json()
}

export async function fetchModelCatalog(
  token: string,
  input: { profileId?: string; profile?: ModelProfileInput },
): Promise<ModelCatalogResult> {
  const response = await modelFetch('/api/model/models', token, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })
  return response.json()
}

export async function requestModelEmbeddings(
  token: string,
  input: {
    texts: string[]
    profileId?: string
    profile?: ModelProfileInput
    model?: string
    dimensions?: number
    optional?: boolean
  },
): Promise<ModelEmbeddingResult> {
  const response = await modelFetch('/api/model/embeddings', token, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })
  return response.json()
}

async function modelFetch(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  const apiBaseUrl = getModelApiBaseUrl()
  if (!apiBaseUrl && isStaticPreviewHost()) {
    throw new Error('线上静态版还没有连接模型后端，不能直接拉取模型列表。需要配置云端后端，或在本机预览里使用。')
  }
  return apiFetch(path, {
    ...init,
    token,
    timeoutMs: 30_000,
    timeoutMessage: '模型配置请求超时（30 秒），请检查网络或稍后再试',
    errorFormatter: formatModelError,
  })
}

function getModelApiBaseUrl(): string {
  return getCloudApiBaseUrl()
}

function formatModelError(status: number, detail: string): string {
  if (!detail && status === 404) return '没有找到模型后端接口，当前页面可能只是静态预览。'
  if (status === 401) return '服务器拒绝访问模型保险箱。以后开启登录后，需要重新登录。'
  if (status === 404) return detail || '没有找到这个模型配置'
  if (status >= 500) return `模型服务暂时没接住：${detail || status}`
  return detail || `模型配置请求失败：${status}`
}
