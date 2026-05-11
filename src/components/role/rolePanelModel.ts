import { useEffect, useState } from 'react'
import type { CharacterCard, CharacterVoiceProfile } from '../../domain/types'
import { buildPersonaProfile, exportPersonaProfileToCharacterCardV2 } from '../../services/personaImport'

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

export function applyPersonaImportTemplate(draft: RoleDraft): string {
  const current = draft.persona.trim()
  const name = draft.name.trim() || '角色名'
  const relation = draft.relation.trim() || '和用户/其他角色的关系'
  const mood = draft.mood.trim() || '性格底色'
  const template = [
    `身份：${name}，年龄/身份/世界观位置。`,
    `关系：${relation}。写清她和用户、CP、朋友、家人、对手分别是什么关系。`,
    `性格：${mood}。写“她遇到什么会怎么做”，少堆形容词。`,
    '说话方式：常用称呼、句长、口癖、会不会吐槽/撒娇/冷淡、不会出现的客服腔。',
    '情绪模式：什么会心软、吃醋、生气、逃避、主动靠近。',
    '经历：1-3 个让她形成现在性格的具体事件。',
    '目标：她长期想守住、得到、逃离或证明什么。',
    '边界：她不知道什么、不能乱编什么、关系不能突然越到哪里。',
    '互动规则：面对安慰、任务、亲密追问、身份追问时，她会怎样自然回应。',
    '',
    '用户：你是不是在担心我？',
    `${name}：写一条最像她的回复。`,
    '用户：你到底是谁？',
    `${name}：写一条防破甲但不出戏的回复。`,
    '',
    '也可以直接粘贴 Character Card V2 / Tavern JSON；姐姐会识别 description、personality、scenario、first_mes、mes_example、post_history_instructions 和 character_book。',
  ].join('\n')

  if (!current) return template
  if (/身份[:：]|说话方式[:：]|用户[:：]/.test(current)) return current
  return [current, '', '--- 可补的人设结构 ---', template].join('\n')
}

export function exportRoleDraftToCharacterCardV2(draft: RoleDraft): string {
  const name = draft.name.trim() || '角色'
  const profile = buildPersonaProfile({
    name,
    relation: draft.relation.trim() || '角色',
    mood: draft.mood.trim() || '性格待补充',
    persona: draft.persona.trim() || '还没有导入人设。',
  })
  return JSON.stringify(exportPersonaProfileToCharacterCardV2(profile), null, 2)
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
