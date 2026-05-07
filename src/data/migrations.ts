import type { AppState, CharacterCard, ConversationState, LongTermMemory, MemoryTombstone } from '../domain/types'
import { refreshLocalMemoryEmbeddingCache } from '../services/memoryEmbeddingIndex'
import { normalizeMemories } from '../services/memoryEngine'
import { normalizeTrashRetentionSettings } from '../services/trashRetention'
import { agentRooms, createSeedState } from './seed'

const currentStateVersion = 24

export function migrateAppState(state: AppState): AppState {
  const defaults = createSeedState()
  const sourceVersion = Number(state.version ?? 0)
  const sourceSettings = state.settings ?? defaults.settings
  const baseMemories = normalizeMemories(state.memories ?? defaults.memories)
  const shouldResetCharacterShell = sourceVersion < 19
  const characters = shouldResetCharacterShell
    ? defaults.characters
    : sanitizeCharacterShell(state.characters ?? defaults.characters, defaults.characters)
  const characterIds = new Set(characters.map((character) => character.id))

  const migrated = {
    ...state,
    version: currentStateVersion,
    activeCharacterId: characterIds.has(state.activeCharacterId) ? state.activeCharacterId : defaults.activeCharacterId,
    characters,
    conversations: stripDefaultGreetingOnlyConversations(
      mergeCoreConversations(state.conversations ?? defaults.conversations, defaults.conversations, characterIds),
      characters,
    ),
    memories: sourceVersion < 10 ? mergeMissingSeedMemories(baseMemories, defaults.memories) : baseMemories,
    trash: {
      memories: normalizeMemories(state.trash?.memories ?? defaults.trash.memories).map((memory, index) => ({
        ...memory,
        deletedAt: state.trash?.memories?.[index]?.deletedAt ?? memory.updatedAt,
      })),
      worldNodes: state.trash?.worldNodes ?? defaults.trash.worldNodes,
    },
    memoryTombstones: normalizeMemoryTombstones(
      Array.isArray(state.memoryTombstones) ? state.memoryTombstones : defaults.memoryTombstones,
    ),
    memoryEmbeddings: refreshLocalMemoryEmbeddingCache(
      baseMemories,
      Array.isArray(state.memoryEmbeddings) ? state.memoryEmbeddings : defaults.memoryEmbeddings,
    ),
    memoryUsageLogs: Array.isArray(state.memoryUsageLogs) ? state.memoryUsageLogs : defaults.memoryUsageLogs,
    memoryEvents: Array.isArray(state.memoryEvents) ? state.memoryEvents : defaults.memoryEvents,
    agentReminders: Array.isArray(state.agentReminders) ? state.agentReminders : defaults.agentReminders,
    agentTasks: Array.isArray(state.agentTasks) ? state.agentTasks : defaults.agentTasks,
    agentMoments: Array.isArray(state.agentMoments) ? state.agentMoments : defaults.agentMoments,
    agentRooms: mergeSeedAgentRooms(Array.isArray(state.agentRooms) ? state.agentRooms : defaults.agentRooms),
    settings: {
      ...defaults.settings,
      ...sourceSettings,
      model: normalizeDefaultModel(sourceSettings.model, sourceSettings.modelProfileId),
      modelProfileId: sourceSettings.modelProfileId || defaults.settings.modelProfileId,
      customAccentColor: normalizeHexColor(sourceSettings.customAccentColor) ?? defaults.settings.customAccentColor,
      dataStorageMode: sourceSettings.dataStorageMode === 'local' ? 'local' : defaults.settings.dataStorageMode,
      maxOutputTokens: clampNumber(sourceSettings.maxOutputTokens, 512, 32768, defaults.settings.maxOutputTokens),
    },
  }

  migrated.settings = normalizeTrashRetentionSettings(migrated.settings)
  const memoryConfidenceFloor = Number(migrated.settings.memoryConfidenceFloor)
  migrated.settings.memoryConfidenceFloor = Number.isNaN(memoryConfidenceFloor)
    ? defaults.settings.memoryConfidenceFloor
    : Math.min(Math.max(memoryConfidenceFloor, 0.5), 0.95)
  return migrated
}

function sanitizeCharacterShell(characters: CharacterCard[], defaultCharacters: CharacterCard[]): CharacterCard[] {
  const defaultIds = new Set(defaultCharacters.map((character) => character.id))
  const customCharacters = characters.filter((character) => {
    if (defaultIds.has(character.id)) return false
    return character.id.startsWith('character_') || (Array.isArray(character.tags) && character.tags.includes('自定义角色'))
  })

  return [...defaultCharacters, ...customCharacters]
}

function mergeSeedAgentRooms(rooms: AppState['agentRooms']): AppState['agentRooms'] {
  const existingIds = new Set(rooms.map((room) => room.id))
  const missingRooms = agentRooms.filter((room) => !existingIds.has(room.id))
  return [...rooms, ...missingRooms]
}

function mergeCoreConversations(
  conversations: AppState['conversations'],
  defaultConversations: AppState['conversations'],
  characterIds: Set<string>,
): AppState['conversations'] {
  const kept = conversations.filter((conversation) => characterIds.has(conversation.characterId))
  const existingCharacterIds = new Set(kept.map((conversation) => conversation.characterId))
  const missingDefaults = defaultConversations.filter((conversation) => !existingCharacterIds.has(conversation.characterId))
  return [...kept, ...missingDefaults]
}

function stripDefaultGreetingOnlyConversations(
  conversations: AppState['conversations'],
  characters: CharacterCard[],
): AppState['conversations'] {
  const greetingByCharacterId = new Map(characters.map((character) => [character.id, character.greeting]))
  return conversations.map((conversation): ConversationState => {
    const [onlyMessage] = conversation.messages
    const greeting = greetingByCharacterId.get(conversation.characterId)
    if (
      conversation.messages.length === 1 &&
      onlyMessage.role === 'assistant' &&
      onlyMessage.content === greeting
    ) {
      return {
        ...conversation,
        messages: [],
        summary: '',
      }
    }
    return conversation
  })
}

function mergeMissingSeedMemories(memories: LongTermMemory[], seedMemories: LongTermMemory[]): LongTermMemory[] {
  const existingIds = new Set(memories.map((memory) => memory.id))
  const missingSeeds = normalizeMemories(seedMemories).filter((memory) => !existingIds.has(memory.id))
  return [...missingSeeds, ...memories]
}

function normalizeMemoryTombstones(tombstones: MemoryTombstone[]): MemoryTombstone[] {
  return tombstones
    .filter((tombstone) => tombstone?.id && tombstone.memoryId && tombstone.fingerprint)
    .map((tombstone) => ({
      id: String(tombstone.id),
      memoryId: String(tombstone.memoryId),
      fingerprint: String(tombstone.fingerprint),
      semanticSignature: Array.isArray(tombstone.semanticSignature)
        ? tombstone.semanticSignature.filter((item) => typeof item === 'string').slice(0, 12)
        : undefined,
      semanticSignatureVersion: typeof tombstone.semanticSignatureVersion === 'number'
        ? tombstone.semanticSignatureVersion
        : undefined,
      reason: String(tombstone.reason || 'legacy'),
      createdAt: tombstone.createdAt || new Date(0).toISOString(),
    }))
}

function normalizeDefaultModel(model: string | undefined, modelProfileId: string | undefined): string {
  if (modelProfileId && model) return model
  if (!model || model === 'gpt-5.5' || model === 'deepseek/deepseek-v4-pro-free' || model === 'deepseek-v4-flash') {
    return ''
  }
  return model
}

function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return null
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return fallback
  return Math.min(max, Math.max(min, numericValue))
}
