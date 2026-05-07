import type { CharacterCard } from './types'

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
      kind?: import('./memoryTypes').MemoryKind
      layer?: import('./memoryTypes').MemoryLayer
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
