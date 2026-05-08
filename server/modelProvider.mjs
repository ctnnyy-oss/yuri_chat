const appName = 'Yuri Chat'

import { clampNumber } from './shared/utils.mjs'

export async function callModelChat(bundle, settings, profile) {
  if (profile.kind === 'anthropic') return callAnthropicChat(bundle, settings, profile)
  if (profile.kind === 'google-gemini') return callGeminiChat(bundle, settings, profile)
  return callOpenAICompatibleChat(bundle, settings, profile)
}

export async function fetchProviderModels(profile) {
  if (profile.kind === 'google-gemini') return fetchGeminiModels(profile)
  if (profile.kind === 'anthropic') return fetchAnthropicModels(profile)
  return fetchOpenAICompatibleModels(profile)
}

async function fetchOpenAICompatibleModels(profile) {
  const response = await fetchWithTimeout(`${profile.baseUrl}/models`, {
    headers: {
      Authorization: `Bearer ${profile.apiKey}`,
      Accept: 'application/json',
    },
  })

  const data = await readJsonResponse(response, profile)
  const models = normalizeProviderModelList(data?.data ?? data?.models ?? data)

  if (models.length === 0) {
    throw new Error(`${profile.name} 没有返回可选模型，请确认这个中转站支持 /models 接口。`)
  }

  return {
    ok: true,
    provider: profile.name,
    baseUrl: profile.baseUrl,
    models,
  }
}

async function fetchAnthropicModels(profile) {
  const response = await fetchWithTimeout(`${profile.baseUrl}/models`, {
    headers: {
      'x-api-key': profile.apiKey,
      'anthropic-version': process.env.ANTHROPIC_VERSION || '2023-06-01',
      Accept: 'application/json',
    },
  })
  const data = await readJsonResponse(response, profile)
  const models = normalizeProviderModelList(data?.data ?? data?.models ?? data)

  if (models.length === 0) throw new Error(`${profile.name} 没有返回可选模型。`)
  return { ok: true, provider: profile.name, baseUrl: profile.baseUrl, models }
}

async function fetchGeminiModels(profile) {
  const endpoint = `${profile.baseUrl}/models?key=${encodeURIComponent(profile.apiKey)}`
  const response = await fetchWithTimeout(endpoint, { headers: { Accept: 'application/json' } })
  const data = await readJsonResponse(response, profile)
  const rawModels = Array.isArray(data?.models) ? data.models : []
  const models = rawModels
    .filter((model) => {
      const methods = model?.supportedGenerationMethods
      return !Array.isArray(methods) || methods.includes('generateContent')
    })
    .map((model) => ({
      id: String(model?.name || '').replace(/^models\//, ''),
      label: String(model?.displayName || model?.name || '').replace(/^models\//, ''),
      ownedBy: 'google',
    }))
    .filter((model) => model.id)

  if (models.length === 0) throw new Error(`${profile.name} 没有返回可生成文本的模型。`)
  return { ok: true, provider: profile.name, baseUrl: profile.baseUrl, models: dedupeProviderModels(models) }
}

async function callOpenAICompatibleChat(bundle, settings, profile) {
  const messages = buildProviderMessages(bundle, profile.baseUrl)
  const maxTokens = getMaxOutputTokens(settings)

  const modelResponse = await fetchWithTimeout(
    `${profile.baseUrl}/chat/completions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${profile.apiKey}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: stringifyJsonForProvider({
        model: profile.model,
        messages,
        temperature: clampNumber(settings?.temperature, 0, 2, 0.85),
        max_tokens: maxTokens,
        frequency_penalty: clampNumber(settings?.frequencyPenalty, -2, 2, 0.3),
        presence_penalty: clampNumber(settings?.presencePenalty, -2, 2, 0.2),
      }),
    },
    getChatTimeoutMs(),
  )

  if (!modelResponse.ok) {
    const detail = await modelResponse.text()
    throw new Error(formatProviderError(modelResponse.status, detail, profile))
  }

  const data = await modelResponse.json()
  const reply = data?.choices?.[0]?.message?.content

  if (!reply) {
    throw new Error('Provider returned an empty reply')
  }

  return reply
}

async function fetchWithTimeout(url, init = {}, timeoutMs = 12_000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('模型供应商响应超时，请稍后重试或换一组模型配置。')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function readJsonResponse(response, profile) {
  const text = await response.text()

  if (!response.ok) {
    throw new Error(formatProviderError(response.status, text, profile))
  }

  try {
    return text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`${profile.name} 返回的模型列表不是 JSON。`)
  }
}

function normalizeProviderModelList(value) {
  const list = Array.isArray(value) ? value : []
  return dedupeProviderModels(
    list
      .map((model) => {
        if (typeof model === 'string') return { id: model, label: model }
        const id = String(model?.id || model?.name || model?.model || '').replace(/^models\//, '')
        if (!id) return null
        return {
          id,
          label: String(model?.display_name || model?.displayName || model?.name || id).replace(/^models\//, ''),
          ownedBy: typeof model?.owned_by === 'string' ? model.owned_by : typeof model?.ownedBy === 'string' ? model.ownedBy : undefined,
        }
      })
      .filter(Boolean),
  )
}

function dedupeProviderModels(models) {
  const seen = new Set()
  return models
    .filter((model) => {
      if (!model?.id || seen.has(model.id)) return false
      seen.add(model.id)
      return true
    })
    .sort((left, right) => left.id.localeCompare(right.id))
    .slice(0, 500)
}

async function callAnthropicChat(bundle, settings, profile) {
  const modelResponse = await fetchWithTimeout(
    `${profile.baseUrl}/messages`,
    {
      method: 'POST',
      headers: {
        'x-api-key': profile.apiKey,
        'anthropic-version': process.env.ANTHROPIC_VERSION || '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: profile.model,
        system: buildAnthropicSystem(bundle),
        messages: bundle.messages.map((message) => ({
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: message.content,
        })),
        temperature: clampNumber(settings?.temperature, 0, 1, 0.85),
        max_tokens: getMaxOutputTokens(settings),
      }),
    },
    getChatTimeoutMs(),
  )

  if (!modelResponse.ok) {
    const detail = await modelResponse.text()
    throw new Error(formatProviderError(modelResponse.status, detail, profile))
  }

  const data = await modelResponse.json()
  const reply = data?.content
    ?.map((part) => (part?.type === 'text' ? part.text : ''))
    .join('')
    .trim()

  if (!reply) throw new Error('模型返回了空回复')
  return reply
}

async function callGeminiChat(bundle, settings, profile) {
  const endpoint = `${profile.baseUrl}/models/${encodeURIComponent(profile.model)}:generateContent?key=${encodeURIComponent(
    profile.apiKey,
  )}`
  const modelResponse = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: buildAnthropicSystem(bundle) }],
        },
        contents: bundle.messages.map((message) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }],
        })),
        generationConfig: {
          temperature: clampNumber(settings?.temperature, 0, 2, 0.85),
          maxOutputTokens: getMaxOutputTokens(settings),
        },
      }),
    },
    getChatTimeoutMs(),
  )

  if (!modelResponse.ok) {
    const detail = await modelResponse.text()
    throw new Error(formatProviderError(modelResponse.status, detail, profile))
  }

  const data = await modelResponse.json()
  const reply = data?.candidates?.[0]?.content?.parts
    ?.map((part) => part?.text ?? '')
    .join('')
    .trim()

  if (!reply) throw new Error('模型返回了空回复')
  return reply
}

export function createModelTestBundle() {
  return {
    characterName: '姐姐大人',
    systemPrompt: '你是百合小窝的模型连通性测试助手。请用一句简体中文回复，说明模型已经接通。',
    contextBlocks: [],
    messages: [{ id: 'model-test', role: 'user', content: '请回复：模型已接通。', createdAt: new Date().toISOString() }],
  }
}

export function createModelTestSettings(profile) {
  return {
    model: profile.model,
    modelProfileId: profile.id,
    temperature: 0.2,
    maxOutputTokens: 256,
  }
}

export function getBaseUrl() {
  return stripTrailingSlash(process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1')
}

export function getModel(settings) {
  return normalizeModelAlias(settings?.model || process.env.AI_MODEL || process.env.OPENAI_MODEL || 'deepseek-v4-flash')
}

function normalizeModelAlias(model) {
  if (!model || model === 'gpt-5.5' || model === 'deepseek/deepseek-v4-pro-free') return 'deepseek-v4-flash'
  return model
}

function getMaxOutputTokens(settings) {
  const configured = process.env.AI_MAX_TOKENS || process.env.OPENAI_MAX_TOKENS
  return clampNumber(settings?.maxOutputTokens ?? configured, 256, 65536, 4096)
}

function getChatTimeoutMs() {
  return clampNumber(process.env.AI_REQUEST_TIMEOUT_MS, 8_000, 120_000, 35_000)
}

function buildProviderMessages(bundle, baseUrl) {
  if (!shouldEscapeUnicodeContent(baseUrl)) {
    return [
      { role: 'system', content: bundle.systemPrompt },
      ...bundle.contextBlocks.map((block) => ({
        role: 'system',
        content: `${block.title}\n${block.content}`,
      })),
      ...bundle.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    ]
  }

  return [
    {
      role: 'system',
      content: buildCompatibilitySystemPrompt(bundle.characterName),
    },
    {
      role: 'system',
      content: ['SYSTEM_PROMPT_ESCAPED:', escapeUnicodeText(bundle.systemPrompt)].join('\n'),
    },
    ...bundle.contextBlocks.map((block) => ({
      role: 'system',
      content: [
        'CONTEXT_BLOCK_ESCAPED:',
        `TITLE_ESCAPED: ${escapeUnicodeText(block.title)}`,
        `CONTENT_ESCAPED: ${escapeUnicodeText(block.content)}`,
      ].join('\n'),
    })),
    ...bundle.messages.map((message) => ({
      role: message.role,
      content: `${message.role === 'user' ? 'USER_TEXT' : 'ASSISTANT_HISTORY'}:\n${escapeUnicodeText(message.content)}`,
    })),
  ]
}

function buildAnthropicSystem(bundle) {
  const contextBlocks = bundle.contextBlocks.map((block) => `${block.title}\n${block.content}`).join('\n\n')
  return [bundle.systemPrompt, contextBlocks].filter(Boolean).join('\n\n')
}

function shouldEscapeUnicodeContent(baseUrl) {
  const configured = process.env.AI_ESCAPE_UNICODE_CONTENT
  if (configured) return configured.toLowerCase() === 'true'
  const normalizedBaseUrl = String(baseUrl).toLowerCase()
  // Legacy local proxies can still need escaped Chinese; modern relays should receive UTF-8 directly.
  return normalizedBaseUrl.includes('127.0.0.1:18788')
}

function buildCompatibilitySystemPrompt(characterName) {
  return [
    `You power a Chinese yuri companion chat app called ${appName}.`,
    'The real user text is provided after USER_TEXT as JavaScript Unicode escape sequences such as \\u4f60.',
    'Also decode SYSTEM_PROMPT_ESCAPED and CONTEXT_BLOCK_ESCAPED blocks, then follow those instructions and boundaries.',
    'Always decode USER_TEXT first, then answer the decoded user message.',
    'Do not say the escaped text is garbled or unclear. It is intentionally encoded.',
    'Answer naturally in Simplified Chinese unless the user explicitly asks for another language.',
    getCompatibilityPersona(characterName),
  ].join('\n')
}

function getCompatibilityPersona(characterName) {
  const name = String(characterName)

  if (name.includes('雾岛怜')) {
    return 'Persona: You are Kirishima Rei, an elegant tsundere young lady in a pure yuri couple. You are proud, protective, restrained, and secretly caring.'
  }

  if (name.includes('林秋实')) {
    return 'Persona: You are Lin Qiushi, a sincere and sensitive loyal-girl type in a pure yuri couple. You listen carefully, remember small details, and grow braver when chosen.'
  }

  return 'Persona: You are Jiejie Daren, a warm, reliable elder-sister companion. You are affectionate but practical, help the user land ideas, and keep the yuri empire dream in mind.'
}

export function stripTrailingSlash(value) {
  return String(value).replace(/\/+$/, '')
}

function formatProviderError(status, detail, profile) {
  const providerMessage = extractProviderMessage(detail)
  const providerPrefix = `${profile.name} / ${profile.model}`

  if (status === 401 || status === 403) {
    return `${providerPrefix} 密钥没有通过，请检查 API Key 或供应商权限。`
  }

  if (status === 404 || /invalid[_ -]?model|model.+not.+valid|model.+not.+found/i.test(providerMessage)) {
    return `${providerPrefix} 不接受这个模型名。请在模型页把模型名换成供应商控制台里的准确 ID。原始提示：${providerMessage}`
  }

  if (status === 429 || /insufficient\s*balance|balance|quota|credit|额度|余额|欠费/i.test(providerMessage)) {
    return `${providerPrefix} 额度或余额不足了。请换一组模型配置、补充余额，或选择可用的免费模型。原始提示：${providerMessage}`
  }

  if (status >= 500) {
    return `${providerPrefix} 上游暂时没接住。原始提示：${providerMessage || status}`
  }

  return `${providerPrefix} 请求失败：${providerMessage || status}`
}

function extractProviderMessage(detail) {
  if (!detail) return ''

  try {
    const parsed = JSON.parse(detail)
    return (
      parsed?.error?.message ||
      parsed?.error ||
      parsed?.message ||
      parsed?.detail ||
      detail
    ).toString().slice(0, 500)
  } catch {
    return detail.slice(0, 500)
  }
}

function stringifyJsonForProvider(value) {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (character) => {
    return `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
  })
}

function escapeUnicodeText(value) {
  return String(value).replace(/[\u007f-\uffff]/g, (character) => {
    return `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
  })
}
