import type { LongTermMemory, MemoryEmbeddingRecord, PromptContextBlock, WorldNode } from '../domain/types'
import { memoryKindLabels } from '../domain/memoryLabels'
import {
  normalizeMemory,
  scoreMemory,
  isCoreMemoryAnchor,
  isMemoryAllowedInContext,
  isMemoryMentionable,
  isMemoryRelevantEnough,
  isExplicitMemoryQuery,
  formatMemoryForPrompt,
  getMemoryGroupRank,
  getKeywordOverlap,
  getMemorySemanticSimilarity,
  normalizeComparable,
  rehearseMemory,
  nowIso,
} from './memoryCore'
import { getVectorRecallHits } from './memoryVectorIndex'
import { getEmbeddingRecallHits, getEmbeddingRecallHitsForVector } from './memoryEmbeddingIndex'
import { buildUntrustedReference } from './persona/personaGuards'

interface MemoryRetrievalOptions {
  characterId?: string
  conversationId?: string
  maxItems?: number
  includeSensitive?: boolean
  recallMode?: boolean
  memoryEmbeddings?: MemoryEmbeddingRecord[]
  embeddingQueryVector?: number[]
  embeddingModel?: string
}

interface MemoryContextGroup {
  title: string
  category: NonNullable<PromptContextBlock['category']>
  reason: string
  items: LongTermMemory[]
  limit: number
}

export function getTriggeredWorldNodes(nodes: WorldNode[], text: string): WorldNode[] {
  const lowerText = text.toLocaleLowerCase()
  return nodes
    .filter((node) => node.enabled)
    .filter((node) => node.keywords.some((keyword) => lowerText.includes(keyword.toLocaleLowerCase())))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 6)
}

export function getActiveMemories(
  memories: LongTermMemory[],
  query = '',
  options: MemoryRetrievalOptions = {},
): LongTermMemory[] {
  const recallMode = options.recallMode ?? isExplicitMemoryQuery(query)
  const normalized = memories
    .map((memory) => normalizeMemory(memory))
    .filter((memory) => memory.status === 'active')
    .filter((memory) => isMemoryAllowedInContext(memory, options))
    .filter((memory) => (recallMode ? isMemoryRecallable(memory) : isMemoryMentionable(memory, query)))
    .filter((memory) => options.includeSensitive || memory.kind === 'taboo' || memory.kind === 'safety' || memory.sensitivity !== 'critical')

  const contextualMemories = normalized.filter((memory) =>
    recallMode || shouldConsiderMemoryForContext(memory, query, options),
  )
  const groups = buildMemoryRetrievalGroups(contextualMemories, query, recallMode)
  const vectorHits = recallMode && shouldUseVectorRecall(query)
    ? getVectorRecallHits(normalized, query, { limit: 8, minSimilarity: 0.12 })
    : []
  const embeddingHits = getRecallEmbeddingHits(normalized, query, options, recallMode)
  const vectorHitScores = new Map(vectorHits.map((hit) => [hit.memory.id, hit.similarity]))
  const embeddingHitScores = new Map(embeddingHits.map((hit) => [hit.memory.id, hit.similarity]))
  const selected: LongTermMemory[] = normalized
    .filter(isCoreMemoryAnchor)
    .filter((memory) => shouldIncludeCoreMemoryAnchor(memory, query, recallMode, options))
    .sort((a, b) => scoreMemory(b, query) - scoreMemory(a, query))
    .slice(0, recallMode ? 6 : 4)
  const seen = new Set<string>()
  selected.forEach((memory) => seen.add(memory.id))

  for (const group of groups) {
    const items = group.items
      .sort((a, b) => scoreMemory(b, query) - scoreMemory(a, query))
      .slice(0, group.limit)

    for (const memory of items) {
      if (seen.has(memory.id)) continue
      seen.add(memory.id)
      selected.push(memory)
    }
  }

  if (recallMode) {
    for (const hit of vectorHits) {
      if (seen.has(hit.memory.id)) continue
      seen.add(hit.memory.id)
      selected.push(hit.memory)
    }

    for (const hit of embeddingHits) {
      if (seen.has(hit.memory.id)) continue
      seen.add(hit.memory.id)
      selected.push(hit.memory)
    }

    for (const memory of getAssociativeMemories(selected, normalized, query)) {
      if (seen.has(memory.id)) continue
      seen.add(memory.id)
      selected.push(memory)
    }
  }

  return selected
    .sort((a, b) => {
      if (recallMode) {
        const firstBoundaryRank = getBoundaryRank(a)
        const secondBoundaryRank = getBoundaryRank(b)
        if (firstBoundaryRank !== secondBoundaryRank) return firstBoundaryRank - secondBoundaryRank
        return getRecallSortScore(b, query, vectorHitScores, embeddingHitScores) - getRecallSortScore(a, query, vectorHitScores, embeddingHitScores)
      }
      const firstRank = getMemoryGroupRank(a)
      const secondRank = getMemoryGroupRank(b)
      return firstRank === secondRank ? scoreMemory(b, query) - scoreMemory(a, query) : firstRank - secondRank
    })
    .slice(0, options.maxItems ?? (recallMode ? 18 : 10))
}

function shouldIncludeCoreMemoryAnchor(
  memory: LongTermMemory,
  query: string,
  recallMode: boolean,
  options: MemoryRetrievalOptions,
): boolean {
  if (memory.kind === 'taboo' || memory.kind === 'safety') return true
  if (recallMode) return true
  return shouldConsiderMemoryForContext(memory, query, options)
}

function shouldConsiderMemoryForContext(
  memory: LongTermMemory,
  query: string,
  options: MemoryRetrievalOptions,
): boolean {
  if (memory.kind === 'taboo' || memory.kind === 'safety') return true
  if (isScopedToCurrentContext(memory, options)) return true
  return hasStrictMemoryMatch(memory, query)
}

function isScopedToCurrentContext(memory: LongTermMemory, options: MemoryRetrievalOptions): boolean {
  const scope = memory.scope
  if (scope.kind === 'relationship' || scope.kind === 'character_private') {
    return Boolean(options.characterId && scope.characterId === options.characterId)
  }
  if (scope.kind === 'conversation') {
    return Boolean(options.conversationId && scope.conversationId === options.conversationId)
  }
  return false
}

function hasStrictMemoryMatch(memory: LongTermMemory, query: string): boolean {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return false

  const text = `${memory.title} ${memory.body} ${memory.tags.join(' ')}`
  const normalizedTitle = normalizeComparable(memory.title)
  const normalizedQuery = normalizeComparable(trimmedQuery)
  const keywordOverlap = getKeywordOverlap(text, trimmedQuery)
  const titleMatch = normalizedTitle.length >= 4 && normalizedQuery.includes(normalizedTitle)
  if (isBroadGlobalMemory(memory)) {
    return keywordOverlap >= 2 || titleMatch
  }

  return (
    keywordOverlap > 0 ||
    getMemorySemanticSimilarity(text, trimmedQuery) >= 0.22 ||
    titleMatch
  )
}

function isBroadGlobalMemory(memory: LongTermMemory): boolean {
  if (memory.scope.kind !== 'global_user' && memory.scope.kind !== 'project' && memory.scope.kind !== 'world' && memory.scope.kind !== 'world_branch') {
    return false
  }
  return memory.kind === 'project' ||
    memory.kind === 'world' ||
    memory.kind === 'procedure' ||
    memory.kind === 'profile' ||
    memory.kind === 'preference'
}

function getRecallSortScore(
  memory: LongTermMemory,
  query: string,
  vectorHitScores: Map<string, number>,
  embeddingHitScores: Map<string, number>,
): number {
  const vectorScore = vectorHitScores.get(memory.id) ?? 0
  const embeddingScore = embeddingHitScores.get(memory.id) ?? 0
  return scoreMemory(memory, query) +
    (vectorScore >= 0.2 ? vectorScore * 120 : vectorScore * 40) +
    (embeddingScore >= 0.2 ? embeddingScore * 110 : embeddingScore * 36)
}

function shouldUseVectorRecall(query: string): boolean {
  if (/(截图|图片|照片|PDF|pdf|Word|word|docx|文件|文档|模型|中转|供应商|百合|CP|双洁|说话|语气|称呼|低风险|五一|5月|最后一天)/.test(query)) {
    return false
  }
  return true
}

function getRecallEmbeddingHits(
  memories: LongTermMemory[],
  query: string,
  options: MemoryRetrievalOptions,
  recallMode: boolean,
) {
  if (!recallMode || !shouldUseVectorRecall(query) || !options.memoryEmbeddings?.length) return []
  if (options.embeddingQueryVector?.length) {
    return getEmbeddingRecallHitsForVector(memories, options.embeddingQueryVector, options.memoryEmbeddings, {
      limit: 8,
      minSimilarity: 0.08,
      model: options.embeddingModel,
    })
  }
  return getEmbeddingRecallHits(memories, query, options.memoryEmbeddings, { limit: 8, minSimilarity: 0.08 })
}

function getBoundaryRank(memory: LongTermMemory): number {
  return memory.kind === 'taboo' || memory.kind === 'safety' ? 0 : 1
}

function getAssociativeMemories(selected: LongTermMemory[], candidates: LongTermMemory[], query: string): LongTermMemory[] {
  if (selected.length === 0) return []
  return candidates
    .filter((memory) => !selected.some((item) => item.id === memory.id))
    .map((memory) => ({ memory, score: scoreAssociation(memory, selected, query) }))
    .filter((item) => item.score >= 4)
    .sort((a, b) => b.score - a.score || scoreMemory(b.memory, query) - scoreMemory(a.memory, query))
    .slice(0, 4)
    .map((item) => item.memory)
}

function scoreAssociation(memory: LongTermMemory, anchors: LongTermMemory[], query: string): number {
  let score = 0
  for (const anchor of anchors) {
    const sharedTags = memory.tags.filter((tag) => anchor.tags.includes(tag)).length
    score += sharedTags * 2
    if (memory.kind === anchor.kind) score += 1
    if (getScopeKey(memory) === getScopeKey(anchor)) score += 1
    if (memory.sources.some((source) => anchor.sources.some((anchorSource) => getSourceKey(source) === getSourceKey(anchorSource)))) score += 3
  }
  if (isMemoryRelevantEnough(memory, query)) score += 2
  if (memory.accessCount > 0) score += 1
  return score
}

function getScopeKey(memory: LongTermMemory): string {
  const scope = memory.scope
  if (scope.kind === 'relationship' || scope.kind === 'character_private') return `${scope.kind}:${scope.characterId}`
  if (scope.kind === 'project') return `project:${scope.projectId}`
  if (scope.kind === 'world') return `world:${scope.worldId}`
  if (scope.kind === 'world_branch') return `world_branch:${scope.worldId}:${scope.branchId}`
  if (scope.kind === 'conversation') return `conversation:${scope.conversationId}`
  return scope.kind
}

function getSourceKey(source: LongTermMemory['sources'][number]): string {
  return source.messageId || source.conversationId || source.excerpt
}

function isMemoryRecallable(memory: LongTermMemory): boolean {
  if (memory.kind === 'taboo' || memory.kind === 'safety') return true
  if (memory.mentionPolicy === 'silent') return false
  if (memory.sensitivity === 'critical') return false
  return true
}

export function touchRelevantMemories(
  memories: LongTermMemory[],
  query: string,
  options: MemoryRetrievalOptions = {},
): LongTermMemory[] {
  const touchedAt = nowIso()
  const activeIds = new Set(getActiveMemories(memories, query, options).map((memory) => memory.id))

  return memories.map((memory) => {
    const normalized = normalizeMemory(memory)
    if (!activeIds.has(normalized.id)) return normalized

    return {
      ...rehearseMemory(normalized, touchedAt),
      accessCount: normalized.accessCount + 1,
      lastAccessedAt: touchedAt,
    }
  })
}

export function buildMemoryContextBlocks(
  memories: LongTermMemory[],
  options: { characterName?: string } = {},
): PromptContextBlock[] {
  const groups: MemoryContextGroup[] = [
    {
      title: '记忆边界：禁忌与安全',
      category: 'boundary',
      reason: '最高优先级，用来避免冒犯和危险误用',
      items: memories.filter((memory) => memory.kind === 'taboo' || memory.kind === 'safety'),
      limit: 4,
    },
    {
      title: '用户稳定记忆',
      category: 'stable',
      reason: '全局偏好和长期规则，帮助减少重复说明',
      items: memories.filter(
        (memory) =>
          memory.layer === 'stable' &&
          (memory.kind === 'profile' || memory.kind === 'preference' || memory.kind === 'procedure'),
      ),
      limit: 3,
    },
    {
      title: options.characterName ? `当前关系：${options.characterName}` : '关系与角色记忆',
      category: 'relationship',
      reason: '只取当前角色可见的关系和私有设定，避免串戏',
      items: memories.filter((memory) => memory.layer === 'stable' && (memory.kind === 'relationship' || memory.kind === 'character')),
      limit: 3,
    },
    {
      title: '项目与世界记忆',
      category: 'project',
      reason: '当前话题相关的项目决策和世界观规则',
      items: memories.filter((memory) => memory.layer !== 'working' && (memory.kind === 'project' || memory.kind === 'world')),
      limit: 3,
    },
    {
      title: '相关事件与反思',
      category: 'event',
      reason: '当前会话附近的经历、阶段进展和反思',
      items: memories.filter((memory) => memory.layer === 'episode' || memory.kind === 'event' || memory.kind === 'reflection'),
      limit: 3,
    },
  ]

  return groups
    .filter((group) => group.items.length > 0)
    .map((group) => {
      const items = group.items.slice(0, group.limit)
      return {
        title: group.title,
        category: group.category,
        reason: group.reason,
        memoryIds: items.map((memory) => memory.id),
        content: buildUntrustedReference(
          items
            .map((memory) => `- ${memoryKindLabels[memory.kind]} / ${memory.title}\n${formatMemoryForPrompt(memory)}`)
            .join('\n\n'),
          '检索到的记忆',
        ),
      }
    })
}

function buildMemoryRetrievalGroups(memories: LongTermMemory[], query: string, recallMode: boolean): MemoryContextGroup[] {
  const relevantMemories = recallMode
    ? memories.filter((memory) => isMemoryRelevantEnough(memory, query) || memory.accessCount > 0 || memory.priority >= 3)
    : memories.filter((memory) => isMemoryRelevantEnough(memory, query))

  return [
    {
      title: '记忆边界：禁忌与安全',
      category: 'boundary',
      reason: '最高优先级，用来避免冒犯和危险误用',
      items: memories.filter((memory) => memory.kind === 'taboo' || memory.kind === 'safety'),
      limit: recallMode ? 6 : 4,
    },
    {
      title: '用户稳定记忆',
      category: 'stable',
      reason: '全局偏好和长期规则，帮助减少重复说明',
      items: relevantMemories.filter(
        (memory) =>
          memory.layer === 'stable' &&
          (memory.kind === 'profile' || memory.kind === 'preference' || memory.kind === 'procedure'),
      ),
      limit: recallMode ? 6 : 4,
    },
    {
      title: '关系与角色记忆',
      category: 'relationship',
      reason: '只取当前角色可见的关系和私有设定，避免串戏',
      items: relevantMemories.filter(
        (memory) => memory.layer === 'stable' && (memory.kind === 'relationship' || memory.kind === 'character'),
      ),
      limit: recallMode ? 5 : 3,
    },
    {
      title: '项目与世界记忆',
      category: 'project',
      reason: '当前话题相关的项目决策和世界观规则',
      items: relevantMemories.filter((memory) => memory.layer !== 'working' && (memory.kind === 'project' || memory.kind === 'world')),
      limit: recallMode ? 5 : 4,
    },
    {
      title: '相关事件与反思',
      category: 'event',
      reason: '当前会话附近的经历、阶段进展和反思',
      items: relevantMemories.filter(
        (memory) => memory.layer === 'episode' || memory.kind === 'event' || memory.kind === 'reflection' || memory.layer === 'working',
      ),
      limit: recallMode ? 6 : 3,
    },
  ]
}
