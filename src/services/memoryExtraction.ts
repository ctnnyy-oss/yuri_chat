import type { CharacterCard, ChatMessage, ConversationState, LongTermMemory, MemoryKind, MemoryScope } from '../domain/types'
import { createLongTermMemory, createMemorySourceFromMessage } from './memoryCore'

export type ExtractedMemoryScope = 'user_global' | 'relationship' | 'session' | 'episodic' | 'semantic' | 'affective' | 'lore'

export interface MemoryExtractionCandidate {
  scope: ExtractedMemoryScope
  summary: string
  actors: string[]
  entities: string[]
  emotionTags: string[]
  topicTags: string[]
  importance: number
  confidence: number
  valence: number
  relationshipDelta?: {
    trust?: number
    closeness?: number
    tension?: number
  }
  shouldPin?: boolean
}

export interface MemoryExtractionResult {
  memoryCandidates: MemoryExtractionCandidate[]
  stateUpdate?: {
    mood?: string
    currentGoal?: string
    relationshipDelta?: {
      trust?: number
      closeness?: number
      tension?: number
    }
  }
}

export function buildMemoryExtractionPrompt(input: {
  characterName: string
  userName: string
  messages: ChatMessage[]
}): string {
  const transcript = input.messages
    .slice(-20)
    .map((message) => `${message.role === 'user' ? input.userName : input.characterName}：${message.content}`)
    .join('\n')

  return [
    '你是 yuri_chat 的记忆抽取器。只输出严格 JSON，不输出解释。',
    '只抽取值得长期保留的事实、关系变化、情绪高峰、承诺、偏好和共同经历；忽略寒暄、低价值复读和临时任务噪声。',
    '记忆必须用第三人称、过去时态、摘要化写法；不要保存大段原始聊天。',
    '候选 scope 只能是 user_global / relationship / session / episodic / semantic / affective / lore。',
    '输出格式：{"memory_candidates":[...],"state_update":{...}}。',
    '<conversation>',
    transcript || '暂无对话。',
    '</conversation>',
  ].join('\n')
}

export function parseMemoryExtractionJson(raw: string): MemoryExtractionResult {
  const parsed = parseJsonObject(raw)
  const rawCandidates = Array.isArray(parsed?.memory_candidates)
    ? parsed.memory_candidates
    : Array.isArray(parsed?.memoryCandidates)
      ? parsed.memoryCandidates
      : []

  return {
    memoryCandidates: rawCandidates
      .map(normalizeCandidate)
      .filter((candidate): candidate is MemoryExtractionCandidate => Boolean(candidate))
      .slice(0, 12),
    stateUpdate: normalizeStateUpdate(parsed?.state_update ?? parsed?.stateUpdate),
  }
}

export function memoryCandidateToLongTermMemory(input: {
  candidate: MemoryExtractionCandidate
  sourceMessage: ChatMessage
  conversation: ConversationState
  character: CharacterCard
}): LongTermMemory {
  const kind = mapCandidateKind(input.candidate.scope)
  const scope = mapCandidateScope(input.candidate.scope, input.conversation, input.character)
  return createLongTermMemory({
    title: buildCandidateTitle(input.candidate),
    body: input.candidate.summary.slice(0, 520),
    tags: [...input.candidate.topicTags, ...input.candidate.emotionTags, ...input.candidate.entities].slice(0, 12),
    priority: Math.max(1, Math.min(5, Math.round(input.candidate.importance * 5))),
    pinned: Boolean(input.candidate.shouldPin),
    kind,
    layer: input.candidate.scope === 'session' ? 'working' : input.candidate.scope === 'episodic' || input.candidate.scope === 'affective' ? 'episode' : 'stable',
    confidence: input.candidate.confidence,
    status: 'candidate',
    scope,
    sensitivity: kind === 'relationship' || input.candidate.scope === 'affective' ? 'medium' : 'low',
    mentionPolicy: input.candidate.scope === 'affective' ? 'explicit' : 'contextual',
    origin: 'auto',
    sources: [createMemorySourceFromMessage(input.sourceMessage, input.conversation, input.character)],
    reason: 'LLM JSON 记忆抽取',
  })
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1))
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

function normalizeCandidate(value: unknown): MemoryExtractionCandidate | null {
  if (!isRecord(value)) return null
  const summary = readString(value.summary)
  if (summary.length < 6) return null
  return {
    scope: normalizeScope(readString(value.scope)),
    summary,
    actors: readStringArray(value.actors),
    entities: readStringArray(value.entities),
    emotionTags: readStringArray(value.emotion_tags ?? value.emotionTags),
    topicTags: readStringArray(value.topic_tags ?? value.topicTags),
    importance: clamp01(readNumber(value.importance, 0.5)),
    confidence: clamp01(readNumber(value.confidence, 0.72)),
    valence: Math.max(-1, Math.min(1, readNumber(value.valence, 0))),
    relationshipDelta: normalizeRelationshipDelta(value.relationship_delta ?? value.relationshipDelta),
    shouldPin: Boolean(value.should_pin ?? value.shouldPin),
  }
}

function normalizeStateUpdate(value: unknown): MemoryExtractionResult['stateUpdate'] {
  if (!isRecord(value)) return undefined
  return {
    mood: readString(value.mood),
    currentGoal: readString(value.current_goal ?? value.currentGoal),
    relationshipDelta: normalizeRelationshipDelta(value.relationship_delta ?? value.relationshipDelta),
  }
}

function normalizeRelationshipDelta(value: unknown): MemoryExtractionCandidate['relationshipDelta'] {
  if (!isRecord(value)) return undefined
  return {
    trust: clampDelta(readNumber(value.trust, 0)),
    closeness: clampDelta(readNumber(value.closeness, 0)),
    tension: clampDelta(readNumber(value.tension, 0)),
  }
}

function normalizeScope(value: string): ExtractedMemoryScope {
  const allowed: ExtractedMemoryScope[] = ['user_global', 'relationship', 'session', 'episodic', 'semantic', 'affective', 'lore']
  return allowed.includes(value as ExtractedMemoryScope) ? value as ExtractedMemoryScope : 'episodic'
}

function mapCandidateKind(scope: ExtractedMemoryScope): MemoryKind {
  if (scope === 'user_global' || scope === 'semantic') return 'preference'
  if (scope === 'relationship' || scope === 'affective') return 'relationship'
  if (scope === 'lore') return 'world'
  return 'event'
}

function mapCandidateScope(
  scope: ExtractedMemoryScope,
  conversation: ConversationState,
  character: CharacterCard,
): MemoryScope {
  if (scope === 'relationship' || scope === 'affective') return { kind: 'relationship', characterId: character.id }
  if (scope === 'session') return { kind: 'conversation', conversationId: conversation.id }
  if (scope === 'lore') return { kind: 'character_private', characterId: character.id }
  return { kind: 'global_user' }
}

function buildCandidateTitle(candidate: MemoryExtractionCandidate): string {
  const topic = candidate.topicTags[0] || candidate.emotionTags[0] || candidate.scope
  return `${topic}记忆：${candidate.summary.slice(0, 28)}`
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(readString).filter(Boolean).slice(0, 12)
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function clampDelta(value: number): number {
  return Math.max(-0.2, Math.min(0.2, value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
