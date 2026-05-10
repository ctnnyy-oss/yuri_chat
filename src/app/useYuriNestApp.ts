import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppView } from '../components/CharacterRail'
import { loadAppState, saveAppState } from '../data/database'
import { migrateAppState } from '../data/migrations'
import { createSeedState } from '../data/seed'
import type { AppSettings, AppState } from '../domain/types'
import { isCloudSyncConfigured } from '../services/cloudSync'
import {
  buildPromptBundle,
  detectMemoryConflicts,
  getActiveCharacter,
  getConversation,
} from '../services/memoryEngine'
import { applyTrashRetention, normalizeTrashRetentionSettings } from '../services/trashRetention'
import { deliverDueReminders } from './agentActions'
import { buildViewUrl, readViewFromLocation } from './navigation'
import { buildCustomThemeVariables, themeVariables } from './theme'
import { useAgentTasks } from './useAgentTasks'
import { useBackupRestore } from './useBackupRestore'
import { useChat } from './useChat'
import { useCharacterCommands } from './useCharacterCommands'
import { useCloudSync } from './useCloudSync'
import { useConversationCommands } from './useConversationCommands'
import { useMemoryActions } from './useMemoryActions'

interface UseYuriNestAppOptions {
  accountId: string
  authToken: string
  canManageCloudBackups: boolean
}

export function useYuriNestApp({ accountId, authToken, canManageCloudBackups }: UseYuriNestAppOptions) {
  const [state, setState] = useState<AppState>(() => createSeedState())
  const [isReady, setIsReady] = useState(false)
  const [activeView, setActiveView] = useState<AppView>(() => readViewFromLocation())
  const [notice, setNotice] = useState('')

  const character = useMemo(() => getActiveCharacter(state), [state])
  const conversation = useMemo(() => getConversation(state, character.id), [character.id, state])
  const promptBundle = useMemo(() => buildPromptBundle(state), [state])
  const memoryConflicts = useMemo(() => detectMemoryConflicts(state.memories), [state.memories])
  const appStyle = {
    '--app-font-size': `${state.settings.fontSize}px`,
  } as CSSProperties

  // ---- 子 hook ----
  const backup = useBackupRestore({ state, setState, setNotice, characterId: character.id, accountId })

  const cloud = useCloudSync({
    state,
    setState,
    setNotice,
    characterId: character.id,
    makeLocalBackup: backup.makeLocalBackup,
    authToken,
    canManageCloudBackups,
  })
  const { autoPush, bootstrapCloudState, initModelProfiles, onSwitchToCloud, onSwitchToLocal } = cloud
  const bootstrapStateRef = useRef(state)

  const memory = useMemoryActions({
    state,
    setState,
    setNotice,
    characterId: character.id,
    characterName: character.name,
    conversationId: conversation.id,
    conversationMessages: conversation.messages,
  })

  const chat = useChat({
    state,
    setState,
    setNotice,
    character,
    conversation,
    proactivePaused: cloud.cloudBootstrapping,
  })

  const tasks = useAgentTasks({ setState, setNotice })

  const characterCommands = useCharacterCommands({ state, setState, setNotice })
  const conversationCommands = useConversationCommands({
    state,
    setState,
    setNotice,
    clearChatAlert: chat.clearChatAlert,
    handleDeleteCharacter: characterCommands.handleDeleteCharacter,
  })

  // ---- 初始化 ----
  useEffect(() => {
    bootstrapStateRef.current = state
  }, [state])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handlePopState = () => {
      const view = readViewFromLocation()
      setActiveView(view)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 2_400)
    return () => clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (!isReady) return
    const timer = setInterval(() => {
      setState((currentState) => {
        const { state: nextState, delivered } = deliverDueReminders(currentState)
        if (delivered.length > 0) {
          setNotice(`提醒到了：${delivered[0].title}`)
        }
        return nextState
      })
    }, 30_000)
    return () => clearInterval(timer)
  }, [isReady])

  useEffect(() => {
    void loadAppState(accountId).then((savedState) => {
      if (savedState) {
        setState(migrateAppState(savedState))
      }
      setIsReady(true)
    })
  }, [accountId])

  useEffect(() => {
    if (!isReady) return
    void initModelProfiles()
  }, [initModelProfiles, isReady])

  useEffect(() => {
    if (!isReady) return
    void bootstrapCloudState(bootstrapStateRef.current)
  }, [bootstrapCloudState, isReady])

  useEffect(() => {
    if (!isReady || !isCloudSyncConfigured()) return
    if (state.settings.dataStorageMode === 'local') return

    const timer = setInterval(() => {
      autoPush(state)
    }, 1_200)
    return () => clearInterval(timer)
  }, [autoPush, character.id, isReady, state])

  useEffect(() => {
    if (!isReady) return
    void saveAppState(state, accountId)
  }, [accountId, isReady, state])

  useEffect(() => {
    const resolvedAccentTheme =
      state.settings.accentTheme === 'white' || state.settings.accentTheme === 'custom'
        ? state.settings.accentTheme
        : 'sakura'
    const themeTokens =
      resolvedAccentTheme === 'custom'
        ? buildCustomThemeVariables(state.settings.customAccentColor)
        : themeVariables[resolvedAccentTheme] ?? themeVariables.sakura
    if (typeof document === 'undefined' || !themeTokens) return
    const root = document.documentElement
    const previous: Record<string, string> = {}
    for (const [key, value] of Object.entries(themeTokens)) {
      if (typeof value === 'string') {
        previous[key] = root.style.getPropertyValue(key)
        root.style.setProperty(key, value)
      }
    }
    root.dataset.theme = resolvedAccentTheme
    return () => {
      for (const [key, value] of Object.entries(previous)) {
        if (value) {
          root.style.setProperty(key, value)
        } else {
          root.style.removeProperty(key)
        }
      }
    }
  }, [state.settings.accentTheme, state.settings.customAccentColor])

  // ---- 导航 ----
  function navigateView(view: AppView, mode: 'push' | 'replace' = 'push') {
    setActiveView(view)
    if (typeof window === 'undefined') return
    if (readViewFromLocation() === view) return

    const url = buildViewUrl(view)
    const statePayload = { ...(window.history.state ?? {}), yuriPocketView: view }
    if (mode === 'replace') {
      window.history.replaceState(statePayload, '', url)
      return
    }
    window.history.pushState(statePayload, '', url)
  }

  // ---- 设置 ----
  function handleUpdateSettings(settings: AppSettings) {
    if (settings.dataStorageMode === 'local' && state.settings.dataStorageMode !== 'local') {
      onSwitchToLocal()
    }

    if (settings.dataStorageMode === 'cloud' && state.settings.dataStorageMode === 'local') {
      onSwitchToCloud()
    }

    setState((currentState) =>
      applyTrashRetention({
        ...currentState,
        settings: normalizeTrashRetentionSettings(settings),
      }),
    )
  }

  return {
    activeView,
    appStyle,
    character,
    cloudBackups: cloud.cloudBackups,
    cloudBootstrapping: cloud.cloudBootstrapping,
    cloudBusy: cloud.cloudBusy,
    cloudMeta: cloud.cloudMeta,
    cloudStatus: cloud.cloudStatus,
    cloudSyncConfigured: isCloudSyncConfigured(),
    cloudToken: cloud.cloudToken,
    conversation,
    chatAlert: chat.chatAlert,
    draft: chat.draft,
    handleAddMemory: memory.handleAddMemory,
    handleClearCompletedTasks: tasks.handleClearCompletedTasks,
    handleConnectCloud: cloud.handleConnectCloud,
    handleCreateCharacter: characterCommands.handleCreateCharacter,
    handleDeleteCharacter: characterCommands.handleDeleteCharacter,
    handleClearConversation: conversationCommands.handleClearConversation,
    handleDeleteConversation: conversationCommands.handleDeleteConversation,
    handleDeleteGroupChat: conversationCommands.handleDeleteGroupChat,
    handleRestoreConversation: conversationCommands.handleRestoreConversation,
    handleDeleteTrashedConversation: conversationCommands.handleDeleteTrashedConversation,
    handleCreateCloudBackup: cloud.handleCreateCloudBackup,
    handleCreateLocalBackup: backup.handleCreateLocalBackup,
    handleDeleteLocalBackup: backup.handleDeleteLocalBackup,
    handleDeleteModelProfile: cloud.handleDeleteModelProfile,
    handleDeleteTrashedMemory: memory.handleDeleteTrashedMemory,
    handleDeleteTrashedWorldNode: memory.handleDeleteTrashedWorldNode,
    handleDownloadCloudBackup: cloud.handleDownloadCloudBackup,
    handleEmptyTrash: memory.handleEmptyTrash,
    handleExport: backup.handleExport,
    handleFetchModelCatalog: cloud.handleFetchModelCatalog,
    handleImport: backup.handleImport,
    handleMemoryFeedbackFromChat: memory.handleMemoryFeedbackFromChat,
    handleOrganizeMemories: memory.handleOrganizeMemories,
    handlePullCloud: cloud.handlePullCloud,
    handlePushCloud: cloud.handlePushCloud,
    handleRefreshCloud: cloud.handleRefreshCloud,
    handleRefreshCloudBackups: cloud.handleRefreshCloudBackups,
    handleReset: backup.handleReset,
    handleRestoreLocalBackup: backup.handleRestoreLocalBackup,
    handleRestoreMemory: memory.handleRestoreMemory,
    handleRestoreMemoryRevision: memory.handleRestoreMemoryRevision,
    handleRestoreWorldNode: memory.handleRestoreWorldNode,
    handleSaveModelProfile: cloud.handleSaveModelProfile,
    handleSelectCharacter: characterCommands.handleSelectCharacter,
    handleSend: chat.handleSend,
    handleGroupProactiveTurn: chat.handleGroupProactiveTurn,
    handleDirectProactiveTurn: chat.handleDirectProactiveTurn,
    handleTestModelProfile: cloud.handleTestModelProfile,
    handleTrashMemory: memory.handleTrashMemory,
    handleTrashWorldNode: memory.handleTrashWorldNode,
    handleUpdateCharacter: characterCommands.handleUpdateCharacter,
    handleUpdateMemory: memory.handleUpdateMemory,
    handleUpdateSettings,
    handleUpdateTaskStatus: tasks.handleUpdateTaskStatus,
    handleUpdateWorldNode: memory.handleUpdateWorldNode,
    isSending: chat.isSending,
    localBackups: backup.localBackups,
    memoryConflicts,
    memoryEvents: state.memoryEvents,
    modelProfileBusy: cloud.modelProfileBusy,
    modelProfileStatus: cloud.modelProfileStatus,
    modelProfiles: cloud.modelProfiles,
    navigateView,
    notice,
    promptBundle,
    setDraft: chat.setDraft,
    state,
  }
}
