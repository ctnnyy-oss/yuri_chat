import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppState, CharacterCard, ChatMessage, ConversationState, SendMessageOptions } from '../domain/types'
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
import { chooseAssistantDeliveryMode } from '../services/messageDelivery'
import { addMemoryEventToState, applyAgentActionsToState, enqueueAgentTaskActions } from './agentActions'
import { formatChatFailure } from './chatFailure'
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
  const [pendingReplyCount, setPendingReplyCount] = useState(0)
  const [chatAlertState, setChatAlertState] = useState<{ conversationId: string; message: string } | null>(null)
  const proactiveTimerRef = useRef<number | null>(null)
  const proactiveInFlightRef = useRef(false)
  const lastProactiveAttemptKeyRef = useRef('')
  const proactiveConversationIdRef = useRef('')
  const directProactiveTimerRef = useRef<number | null>(null)
  const directProactiveInFlightRef = useRef(false)
  const lastDirectProactiveAttemptKeyRef = useRef('')
  const directProactiveConversationIdRef = useRef('')
  const stateRef = useRef(state)
  const conversationRef = useRef(conversation)
  const chatAlert = chatAlertState?.conversationId === conversation.id ? chatAlertState.message : ''
  const groupProactiveTurnLimit = clampGroupProactiveTurnLimit(state.settings.groupChatMaxProactiveTurns)
  const isSending = pendingReplyCount > 0
  const rememberLatestState = useCallback((nextState: AppState, conversationId = conversationRef.current.id) => {
    stateRef.current = nextState
    const nextConversation = nextState.conversations.find((item) => item.id === conversationId)
    if (nextConversation) conversationRef.current = nextConversation
  }, [])
  const beginReplyActivity = useCallback(() => {
    setPendingReplyCount((count) => count + 1)
  }, [])
  const endReplyActivity = useCallback(() => {
    setPendingReplyCount((count) => Math.max(0, count - 1))
  }, [])

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    conversationRef.current = conversation
  }, [conversation])

  const runGroupProactiveTurn = useCallback(
    async ({ force = true }: { force?: boolean } = {}) => {
      if (proactivePaused) return
      if (!isGroupCharacter(character) || proactiveInFlightRef.current) return
      if (!force && isSending) return
      if (!force && (!state.settings.groupChatHumanMode || !state.settings.groupChatProactiveMode)) return
      if (!force && countGroupProactiveTurnsSinceLastUser(conversation.messages) >= groupProactiveTurnLimit) return

      const attemptKey = getConversationMessageKey(conversation.messages)
      proactiveInFlightRef.current = true
      setChatAlertState(null)
      beginReplyActivity()
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

        setState((currentState) => {
          const nextState = appendMessagesToCurrentConversation(currentState, conversation.id, conversation, groupTurn.replies)
          rememberLatestState(nextState, conversation.id)
          return nextState
        })
        const firstSpeaker = groupTurn.replies[0]?.authorName ?? character.name
        const silentHint = groupTurn.silentCount > 0 ? `（${groupTurn.silentCount} 位看过但没插话）` : ''
        setNotice(`${firstSpeaker} 主动开口了${silentHint}`)
      } catch (error) {
        setChatAlertState({ conversationId: conversation.id, message: formatChatFailure(error) })
        setNotice('模型代理未接通')
      } finally {
        proactiveInFlightRef.current = false
        endReplyActivity()
      }
    },
    [beginReplyActivity, character, conversation, endReplyActivity, groupProactiveTurnLimit, isSending, proactivePaused, rememberLatestState, setNotice, setState, state],
  )

  const runDirectProactiveTurn = useCallback(
    async ({ force = true }: { force?: boolean } = {}) => {
      if (proactivePaused) return
      if (isGroupCharacter(character) || directProactiveInFlightRef.current) return
      if (!force && isSending) return
      if (!force && !state.settings.directChatProactiveMode) return
      if (!force && countDirectProactiveTurnsSinceLastUser(conversation.messages) >= 1) return

      const attemptKey = getConversationMessageKey(conversation.messages)
      directProactiveInFlightRef.current = true
      setChatAlertState(null)
      beginReplyActivity()
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

        const proactiveMessage = turn.message
        setState((currentState) => {
          const nextState = appendMessagesToCurrentConversation(currentState, conversation.id, conversation, [proactiveMessage])
          rememberLatestState(nextState, conversation.id)
          return nextState
        })
        setNotice(`${character.name}主动发来了一条消息`)
      } catch (error) {
        setChatAlertState({ conversationId: conversation.id, message: formatChatFailure(error) })
        setNotice('模型代理没有接通')
      } finally {
        directProactiveInFlightRef.current = false
        endReplyActivity()
      }
    },
    [beginReplyActivity, character, conversation, endReplyActivity, isSending, proactivePaused, rememberLatestState, setNotice, setState, state],
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
    if (countGroupProactiveTurnsSinceLastUser(conversation.messages) >= groupProactiveTurnLimit) return
    if (typeof document !== 'undefined' && document.hidden) return

    const attemptKey = getConversationMessageKey(conversation.messages)
    if (proactiveConversationIdRef.current !== conversation.id) {
      proactiveConversationIdRef.current = conversation.id
      lastProactiveAttemptKeyRef.current = attemptKey
      return
    }
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
    groupProactiveTurnLimit,
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
    if (directProactiveConversationIdRef.current !== conversation.id) {
      directProactiveConversationIdRef.current = conversation.id
      lastDirectProactiveAttemptKeyRef.current = attemptKey
      return
    }
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

  async function handleSend(options: SendMessageOptions = {}) {
    const content = (options.content ?? draft).trim()
    if (!content) return
    setChatAlertState(null)

    const currentState = stateRef.current
    const currentConversation =
      currentState.conversations.find((item) => item.id === conversationRef.current.id) ?? conversationRef.current
    const userMessage = {
      ...createMessage('user', content),
      inputMode: options.voice ? 'voice' : 'text',
      voice: options.voice,
    } satisfies ChatMessage
    const nextConversation = updateConversationSummary({
      ...currentConversation,
      messages: [...currentConversation.messages, userMessage],
      updatedAt: nowIso(),
    })
    const recallMode = isExplicitMemoryQuery(content)
    const touchedMemories = touchRelevantMemories(currentState.memories, content, {
      characterId: character.id,
      conversationId: nextConversation.id,
      memoryEmbeddings: currentState.memoryEmbeddings,
      maxItems: recallMode ? 18 : 12,
      recallMode,
    })
    const capturedMemory = currentState.settings.autoMemoryEnabled
      ? maybeCaptureMemory(userMessage, nextConversation, character)
      : null
    const capturedMemoryMeetsFloor = Boolean(
      capturedMemory && capturedMemory.confidence >= currentState.settings.memoryConfidenceFloor,
    )
    const memoryBlockedByTombstone = Boolean(
      capturedMemory && capturedMemoryMeetsFloor && isMemoryBlockedByTombstones(capturedMemory, currentState.memoryTombstones),
    )
    const keptMemory =
      capturedMemory &&
      capturedMemoryMeetsFloor &&
      !memoryBlockedByTombstone
        ? capturedMemory
        : null

    let nextState = {
      ...upsertConversation(currentState, nextConversation),
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

    rememberLatestState(nextStateWithUsage, nextConversation.id)
    setState(nextStateWithUsage)
    if (!options.content) setDraft('')
    beginReplyActivity()
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
          setNotice(groupTurn.skippedReason ?? '群里暂时安静了一下')
          return
        }

        const firstReply = groupTurn.replies[0]
        setState((currentState) => {
          const nextState = appendMessagesToCurrentConversation(
            {
              ...currentState,
              memoryUsageLogs: attachAssistantToMemoryUsageLog(
                currentState.memoryUsageLogs,
                usageLog.id,
                firstReply.id,
              ),
            },
            nextConversation.id,
            nextConversation,
            groupTurn.replies,
          )
          rememberLatestState(nextState, nextConversation.id)
          return nextState
        })
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
          setNotice(directTurn.skippedReason ?? `${character.name}暂时没有回复`)
          return
        }
        assistantMessage = directTurn.message
      } else {
        const result = await requestAssistantReply(requestBundle, nextState.settings)
        assistantMessage = {
          ...createMessage('assistant', result.reply),
          deliveryMode: chooseAssistantDeliveryMode({
            character,
            content: result.reply,
            conversationMessages: nextConversation.messages,
            scope: 'direct',
            settings: nextState.settings,
            triggerMessage: userMessage,
          }),
          agent: result.agent,
        }
      }
      setState((currentState) => {
        const repliedState = appendMessagesToCurrentConversation(
          {
            ...currentState,
            memoryUsageLogs: attachAssistantToMemoryUsageLog(
              currentState.memoryUsageLogs,
              usageLog.id,
              assistantMessage.id,
            ),
          },
          nextConversation.id,
          nextConversation,
          [assistantMessage],
        )
        const nextState = applyAgentActionsToState(
          repliedState,
          assistantMessage.agent?.actions,
          { character, conversation: nextConversation, userMessage },
        ).state
        rememberLatestState(nextState, nextConversation.id)
        return nextState
      })
      setNotice('回复完成')
      void enqueueAgentTaskActions(assistantMessage.agent?.actions)
    } catch (error) {
      setChatAlertState({ conversationId: nextConversation.id, message: formatChatFailure(error) })
      setNotice('模型代理未接通')
    } finally {
      endReplyActivity()
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

function appendMessagesToCurrentConversation(
  state: AppState,
  conversationId: string,
  fallbackConversation: ConversationState,
  messages: ChatMessage[],
): AppState {
  const currentConversation =
    state.conversations.find((item) => item.id === conversationId) ?? fallbackConversation
  const existingMessageIds = new Set(currentConversation.messages.map((message) => message.id))
  const newMessages = messages.filter((message) => !existingMessageIds.has(message.id))
  if (newMessages.length === 0) return state

  return upsertConversation(
    state,
    updateConversationSummary({
      ...currentConversation,
      messages: [...currentConversation.messages, ...newMessages],
      updatedAt: nowIso(),
    }),
  )
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
        optional: true,
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

function clampGroupProactiveTurnLimit(value: number): number {
  if (value < 0) return Number.POSITIVE_INFINITY
  const normalized = Number.isFinite(value) ? Math.trunc(value) : 2
  return Math.min(999, Math.max(0, normalized))
}
