import type {
  LongTermMemory,
  MemoryMergeSuggestion,
  MemoryKind,
  MemoryLayer,
  MemoryMentionPolicy,
  MemoryScope,
  MemorySensitivity,
  MemoryStatus,
} from '../domain/types'
import { brand } from '../config/brand'
import { clampNumber, createId, estimateTextEmotionalSalience, nowIso, unique } from './memoryUtils'
import {
  buildMemorySemanticSignature,
  MEMORY_SEMANTIC_SIGNATURE_VERSION,
} from './memoryVectorIndex'

export function inferMemoryScope(
  kind: MemoryKind,
  conversation?: { id: string },
  character?: { id: string },
): MemoryScope {
  if (kind === 'relationship' && character) return { kind: 'relationship', characterId: character.id }
  if (kind === 'character' && character) return { kind: 'character_private', characterId: character.id }
  if (kind === 'world') return { kind: 'world', worldId: brand.defaultProjectId }
  if (kind === 'project') return { kind: 'project', projectId: brand.defaultProjectId }
  if (kind === 'event' && conversation) return { kind: 'conversation', conversationId: conversation.id }
  return { kind: 'global_user' }
}

export function inferMemoryLayer(kind: MemoryKind, scope?: MemoryScope): MemoryLayer {
  if (scope?.kind === 'temporary') return 'working'
  if (kind === 'event' || kind === 'reflection') return 'episode'
  if (scope?.kind === 'conversation') return 'working'
  return 'stable'
}

export function normalizeMemoryScope(scope: MemoryScope): MemoryScope {
  if (!scope || typeof scope !== 'object' || !('kind' in scope)) return { kind: 'global_user' }
  if (scope.kind === 'character_private' && !scope.characterId) return { kind: 'global_user' }
  if (scope.kind === 'relationship' && !scope.characterId) return { kind: 'global_user' }
  if (scope.kind === 'world' && !scope.worldId) return { kind: 'world', worldId: brand.defaultProjectId }
  if (scope.kind === 'world_branch' && (!scope.worldId || !scope.branchId)) return { kind: 'world', worldId: brand.defaultProjectId }
  if (scope.kind === 'project' && !scope.projectId) return { kind: 'project', projectId: brand.defaultProjectId }
  if (scope.kind === 'conversation' && !scope.conversationId) return { kind: 'global_user' }
  return scope
}

export function inferSensitivity(kind: MemoryKind, text: string): MemorySensitivity {
  if (/(密码|token|key|secret|身份证|银行|信用卡)/i.test(text)) return 'critical'
  if (/(禁忌|雷点|不要提|别提|不能提|不要再提)/.test(text)) return 'high'
  if (kind === 'taboo' || kind === 'safety') return 'high'
  if (kind === 'relationship' || kind === 'character') return 'medium'
  return 'low'
}

export function inferMentionPolicy(kind: MemoryKind, sensitivity: MemorySensitivity): MemoryMentionPolicy {
  if (kind === 'taboo' || kind === 'safety') return 'proactive'
  if (sensitivity === 'critical') return 'silent'
  if (sensitivity === 'high') return 'explicit'
  if (kind === 'preference' || kind === 'procedure') return 'proactive'
  return 'contextual'
}

export function inferMemoryKind(memory: LongTermMemory): MemoryKind {
  const text = `${memory.title} ${memory.body}`
  if (/(禁忌|边界|不要提|别提|雷点)/.test(text)) return 'taboo'
  if (/(安全|保护|底线|红线)/.test(text)) return 'safety'
  if (/(记住|别忘|以后|下次|默认|一直|长期|规则|不要|必须|应该)/.test(text)) return 'preference'
  if (/(百合帝国|项目|架构|应用|产品|百合小窝|yuri_chat|小手机|世界树|记忆系统)/i.test(text)) return 'project'
  if (/(关系|感情|喜欢.*人|讨厌.*人|朋友|家人|同事)/.test(text)) return 'relationship'
  return memory.kind || 'event'
}

export function getAutoMemoryStatus(kind: MemoryKind, sensitivity: MemorySensitivity, fallback: MemoryStatus): MemoryStatus {
  if (sensitivity === 'high' || sensitivity === 'critical') return 'candidate'
  if (kind === 'taboo' || kind === 'safety') return 'candidate'
  return fallback
}

export function classifyMemory(
  content: string,
): { kind: MemoryKind; confidence: number; sensitivity: MemorySensitivity; status: MemoryStatus } | null {
  if (/(禁忌|边界|不要提|别提|别主动提|不要再提|不能提|雷点)/.test(content)) {
    return { kind: 'taboo', confidence: 0.92, sensitivity: 'high', status: 'active' }
  }

  if (/(记住|别忘|以后|下次|默认|一直|长期|规则|不要|必须|应该)/.test(content)) {
    const kind = /(回复|语气|风格|规则|不要|必须|应该)/.test(content) ? 'procedure' : 'preference'
    const sensitivity = inferSensitivity(kind, content)
    return { kind, confidence: 0.9, sensitivity, status: getAutoMemoryStatus(kind, sensitivity, 'active') }
  }

  if (/(我|妹妹).{0,8}(喜欢|不喜欢|讨厌|偏好|希望|想要|不想要|更喜欢|最喜欢)/.test(content)) {
    const sensitivity = inferSensitivity('preference', content)
    return { kind: 'preference', confidence: 0.84, sensitivity, status: getAutoMemoryStatus('preference', sensitivity, 'candidate') }
  }

  if (/(百合帝国|项目|架构|应用|产品|百合小窝|yuri_chat|小手机|世界树|记忆系统)/i.test(content)) {
    return { kind: 'project', confidence: 0.85, sensitivity: 'low', status: 'active' }
  }

  if (/(关系|感情|喜欢.*人|讨厌.*人|朋友|家人|同事)/.test(content)) {
    return { kind: 'relationship', confidence: 0.8, sensitivity: 'medium', status: 'candidate' }
  }

  if (/(今天|昨天|刚才|最近|上次|这次|那次|发生了|经历了)/.test(content)) {
    return { kind: 'event', confidence: 0.75, sensitivity: 'low', status: 'candidate' }
  }

  if (/(反思|总结|感悟|想通了|明白了|意识到)/.test(content)) {
    return { kind: 'reflection', confidence: 0.78, sensitivity: 'low', status: 'candidate' }
  }

  return null
}

export function normalizeMemory(memory: LongTermMemory): LongTermMemory {
  const normalizedText = `${memory.title || ''} ${memory.body || ''} ${(memory.tags || []).join(' ')}`

  return {
    id: memory.id || createId('memory'),
    title: (memory.title || '').trim() || '未命名记忆',
    body: (memory.body || '').trim(),
    tags: unique(memory.tags || []),
    priority: clampNumber(memory.priority, 1, 5, 3),
    pinned: Boolean(memory.pinned),
    kind: memory.kind || 'event',
    status: memory.status || 'active',
    layer: memory.layer || inferMemoryLayer(memory.kind, memory.scope),
    scope: normalizeMemoryScope(memory.scope || { kind: 'global_user' }),
    sensitivity: memory.sensitivity || 'low',
    mentionPolicy: memory.mentionPolicy || inferMentionPolicy(memory.kind, memory.sensitivity || 'low'),
    cooldownUntil: memory.cooldownUntil,
    confidence: clampNumber(memory.confidence, 0.1, 1, 0.82),
    origin: memory.origin || 'user',
    sources: Array.isArray(memory.sources) ? memory.sources : [],
    accessCount: memory.accessCount || 0,
    memoryStrength: clampNumber(memory.memoryStrength ?? 0.5, 0.1, 1, 0.5),
    emotionalSalience: clampNumber(
      memory.emotionalSalience ?? estimateTextEmotionalSalience(`${memory.title} ${memory.body} ${(memory.tags || []).join(' ')}`),
      0.1,
      1,
      0.35,
    ),
    semanticSignature: buildMemorySemanticSignature(normalizedText),
    semanticSignatureVersion: MEMORY_SEMANTIC_SIGNATURE_VERSION,
    reviewIntervalDays: clampNumber(memory.reviewIntervalDays ?? 7, 1, 365, 7),
    nextReviewAt: memory.nextReviewAt,
    revisions: Array.isArray(memory.revisions) ? memory.revisions : [],
    createdAt: memory.createdAt || nowIso(),
    updatedAt: memory.updatedAt || nowIso(),
    mergeSuggestion: normalizeMemoryMergeSuggestion(memory.mergeSuggestion),
  }
}

export function normalizeMemories(memories: LongTermMemory[]): LongTermMemory[] {
  return memories.map(normalizeMemory)
}

function normalizeMemoryMergeSuggestion(value?: MemoryMergeSuggestion): MemoryMergeSuggestion | undefined {
  if (!value?.targetMemoryId || !value?.targetTitle || !value?.suggestedBody) return undefined
  return {
    targetMemoryId: String(value.targetMemoryId),
    targetTitle: String(value.targetTitle).slice(0, 80),
    suggestedBody: String(value.suggestedBody).slice(0, 720),
    reason: String(value.reason || '候选内容与现有记忆相似，建议确认后再合并。').slice(0, 160),
    createdAt: value.createdAt || nowIso(),
  }
}
