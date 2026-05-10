import { useEffect, useState } from 'react'
import type { CharacterCard, CharacterVoiceProfile } from '../../domain/types'

export type ManagedRole = {
  id: string
  name: string
  avatar: string
  accent: string
  relation: string
  mood: string
  persona: string
  voiceProfile?: CharacterVoiceProfile
  source: '内置' | '自定义'
}

export type RoleDraft = {
  name: string
  relation: string
  mood: string
  persona: string
  voiceDisplayName: string
  voiceId: string
  voicePrompt: string
  voiceConsentConfirmed: boolean
}

export type MobileEditorMode = 'closed' | 'create' | 'view'

export const LONG_PRESS_MS = 560

const MOBILE_VIEWPORT_QUERY = '(max-width: 760px)'

export function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_VIEWPORT_QUERY).matches,
  )
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mediaQuery = window.matchMedia(MOBILE_VIEWPORT_QUERY)
    const handler = (event: MediaQueryListEvent) => setIsMobile(event.matches)
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])
  return isMobile
}

export function isCustomRole(character: CharacterCard) {
  return character.id.startsWith('character_') || character.tags.includes('自定义角色')
}

export function isGroupCharacter(character: CharacterCard) {
  return character.relationship === '群聊'
}

export function toManagedRole(character: CharacterCard): ManagedRole {
  return {
    id: character.id,
    name: character.name,
    avatar: character.avatar,
    accent: character.accent,
    relation: character.relationship,
    mood: character.mood,
    persona: character.personaSource ?? character.systemPrompt,
    voiceProfile: character.voiceProfile,
    source: isCustomRole(character) ? '自定义' : '内置',
  }
}

export function toRoleDraft(role?: ManagedRole): RoleDraft {
  return {
    name: role?.name ?? '',
    relation: role?.relation ?? '角色',
    mood: role?.mood ?? '',
    persona: role?.persona ?? '',
    voiceDisplayName: role?.voiceProfile?.displayName ?? '',
    voiceId: role?.voiceProfile?.providerVoiceId ?? '',
    voicePrompt: role?.voiceProfile?.stylePrompt ?? '',
    voiceConsentConfirmed: Boolean(role?.voiceProfile?.consentConfirmed),
  }
}

export function blankRoleDraft(): RoleDraft {
  return {
    name: '',
    relation: '角色',
    mood: '',
    persona: '',
    voiceDisplayName: '',
    voiceId: '',
    voicePrompt: '',
    voiceConsentConfirmed: false,
  }
}

export function roleMatchesQuery(role: ManagedRole, query: string) {
  if (!query) return true
  return [role.name, role.relation, role.mood].join(' ').toLowerCase().includes(query)
}

export function buildVoiceProfileFromDraft(draft: RoleDraft): CharacterVoiceProfile | undefined {
  const providerVoiceId = draft.voiceId.trim()
  const displayName = draft.voiceDisplayName.trim() || providerVoiceId
  const stylePrompt = draft.voicePrompt.trim()
  if (!providerVoiceId && !displayName && !stylePrompt) return undefined
  return {
    displayName: displayName || '自定义音色',
    providerVoiceId,
    stylePrompt,
    source: 'custom',
    consentConfirmed: draft.voiceConsentConfirmed,
    updatedAt: new Date().toISOString(),
  }
}
