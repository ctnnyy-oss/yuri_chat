import { clampNumber } from './shared/utils.mjs'

const maxSpeechCharacters = 3600

export async function callTextToSpeech(input, profile) {
  if (!profile) throw new Error('请先在模型页保存可用的模型档案。')
  if (profile.kind !== 'openai-compatible') {
    throw new Error('当前语音生成先支持 OpenAI 兼容接口；Gemini Live / 原生通话稍后接入独立实时通道。')
  }

  const settings = input?.settings?.voice ?? {}
  const characterVoice = input?.characterVoice ?? {}
  const text = normalizeSpeechText(input?.text)
  const model = normalizeShortText(settings.ttsModel, 'gpt-4o-mini-tts', 120)
  const voiceId = normalizeShortText(
    characterVoice.consentConfirmed && characterVoice.providerVoiceId
      ? characterVoice.providerVoiceId
      : settings.defaultVoiceId,
    'coral',
    80,
  )
  const instructions = buildVoiceInstructions(input?.characterName, settings, characterVoice)
  const speed = clampNumber(settings.speechRate, 0.65, 1.35, 1)

  const response = await fetchWithTimeout(`${profile.baseUrl}/audio/speech`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${profile.apiKey}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      model,
      voice: voiceId,
      input: text,
      instructions,
      response_format: 'mp3',
      speed,
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(formatVoiceProviderError(response.status, detail, profile))
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  return {
    audioBase64: buffer.toString('base64'),
    mimeType: response.headers.get('content-type')?.split(';')[0] || 'audio/mpeg',
    provider: profile.name,
    model,
    voiceId,
  }
}

function normalizeSpeechText(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) throw new Error('语音生成需要一段文字。')
  return text.slice(0, maxSpeechCharacters)
}

function normalizeShortText(value, fallback, maxLength) {
  const text = String(value || '').trim()
  return (text || fallback).slice(0, maxLength)
}

function buildVoiceInstructions(characterName, settings, characterVoice) {
  const parts = [
    `你正在为角色「${normalizeShortText(characterName, '角色', 60)}」生成聊天语音。`,
    normalizeShortText(settings.defaultStylePrompt, '', 360),
  ]

  if (characterVoice.consentConfirmed && characterVoice.stylePrompt) {
    parts.push(normalizeShortText(characterVoice.stylePrompt, '', 360))
  }

  parts.push('语气自然、清晰、像即时通讯里的语音消息；不要额外朗读舞台说明。')
  return parts.filter(Boolean).join('\n')
}

async function fetchWithTimeout(url, init = {}, timeoutMs = 45_000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('语音供应商响应超时，请稍后再试。')
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function formatVoiceProviderError(status, detail, profile) {
  const providerMessage = extractProviderMessage(detail)
  const providerPrefix = `${profile.name} / ${profile.model}`

  if (status === 401 || status === 403) {
    return `${providerPrefix} 的语音授权没有通过，请检查 API Key 或供应商是否开放 TTS。原始提示：${providerMessage}`
  }
  if (status === 404) {
    return `${providerPrefix} 没有找到 /audio/speech 语音接口；这个中转站可能只支持文本聊天。原始提示：${providerMessage}`
  }
  if (status === 429 || /balance|quota|credit|额度|余额|欠费/i.test(providerMessage)) {
    return `${providerPrefix} 语音额度或频率不够。原始提示：${providerMessage}`
  }
  if (status >= 500) {
    return `${providerPrefix} 语音上游暂时没有接住。原始提示：${providerMessage || status}`
  }

  return `${providerPrefix} 语音请求失败：${providerMessage || status}`
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
