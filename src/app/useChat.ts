import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppState, CharacterCard, ChatMessage, ConversationState } from '../domain/types'
import { requestAssistantReply } from '../services/chatApi'
import { getSavedCloudToken, isCloudSyncConfigured } from '../services/cloudSync'
import { generateDirectChatProactiveTurn, generateDirectChatReply } from '../services/directChatEngine'
import {
  generateGroupChatProactiveTurn,
  generateGroupChatReplies,
  isGroupCharacter,
} from '../services/groupChatEngine'
import {
  getMemoryEmbeddingInput,
  upsertMemoryEmbeddingRecordsFromVectors,
} from '../services/memoryEmbeddingIndex'
import {
  attachAssistantToMemoryUsageLog,
  buildPromptBundle,
  createMemoryUsageLog,
  createMessage,
  getMemoryUsageLogLimit,
  integrateMemoryCandidate,
  isExplicitMemoryQuery,
  isMemoryBlockedByTombstones,
  maybeCaptureMemory,
  nowIso,
  touchRelevantMemories,
  updateConversationSummary,
  upsertConversation,
} from '../services/memoryEngine'
import { requestModelEmbeddings } from '../services/modelProfiles'
import { addMemoryEventToState, applyAgentActionsToState, enqueueAgentTaskActions } from './agentActions'
import { countDirectProactiveTurnsSinceLastUser, countGroupProactiveTurnsSinceLastUser, getConversationMessageKey, getDirectProactiveDelayMs, getGroupProactiveDelayMs } from './chatProactiveTiming'

interface UseChatDeps {
  state: AppState
  setState: Dispatch<SetStateAction<AppState>>
  setNotice: Dispatch<SetStateAction<string>>
  character: CharacterCard
  conversation: ConversationState
  proactivePaused?: boolean
}

export function useChat({ state, setState, setNotice, character, conversation, proactivePaused = false }: UseChatDeps) {
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [chatAlertState, setChatAlertState] = useState<{ conversationId: string; message: string } | null>(null)
  const proactiveTimerRef = useRef<number | null>(null)
  const proactiveInFlightRef = useRef(false)
  const lastProactiveAttemptKeyRef = useRef('')
  const directProactiveTimerRef = useRef<number | null>(null)
  const directProactiveInFlightRef = useRef(false)
  const lastDirectProactiveAttemptKeyRef = useRef('')
  const chatAlert = chatAlertState?.conversationId === conversation.id ? chatAlertState.message : ''

  const runGroupProactiveTurn = useCallback(
    async ({ force = true }: { force?: boolean } = {}) => {
      if (proactivePaused) return
      if (!isGroupCharacter(character) || isSending || proactiveInFlightRef.current) return
      if (!force && (!state.settings.groupChatHumanMode || !state.settings.groupChatProactiveMode)) return
      if (!force && countGroupProactiveTurnsSinceLastUser(conversation.messages) >= 2) return

      const attemptKey = getConversationMessageKey(conversation.messages)
      proactiveInFlightRef.current = true
      setChatAlertState(null)
      setIsSending(true)
      setNotice(force ? '群里有人在想要不要开口' : '群里安静了一会儿')

      try {
        const groupTurn = await generateGroupChatProactiveTurn({
          state,
          group: character,
          conversation,
          requestReply: requestAssistantReply,
          force,
        })
        if (groupTurn.replies.length === 0) {
          lastProactiveAttemptKeyRef.current = attemptKey
          setNotice(groupTurn.skippedReason ?? '群里暂时没人主动开口')
          return
        }

        const repliedConversation = updateConversationSummary({
          ...conversation,
          messages: [...conversation.messages, ...groupTurn.replies],
          updatedAt: nowIso(),
        })
        setState((currentState) => upsertConversation(currentState, repliedConversation))
        const firstSpeaker = groupTurn.replies[0]?.authorName ?? character.name
        const silentHint = groupTurn.silentCount > 0 ? `（${groupTurn.silentCount} 位看过但没插话）` : ''
        setNotice(`${firstSpeaker} 主动开口了${silentHint}`)
      } catch (error) {
        setChatAlertState({ conversationId: conversation.id, message: formatChatFailure(error) })
        setNotice('模型代理未接通')
      } finally {
        proactiveInFlightRef.current = false
        setIsSending(false)
      }
    },
    [character, conversation, isSending, proactivePaused, setNotice, setState, state],
  )

  const runDirectProactiveTurn = useCallback(
    async ({ force = true }: { force?: boolean } = {}) => {
      if (proactivePaused) return
      if (isGroupCharacter(character) || isSending || directProactiveInFlightRef.current) return
      if (!force && !state.settings.directChatProactiveMode) return
      if (!force && countDirectProactiveTurnsSinceLastUser(conversation.messages) >= 1) return

      const attemptKey = getConversationMessageKey(conversation.messages)
      directProactiveInFlightRef.current = true
      setChatAlertState(null)
      setIsSending(true)
      setNotice(force ? `${character.name}正在想要不要主动开口` : `${character.name}安静了一会儿`)

      try {
        const baseBundle = buildPromptBundle(state)
        const turn = await generateDirectChatProactiveTurn({
          character,
          conversation,
          bundle: baseBundle,
          settings: state.settings,
          requestReply: requestAssistantReply,
          force,
        })

        if (!turn.message) {
          lastDirectProactiveAttemptKeyRef.current = attemptKey
          setNotice(turn.skippedReason ?? `${character.name}暂时没有主动发消息`)
          return
        }

        const repliedConversation = updateConversationSummary({
          ...conversation,
          messages: [...conversation.messages, turn.message],
          updatedAt: nowIso(),
        })
        setState((currentState) => upsertConversation(currentState, repliedConversation))
        setNotice(`${character.name}主动发来了一条消息`)
      } catch (error) {
        setChatAlertState({ conversationId: conversation.id, message: formatChatFailure(error) })
        setNotice('模型代理没有接通')
      } finally {
        directProactiveInFlightRef.current = false
        setIsSending(false)
      }
    },
    [character, conversation, isSending, proactivePaused, setNotice, setState, state],
  )

  useEffect(() => {
    if (proactiveTimerRef.current !== null) {
      window.clearTimeout(proactiveTimerRef.current)
      proactiveTimerRef.current = null
    }
    if (!isGroupCharacter(character)) return
    if (proactivePaused) return
    if (!state.settings.groupChatHumanMode || !state.settings.groupChatProactiveMode) return
    if (isSending || proactiveInFlightRef.current) return
    if (conversation.messages.length === 0) return
    if (countGroupProactiveTurnsSinceLastUser(conversation.messages) >= 2) return
    if (typeof document !== 'undefined' && document.hidden) return

    const attemptKey = getConversationMessageKey(conversation.messages)
    if (lastProactiveAttemptKeyRef.current === attemptKey) return

    proactiveTimerRef.current = window.setTimeout(() => {
      proactiveTimerRef.current = null
      void runGroupProactiveTurn({ force: false })
    }, getGroupProactiveDelayMs(conversation.id, conversation.messages))

    return () => {
      if (proactiveTimerRef.current !== null) {
        window.clearTimeout(proactiveTimerRef.current)
        proactiveTimerRef.current = null
      }
    }
  }, [
    character,
    conversation.id,
    conversation.messages,
    isSending,
    proactivePaused,
    runGroupProactiveTurn,
    state.settings.groupChatHumanMode,
    state.settings.groupChatProactiveMode,
  ])

  useEffect(() => {
    if (directProactiveTimerRef.current !== null) {
      window.clearTimeout(directProactiveTimerRef.current)
      directProactiveTimerRef.current = null
    }
    if (isGroupCharacter(character)) return
    if (proactivePaused) return
    if (!state.settings.directChatProactiveMode) return
    if (isSending || directProactiveInFlightRef.current) return
    if (conversation.messages.length === 0) return
    if (countDirectProactiveTurnsSinceLastUser(conversation.messages) >= 1) return
    if (typeof document !== 'undefined' && document.hidden) return

    const attemptKey = getConversationMessageKey(conversation.messages)
    if (lastDirectProactiveAttemptKeyRef.current === attemptKey) return

    directProactiveTimerRef.current = window.setTimeout(() => {
      directProactiveTimerRef.current = null
      void runDirectProactiveTurn({ force: false })
    }, getDirectProactiveDelayMs(conversation.id, conversation.messages))

    return () => {
      if (directProactiveTimerRef.current !== null) {
        window.clearTimeout(directProactiveTimerRef.current)
        directProactiveTimerRef.current = null
      }
    }
  }, [
    character,
    conversation.id,
    conversation.messages,
    isSending,
    proactivePaused,
    runDirectProactiveTurn,
    state.settings.directChatProactiveMode,
  ])

  async function handleSend() {
    const content = draft.trim()
    if (!content || isSending) return
    setChatAlertState(null)

    const userMessage = createMessage('user', content)
    const nextConversation = updateConversationSummary({
      ...conversation,
      messages: [...conversation.messages, userMessage],
      updatedAt: nowIso(),
    })
    const recallMode = isExplicitMemoryQuery(content)
    const touchedMemories = touchRelevantMemories(state.memories, content, {
      characterId: character.id,
      conversationId: nextConversation.id,
      memoryEmbeddings: state.memoryEmbeddings,
      maxItems: recallMode ? 18 : 12,
      recallMode,
    })
    const capturedMemory = state.settings.autoMemoryEnabled
      ? maybeCaptureMemory(userMessage, nextConversation, character)
      : null
    const capturedMemoryMeetsFloor = Boolean(
      capturedMemory && capturedMemory.confidence >= state.settings.memoryConfidenceFloor,
    )
    const memoryBlockedByTombstone = Boolean(
      capturedMemory && capturedMemoryMeetsFloor && isMemoryBlockedByTombstones(capturedMemory, state.memoryTombstones),
    )
    const keptMemory =
      capturedMemory &&
      capturedMemoryMeetsFloor &&
      !memoryBlockedByTombstone
        ? capturedMemory
        : null

    let nextState = {
      ...upsertConversation(state, nextConversation),
      memories: keptMemory ? integrateMemoryCandidate(touchedMemories, keptMemory) : touchedMemories,
    }
    if (keptMemory) {
      nextState = addMemoryEventToState(nextState, {
        type: 'captured',
        actor: 'assistant',
        title: keptMemory.title,
        detail: keptMemory.status === 'candidate' ? '自动捕捉为候选记忆，等待妹妹确认。' : '自动捕捉并写入长期记忆。',
        memoryIds: [keptMemory.id],
        characterId: character.id,
        conversationId: nextConversation.id,
      })
    }
    const embeddingContext = await prepareExternalEmbeddingContext(nextState, content, recallMode)
    const stateForPrompt = embeddingContext.state
    const requestBundle = buildPromptBundle(stateForPrompt, {
      embeddingModel: embeddingContext.embeddingModel,
      embeddingQueryVector: embeddingContext.embeddingQueryVector,
    })
    const usageLog = createMemoryUsageLog({
      bundle: requestBundle,
      conversation: nextConversation,
      character,
      userMessage,
    })
    const nextStateWithUsage = {
      ...stateForPrompt,
      memoryUsageLogs: [usageLog, ...stateForPrompt.memoryUsageLogs].slice(0, getMemoryUsageLogLimit()),
    }

    setState(nextStateWithUsage)
    setDraft('')
    setIsSending(true)
    setNotice(
      keptMemory
        ? (keptMemory.status === 'candidate' ? '发现一条待确认记忆' : '已捕捉并归档一条记忆')
        : memoryBlockedByTombstone
          ? '这条像已彻底删除过的记忆，未自动写入'
          : '消息已送达',
    )

    try {
      if (isGroupCharacter(character)) {
        const groupTurn = await generateGroupChatReplies({
          state: nextStateWithUsage,
          group: character,
          conversation: nextConversation,
          userMessage,
          requestReply: requestAssistantReply,
        })
        if (groupTurn.replies.length === 0) {
          setState(nextStateWithUsage)
          setNotice(groupTurn.skippedReason ?? '群里暂时安静了一下')
          return
        }

        const firstReply = groupTurn.replies[0]
        const repliedConversation = updateConversationSummary({
          ...nextConversation,
          messages: [...nextConversation.messages, ...groupTurn.replies],
          updatedAt: nowIso(),
        })
        setState(
          upsertConversation(
            {
              ...nextStateWithUsage,
              memoryUsageLogs: attachAssistantToMemoryUsageLog(
                nextStateWithUsage.memoryUsageLogs,
                usageLog.id,
                firstReply.id,
              ),
            },
            repliedConversation,
          ),
        )
        const silentHint = groupTurn.silentCount > 0 ? `（${groupTurn.silentCount} 位看过但没插话）` : ''
        setNotice(`群里 ${groupTurn.replies.length} 位成员接话${silentHint}`)
        return
      }

      let assistantMessage: ChatMessage
      if (nextState.settings.directChatHumanMode) {
        const directTurn = await generateDirectChatReply({
          character,
          conversation: nextConversation,
          userMessage,
          bundle: requestBundle,
          settings: nextState.settings,
          requestReply: requestAssistantReply,
        })
        if (!directTurn.message) {
          lastDirectProactiveAttemptKeyRef.current = getConversationMessageKey(nextConversation.messages)
          setState(nextStateWithUsage)
          setNotice(directTurn.skippedReason ?? `${character.name}暂时没有回复`)
          return
        }
        assistantMessage = directTurn.message
      } else {
        const result = await requestAssistantReply(requestBundle, nextState.settings)
        assistantMessage = {
          ...createMessage('assistant', result.reply),
          agent: result.agent,
        }
      }
      const repliedConversation = {
        ...nextConversation,
        messages: [...nextConversation.messages, assistantMessage],
        updatedAt: nowIso(),
      }
      const repliedState = upsertConversation(
        {
          ...nextStateWithUsage,
          memoryUsageLogs: attachAssistantToMemoryUsageLog(
            nextStateWithUsage.memoryUsageLogs,
            usageLog.id,
            assistantMessage.id,
          ),
        },
        repliedConversation,
      )
      const { state: stateWithAgentActions, appliedLabels } = applyAgentActionsToState(
        repliedState,
        assistantMessage.agent?.actions,
        { character, conversation: nextConversation, userMessage },
      )
      setState(stateWithAgentActions)
      setNotice(appliedLabels.length > 0 ? `已执行：${appliedLabels.slice(0, 2).join(' / ')}` : '回复完成')
      void enqueueAgentTaskActions(assistantMessage.agent?.actions)
    } catch (error) {
      setState(nextStateWithUsage)
      setChatAlertState({ conversationId: conversation.id, message: formatChatFailure(error) })
      setNotice('模型代理未接通')
    } finally {
      setIsSending(false)
    }
  }

  function clearChatAlert() {
    setChatAlertState(null)
  }

  return {
    draft,
    setDraft,
    isSending,
    chatAlert,
    clearChatAlert,
    handleSend,
    handleGroupProactiveTurn: () => {
      void runGroupProactiveTurn({ force: true })
    },
    handleDirectProactiveTurn: () => {
      void runDirectProactiveTurn({ force: true })
    },
  }
}

function formatChatFailure(error: unknown): string {
  const rawMessage = error instanceof Error && error.message ? error.message : '模型代理刚才没有接通。'
  const message = rawMessage.replace(/\s+/g, ' ').trim()

  if (/401|授权|登录|口令|token/i.test(message)) {
    return `需要授权：请重新登录，或检查模型中转站的 API Key。${message}`
  }
  if (/400|参数|格式|invalid|bad request/i.test(message)) {
    return `请求格式有问题：模型名、接口格式或上下文可能不被上游接受。${message}`
  }
  if (/402|403|余额|额度|quota|billing|forbidden/i.test(message)) {
    return `额度或权限不足：请检查中转站余额、套餐额度或模型权限。${message}`
  }
  if (/429|频率|rate limit|too many/i.test(message)) {
    return `请求太频繁：上游限流了，稍等一下再试。${message}`
  }
  if (/502|503|504|上游|供应商|gateway|unavailable|timeout/i.test(message)) {
    return `模型上游暂时没接住：通常是中转站或模型供应商临时波动。${message}`
  }
  if (/500|服务异常|server/i.test(message)) {
    return `模型服务临时异常：这更像后端或上游服务报错。${message}`
  }
  return `模型代理刚才没有接通：${message}`
}

async function prepareExternalEmbeddingContext(
  state: AppState,
  query: string,
  recallMode: boolean,
): Promise<{ state: AppState; embeddingModel?: string; embeddingQueryVector?: number[] }> {
  if (!recallMode || !isCloudSyncConfigured()) return { state }
  if (!state.settings.modelProfileId) return { state }

  const memories = state.memories
    .filter((memory) => memory.status === 'active' && memory.mentionPolicy !== 'silent' && memory.sensitivity !== 'critical')
    .sort((a, b) => b.priority - a.priority || (b.memoryStrength ?? 0) - (a.memoryStrength ?? 0))
    .slice(0, 31)
  if (memories.length === 0) return { state }

  try {
    const result = await withTimeout(
      requestModelEmbeddings(getSavedCloudToken(), {
        profileId: state.settings.modelProfileId,
        texts: [...memories.map(getMemoryEmbeddingInput), query],
      }),
      3_500,
    )
    const queryVector = result.embeddings[memories.length]
    if (!queryVector?.length) return { state }

    const embeddingModel = `external:${result.model}`
    return {
      state: {
        ...state,
        memoryEmbeddings: upsertMemoryEmbeddingRecordsFromVectors(
          memories,
          state.memoryEmbeddings,
          embeddingModel,
          result.embeddings.slice(0, memories.length),
        ),
      },
      embeddingModel,
      embeddingQueryVector: queryVector,
    }
  } catch {
    return { state }
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      window.setTimeout(() => reject(new Error('embedding timeout')), timeoutMs)
    }),
  ])
}
