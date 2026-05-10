import type {
  AppSettings,
  AppState,
  AssistantReplyResult,
  CharacterCard,
  ChatMessage,
  ConversationState,
  PromptBundle,
} from '../domain/types'
import {
  MAX_GROUP_MEMBERS_TO_DRAFT,
  buildCandidateQueue,
  buildGroupPromptBundle,
  buildProactiveCandidateQueue,
  clampInteger,
  createGroupReplyMessage,
  createGroupReplySettings,
  isRepeatedRecentReply,
  normalizeGroupReply,
  resolveGroupMembers,
} from './groupChatHelpers'
import { createId } from './memoryEngine'
export { GROUP_SILENCE_MARKER, isGroupCharacter, resolveGroupMembers } from './groupChatHelpers'

type RequestAssistantReply = (bundle: PromptBundle, settings: AppSettings) => Promise<AssistantReplyResult>

interface GenerateGroupChatRepliesInput {
  state: AppState
  group: CharacterCard
  conversation: ConversationState
  userMessage: ChatMessage
  requestReply: RequestAssistantReply
}

interface GenerateGroupChatProactiveInput {
  state: AppState
  group: CharacterCard
  conversation: ConversationState
  requestReply: RequestAssistantReply
  force?: boolean
}

export interface GroupChatTurnResult {
  replies: ChatMessage[]
  silentCount: number
  callCount: number
  skippedReason?: string
}

export async function generateGroupChatReplies({
  state,
  group,
  conversation,
  userMessage,
  requestReply,
}: GenerateGroupChatRepliesInput): Promise<GroupChatTurnResult> {
  const members = resolveGroupMembers(group, state.characters)
  if (members.length === 0) {
    return {
      replies: [],
      silentCount: 0,
      callCount: 0,
      skippedReason: '这个群聊还没有成员，先从好友列表里重新拉一个群就好。',
    }
  }

  const maxReplies = Math.min(
    members.length,
    clampInteger(state.settings.groupChatMaxAutoReplies, 1, 4, 3),
  )
  const candidates = buildCandidateQueue(members, conversation, userMessage, state.settings).slice(0, MAX_GROUP_MEMBERS_TO_DRAFT)
  const replies: ChatMessage[] = []
  let silentCount = 0
  let callCount = 0

  for (const candidate of candidates) {
    if (replies.length >= maxReplies) break

    const bundle = buildGroupPromptBundle({
      group,
      members,
      candidate,
      conversationMessages: [...conversation.messages, ...replies],
      triggerMessage: userMessage,
      settings: state.settings,
    })
    callCount += 1

    const result = await requestReply(bundle, createGroupReplySettings(state.settings))
    const normalizedReply = normalizeGroupReply(result.reply, candidate.member, members)
    if (!normalizedReply) {
      silentCount += 1
      continue
    }
    if (isRepeatedRecentReply(normalizedReply.content, candidate.member, [...conversation.messages, ...replies])) {
      silentCount += 1
      continue
    }

    replies.push(createGroupReplyMessage({
      agent: result.agent,
      content: normalizedReply.content,
      conversationMessages: [...conversation.messages, ...replies],
      groupTurnId: userMessage.id,
      groupTurnKind: 'reactive',
      member: candidate.member,
      modelHint: normalizedReply.deliveryMode,
      settings: state.settings,
      triggerMessage: userMessage,
    }))
  }

  return {
    replies,
    silentCount,
    callCount,
    skippedReason: replies.length === 0 ? '群里暂时安静了一下，没有人自然接话。' : undefined,
  }
}

export async function generateGroupChatProactiveTurn({
  state,
  group,
  conversation,
  requestReply,
  force = false,
}: GenerateGroupChatProactiveInput): Promise<GroupChatTurnResult> {
  const members = resolveGroupMembers(group, state.characters)
  if (members.length === 0) {
    return {
      replies: [],
      silentCount: 0,
      callCount: 0,
      skippedReason: '这个群聊还没有成员，先从好友列表里重新拉一个群就好。',
    }
  }

  const maxReplies = Math.min(members.length, clampInteger(state.settings.groupChatMaxAutoReplies, 1, 4, 3))
  const turnId = createId('groupturn')
  const latestMessage = conversation.messages.at(-1) ?? null
  const candidates = buildProactiveCandidateQueue(members, conversation, state.settings, force).slice(
    0,
    MAX_GROUP_MEMBERS_TO_DRAFT,
  )
  const replies: ChatMessage[] = []
  let silentCount = 0
  let callCount = 0

  for (const candidate of candidates) {
    const bundle = buildGroupPromptBundle({
      group,
      members,
      candidate,
      conversationMessages: conversation.messages,
      triggerMessage: latestMessage,
      settings: state.settings,
      mode: 'proactive-start',
    })
    callCount += 1

    const result = await requestReply(bundle, createGroupReplySettings(state.settings))
    const normalizedReply = normalizeGroupReply(result.reply, candidate.member, members)
    if (!normalizedReply) {
      silentCount += 1
      continue
    }
    if (isRepeatedRecentReply(normalizedReply.content, candidate.member, conversation.messages)) {
      silentCount += 1
      continue
    }

    replies.push(createGroupReplyMessage({
      agent: result.agent,
      content: normalizedReply.content,
      conversationMessages: conversation.messages,
      groupTurnId: turnId,
      groupTurnKind: 'proactive',
      member: candidate.member,
      modelHint: normalizedReply.deliveryMode,
      settings: state.settings,
      triggerMessage: latestMessage,
    }))
    break
  }

  const initiator = replies[0]
  if (!initiator) {
    return {
      replies,
      silentCount,
      callCount,
      skippedReason: '群里安静了一会儿，但暂时没人主动开新话题。',
    }
  }

  const responderCandidates = buildCandidateQueue(
    members.filter((member) => member.id !== initiator.authorCharacterId),
    { ...conversation, messages: [...conversation.messages, initiator] },
    initiator,
    state.settings,
  ).slice(0, MAX_GROUP_MEMBERS_TO_DRAFT)

  for (const candidate of responderCandidates) {
    if (replies.length >= maxReplies) break

    const bundle = buildGroupPromptBundle({
      group,
      members,
      candidate,
      conversationMessages: [...conversation.messages, ...replies],
      triggerMessage: initiator,
      settings: state.settings,
      mode: 'proactive-reply',
    })
    callCount += 1

    const result = await requestReply(bundle, createGroupReplySettings(state.settings))
    const normalizedReply = normalizeGroupReply(result.reply, candidate.member, members)
    if (!normalizedReply) {
      silentCount += 1
      continue
    }
    if (isRepeatedRecentReply(normalizedReply.content, candidate.member, [...conversation.messages, ...replies])) {
      silentCount += 1
      continue
    }

    replies.push(createGroupReplyMessage({
      agent: result.agent,
      content: normalizedReply.content,
      conversationMessages: [...conversation.messages, ...replies],
      groupTurnId: turnId,
      groupTurnKind: 'proactive',
      member: candidate.member,
      modelHint: normalizedReply.deliveryMode,
      settings: state.settings,
      triggerMessage: initiator,
    }))
  }

  return {
    replies,
    silentCount,
    callCount,
  }
}
