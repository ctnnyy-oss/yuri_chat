export type MessageRole = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  createdAt: string
  memoryCaptured?: boolean
  agent?: AgentRunSummary
}

export interface CharacterCard {
  id: string
  name: string
  title: string
  subtitle: string
  avatar: string
  accent: string
  relationship: string
  mood: string
  tags: string[]
  systemPrompt: string
  greeting: string
  personaSource?: string
  personaProfile?: CharacterPersonaProfile
}

export interface CharacterPersonaProfile {
  sourceText: string
  identity: string
  relationship: string
  temperament: string
  speechStyle: string
  emotionalPattern: string
  memoriesAndExperiences: string
  goals: string
  boundaries: string
  interactionRules: string
  missingDimensions: string[]
  updatedAt: string
}

export interface ConversationState {
  id: string
  characterId: string
  messages: ChatMessage[]
  unreadCount?: number
  summary: string
  createdAt?: string
  updatedAt: string
}

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

export interface MemoryMergeSuggestion { targetMemoryId: string; targetTitle: string; suggestedBody: string; reason: string; createdAt: string }

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
  character?: CharacterCard
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

export type AgentReminderStatus = 'pending' | 'delivered' | 'cancelled'

export interface AgentReminder {
  id: string
  title: string
  detail: string
  remindAt: string
  createdAt: string
  status: AgentReminderStatus
  deliveredAt?: string
  characterId?: string
  conversationId?: string
}

export type AgentTaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'blocked'
export type AgentTaskPriority = 'low' | 'medium' | 'high'

export interface AgentTaskStep {
  id: string
  title: string
  status: AgentTaskStatus
  detail?: string
}

export interface AgentTask {
  id: string
  title: string
  detail: string
  status: AgentTaskStatus
  priority: AgentTaskPriority
  source: 'agent' | 'user'
  createdAt: string
  updatedAt: string
  characterId?: string
  conversationId?: string
  handoff?: string
  steps: AgentTaskStep[]
  logs: string[]
}

export interface AgentMoment {
  id: string
  authorCharacterId: string
  content: string
  mood: string
  createdAt: string
  source: 'seed' | 'agent' | 'user'
}

export interface AgentRoomMessage {
  id: string
  authorCharacterId: string
  content: string
  createdAt: string
  source: 'seed' | 'agent' | 'user'
}

export interface AgentRoom {
  id: string
  title: string
  description: string
  memberCharacterIds: string[]
  messages: AgentRoomMessage[]
  updatedAt: string
}

export type AccentTheme =
  | 'sakura'
  | 'peach'
  | 'lavender'
  | 'mint'
  | 'mono'
  | 'berry'
  | 'sky'
  | 'midnight'
  | 'custom'
export type TrashRetentionMode = 'forever' | 'default' | 'custom'
export type DataStorageMode = 'cloud' | 'local'
export type ModelProviderKind = 'openai-compatible' | 'anthropic' | 'google-gemini'

export interface ModelProfileSummary {
  id: string
  name: string
  kind: ModelProviderKind
  baseUrl: string
  model: string
  hasApiKey: boolean
  enabled: boolean
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export interface ModelProfileInput {
  id?: string
  name?: string
  kind: ModelProviderKind
  baseUrl: string
  model: string
  apiKey?: string
  enabled?: boolean
  isDefault?: boolean
}

export interface AppSettings {
  model: string
  modelProfileId: string
  userNickname: string
  userAvatarImage: string
  temperature: number
  maxContextMessages: number
  maxOutputTokens: number
  enterToSend: boolean
  fontSize: number
  accentTheme: AccentTheme
  customAccentColor: string
  dataStorageMode: DataStorageMode
  trashRetentionMode: TrashRetentionMode
  trashRetentionDays: number
  autoMemoryEnabled: boolean
  memoryConfidenceFloor: number
  showDevTrace: boolean
}

export interface AppState {
  version: number
  activeCharacterId: string
  characters: CharacterCard[]
  conversations: ConversationState[]
  memories: LongTermMemory[]
  worldNodes: WorldNode[]
  trash: AppTrash
  memoryTombstones: MemoryTombstone[]
  memoryEmbeddings: MemoryEmbeddingRecord[]
  memoryUsageLogs: MemoryUsageLog[]
  memoryEvents: MemoryEvent[]
  agentReminders: AgentReminder[]
  agentTasks: AgentTask[]
  agentMoments: AgentMoment[]
  agentRooms: AgentRoom[]
  settings: AppSettings
}

export interface LocalBackupSummary {
  id: string
  label: string
  reason: string
  createdAt: string
  stateVersion: number
  counts: {
    conversations: number
    memories: number
    worldNodes: number
    trashedItems: number
  }
}

export interface LocalBackup extends LocalBackupSummary {
  state: AppState
}

export interface PromptContextBlock {
  title: string
  content: string
  memoryIds?: string[]
  category?: 'boundary' | 'stable' | 'relationship' | 'project' | 'event' | 'world' | 'summary'
  reason?: string
}

export interface PromptBundle {
  characterName: string
  systemPrompt: string
  contextBlocks: PromptContextBlock[]
  messages: ChatMessage[]
}

export type AgentToolStatus = 'success' | 'needs_input' | 'error'

export interface AgentToolTrace {
  id: string
  name: string
  status: AgentToolStatus
  title: string
  content?: string
  summary: string
  createdAt: string
}

export interface AgentDecisionSummary {
  intentLabel: string
  confidence: string
  workflow: string
  riskLevel: 'low' | 'medium' | 'high'
  memoryMode: string
  selectedTools: string[]
  selectedActions: string[]
  nextStep: string
}

export type AgentActionType =
  | 'character_profile_update'
  | 'reminder_create'
  | 'task_create'
  | 'memory_candidate_create'
  | 'moment_create'
  | 'room_message_create'

export interface AgentAction {
  id: string
  type: AgentActionType
  title: string
  detail: string
  payload: {
    character?: Partial<Pick<CharacterCard, 'name' | 'title' | 'subtitle' | 'avatar'>>
    reminder?: Pick<AgentReminder, 'title' | 'detail' | 'remindAt'>
    task?: {
      title: string
      detail: string
      priority?: AgentTaskPriority
      steps?: string[]
      handoff?: string
    }
    memory?: {
      title: string
      body: string
      tags?: string[]
      kind?: MemoryKind
      layer?: MemoryLayer
      priority?: number
    }
    moment?: Pick<AgentMoment, 'content' | 'mood'> & { authorCharacterId?: string }
    room?: {
      roomId?: string
      title?: string
      memberCharacterIds?: string[]
      messages: Array<Pick<AgentRoomMessage, 'authorCharacterId' | 'content'>>
    }
  }
  requiresConfirmation: boolean
  sourceTool: string
  createdAt: string
}

export interface AgentRunSummary {
  tools: AgentToolTrace[]
  actions: AgentAction[]
  decision?: AgentDecisionSummary
}

export interface AssistantReplyResult {
  reply: string
  agent?: AgentRunSummary
}
