import type { AppState, CharacterCard, ConversationState, LongTermMemory, MemoryTombstone } from '../domain/types'
import { refreshLocalMemoryEmbeddingCache } from '../services/memoryEmbeddingIndex'
import { normalizeMemories } from '../services/memoryEngine'
import { normalizeTrashRetentionSettings } from '../services/trashRetention'
import { agentRooms, createSeedState } from './seed'

const currentStateVersion = 28
const legacyDefaultRoomId = 'room-yuri-nest'
const currentDefaultRoomId = 'room-yuri-chat'

export function migrateAppState(state: AppState): AppState {
  const defaults = createSeedState()
  const sourceVersion = Number(state.version ?? 0)
  const sourceSettings = state.settings ?? defaults.settings
  const baseMemories = normalizeMemories(state.memories ?? defaults.memories)
  const memories = replaceSeedMemories(
    sourceVersion < 10 ? mergeMissingSeedMemories(baseMemories, defaults.memories) : baseMemories,
    defaults.memories,
    sourceVersion < 27,
  )
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
    memories,
    worldNodes: mergeSeedWorldNodes(state.worldNodes ?? defaults.worldNodes, defaults.worldNodes, sourceVersion < 27),
    trash: {
      memories: normalizeMemories(state.trash?.memories ?? defaults.trash.memories).map((memory, index) => ({
        ...memory,
        deletedAt: state.trash?.memories?.[index]?.deletedAt ?? memory.updatedAt,
      })),
      worldNodes: state.trash?.worldNodes ?? defaults.trash.worldNodes,
      conversations: normalizeTrashedConversations(state.trash?.conversations ?? defaults.trash.conversations, characters),
    },
    memoryTombstones: normalizeMemoryTombstones(
      Array.isArray(state.memoryTombstones) ? state.memoryTombstones : defaults.memoryTombstones,
    ),
    memoryEmbeddings: refreshLocalMemoryEmbeddingCache(
      memories,
      Array.isArray(state.memoryEmbeddings) ? state.memoryEmbeddings : defaults.memoryEmbeddings,
    ),
    memoryUsageLogs: Array.isArray(state.memoryUsageLogs) ? state.memoryUsageLogs : defaults.memoryUsageLogs,
    memoryEvents: Array.isArray(state.memoryEvents) ? state.memoryEvents : defaults.memoryEvents,
    agentReminders: Array.isArray(state.agentReminders) ? state.agentReminders : defaults.agentReminders,
    agentTasks: Array.isArray(state.agentTasks) ? state.agentTasks : defaults.agentTasks,
    agentMoments: Array.isArray(state.agentMoments) ? state.agentMoments : defaults.agentMoments,
    agentRooms: mergeSeedAgentRooms(Array.isArray(state.agentRooms) ? state.agentRooms : defaults.agentRooms, sourceVersion < 27),
    settings: {
      ...defaults.settings,
      ...sourceSettings,
      model: normalizeDefaultModel(sourceSettings.model, sourceSettings.modelProfileId),
      modelProfileId: sourceSettings.modelProfileId || defaults.settings.modelProfileId,
      customAccentColor: normalizeHexColor(sourceSettings.customAccentColor) ?? defaults.settings.customAccentColor,
      dataStorageMode: sourceSettings.dataStorageMode === 'local' ? 'local' : defaults.settings.dataStorageMode,
      maxOutputTokens: clampNumber(sourceSettings.maxOutputTokens, 512, 32768, defaults.settings.maxOutputTokens),
      groupChatHumanMode: sourceSettings.groupChatHumanMode !== false,
      groupChatMaxAutoReplies: clampNumber(
        sourceSettings.groupChatMaxAutoReplies,
        1,
        4,
        defaults.settings.groupChatMaxAutoReplies,
      ),
    },
  }

  migrated.settings = normalizeTrashRetentionSettings(migrated.settings)
  const memoryConfidenceFloor = Number(migrated.settings.memoryConfidenceFloor)
  migrated.settings.memoryConfidenceFloor = Number.isNaN(memoryConfidenceFloor)
    ? defaults.settings.memoryConfidenceFloor
    : Math.min(Math.max(memoryConfidenceFloor, 0.5), 0.95)
  return migrated
}

function normalizeTrashedConversations(
  conversations: AppState['trash']['conversations'],
  characters: CharacterCard[],
): AppState['trash']['conversations'] {
  const characterById = new Map(characters.map((character) => [character.id, character]))
  return conversations
    .filter((conversation) => conversation?.id && conversation.characterId)
    .map((conversation) => {
      const character = conversation.character ?? characterById.get(conversation.characterId)
      return {
        ...conversation,
        characterName: conversation.characterName || character?.name || '已删除角色',
        character,
        deletedAt: conversation.deletedAt || conversation.updatedAt || new Date(0).toISOString(),
      }
    })
}

function sanitizeCharacterShell(characters: CharacterCard[], defaultCharacters: CharacterCard[]): CharacterCard[] {
  const defaultIds = new Set(defaultCharacters.map((character) => character.id))
  const customCharacters = characters.filter((character) => {
    if (defaultIds.has(character.id)) return false
    return character.id.startsWith('character_') || (Array.isArray(character.tags) && character.tags.includes('自定义角色'))
  })

  return [...defaultCharacters, ...customCharacters]
}

function mergeSeedAgentRooms(rooms: AppState['agentRooms'], replaceExistingSeeds = false): AppState['agentRooms'] {
  const seedRoomsById = new Map(agentRooms.map((room) => [room.id, room]))
  const normalizedRooms = dedupeAgentRooms(
    rooms.map((room) => (room.id === legacyDefaultRoomId ? { ...room, id: currentDefaultRoomId } : room)),
  )
  const mergedRooms = normalizedRooms.map((room) => {
    const seedRoom = seedRoomsById.get(room.id)
    return replaceExistingSeeds && seedRoom
      ? {
          ...seedRoom,
          messages: room.messages,
          updatedAt: room.updatedAt,
        }
      : room
  })
  const existingIds = new Set(mergedRooms.map((room) => room.id))
  const missingRooms = agentRooms.filter((room) => !existingIds.has(room.id))
  return [...mergedRooms, ...missingRooms]
}

function dedupeAgentRooms(rooms: AppState['agentRooms']): AppState['agentRooms'] {
  const roomById = new Map<string, AppState['agentRooms'][number]>()
  for (const room of rooms) {
    const existing = roomById.get(room.id)
    if (!existing) {
      roomById.set(room.id, room)
      continue
    }
    const roomMessageCount = Array.isArray(room.messages) ? room.messages.length : 0
    const existingMessageCount = Array.isArray(existing.messages) ? existing.messages.length : 0
    if (roomMessageCount > existingMessageCount || room.updatedAt > existing.updatedAt) {
      roomById.set(room.id, room)
    }
  }
  return [...roomById.values()]
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

function replaceSeedMemories(
  memories: LongTermMemory[],
  seedMemories: LongTermMemory[],
  replaceExistingSeeds = false,
): LongTermMemory[] {
  const seedMemoriesById = new Map(normalizeMemories(seedMemories).map((memory) => [memory.id, memory]))
  const replacedMemories = memories.map((memory) => {
    const seedMemory = seedMemoriesById.get(memory.id)
    if (!replaceExistingSeeds || !seedMemory || memory.userEdited || memory.origin !== 'seed') return memory
    return {
      ...seedMemory,
      accessCount: memory.accessCount,
      createdAt: memory.createdAt,
      revisions: memory.revisions,
    }
  })
  return mergeMissingSeedMemories(replacedMemories, seedMemories)
}

function mergeSeedWorldNodes(
  nodes: AppState['worldNodes'],
  seedNodes: AppState['worldNodes'],
  replaceExistingSeeds = false,
): AppState['worldNodes'] {
  const seedNodesById = new Map(seedNodes.map((node) => [node.id, node]))
  const replacedNodes = nodes.map((node) => {
    const seedNode = seedNodesById.get(node.id)
    if (!replaceExistingSeeds || !seedNode) return node
    return seedNode
  })
  const existingIds = new Set(replacedNodes.map((node) => node.id))
  const missingSeeds = seedNodes.filter((node) => !existingIds.has(node.id))
  return [...replacedNodes, ...missingSeeds]
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
