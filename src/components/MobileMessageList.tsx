import { useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { BellOff, Check, Plus, Search, Users, X } from 'lucide-react'
import type { AppSettings, CharacterCard, ConversationState } from '../domain/types'
import { MobileConfirmDialog } from './MobileConfirmDialog'

interface MobileMessageListProps {
  characters: CharacterCard[]
  conversations: ConversationState[]
  activeCharacterId: string
  settings: AppSettings
  onOpenChat: (characterId: string) => void
  onOpenGroupChat?: (group: { name: string; text: string; memberIds?: string[] }) => void
  onDeleteConversation?: (characterId: string) => void
  onDeleteGroupChat?: (characterId: string) => boolean
  onUpdateSettings: (settings: AppSettings) => void
  onShellAction?: (message: string) => void
}

const LONG_PRESS_MS = 560
const threadTimes = ['今天', '星期六', '星期一', '04/11', '04/03', '03/26', '03/22']

type PendingThreadAction = {
  character: CharacterCard
  kind: 'conversation' | 'group'
}

function MobileStatusBar() {
  return null
}

function isGroupCharacter(character: CharacterCard) {
  return character.relationship === '群聊'
}

function formatThreadTime(value?: string, fallback = '今天') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function getLastConversationText(conversation?: ConversationState, fallback = '还没有聊天记录') {
  const lastMessage = conversation?.messages.at(-1)
  if (!lastMessage?.content) return fallback
  return lastMessage.content.replace(/\s+/g, ' ').slice(0, 24)
}

function getUnreadCount(conversation?: ConversationState) {
  return Math.max(0, conversation?.unreadCount ?? 0)
}

function formatUnreadBadge(count: number) {
  if (count <= 0) return ''
  return count > 99 ? '99+' : String(count)
}

function matchesQuery(values: string[], query: string) {
  if (!query) return true
  return values.join(' ').toLowerCase().includes(query)
}

function hasVisibleConversation(conversation?: ConversationState) {
  if (!conversation) return false
  return conversation.messages.length > 0 || Boolean(conversation.summary) || (conversation.unreadCount ?? 0) > 0
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

async function resizeAvatarImage(file: File) {
  const rawDataUrl = await readFileAsDataUrl(file)
  const image = new window.Image()
  image.src = rawDataUrl
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('avatar image failed to load'))
  })

  const maxSize = 320
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return rawDataUrl
  context.drawImage(image, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', 0.82)
}

export function MobileMessageList({
  characters,
  conversations,
  activeCharacterId,
  settings,
  onOpenChat,
  onOpenGroupChat,
  onDeleteConversation,
  onDeleteGroupChat,
  onUpdateSettings,
  onShellAction,
}: MobileMessageListProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const longPressTimerRef = useRef<number | null>(null)
  const longPressTriggeredRef = useRef(false)
  const longPressStartPointRef = useRef({ x: 0, y: 0 })
  const [query, setQuery] = useState('')
  const [groupSheetOpen, setGroupSheetOpen] = useState(false)
  const [groupQuery, setGroupQuery] = useState('')
  const [groupName, setGroupName] = useState('')
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(() => new Set())
  const [pendingThreadAction, setPendingThreadAction] = useState<PendingThreadAction | null>(null)
  const activeCharacter = characters.find((character) => character.id === activeCharacterId) ?? characters[0]
  const normalizedQuery = query.trim().toLowerCase()
  const normalizedGroupQuery = groupQuery.trim().toLowerCase()
  const nickname = settings.userNickname?.trim() || '妹妹'
  const roleCharacters = useMemo(() => characters.filter((character) => !isGroupCharacter(character)), [characters])
  const groupCharacters = useMemo(() => characters.filter(isGroupCharacter), [characters])
  const conversationByCharacterId = useMemo(
    () => new Map(conversations.map((conversation) => [conversation.characterId, conversation])),
    [conversations],
  )

  const visibleGroups = useMemo(
    () =>
      groupCharacters
        .map((character) => ({
          character,
          name: character.name,
          avatar: character.avatar,
          accent: character.accent,
          text: getLastConversationText(conversationByCharacterId.get(character.id), character.mood || character.title),
          time: formatThreadTime(conversationByCharacterId.get(character.id)?.updatedAt),
          badge: formatUnreadBadge(getUnreadCount(conversationByCharacterId.get(character.id))),
          characterId: character.id,
          updatedAt: conversationByCharacterId.get(character.id)?.updatedAt ?? '',
        }))
        .filter((thread) => matchesQuery([thread.name, thread.text], normalizedQuery))
        .sort((left, right) => {
          const leftTime = left.updatedAt ? new Date(left.updatedAt).getTime() : 0
          const rightTime = right.updatedAt ? new Date(right.updatedAt).getTime() : 0
          return rightTime - leftTime
        }),
    [conversationByCharacterId, groupCharacters, normalizedQuery],
  )

  const visibleRoleCharacters = useMemo(
    () =>
      [...roleCharacters]
        .filter((character) =>
          hasVisibleConversation(conversationByCharacterId.get(character.id)) &&
          matchesQuery(
            [character.name, character.title, character.subtitle, character.relationship, character.mood],
            normalizedQuery,
          ),
        )
        .sort((left, right) => {
          const leftTime = new Date(conversationByCharacterId.get(left.id)?.updatedAt ?? '').getTime() || 0
          const rightTime = new Date(conversationByCharacterId.get(right.id)?.updatedAt ?? '').getTime() || 0
          return rightTime - leftTime
        }),
    [conversationByCharacterId, normalizedQuery, roleCharacters],
  )

  const groupCandidateCharacters = useMemo(
    () =>
      roleCharacters.filter((character) =>
        matchesQuery(
          [character.name, character.title, character.subtitle, character.relationship, character.mood],
          normalizedGroupQuery,
        ),
      ),
    [normalizedGroupQuery, roleCharacters],
  )

  function renameProfile() {
    const nextName = window.prompt('改一个昵称', nickname)?.trim()
    if (!nextName) return
    onUpdateSettings({ ...settings, userNickname: nextName })
    onShellAction?.('昵称已更新')
  }

  async function updateAvatar(file?: File) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      onShellAction?.('请选择图片作为头像')
      return
    }
    try {
      const dataUrl = await resizeAvatarImage(file)
      onUpdateSettings({ ...settings, userAvatarImage: dataUrl })
      onShellAction?.('头像已更新')
    } catch {
      onShellAction?.('头像读取失败，换一张图片试试')
    }
  }

  function toggleMember(characterId: string) {
    setSelectedMemberIds((current) => {
      const next = new Set(current)
      if (next.has(characterId)) {
        next.delete(characterId)
      } else {
        next.add(characterId)
      }
      return next
    })
  }

  function openGroupCreator() {
    setGroupQuery('')
    setGroupName('')
    setSelectedMemberIds(new Set())
    setGroupSheetOpen(true)
  }

  function createGroupFromSelection() {
    const memberIds = [...selectedMemberIds]
    if (memberIds.length === 0) {
      onShellAction?.('先从好友列表里选至少一位角色')
      return
    }
    const memberNames = roleCharacters.filter((character) => selectedMemberIds.has(character.id)).map((item) => item.name)
    const name = groupName.trim() || `${memberNames.slice(0, 3).join('、')}的小群`
    onOpenGroupChat?.({
      name,
      text: `${memberNames.join('、')}已经加入群聊`,
      memberIds,
    })
    setGroupSheetOpen(false)
  }

  function clearLongPressTimer() {
    if (longPressTimerRef.current === null) return
    window.clearTimeout(longPressTimerRef.current)
    longPressTimerRef.current = null
  }

  function startLongPress(event: ReactPointerEvent, callback: () => void) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    longPressTriggeredRef.current = false
    clearLongPressTimer()
    longPressStartPointRef.current = { x: event.clientX, y: event.clientY }
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null
      longPressTriggeredRef.current = true
      callback()
    }, LONG_PRESS_MS)
  }

  function moveLongPress(event: ReactPointerEvent) {
    if (longPressTimerRef.current === null) return
    const dx = Math.abs(event.clientX - longPressStartPointRef.current.x)
    const dy = Math.abs(event.clientY - longPressStartPointRef.current.y)
    if (dx > 12 || dy > 12) clearLongPressTimer()
  }

  function finishLongPress() {
    clearLongPressTimer()
  }

  function shouldIgnoreClickAfterLongPress() {
    if (!longPressTriggeredRef.current) return false
    longPressTriggeredRef.current = false
    return true
  }

  function openThreadAfterPress(characterId: string) {
    if (shouldIgnoreClickAfterLongPress()) return
    onOpenChat(characterId)
  }

  function requestThreadAction(character: CharacterCard) {
    if (isGroupCharacter(character)) {
      if (!onDeleteGroupChat) return
      setPendingThreadAction({ character, kind: 'group' })
      return
    }
    if (!onDeleteConversation) return
    setPendingThreadAction({ character, kind: 'conversation' })
  }

  function confirmThreadAction() {
    if (!pendingThreadAction) return
    const { character, kind } = pendingThreadAction
    if (kind === 'group') {
      if (onDeleteGroupChat?.(character.id)) {
        onShellAction?.('群聊和对应聊天记录已放入回收花园')
      }
    } else {
      onDeleteConversation?.(character.id)
      onShellAction?.('会话已放入回收花园，角色还在角色页')
    }
    setPendingThreadAction(null)
  }

  return (
    <section className="mobile-message-list" aria-label="手机消息列表">
      <MobileStatusBar />
      <header className="mobile-message-header">
        <div className="mobile-message-profile">
          <button
            aria-label="替换头像"
            className="mobile-profile-avatar-button"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <span
              className="avatar mobile-self-avatar"
              style={{ '--avatar-accent': activeCharacter?.accent ?? 'var(--pink-300)' } as CSSProperties}
            >
              {settings.userAvatarImage ? <img alt="" src={settings.userAvatarImage} /> : nickname.slice(0, 1)}
            </span>
          </button>
          <button aria-label="修改昵称" className="mobile-profile-name-button" onClick={renameProfile} type="button">
            <strong>{nickname}</strong>
          </button>
          <input
            accept="image/*"
            className="visually-hidden-file"
            onChange={(event) => {
              void updateAvatar(event.target.files?.[0])
              event.target.value = ''
            }}
            ref={fileInputRef}
            type="file"
          />
        </div>
        <button aria-label="新建群聊" className="mobile-message-plus" onClick={openGroupCreator} type="button">
          <Plus size={42} strokeWidth={1.8} />
        </button>
      </header>

      <label className="mobile-message-search">
        <Search size={28} />
        <input aria-label="搜索聊天" onChange={(event) => setQuery(event.target.value)} placeholder="搜索" value={query} />
      </label>

      <div className="mobile-message-thread-list">
        {visibleGroups.map((thread, index) => (
          <button
            className={`mobile-message-thread ${thread.characterId === activeCharacterId ? 'active' : ''}`}
            key={thread.characterId}
            onClick={() => openThreadAfterPress(thread.characterId)}
            onContextMenu={(event) => {
              event.preventDefault()
            }}
            onPointerCancel={finishLongPress}
            onPointerDown={(event) => startLongPress(event, () => requestThreadAction(thread.character))}
            onPointerLeave={finishLongPress}
            onPointerMove={moveLongPress}
            onPointerUp={finishLongPress}
            type="button"
          >
            <span
              className="avatar mobile-thread-avatar system-avatar"
              style={{ '--avatar-accent': thread.accent } as CSSProperties}
            >
              {thread.avatar}
              {thread.badge && <b>{thread.badge}</b>}
            </span>
            <span className="mobile-thread-copy">
              <strong>{thread.name}</strong>
              <small>{thread.text}</small>
            </span>
            <span className="mobile-thread-meta">
              <time>{thread.time}</time>
              {index > 0 && <BellOff size={18} />}
            </span>
          </button>
        ))}
        {visibleRoleCharacters.map((character, index) => {
          const isActive = character.id === activeCharacterId
          const conversation = conversationByCharacterId.get(character.id)
          const badge = formatUnreadBadge(getUnreadCount(conversation))

          return (
            <button
              className={`mobile-message-thread ${isActive ? 'active' : ''}`}
              key={character.id}
              onClick={() => openThreadAfterPress(character.id)}
              onContextMenu={(event) => {
                event.preventDefault()
              }}
              onPointerCancel={finishLongPress}
              onPointerDown={(event) => startLongPress(event, () => requestThreadAction(character))}
              onPointerLeave={finishLongPress}
              onPointerMove={moveLongPress}
              onPointerUp={finishLongPress}
              type="button"
            >
              <span
                className="avatar mobile-thread-avatar"
                style={{ '--avatar-accent': character.accent } as CSSProperties}
              >
                {character.avatar}
                {badge && <b>{badge}</b>}
              </span>
              <span className="mobile-thread-copy">
                <strong>{character.name}</strong>
                <small>{getLastConversationText(conversation, character.title)}</small>
              </span>
              <span className="mobile-thread-meta">
                <time>{formatThreadTime(conversation?.updatedAt, threadTimes[index % threadTimes.length])}</time>
                {index > 4 && <BellOff size={18} />}
              </span>
            </button>
          )
        })}
        {visibleGroups.length === 0 && visibleRoleCharacters.length === 0 && (
          <div className="mobile-empty-hint">没有找到对应聊天</div>
        )}
      </div>

      {groupSheetOpen && (
        <div className="mobile-group-sheet-backdrop" role="presentation">
          <section className="mobile-group-sheet" aria-label="新建群聊">
            <header>
              <button aria-label="关闭" onClick={() => setGroupSheetOpen(false)} type="button">
                <X size={24} />
              </button>
              <strong>新建群聊</strong>
              <button aria-label="创建群聊" onClick={createGroupFromSelection} type="button">
                <Check size={24} />
              </button>
            </header>
            <label className="mobile-group-name">
              <Users size={20} />
              <input
                onChange={(event) => setGroupName(event.target.value)}
                placeholder="群名（可不填）"
                value={groupName}
              />
            </label>
            <label className="mobile-feature-search mobile-group-search">
              <Search size={24} />
              <input
                aria-label="搜索群成员"
                onChange={(event) => setGroupQuery(event.target.value)}
                placeholder="搜索好友"
                value={groupQuery}
              />
            </label>
            <div className="mobile-group-member-list">
              {groupCandidateCharacters.map((character) => {
                const checked = selectedMemberIds.has(character.id)
                return (
                  <button
                    className={checked ? 'selected' : ''}
                    key={character.id}
                    onClick={() => toggleMember(character.id)}
                    type="button"
                  >
                    <span className="avatar" style={{ '--avatar-accent': character.accent } as CSSProperties}>
                      {character.avatar}
                    </span>
                    <span>
                      <strong>{character.name}</strong>
                      <small>{character.mood || character.title}</small>
                    </span>
                    <b>{checked && <Check size={18} />}</b>
                  </button>
                )
              })}
            </div>
            <footer>{selectedMemberIds.size > 0 ? `已选 ${selectedMemberIds.size} 位` : '从好友列表里选择成员'}</footer>
          </section>
        </div>
      )}
      {pendingThreadAction && (
        <MobileConfirmDialog
          danger
          title={pendingThreadAction.kind === 'group' ? '删除群聊' : '删除聊天'}
          message={
            pendingThreadAction.kind === 'group'
              ? `会把群聊「${pendingThreadAction.character.name}」和对应聊天记录放入回收花园，后悔了可以从回收站恢复。`
              : `会把和「${pendingThreadAction.character.name}」的聊天列表与记录放入回收花园，角色仍保留在角色页，以后可以重新发起聊天。`
          }
          confirmLabel={pendingThreadAction.kind === 'group' ? '删除群聊' : '删除聊天'}
          onCancel={() => setPendingThreadAction(null)}
          onConfirm={confirmThreadAction}
        />
      )}
    </section>
  )
}
