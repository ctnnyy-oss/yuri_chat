import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { MessageCircle, Plus, Search, Wand2, X } from 'lucide-react'
import type { CharacterCard, CharacterVoiceProfile } from '../domain/types'
import { analyzePersonaImport } from '../services/personaImport'
import type { AppView } from './CharacterRail'
import { MobileConfirmDialog } from './MobileConfirmDialog'
import { DesktopRoleEditor } from './role/DesktopRoleEditor'
import { RolePersonaMeter } from './role/RolePersonaMeter'
import {
  LONG_PRESS_MS,
  applyPersonaImportTemplate,
  blankRoleDraft,
  buildVoiceProfileFromDraft,
  isGroupCharacter,
  roleMatchesQuery,
  toManagedRole,
  toRoleDraft,
  useIsMobileViewport,
  type ManagedRole,
  type MobileEditorMode,
  type RoleDraft,
} from './role/rolePanelModel'

interface QqFeaturePanelProps {
  activeView: AppView
  characters: CharacterCard[]
  activeCharacterId: string
  createRequestId: number
  onCreateCharacter: (input: { name: string; relation: string; mood: string; persona: string; voiceProfile?: CharacterVoiceProfile }) => string
  onDeleteCharacter: (characterId: string) => boolean
  onUpdateCharacter: (input: { id: string; name: string; relation: string; mood: string; persona: string; voiceProfile?: CharacterVoiceProfile }) => boolean
  onOpenChat: (characterId: string) => void
  onShellAction?: (message: string) => void
}

function MobileStatusBar() {
  return null
}

export function QqFeaturePanel({
  characters,
  activeCharacterId,
  createRequestId,
  onCreateCharacter,
  onDeleteCharacter,
  onUpdateCharacter,
  onOpenChat,
  onShellAction,
}: QqFeaturePanelProps) {
  const isMobile = useIsMobileViewport()
  const lastCreateRequestRef = useRef(createRequestId)
  const roleLongPressTimerRef = useRef<number | null>(null)
  const roleLongPressTriggeredRef = useRef(false)
  const roleLongPressStartPointRef = useRef({ x: 0, y: 0 })
  const managedRoles = useMemo(
    () => characters.filter((character) => !isGroupCharacter(character)).map(toManagedRole),
    [characters],
  )
  const initialSelectedRole = managedRoles.find((role) => role.id === activeCharacterId) ?? managedRoles[0]
  const [selectedRoleId, setSelectedRoleId] = useState(initialSelectedRole?.id ?? '')
  const [roleDraft, setRoleDraft] = useState<RoleDraft>(() => toRoleDraft(initialSelectedRole))
  const [query, setQuery] = useState('')
  const [mobileEditorMode, setMobileEditorMode] = useState<MobileEditorMode>('closed')
  const [pendingDeleteRole, setPendingDeleteRole] = useState<ManagedRole | null>(null)
  const selectedRole = selectedRoleId ? managedRoles.find((role) => role.id === selectedRoleId) : undefined
  const canEditSelectedRole = selectedRole?.source === '自定义'
  const normalizedQuery = query.trim().toLowerCase()
  const visibleRoles = useMemo(
    () => managedRoles.filter((role) => roleMatchesQuery(role, normalizedQuery)),
    [managedRoles, normalizedQuery],
  )
  const personaAnalysis = useMemo(
    () =>
      analyzePersonaImport({
        name: roleDraft.name,
        relation: roleDraft.relation,
        mood: roleDraft.mood,
        persona: roleDraft.persona,
      }),
    [roleDraft],
  )

  function selectRole(role: ManagedRole, openEditor = false) {
    setSelectedRoleId(role.id)
    setRoleDraft(toRoleDraft(role))
    if (openEditor) setMobileEditorMode('view')
  }

  function startCreateRole() {
    setSelectedRoleId('')
    setRoleDraft(blankRoleDraft())
    setMobileEditorMode('create')
  }

  useEffect(() => {
    if (createRequestId === lastCreateRequestRef.current) return
    lastCreateRequestRef.current = createRequestId
    startCreateRole()
  }, [createRequestId])

  function updateDraft<K extends keyof RoleDraft>(field: K, value: RoleDraft[K]) {
    setRoleDraft((draft) => ({ ...draft, [field]: value }))
  }

  function addRoleFromDraft() {
    const name = roleDraft.name.trim()
    if (!name) {
      onShellAction?.('先给新角色取个名字')
      return
    }
    const roleId = onCreateCharacter({
      name,
      relation: roleDraft.relation.trim() || '角色',
      mood: roleDraft.mood.trim() || '等待补全',
      persona: roleDraft.persona.trim() || '还没有导入人设。',
      voiceProfile: buildVoiceProfileFromDraft(roleDraft),
    })
    setSelectedRoleId(roleId)
    setMobileEditorMode('view')
    onShellAction?.('角色已创建，可以在角色页继续编辑或直接聊天')
  }

  function deleteSelectedRole() {
    if (!selectedRole) return
    if (!canEditSelectedRole) {
      onShellAction?.('内置三对 CP 先保留，只能查看不能删除')
      return
    }
    setPendingDeleteRole(selectedRole)
  }

  function clearRoleLongPressTimer() {
    if (roleLongPressTimerRef.current === null) return
    window.clearTimeout(roleLongPressTimerRef.current)
    roleLongPressTimerRef.current = null
  }

  function startRoleLongPress(event: ReactPointerEvent, callback: () => void) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    roleLongPressTriggeredRef.current = false
    clearRoleLongPressTimer()
    roleLongPressStartPointRef.current = { x: event.clientX, y: event.clientY }
    roleLongPressTimerRef.current = window.setTimeout(() => {
      roleLongPressTimerRef.current = null
      roleLongPressTriggeredRef.current = true
      callback()
    }, LONG_PRESS_MS)
  }

  function moveRoleLongPress(event: ReactPointerEvent) {
    if (roleLongPressTimerRef.current === null) return
    const dx = Math.abs(event.clientX - roleLongPressStartPointRef.current.x)
    const dy = Math.abs(event.clientY - roleLongPressStartPointRef.current.y)
    if (dx > 12 || dy > 12) clearRoleLongPressTimer()
  }

  function finishRoleLongPress() {
    clearRoleLongPressTimer()
  }

  function shouldIgnoreRoleClickAfterLongPress() {
    if (!roleLongPressTriggeredRef.current) return false
    roleLongPressTriggeredRef.current = false
    return true
  }

  function openRoleAfterPress(role: ManagedRole) {
    if (shouldIgnoreRoleClickAfterLongPress()) return
    selectRole(role, true)
  }

  function requestDeleteRoleFromList(role: ManagedRole) {
    if (role.source !== '自定义') {
      onShellAction?.('内置角色不能删除；长按自定义角色可以删除')
      return
    }
    setPendingDeleteRole(role)
  }

  function confirmDeleteRole() {
    if (!pendingDeleteRole) return
    const role = pendingDeleteRole
    const nextRole = managedRoles.find((item) => item.id !== role.id)
    if (onDeleteCharacter(role.id)) {
      if (nextRole) selectRole(nextRole)
      if (selectedRoleId === role.id) setMobileEditorMode('closed')
      onShellAction?.('角色和对应聊天记录已删除')
    }
    setPendingDeleteRole(null)
  }

  function saveSelectedRole() {
    if (!selectedRole) return
    if (!canEditSelectedRole) {
      onShellAction?.('内置三对 CP 是只读参考模板，不能直接修改')
      return
    }
    if (onUpdateCharacter({
      id: selectedRole.id,
      name: roleDraft.name,
      relation: roleDraft.relation,
      mood: roleDraft.mood,
      persona: roleDraft.persona,
      voiceProfile: buildVoiceProfileFromDraft(roleDraft),
    })) {
      onShellAction?.('角色设定已保存')
    }
  }

  const editorTitle =
    mobileEditorMode === 'create'
      ? '新角色'
      : selectedRole?.source === '内置'
        ? '内置角色'
        : '编辑角色'
  const editorEditable = mobileEditorMode === 'create' || canEditSelectedRole
  return (
    <main className="workspace qq-feature-workspace">
      <section
        className="qq-desktop-feature role-desktop-feature"
        aria-label="角色管理"
        aria-hidden={isMobile || undefined}
        inert={isMobile || undefined}
      >
        <header className="qq-desktop-feature-head">
          <strong>角色管理</strong>
          {selectedRole && (
            <button onClick={() => onOpenChat(selectedRole.id)} type="button">
              <MessageCircle size={18} />
              打开聊天
            </button>
          )}
        </header>
        <div className="role-manager-grid">
          <DesktopRoleEditor
            canEditSelectedRole={canEditSelectedRole}
            editorEditable={editorEditable}
            mobileEditorMode={mobileEditorMode}
            personaAnalysis={personaAnalysis}
            roleDraft={roleDraft}
            selectedRole={selectedRole}
            onAddRole={addRoleFromDraft}
            onDeleteRole={deleteSelectedRole}
            onSaveRole={saveSelectedRole}
            onUpdateDraft={updateDraft}
          />
        </div>
      </section>

      <section
        className="mobile-feature-page mobile-contact-page role-mobile-page"
        aria-label="角色"
        aria-hidden={!isMobile || undefined}
        inert={!isMobile || undefined}
      >
        <MobileStatusBar />
        <header className="mobile-feature-header">
          <span className="avatar" style={{ '--avatar-accent': selectedRole?.accent ?? '#ef9ac6' } as CSSProperties}>
            {selectedRole?.avatar ?? '角'}
          </span>
          <strong>角色</strong>
          <button aria-label="添加角色" onClick={startCreateRole} type="button">
            <Plus size={34} />
          </button>
        </header>
        <label className="mobile-feature-search">
          <Search size={28} />
          <input
            aria-label="搜索角色"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索角色"
            value={query}
          />
        </label>
        <div className="mobile-contact-list role-mobile-list">
          {visibleRoles.map((role) => (
            <button
              key={role.id}
              onClick={() => openRoleAfterPress(role)}
              onContextMenu={(event) => {
                event.preventDefault()
              }}
              onPointerCancel={finishRoleLongPress}
              onPointerDown={(event) => startRoleLongPress(event, () => requestDeleteRoleFromList(role))}
              onPointerLeave={finishRoleLongPress}
              onPointerMove={moveRoleLongPress}
              onPointerUp={finishRoleLongPress}
              type="button"
            >
              <span className="avatar" style={{ '--avatar-accent': role.accent } as CSSProperties}>{role.avatar}</span>
              <span>
                <strong>{role.name}</strong>
                <small>{role.mood}</small>
              </span>
            </button>
          ))}
          {visibleRoles.length === 0 && <div className="mobile-empty-hint">没有找到对应角色</div>}
        </div>

        {mobileEditorMode !== 'closed' && (
          <div className="mobile-role-sheet-backdrop" role="presentation">
            <section className="mobile-role-sheet" aria-label={editorTitle}>
              <header>
                <button aria-label="关闭" onClick={() => setMobileEditorMode('closed')} type="button">
                  <X size={24} />
                </button>
                <strong>{editorTitle}</strong>
                {mobileEditorMode === 'create' ? (
                  <button aria-label="创建角色" onClick={addRoleFromDraft} type="button">
                    <Plus size={24} />
                  </button>
                ) : (
                  <button aria-label="打开聊天" onClick={() => selectedRole && onOpenChat(selectedRole.id)} type="button">
                    <MessageCircle size={23} />
                  </button>
                )}
              </header>
              {selectedRole && mobileEditorMode === 'view' && (
                <div className="mobile-role-hero">
                  <span className="avatar" style={{ '--avatar-accent': selectedRole.accent } as CSSProperties}>
                    {selectedRole.avatar}
                  </span>
                  <span>
                    <strong>{selectedRole.name}</strong>
                    <small>{selectedRole.source === '内置' ? '内置只读，可作为建卡参考' : '自定义角色，可编辑'}</small>
                  </span>
                </div>
              )}
              <div className="mobile-role-fields">
                <label>
                  名称
                  <input
                    disabled={!editorEditable}
                    onChange={(event) => updateDraft('name', event.target.value)}
                    placeholder="新角色名称"
                    value={roleDraft.name}
                  />
                </label>
                <label>
                  关系
                  <input
                    disabled={!editorEditable}
                    onChange={(event) => updateDraft('relation', event.target.value)}
                    placeholder="姐姐 / 恋人 / 原创角色"
                    value={roleDraft.relation}
                  />
                </label>
                <label>
                  氛围
                  <input
                    disabled={!editorEditable}
                    onChange={(event) => updateDraft('mood', event.target.value)}
                    placeholder="温柔、可靠、有主见"
                    value={roleDraft.mood}
                  />
                </label>
                <div className="persona-import-field">
                  <span className="persona-field-head">
                    人设导入
                    <button
                      aria-label="套用人设结构模板"
                      disabled={!editorEditable}
                      onClick={() => updateDraft('persona', applyPersonaImportTemplate(roleDraft))}
                      type="button"
                    >
                      <Wand2 size={15} />
                      <span>套用结构</span>
                    </button>
                  </span>
                  <textarea
                    aria-label="人设导入"
                    disabled={!editorEditable}
                    onChange={(event) => updateDraft('persona', event.target.value)}
                    placeholder="粘贴角色资料、聊天样例、经历、说话方式、边界"
                    value={roleDraft.persona}
                  />
                </div>
                <label>
                  音色名
                  <input
                    disabled={!editorEditable}
                    onChange={(event) => updateDraft('voiceDisplayName', event.target.value)}
                    placeholder="自定义音色名称"
                    value={roleDraft.voiceDisplayName}
                  />
                </label>
                <label>
                  音色 ID
                  <input
                    disabled={!editorEditable}
                    onChange={(event) => updateDraft('voiceId', event.target.value)}
                    placeholder="供应商 voice_id"
                    value={roleDraft.voiceId}
                  />
                </label>
                <label>
                  声音风格
                  <textarea
                    disabled={!editorEditable}
                    onChange={(event) => updateDraft('voicePrompt', event.target.value)}
                    placeholder="轻声、自然、清晰、像真实聊天"
                    value={roleDraft.voicePrompt}
                  />
                </label>
                <label className="voice-consent-row">
                  <span>
                    已确认授权
                    <small>只用本人或明确授权音色。</small>
                  </span>
                  <input
                    checked={roleDraft.voiceConsentConfirmed}
                    disabled={!editorEditable}
                    onChange={(event) => updateDraft('voiceConsentConfirmed', event.target.checked)}
                    type="checkbox"
                  />
                </label>
                <RolePersonaMeter analysis={personaAnalysis} />
              </div>
              <footer>
                {mobileEditorMode === 'create' && (
                  <button className="primary-mobile-role-action" onClick={addRoleFromDraft} type="button">
                    创建角色
                  </button>
                )}
                {canEditSelectedRole && mobileEditorMode === 'view' && (
                  <>
                    <button className="primary-mobile-role-action" onClick={saveSelectedRole} type="button">
                      保存修改
                    </button>
                    <button className="danger-mobile-role-action" onClick={deleteSelectedRole} type="button">
                      删除角色
                    </button>
                  </>
                )}
                {!editorEditable && <span>内置角色不能修改，但可以照着这里的设定创建新角色。</span>}
              </footer>
            </section>
          </div>
        )}
      </section>
      {pendingDeleteRole && (
        <MobileConfirmDialog
          danger
          title="删除角色"
          message={`会删除「${pendingDeleteRole.name}」这个角色，并一起清掉她的聊天记录。这个操作不能从聊天列表恢复。`}
          confirmLabel="删除角色"
          onCancel={() => setPendingDeleteRole(null)}
          onConfirm={confirmDeleteRole}
        />
      )}
    </main>
  )
}
