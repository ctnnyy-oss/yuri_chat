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
  schemaVersion?: 2
  profileId?: string
  version?: number
  displayName?: string
  sourceType?: PersonaProfileSourceType
  sourceText: string
  importFormat?: PersonaImportFormat
  cardFields?: PersonaImportedCardFields
  roleKernel?: PersonaRoleKernel
  personalityProfile?: PersonaPersonalityProfile
  speechStyleProfile?: PersonaSpeechStyleProfile
  relationshipDefaults?: PersonaRelationshipDefaults
  worldModel?: PersonaWorldModel
  exemplars?: PersonaExemplars
  runtimePolicy?: PersonaRuntimePolicy
  characterBook?: PersonaCharacterBook
  identity: string
  relationship: string
  temperament: string
  speechStyle: string
  emotionalPattern: string
  memoriesAndExperiences: string
  goals: string
  boundaries: string
  interactionRules: string
  constitution?: PersonaConstitution
  relationships?: PersonaRelationshipEntry[]
  speechExamples?: PersonaSpeechExample[]
  loreEntries?: PersonaLoreEntry[]
  sceneTriggers?: PersonaSceneTrigger[]
  oocGuards?: string[]
  runtimeAnchors?: string[]
  missingDimensions: string[]
  updatedAt: string
}

export type PersonaImportFormat = 'freeform' | 'character_card_v2' | 'character_card_json' | 'yaml_like'
export type PersonaProfileSourceType = 'manual' | 'character_card_v2' | 'generated' | 'legacy'

export interface PersonaRoleKernel {
  identity: string[]
  immutableValues: string[]
  subjectiveReality: string
  knowledgeBoundary: string[]
}

export interface PersonaPersonalityProfile {
  traits: string[]
  traitWeights: Record<string, number>
  behaviorRules: PersonaBehaviorRule[]
}

export interface PersonaBehaviorRule {
  situation: string
  innerReaction: string
  outwardExpression: string
}

export interface PersonaSpeechStyleProfile {
  tone: string
  diction: string
  sentenceLength: string
  actionStyle: string
  emojiPolicy: string
  tabooOutputs: string[]
}

export interface PersonaRelationshipDefaults {
  user: PersonaRelationshipState
}

export interface PersonaRelationshipState {
  relationType: string
  trust: number
  closeness: number
  tension: number
  intimacyMode: string
  pacing: string
}

export interface PersonaWorldModel {
  setting: string
  locations: string[]
  importantEntities: string[]
  loreEntries: PersonaLoreEntry[]
}

export interface PersonaExemplars {
  positive: PersonaSpeechExample[]
  negative: string[]
}

export interface PersonaRuntimePolicy {
  responsePerspective: string
  userActionControlPolicy: string
  metaQuestionPolicy: string
  safetyBoundaries: string[]
  postHistoryNote?: string
}

export interface PersonaCharacterBook {
  entries: PersonaCharacterBookEntry[]
}

export interface PersonaCharacterBookEntry {
  id: string
  keys: string[]
  content: string
  priority: number
  insertionPolicy: string
}

export interface PersonaImportedCardFields {
  name?: string
  description?: string
  personality?: string
  scenario?: string
  firstMessage?: string
  messageExamples?: string
  creatorNotes?: string
  systemPrompt?: string
  postHistoryInstructions?: string
  alternateGreetings?: string[]
  characterBookEntries?: PersonaImportedCardBookEntry[]
  tags?: string[]
  creator?: string
  characterVersion?: string
  extensions?: Record<string, unknown>
}

export interface PersonaImportedCardBookEntry {
  name: string
  content: string
  keys: string[]
  priority: number
  enabled?: boolean
  insertionPolicy?: string
}

export interface PersonaConstitution {
  coreIdentity: string
  immutableFacts: string[]
  coreDrives: string[]
  hardBoundaries: string[]
  driftRules: string[]
}

export interface PersonaRelationshipEntry {
  name: string
  relation: string
  stance: string
  evidence?: string
}

export interface PersonaSpeechExample {
  user: string
  character: string
  note?: string
  source: 'imported' | 'generated'
}

export interface PersonaLoreEntry {
  id: string
  title: string
  content: string
  keywords: string[]
  priority: number
  source: 'identity' | 'relationship' | 'temperament' | 'speech' | 'experience' | 'goal' | 'boundary' | 'raw'
}

export interface PersonaSceneTrigger {
  id: string
  title: string
  keywords: string[]
  activeTraits: string[]
  responseStrategy: string
  priority: number
}

export interface PersonaRuntimeState {
  scenario: string
  currentTimeContext: string
  currentGoal: string
  emotionalPosture: string
  visibleEmotion: string
  hiddenEmotion: string
  relationship: PersonaRelationshipState
  activeTraits: string[]
  activeTraitWeights: Array<{ trait: string; weight: number; reason: string }>
  responseStrategy: string
  riskFlags: string[]
  selfCheck: string[]
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
  groupChatMaxProactiveTurns: number
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
  speechPitch: number
  speechVolume: number
  speechBrightness: number
  speechBreathiness: number
  speechTension: number
  speechWarmth: number
  speechStyleIntensity: number
  speechEmotion: string
  voiceBlendEnabled: boolean
  voiceBlendLayers: VoiceBlendLayer[]
  browserFallbackEnabled: boolean
  callModeEnabled: boolean
  customVoiceConsentRequired: boolean
}

export interface VoiceBlendLayer {
  label: string
  voiceId: string
  weight: number
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
  placement?: 'pre_history' | 'post_history'
  reason?: string
}

export interface PromptBundle {
  characterName: string
  systemPrompt: string
  contextBlocks: PromptContextBlock[]
  messages: ChatMessage[]
}
