import type { Dispatch, SetStateAction } from 'react'
import type { AppState, LongTermMemory, WorldNode } from '../domain/types'
import type { MemoryFeedbackAction } from '../services/memoryFeedback'
import {
  consolidateMemoryGarden,
  createManualMemory,
  createMemorySourceFromMessage,
  createMemoryTombstone,
  nowIso,
  restoreMemoryRevision,
  updateMemoryWithRevision,
} from '../services/memoryEngine'
import { mergeMemories } from '../services/memoryCore'
import { applyMemoryFeedback } from '../services/memoryFeedback'
import { addMemoryEventToState } from './agentActions'

interface UseMemoryActionsDeps {
  state: AppState
  setState: Dispatch<SetStateAction<AppState>>
  setNotice: Dispatch<SetStateAction<string>>
  characterId: string
  characterName: string
  conversationId: string
  conversationMessages: Array<{ role: string; content: string }>
}

export function useMemoryActions({
  state,
  setState,
  setNotice,
  characterId,
  characterName,
  conversationId,
  conversationMessages,
}: UseMemoryActionsDeps) {
  function handleAddMemory() {
    const recentUserMessages = conversationMessages.filter((message) => message.role === 'user').slice(-4)
    const recentText = recentUserMessages.map((message) => message.content).join(' / ')

    const body = recentText || '妹妹暂时还没有新的聊天内容，先保留一条空记忆位。'
    const memory = createManualMemory({
      title: '手动整理的记忆',
      body: body.slice(0, 260),
      tags: ['手动整理', characterName],
      priority: 4,
      pinned: false,
      kind: 'event',
      confidence: recentUserMessages.length > 0 ? 0.9 : 0.55,
      sources: recentUserMessages.map((message) =>
        createMemorySourceFromMessage(message as Parameters<typeof createMemorySourceFromMessage>[0], { id: conversationId } as Parameters<typeof createMemorySourceFromMessage>[1], { id: characterId, name: characterName } as Parameters<typeof createMemorySourceFromMessage>[2]),
      ),
      reason: '手动整理最近聊天',
    })

    setState((currentState) =>
      addMemoryEventToState(
        {
          ...currentState,
          memories: [memory, ...currentState.memories],
        },
        {
          type: 'created',
          actor: 'user',
          title: memory.title,
          detail: '妹妹手动从最近聊天整理出一条记忆。',
          memoryIds: [memory.id],
          characterId,
          conversationId,
        },
      ),
    )
    setNotice('最近聊天已整理')
  }

  function handleUpdateMemory(updatedMemory: LongTermMemory) {
    setState((currentState) => {
      const previousMemory = currentState.memories.find((memory) => memory.id === updatedMemory.id)
      const mergeTargetId = previousMemory?.status === 'candidate' && updatedMemory.status === 'active'
        ? previousMemory.mergeSuggestion?.targetMemoryId
        : undefined

      if (mergeTargetId) {
        const mergeTarget = currentState.memories.find((memory) => memory.id === mergeTargetId && memory.status === 'active')
        if (mergeTarget) {
          const mergedMemory = mergeMemories(mergeTarget, { ...updatedMemory, status: 'active' }, '妹妹确认候选合并')
          return addMemoryEventToState(
            {
              ...currentState,
              memories: currentState.memories.flatMap((memory) => {
                if (memory.id === mergeTarget.id) return [mergedMemory]
                if (memory.id === updatedMemory.id) return []
                return [memory]
              }),
            },
            {
              type: 'confirmed',
              actor: 'user',
              title: mergedMemory.title,
              detail: `候选记忆已合并到「${mergeTarget.title}」。`,
              memoryIds: [mergeTarget.id, updatedMemory.id],
              characterId,
              conversationId,
            },
          )
        }
      }

      const nextMemories = currentState.memories.map((memory) =>
        memory.id === updatedMemory.id ? updateMemoryWithRevision(memory, updatedMemory, '妹妹手动编辑') : memory,
      )
      const eventType = previousMemory?.status === 'candidate' && updatedMemory.status === 'active' ? 'confirmed' : 'edited'
      const detail = eventType === 'confirmed' ? '候选记忆被确认生效。' : '妹妹手动修改了记忆档案。'

      return addMemoryEventToState(
        {
          ...currentState,
          memories: nextMemories,
        },
        {
          type: eventType,
          actor: 'user',
          title: updatedMemory.title,
          detail,
          memoryIds: [updatedMemory.id],
          characterId,
          conversationId,
        },
      )
    })
    setNotice('记忆已修改')
  }

  function handleMemoryFeedbackFromChat(memoryId: string, action: MemoryFeedbackAction) {
    const currentMemory = state.memories.find((item) => item.id === memoryId)
    if (!currentMemory) {
      setNotice('这条记忆暂时没有找到')
      return
    }

    const noticeText = applyMemoryFeedback(currentMemory, action).notice

    setState((currentState) => {
      const memory = currentState.memories.find((item) => item.id === memoryId)
      if (!memory) return currentState

      const feedback = applyMemoryFeedback(memory, action)
      const updatedMemory = updateMemoryWithRevision(
        memory,
        feedback.memory,
        feedback.revisionReason,
      )

      return addMemoryEventToState(
        {
          ...currentState,
          memories: currentState.memories.map((item) => (item.id === memoryId ? updatedMemory : item)),
        },
        {
          type: 'usage_feedback',
          actor: 'user',
          title: memory.title,
          detail: feedback.detail,
          memoryIds: [memory.id],
          characterId,
          conversationId,
        },
      )
    })
    setNotice(noticeText)
  }

  function handleOrganizeMemories() {
    const report = consolidateMemoryGarden(state.memories)
    setState((currentState) =>
      addMemoryEventToState(
        {
          ...currentState,
          memories: report.memories,
        },
        {
          type: 'organized',
          actor: 'system',
          title: '后台整理',
          detail:
            report.mergedCount > 0 || report.reflectedCount > 0
              ? `检查 ${report.reviewedCount} 条记忆，合并 ${report.mergedCount} 条重复内容，生成 ${report.reflectedCount} 条反思候选。`
              : `检查 ${report.reviewedCount} 条记忆，暂时不需要合并。`,
          memoryIds: report.memories.slice(0, 8).map((memory) => memory.id),
          characterId,
        },
      ),
    )
    setNotice(
      report.mergedCount > 0 || report.reflectedCount > 0
        ? `已整理 ${report.reviewedCount} 条，合并 ${report.mergedCount} 条，生成 ${report.reflectedCount} 条反思候选`
        : '记忆系统已检查',
    )
  }

  function handleRestoreMemoryRevision(memoryId: string, revisionId: string) {
    setState((currentState) => {
      const currentMemory = currentState.memories.find((memory) => memory.id === memoryId)
      const restoredMemory = currentMemory ? restoreMemoryRevision(currentMemory, revisionId) : null

      return addMemoryEventToState(
        {
          ...currentState,
          memories: currentState.memories.map((memory) => (memory.id === memoryId ? restoredMemory ?? memory : memory)),
        },
        {
          type: 'revision_restored',
          actor: 'user',
          title: restoredMemory?.title ?? currentMemory?.title ?? '记忆回滚',
          detail: '从版本线恢复了一版记忆内容。',
          memoryIds: [memoryId],
          characterId,
          conversationId,
        },
      )
    })
    setNotice('记忆已回滚')
  }

  function handleTrashMemory(memoryId: string) {
    setState((currentState) => {
      const memory = currentState.memories.find((item) => item.id === memoryId)
      if (!memory) return currentState

      return addMemoryEventToState(
        {
          ...currentState,
          memories: currentState.memories.filter((item) => item.id !== memoryId),
          trash: {
            ...currentState.trash,
            memories: [{ ...memory, status: 'trashed' as const, deletedAt: nowIso() }, ...currentState.trash.memories],
          },
        },
        {
          type: 'trashed',
          actor: 'user',
          title: memory.title,
          detail: '记忆移入回收花园，仍然可以恢复。',
          memoryIds: [memory.id],
          characterId,
          conversationId,
        },
      )
    })
    setNotice('记忆已放入回收花园')
  }

  function handleUpdateWorldNode(updatedNode: WorldNode) {
    setState((currentState) => ({
      ...currentState,
      worldNodes: currentState.worldNodes.map((node) => (node.id === updatedNode.id ? updatedNode : node)),
    }))
    setNotice('世界树已修改')
  }

  function handleTrashWorldNode(nodeId: string) {
    setState((currentState) => {
      const node = currentState.worldNodes.find((item) => item.id === nodeId)
      if (!node) return currentState

      return {
        ...currentState,
        worldNodes: currentState.worldNodes.filter((item) => item.id !== nodeId),
        trash: {
          ...currentState.trash,
          worldNodes: [{ ...node, deletedAt: nowIso() }, ...currentState.trash.worldNodes],
        },
      }
    })
    setNotice('世界树节点已放入回收花园')
  }

  function handleRestoreMemory(memoryId: string) {
    setState((currentState) => {
      const memory = currentState.trash.memories.find((item) => item.id === memoryId)
      if (!memory) return currentState

      return addMemoryEventToState(
        {
          ...currentState,
          memories: [{ ...memory, status: 'active' as const, updatedAt: nowIso() }, ...currentState.memories],
          trash: {
            ...currentState.trash,
            memories: currentState.trash.memories.filter((item) => item.id !== memoryId),
          },
        },
        {
          type: 'restored',
          actor: 'user',
          title: memory.title,
          detail: '记忆从回收花园恢复为可用状态。',
          memoryIds: [memory.id],
          characterId,
          conversationId,
        },
      )
    })
    setNotice('记忆已恢复')
  }

  function handleRestoreWorldNode(nodeId: string) {
    setState((currentState) => {
      const node = currentState.trash.worldNodes.find((item) => item.id === nodeId)
      if (!node) return currentState

      const restoredNode: WorldNode = {
        id: node.id,
        title: node.title,
        keywords: node.keywords,
        content: node.content,
        priority: node.priority,
        enabled: node.enabled,
      }
      return {
        ...currentState,
        worldNodes: [restoredNode, ...currentState.worldNodes],
        trash: {
          ...currentState.trash,
          worldNodes: currentState.trash.worldNodes.filter((item) => item.id !== nodeId),
        },
      }
    })
    setNotice('世界树节点已恢复')
  }

  function handleDeleteTrashedMemory(memoryId: string) {
    setState((currentState) => {
      const deletedMemory = currentState.trash.memories.find((item) => item.id === memoryId)

      return addMemoryEventToState(
        {
          ...currentState,
          memoryTombstones: [
            ...currentState.trash.memories
              .filter((item) => item.id === memoryId)
              .map((memory) => createMemoryTombstone(memory, 'user_permanent_delete')),
            ...currentState.memoryTombstones,
          ],
          trash: {
            ...currentState.trash,
            memories: currentState.trash.memories.filter((item) => item.id !== memoryId),
          },
        },
        {
          type: 'permanently_deleted',
          actor: 'user',
          title: deletedMemory?.title ?? '彻底删除记忆',
          detail: '记忆被永久删除，并留下防复活指纹。',
          memoryIds: [memoryId],
          characterId,
          conversationId,
        },
      )
    })
    setNotice('记忆已彻底删除')
  }

  function handleDeleteTrashedWorldNode(nodeId: string) {
    setState((currentState) => ({
      ...currentState,
      trash: {
        ...currentState.trash,
        worldNodes: currentState.trash.worldNodes.filter((item) => item.id !== nodeId),
      },
    }))
    setNotice('世界树节点已彻底删除')
  }

  function handleEmptyTrash() {
    setState((currentState) =>
      addMemoryEventToState(
        {
          ...currentState,
          memoryTombstones: [
            ...currentState.trash.memories.map((memory) => createMemoryTombstone(memory, 'empty_trash')),
            ...currentState.memoryTombstones,
          ],
          trash: {
            memories: [],
            worldNodes: [],
            conversations: [],
          },
        },
        {
          type: 'trash_emptied',
          actor: 'user',
          title: '清空回收花园',
          detail: `清空了 ${currentState.trash.memories.length} 条记忆、${currentState.trash.worldNodes.length} 个世界树节点和 ${currentState.trash.conversations.length} 条聊天。`,
          memoryIds: currentState.trash.memories.map((memory) => memory.id),
          characterId,
        },
      ),
    )
    setNotice('回收花园已清空')
  }

  return {
    handleAddMemory,
    handleDeleteTrashedMemory,
    handleDeleteTrashedWorldNode,
    handleEmptyTrash,
    handleMemoryFeedbackFromChat,
    handleOrganizeMemories,
    handleRestoreMemory,
    handleRestoreMemoryRevision,
    handleRestoreWorldNode,
    handleTrashMemory,
    handleTrashWorldNode,
    handleUpdateMemory,
    handleUpdateWorldNode,
  }
}
