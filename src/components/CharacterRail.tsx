import type { CSSProperties } from 'react'
import { useMemo, useState } from 'react'
import {
  BellOff,
  Check,
  ChevronRight,
  Plus,
  Search,
  Users,
  X,
} from 'lucide-react'
import { brand } from '../config/brand'
import type { CharacterCard, ConversationState } from '../domain/types'
import {
  channelRows,
  characterThreadTime,
  formatThreadTime,
  formatUnreadBadge,
  getFeatureRows,
  getLastConversationText,
  getUnreadCount,
  isGroupCharacter,
  primaryNavigationItems,
  type AppView,
} from './characterRailModel'
export type { AppView } from './characterRailModel'

interface CharacterRailProps {
  characters: CharacterCard[]
  activeCharacterId: string
  conversations: ConversationState[]
  activeView: AppView
  onViewChange: (view: AppView) => void
  onSelect: (characterId: string) => void
  onOpenGroupChat?: (group: { name: string; text: string; memberIds?: string[] }) => void
  onCreateRoleRequest?: () => void
  onShellAction?: (message: string) => void
}

export function CharacterRail({
  characters,
  activeCharacterId,
  conversations,
  activeView,
  onShellAction,
  onCreateRoleRequest,
  onOpenGroupChat,
  onViewChange,
  onSelect,
}: CharacterRailProps) {
  const [queryState, setQueryState] = useState<{ view: AppView; value: string }>(() => ({
    view: activeView,
    value: '',
  }))
  const [pinnedThreadIds, setPinnedThreadIds] = useState<Set<string>>(() => new Set())
  const [pinTimer, setPinTimer] = useState<number | null>(null)

  const query = queryState.view === activeView ? queryState.value : ''
  const normalizedQuery = query.trim().toLowerCase()
  const activeCharacter = characters.find((character) => character.id === activeCharacterId) ?? characters[0]
  const compactManagementView = activeView === 'model' || activeView === 'memory' || activeView === 'settings' || activeView === 'trash'
  const roleCharacters = useMemo(() => characters.filter((character) => !isGroupCharacter(character)), [characters])
  const groupCharacters = useMemo(() => characters.filter(isGroupCharacter), [characters])
  const visibleChannelRows = useMemo(() => channelRows.filter(() => false), [])
  const featureRows = useMemo(() => getFeatureRows(activeView), [activeView])
  const [groupCreatorOpen, setGroupCreatorOpen] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupMemberIds, setGroupMemberIds] = useState<Set<string>>(() => new Set())
  const conversationByCharacterId = useMemo(() => {
    return new Map(conversations.map((conversation) => [conversation.characterId, conversation]))
  }, [conversations])
  const totalUnreadBadge = useMemo(() => {
    const totalUnread = conversations.reduce((total, conversation) => total + getUnreadCount(conversation), 0)
    return formatUnreadBadge(totalUnread)
  }, [conversations])
  const navigationItems = useMemo(
    () =>
      primaryNavigationItems.map((item) =>
        item.id === 'chat' ? { ...item, badge: totalUnreadBadge } : item,
      ),
    [totalUnreadBadge],
  )
  const filteredCharacters = useMemo(() => {
    if (!normalizedQuery) return roleCharacters
    return roleCharacters.filter((character) => {
      const haystack = [
        character.name,
        character.title,
        character.subtitle,
        character.relationship,
        character.tags.join(' '),
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [normalizedQuery, roleCharacters])
  const filteredChannelRows = useMemo(() => {
    const defaultTitles = new Set(visibleChannelRows.map((row) => row.title))
    const defaultRows = visibleChannelRows.map((row) => {
      const existing = groupCharacters.find((character) => character.name === row.title)
      return {
        ...row,
        id: existing ? `group:${existing.id}` : row.id,
        avatar: existing?.avatar ?? row.avatar,
        text: existing ? getLastConversationText(conversationByCharacterId.get(existing.id), existing.mood) : row.text,
        time: existing ? formatThreadTime(conversationByCharacterId.get(existing.id)?.updatedAt, row.time) : row.time,
        characterId: existing?.id ?? '',
        updatedAt: conversationByCharacterId.get(existing?.id ?? '')?.updatedAt ?? '',
      }
    })
    const customRows = groupCharacters
      .filter((character) => !defaultTitles.has(character.name))
      .map((character, index) => {
        const conversation = conversationByCharacterId.get(character.id)
        return {
          id: `group:${character.id}`,
          title: character.name,
          text: getLastConversationText(conversation, character.mood || character.title),
          time: formatThreadTime(conversation?.updatedAt, index === 0 ? '刚刚' : '今天'),
          avatar: character.avatar,
          badge: '',
          characterId: character.id,
          updatedAt: conversation?.updatedAt ?? '',
        }
      })
    const rows = [...defaultRows, ...customRows]
    if (!normalizedQuery) return rows
    return rows.filter((row) => `${row.title} ${row.text}`.toLowerCase().includes(normalizedQuery))
  }, [conversationByCharacterId, groupCharacters, normalizedQuery, visibleChannelRows])
  const chatThreads = useMemo(() => {
    const characterThreads = filteredCharacters.map((character, index) => {
      const conversation = conversationByCharacterId.get(character.id)
      return {
        id: `character:${character.id}`,
        type: 'character' as const,
        rank: index * 2 + 1,
        name: character.name,
        avatar: character.avatar,
        accent: character.accent,
        preview: getLastConversationText(conversation, character.title),
        time: formatThreadTime(conversation?.updatedAt, characterThreadTime(index, character.id === activeCharacterId)),
        muted: index === 5,
        badge: formatUnreadBadge(getUnreadCount(conversation)),
        characterId: character.id,
        updatedAt: conversation?.updatedAt ?? '',
      }
    })
    const groupThreads = filteredChannelRows.map((row, index) => ({
      id: row.id,
      type: 'group' as const,
      rank: index * 2,
      name: row.title,
      avatar: row.avatar,
      accent: '#f2c5de',
      preview: row.text,
      time: row.time,
      muted: index > 0,
      badge: row.badge,
      characterId: row.characterId,
      updatedAt: row.updatedAt,
    }))

    return [...characterThreads, ...groupThreads].sort((left, right) => {
      const leftPinned = pinnedThreadIds.has(left.id)
      const rightPinned = pinnedThreadIds.has(right.id)
      if (leftPinned !== rightPinned) return leftPinned ? -1 : 1
      const leftTime = left.updatedAt ? new Date(left.updatedAt).getTime() : 0
      const rightTime = right.updatedAt ? new Date(right.updatedAt).getTime() : 0
      if (leftTime !== rightTime) return rightTime - leftTime
      return left.rank - right.rank
    })
  }, [activeCharacterId, conversationByCharacterId, filteredCharacters, filteredChannelRows, pinnedThreadIds])

  function togglePinnedThread(threadId: string) {
    setPinnedThreadIds((current) => {
      const next = new Set(current)
      if (next.has(threadId)) {
        next.delete(threadId)
      } else {
        next.add(threadId)
      }
      return next
    })
  }

  function startPinGesture(threadId: string) {
    if (typeof window === 'undefined') return
    const timer = window.setTimeout(() => {
      togglePinnedThread(threadId)
      onShellAction?.('已切换置顶状态')
      setPinTimer(null)
    }, 560)
    setPinTimer(timer)
  }

  function cancelPinGesture() {
    if (pinTimer === null || typeof window === 'undefined') return
    window.clearTimeout(pinTimer)
    setPinTimer(null)
  }

  function toggleGroupMember(characterId: string) {
    setGroupMemberIds((current) => {
      const next = new Set(current)
      if (next.has(characterId)) {
        next.delete(characterId)
      } else {
        next.add(characterId)
      }
      return next
    })
  }

  function closeGroupCreator() {
    setGroupCreatorOpen(false)
    setGroupName('')
    setGroupMemberIds(new Set())
  }

  function createGroupFromMembers() {
    const memberIds = [...groupMemberIds]
    if (memberIds.length === 0) {
      onShellAction?.('先选择至少一位角色再建群')
      return
    }
    const memberNames = roleCharacters.filter((character) => groupMemberIds.has(character.id)).map((character) => character.name)
    onOpenGroupChat?.({
      name: groupName.trim() || `${memberNames.slice(0, 3).join('、')}的小群`,
      text: `${memberNames.join('、')}已经加入群聊`,
      memberIds,
    })
    closeGroupCreator()
  }

  return (
    <aside className={`left-panel ${compactManagementView ? 'left-panel-compact' : ''}`}>
      <div className="qq-icon-rail">
        <button
          aria-label={brand.nameZh}
          className="qq-brand-button"
          onClick={() => onViewChange('chat')}
          title={brand.nameZh}
          type="button"
        >
          <span>YURI</span>
        </button>

        <nav className="primary-nav" aria-label="主要功能">
          {navigationItems.map((item) => {
            const Icon = item.icon
            const active = activeView === item.id
            return (
              <button
                aria-label={item.label}
                className={`nav-button ${active ? 'active' : ''}`}
                key={item.id}
                onClick={() => onViewChange(item.id)}
                title={item.description}
                type="button"
              >
                <Icon size={25} strokeWidth={2.1} />
                {item.badge && <b className={item.badge === '•' ? 'nav-dot' : ''}>{item.badge}</b>}
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="qq-rail-spacer" />
      </div>

      {!compactManagementView && (
      <section className={`conversation-pane ${groupCreatorOpen ? 'with-group-creator' : ''}`} aria-label="QQ 侧边内容">
        <div className="conversation-search-row">
          <label className="conversation-search">
            <Search size={18} />
            <input
              aria-label="搜索"
              onChange={(event) => setQueryState({ view: activeView, value: event.target.value })}
              placeholder="搜索"
              value={query}
            />
          </label>
          <button
            aria-label="新建"
            className="conversation-add-button"
            onClick={() => {
              if (activeView === 'role') {
                onCreateRoleRequest?.()
                return
              }
              if (activeView === 'chat') {
                setGroupCreatorOpen(true)
                return
              }
              onShellAction?.('当前入口已放入设置中心规划')
            }}
            title={activeView === 'role' ? '添加角色' : '新建聊天'}
            type="button"
          >
            <Plus size={20} />
          </button>
        </div>

        {activeView === 'chat' && groupCreatorOpen && (
          <div className="rail-group-creator" role="dialog" aria-label="新建群聊">
            <header>
              <span>
                <Users size={18} />
                <strong>新建群聊</strong>
              </span>
              <button aria-label="关闭建群面板" onClick={closeGroupCreator} type="button">
                <X size={17} />
              </button>
            </header>
            <input
              aria-label="群聊名称"
              onChange={(event) => setGroupName(event.target.value)}
              placeholder="群名（可不填）"
              value={groupName}
            />
            <div className="rail-group-members">
              {roleCharacters.map((character) => {
                const selected = groupMemberIds.has(character.id)
                return (
                  <button
                    className={selected ? 'selected' : ''}
                    key={character.id}
                    onClick={() => toggleGroupMember(character.id)}
                    type="button"
                  >
                    <span className="avatar" style={{ '--avatar-accent': character.accent } as CSSProperties}>
                      {character.avatar}
                    </span>
                    <span>
                      <strong>{character.name}</strong>
                      <small>{character.mood}</small>
                    </span>
                    <b>{selected && <Check size={15} />}</b>
                  </button>
                )
              })}
            </div>
            <footer>
              <small>{groupMemberIds.size > 0 ? `已选 ${groupMemberIds.size} 位` : '从好友里选择成员'}</small>
              <button onClick={createGroupFromMembers} type="button">创建</button>
            </footer>
          </div>
        )}

        {activeView === 'chat' && (
          <div className="character-list conversation-list">
            {chatThreads.map((thread) => {
              const active = thread.characterId === activeCharacterId
              const pinned = pinnedThreadIds.has(thread.id)
              return (
                <button
                  className={`character-button ${active ? 'active' : ''} ${thread.type === 'group' ? 'ghost' : ''}`}
                  key={thread.id}
                  onClick={() => {
                    if (thread.type === 'character') {
                      onSelect(thread.characterId)
                      onViewChange('chat')
                      return
                    }
                    if (thread.characterId) {
                      onSelect(thread.characterId)
                      onViewChange('chat')
                      return
                    }
                    onOpenGroupChat?.({ name: thread.name, text: thread.preview })
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    togglePinnedThread(thread.id)
                  }}
                  onPointerDown={() => startPinGesture(thread.id)}
                  onPointerLeave={cancelPinGesture}
                  onPointerUp={cancelPinGesture}
                  title="长按或右键切换置顶"
                  type="button"
                >
                  <span className="avatar" style={{ '--avatar-accent': thread.accent } as CSSProperties}>
                    {thread.avatar}
                    {'badge' in thread && thread.badge && <b>{thread.badge}</b>}
                  </span>
                  <span className="conversation-copy">
                    <strong>{thread.name}</strong>
                    <small>{thread.preview}</small>
                  </span>
                  <span className="conversation-meta">
                    <time>{pinned ? '置顶' : thread.time}</time>
                    {thread.muted && <BellOff size={17} />}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {activeView === 'role' && (
          <div className="qq-contact-pane qq-contact-pane-simple">
            <div className="qq-contact-friends">
              {roleCharacters.map((character) => (
                <button
                  className={character.id === activeCharacterId ? 'active' : ''}
                  key={character.id}
                  onClick={() => {
                    onSelect(character.id)
                    onShellAction?.('角色卡片已选中，后续可在这里编辑人设、头像、关系和默认模型')
                  }}
                  type="button"
                >
                  <span className="avatar" style={{ '--avatar-accent': character.accent } as CSSProperties}>
                    {character.avatar}
                  </span>
                  <span>
                    <strong>{character.name}</strong>
                    <small>{character.mood}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {activeView === 'group' && (
          <div className="character-list conversation-list">
            {visibleChannelRows.map((row, index) => (
              <button className={`character-button ${index === 0 ? 'active' : ''}`} key={row.title} type="button">
                <span className="avatar channel-avatar">
                  {row.avatar}
                  {row.badge && <b>{row.badge}</b>}
                </span>
                <span className="conversation-copy">
                  <strong>{row.title}</strong>
                  <small>{row.text}</small>
                </span>
                <span className="conversation-meta">
                  <time>{row.time}</time>
                  <BellOff size={17} />
                </span>
              </button>
            ))}
          </div>
        )}

        {activeView !== 'chat' && activeView !== 'role' && activeView !== 'group' && (
          <div className="qq-app-pane">
            {featureRows.map((row) => {
              const Icon = row.icon
              return (
                <button
                  className={row.active ? 'active' : ''}
                  key={row.title}
                  onClick={() => {
                    if (row.view !== activeView) {
                      onViewChange(row.view)
                      return
                    }
                    onShellAction?.(`${row.title} 已在右侧展示`)
                  }}
                  type="button"
                >
                  <span className="qq-app-pane-icon">
                    <Icon size={22} />
                  </span>
                  <span>
                    <strong>{row.title}</strong>
                    <small>{row.text}</small>
                  </span>
                  <ChevronRight size={18} />
                </button>
              )
            })}
          </div>
        )}

        <footer className="conversation-pane-foot">
          <span className="avatar" style={{ '--avatar-accent': activeCharacter?.accent ?? '#d85b8a' } as CSSProperties}>
            {activeCharacter?.avatar ?? '朝'}
          </span>
          <span>{activeCharacter?.name ?? '沈朝歌'}</span>
        </footer>
      </section>
      )}
    </aside>
  )
}
