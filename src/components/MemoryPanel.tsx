import {
  BookOpen,
  Sparkles,
} from 'lucide-react'
import { useState } from 'react'
import type {
  AppSettings,
  AppTrash,
  CharacterCard,
  LocalBackupSummary,
  LongTermMemory,
  MemoryEmbeddingRecord,
  MemoryConflict,
  MemoryEvent,
  MemoryUsageLog,
  ModelProfileInput,
  ModelProfileSummary,
  WorldNode,
} from '../domain/types'
import type { CloudBackupSummary, CloudMetadata } from '../services/cloudSync'
import type { ModelCatalogResult } from '../services/modelProfiles'
import type { MemoryDraft, WorldDraft } from './memory/memoryPanelTypes'
import { ErrorBoundary } from './ErrorBoundary'
import { MemoryGuardianPanel } from './memory/MemoryGuardianPanel'
import { WorkspaceTitle } from './memory/atoms'
import { MemoryList } from './memory/MemoryList'
import { MemoryArchiveModal } from './memory/sections/MemoryArchiveModal'
import { MemoryCandidateReview } from './memory/sections/MemoryCandidateReview'
import { MemoryDiagnostics } from './memory/sections/MemoryDiagnostics'
import { MemoryGardenInsight } from './memory/sections/MemoryGardenInsight'
import { MemoryRecallMap } from './memory/sections/MemoryRecallMap'
import { MemorySpaceOverview } from './memory/sections/MemorySpaceOverview'
import { ModelAndDataPanel } from './model/ModelAndDataPanel'
import { SettingsPanel } from './settings/SettingsPanel'
import { TrashGardenPanel } from './trash/TrashGardenPanel'
import { WorldTreePanel } from './world/WorldTreePanel'
import {
  clamp,
  draftToScope,
  scopeToDraft,
  splitList,
} from './memory/memoryPanelUtils'
import type { AppView } from './CharacterRail'
interface MemoryPanelProps {
  memories: LongTermMemory[]
  memoryEmbeddings: MemoryEmbeddingRecord[]
  memoryConflicts: MemoryConflict[]
  memoryEvents: MemoryEvent[]
  memoryUsageLogs: MemoryUsageLog[]
  worldNodes: WorldNode[]
  characters: CharacterCard[]
  activeCharacterId: string
  activeConversationId: string
  trash: AppTrash
  settings: AppSettings
  activeView: Exclude<AppView, 'chat' | 'role' | 'group' | 'moments' | 'tasks'>
  onAddMemory: () => void
  onOrganizeMemories: () => void
  onUpdateMemory: (memory: LongTermMemory) => void
  onRestoreMemoryRevision: (memoryId: string, revisionId: string) => void
  onTrashMemory: (memoryId: string) => void
  onUpdateWorldNode: (node: WorldNode) => void
  onTrashWorldNode: (nodeId: string) => void
  onRestoreConversation: (conversationId: string) => void
  onRestoreMemory: (memoryId: string) => void
  onRestoreWorldNode: (nodeId: string) => void
  onDeleteTrashedConversation: (conversationId: string) => void
  onDeleteTrashedMemory: (memoryId: string) => void
  onDeleteTrashedWorldNode: (nodeId: string) => void
  onEmptyTrash: () => void
  onUpdateSettings: (settings: AppSettings) => void
  onExport: () => void
  onImport: (file: File) => void
  onReset: () => void
  modelProfiles: ModelProfileSummary[]
  modelProfileStatus: string
  modelProfileBusy: boolean
  onSaveModelProfile: (profile: ModelProfileInput) => Promise<void>
  onDeleteModelProfile: (profileId: string) => Promise<void>
  onFetchModelCatalog: (input: { profileId?: string; profile?: ModelProfileInput }) => Promise<ModelCatalogResult>
  onTestModelProfile: (input: { profileId?: string; profile?: ModelProfileInput }) => Promise<void>
  cloudStatus: string
  cloudMeta: CloudMetadata | null
  cloudBusy: 'checking' | 'pulling' | 'pushing' | 'backing-up' | null
  cloudBackups: CloudBackupSummary[]
  cloudSyncConfigured: boolean
  cloudToken: string
  usesAccountSession?: boolean
  onConnectCloud: () => void
  onPullCloud: () => void
  onPushCloud: () => void
  onRefreshCloud: () => void
  onCreateCloudBackup: () => void
  onDownloadCloudBackup: (fileName: string) => void
  onRefreshCloudBackups: () => void
  localBackups: LocalBackupSummary[]
  onCreateLocalBackup: () => void
  onRestoreLocalBackup: (backupId: string) => void
  onDeleteLocalBackup: (backupId: string) => void
}
export function MemoryPanel({
  memories,
  memoryEmbeddings,
  memoryConflicts,
  memoryEvents,
  memoryUsageLogs,
  worldNodes,
  characters,
  activeCharacterId,
  activeConversationId,
  trash,
  settings,
  activeView,
  onAddMemory,
  onOrganizeMemories,
  onUpdateMemory,
  onRestoreMemoryRevision,
  onTrashMemory,
  onUpdateWorldNode,
  onTrashWorldNode,
  onRestoreConversation,
  onRestoreMemory,
  onRestoreWorldNode,
  onDeleteTrashedConversation,
  onDeleteTrashedMemory,
  onDeleteTrashedWorldNode,
  onEmptyTrash,
  onUpdateSettings,
  onExport,
  onImport,
  onReset,
  modelProfiles,
  modelProfileStatus,
  modelProfileBusy,
  onSaveModelProfile,
  onDeleteModelProfile,
  onFetchModelCatalog,
  onTestModelProfile,
  cloudStatus,
  cloudMeta,
  cloudBusy,
  cloudBackups,
  cloudSyncConfigured,
  cloudToken,
  usesAccountSession = false,
  onConnectCloud,
  onPullCloud,
  onPushCloud,
  onRefreshCloud,
  onCreateCloudBackup,
  onDownloadCloudBackup,
  onRefreshCloudBackups,
  localBackups,
  onCreateLocalBackup,
  onRestoreLocalBackup,
  onDeleteLocalBackup,
}: MemoryPanelProps) {
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null)
  const [memoryDraft, setMemoryDraft] = useState<MemoryDraft | null>(null)
  const [editingWorldId, setEditingWorldId] = useState<string | null>(null)
  const [worldDraft, setWorldDraft] = useState<WorldDraft | null>(null)
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null)
  function startMemoryEdit(memory: LongTermMemory) {
    const scopeDraft = scopeToDraft(memory.scope)
    setEditingMemoryId(memory.id)
    setMemoryDraft({
      title: memory.title,
      body: memory.body,
      tags: memory.tags.join('，'),
      priority: memory.priority,
      pinned: memory.pinned,
      kind: memory.kind,
      layer: memory.layer,
      confidence: memory.confidence,
      status: memory.status,
      sensitivity: memory.sensitivity,
      mentionPolicy: memory.mentionPolicy,
      cooldownUntil: memory.cooldownUntil ?? '',
      ...scopeDraft,
    })
  }
  function saveMemoryEdit(memory: LongTermMemory) {
    if (!memoryDraft) return
    onUpdateMemory({
      ...memory,
      title: memoryDraft.title.trim() || '未命名记忆',
      body: memoryDraft.body.trim(),
      tags: splitList(memoryDraft.tags),
      priority: clamp(memoryDraft.priority, 1, 5),
      pinned: memoryDraft.pinned,
      kind: memoryDraft.kind,
      layer: memoryDraft.layer,
      confidence: clamp(memoryDraft.confidence, 0.1, 1),
      status: memoryDraft.status,
      sensitivity: memoryDraft.sensitivity,
      mentionPolicy: memoryDraft.mentionPolicy,
      cooldownUntil: memoryDraft.cooldownUntil || undefined,
      scope: draftToScope(memoryDraft, activeCharacterId, activeConversationId),
    })
    setEditingMemoryId(null)
    setMemoryDraft(null)
  }
  function startWorldEdit(node: WorldNode) {
    setEditingWorldId(node.id)
    setWorldDraft({
      title: node.title,
      keywords: node.keywords.join('，'),
      content: node.content,
      priority: node.priority,
      enabled: node.enabled,
    })
  }
  function saveWorldEdit(node: WorldNode) {
    if (!worldDraft) return
    onUpdateWorldNode({
      ...node,
      title: worldDraft.title.trim() || '未命名节点',
      keywords: splitList(worldDraft.keywords),
      content: worldDraft.content.trim(),
      priority: clamp(worldDraft.priority, 1, 5),
      enabled: worldDraft.enabled,
    })
    setEditingWorldId(null)
    setWorldDraft(null)
  }
  function cancelEdit() {
    setEditingMemoryId(null)
    setMemoryDraft(null)
    setEditingWorldId(null)
    setWorldDraft(null)
  }
  const candidateMemories = memories.filter((memory) => memory.status === 'candidate')
  const reviewedMemories = memories.filter((memory) => memory.status !== 'candidate')
  const selectedMemory = selectedMemoryId ? memories.find((memory) => memory.id === selectedMemoryId) : null
  return (
    <main className="workspace detail-workspace">
      {activeView === 'memory' && (
        <>
          <WorkspaceTitle
            description="整理妹妹和角色之间会长期用到的信息，写错了就直接改。"
            icon={<BookOpen size={20} />}
            title="花园记忆"
          />
          <div className="detail-actions">
            <button className="secondary-action" onClick={onAddMemory} type="button">
              从聊天提取记忆
            </button>
            <button className="quiet-action" onClick={onOrganizeMemories} type="button">
              <Sparkles size={16} />
              合并重复记忆
            </button>
          </div>
          <MemoryCandidateReview
            candidates={candidateMemories}
            characters={characters}
            onArchive={(memory) =>
              onUpdateMemory({
                ...memory,
                status: 'archived',
                userEdited: true,
              })
            }
            onConfirm={(memory) =>
              onUpdateMemory({
                ...memory,
                status: 'active',
                confidence: Math.max(memory.confidence, 0.9),
                userEdited: true,
              })
            }
            onEdit={startMemoryEdit}
            onOpen={(memory) => setSelectedMemoryId(memory.id)}
            onTrash={(memory) => onTrashMemory(memory.id)}
          />
          <MemoryList
            activeCharacterId={activeCharacterId}
            activeConversationId={activeConversationId}
            characters={characters}
            editingMemoryId={editingMemoryId}
            memories={memories}
            memoryDraft={memoryDraft}
            onCancelEdit={cancelEdit}
            onDraftChange={setMemoryDraft}
            onOpenMemory={setSelectedMemoryId}
            onRestoreMemoryRevision={onRestoreMemoryRevision}
            onSaveMemory={saveMemoryEdit}
            onStartMemoryEdit={startMemoryEdit}
            onTrashMemory={onTrashMemory}
            onUpdateMemory={onUpdateMemory}
            reviewedMemories={reviewedMemories}
            worldNodes={worldNodes}
          />
          <MemoryGardenInsight memories={memories} />
          <MemorySpaceOverview
            activeCharacterId={activeCharacterId}
            characters={characters}
            memories={memories}
          />
          <MemoryRecallMap memoryEmbeddings={memoryEmbeddings} memories={memories} usageLogs={memoryUsageLogs} />
          <ErrorBoundary
            fallbackTitle="记忆守护台暂时罢工啦"
            fallbackHint="花园其他地方都还在哟。点一下再试一次，或者刷新整个页面就能恢复。"
          >
            <MemoryGuardianPanel
              activeCharacterId={activeCharacterId}
              characters={characters}
              conflicts={memoryConflicts}
              memoryEvents={memoryEvents}
              memories={memories}
              onEditMemory={startMemoryEdit}
              onOpenMemory={(memory) => setSelectedMemoryId(memory.id)}
              onUpdateMemory={onUpdateMemory}
              trash={trash}
              usageLogs={memoryUsageLogs}
            />
          </ErrorBoundary>
          <MemoryDiagnostics
            activeCharacterId={activeCharacterId}
            conflicts={memoryConflicts}
            memories={memories}
            onUpdateMemory={onUpdateMemory}
            usageLogs={memoryUsageLogs}
          />
          {selectedMemory && (
            <MemoryArchiveModal
              memory={selectedMemory}
              characters={characters}
              onClose={() => setSelectedMemoryId(null)}
              onEdit={(memory) => {
                setSelectedMemoryId(null)
                startMemoryEdit(memory)
              }}
              onRestoreRevision={onRestoreMemoryRevision}
              onTrash={(memory) => {
                setSelectedMemoryId(null)
                onTrashMemory(memory.id)
              }}
              usageLogs={memoryUsageLogs}
            />
          )}
        </>
      )}
      {activeView === 'world' && (
        <WorldTreePanel
          editingWorldId={editingWorldId}
          onCancelEdit={cancelEdit}
          onDraftChange={setWorldDraft}
          onSaveWorld={saveWorldEdit}
          onStartWorldEdit={startWorldEdit}
          onTrashWorldNode={onTrashWorldNode}
          worldDraft={worldDraft}
          worldNodes={worldNodes}
        />
      )}
      {activeView === 'trash' && (
        <TrashGardenPanel
          onDeleteTrashedConversation={onDeleteTrashedConversation}
          onDeleteTrashedMemory={onDeleteTrashedMemory}
          onDeleteTrashedWorldNode={onDeleteTrashedWorldNode}
          onEmptyTrash={onEmptyTrash}
          onRestoreConversation={onRestoreConversation}
          onRestoreMemory={onRestoreMemory}
          onRestoreWorldNode={onRestoreWorldNode}
          trash={trash}
        />
      )}
      {activeView === 'model' && (
        <ModelAndDataPanel
          cloudSyncConfigured={cloudSyncConfigured}
          cloudToken={cloudToken}
          usesAccountSession={usesAccountSession}
          cloudStatus={cloudStatus}
          modelProfileBusy={modelProfileBusy}
          modelProfileStatus={modelProfileStatus}
          modelProfiles={modelProfiles}
          onDeleteModelProfile={onDeleteModelProfile}
          onFetchModelCatalog={onFetchModelCatalog}
          onSaveModelProfile={onSaveModelProfile}
          onTestModelProfile={onTestModelProfile}
          onUpdateSettings={onUpdateSettings}
          settings={settings}
        />
      )}
      {activeView === 'settings' && (
        <SettingsPanel
          cloudBackups={cloudBackups}
          cloudBusy={cloudBusy}
          cloudMeta={cloudMeta}
          cloudStatus={cloudStatus}
          cloudSyncConfigured={cloudSyncConfigured}
          localBackups={localBackups}
          onConnectCloud={onConnectCloud}
          onCreateCloudBackup={onCreateCloudBackup}
          onCreateLocalBackup={onCreateLocalBackup}
          onDeleteLocalBackup={onDeleteLocalBackup}
          onDownloadCloudBackup={onDownloadCloudBackup}
          onExport={onExport}
          onImport={onImport}
          onPullCloud={onPullCloud}
          onPushCloud={onPushCloud}
          onRefreshCloud={onRefreshCloud}
          onRefreshCloudBackups={onRefreshCloudBackups}
          onReset={onReset}
          onRestoreLocalBackup={onRestoreLocalBackup}
          onUpdateSettings={onUpdateSettings}
          settings={settings}
        />
      )}
    </main>
  )
}
