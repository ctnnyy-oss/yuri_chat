import type { LongTermMemory, MemorySearchOptions, MemoryStore, MemoryScope } from '../domain/types'
import { consolidateMemoryGarden, getKeywordOverlap, getMemorySemanticSimilarity, normalizeMemory, scoreMemory, serializeMemoryScope } from './memoryCore'

export function createArrayMemoryStore(initialMemories: LongTermMemory[] = []): MemoryStore {
  let memories = initialMemories.map((memory) => normalizeMemory(memory))

  return {
    async addMemory(memory) {
      const normalized = normalizeMemory(memory)
      memories = [normalized, ...memories.filter((item) => item.id !== normalized.id)]
      return normalized
    },

    async updateMemory(memoryId, patch) {
      let updated: LongTermMemory | null = null
      memories = memories.map((memory) => {
        if (memory.id !== memoryId) return memory
        updated = normalizeMemory({ ...memory, ...patch, id: memory.id })
        return updated
      })
      return updated
    },

    async deleteMemory(memoryId) {
      const before = memories.length
      memories = memories.filter((memory) => memory.id !== memoryId)
      return memories.length !== before
    },

    async getMemoryById(memoryId) {
      return memories.find((memory) => memory.id === memoryId) ?? null
    },

    async searchMemories(options: MemorySearchOptions) {
      const query = options.query ?? ''
      return memories
        .filter((memory) => memory.status === 'active')
        .filter((memory) => options.includeSensitive || memory.sensitivity !== 'critical')
        .filter((memory) => !options.scope || memory.scope.kind === options.scope)
        .filter((memory) => isMemoryInSearchContext(memory, options))
        .filter((memory) => !query || isMemorySearchMatch(memory, query))
        .sort((left, right) => scoreMemory(right, query) - scoreMemory(left, query))
        .slice(0, options.maxItems ?? 10)
    },

    async listMemoriesByScope(scope: MemoryScope) {
      const key = serializeMemoryScope(scope)
      return memories.filter((memory) => serializeMemoryScope(memory.scope) === key)
    },

    async consolidateMemories() {
      const report = consolidateMemoryGarden(memories)
      memories = report.memories
      return report
    },
  }
}

function isMemoryInSearchContext(memory: LongTermMemory, options: MemorySearchOptions): boolean {
  const scope = memory.scope
  if (scope.kind === 'relationship' || scope.kind === 'character_private') {
    return !options.characterId || scope.characterId === options.characterId
  }
  if (scope.kind === 'conversation') {
    return !options.conversationId || scope.conversationId === options.conversationId
  }
  return true
}

function isMemorySearchMatch(memory: LongTermMemory, query: string): boolean {
  const text = `${memory.title} ${memory.body} ${memory.tags.join(' ')}`
  return getKeywordOverlap(text, query) > 0 || getMemorySemanticSimilarity(text, query) >= 0.12
}
