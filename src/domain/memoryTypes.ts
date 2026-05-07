import type { ConversationState, MessageRole } from './types'

export type MemoryKind =
  | 'profile'
  | 'preference'
  | 'relationship'
  | 'project'
  | 'event'
  | 'procedure'
  | 'world'
  | 'character'
  | 'taboo'
  | 'safety'
  | 'reflection'
export type MemoryOrigin = 'seed' | 'manual' | 'auto' | 'system' | 'imported'
export type MemorySourceKind = 'message' | 'manual' | 'summary' | 'system'
export type MemoryStatus = 'candidate' | 'active' | 'archived' | 'trashed' | 'permanently_deleted'
export type MemorySensitivity = 'low' | 'medium' | 'high' | 'critical'
export type MemoryMentionPolicy = 'proactive' | 'contextual' | 'explicit' | 'silent'
export type MemoryLayer = 'stable' | 'episode' | 'working'

export type MemoryScope =
  | { kind: 'global_user' }
  | { kind: 'character_private'; characterId: string }
  | { kind: 'relationship'; characterId: string }
  | { kind: 'world'; worldId: string }
  | { kind: 'world_branch'; worldId: string; branchId: string }
  | { kind: 'project'; projectId: string }
  | { kind: 'conversation'; conversationId: string }
  | { kind: 'temporary' }

export interface MemorySource {
  id: string
  kind: MemorySourceKind
  excerpt: string
  createdAt: string
  conversationId?: string
  characterId?: string
  messageId?: string
  role?: MessageRole
}

export interface MemorySnapshot {
  title: string
  body: string
  tags: string[]
  priority: number
  pinned: boolean
  kind: MemoryKind
  confidence: number
  status: MemoryStatus
  layer: MemoryLayer
  scope: MemoryScope
  sensitivity: MemorySensitivity
  mentionPolicy: MemoryMentionPolicy
  cooldownUntil?: string
  memoryStrength?: number
  emotionalSalience?: number
  semanticSignature?: string[]
  semanticSignatureVersion?: number
  reviewIntervalDays?: number
  nextReviewAt?: string
}

export interface MemoryRevision {
  id: string
  createdAt: string
  reason: string
  editor: MemoryOrigin
  snapshot: MemorySnapshot
  sourceIds: string[]
}

export interface LongTermMemory {
  id: string
  title: string
  body: string
  tags: string[]
  priority: number
  pinned: boolean
  kind: MemoryKind
  status: MemoryStatus
  layer: MemoryLayer
  scope: MemoryScope
  sensitivity: MemorySensitivity
  mentionPolicy: MemoryMentionPolicy
  cooldownUntil?: string
  confidence: number
  origin: MemoryOrigin
  sources: MemorySource[]
  accessCount: number
  lastAccessedAt?: string
  memoryStrength?: number
  emotionalSalience?: number
  semanticSignature?: string[]
  semanticSignatureVersion?: number
  reviewIntervalDays?: number
  nextReviewAt?: string
  revisions: MemoryRevision[]
  createdAt: string
  updatedAt: string
  userEdited?: boolean
  aiGenerated?: boolean
  mergeSuggestion?: MemoryMergeSuggestion
}

export interface MemoryMergeSuggestion {
  targetMemoryId: string
  targetTitle: string
  suggestedBody: string
  reason: string
  createdAt: string
}

export interface MemoryEmbeddingRecord {
  id: string
  memoryId: string
  model: string
  dimensions: number
  textHash: string
  signatureVersion: number
  vector: number[]
  createdAt: string
  updatedAt: string
}

export interface WorldNode {
  id: string
  title: string
  keywords: string[]
  content: string
  priority: number
  enabled: boolean
}

export interface TrashedMemory extends LongTermMemory {
  deletedAt: string
}

export interface TrashedWorldNode extends WorldNode {
  deletedAt: string
}

export interface TrashedConversation extends ConversationState {
  deletedAt: string
  characterName: string
  character?: import('./types').CharacterCard
}

export interface AppTrash {
  memories: TrashedMemory[]
  worldNodes: TrashedWorldNode[]
  conversations: TrashedConversation[]
}

export interface MemoryTombstone {
  id: string
  memoryId: string
  fingerprint: string
  semanticSignature?: string[]
  semanticSignatureVersion?: number
  reason: string
  createdAt: string
}

export type MemoryConflictType = 'value' | 'scope' | 'duplicate' | 'safety'
export type MemoryConflictStatus = 'unresolved' | 'resolved' | 'ignored'

export interface MemoryConflict {
  id: string
  memoryIds: string[]
  conflictType: MemoryConflictType
  status: MemoryConflictStatus
  title: string
  description: string
  suggestedResolution: string
  requiresUserConfirmation: boolean
  createdAt: string
}

export interface MemoryUsageLog {
  id: string
  conversationId: string
  characterId: string
  characterName?: string
  userMessageId: string
  userExcerpt?: string
  assistantMessageId?: string
  memoryIds: string[]
  contextBlockTitles: string[]
  createdAt: string
}

export type MemoryEventType =
  | 'created'
  | 'captured'
  | 'confirmed'
  | 'edited'
  | 'organized'
  | 'revision_restored'
  | 'trashed'
  | 'restored'
  | 'permanently_deleted'
  | 'trash_emptied'
  | 'imported'
  | 'reset'
  | 'cloud_pushed'
  | 'cloud_pulled'
  | 'cloud_backup_created'
  | 'local_backup_created'
  | 'local_backup_restored'
  | 'usage_feedback'

export type MemoryEventActor = 'user' | 'assistant' | 'system'

export interface MemoryEvent {
  id: string
  type: MemoryEventType
  actor: MemoryEventActor
  title: string
  detail: string
  memoryIds: string[]
  createdAt: string
  characterId?: string
  conversationId?: string
}
