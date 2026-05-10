import type { ChatMessage } from '../domain/types'

export function getConversationMessageKey(messages: ChatMessage[]): string {
  const latestMessage = messages.at(-1)
  return `${messages.length}:${latestMessage?.id ?? 'empty'}`
}

export function countGroupProactiveTurnsSinceLastUser(messages: ChatMessage[]): number {
  const proactiveTurnIds = new Set<string>()

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role === 'user') break
    if (message.groupTurnKind === 'proactive') {
      proactiveTurnIds.add(message.groupTurnId ?? message.id)
    }
  }

  return proactiveTurnIds.size
}

export function countDirectProactiveTurnsSinceLastUser(messages: ChatMessage[]): number {
  let count = 0

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role === 'user') break
    if (message.directTurnKind === 'proactive') count += 1
  }

  return count
}

export function getGroupProactiveDelayMs(conversationId: string, messages: ChatMessage[]): number {
  const latestMessage = messages.at(-1)
  const pulse = seededUnit(`${conversationId}:${messages.length}:${latestMessage?.id ?? 'empty'}:proactive-delay`)
  return 10_000 + Math.round(pulse * 16_000)
}

export function getDirectProactiveDelayMs(conversationId: string, messages: ChatMessage[]): number {
  const latestMessage = messages.at(-1)
  const pulse = seededUnit(`${conversationId}:${messages.length}:${latestMessage?.id ?? 'empty'}:direct-proactive-delay`)
  if (latestMessage?.role === 'assistant') return 60_000 + Math.round(pulse * 60_000)
  return 16_000 + Math.round(pulse * 24_000)
}

function seededUnit(seed: string): number {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 0xffffffff
}
