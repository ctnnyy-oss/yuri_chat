import type { Dispatch, SetStateAction } from 'react'
import { createSeedState } from '../data/seed'
import type { AppState, CharacterCard } from '../domain/types'
import { createId, getConversation, nowIso, upsertConversation } from '../services/memoryEngine'
import {
  buildCharacterSystemPrompt,
  buildPersonaGreeting,
  buildPersonaProfile,
  inferPersonaImportBasics,
} from '../services/personaImport'

interface UseCharacterCommandsDeps {
  state: AppState
  setState: Dispatch<SetStateAction<AppState>>
  setNotice: Dispatch<SetStateAction<string>>
}

interface CharacterDraftInput {
  name: string
  relation: string
  mood: string
  persona: string
  voiceProfile?: CharacterCard['voiceProfile']
  groupMemberIds?: string[]
}

export function useCharacterCommands({ state, setState, setNotice }: UseCharacterCommandsDeps) {
  function handleSelectCharacter(characterId: string) {
    setState((currentState) => {
      const conversationForCharacter = getConversation(currentState, characterId)
      return {
        ...upsertConversation(currentState, conversationForCharacter),
        activeCharacterId: characterId,
      }
    })
  }

  function handleCreateCharacter(input: CharacterDraftInput): string {
    const now = nowIso()
    const persona = input.persona.trim() || '还没有导入人设。'
    const inferred = inferPersonaImportBasics(persona)
    const name = input.name.trim() || inferred.name || '新角色'
    const relationInput = input.relation.trim()
    const relation = relationInput && relationInput !== '角色' ? relationInput : inferred.relation || relationInput || '角色'
    const mood = input.mood.trim() || inferred.mood || '等待补全'
    const personaInput = { name, relation, mood, persona }
    const personaProfile = buildPersonaProfile(personaInput)
    const characterId = createId('character')
    const groupMemberIds = dedupeIds(input.groupMemberIds).slice(0, 16)
    const character: CharacterCard = {
      id: characterId,
      name,
      title: relation,
      subtitle: mood,
      avatar: name.slice(0, 1),
      accent: '#ef9ac6',
      relationship: relation,
      mood,
      groupMemberIds: groupMemberIds.length > 0 ? groupMemberIds : undefined,
      tags: ['自定义角色', relation, name],
      systemPrompt: buildCharacterSystemPrompt(personaInput),
      personaSource: persona,
      personaProfile,
      voiceProfile: normalizeVoiceProfile(input.voiceProfile),
      greeting: buildPersonaGreeting(personaInput),
    }
    setState((currentState) => ({
      ...currentState,
      activeCharacterId: characterId,
      characters: [character, ...currentState.characters],
      conversations: [
        {
          id: createId('conversation'),
          characterId,
          messages: [],
          summary: '',
          createdAt: now,
          updatedAt: now,
        },
        ...currentState.conversations,
      ],
    }))
    setNotice(`已添加角色：${name}`)
    return characterId
  }

  function handleUpdateCharacter(input: CharacterDraftInput & { id: string }): boolean {
    const target = state.characters.find((item) => item.id === input.id)
    if (!target) {
      setNotice('没有找到这个角色')
      return false
    }

    const canEdit = target.id.startsWith('character_') || target.tags.includes('自定义角色')
    if (!canEdit) {
      setNotice('内置三对 CP 先保留，后续妹妹确认后再开放编辑')
      return false
    }

    const persona = input.persona.trim() || target.personaSource || target.systemPrompt || '还没有导入人设。'
    const inferred = inferPersonaImportBasics(persona)
    const name = input.name.trim() || inferred.name || target.name
    const relation = input.relation.trim() || inferred.relation || target.relationship || '角色'
    const mood = input.mood.trim() || inferred.mood || target.mood || '等待补全'
    const personaInput = { name, relation, mood, persona }
    const personaProfile = buildPersonaProfile(personaInput)

    setState((currentState) => ({
      ...currentState,
      characters: currentState.characters.map((characterItem) =>
        characterItem.id === input.id
          ? {
              ...characterItem,
              name,
              title: relation,
              subtitle: mood,
              avatar: name.slice(0, 1),
              relationship: relation,
              mood,
              systemPrompt: buildCharacterSystemPrompt(personaInput),
              personaSource: persona,
              personaProfile,
              voiceProfile: normalizeVoiceProfile(input.voiceProfile),
              greeting: buildPersonaGreeting(personaInput),
              tags: ['自定义角色', relation, name],
            }
          : characterItem,
      ),
    }))
    setNotice(`已保存角色：${name}`)
    return true
  }

  function handleDeleteCharacter(characterId: string): boolean {
    const target = state.characters.find((item) => item.id === characterId)
    if (!target) {
      setNotice('没有找到这个角色')
      return false
    }

    const canDelete =
      target.relationship === '群聊' || target.id.startsWith('character_') || target.tags.includes('自定义角色')
    if (!canDelete) {
      setNotice('内置三对 CP 先保留，后续妹妹确认后再开放删除')
      return false
    }

    const now = nowIso()
    setState((currentState) => {
      const remainingCharacters = currentState.characters.filter((item) => item.id !== characterId)
      const nextActiveCharacterId =
        currentState.activeCharacterId === characterId
          ? remainingCharacters[0]?.id ?? createSeedState().activeCharacterId
          : currentState.activeCharacterId

      const movedConversations = currentState.conversations
        .filter((item) => item.characterId === characterId)
        .map((item) => ({
          ...item,
          deletedAt: now,
          characterName: target.name,
          character: target,
        }))

      return {
        ...currentState,
        activeCharacterId: nextActiveCharacterId,
        characters: remainingCharacters,
        conversations: currentState.conversations.filter((item) => item.characterId !== characterId),
        memoryUsageLogs: currentState.memoryUsageLogs.filter((item) => item.characterId !== characterId),
        memoryEvents: currentState.memoryEvents.filter((item) => item.characterId !== characterId),
        trash: {
          ...currentState.trash,
          conversations: [...movedConversations, ...currentState.trash.conversations],
        },
      }
    })
    setNotice(`已移出角色：${target.name}（聊天记录已放进回收花园，30 天内可恢复）`)
    return true
  }

  return {
    handleSelectCharacter,
    handleCreateCharacter,
    handleUpdateCharacter,
    handleDeleteCharacter,
  }
}

function dedupeIds(ids: string[] | undefined): string[] {
  if (!Array.isArray(ids)) return []
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
}

function normalizeVoiceProfile(profile: CharacterCard['voiceProfile']): CharacterCard['voiceProfile'] {
  if (!profile) return undefined
  const displayName = profile.displayName.trim()
  const providerVoiceId = profile.providerVoiceId.trim()
  const stylePrompt = profile.stylePrompt.trim()
  if (!displayName && !providerVoiceId && !stylePrompt) return undefined
  return {
    displayName: displayName || providerVoiceId || '自定义音色',
    providerVoiceId,
    stylePrompt,
    source: profile.source,
    consentConfirmed: Boolean(profile.consentConfirmed),
    updatedAt: profile.updatedAt || nowIso(),
  }
}
