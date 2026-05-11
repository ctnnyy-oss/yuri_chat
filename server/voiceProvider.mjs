import { randomUUID } from 'node:crypto'
import { clampNumber } from './shared/utils.mjs'

const maxSpeechCharacters = 3600
const speechChunkCharacters = 220
const defaultSpeechTimeoutMs = 75_000
const volcengineDefaultV1Endpoint = 'https://openspeech.bytedance.com/api/v1/tts'
const volcengineDefaultV3Endpoint = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse'
const volcengineDefaultV1Voice = 'BV700_V2_streaming'
const volcengineDefaultV3Voice = 'zh_female_cancan_uranus_bigtts'

export async function callTextToSpeech(input, profile) {
  if (!profile) throw new Error('请先在模型页保存可用的聊天模型或 TTS 模型档案。')
  if (profile.kind !== 'openai-compatible') {
    throw new Error('当前语音生成先支持 OpenAI 兼容接口；Gemini Live / 原生通话稍后接入独立实时通道。')
  }
  if (!profile.apiKey) throw new Error(`${profile.name} 还没有保存 API Key，不能生成语音。`)

  const settings = input?.settings?.voice ?? {}
  const characterVoice = input?.characterVoice ?? {}
  const text = normalizeSpeechText(input?.text)
  const rawModel = normalizeShortText(settings.ttsModel, '', 120)
  const model = rawModel || normalizeShortText(profile.model, 'gpt-4o-mini-tts', 120)
  const tuning = normalizeVoiceTuning(settings)
  const voiceId = resolveSpeechVoiceId(settings, characterVoice, tuning)
  const instructions = buildVoiceInstructions(input?.characterName, settings, characterVoice, tuning)
  const speed = tuning.speed
  const chunks = splitSpeechText(text)

  if (isVolcengineSpeechProfile(profile, model)) {
    const volcengineModel = isVolcengineResourceId(model)
      ? model
      : normalizeShortText(profile.model, 'seed-tts-2.0', 120)
    const volcengineMode = shouldUseVolcengineV3(profile, volcengineModel) ? 'v3' : 'v1'
    const volcengineVoiceId = resolveVolcengineVoiceId(voiceId, volcengineMode)
    if (chunks.length > 1) {
      const results = []
      for (const chunk of chunks) {
        results.push(await callVolcengineTextToSpeech({
          profile,
          model: volcengineModel,
          voiceId: volcengineVoiceId,
          text: chunk,
          instructions,
          tuning,
          mode: volcengineMode,
        }))
      }
      return mergeSpeechResults(results)
    }

    return callVolcengineTextToSpeech({
      profile,
      model: volcengineModel,
      voiceId: volcengineVoiceId,
      text,
      instructions,
      tuning,
      mode: volcengineMode,
    })
  }

  if (chunks.length > 1) {
    const results = []
    for (const chunk of chunks) {
      results.push(await callSingleTextToSpeech({ profile, model, voiceId, text: chunk, instructions, speed }))
    }
    return mergeSpeechResults(results)
  }

  return callSingleTextToSpeech({ profile, model, voiceId, text, instructions, speed })
}

async function callVolcengineTextToSpeech({ profile, model, voiceId, text, instructions, tuning, mode }) {
  const config = parseVolcengineCredentials(profile.apiKey)
  const endpoint = resolveVolcengineEndpoint(profile.baseUrl, mode)
  if (mode === 'v3') {
    return callVolcengineV3TextToSpeech({ profile, endpoint, config, model, voiceId, text, instructions, tuning })
  }
  return callVolcengineV1TextToSpeech({ profile, endpoint, config, model, voiceId, text, tuning })
}

async function callVolcengineV1TextToSpeech({ profile, endpoint, config, model, voiceId, text, tuning }) {
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer;${config.token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      app: {
        appid: config.appid,
        token: config.token,
        cluster: config.cluster,
      },
      user: {
        uid: `yuri-chat-${randomUUID()}`,
      },
      audio: {
        voice: 'other',
        voice_type: voiceId,
        encoding: 'mp3',
        rate: 24000,
        speed_ratio: clampNumber(tuning.speed, 0.1, 2, 1),
        volume_ratio: clampNumber(tuning.volume, 0.1, 3, 1),
        pitch_ratio: clampNumber(tuning.pitch, 0.1, 3, 1),
        ...buildVolcengineV1Emotion(tuning),
      },
      request: {
        reqid: randomUUID(),
        text,
        text_type: 'plain',
        operation: 'query',
      },
    }),
  })

  const detail = await response.text()
  if (!response.ok) throw new Error(formatVolcengineProviderError(response.status, detail, profile, model))
  const payload = parseJsonSafe(detail)
  if (payload?.code !== 3000 || !payload?.data) {
    throw new Error(formatVolcengineProviderPayloadError(payload, profile, model))
  }

  return normalizeVolcengineSpeechResult(payload.data, profile, model, voiceId)
}

async function callVolcengineV3TextToSpeech({ profile, endpoint, config, model, voiceId, text, instructions, tuning }) {
  const resourceId = resolveVolcengineResourceId(config.resourceId || model)
  const additions = buildVolcengineV3Additions(instructions, tuning)
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer;${config.token}`,
      'Content-Type': 'application/json; charset=utf-8',
      'X-Api-App-Id': config.appid,
      'X-Api-Access-Key': config.token,
      'X-Api-Resource-Id': resourceId,
      'X-Api-Request-Id': randomUUID(),
    },
    body: JSON.stringify({
      user: {
        uid: `yuri-chat-${randomUUID()}`,
      },
      req_params: {
        text,
        speaker: voiceId,
        model: normalizeVolcengineSynthesisModel(config.synthesisModel),
        audio_params: {
          format: 'mp3',
          sample_rate: 24000,
          speech_rate: formatVolcenginePercent(tuning.speed, -50, 100),
          loudness_rate: formatVolcenginePercent(tuning.volume, -50, 100),
          ...buildVolcengineV3Emotion(tuning),
        },
        additions: JSON.stringify(additions),
      },
    }),
  })

  const detail = await response.text()
  if (!response.ok) throw new Error(formatVolcengineProviderError(response.status, detail, profile, resourceId))
  const audioBase64 = extractVolcengineV3Audio(detail)
  if (!audioBase64) {
    const payload = parseJsonSafe(detail)
    throw new Error(formatVolcengineProviderPayloadError(payload, profile, resourceId, detail))
  }

  return normalizeVolcengineSpeechResult(audioBase64, profile, resourceId, voiceId)
}

async function callSingleTextToSpeech({ profile, model, voiceId, text, instructions, speed }) {
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
    if (shouldTryChatSpeechFallback(response.status, detail, model)) {
      return callChatCompletionSpeech({ profile, model, voiceId, text, instructions, speed })
    }
    throw new Error(formatVoiceProviderError(response.status, detail, profile))
  }

  return readAudioResponse(response, profile, model, voiceId)
}

function mergeSpeechResults(results) {
  if (results.length === 1) return results[0]
  const first = results[0]
  const audioBase64 = Buffer.concat(results.map((result) => Buffer.from(result.audioBase64, 'base64'))).toString('base64')
  return {
    ...first,
    audioBase64,
    mimeType: first.mimeType || 'audio/mpeg',
  }
}

async function callChatCompletionSpeech({ profile, model, voiceId, text, instructions, speed }) {
  const messages = [
    ...(instructions ? [{ role: 'user', content: instructions }] : []),
    { role: 'assistant', content: text },
  ]
  const response = await fetchWithTimeout(`${profile.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${profile.apiKey}`,
      'api-key': profile.apiKey,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      audio: {
        format: 'mp3',
        voice: voiceId,
      },
      voice: voiceId,
      speed,
    }),
  })

  const detail = await response.text()
  if (!response.ok) throw new Error(formatChatSpeechProviderError(response.status, detail, profile))

  const payload = parseJsonSafe(detail)
  const audio = extractChatSpeechAudio(payload)
  if (!audio) {
    throw new Error(`${profile.name} / ${profile.model} 返回了聊天式 TTS 响应，但没有找到音频数据。`)
  }

  return {
    ...audio,
    provider: profile.name,
    model,
    voiceId,
  }
}

async function readAudioResponse(response, profile, model, voiceId) {
  const buffer = Buffer.from(await response.arrayBuffer())
  return {
    audioBase64: buffer.toString('base64'),
    mimeType: response.headers.get('content-type')?.split(';')[0] || 'audio/mpeg',
    provider: profile.name,
    model,
    voiceId,
  }
}

function shouldTryChatSpeechFallback(status, detail, model) {
  const message = extractProviderMessage(detail)
  return status === 404 || /messages must contain an assistant role|TTS model|chat.?completions|mimo/i.test(`${model} ${message}`)
}

function extractChatSpeechAudio(payload) {
  const message = payload?.choices?.[0]?.message ?? payload?.message ?? payload
  const audio = message?.audio ?? payload?.audio
  const data =
    (typeof audio === 'string' ? audio : '') ||
    audio?.data ||
    audio?.base64 ||
    audio?.b64_json ||
    audio?.audio ||
    payload?.audioBase64

  if (!data) return null
  return normalizeAudioData(data, audio?.mime_type || audio?.mimeType || audio?.format)
}

function normalizeAudioData(data, format) {
  const raw = String(data || '').trim()
  const dataUrlMatch = raw.match(/^data:([^;]+);base64,(.+)$/)
  if (dataUrlMatch) {
    return {
      audioBase64: dataUrlMatch[2],
      mimeType: dataUrlMatch[1],
    }
  }

  return {
    audioBase64: raw,
    mimeType: formatToMimeType(format) || detectBase64AudioMimeType(raw) || 'audio/wav',
  }
}

function formatToMimeType(format) {
  const text = String(format || '').toLowerCase()
  if (!text) return ''
  if (text.includes('/')) return text
  if (text.includes('mp3') || text.includes('mpeg')) return 'audio/mpeg'
  if (text.includes('wav')) return 'audio/wav'
  if (text.includes('ogg')) return 'audio/ogg'
  if (text.includes('flac')) return 'audio/flac'
  return ''
}

function detectBase64AudioMimeType(base64) {
  if (base64.startsWith('UklG')) return 'audio/wav'
  if (base64.startsWith('SUQz') || base64.startsWith('//')) return 'audio/mpeg'
  if (base64.startsWith('T2dnUw')) return 'audio/ogg'
  if (base64.startsWith('ZkxhQw')) return 'audio/flac'
  return ''
}

function isVolcengineSpeechProfile(profile, model) {
  const probe = `${profile.baseUrl || ''} ${profile.model || ''} ${model || ''}`.toLowerCase()
  return /openspeech\.bytedance\.com|volcengine|doubao/.test(probe)
    || isVolcengineResourceId(model)
}

function shouldUseVolcengineV3(profile, model) {
  const probe = `${profile.baseUrl || ''} ${model || ''}`.toLowerCase()
  return /\/api\/v3\/|seed-(tts|icl)-2|seed-tts|bigtts|volcengine-tts-v3/.test(probe)
}

function isVolcengineResourceId(value) {
  return /^seed-(tts|icl)-/i.test(String(value || '').trim())
}

function parseVolcengineCredentials(apiKey) {
  const raw = String(apiKey || '').trim()
  const envConfig = {
    appid: process.env.VOLCENGINE_TTS_APP_ID || process.env.VOLCENGINE_TTS_APPID || process.env.BYTEPLUS_SEED_SPEECH_APPID || '',
    token: process.env.VOLCENGINE_TTS_TOKEN || process.env.VOLCENGINE_TTS_API_KEY || process.env.BYTEPLUS_SEED_SPEECH_API_KEY || '',
    cluster: process.env.VOLCENGINE_TTS_CLUSTER || process.env.VOLCENGINE_TTS_CLUSTER_ID || 'volcano_tts',
    resourceId: process.env.VOLCENGINE_TTS_RESOURCE_ID || '',
    synthesisModel: process.env.VOLCENGINE_TTS_MODEL || '',
  }
  const parsed = raw ? parseVolcengineCredentialText(raw) : {}
  const config = {
    appid: parsed.appid || envConfig.appid,
    token: parsed.token || envConfig.token,
    cluster: parsed.cluster || envConfig.cluster || 'volcano_tts',
    resourceId: parsed.resourceId || envConfig.resourceId,
    synthesisModel: parsed.synthesisModel || envConfig.synthesisModel,
  }

  if (!config.appid || !config.token) {
    throw new Error('火山引擎豆包 TTS 需要 AppID 和 Access Token。模型档案的 API Key 可以填 appid|access_token|resource_id，例如第三段填 seed-tts-2.0；小米档案会继续保留不受影响。')
  }
  return config
}

function parseVolcengineCredentialText(raw) {
  const json = parseJsonSafe(raw)
  if (json && typeof json === 'object') {
    return normalizeVolcengineCredentialMap(json)
  }

  if (/appid|app_id|token|access[_-]?token|resource|cluster/i.test(raw) && /[:=]/.test(raw)) {
    const entries = {}
    raw.split(/[;\n,]+/).forEach((piece) => {
      const match = piece.match(/^\s*([^:=]+)\s*[:=]\s*(.+?)\s*$/)
      if (match) entries[match[1].trim()] = match[2].trim()
    })
    return normalizeVolcengineCredentialMap(entries)
  }

  const parts = raw.split('|').map((part) => part.trim()).filter(Boolean)
  if (parts.length >= 2) {
    return {
      appid: parts[0],
      token: normalizeBearerToken(parts[1]),
      cluster: parts[2] && !isVolcengineResourceId(parts[2]) ? parts[2] : '',
      resourceId: parts.find((part) => isVolcengineResourceId(part)) || '',
      synthesisModel: parts.find((part) => /^seed-tts-2\.0-(expressive|standard)$/i.test(part)) || '',
    }
  }

  return { token: normalizeBearerToken(raw) }
}

function normalizeVolcengineCredentialMap(value) {
  return {
    appid: String(value.appid ?? value.appId ?? value.app_id ?? value['X-Api-App-Id'] ?? '').trim(),
    token: normalizeBearerToken(value.token ?? value.accessToken ?? value.access_token ?? value.apiKey ?? value.key ?? value['X-Api-Access-Key'] ?? ''),
    cluster: String(value.cluster ?? value.clusterId ?? value.cluster_id ?? '').trim(),
    resourceId: String(value.resourceId ?? value.resource_id ?? value['X-Api-Resource-Id'] ?? '').trim(),
    synthesisModel: String(value.synthesisModel ?? value.model ?? '').trim(),
  }
}

function normalizeBearerToken(value) {
  return String(value || '').trim().replace(/^Bearer\s*;\s*/i, '').replace(/^Bearer\s+/i, '').trim()
}

function resolveVolcengineEndpoint(baseUrl, mode) {
  const trimmed = String(baseUrl || '').replace(/\/+$/, '')
  if (/\/api\/v[13]\/tts/i.test(trimmed)) return trimmed
  if (/openspeech\.bytedance\.com/i.test(trimmed)) {
    return mode === 'v3' ? volcengineDefaultV3Endpoint : volcengineDefaultV1Endpoint
  }
  return mode === 'v3' ? volcengineDefaultV3Endpoint : volcengineDefaultV1Endpoint
}

function resolveVolcengineVoiceId(voiceId, mode) {
  const normalized = normalizeShortText(voiceId, '', 120)
  if (mode === 'v3') {
    if (/^S_|_bigtts$/i.test(normalized)) return normalized
    return volcengineDefaultV3Voice
  }
  if (/^(S_|BV|VC_|zh_)/i.test(normalized)) return normalized
  return volcengineDefaultV1Voice
}

function resolveVolcengineResourceId(value) {
  const resourceId = normalizeShortText(value, 'seed-tts-2.0', 80)
  return isVolcengineResourceId(resourceId) ? resourceId : 'seed-tts-2.0'
}

function normalizeVolcengineSynthesisModel(value) {
  const model = normalizeShortText(value, 'seed-tts-2.0-expressive', 80)
  if (/^seed-tts-2\.0-(expressive|standard)$/i.test(model)) return model
  return 'seed-tts-2.0-expressive'
}

function formatVolcenginePercent(value, min, max) {
  return Math.round(clampNumber((Number(value) - 1) * 100, min, max, 0))
}

function buildVolcengineV1Emotion(tuning) {
  const emotion = mapVolcengineEmotion(tuning.emotion)
  return emotion ? { emotion } : {}
}

function buildVolcengineV3Emotion(tuning) {
  const emotion = mapVolcengineEmotion(tuning.emotion)
  return emotion ? { emotion } : {}
}

function mapVolcengineEmotion(value) {
  const map = {
    cheerful: 'happy',
    shy: 'comfort',
    soft: 'lovey-dovey',
    fragile: 'sad',
    nervous: 'tension',
    sad: 'sad',
    angry: 'angry',
  }
  return map[value] || ''
}

function buildVolcengineV3Additions(instructions, tuning) {
  return {
    context_texts: [instructions].filter(Boolean).slice(0, 1),
    post_process: {
      pitch: Math.round(clampNumber((tuning.pitch - 1) * 24, -12, 12, 0)),
    },
  }
}

function extractVolcengineV3Audio(detail) {
  const direct = parseJsonSafe(detail)
  if (direct?.data && (direct.code === 0 || direct.code === 20000000)) return String(direct.data)
  if (direct?.result?.audio) return String(direct.result.audio)
  if (direct?.audio) return String(direct.audio)

  const chunks = []
  let error = ''
  for (const line of String(detail || '').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) continue
    const payload = parseJsonSafe(trimmed.slice(5).trim())
    if (!payload) continue
    if (payload.data && (payload.code === 0 || payload.code === 20000000)) {
      chunks.push(String(payload.data))
      continue
    }
    if (payload.code && payload.code !== 0 && payload.code !== 20000000) {
      error = payload.message || payload.error || `code ${payload.code}`
    }
  }
  if (error && chunks.length === 0) throw new Error(`火山引擎豆包 TTS 返回错误：${error}`)
  return chunks.length ? Buffer.concat(chunks.map((chunk) => Buffer.from(chunk, 'base64'))).toString('base64') : ''
}

function normalizeVolcengineSpeechResult(audioBase64, profile, model, voiceId) {
  return {
    audioBase64: normalizeAudioData(audioBase64, 'mp3').audioBase64,
    mimeType: 'audio/mpeg',
    provider: profile.name || '火山引擎豆包 TTS',
    model,
    voiceId,
  }
}

function formatVolcengineProviderError(status, detail, profile, model) {
  const providerMessage = extractProviderMessage(detail)
  const providerPrefix = `${profile.name} / ${model}`
  if (status === 401 || status === 403) {
    return `${providerPrefix} 授权没有通过，请检查 AppID、Access Token、Resource ID 或服务是否开通。原始提示：${providerMessage}`
  }
  if (status === 429 || /quota|concurrency|额度|并发|欠费/i.test(providerMessage)) {
    return `${providerPrefix} 额度或并发不足。原始提示：${providerMessage}`
  }
  if (status >= 500) return `${providerPrefix} 上游暂时没有接住。原始提示：${providerMessage || status}`
  return `${providerPrefix} 请求失败：${providerMessage || status}`
}

function formatVolcengineProviderPayloadError(payload, profile, model, rawDetail = '') {
  const message =
    payload?.message ||
    payload?.BaseResp?.StatusMessage ||
    payload?.error ||
    extractProviderMessage(rawDetail) ||
    '没有返回音频数据'
  return `${profile.name || '火山引擎豆包 TTS'} / ${model} 没有生成音频：${message}`
}

function normalizeSpeechText(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) throw new Error('语音生成需要一段文字。')
  return text.slice(0, maxSpeechCharacters)
}

function splitSpeechText(text) {
  if (text.length <= speechChunkCharacters) return [text]

  const pieces = text.match(/[^。！？!?；;]+[。！？!?；;]*/g) ?? [text]
  const chunks = []
  let current = ''

  for (const rawPiece of pieces) {
    let piece = rawPiece.trim()
    if (!piece) continue

    if ((current + piece).length <= speechChunkCharacters) {
      current += piece
      continue
    }

    if (current) {
      chunks.push(current)
      current = ''
    }

    while (piece.length > speechChunkCharacters) {
      chunks.push(piece.slice(0, speechChunkCharacters))
      piece = piece.slice(speechChunkCharacters)
    }
    current = piece
  }

  if (current) chunks.push(current)
  return chunks
}

function normalizeShortText(value, fallback, maxLength) {
  const text = String(value || '').trim()
  return (text || fallback).slice(0, maxLength)
}

function resolveSpeechVoiceId(settings, characterVoice, tuning) {
  if (characterVoice.consentConfirmed && characterVoice.providerVoiceId) {
    return normalizeShortText(characterVoice.providerVoiceId, 'coral', 80)
  }

  const blendVoiceId = tuning.voiceBlendEnabled
    ? [...tuning.voiceBlendLayers]
      .filter((layer) => layer.voiceId && layer.weight > 0)
      .sort((left, right) => right.weight - left.weight)[0]?.voiceId
    : ''

  return normalizeShortText(blendVoiceId || settings.defaultVoiceId, 'coral', 80)
}

function buildVoiceInstructions(characterName, settings, characterVoice, tuning) {
  const parts = [
    `你正在为角色「${normalizeShortText(characterName, '角色', 60)}」生成聊天语音。`,
    normalizeShortText(settings.defaultStylePrompt, '', 360),
    buildTuningInstruction(tuning),
  ]

  if (characterVoice.consentConfirmed && characterVoice.stylePrompt) {
    parts.push(normalizeShortText(characterVoice.stylePrompt, '', 360))
  }

  parts.push('语气自然、清晰、像即时通讯里的语音消息；不要额外朗读舞台说明。')
  return parts.filter(Boolean).join('\n')
}

function normalizeVoiceTuning(settings) {
  return {
    speed: clampNumber(settings.speechRate, 0.65, 1.35, 1),
    pitch: clampNumber(settings.speechPitch, 0.75, 1.25, 1),
    volume: clampNumber(settings.speechVolume, 0.5, 1.5, 1),
    brightness: clampNumber(settings.speechBrightness, 0, 1, 0.5),
    breathiness: clampNumber(settings.speechBreathiness, 0, 1, 0.18),
    tension: clampNumber(settings.speechTension, 0, 1, 0.32),
    warmth: clampNumber(settings.speechWarmth, 0, 1, 0.68),
    styleIntensity: clampNumber(settings.speechStyleIntensity, 0, 1, 0.55),
    emotion: normalizeShortText(settings.speechEmotion, 'natural', 40),
    voiceBlendEnabled: Boolean(settings.voiceBlendEnabled),
    voiceBlendLayers: normalizeVoiceBlendLayers(settings.voiceBlendLayers),
  }
}

function normalizeVoiceBlendLayers(value) {
  if (!Array.isArray(value)) return []

  return value
    .slice(0, 3)
    .map((layer) => {
      const item = layer && typeof layer === 'object' ? layer : {}
      return {
        label: normalizeShortText(item.label, '', 24),
        voiceId: normalizeShortText(item.voiceId, '', 80),
        weight: clampNumber(item.weight, 0, 1, 0),
      }
    })
    .filter((layer) => layer.label || layer.voiceId || layer.weight > 0)
}

function buildTuningInstruction(tuning) {
  const toneLines = [
    `调音盘：语速 ${formatRatio(tuning.speed)}，音高 ${formatRatio(tuning.pitch)}，饱满度 ${formatRatio(tuning.volume)}，清亮度 ${formatPercent(tuning.brightness)}，气声 ${formatPercent(tuning.breathiness)}，松紧感 ${formatPercent(tuning.tension)}，温暖度 ${formatPercent(tuning.warmth)}，情绪风格 ${voiceEmotionLabel(tuning.emotion)}，风格强度 ${formatPercent(tuning.styleIntensity)}。`,
    buildAcousticInstruction(tuning),
  ]

  if (tuning.voiceBlendEnabled) {
    const blendText = tuning.voiceBlendLayers
      .filter((layer) => layer.weight > 0)
      .map((layer) => {
        const name = layer.label || layer.voiceId || '未命名声线'
        return `${name} ${Math.round(layer.weight * 100)}%`
      })
      .join('，')
    if (blendText) toneLines.push(`声线配方参考：${blendText}。如果供应商不支持真正混音，就按这个方向靠近声线气质。`)
  }

  toneLines.push('这些是内部演绎参数，不要把参数本身读出来。')
  return toneLines.join('\n')
}

function formatRatio(value) {
  return `${Number(value).toFixed(2)}x`
}

function formatPercent(value) {
  return `${Math.round(Number(value) * 100)}%`
}

function buildAcousticInstruction(tuning) {
  const brightness = tuning.brightness >= 0.62 ? '更清亮、靠前、齿音清晰但不尖刺' : tuning.brightness <= 0.38 ? '更暗、更低饱和、声音靠后' : '清亮度适中'
  const breathiness = tuning.breathiness >= 0.55 ? '带可控气声和柔软边缘' : tuning.breathiness <= 0.18 ? '发声干净、少漏气' : '保留少量气声'
  const tension = tuning.tension >= 0.62 ? '声带张力略紧，情绪更绷' : tuning.tension <= 0.28 ? '咬字放松，语尾自然落下' : '松紧适中'
  const warmth = tuning.warmth >= 0.62 ? '口腔共鸣温暖、贴近耳边' : tuning.warmth <= 0.38 ? '质感偏冷、距离感更强' : '温暖度适中'
  return `声学方向：${brightness}；${breathiness}；${tension}；${warmth}。`
}

function voiceEmotionLabel(value) {
  const labels = {
    natural: '自然',
    warm: '温柔',
    cheerful: '开心',
    shy: '害羞',
    soft: '软糯',
    fragile: '病弱',
    nervous: '紧张',
    cool: '冷淡',
    sad: '低落',
    angry: '生气',
  }
  return labels[value] ?? normalizeShortText(value, '自然', 40)
}

async function fetchWithTimeout(url, init = {}, timeoutMs = getSpeechTimeoutMs()) {
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

function getSpeechTimeoutMs() {
  return clampNumber(process.env.AI_TTS_REQUEST_TIMEOUT_MS, 15_000, 120_000, defaultSpeechTimeoutMs)
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

function formatChatSpeechProviderError(status, detail, profile) {
  const providerMessage = extractProviderMessage(detail)
  const providerPrefix = `${profile.name} / ${profile.model}`

  if (status === 401 || status === 403) {
    return `${providerPrefix} 的聊天式 TTS 授权没有通过，请检查 API Key 或供应商是否开放该语音模型。原始提示：${providerMessage}`
  }
  if (status === 429 || /balance|quota|credit|额度|余额|欠费/i.test(providerMessage)) {
    return `${providerPrefix} 聊天式 TTS 额度或频率不够。原始提示：${providerMessage}`
  }
  if (status >= 500) {
    return `${providerPrefix} 聊天式 TTS 上游暂时没有接住。原始提示：${providerMessage || status}`
  }

  return `${providerPrefix} 聊天式 TTS 请求失败：${providerMessage || status}`
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
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
