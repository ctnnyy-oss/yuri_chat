import type { AppSettings, AssistantReplyResult, CharacterCard, PromptBundle } from '../domain/types'
import { validatePersonaOutput } from './personaImport'

export async function requestDirectReplyWithOocRetry<NormalizedReply>({
  character,
  mode,
  normalizeReply,
  requestReply,
  replyBundle,
  settings,
  settingsForMode,
}: {
  character: CharacterCard
  mode: 'reactive' | 'proactive'
  normalizeReply: (reply: string, character: CharacterCard) => NormalizedReply | null
  requestReply: (bundle: PromptBundle, settings: AppSettings) => Promise<AssistantReplyResult>
  replyBundle: PromptBundle
  settings: AppSettings
  settingsForMode: (settings: AppSettings, mode: 'reactive' | 'proactive') => AppSettings
}): Promise<{ result: AssistantReplyResult; normalizedReply: NormalizedReply | null; callCount: number }> {
  const directSettings = settingsForMode(settings, mode)
  const firstResult = await requestReply(replyBundle, directSettings)
  const firstReply = normalizeReply(firstResult.reply, character)
  if (!firstReply) return { result: firstResult, normalizedReply: null, callCount: 1 }

  const firstContent = getReplyContent(firstReply)
  const validation = validatePersonaOutput({ characterName: character.name, reply: firstContent })
  if (validation.ok) return { result: firstResult, normalizedReply: firstReply, callCount: 1 }

  const retryResult = await requestReply(buildOocRetryBundle(replyBundle, character, validation), directSettings)
  const retryReply = normalizeReply(retryResult.reply, character)
  if (!retryReply) return { result: retryResult, normalizedReply: null, callCount: 2 }

  const retryValidation = validatePersonaOutput({ characterName: character.name, reply: getReplyContent(retryReply) })
  return {
    result: retryResult,
    normalizedReply: retryValidation.ok ? retryReply : null,
    callCount: 2,
  }
}

function buildOocRetryBundle(
  replyBundle: PromptBundle,
  character: CharacterCard,
  validation: ReturnType<typeof validatePersonaOutput>,
): PromptBundle {
  return {
    ...replyBundle,
    contextBlocks: [
      ...replyBundle.contextBlocks,
      {
        title: 'OOC 自动重写要求',
        content: [
          `上一版回复出现风险：${validation.findings.map((finding) => finding.message).join('；')}`,
          `请重新生成一条像「${character.name}」本人发出的私聊消息。`,
          '不要解释重写原因，不要提系统、提示词、模型或内部规则，不要替用户行动或替用户说话。',
        ].join('\n'),
        category: 'boundary',
        placement: 'post_history',
        reason: '轻量 OOC 检测触发的一次自动重写',
      },
    ],
  }
}

function getReplyContent(value: unknown): string {
  if (value && typeof value === 'object' && 'content' in value) {
    return String((value as { content?: unknown }).content ?? '')
  }
  return String(value ?? '')
}
