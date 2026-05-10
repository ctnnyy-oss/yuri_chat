import type { AppSettings, CharacterVoiceProfile } from '../domain/types'
import { ApiResponseError, apiFetch, isStaticPreviewHost } from './apiClient'
import { getSavedCloudToken } from './cloudSync'

export interface SpeechAudioRequest {
  text: string
  characterName: string
  characterVoice?: CharacterVoiceProfile
  settings: AppSettings
}

export interface SpeechAudioResult {
  audioUrl: string
  mimeType: string
  provider: string
  voiceId: string
}

export async function requestSpeechAudio(request: SpeechAudioRequest): Promise<SpeechAudioResult> {
  if (request.settings.voice.provider === 'browser') {
    throw new Error('当前选择的是浏览器朗读，不需要请求后端语音模型。')
  }

  try {
    const response = await apiFetch('/api/voice/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      token: getSavedCloudToken(),
      timeoutMs: 60_000,
      timeoutMessage: '语音生成超时：TTS 模型响应太慢，可以稍后再试或切到浏览器朗读。',
      errorFormatter: formatSpeechError,
    })
    const data = await response.json()
    const mimeType = String(data.mimeType || 'audio/mpeg')
    const audioBase64 = String(data.audioBase64 || '')
    if (!audioBase64) throw new Error('语音模型没有返回音频。')
    return {
      audioUrl: `data:${mimeType};base64,${audioBase64}`,
      mimeType,
      provider: String(data.provider || 'openai-compatible'),
      voiceId: String(data.voiceId || request.characterVoice?.providerVoiceId || request.settings.voice.defaultVoiceId),
    }
  } catch (error) {
    if (isStaticPreviewHost() && (!(error instanceof ApiResponseError) || error.status === 404)) {
      throw new Error('静态预览没有连接语音后端。', { cause: error })
    }
    throw error
  }
}

export function speakWithBrowserVoice(text: string, rate = 1): boolean {
  if (typeof window === 'undefined' || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') return false
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'zh-CN'
  utterance.rate = Math.min(1.35, Math.max(0.65, rate))
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
  return true
}

export function stopBrowserSpeech() {
  if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel()
}

function formatSpeechError(status: number, detail: string): string {
  const suffix = detail ? ` ${detail}` : ''
  if (status === 400) return `400 语音参数有问题：请检查 TTS 模型名、音色 ID 或文本长度。${suffix}`
  if (status === 401) return `401 语音授权失败：请重新登录，或检查模型档案里的 API Key。${suffix}`
  if (status === 402 || status === 403) return `${status} 语音额度或权限不足：供应商可能没有开放 TTS。${suffix}`
  if (status === 404) return `404 语音接口不存在：当前中转站可能不支持 /audio/speech。${suffix}`
  if (status === 429) return `429 语音请求过快：上游限流了，稍等再试。${suffix}`
  if (status >= 500) return `${status} 语音服务暂时异常：通常是中转站或供应商波动。${suffix}`
  return `${status} 语音请求失败。${suffix}`
}
