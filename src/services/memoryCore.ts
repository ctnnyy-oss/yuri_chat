import type {
  LongTermMemory,
  MemoryKind,
  MemoryLayer,
  MemoryMentionPolicy,
  MemoryOrigin,
  MemoryRevision,
  MemoryScope,
  MemorySensitivity,
  MemorySnapshot,
  MemorySource,
  MemoryStatus,
} from '../domain/types'
import {
  formatMemoryScopeLabel,
  memoryLayerLabels,
  memoryMentionPolicyLabels,
  memorySensitivityLabels,
} from '../domain/memoryLabels'
import {
  clampNumber,
  createId,
  getKeywordOverlap,
  getMemorySemanticSimilarity,
  normalizeComparable,
  nowIso,
  unique,
} from './memoryUtils'
import {
  estimateMemoryEmotionalSalience,
  estimateMemoryStrength,
} from './memoryScoring'
import {
  inferMemoryLayer,
  inferMentionPolicy,
  normalizeMemory,
  normalizeMemoryScope,
} from './memoryInference'
import {
  buildMemorySemanticSignature,
  MEMORY_SEMANTIC_SIGNATURE_VERSION,
} from './memoryVectorIndex'

// re-export everything consumers need from sub-modules
export {
  nowIso,
  createId,
  daysSince,
  clampNumber,
  unique,
  normalizeComparable,
  extractKeywords,
  estimateTextEmotionalSalience,
  buildMemorySparseVector,
  getKeywordOverlap,
  getMemorySemanticSimilarity,
  getTemporalSignalOverlap,
  hasEmotionalRecallIntent,
  hasTemporalRecallIntent,
} from './memoryUtils'

export {
  estimateMemoryEmotionalSalience,
  estimateMemoryStrength,
  isCoreMemoryAnchor,
  isCoolingDown,
  isExplicitMemoryQuery,
  isMemoryMentionable,
  isMemoryRelevantEnough,
  isMemoryReviewDue,
  rehearseMemory,
  scoreMemory,
} from './memoryScoring'

export {
  inferMemoryScope,
  inferMemoryLayer,
  inferMemoryKind,
  inferSensitivity,
  inferMentionPolicy,
  getAutoMemoryStatus,
  classifyMemory,
  normalizeMemory,
  normalizeMemories,
  normalizeMemoryScope,
} from './memoryInference'

export {
  createManualMemory,
  createMemorySourceFromMessage,
  createMemoryTombstone,
  isMemoryBlockedByTombstones,
  maybeCaptureMemory,
  integrateMemoryCandidate,
  consolidateMemoryGarden,
} from './memoryFactory'

export type { MemoryMaintenanceReport } from './memoryFactory'

export {
  getEmbeddingCacheStats,
  getEmbeddingRecallHits,
  refreshLocalMemoryEmbeddingCache,
  refreshMemoryEmbeddingCache,
} from './memoryEmbeddingIndex'

export {
  buildMemorySemanticSignature,
  getVectorIndexStats,
  getVectorRecallHits,
  MEMORY_SEMANTIC_SIGNATURE_VERSION,
} from './memoryVectorIndex'

// ============ 记忆创建（内部） ============

export function createLongTermMemory(input: {
  title: string
  body: string
  tags: string[]
  priority: number
  pinned: boolean
  kind: MemoryKind
  layer?: MemoryLayer
  confidence: number
  status: MemoryStatus
  scope: MemoryScope
  sensitivity: MemorySensitivity
  mentionPolicy?: MemoryMentionPolicy
  cooldownUntil?: string
  origin: MemoryOrigin
  sources: MemorySource[]
  reason: string
}): LongTermMemory {
  const createdAt = nowIso()
  const semanticSignature = buildMemorySemanticSignature(`${input.title} ${input.body} ${input.tags.join(' ')}`)
  const memory: LongTermMemory = {
    id: createId('memory'),
    title: input.title.trim() || '未命名记忆',
    body: input.body.trim(),
    tags: unique(input.tags),
    priority: clampNumber(input.priority, 1, 5, 3),
    pinned: input.pinned,
    kind: input.kind,
    status: input.status,
    layer: input.layer ?? inferMemoryLayer(input.kind, input.scope),
    scope: normalizeMemoryScope(input.scope),
    sensitivity: input.sensitivity,
    mentionPolicy: input.mentionPolicy ?? inferMentionPolicy(input.kind, input.sensitivity),
    cooldownUntil: input.cooldownUntil,
    confidence: clampNumber(input.confidence, 0.1, 1, 0.82),
    origin: input.origin,
    sources: input.sources,
    accessCount: 0,
    memoryStrength: estimateMemoryStrength({
      priority: input.priority,
      pinned: input.pinned,
      kind: input.kind,
      confidence: input.confidence,
      sources: input.sources,
      accessCount: 0,
    }),
    emotionalSalience: estimateMemoryEmotionalSalience({
      title: input.title,
      body: input.body,
      tags: input.tags,
      priority: input.priority,
      pinned: input.pinned,
      sensitivity: input.sensitivity,
    }),
    semanticSignature,
    semanticSignatureVersion: MEMORY_SEMANTIC_SIGNATURE_VERSION,
    reviewIntervalDays: input.pinned || input.priority >= 5 ? 14 : 7,
    nextReviewAt: getFutureIso(input.pinned || input.priority >= 5 ? 14 : 7),
    revisions: [],
    createdAt,
    updatedAt: createdAt,
  }

  return {
    ...memory,
    revisions: [createMemoryRevision(memory, input.reason, input.origin)],
  }
}

// ============ 记忆版本 ============

function appendMemoryRevision(memory: LongTermMemory, reason: string, editor: MemoryOrigin): LongTermMemory {
  const normalized = normalizeMemory(memory)
  const revision = createMemoryRevision(normalized, reason, editor)

  return {
    ...normalized,
    revisions: [...normalized.revisions, revision].slice(-24),
  }
}

function createMemoryRevision(memory: LongTermMemory, reason: string, editor: MemoryOrigin): MemoryRevision {
  return {
    id: createId('revision'),
    createdAt: nowIso(),
    reason,
    editor,
    snapshot: snapshotMemory(memory),
    sourceIds: memory.sources.map((source) => source.id),
  }
}

function snapshotMemory(memory: LongTermMemory): MemorySnapshot {
  return {
    title: memory.title,
    body: memory.body,
    tags: memory.tags,
    priority: memory.priority,
    pinned: memory.pinned,
    kind: memory.kind,
    confidence: memory.confidence,
    status: memory.status,
    layer: memory.layer,
    scope: memory.scope,
    sensitivity: memory.sensitivity,
    mentionPolicy: memory.mentionPolicy,
    cooldownUntil: memory.cooldownUntil,
    memoryStrength: memory.memoryStrength,
    emotionalSalience: memory.emotionalSalience,
    semanticSignature: memory.semanticSignature,
    semanticSignatureVersion: memory.semanticSignatureVersion,
    reviewIntervalDays: memory.reviewIntervalDays,
    nextReviewAt: memory.nextReviewAt,
  }
}

export function updateMemoryWithRevision(
  _previousMemory: LongTermMemory,
  updatedMemory: LongTermMemory,
  reason: string,
): LongTermMemory {
  return appendMemoryRevision(
    {
      ...updatedMemory,
      updatedAt: nowIso(),
    },
    reason,
    'manual',
  )
}

export function restoreMemoryRevision(memory: LongTermMemory, revisionId: string): LongTermMemory | null {
  const revision = memory.revisions.find((rev) => rev.id === revisionId)
  if (!revision) return null

  return appendMemoryRevision(
    {
      ...memory,
      ...revision.snapshot,
      updatedAt: nowIso(),
    },
    `从版本 ${revisionId} 恢复`,
    'manual',
  )
}

// ============ 墓碑指纹 ============

export function fingerprintMemory(memory: LongTermMemory): string {
  return normalizeComparable(`${memory.title}|${memory.body}|${memory.tags.join(',')}`)
}

// ============ 记忆合并工具 ============

export function mergeBody(primary: string, incoming: string): string {
  const cleanPrimary = primary.trim()
  const cleanIncoming = incoming.trim()
  if (!cleanIncoming || normalizeComparable(cleanPrimary).includes(normalizeComparable(cleanIncoming))) {
    return cleanPrimary
  }
  if (!cleanPrimary) return cleanIncoming
  return `${cleanPrimary}\n补充：${cleanIncoming}`.slice(0, 720)
}

function mergeSources(a: MemorySource[], b: MemorySource[]): MemorySource[] {
  const seen = new Set<string>()
  return [...a, ...b].filter((source) => {
    const key = source.messageId ?? source.excerpt
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function maxSensitivity(a: MemorySensitivity, b: MemorySensitivity): MemorySensitivity {
  const order: MemorySensitivity[] = ['low', 'medium', 'high', 'critical']
  return order[Math.max(order.indexOf(a), order.indexOf(b))]
}

function mergeMemoryLayer(a: MemoryLayer, b: MemoryLayer): MemoryLayer {
  const order: MemoryLayer[] = ['working', 'episode', 'stable']
  return order[Math.max(order.indexOf(a), order.indexOf(b))]
}

export function serializeMemoryScope(scope: MemoryScope): string {
  switch (scope.kind) {
    case 'global_user':
      return 'global_user'
    case 'character_private':
      return `character_private:${scope.characterId}`
    case 'relationship':
      return `relationship:${scope.characterId}`
    case 'conversation':
      return `conversation:${scope.conversationId}`
    case 'project':
      return `project:${scope.projectId}`
    case 'world':
      return `world:${scope.worldId}`
    case 'world_branch':
      return `world_branch:${scope.worldId}:${scope.branchId}`
    case 'temporary':
      return 'temporary'
    default:
      return 'global_user'
  }
}

// ============ 冲突检测工具 ============

const genericMemoryTopicTokens = new Set([
  '妹妹',
  '姐姐',
  '百合',
  '记忆',
  '角色',
  '聊天',
  '项目',
  '规则',
  '事件',
  '稳定',
  '事实',
  '当前',
  '全局',
  '用户',
  '手动',
  '整理',
  '试玩',
  '继续',
  '希望',
  '不要',
  '可以',
  '如果',
  '作为',
  '长期',
  '未来',
  '方便',
  '今晚',
  '一句',
  '回答',
  '生效',
  '来源',
])

export function hasOppositePreference(first: LongTermMemory, second: LongTermMemory): boolean {
  if (!areMemoriesTopicallyRelated(first, second)) return false

  const firstPolarity = getPolarity(first.body)
  const secondPolarity = getPolarity(second.body)
  return (
    (firstPolarity === 'positive' && secondPolarity === 'negative') ||
    (firstPolarity === 'negative' && secondPolarity === 'positive')
  )
}

function areMemoriesTopicallyRelated(first: LongTermMemory, second: LongTermMemory): boolean {
  const firstText = `${first.title} ${first.body} ${first.tags.join(' ')}`
  const secondText = `${second.title} ${second.body} ${second.tags.join(' ')}`
  const specificTopicOverlap = getSpecificTopicOverlap(first, second)
  const keywordOverlap = getKeywordOverlap(firstText, secondText)
  const semanticSimilarity = getMemorySemanticSimilarity(firstText, secondText)

  return specificTopicOverlap >= 1 && (keywordOverlap >= 2 || semanticSimilarity >= 0.42)
}

function getSpecificTopicOverlap(first: LongTermMemory, second: LongTermMemory): number {
  const firstTopics = getSpecificTopicTokens(first)
  const secondTopics = getSpecificTopicTokens(second)
  let overlap = 0

  firstTopics.forEach((topic) => {
    if (secondTopics.has(topic)) overlap += 1
  })

  return overlap
}

function getSpecificTopicTokens(memory: LongTermMemory): Set<string> {
  const tokens = new Set<string>()
  const rawText = `${memory.title} ${memory.body} ${memory.tags.join(' ')}`.toLocaleLowerCase()
  const chunks = rawText.match(/[a-z0-9]{2,}|\p{Script=Han}{2,}/gu) ?? []

  chunks.forEach((chunk) => {
    addSpecificTopic(tokens, chunk)

    if (/^\p{Script=Han}+$/u.test(chunk)) {
      for (let size = 2; size <= 4; size += 1) {
        for (let index = 0; index <= chunk.length - size; index += 1) {
          addSpecificTopic(tokens, chunk.slice(index, index + size))
        }
      }
    }
  })

  return tokens
}

function addSpecificTopic(tokens: Set<string>, token: string) {
  if (token.length < 2 || genericMemoryTopicTokens.has(token)) return
  tokens.add(token)
}

function getPolarity(text: string): 'positive' | 'negative' | 'neutral' {
  const negative = /(不喜欢|讨厌|不要|别|关闭|禁止|不想|不需要|不希望|取消)/.test(text)
  const positive = /(喜欢|需要|希望|开启|保留|默认|必须|应该|想要)/.test(text)
  if (negative && !positive) return 'negative'
  if (positive && !negative) return 'positive'
  if (negative && positive) return text.search(/不喜欢|讨厌|不要|别|关闭|禁止|不想|不需要|不希望|取消/) < text.search(/喜欢|需要|希望|开启|保留|默认|必须|应该|想要/)
    ? 'negative'
    : 'positive'
  return 'neutral'
}

export function isMemoryAllowedInContext(
  memory: LongTermMemory,
  options: { characterId?: string; conversationId?: string },
): boolean {
  switch (memory.scope.kind) {
    case 'global_user':
    case 'project':
    case 'world':
    case 'world_branch':
      return true
    case 'relationship':
    case 'character_private':
      return Boolean(options.characterId && memory.scope.characterId === options.characterId)
    case 'conversation':
      return Boolean(options.conversationId && memory.scope.conversationId === options.conversationId)
    case 'temporary':
      return false
    default:
      return false
  }
}

export function getMemoryGroupRank(memory: LongTermMemory): number {
  if (memory.kind === 'taboo' || memory.kind === 'safety') return 0
  if (memory.layer === 'working') return 5
  if (memory.kind === 'profile' || memory.kind === 'preference' || memory.kind === 'procedure') return 1
  if (memory.kind === 'relationship' || memory.kind === 'character') return 2
  if (memory.kind === 'project' || memory.kind === 'world') return 3
  return 4
}

export function formatMemoryForPrompt(memory: LongTermMemory): string {
  const source = memory.sources[0]?.excerpt
  return [
    memory.body,
    `标签：${memory.tags.join(' / ') || '无'}`,
    `层级：${memoryLayerLabels[memory.layer]}`,
    `空间：${formatMemoryScopeLabel(memory.scope)}；敏感度：${memorySensitivityLabels[memory.sensitivity]}`,
    `提及策略：${memoryMentionPolicyLabels[memory.mentionPolicy]}${memory.cooldownUntil ? `；冷却到：${new Date(memory.cooldownUntil).toLocaleString('zh-CN')}` : ''}`,
    `权重：${memory.priority}；可信度：${Math.round(memory.confidence * 100)}%；强度：${Math.round((memory.memoryStrength ?? estimateMemoryStrength(memory)) * 100)}%；显著性：${Math.round((memory.emotionalSalience ?? estimateMemoryEmotionalSalience(memory)) * 100)}%；来源：${source || '手动整理'}`,
    `记录：${formatMemoryTime(memory.createdAt)}；更新：${formatMemoryTime(memory.updatedAt)}${memory.lastAccessedAt ? `；上次调用：${formatMemoryTime(memory.lastAccessedAt)}` : ''}`,
  ].join('\n')
}

function getFutureIso(days: number, from = nowIso()): string {
  const date = new Date(from)
  if (Number.isNaN(date.getTime())) return nowIso()
  date.setDate(date.getDate() + days)
  return date.toISOString()
}

function formatMemoryTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未知'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function isPotentialDuplicate(a: LongTermMemory, b: LongTermMemory): boolean {
  if (a.id === b.id) return true
  const leftBody = normalizeComparable(a.body)
  const rightBody = normalizeComparable(b.body)
  if (leftBody === rightBody) return true
  if (isMeaningfulContainment(leftBody, rightBody)) return true
  if (a.kind !== b.kind || !areMemoryScopesMergeCompatible(a.scope, b.scope)) return false

  const keywordOverlap = getKeywordOverlap(a.body, b.body)
  const semanticSimilarity = getMemorySemanticSimilarity(`${a.title} ${a.body}`, `${b.title} ${b.body}`)
  if (keywordOverlap >= 5 && semanticSimilarity >= 0.55) return true
  if (keywordOverlap >= 3 && semanticSimilarity >= 0.72) return true
  return false
}

function isMeaningfulContainment(leftBody: string, rightBody: string): boolean {
  const shorter = leftBody.length < rightBody.length ? leftBody : rightBody
  const longer = leftBody.length < rightBody.length ? rightBody : leftBody
  return shorter.length >= 18 && longer.includes(shorter)
}

function areMemoryScopesMergeCompatible(a: MemoryScope, b: MemoryScope): boolean {
  const left = normalizeMemoryScope(a)
  const right = normalizeMemoryScope(b)
  if (serializeMemoryScope(left) === serializeMemoryScope(right)) return true
  if (left.kind === 'global_user' && right.kind === 'global_user') return true
  if ((left.kind === 'project' || right.kind === 'project') && left.kind !== right.kind) return false
  if ((left.kind === 'world' || right.kind === 'world' || left.kind === 'world_branch' || right.kind === 'world_branch') && left.kind !== right.kind) {
    return false
  }
  if (left.kind === 'global_user' || right.kind === 'global_user') return false
  return false
}

export function mergeMemories(primary: LongTermMemory, incoming: LongTermMemory, reason: string): LongTermMemory {
  const mergedSources = mergeSources(primary.sources, incoming.sources)
  const repeatedEvidenceBonus = mergedSources.length > primary.sources.length ? 0.04 : 0.02
  const mergedBody = mergeBody(primary.body, incoming.body)
  const mergedTags = unique([...primary.tags, ...incoming.tags])
  const mergedStrength = Math.max(
    primary.memoryStrength ?? estimateMemoryStrength(primary),
    incoming.memoryStrength ?? estimateMemoryStrength(incoming),
  )
  const merged: LongTermMemory = {
    ...primary,
    body: mergedBody,
    tags: mergedTags,
    priority: Math.min(5, Math.max(primary.priority, incoming.priority) + (mergedSources.length >= 2 ? 1 : 0)),
    pinned: primary.pinned || incoming.pinned,
    confidence: Math.min(1, Math.max(primary.confidence, incoming.confidence) + repeatedEvidenceBonus),
    sensitivity: maxSensitivity(primary.sensitivity, incoming.sensitivity),
    layer: mergeMemoryLayer(primary.layer, incoming.layer),
    sources: mergedSources,
    memoryStrength: clampNumber(mergedStrength + repeatedEvidenceBonus + mergedSources.length * 0.01, 0.1, 1, mergedStrength),
    emotionalSalience: Math.max(
      primary.emotionalSalience ?? estimateMemoryEmotionalSalience(primary),
      incoming.emotionalSalience ?? estimateMemoryEmotionalSalience(incoming),
    ),
    semanticSignature: buildMemorySemanticSignature(`${primary.title} ${mergedBody} ${mergedTags.join(' ')}`),
    semanticSignatureVersion: MEMORY_SEMANTIC_SIGNATURE_VERSION,
    reviewIntervalDays: Math.max(primary.reviewIntervalDays ?? 7, incoming.reviewIntervalDays ?? 7),
    nextReviewAt: getFutureIso(Math.max(primary.reviewIntervalDays ?? 7, incoming.reviewIntervalDays ?? 7)),
    updatedAt: nowIso(),
  }

  return appendMemoryRevision(merged, reason, 'system')
}
