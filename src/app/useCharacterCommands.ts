import type { Dispatch, SetStateAction } from 'react'
import { createSeedState } from '../data/seed'
import type { AppState, CharacterCard } from '../domain/types'
import { createId, getConversation, nowIso, upsertConversation } from '../services/memoryEngine'
import { buildCharacterSystemPrompt, buildPersonaProfile } from '../services/personaImport'

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
    const name = input.name.trim() || '新角色'
    const relation = input.relation.trim() || '角色'
    const mood = input.mood.trim() || '等待补全'
    const persona = input.persona.trim() || '还没有导入人设。'
    const personaInput = { name, relation, mood, persona }
    const characterId = createId('character')
    const character: CharacterCard = {
      id: characterId,
      name,
      title: relation,
      subtitle: mood,
      avatar: name.slice(0, 1),
      accent: '#ef9ac6',
      relationship: relation,
      mood,
      tags: ['自定义角色', relation, name],
      systemPrompt: buildCharacterSystemPrompt(personaInput),
      personaSource: persona,
      personaProfile: buildPersonaProfile(personaInput),
      greeting: `${name}已经加入百合小窝。`,
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

    const name = input.name.trim() || target.name
    const relation = input.relation.trim() || target.relationship || '角色'
    const mood = input.mood.trim() || target.mood || '等待补全'
    const persona = input.persona.trim() || target.personaSource || target.systemPrompt || '还没有导入人设。'
    const personaInput = { name, relation, mood, persona }

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
              personaProfile: buildPersonaProfile(personaInput),
              greeting: `${name}已经加入百合小窝。`,
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

    setState((currentState) => {
      const remainingCharacters = currentState.characters.filter((item) => item.id !== characterId)
      const nextActiveCharacterId =
        currentState.activeCharacterId === characterId
          ? remainingCharacters[0]?.id ?? createSeedState().activeCharacterId
          : currentState.activeCharacterId

      return {
        ...currentState,
        activeCharacterId: nextActiveCharacterId,
        characters: remainingCharacters,
        conversations: currentState.conversations.filter((item) => item.characterId !== characterId),
        memoryUsageLogs: currentState.memoryUsageLogs.filter((item) => item.characterId !== characterId),
        memoryEvents: currentState.memoryEvents.filter((item) => item.characterId !== characterId),
        trash: {
          ...currentState.trash,
          conversations: currentState.trash.conversations.filter((item) => item.characterId !== characterId),
        },
      }
    })
    setNotice(`已删除：${target.name}`)
    return true
  }

  return {
    handleSelectCharacter,
    handleCreateCharacter,
    handleUpdateCharacter,
    handleDeleteCharacter,
  }
}
