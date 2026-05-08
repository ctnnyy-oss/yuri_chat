import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { MessageCircle, Plus, Save, Search, Trash2, UserRound, X } from 'lucide-react'
import type { CharacterCard } from '../domain/types'
import { analyzePersonaImport } from '../services/personaImport'
import type { AppView } from './CharacterRail'
import { MobileConfirmDialog } from './MobileConfirmDialog'

interface QqFeaturePanelProps {
  activeView: AppView
  characters: CharacterCard[]
  activeCharacterId: string
  onCreateCharacter: (input: { name: string; relation: string; mood: string; persona: string }) => string
  onDeleteCharacter: (characterId: string) => boolean
  onUpdateCharacter: (input: { id: string; name: string; relation: string; mood: string; persona: string }) => boolean
  onOpenChat: (characterId: string) => void
  onShellAction?: (message: string) => void
}

type ManagedRole = {
  id: string
  name: string
  avatar: string
  accent: string
  relation: string
  mood: string
  persona: string
  source: '内置' | '自定义'
}

type RoleDraft = {
  name: string
  relation: string
  mood: string
  persona: string
}

type MobileEditorMode = 'closed' | 'create' | 'view'

const LONG_PRESS_MS = 560
const MOBILE_VIEWPORT_QUERY = '(max-width: 760px)'

function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_VIEWPORT_QUERY).matches,
  )
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mediaQuery = window.matchMedia(MOBILE_VIEWPORT_QUERY)
    const handler = (event: MediaQueryListEvent) => setIsMobile(event.matches)
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])
  return isMobile
}

function MobileStatusBar() {
  return null
}

function isCustomRole(character: CharacterCard) {
  return character.id.startsWith('character_') || character.tags.includes('自定义角色')
}

function isGroupCharacter(character: CharacterCard) {
  return character.relationship === '群聊'
}

function toManagedRole(character: CharacterCard): ManagedRole {
  return {
    id: character.id,
    name: character.name,
    avatar: character.avatar,
    accent: character.accent,
    relation: character.relationship,
    mood: character.mood,
    persona: character.personaSource ?? character.systemPrompt,
    source: isCustomRole(character) ? '自定义' : '内置',
  }
}

function toRoleDraft(role?: ManagedRole): RoleDraft {
  return {
    name: role?.name ?? '',
    relation: role?.relation ?? '角色',
    mood: role?.mood ?? '',
    persona: role?.persona ?? '',
  }
}

function blankRoleDraft(): RoleDraft {
  return { name: '', relation: '角色', mood: '', persona: '' }
}

function roleMatchesQuery(role: ManagedRole, query: string) {
  if (!query) return true
  return [role.name, role.relation, role.mood].join(' ').toLowerCase().includes(query)
}

export function QqFeaturePanel({
  characters,
  activeCharacterId,
  onCreateCharacter,
  onDeleteCharacter,
  onUpdateCharacter,
  onOpenChat,
  onShellAction,
}: QqFeaturePanelProps) {
  const isMobile = useIsMobileViewport()
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
  const selectedRole = managedRoles.find((role) => role.id === selectedRoleId) ?? managedRoles[0]
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

  function updateDraft(field: keyof RoleDraft, value: string) {
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
    if (onUpdateCharacter({ id: selectedRole.id, ...roleDraft })) {
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
  const personaQuality = (
    <div className="persona-import-meter" aria-label="人设导入质量">
      <div>
        <strong>人设导入质量</strong>
        <span>{personaAnalysis.score}%</span>
      </div>
      <p>系统会把自然语言整理成身份、关系、经历、说话方式、情绪模式、边界和互动规则，再和长期记忆一起使用。</p>
      {personaAnalysis.strengths.length > 0 && (
        <small>已覆盖：{personaAnalysis.strengths.join(' / ')}</small>
      )}
      {personaAnalysis.missing.length > 0 && (
        <small>可补：{personaAnalysis.missing.slice(0, 2).join('；')}</small>
      )}
    </div>
  )

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
          <div>
            <button onClick={startCreateRole} type="button">
              <Plus size={18} />
              新增角色
            </button>
            {selectedRole && (
              <button onClick={() => onOpenChat(selectedRole.id)} type="button">
                <UserRound size={18} />
                打开聊天
              </button>
            )}
          </div>
        </header>
        <div className="role-manager-grid">
          <aside className="role-list" aria-label="角色列表">
            {managedRoles.map((role) => (
              <button
                className={role.id === selectedRole?.id ? 'active' : ''}
                key={role.id}
                onClick={() => selectRole(role)}
                type="button"
              >
                <span className="avatar" style={{ '--avatar-accent': role.accent } as CSSProperties}>{role.avatar}</span>
                <span>
                  <strong>{role.name}</strong>
                  <small>{role.mood}</small>
                </span>
                <em>{role.source}</em>
              </button>
            ))}
          </aside>
          <section className="role-detail" aria-label="角色详情">
            <div className="role-detail-head">
              <span className="avatar" style={{ '--avatar-accent': selectedRole?.accent ?? '#ef9ac6' } as CSSProperties}>
                {selectedRole?.avatar ?? '角'}
              </span>
              <div>
                <strong>{selectedRole?.name ?? '新角色'}</strong>
                <small>{selectedRole?.source === '内置' ? '只读参考' : '可以编辑'}</small>
              </div>
            </div>
            <p>{selectedRole?.persona ?? '点新增角色后填写人设。'}</p>
            <div className="role-editor-fields">
              <label>
                名称
                <input
                  disabled={!editorEditable}
                  value={roleDraft.name}
                  onChange={(event) => updateDraft('name', event.target.value)}
                  placeholder="比如：姐姐 / 恋人 / 原创角色"
                />
              </label>
              <label>
                关系
                <input
                  disabled={!editorEditable}
                  value={roleDraft.relation}
                  onChange={(event) => updateDraft('relation', event.target.value)}
                  placeholder="姐姐、恋人、朋友、角色"
                />
              </label>
              <label>
                氛围
                <input
                  disabled={!editorEditable}
                  value={roleDraft.mood}
                  onChange={(event) => updateDraft('mood', event.target.value)}
                  placeholder="温柔、傲娇、绿茶、忠犬..."
                />
              </label>
              <label>
                人设导入
                <textarea
                  disabled={!editorEditable}
                  value={roleDraft.persona}
                  onChange={(event) => updateDraft('persona', event.target.value)}
                  placeholder="可以直接粘贴自然语言。越包含经历、说话方式、情绪模式、边界和相处规则，越像真人。"
                />
              </label>
              {personaQuality}
            </div>
            <div className="role-template-list role-action-list">
              {mobileEditorMode === 'create' ? (
                <button onClick={addRoleFromDraft} type="button">
                  <Plus size={17} />
                  <span>创建角色</span>
                </button>
              ) : (
                selectedRole && (
                  <button onClick={() => onOpenChat(selectedRole.id)} type="button">
                    <MessageCircle size={17} />
                    <span>打开聊天</span>
                  </button>
                )
              )}
              {canEditSelectedRole && (
                <>
                  <button onClick={saveSelectedRole} type="button">
                    <Save size={17} />
                    <span>保存角色</span>
                  </button>
                  <button className="danger-role-action" onClick={deleteSelectedRole} type="button">
                    <Trash2 size={17} />
                    <span>删除角色</span>
                  </button>
                </>
              )}
            </div>
          </section>
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
                <label>
                  人设导入
                  <textarea
                    disabled={!editorEditable}
                    onChange={(event) => updateDraft('persona', event.target.value)}
                    placeholder="粘贴角色资料、聊天样例、经历、说话方式、边界"
                    value={roleDraft.persona}
                  />
                </label>
                {personaQuality}
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
