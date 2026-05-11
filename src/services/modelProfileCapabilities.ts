import type { ModelProfileSummary, VoiceSettings } from '../domain/types'

export function isLikelyVoiceOnlyModel(model: string): boolean {
  const normalized = model.toLowerCase()
  return /(^|[-_/.:])tts($|[-_/.:])/.test(normalized)
    || /text[-_]?to[-_]?speech/.test(normalized)
    || /speech[-_]?synthesis/.test(normalized)
    || /voice[-_]?clone|voiceclone|voice[-_]?design|voicedesign/.test(normalized)
    || /^volcano_(icl|tts)$/.test(normalized)
}

export function isLikelyVoiceOnlyProfile(profile?: Pick<ModelProfileSummary, 'model'> | null): boolean {
  return Boolean(profile && isLikelyVoiceOnlyModel(profile.model))
}

export function pickFallbackChatProfile(profiles: ModelProfileSummary[]): ModelProfileSummary | undefined {
  const chatProfiles = profiles.filter((profile) => !isLikelyVoiceOnlyProfile(profile))
  return (
    chatProfiles.find((profile) => profile.isDefault && profile.hasApiKey) ??
    chatProfiles.find((profile) => profile.hasApiKey) ??
    chatProfiles.find((profile) => profile.enabled)
  )
}

export function buildVoiceProfileSettingsPatch(
  profile: Pick<ModelProfileSummary, 'baseUrl' | 'model' | 'name'>,
  voice: VoiceSettings,
): Partial<VoiceSettings> {
  const patch: Partial<VoiceSettings> = {}
  if (profile.model && voice.ttsModel !== profile.model) patch.ttsModel = profile.model

  const defaultVoice = getDefaultVoiceForProfile(profile)
  if (defaultVoice && !isVoiceIdCompatibleWithProfile(profile, voice.defaultVoiceId)) {
    patch.defaultVoiceId = defaultVoice.voiceId
    patch.defaultVoiceLabel = defaultVoice.label
  }

  return patch
}

function getDefaultVoiceForProfile(profile: Pick<ModelProfileSummary, 'baseUrl' | 'model' | 'name'>) {
  const family = detectVoiceProfileFamily(profile)
  if (family === 'xiaomi') return { voiceId: 'mimo_default', label: 'MiMo 默认音色' }
  if (family === 'volcengine') return { voiceId: 'zh_female_vv_uranus_bigtts', label: '豆包默认女声' }
  return { voiceId: 'coral', label: 'Coral' }
}

function isVoiceIdCompatibleWithProfile(
  profile: Pick<ModelProfileSummary, 'baseUrl' | 'model' | 'name'>,
  voiceId: string,
): boolean {
  const normalized = voiceId.trim()
  if (!normalized) return false

  const family = detectVoiceProfileFamily(profile)
  if (family === 'xiaomi') return !isLikelyVolcengineVoice(normalized) && !isLikelyOpenAiBuiltinVoice(normalized)
  if (family === 'volcengine') return !/^mimo[-_]/i.test(normalized) && !isLikelyOpenAiBuiltinVoice(normalized)
  return isLikelyOpenAiBuiltinVoice(normalized)
}

function detectVoiceProfileFamily(profile: Pick<ModelProfileSummary, 'baseUrl' | 'model' | 'name'>) {
  const probe = `${profile.baseUrl} ${profile.model} ${profile.name}`.toLowerCase()
  if (probe.includes('xiaomimimo.com') || /^mimo[-_]/i.test(profile.model)) return 'xiaomi'
  if (
    probe.includes('openspeech.bytedance.com')
    || /^volcano_(icl|tts)$/i.test(profile.model)
    || /(^|[-_])bigtts($|[-_])/.test(probe)
    || /seed-(tts|icl)/.test(probe)
  ) {
    return 'volcengine'
  }
  return 'openai'
}

function isLikelyVolcengineVoice(value: string): boolean {
  return /^S_/i.test(value) || /^zh_/i.test(value) || /_bigtts$/i.test(value) || /^BV/i.test(value)
}

function isLikelyOpenAiBuiltinVoice(value: string): boolean {
  return /^(alloy|ash|ballad|coral|echo|fable|nova|onyx|sage|shimmer|verse)$/i.test(value)
}
