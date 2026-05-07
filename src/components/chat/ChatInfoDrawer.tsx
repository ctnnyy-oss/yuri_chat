// ChatPhone 右侧抽屉：聊天信息 + 聊天设置

import { useState, type CSSProperties } from 'react'
import { ChevronLeft, MoreHorizontal, ToggleLeft } from 'lucide-react'
import type { CharacterCard } from '../../domain/types'
import { MobileConfirmDialog } from '../MobileConfirmDialog'
import { GridDots } from './MobileStatusBar'
import type { ChatSettingRow } from './data'

type DrawerPanel = 'info' | 'settings'

interface ChatInfoDrawerProps {
  panel: DrawerPanel
  character: CharacterCard
  characters: CharacterCard[]
  settingRows: ChatSettingRow[]
  onClose: () => void
  onOpenSettings: () => void
  onBackToInfo: () => void
  onClearConversation: (characterId: string) => void
  onDeleteCharacter: (characterId: string) => boolean
}

export function ChatInfoDrawer({
  panel,
  character,
  characters,
  settingRows,
  onClose,
  onOpenSettings,
  onBackToInfo,
  onClearConversation,
  onDeleteCharacter,
}: ChatInfoDrawerProps) {
  const [pendingAction, setPendingAction] = useState<'clear' | 'delete-character' | null>(null)

  if (panel === 'info') {
    return (
      <aside className="chat-side-drawer" aria-label="聊天信息">
        <header>
          <button aria-label="关闭" onClick={onClose} type="button">
            <ChevronLeft size={26} />
          </button>
          <strong>聊天信息</strong>
          <button aria-label="更多" onClick={onOpenSettings} type="button">
            <MoreHorizontal size={24} />
          </button>
        </header>
        <section className="chat-info-hero">
          <span className="avatar" style={{ '--avatar-accent': character.accent } as CSSProperties}>
            {character.avatar}
          </span>
          <div>
            <strong>{character.name}</strong>
            <small>QQ：3400470281</small>
          </div>
          <GridDots />
        </section>
        <section className="chat-info-card">
          <h3>群成员 <span>3人</span></h3>
          <div className="chat-member-row">
            {characters.slice(0, 3).map((item) => (
              <span key={item.id}>
                <i className="avatar" style={{ '--avatar-accent': item.accent } as CSSProperties}>{item.avatar}</i>
                {item.name}
              </span>
            ))}
            <span><i>+</i>邀请</span>
            <span><i>-</i>移除</span>
          </div>
        </section>
        <button className="chat-info-card row" onClick={onOpenSettings} type="button">
          查找聊天记录
          <small>图片、视频、文件等</small>
        </button>
        <button className="chat-info-card row" type="button">
          群应用
          <small>文件、相册、精华消息</small>
        </button>
      </aside>
    )
  }

  return (
    <aside className="chat-side-drawer settings-drawer" aria-label="聊天设置">
      <header>
        <button aria-label="返回聊天信息" onClick={onBackToInfo} type="button">
          <ChevronLeft size={26} />
        </button>
        <strong>聊天设置</strong>
        <span />
      </header>
      <section className="chat-info-card settings-head">
        <span className="avatar" style={{ '--avatar-accent': character.accent } as CSSProperties}>
          {character.avatar}
        </span>
        <strong>{character.name}</strong>
      </section>
      <section className="chat-setting-list">
        {settingRows.map((row) => (
          <button
            className={row.link ? 'link-row' : row.danger ? 'danger-row' : ''}
            key={row.label}
            onClick={() => {
              if (row.action === 'clear-conversation') setPendingAction('clear')
              if (row.action === 'delete-character') setPendingAction('delete-character')
            }}
            type="button"
          >
            <span>{row.label}</span>
            {row.switcher ? (
              <ToggleLeft size={46} />
            ) : row.value ? (
              <small>{row.value}</small>
            ) : null}
          </button>
        ))}
      </section>
      {pendingAction === 'clear' && (
        <MobileConfirmDialog
          title="清空聊天记录"
          message={`会清空和「${character.name}」的聊天内容，但角色仍保留。`}
          confirmLabel="清空记录"
          onCancel={() => setPendingAction(null)}
          onConfirm={() => {
            onClearConversation(character.id)
            setPendingAction(null)
            onClose()
          }}
        />
      )}
      {pendingAction === 'delete-character' && (
        <MobileConfirmDialog
          danger
          title="删除角色"
          message={`会删除「${character.name}」这个角色，并一起清掉对应聊天记录。`}
          confirmLabel="删除角色"
          onCancel={() => setPendingAction(null)}
          onConfirm={() => {
            if (onDeleteCharacter(character.id)) {
              setPendingAction(null)
              onClose()
            }
          }}
        />
      )}
    </aside>
  )
}
