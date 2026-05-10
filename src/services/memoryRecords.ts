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
  clampNumber,
  createId,
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

export function appendMemoryRevision(memory: LongTermMemory, reason: string, editor: MemoryOrigin): LongTermMemory {
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
  }
}

function getFutureIso(days: number, from = nowIso()): string {
  const date = new Date(from)
  date.setDate(date.getDate() + days)
  return date.toISOString()
}
