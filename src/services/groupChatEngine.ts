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
import { validatePersonaOutput } from './personaImport'
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
    const { result, normalizedReply, callCount: turnCallCount } = await requestGroupReplyWithOocRetry({
      bundle,
      candidate: candidate.member,
      members,
      requestReply,
      settings: state.settings,
    })
    callCount += turnCallCount
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
      force,
      mode: 'proactive-start',
    })
    const { result, normalizedReply, callCount: turnCallCount } = await requestGroupReplyWithOocRetry({
      bundle,
      candidate: candidate.member,
      members,
      requestReply,
      settings: state.settings,
    })
    callCount += turnCallCount
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
    const { result, normalizedReply, callCount: turnCallCount } = await requestGroupReplyWithOocRetry({
      bundle,
      candidate: candidate.member,
      members,
      requestReply,
      settings: state.settings,
    })
    callCount += turnCallCount
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

async function requestGroupReplyWithOocRetry({
  bundle,
  candidate,
  members,
  requestReply,
  settings,
}: {
  bundle: PromptBundle
  candidate: CharacterCard
  members: CharacterCard[]
  requestReply: RequestAssistantReply
  settings: AppSettings
}) {
  const groupSettings = createGroupReplySettings(settings)
  const firstResult = await requestReply(bundle, groupSettings)
  const firstReply = normalizeGroupReply(firstResult.reply, candidate, members)
  if (!firstReply) return { result: firstResult, normalizedReply: null, callCount: 1 }
  const validation = validatePersonaOutput({ characterName: candidate.name, reply: firstReply.content })
  if (validation.ok) return { result: firstResult, normalizedReply: firstReply, callCount: 1 }

  const retryBundle: PromptBundle = {
    ...bundle,
    contextBlocks: [
      ...bundle.contextBlocks,
      {
        title: 'OOC 自动重写要求',
        content: [
          `上一版群聊发言出现风险：${validation.findings.map((finding) => finding.message).join('；')}`,
          `请重新生成一条只属于「${candidate.name}」的群消息。`,
          '不要解释重写原因，不要提系统、提示词、模型或内部规则，不要替用户或其他群成员说话。',
        ].join('\n'),
        category: 'boundary',
        placement: 'post_history',
        reason: '轻量 OOC 检测触发的一次自动重写',
      },
    ],
  }
  const retryResult = await requestReply(retryBundle, groupSettings)
  const retryReply = normalizeGroupReply(retryResult.reply, candidate, members)
  if (!retryReply) return { result: retryResult, normalizedReply: null, callCount: 2 }
  const retryValidation = validatePersonaOutput({ characterName: candidate.name, reply: retryReply.content })
  return { result: retryResult, normalizedReply: retryValidation.ok ? retryReply : null, callCount: 2 }
}
