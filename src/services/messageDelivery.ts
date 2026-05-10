import type {
  AppSettings,
  CharacterCard,
  ChatMessage,
  MessageDeliveryMode,
} from '../domain/types'

export interface DeliveryEnvelope {
  text: string
  deliveryMode?: MessageDeliveryMode
  silent: boolean
}

interface DeliveryDecisionInput {
  character: CharacterCard
  content: string
  conversationMessages: ChatMessage[]
  modelHint?: MessageDeliveryMode
  scope: 'direct' | 'group'
  settings: AppSettings
  triggerMessage?: ChatMessage | null
  turnKind?: 'reactive' | 'proactive'
}

export function extractDeliveryEnvelope(rawReply: string, silenceMarker: string): DeliveryEnvelope {
  let text = String(rawReply ?? '')
    .replace(/```(?:json|text)?/gi, '')
    .replace(/```/g, '')
    .trim()

  const parsed = tryParseDeliveryJson(text)
  if (parsed) {
    return {
      text: parsed.text,
      deliveryMode: parsed.deliveryMode,
      silent: parsed.silent || parsed.text.includes(silenceMarker),
    }
  }

  const prefix = extractDeliveryPrefix(text)
  if (prefix.deliveryMode) text = prefix.text

  return {
    text,
    deliveryMode: prefix.deliveryMode,
    silent: !text || text.includes(silenceMarker),
  }
}

export function chooseAssistantDeliveryMode({
  character,
  content,
  conversationMessages,
  modelHint,
  scope,
  settings,
  triggerMessage,
  turnKind = 'reactive',
}: DeliveryDecisionInput): MessageDeliveryMode {
  if (!settings.voice.assistantPlaybackEnabled) return 'text'
  if (!content.trim()) return 'text'

  const normalizedContent = content.trim()
  const triggerText = triggerMessage?.content ?? ''
  const combinedText = `${triggerText}\n${normalizedContent}`
  const heavyText = isTextHeavy(normalizedContent)
  const workText = /项目|功能|优化|升级|修复|bug|测试|设置|模型|记忆|角色|保存|云端|接口|代码|报错|排版|布局/.test(combinedText)
  const voiceRequested = /语音|发个音|说给我听|念给我听|读给我听|通话|电话|voice/i.test(combinedText)

  if (modelHint === 'text') return 'text'
  if (heavyText && !voiceRequested) return 'text'

  const recentMessages = conversationMessages.slice(-8)
  const recentVoiceBySameCharacter = recentMessages.some(
    (message) => message.role === 'assistant'
      && message.deliveryMode === 'voice'
      && (message.authorCharacterId === character.id || message.authorName === character.name),
  )
  const recentGroupVoice = scope === 'group' && recentMessages.slice(-4).some((message) => message.deliveryMode === 'voice')
  const talkativeness = inferTalkativeness(character)
  const randomPulse = seededUnit([
    scope,
    turnKind,
    character.id,
    triggerMessage?.id ?? '',
    normalizedContent.slice(0, 80),
    conversationMessages.length,
  ].join(':'))
  const emotional = /QAQ|qaq|呜|哭|难受|害怕|焦虑|喜欢|想你|抱抱|开心|生气|委屈|晚安|早安|哼|欸|啦|嘛|呀/.test(combinedText)
  const shortNatural = normalizedContent.length <= 72
  const mediumNatural = normalizedContent.length <= 140
  const userSentVoice = triggerMessage?.inputMode === 'voice'
  const reservedCharacter = inferReservedVoice(character)

  let score = scope === 'direct' ? 28 : 16
  score += Math.round(talkativeness * 22)
  score += Math.round(randomPulse * 24)
  if (modelHint === 'voice') score += 24
  if (voiceRequested) score += 28
  if (userSentVoice) score += 20
  if (emotional) score += 16
  if (shortNatural) score += 10
  else if (mediumNatural) score += 4
  if (turnKind === 'proactive') score += 6
  if (workText && !voiceRequested) score -= 18
  if (reservedCharacter && !emotional && !voiceRequested) score -= 10
  if (recentVoiceBySameCharacter) score -= 28
  if (recentGroupVoice) score -= 22
  if (scope === 'group' && normalizedContent.length > 110) score -= 10

  const threshold = scope === 'direct' ? 58 : 66
  return score >= threshold ? 'voice' : 'text'
}

function tryParseDeliveryJson(text: string): DeliveryEnvelope | null {
  if (!text.startsWith('{') || !text.endsWith('}')) return null

  try {
    const parsed = JSON.parse(text) as {
      channel?: unknown
      content?: unknown
      delivery?: unknown
      format?: unknown
      intent?: unknown
      message?: unknown
      mode?: unknown
      reply?: unknown
      text?: unknown
    }
    const intent = String(parsed.intent ?? '')
    const silent = /silent|no[_ -]?reply|none|skip/i.test(intent)
    const deliveryMode = normalizeDeliveryMode(parsed.delivery ?? parsed.mode ?? parsed.channel ?? parsed.format)
    const body = String(parsed.message ?? parsed.reply ?? parsed.content ?? parsed.text ?? '').trim()
    return { text: body, deliveryMode, silent }
  } catch {
    return null
  }
}

function extractDeliveryPrefix(text: string): { text: string; deliveryMode?: MessageDeliveryMode } {
  const voicePrefix = /^\s*(?:\[voice\]|【语音】|语音[:：]|发语音[:：])/i
  if (voicePrefix.test(text)) return { text: text.replace(voicePrefix, '').trim(), deliveryMode: 'voice' }

  const textPrefix = /^\s*(?:\[text\]|【文字】|文字[:：]|打字[:：])/i
  if (textPrefix.test(text)) return { text: text.replace(textPrefix, '').trim(), deliveryMode: 'text' }

  return { text }
}

function normalizeDeliveryMode(value: unknown): MessageDeliveryMode | undefined {
  const text = String(value ?? '').trim().toLowerCase()
  if (!text) return undefined
  if (/voice|audio|speech|语音|音频|发音/.test(text)) return 'voice'
  if (/text|typing|typed|文字|打字/.test(text)) return 'text'
  return undefined
}

function isTextHeavy(text: string): boolean {
  if (text.length > 180) return true
  if (/https?:\/\/|```|^\s*[-*]\s+/m.test(text)) return true
  if (/(function|const|let|class|import|export|SELECT|INSERT|UPDATE)\s/i.test(text)) return true
  if ((text.match(/\n/g) ?? []).length >= 3) return true
  if (/^\s*\d+[.、]\s+/m.test(text)) return true
  return false
}

function inferTalkativeness(character: CharacterCard): number {
  const text = [character.name, character.title, character.subtitle, character.relationship, character.mood, ...character.tags].join(' ')
  if (/绿茶|不良|傲娇|撒娇|活泼|嘴硬|吐槽|话多|外向|姐姐/.test(text)) return 0.78
  if (/冰山|自卑|忠犬|沉默|克制|寡言|小心|敏感|内向|敬畏/.test(text)) return 0.42
  return 0.58
}

function inferReservedVoice(character: CharacterCard): boolean {
  const text = [character.name, character.title, character.subtitle, character.relationship, character.mood, ...character.tags].join(' ')
  return /冰山|自卑|忠犬|沉默|克制|寡言|小心|敏感|内向|敬畏/.test(text)
}

function seededUnit(seed: string): number {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 0xffffffff
}
