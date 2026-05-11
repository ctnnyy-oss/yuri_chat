import type { ModelProfileSummary } from '../domain/types'

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
