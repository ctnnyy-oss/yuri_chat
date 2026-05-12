import type {
  AppSettings,
  AssistantReplyResult,
  CharacterCard,
  ChatMessage,
  ConversationState,
  PromptBundle,
} from '../domain/types'
import { createId, nowIso } from './memoryEngine'
import { chooseAssistantDeliveryMode, extractDeliveryEnvelope } from './messageDelivery'

export const GROUP_SILENCE_MARKER = '[[NO_REPLY]]'

const GROUP_RELATION = '群聊'
const GROUP_MEMBER_TAG_PREFIX = 'group-member:'
export const MAX_GROUP_MEMBERS_TO_DRAFT = 8

interface GroupCandidate {
  member: CharacterCard
  drive: number
  mentioned: boolean
  recentlySpoke: boolean
  order: number
}

type GroupPromptMode = 'reactive' | 'proactive-start' | 'proactive-reply'

interface NormalizedGroupReply {
  content: string
  deliveryMode?: ChatMessage['deliveryMode']
}

export function isGroupCharacter(character: CharacterCard): boolean {
  return (
    character.relationship === GROUP_RELATION ||
    character.tags.includes(GROUP_RELATION) ||
    Boolean(character.groupMemberIds?.length)
  )
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

export function buildCandidateQueue(
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

export function buildProactiveCandidateQueue(
  members: CharacterCard[],
  conversation: ConversationState,
  settings: AppSettings,
  force: boolean,
): GroupCandidate[] {
  const recentAuthorIds = conversation.messages
    .slice(-8)
    .filter((message) => message.role === 'assistant')
    .map((message) => message.authorCharacterId)
    .filter(Boolean)
  const latestMessage = conversation.messages.at(-1)
  const latestText = latestMessage?.content ?? ''

  return members
    .map((member, order) => {
      const mentioned = Boolean(latestText && isMemberMentioned(member, latestText))
      const recentlySpoke = recentAuthorIds.slice(-3).includes(member.id)
      const talkativeness = inferTalkativeness(member)
      const randomPulse = seededUnit(
        `${conversation.id}:${latestMessage?.id ?? conversation.updatedAt}:${member.id}:initiative`,
      )
      const quietBonus = latestMessage?.role === 'user' ? 8 : 0
      let drive = Math.round(talkativeness * 46 + randomPulse * 42 + quietBonus)

      if (mentioned) drive += 10
      if (recentlySpoke) drive -= 24
      if (!settings.groupChatHumanMode) drive += 18

      return {
        member,
        drive: clampInteger(drive, 0, 100, 45),
        mentioned,
        recentlySpoke,
        order,
      }
    })
    .filter((candidate) => force || candidate.drive >= 42)
    .sort((left, right) => {
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

export function buildGroupPromptBundle({
  group,
  members,
  candidate,
  conversationMessages,
  triggerMessage,
  settings,
  force = false,
  mode = 'reactive',
}: {
  group: CharacterCard
  members: CharacterCard[]
  candidate: GroupCandidate
  conversationMessages: ChatMessage[]
  triggerMessage: ChatMessage | null
  settings: AppSettings
  force?: boolean
  mode?: GroupPromptMode
}): PromptBundle {
  const member = candidate.member
  const userName = settings.userNickname?.trim() || '妹妹'
  const memberList = members
    .map((item) => `${item.name}（${item.relationship || item.title || '角色'}）`)
    .join('、')
  const transcript = buildGroupTranscript(conversationMessages, group, members, userName, settings.maxContextMessages)
  const memberById = new Map(members.map((item) => [item.id, item]))
  const lastSpeakerName = triggerMessage ? getMessageAuthorName(triggerMessage, group, memberById, userName) : ''
  const latestUserMessage = [...conversationMessages].reverse().find((message) => message.role === 'user')

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
      ...(triggerMessage
        ? [
            {
              title: mode === 'proactive-start' ? '最近最后一条消息' : '本轮触发消息',
              content: `${lastSpeakerName}：${triggerMessage.content}`,
              category: 'summary' as const,
            },
          ]
        : []),
      ...(latestUserMessage && latestUserMessage.id !== triggerMessage?.id
        ? [
            {
              title: 'Latest user instruction',
              content: [
                `${userName}: ${latestUserMessage.content}`,
                'Honor this over older topic drift. If the user asked to stop or change a topic, do not continue earlier props, actions, or callbacks unless they are mentioned again.',
              ].join('\n'),
              category: 'summary' as const,
            },
          ]
        : []),
      {
        title: `${member.name} 的本轮发言判断`,
        content: [
          `本轮接话冲动：${candidate.drive}/100`,
          `是否被点名：${candidate.mentioned ? '是' : '否'}`,
          `最近是否刚说过话：${candidate.recentlySpoke ? '是' : '否'}`,
          mode === 'proactive-start' && force
            ? '用户刚刚手动点了“让群里自己聊”。这不是后台随机续聊，而是明确希望群成员主动开一个自然话题；除非完全不合角色，否则优先开口。'
            : mode === 'proactive-start'
            ? '现在是群里空闲时的主动发言判断；没想法、没必要开口时，直接输出静默标记。'
            : '冲动低、没被点名、话题和自己关系不大时，直接输出静默标记。',
          '如果发言，你可以自己决定打字还是发语音。可输出 JSON：{"delivery":"text|voice","message":"你的群消息"}。群聊里语音要克制，短情绪、吐槽、撒娇可以 voice；长内容、解释、任务、多人信息用 text。',
          '当前群聊成员只能真实发送文字或语音。不要声称自己已经发送、上传、拍了或附上图片/文件/截图/歌单等真实附件；如果想提到物件，只能用文字描述。',
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
        id: `${triggerMessage?.id ?? 'proactive'}-${member.id}`,
        role: 'user',
        content: buildGroupUserInstruction(member, mode, lastSpeakerName, force),
        createdAt: nowIso(),
      },
    ],
  }
}

function buildGroupUserInstruction(member: CharacterCard, mode: GroupPromptMode, lastSpeakerName: string, force: boolean): string {
  if (mode === 'proactive-start') {
    if (force) {
      return [
        `用户刚刚点了“让群里自己聊”，现在轮到你作为 ${member.name} 主动开口。`,
        '请发一条像真人小群里自然出现的短消息，可以轻轻换话题、接刚才氛围、问某位成员一句，或抛一个很轻的吐槽。',
        '只有在发言会明显破坏角色边界时，才输出静默标记。',
        '不要写名字前缀，不要替其他人发言。',
      ].join('\n')
    }
    return [
      `现在群里空了一会儿，轮到你判断：${member.name} 要不要主动开口。`,
      `如果只是尴尬续话、没有真实想法、或此刻不想说话，只输出 ${GROUP_SILENCE_MARKER}。`,
      `如果要主动发言，直接输出 ${member.name} 的一条群消息。可以分享小想法、问某位成员一句、吐槽刚才话题，或自然开一个轻量新话题。`,
      '不要写名字前缀，不要替其他人发言。',
    ].join('\n')
  }

  if (mode === 'proactive-reply') {
    return [
      `刚才 ${lastSpeakerName || '群里有人'} 主动发了一句，轮到你判断：${member.name} 要不要自然接话。`,
      '先看“本轮触发消息”，只在你自然会接这一句话时回复；不要被更早的话题带跑。',
      `如果不自然接话，只输出 ${GROUP_SILENCE_MARKER}。`,
      `如果要接话，直接输出 ${member.name} 的一条群消息，不要写名字前缀，不要替其他人发言。`,
    ].join('\n')
  }

  return [
    `现在轮到你判断：${member.name} 要不要在群里接话。`,
    '先看“本轮触发消息”，只在你自然会接这一句话时回复；不要被更早的话题带跑。',
    `如果不自然接话，只输出 ${GROUP_SILENCE_MARKER}。`,
    `如果要接话，直接输出 ${member.name} 的一条群消息，不要写名字前缀，不要替其他人发言。`,
  ].join('\n')
}

function buildGroupSystemPrompt(member: CharacterCard): string {
  return [
    member.systemPrompt,
    '',
    '# 群聊发言规则',
    `你现在是群聊成员「${member.name}」，不是群主，也不是旁白。`,
    '你能看到群里的共享记录，但你只拥有自己的角色卡、语气、记忆和立场。',
    `你不需要每条消息都回复。自然不想接话时，只输出 ${GROUP_SILENCE_MARKER}。`,
    '群里空下来时，你也可以像真人一样主动发起一句话，但必须是真有角色动机，而不是机械续聊。',
    '要回复时，只发一条像真人群聊里的短消息。可以简短、玩笑、表情、吐槽，也可以认真接话。',
    '你可以自己决定这条是文字还是语音；不确定时直接发正文，明确时用 JSON 的 delivery 字段。',
    '当前你只能真实发送文字或语音，不能真的发送图片、文件、截图、歌单、照片或附件；不要把描写写成“已经发过去/上传了/附上了”。',
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

export function normalizeGroupReply(reply: string, member: CharacterCard, members: CharacterCard[]): NormalizedGroupReply | null {
  const envelope = extractDeliveryEnvelope(reply, GROUP_SILENCE_MARKER)
  let text = envelope.text
  if (envelope.silent) return null
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

  return {
    content: trimReplyLength(text),
    deliveryMode: envelope.deliveryMode,
  }
}

export function isRepeatedRecentReply(text: string, member: CharacterCard, messages: ChatMessage[]): boolean {
  const raw = text.trim()
  const normalized = normalizeForRepeatCheck(text)
  if (raw.length < 6 && normalized.length < 6) return false

  return messages
    .slice(-28)
    .filter((message) => message.role === 'assistant')
    .some((message) => {
      const previousRaw = message.content.trim()
      if (previousRaw && previousRaw === raw && message.authorCharacterId === member.id) return true
      if (previousRaw.length >= 10 && previousRaw === raw) return true
      const previous = normalizeForRepeatCheck(message.content)
      if (!previous) return false
      if (message.authorCharacterId === member.id && previous === normalized) return true
      return previous.length >= 10 && previous === normalized
    })
}

function normalizeForRepeatCheck(text: string): string {
  return text
    .replace(/\s+/g, '')
    .replace(/[，。！？、,.!?~～…"'“”‘’（）()[\]{}<>《》]/g, '')
    .trim()
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

export function createGroupReplyMessage({
  agent,
  content,
  conversationMessages,
  groupTurnId,
  groupTurnKind,
  member,
  modelHint,
  settings,
  triggerMessage,
}: {
  agent: AssistantReplyResult['agent']
  content: string
  conversationMessages: ChatMessage[]
  groupTurnId: string
  groupTurnKind: 'reactive' | 'proactive'
  member: CharacterCard
  modelHint?: ChatMessage['deliveryMode']
  settings: AppSettings
  triggerMessage?: ChatMessage | null
}): ChatMessage {
  return {
    id: createId('msg'),
    role: 'assistant',
    content,
    createdAt: nowIso(),
    deliveryMode: chooseAssistantDeliveryMode({
      character: member,
      content,
      conversationMessages,
      modelHint,
      scope: 'group',
      settings,
      triggerMessage,
      turnKind: groupTurnKind,
    }),
    agent,
    authorCharacterId: member.id,
    authorName: member.name,
    authorAvatar: member.avatar,
    authorAccent: member.accent,
    groupTurnId,
    groupTurnKind,
    groupReplyState: 'reply',
  }
}

export function createGroupReplySettings(settings: AppSettings): AppSettings {
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

export function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return fallback
  return Math.round(Math.min(max, Math.max(min, numericValue)))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
