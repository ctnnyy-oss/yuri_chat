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
  const memories = state.trash.memories.filter((memory) => new Date(memory.deletedAt).getTime() >= cutoff)
  const expiredMemories = state.trash.memories.filter((memory) => new Date(memory.deletedAt).getTime() < cutoff)
  const worldNodes = state.trash.worldNodes.filter((node) => new Date(node.deletedAt).getTime() >= cutoff)
  const conversations = state.trash.conversations.filter(
    (conversation) => new Date(conversation.deletedAt).getTime() >= cutoff,
  )

  if (
    memories.length === state.trash.memories.length &&
    worldNodes.length === state.trash.worldNodes.length &&
    conversations.length === state.trash.conversations.length
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
