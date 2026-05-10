import type {
  AppSettings,
  AppState,
  AssistantReplyResult,
  CharacterCard,
  ChatMessage,
  ConversationState,
  PromptBundle,
} from '../domain/types'
import { createId, nowIso } from './memoryEngine'

export const GROUP_SILENCE_MARKER = '[[NO_REPLY]]'

const GROUP_RELATION = '群聊'
const GROUP_MEMBER_TAG_PREFIX = 'group-member:'
const MAX_GROUP_MEMBERS_TO_DRAFT = 8

type RequestAssistantReply = (bundle: PromptBundle, settings: AppSettings) => Promise<AssistantReplyResult>

interface GenerateGroupChatRepliesInput {
  state: AppState
  group: CharacterCard
  conversation: ConversationState
  userMessage: ChatMessage
  requestReply: RequestAssistantReply
}

interface GroupCandidate {
  member: CharacterCard
  drive: number
  mentioned: boolean
  recentlySpoke: boolean
  order: number
}

export interface GroupChatTurnResult {
  replies: ChatMessage[]
  silentCount: number
  callCount: number
  skippedReason?: string
}

export function isGroupCharacter(character: CharacterCard): boolean {
  return (
    character.relationship === GROUP_RELATION ||
    character.tags.includes(GROUP_RELATION) ||
    Boolean(character.groupMemberIds?.length)
  )
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
      userMessage,
      settings: state.settings,
    })
    callCount += 1

    const result = await requestReply(bundle, createGroupReplySettings(state.settings))
    const content = normalizeGroupReply(result.reply, candidate.member, members)
    if (!content) {
      silentCount += 1
      continue
    }

    replies.push(createGroupReplyMessage(candidate.member, content, result.agent, userMessage.id))
  }

  return {
    replies,
    silentCount,
    callCount,
    skippedReason: replies.length === 0 ? '群里暂时安静了一下，没有人自然接话。' : undefined,
  }
}

export function resolveGroupMembers(group: CharacterCard, characters: CharacterCard[]): CharacterCard[] {
  const characterById = new Map(characters.map((character) => [character.id, character]))
  const directIds = [
    ...(group.groupMemberIds ?? []),
    ...group.tags
      .filter((tag) => tag.startsWith(GROUP_MEMBER_TAG_PREFIX))
      .map((tag) => tag.slice(GROUP_MEMBER_TAG_PREFIX.length)),
  ]
  const directMembers = dedupeCharacters(
    directIds
      .map((id) => characterById.get(id))
      .filter((character): character is CharacterCard => character !== undefined && character.id !== group.id),
  )
  if (directMembers.length > 0) return directMembers

  const sourceText = [group.personaSource, group.systemPrompt, group.mood, group.subtitle]
    .filter(Boolean)
    .join('\n')
  return characters
    .filter((character) => character.id !== group.id && !isGroupCharacter(character))
    .filter((character) => sourceText.includes(character.name))
    .slice(0, MAX_GROUP_MEMBERS_TO_DRAFT)
}

function buildCandidateQueue(
  members: CharacterCard[],
  conversation: ConversationState,
  userMessage: ChatMessage,
  settings: AppSettings,
): GroupCandidate[] {
  const recentAuthorIds = conversation.messages
    .slice(-6)
    .filter((message) => message.role === 'assistant')
    .map((message) => message.authorCharacterId)
    .filter(Boolean)
  const latestText = userMessage.content

  return members
    .map((member, order) => {
      const mentioned = isMemberMentioned(member, latestText)
      const recentlySpoke = recentAuthorIds.includes(member.id)
      const drive = computeResponseDrive(member, latestText, userMessage.id, conversation.id, {
        mentioned,
        recentlySpoke,
        humanMode: settings.groupChatHumanMode,
      })
      return { member, drive, mentioned, recentlySpoke, order }
    })
    .sort((left, right) => {
      if (left.mentioned !== right.mentioned) return left.mentioned ? -1 : 1
      if (left.drive !== right.drive) return right.drive - left.drive
      if (left.recentlySpoke !== right.recentlySpoke) return left.recentlySpoke ? 1 : -1
      return left.order - right.order
    })
}

function computeResponseDrive(
  member: CharacterCard,
  text: string,
  userMessageId: string,
  conversationId: string,
  flags: { mentioned: boolean; recentlySpoke: boolean; humanMode: boolean },
): number {
  const talkativeness = inferTalkativeness(member)
  const randomPulse = seededUnit(`${conversationId}:${userMessageId}:${member.id}:${text}`)
  const asksQuestion = /[?？]|吗|么|嘛|谁|有人|在吗|怎么|要不要|可以|一起|来不来/.test(text)
  const emotionalHook = /哈哈|救命|好难|喜欢|讨厌|无聊|开心|难过|生气|呜|qaq/i.test(text)
  let drive = Math.round((talkativeness * 52) + (randomPulse * 38))

  if (flags.mentioned) drive += 45
  if (asksQuestion) drive += 14
  if (emotionalHook) drive += 9
  if (flags.recentlySpoke && !flags.mentioned) drive -= 22
  if (!flags.humanMode) drive += 18

  return clampInteger(drive, 0, 100, 50)
}

function buildGroupPromptBundle({
  group,
  members,
  candidate,
  conversationMessages,
  userMessage,
  settings,
}: {
  group: CharacterCard
  members: CharacterCard[]
  candidate: GroupCandidate
  conversationMessages: ChatMessage[]
  userMessage: ChatMessage
  settings: AppSettings
}): PromptBundle {
  const member = candidate.member
  const userName = settings.userNickname?.trim() || '妹妹'
  const memberList = members
    .map((item) => `${item.name}（${item.relationship || item.title || '角色'}）`)
    .join('、')
  const transcript = buildGroupTranscript(conversationMessages, group, members, userName, settings.maxContextMessages)

  return {
    characterName: member.name,
    systemPrompt: buildGroupSystemPrompt(member),
    contextBlocks: [
      {
        title: '群聊房间',
        content: [
          `群名：${group.name}`,
          `群成员：${memberList}`,
          `用户昵称：${userName}`,
          '所有群成员都能看到同一份群消息，但每个人只能代表自己发言。',
        ].join('\n'),
        category: 'summary',
      },
      {
        title: `${member.name} 的本轮发言判断`,
        content: [
          `本轮接话冲动：${candidate.drive}/100`,
          `是否被点名：${candidate.mentioned ? '是' : '否'}`,
          `最近是否刚说过话：${candidate.recentlySpoke ? '是' : '否'}`,
          '冲动低、没被点名、话题和自己关系不大时，直接输出静默标记。',
        ].join('\n'),
        category: 'relationship',
      },
      {
        title: '最近群聊记录',
        content: transcript || '暂无群聊记录。',
        category: 'summary',
      },
    ],
    messages: [
      {
        id: `${userMessage.id}-${member.id}`,
        role: 'user',
        content: [
          `现在轮到你判断：${member.name} 要不要在群里接话。`,
          `如果不自然接话，只输出 ${GROUP_SILENCE_MARKER}。`,
          `如果要接话，直接输出 ${member.name} 的一条群消息，不要写名字前缀，不要替其他人发言。`,
        ].join('\n'),
        createdAt: nowIso(),
      },
    ],
  }
}

function buildGroupSystemPrompt(member: CharacterCard): string {
  return [
    member.systemPrompt,
    '',
    '# 群聊发言规则',
    `你现在是群聊成员「${member.name}」，不是群主，也不是旁白。`,
    '你能看到群里的共享记录，但你只拥有自己的角色卡、语气、记忆和立场。',
    `你不需要每条消息都回复。自然不想接话时，只输出 ${GROUP_SILENCE_MARKER}。`,
    '要回复时，只发一条像真人群聊里的短消息。可以简短、玩笑、表情、吐槽，也可以认真接话。',
    '不要写“某某：”，不要同时扮演多个人，不要总结规则，不要解释你为什么回复或不回复。',
  ].join('\n')
}

function buildGroupTranscript(
  messages: ChatMessage[],
  group: CharacterCard,
  members: CharacterCard[],
  userName: string,
  maxContextMessages: number,
): string {
  const memberById = new Map(members.map((member) => [member.id, member]))
  return messages
    .slice(-Math.max(8, Math.min(32, maxContextMessages + 4)))
    .map((message) => `${getMessageAuthorName(message, group, memberById, userName)}：${message.content}`)
    .join('\n')
}

function getMessageAuthorName(
  message: ChatMessage,
  group: CharacterCard,
  memberById: Map<string, CharacterCard>,
  userName: string,
): string {
  if (message.role === 'user') return userName || '我'
  if (message.authorName) return message.authorName
  if (message.authorCharacterId) return memberById.get(message.authorCharacterId)?.name ?? group.name
  return group.name
}

function normalizeGroupReply(reply: string, member: CharacterCard, members: CharacterCard[]): string | null {
  let text = String(reply ?? '')
    .replace(/```(?:json|text)?/gi, '')
    .replace(/```/g, '')
    .trim()

  const parsed = tryParseReplyJson(text)
  if (parsed) text = parsed
  if (!text || text.includes(GROUP_SILENCE_MARKER)) return null
  if (/^(不回复|不接话|先不说|沉默|静默|略过|无回应|没有回应|保持沉默)[。.!！\s]*$/i.test(text)) return null

  text = stripSpeakerPrefix(text, member)
  const lines = text
    .split(/\n+/)
    .map((line) => stripSpeakerPrefix(line.trim(), member))
    .filter(Boolean)
    .filter((line) => !isOtherSpeakerLine(line, member, members))
    .filter((line) => !/^(旁白|系统|分析|理由|内心|动作)[:：]/.test(line))

  text = (lines[0] ?? '').trim()
  if (!text || text.includes(GROUP_SILENCE_MARKER)) return null
  if (/^(不回复|不接话|先不说|沉默|静默|略过|无回应|没有回应|保持沉默)[。.!！\s]*$/i.test(text)) return null

  return trimReplyLength(text)
}

function tryParseReplyJson(text: string): string | null {
  if (!text.startsWith('{') || !text.endsWith('}')) return null
  try {
    const parsed = JSON.parse(text) as { intent?: string; reply?: string; message?: string; content?: string }
    if (/silent|no[_ -]?reply|none|skip/i.test(String(parsed.intent ?? ''))) return GROUP_SILENCE_MARKER
    return String(parsed.reply ?? parsed.message ?? parsed.content ?? '').trim() || null
  } catch {
    return null
  }
}

function stripSpeakerPrefix(text: string, member: CharacterCard): string {
  const prefixPattern = new RegExp(`^\\s*(?:${escapeRegExp(member.name)}|${escapeRegExp(member.avatar)})\\s*[:：]\\s*`)
  return text
    .replace(prefixPattern, '')
    .replace(/^["“”'‘’]+|["“”'‘’]+$/g, '')
    .trim()
}

function isOtherSpeakerLine(text: string, member: CharacterCard, members: CharacterCard[]): boolean {
  return members
    .filter((item) => item.id !== member.id)
    .some((item) => new RegExp(`^\\s*(?:${escapeRegExp(item.name)}|${escapeRegExp(item.avatar)})\\s*[:：]`).test(text))
}

function trimReplyLength(text: string): string {
  const singleLine = text.replace(/\s+\n/g, '\n').trim()
  if (singleLine.length <= 260) return singleLine
  const firstSentence = singleLine.match(/^.{1,220}?[。！？!?]/)?.[0]
  return (firstSentence ?? singleLine.slice(0, 220)).trim()
}

function createGroupReplyMessage(
  member: CharacterCard,
  content: string,
  agent: AssistantReplyResult['agent'],
  groupTurnId: string,
): ChatMessage {
  return {
    id: createId('msg'),
    role: 'assistant',
    content,
    createdAt: nowIso(),
    agent,
    authorCharacterId: member.id,
    authorName: member.name,
    authorAvatar: member.avatar,
    authorAccent: member.accent,
    groupTurnId,
    groupReplyState: 'reply',
  }
}

function createGroupReplySettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    maxOutputTokens: Math.min(settings.maxOutputTokens || 4096, 520),
    temperature: Math.max(settings.temperature, 0.75),
  }
}

function inferTalkativeness(member: CharacterCard): number {
  const text = [member.name, member.title, member.subtitle, member.relationship, member.mood, ...member.tags].join(' ')
  if (/绿茶|不良|傲娇|撒娇|活泼|嘴硬|吐槽|话多|外向/.test(text)) return 0.74
  if (/冰山|自卑|忠犬|沉默|克制|寡言|小心|敬畏|内向/.test(text)) return 0.43
  return 0.56
}

function isMemberMentioned(member: CharacterCard, text: string): boolean {
  const candidates = [member.name, member.avatar, ...member.tags.filter((tag) => tag.length >= 2)]
  return candidates.some((candidate) => candidate && text.includes(candidate))
}

function dedupeCharacters(characters: CharacterCard[]): CharacterCard[] {
  const seen = new Set<string>()
  return characters.filter((character) => {
    if (seen.has(character.id)) return false
    seen.add(character.id)
    return true
  })
}

function seededUnit(seed: string): number {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 0xffffffff
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return fallback
  return Math.round(Math.min(max, Math.max(min, numericValue)))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
