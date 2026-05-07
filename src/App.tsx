import './styles/shell.css'
import './styles/sidebar.css'
import './styles/chat.css'
import './styles/memory.css'
import './styles/guardian.css'
import './styles/settings.css'
import './styles/modal.css'
import './styles/buttons.css'
import './styles/status.css'
import './styles/social.css'
import './styles/tasks.css'
import './styles/mobile.css'
import { CloudSun, Maximize2, Minus, PanelsTopLeft, X } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import { useYuriNestApp } from './app/useYuriNestApp'
import { CharacterRail } from './components/CharacterRail'
import { ChatPhone } from './components/ChatPhone'
import { MemoryPanel } from './components/MemoryPanel'
import { MobileMessageList } from './components/MobileMessageList'
import { MobileNav } from './components/MobileNav'
import { QqFeaturePanel } from './components/QqFeaturePanel'
import { AgentTaskPanel } from './components/agent/AgentTaskPanel'

type GroupChatDraft = { name: string; text: string; memberIds?: string[] }

function App() {
  const [mobileMessageListOpen, setMobileMessageListOpen] = useState(true)
  const [shellTip, setShellTip] = useState('')
  const {
    activeView,
    appStyle,
    character,
    cloudBackups,
    cloudBusy,
    cloudMeta,
    cloudStatus,
    cloudSyncConfigured,
    cloudToken,
    conversation,
    chatAlert,
    draft,
    handleAddMemory,
    handleClearCompletedTasks,
    handleConnectCloud,
    handleCreateCharacter,
    handleCreateCloudBackup,
    handleCreateLocalBackup,
    handleClearConversation,
    handleDeleteLocalBackup,
    handleDeleteCharacter,
    handleDeleteModelProfile,
    handleDeleteTrashedMemory,
    handleDeleteTrashedWorldNode,
    handleDownloadCloudBackup,
    handleEmptyTrash,
    handleExport,
    handleFetchModelCatalog,
    handleImport,
    handleMemoryFeedbackFromChat,
    handleOrganizeMemories,
    handlePullCloud,
    handlePushCloud,
    handleRefreshCloud,
    handleRefreshCloudBackups,
    handleReset,
    handleRestoreLocalBackup,
    handleRestoreMemory,
    handleRestoreMemoryRevision,
    handleRestoreWorldNode,
    handleSaveModelProfile,
    handleSaveCloudToken,
    handleSelectCharacter,
    handleSend,
    handleTestModelProfile,
    handleTrashMemory,
    handleTrashWorldNode,
    handleUpdateCharacter,
    handleUpdateMemory,
    handleUpdateSettings,
    handleUpdateTaskStatus,
    handleUpdateWorldNode,
    isSending,
    localBackups,
    memoryConflicts,
    memoryEvents,
    modelProfileBusy,
    modelProfileStatus,
    modelProfiles,
    navigateView,
    notice,
    setDraft,
    state,
  } = useYuriNestApp()

  function handleViewChange(view: typeof activeView) {
    navigateView(view)
    if (view === 'chat') {
      setMobileMessageListOpen(true)
    }
  }

  function isMobileViewport() {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches
  }

  function pushMobileChatDetailHistory() {
    if (!isMobileViewport()) return
    if (window.history.state?.yuriMobileChatDetail) return
    window.history.pushState({ ...(window.history.state ?? {}), yuriMobileChatDetail: true }, '', window.location.href)
  }

  function closeMobileChatDetail() {
    if (typeof window !== 'undefined' && window.history.state?.yuriMobileChatDetail) {
      window.history.back()
      return
    }
    setMobileMessageListOpen(true)
  }

  function handleOpenMobileChat(characterId: string) {
    handleSelectCharacter(characterId)
    navigateView('chat')
    setMobileMessageListOpen(false)
    window.requestAnimationFrame(pushMobileChatDetailHistory)
  }

  function handleOpenGroupChat(group: GroupChatDraft) {
    const selectedMembers = state.characters.filter((item) => group.memberIds?.includes(item.id))
    const memberNames = selectedMembers.map((item) => item.name)
    const groupName =
      group.name.trim() || (memberNames.length > 0 ? `${memberNames.slice(0, 3).join('、')}的小群` : '新群聊')
    const groupText =
      group.text.trim() ||
      (memberNames.length > 0 ? `${memberNames.join('、')}已经加入群聊` : '本地创建的多人聊天')
    const existingGroup = state.characters.find((item) => item.name === groupName && item.relationship === '群聊')
    const groupId =
      existingGroup?.id ??
      handleCreateCharacter({
        name: groupName,
        relation: '群聊',
        mood: groupText,
        persona: `这是一个本地群聊：${groupName}。成员：${memberNames.length > 0 ? memberNames.join('、') : '暂未指定'}。聊天时保持每个角色的性格边界，不要把多人关系写串。`,
      })
    handleSelectCharacter(groupId)
    navigateView('chat')
    setMobileMessageListOpen(false)
    window.requestAnimationFrame(pushMobileChatDetailHistory)
    showShellTip(`已拉起群聊：${groupName}`)
  }

  function showShellTip(message: string) {
    setShellTip(message)
  }

  useEffect(() => {
    if (!shellTip) return

    const timer = window.setTimeout(() => setShellTip(''), 2200)
    return () => window.clearTimeout(timer)
  }, [shellTip])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleMobileHistory = (event: PopStateEvent) => {
      if (!isMobileViewport()) return
      const hashView = window.location.hash.replace(/^#\/?/, '')
      const isChatRoute = hashView === '' || hashView === 'chat'
      if (isChatRoute) {
        setMobileMessageListOpen(!event.state?.yuriMobileChatDetail)
        return
      }
      setMobileMessageListOpen(true)
    }

    window.addEventListener('popstate', handleMobileHistory)
    return () => window.removeEventListener('popstate', handleMobileHistory)
  }, [])

  const showMobileBottomNav = activeView !== 'chat' || mobileMessageListOpen
  const shellClassName = `app-shell ${activeView === 'chat' ? 'chat-mode' : 'feature-mode'}`
  const managementView = (
    activeView === 'model' ||
    activeView === 'memory' ||
    activeView === 'world' ||
    activeView === 'settings' ||
    activeView === 'trash'
      ? activeView
      : 'settings'
  ) as Exclude<typeof activeView, 'chat' | 'role' | 'group' | 'moments' | 'tasks'>

  return (
    <div className={shellClassName} style={appStyle}>
      <header className="desktop-titlebar" aria-label="应用顶栏">
        <div className="desktop-titlebar-brand">
          <strong className="desktop-titlebar-logo">Yuri Chat</strong>
          <span
            className="desktop-titlebar-avatar"
            style={{ '--avatar-accent': character.accent } as CSSProperties}
          >
            {character.avatar}
          </span>
          <span className="desktop-titlebar-profile">
            <b>{character.name}</b>
            <small>百合无限好</small>
          </span>
        </div>
        <div
          className="desktop-titlebar-status"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('button')) {
              showShellTip('桌面窗口入口已占位，后续客户端版本再接入')
            }
          }}
        >
          <CloudSun size={18} />
          <span>晴</span>
          <button aria-label="布局" type="button">
            <PanelsTopLeft size={16} />
          </button>
          <button aria-label="最小化" type="button">
            <Minus size={16} />
          </button>
          <button aria-label="最大化" type="button">
            <Maximize2 size={15} />
          </button>
          <button aria-label="关闭" type="button">
            <X size={17} />
          </button>
        </div>
      </header>

      <CharacterRail
        activeCharacterId={state.activeCharacterId}
        activeView={activeView}
        characters={state.characters}
        conversations={state.conversations}
        onSelect={handleSelectCharacter}
        onOpenGroupChat={handleOpenGroupChat}
        onShellAction={showShellTip}
        onViewChange={handleViewChange}
      />

      {activeView === 'chat' && mobileMessageListOpen && (
        <MobileMessageList
          activeCharacterId={state.activeCharacterId}
          characters={state.characters}
          conversations={state.conversations}
          onShellAction={showShellTip}
          onOpenChat={handleOpenMobileChat}
          onOpenGroupChat={handleOpenGroupChat}
          onDeleteCharacter={handleDeleteCharacter}
          onUpdateSettings={handleUpdateSettings}
          settings={state.settings}
        />
      )}

      {activeView === 'chat' ? (
        <ChatPhone
          activeCharacterId={state.activeCharacterId}
          character={character}
          characters={state.characters}
          draft={draft}
          key={character.id}
          isSending={isSending}
          memories={state.memories}
          memoryUsageLogs={state.memoryUsageLogs}
          messages={conversation.messages}
          systemAlert={chatAlert}
          onBackToList={closeMobileChatDetail}
          onDraftChange={setDraft}
          onMemoryFeedback={handleMemoryFeedbackFromChat}
          onSelectCharacter={handleSelectCharacter}
          onClearConversation={handleClearConversation}
          onDeleteCharacter={handleDeleteCharacter}
          onSend={handleSend}
          onShellAction={showShellTip}
          settings={state.settings}
        />
      ) : activeView === 'role' ? (
        <QqFeaturePanel
          activeCharacterId={state.activeCharacterId}
          activeView={activeView}
          characters={state.characters}
          onCreateCharacter={handleCreateCharacter}
          onDeleteCharacter={handleDeleteCharacter}
          onUpdateCharacter={handleUpdateCharacter}
          onShellAction={showShellTip}
          onOpenChat={handleOpenMobileChat}
        />
      ) : activeView === 'tasks' ? (
        <AgentTaskPanel
          characters={state.characters}
          onClearCompleted={handleClearCompletedTasks}
          onUpdateTaskStatus={handleUpdateTaskStatus}
          tasks={state.agentTasks}
        />
      ) : (
        <MemoryPanel
          activeCharacterId={state.activeCharacterId}
          activeConversationId={conversation.id}
          activeView={managementView}
          characters={state.characters}
          cloudBackups={cloudBackups}
          cloudBusy={cloudBusy}
          cloudMeta={cloudMeta}
          cloudStatus={cloudStatus}
          cloudSyncConfigured={cloudSyncConfigured}
          cloudToken={cloudToken}
          localBackups={localBackups}
          memories={state.memories}
          memoryEmbeddings={state.memoryEmbeddings}
          memoryConflicts={memoryConflicts}
          memoryEvents={memoryEvents}
          memoryUsageLogs={state.memoryUsageLogs}
          modelProfileBusy={modelProfileBusy}
          modelProfileStatus={modelProfileStatus}
          modelProfiles={modelProfiles}
          onAddMemory={handleAddMemory}
          onConnectCloud={handleConnectCloud}
          onCreateCloudBackup={handleCreateCloudBackup}
          onCreateLocalBackup={handleCreateLocalBackup}
          onDeleteLocalBackup={handleDeleteLocalBackup}
          onDeleteModelProfile={handleDeleteModelProfile}
          onDeleteTrashedMemory={handleDeleteTrashedMemory}
          onDeleteTrashedWorldNode={handleDeleteTrashedWorldNode}
          onDownloadCloudBackup={handleDownloadCloudBackup}
          onEmptyTrash={handleEmptyTrash}
          onExport={handleExport}
          onFetchModelCatalog={handleFetchModelCatalog}
          onImport={handleImport}
          onOrganizeMemories={handleOrganizeMemories}
          onPullCloud={handlePullCloud}
          onPushCloud={handlePushCloud}
          onRefreshCloud={handleRefreshCloud}
          onRefreshCloudBackups={handleRefreshCloudBackups}
          onReset={handleReset}
          onRestoreLocalBackup={handleRestoreLocalBackup}
          onRestoreMemory={handleRestoreMemory}
          onRestoreMemoryRevision={handleRestoreMemoryRevision}
          onRestoreWorldNode={handleRestoreWorldNode}
          onSaveModelProfile={handleSaveModelProfile}
          onSaveCloudToken={handleSaveCloudToken}
          onTestModelProfile={handleTestModelProfile}
          onTrashMemory={handleTrashMemory}
          onTrashWorldNode={handleTrashWorldNode}
          onUpdateMemory={handleUpdateMemory}
          onUpdateSettings={handleUpdateSettings}
          onUpdateWorldNode={handleUpdateWorldNode}
          settings={state.settings}
          trash={state.trash}
          worldNodes={state.worldNodes}
        />
      )}

      {showMobileBottomNav && <MobileNav activeView={activeView} onViewChange={handleViewChange} />}
      {notice && <div className="status-pill">{notice}</div>}
      {shellTip && <div className="shell-toast" role="status">{shellTip}</div>}
    </div>
  )
}

export default App
