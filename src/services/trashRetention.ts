import type { AppSettings, AppState } from '../domain/types'
import { createMemoryTombstone } from './memoryEngine'

export function getTrashRetentionDays(settings: AppSettings): number | null {
  if (settings.trashRetentionMode === 'forever') return null
  if (settings.trashRetentionMode === 'default') return 30
  return clampTrashRetentionDays(settings.trashRetentionDays)
}

export function clampTrashRetentionDays(value: number): number {
  if (Number.isNaN(value)) return 30
  return Math.min(Math.max(Math.round(value), 1), 365)
}

export function normalizeTrashRetentionSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    trashRetentionDays: clampTrashRetentionDays(settings.trashRetentionDays),
  }
}

export function applyTrashRetention(state: AppState, now = new Date()): AppState {
  const days = getTrashRetentionDays(state.settings)
  if (days === null) return state

  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000
  const trashMemories = Array.isArray(state.trash?.memories) ? state.trash.memories : []
  const trashWorldNodes = Array.isArray(state.trash?.worldNodes) ? state.trash.worldNodes : []
  const trashConversations = Array.isArray(state.trash?.conversations) ? state.trash.conversations : []
  const hasLegacyTrashShape =
    !Array.isArray(state.trash?.memories) ||
    !Array.isArray(state.trash?.worldNodes) ||
    !Array.isArray(state.trash?.conversations)

  const memories = trashMemories.filter((memory) => new Date(memory.deletedAt).getTime() >= cutoff)
  const expiredMemories = trashMemories.filter((memory) => new Date(memory.deletedAt).getTime() < cutoff)
  const worldNodes = trashWorldNodes.filter((node) => new Date(node.deletedAt).getTime() >= cutoff)
  const conversations = trashConversations.filter(
    (conversation) => new Date(conversation.deletedAt).getTime() >= cutoff,
  )

  if (
    !hasLegacyTrashShape &&
    memories.length === trashMemories.length &&
    worldNodes.length === trashWorldNodes.length &&
    conversations.length === trashConversations.length
  ) {
    return state
  }

  return {
    ...state,
    memoryTombstones: [
      ...expiredMemories.map((memory) => createMemoryTombstone(memory, 'trash_retention')),
      ...(state.memoryTombstones ?? []),
    ],
    trash: {
      memories,
      worldNodes,
      conversations,
    },
  }
}
