import type {
  AgentMoment,
  AgentReminder,
  AgentRoom,
  AgentRunSummary,
  AgentTask,
} from './agentTypes'
import type {
  AppTrash,
  LongTermMemory,
  MemoryEmbeddingRecord,
  MemoryEvent,
  MemoryTombstone,
  MemoryUsageLog,
  WorldNode,
} from './memoryTypes'

export * from './memoryTypes'
export * from './agentTypes'

export type MessageRole = 'user' | 'assistant'
export type MessageDeliveryMode = 'text' | 'voice'

export type VoiceProviderKind = 'browser' | 'openai-compatible'

export interface ChatMessageVoice {
  kind: 'recorded'
  dataUrl: string
  mimeType: string
  durationMs: number
  transcript?: string
  createdAt: string
}

export interface CharacterVoiceProfile {
  displayName: string
  providerVoiceId: string
  stylePrompt: string
  source: 'built-in' | 'custom' | 'cloned'
  consentConfirmed: boolean
  updatedAt: string
}

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  createdAt: string
  deliveryMode?: MessageDeliveryMode
  inputMode?: 'text' | 'voice'
  voice?: ChatMessageVoice
  memoryCaptured?: boolean
  agent?: AgentRunSummary
  authorCharacterId?: string
  authorName?: string
  authorAvatar?: string
  authorAccent?: string
  groupTurnId?: string
  groupTurnKind?: 'reactive' | 'proactive'
  groupReplyState?: 'reply' | 'silent'
  directTurnId?: string
  directTurnKind?: 'reactive' | 'proactive'
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
  groupMemberIds?: string[]
  voiceProfile?: CharacterVoiceProfile
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

export type AccentTheme =
  | 'sakura'
  | 'white'
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
  directChatHumanMode: boolean
  directChatProactiveMode: boolean
  groupChatHumanMode: boolean
  groupChatProactiveMode: boolean
  groupChatMaxAutoReplies: number
  voice: VoiceSettings
}

export interface VoiceSettings {
  inputEnabled: boolean
  assistantPlaybackEnabled: boolean
  autoPlayAssistantVoice: boolean
  provider: VoiceProviderKind
  ttsProfileId: string
  ttsModel: string
  defaultVoiceId: string
  defaultVoiceLabel: string
  defaultStylePrompt: string
  speechRate: number
  browserFallbackEnabled: boolean
  callModeEnabled: boolean
  customVoiceConsentRequired: boolean
}

export interface SendMessageOptions {
  content?: string
  voice?: ChatMessageVoice
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
