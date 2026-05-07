import type { Dispatch, SetStateAction } from 'react'
import { createSeedState } from '../data/seed'
import type { AppState, ConversationState } from '../domain/types'
import { createId, getConversation, nowIso, upsertConversation } from '../services/memoryEngine'

interface UseConversationCommandsDeps {
  state: AppState
  setState: Dispatch<SetStateAction<AppState>>
  setNotice: Dispatch<SetStateAction<string>>
  clearChatAlert: () => void
  handleDeleteCharacter: (characterId: string) => boolean
}

function toRestorableConversation(conversation: ConversationState): ConversationState {
  return {
    id: conversation.id,
    characterId: conversation.characterId,
    messages: conversation.messages,
    unreadCount: conversation.unreadCount,
    summary: conversation.summary,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  }
}

export function useConversationCommands({
  state,
  setState,
  setNotice,
  clearChatAlert,
  handleDeleteCharacter,
}: UseConversationCommandsDeps) {
  function handleClearConversation(characterId: string) {
    const now = nowIso()
    clearChatAlert()
    setState((currentState) => {
      const existingConversation = getConversation(currentState, characterId)
      return upsertConversation(currentState, {
        ...existingConversation,
        messages: [],
        summary: '',
        updatedAt: now,
      })
    })
    setNotice('聊天记录已清空')
  }

  function handleDeleteConversation(characterId: string) {
    const target = state.characters.find((item) => item.id === characterId)
    const now = nowIso()
    clearChatAlert()
    let movedToTrash = false
    setState((currentState) => {
      const conversation = currentState.conversations.find((item) => item.characterId === characterId)
      if (!conversation) return currentState
      const character = currentState.characters.find((item) => item.id === characterId)
      movedToTrash = true
      return {
        ...currentState,
        conversations: currentState.conversations.filter((item) => item.characterId !== characterId),
        trash: {
          ...currentState.trash,
          conversations: [
            {
              ...conversation,
              characterName: character?.name ?? target?.name ?? '已删除角色',
              character,
              deletedAt: now,
            },
            ...currentState.trash.conversations.filter((item) => item.id !== conversation.id),
          ],
        },
      }
    })
    setNotice(
      movedToTrash
        ? target
          ? `已把和「${target.name}」的会话放入回收花园，角色仍保留`
          : '会话已放入回收花园'
        : '没有可删除的聊天记录',
    )
  }

  function handleDeleteGroupChat(characterId: string): boolean {
    const target = state.characters.find((item) => item.id === characterId)
    if (!target) {
      setNotice('没有找到这个群聊')
      return false
    }
    if (target.relationship !== '群聊') {
      return handleDeleteCharacter(characterId)
    }

    const now = nowIso()
    setState((currentState) => {
      const group = currentState.characters.find((item) => item.id === characterId)
      if (!group) return currentState
      const conversation =
        currentState.conversations.find((item) => item.characterId === characterId) ??
        ({
          id: createId('conversation'),
          characterId,
          messages: [],
          summary: '',
          createdAt: now,
          updatedAt: now,
        } satisfies ConversationState)
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
        trash: {
          ...currentState.trash,
          conversations: [
            {
              ...conversation,
              characterName: group.name,
              character: group,
              deletedAt: now,
            },
            ...currentState.trash.conversations.filter((item) => item.id !== conversation.id),
          ],
        },
      }
    })
    setNotice(`群聊「${target.name}」已放入回收花园`)
    return true
  }

  function handleRestoreConversation(conversationId: string) {
    let restoredName = ''
    let blockedByMissingCharacter = false
    setState((currentState) => {
      const trashedConversation = currentState.trash.conversations.find((item) => item.id === conversationId)
      if (!trashedConversation) return currentState
      const hasCharacter = currentState.characters.some((item) => item.id === trashedConversation.characterId)
      const restoredCharacter = trashedConversation.character
      if (!hasCharacter && !restoredCharacter) {
        blockedByMissingCharacter = true
        return currentState
      }

      const characters =
        hasCharacter || !restoredCharacter
          ? currentState.characters
          : [restoredCharacter, ...currentState.characters]
      const restoredConversation = toRestorableConversation(trashedConversation)
      restoredName = trashedConversation.characterName

      return {
        ...currentState,
        activeCharacterId: restoredConversation.characterId,
        characters,
        conversations: [
          restoredConversation,
          ...currentState.conversations.filter((item) => item.characterId !== restoredConversation.characterId),
        ],
        trash: {
          ...currentState.trash,
          conversations: currentState.trash.conversations.filter((item) => item.id !== conversationId),
        },
      }
    })
    if (blockedByMissingCharacter) {
      setNotice('角色已经不存在，不能恢复这条聊天')
      return
    }
    setNotice(restoredName ? `已恢复「${restoredName}」的聊天` : '聊天已恢复')
  }

  function handleDeleteTrashedConversation(conversationId: string) {
    setState((currentState) => ({
      ...currentState,
      trash: {
        ...currentState.trash,
        conversations: currentState.trash.conversations.filter((item) => item.id !== conversationId),
      },
    }))
    setNotice('聊天已彻底删除')
  }

  return {
    handleClearConversation,
    handleDeleteConversation,
    handleDeleteGroupChat,
    handleRestoreConversation,
    handleDeleteTrashedConversation,
  }
}
