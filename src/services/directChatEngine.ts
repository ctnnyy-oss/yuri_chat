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

export const DIRECT_SILENCE_MARKER = '[[NO_REPLY]]'

type RequestAssistantReply = (bundle: PromptBundle, settings: AppSettings) => Promise<AssistantReplyResult>
type DirectPromptMode = 'reactive' | 'proactive'

interface GenerateDirectChatReplyInput {
  character: CharacterCard
  conversation: ConversationState
  userMessage: ChatMessage
  bundle: PromptBundle
  settings: AppSettings
  requestReply: RequestAssistantReply
}

interface GenerateDirectChatProactiveInput {
  character: CharacterCard
  conversation: ConversationState
  bundle: PromptBundle
  settings: AppSettings
  requestReply: RequestAssistantReply
  force?: boolean
}

export interface DirectChatTurnResult {
  message: ChatMessage | null
  silent: boolean
  callCount: number
  skippedReason?: string
}

interface NormalizedDirectReply {
  content: string
  deliveryMode?: ChatMessage['deliveryMode']
}

export async function generateDirectChatReply({
  character,
  conversation,
  userMessage,
  bundle,
  settings,
  requestReply,
}: GenerateDirectChatReplyInput): Promise<DirectChatTurnResult> {
  if (shouldRespectNoReplyHint(userMessage.content)) {
    return {
      message: null,
      silent: true,
      callCount: 0,
      skippedReason: `${character.name}已读了这句，没有继续打扰。`,
    }
  }

  const replyBundle = buildDirectPromptBundle({
    baseBundle: bundle,
    character,
    conversation,
    triggerMessage: userMessage,
    settings,
    mode: 'reactive',
  })
  const result = await requestReply(replyBundle, createDirectReplySettings(settings, 'reactive'))
  const normalizedReply = normalizeDirectReply(result.reply, character)

  if (!normalizedReply) {
    return {
      message: null,
      silent: true,
      callCount: 1,
      skippedReason: `${character.name}看见了，但这会儿没有自然接话。`,
    }
  }

  if (isRepeatedRecentReply(normalizedReply.content, character, conversation.messages)) {
    return {
      message: null,
      silent: true,
      callCount: 1,
      skippedReason: `${character.name} skipped a repeated line.`,
    }
  }

  return {
    message: createDirectReplyMessage({
      agent: result.agent,
      character,
      content: normalizedReply.content,
      conversationMessages: conversation.messages,
      modelHint: normalizedReply.deliveryMode,
      settings,
      triggerMessage: userMessage,
      turnId: userMessage.id,
      turnKind: 'reactive',
    }),
    silent: false,
    callCount: 1,
  }
}

export async function generateDirectChatProactiveTurn({
  character,
  conversation,
  bundle,
  settings,
  requestReply,
  force = false,
}: GenerateDirectChatProactiveInput): Promise<DirectChatTurnResult> {
  const latestMessage = conversation.messages.at(-1) ?? null
  const drive = computeProactiveDrive(character, conversation)

  if (!force && drive < 42) {
    return {
      message: null,
      silent: true,
      callCount: 0,
      skippedReason: `${character.name}暂时没有主动开口。`,
    }
  }

  const turnId = createId('directturn')
  const proactiveBundle = buildDirectPromptBundle({
    baseBundle: bundle,
    character,
    conversation,
    triggerMessage: latestMessage,
    settings,
    mode: 'proactive',
    proactiveDrive: drive,
  })
  const result = await requestReply(proactiveBundle, createDirectReplySettings(settings, 'proactive'))
  const normalizedReply = normalizeDirectReply(result.reply, character)

  if (!normalizedReply) {
    return {
      message: null,
      silent: true,
      callCount: 1,
      skippedReason: `${character.name}想了想，还是没有主动打扰。`,
    }
  }

  if (isRepeatedRecentReply(normalizedReply.content, character, conversation.messages)) {
    return {
      message: null,
      silent: true,
      callCount: 1,
      skippedReason: `${character.name} skipped a repeated line.`,
    }
  }

  return {
    message: createDirectReplyMessage({
      agent: result.agent,
      character,
      content: normalizedReply.content,
      conversationMessages: conversation.messages,
      modelHint: normalizedReply.deliveryMode,
      settings,
      triggerMessage: latestMessage,
      turnId,
      turnKind: 'proactive',
    }),
    silent: false,
    callCount: 1,
  }
}

function buildDirectPromptBundle({
  baseBundle,
  character,
  conversation,
  triggerMessage,
  settings,
  mode,
  proactiveDrive,
}: {
  baseBundle: PromptBundle
  character: CharacterCard
  conversation: ConversationState
  triggerMessage: ChatMessage | null
  settings: AppSettings
  mode: DirectPromptMode
  proactiveDrive?: number
}): PromptBundle {
  const userName = settings.userNickname?.trim() || '妹妹'
  const triggerAuthor = triggerMessage?.role === 'user' ? userName : character.name
  const triggerText = triggerMessage?.content?.trim() ?? ''
  const responseDrive =
    mode === 'reactive' && triggerMessage
      ? computeResponseDrive(character, triggerMessage.content, triggerMessage.id, conversation)
      : (proactiveDrive ?? computeProactiveDrive(character, conversation))

  return {
    ...baseBundle,
    systemPrompt: [baseBundle.systemPrompt, buildDirectSystemPrompt(character)].join('\n\n'),
    contextBlocks: [
      ...baseBundle.contextBlocks,
      {
        title: mode === 'proactive' ? '私聊主动发言模式' : '私聊拟真响应模式',
        content: [
          `私聊对象：${character.name}`,
          `用户昵称：${userName}`,
          `本轮开口冲动：${responseDrive}/100`,
          mode === 'reactive'
            ? '用户刚在私聊里发来一句话。你要像真人一样判断是否现在自然回复。'
            : '私聊空闲了一会儿。你要判断是否主动给用户发一条消息。',
          '明确求助、提问、情绪求安慰、项目任务、重要约定必须认真回复，不要用沉默逃避责任。',
          `短促寒暄、话题已经自然收束、对方没有真的抛问题、你此刻没有角色动机时，可以只输出 ${DIRECT_SILENCE_MARKER}。`,
          '如果回复，只输出一条私聊消息；不要写名字前缀，不要解释自己为什么回复或不回复。',
          '如果你很明确想打字或发语音，可以输出 JSON：{"delivery":"text|voice","message":"你的消息"}。长内容、任务、代码、步骤更适合 text；短情绪、撒娇、懒得打字、对方发来语音时可以 voice。不要每次都 voice。',
        ].join('\n'),
        category: 'relationship',
      },
      ...(triggerMessage
        ? [
            {
              title: mode === 'proactive' ? '最近最后一条私聊消息' : '本轮触发私聊消息',
              content: `${triggerAuthor}：${triggerText}`,
              category: 'summary' as const,
            },
          ]
        : []),
      {
        title: '最近私聊记录',
        content: buildDirectTranscript(conversation.messages, userName, character, settings.maxContextMessages),
        category: 'summary',
      },
    ],
    messages:
      mode === 'proactive'
        ? [
            ...baseBundle.messages,
            {
              id: `${conversation.id}-${character.id}-proactive`,
              role: 'user',
              content: buildProactiveInstruction(character),
              createdAt: nowIso(),
            },
          ]
        : baseBundle.messages,
  }
}

function buildDirectSystemPrompt(character: CharacterCard): string {
  return [
    '# 私聊拟真规则',
    `你现在是私聊对象「${character.name}」，不是旁白，也不是客服流程。`,
    '私聊不需要每一句都秒回。你可以已读不回、晚点主动找对方、也可以在真的想接话时自然回复。',
    `不想回复时，只输出 ${DIRECT_SILENCE_MARKER}，不要补解释。`,
    '想回复时，只发一条像真人私聊里的消息：可以短，可以认真，可以撒娇、别扭、吐槽或关心，但不要机械总结。',
    '可以写动作，但动作必须服务于接话；不要只输出一行括号动作，至少给一句能让用户接下去的自然回复。',
    '你可以自己决定这条是打字还是发语音；需要明确表达时用 JSON 的 delivery 字段，不想特别指定时直接发正文也可以。',
    '不要同时扮演用户，不要写动作旁白，不要写“系统/分析/理由”。',
  ].join('\n')
}

function buildProactiveInstruction(character: CharacterCard): string {
  return [
    `现在私聊空闲了一会儿，轮到你判断 ${character.name} 要不要主动给用户发消息。`,
    `如果没有真实角色动机、只是尴尬续话、或此刻不想打扰，只输出 ${DIRECT_SILENCE_MARKER}。`,
    '如果要主动发，直接输出一条自然私聊消息。可以是想起用户、分享小事、轻轻问一句、接上最近话题，或开一个很轻的新话题。',
    '不要写名字前缀，不要替用户回复。',
  ].join('\n')
}

function buildDirectTranscript(
  messages: ChatMessage[],
  userName: string,
  character: CharacterCard,
  maxContextMessages: number,
): string {
  return messages
    .slice(-Math.max(8, Math.min(28, maxContextMessages + 4)))
    .map((message) => `${message.role === 'user' ? userName : message.authorName || character.name}：${message.content}`)
    .join('\n') || '暂无私聊记录。'
}

function normalizeDirectReply(reply: string, character: CharacterCard): NormalizedDirectReply | null {
  const envelope = extractDeliveryEnvelope(reply, DIRECT_SILENCE_MARKER)
  let text = envelope.text
  if (envelope.silent) return null
  if (/^(不回|不回复|先不说|先不回|沉默|已读不回|暂时不回|无回复|保持沉默|跳过)[。.!！\s]*$/i.test(text)) return null

  text = stripSpeakerPrefix(text, character)
  const lines = text
    .split(/\n+/)
    .map((line) => stripSpeakerPrefix(line.trim(), character))
    .filter(Boolean)
    .filter((line) => !/^(旁白|系统|分析|理由|内心|动作)[:：]/.test(line))

  text = selectDirectReplyText(lines)
  if (!text || text.includes(DIRECT_SILENCE_MARKER)) return null
  if (/^(不回|不回复|先不说|先不回|沉默|已读不回|暂时不回|无回复|保持沉默|跳过)[。.!！\s]*$/i.test(text)) return null

  return {
    content: trimReplyLength(text),
    deliveryMode: envelope.deliveryMode,
  }
}

function isRepeatedRecentReply(text: string, character: CharacterCard, messages: ChatMessage[]): boolean {
  const raw = text.trim()
  const normalized = normalizeForRepeatCheck(text)
  if (raw.length < 6 && normalized.length < 6) return false

  return messages
    .slice(-24)
    .filter((message) => message.role === 'assistant')
    .some((message) => {
      const previousRaw = message.content.trim()
      if (previousRaw && previousRaw === raw && message.authorCharacterId === character.id) return true
      if (previousRaw.length >= 10 && previousRaw === raw) return true
      const previous = normalizeForRepeatCheck(message.content)
      if (!previous) return false
      if (message.authorCharacterId === character.id && previous === normalized) return true
      return previous.length >= 10 && previous === normalized
    })
}

function normalizeForRepeatCheck(text: string): string {
  return text
    .replace(/\s+/g, '')
    .replace(/[，。！？、,.!?~～…"'“”‘’（）()[\]{}<>《》]/g, '')
    .trim()
}

function stripSpeakerPrefix(text: string, character: CharacterCard): string {
  const prefixPattern = new RegExp(`^\\s*(?:${escapeRegExp(character.name)}|${escapeRegExp(character.avatar)})\\s*[:：]\\s*`)
  return text
    .replace(prefixPattern, '')
    .replace(/^["“”'‘’]+|["“”'‘’]+$/g, '')
    .trim()
}

function selectDirectReplyText(lines: string[]): string {
  return lines.slice(0, 4).join('\n').trim()
}

function trimReplyLength(text: string): string {
  const singleLine = text.replace(/\s+\n/g, '\n').trim()
  if (singleLine.length <= 420) return singleLine
  const firstSentence = singleLine.match(/^.{1,340}?[。！？?!]/)?.[0]
  return (firstSentence ?? singleLine.slice(0, 340)).trim()
}

function createDirectReplyMessage({
  agent,
  character,
  content,
  conversationMessages,
  modelHint,
  settings,
  triggerMessage,
  turnId,
  turnKind,
}: {
  agent: AssistantReplyResult['agent']
  character: CharacterCard
  content: string
  conversationMessages: ChatMessage[]
  modelHint?: ChatMessage['deliveryMode']
  settings: AppSettings
  triggerMessage?: ChatMessage | null
  turnId: string
  turnKind: 'reactive' | 'proactive'
}): ChatMessage {
  return {
    id: createId('msg'),
    role: 'assistant',
    content,
    createdAt: nowIso(),
    deliveryMode: chooseAssistantDeliveryMode({
      character,
      content,
      conversationMessages,
      modelHint,
      scope: 'direct',
      settings,
      triggerMessage,
      turnKind,
    }),
    agent,
    authorCharacterId: character.id,
    authorName: character.name,
    authorAvatar: character.avatar,
    authorAccent: character.accent,
    directTurnId: turnId,
    directTurnKind: turnKind,
  }
}

function createDirectReplySettings(settings: AppSettings, mode: DirectPromptMode): AppSettings {
  return {
    ...settings,
    maxOutputTokens: Math.min(settings.maxOutputTokens || 4096, mode === 'proactive' ? 520 : 900),
    temperature: Math.max(settings.temperature, 0.78),
  }
}

function computeResponseDrive(
  character: CharacterCard,
  text: string,
  userMessageId: string,
  conversation: ConversationState,
): number {
  const talkativeness = inferTalkativeness(character)
  const randomPulse = seededUnit(`${conversation.id}:${userMessageId}:${character.id}:${text}:direct-reply`)
  const asksQuestion = /[?？]|吗|呢|怎么|为什么|要不要|可以|能不能|在吗|有人|帮我|姐姐|测试|问题/.test(text)
  const emotionalHook = /QAQ|qaq|呜|哭|难受|害怕|焦虑|喜欢|讨厌|开心|生气|救命|抱抱/.test(text)
  const workHook = /项目|功能|优化|升级|修复|bug|测试|设置|模型|记忆|角色|聊天|群聊|私聊|保存|云端/.test(text)
  const shortAck = text.trim().length <= 4 && /^(嗯|好|哦|行|可以|收到|知道|哈哈|嘿嘿|晚安|早)$/.test(text.trim())
  const saysNoReply = /不用回|先别回|不用理|我就说一下|只是说一声/.test(text)
  const recentAssistantReplies = conversation.messages
    .slice(-4)
    .filter((message) => message.role === 'assistant')
    .length

  let drive = Math.round(talkativeness * 42 + randomPulse * 34 + 16)
  if (asksQuestion) drive += 25
  if (emotionalHook) drive += 20
  if (workHook) drive += 26
  if (shortAck) drive -= 24
  if (saysNoReply) drive -= 40
  if (recentAssistantReplies >= 3 && !asksQuestion && !workHook) drive -= 12

  return clampInteger(drive, 0, 100, 62)
}

function shouldRespectNoReplyHint(text: string): boolean {
  const normalized = text.replace(/\s+/g, '')
  if (!/不用回|不必回|可以不回|不用理|别回|不用接|不用回复|只是测试.*已读不回|已读不回逻辑/.test(normalized)) return false
  return !/救命|难受|害怕|紧急|必须|一定要|帮我|怎么|为什么|能不能|可以吗|[?？]/.test(normalized)
}

function computeProactiveDrive(character: CharacterCard, conversation: ConversationState): number {
  const latestMessage = conversation.messages.at(-1)
  const talkativeness = inferTalkativeness(character)
  const randomPulse = seededUnit(
    `${conversation.id}:${latestMessage?.id ?? conversation.updatedAt}:${character.id}:direct-proactive`,
  )
  const latestWasUser = latestMessage?.role === 'user'
  const latestWasProactive = latestMessage?.directTurnKind === 'proactive'
  const latestText = latestMessage?.content ?? ''
  const warmHook = /晚安|早安|累|困|难受|开心|喜欢|想你|在吗|有人吗|姐姐/.test(latestText)

  let drive = Math.round(talkativeness * 44 + randomPulse * 42)
  if (latestWasUser) drive += warmHook ? 18 : 8
  if (latestWasProactive) drive -= 36
  if (conversation.messages.length <= 1) drive -= 8

  return clampInteger(drive, 0, 100, 45)
}

function inferTalkativeness(character: CharacterCard): number {
  const text = [character.name, character.title, character.subtitle, character.relationship, character.mood, ...character.tags].join(' ')
  if (/绿茶|不良|傲娇|撒娇|活泼|嘴硬|吐槽|话多|外向|姐姐/.test(text)) return 0.75
  if (/冰山|自卑|忠犬|沉默|克制|寡言|小心|敏感|内向/.test(text)) return 0.46
  return 0.58
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
