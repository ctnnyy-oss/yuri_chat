import { useState } from 'react'
import { ArchiveRestore, RotateCcw, Trash2 } from 'lucide-react'
import type { AppTrash } from '../../domain/types'
import { EmptyState, IconTextButton, WorkspaceTitle } from '../memory/atoms'
import { formatDeletedAt } from '../memory/memoryPanelUtils'
import { MobileConfirmDialog } from '../MobileConfirmDialog'

interface TrashGardenPanelProps {
  onDeleteTrashedConversation: (conversationId: string) => void
  onDeleteTrashedMemory: (memoryId: string) => void
  onDeleteTrashedWorldNode: (nodeId: string) => void
  onEmptyTrash: () => void
  onRestoreConversation: (conversationId: string) => void
  onRestoreMemory: (memoryId: string) => void
  onRestoreWorldNode: (nodeId: string) => void
  trash: AppTrash
}

type PendingTrashAction =
  | { kind: 'empty' }
  | { kind: 'conversation'; id: string; characterName: string }
  | { kind: 'memory'; id: string; title: string }
  | { kind: 'world'; id: string; title: string }

export function TrashGardenPanel({
  onDeleteTrashedConversation,
  onDeleteTrashedMemory,
  onDeleteTrashedWorldNode,
  onEmptyTrash,
  onRestoreConversation,
  onRestoreMemory,
  onRestoreWorldNode,
  trash,
}: TrashGardenPanelProps) {
  const [pendingAction, setPendingAction] = useState<PendingTrashAction | null>(null)
  const hasTrash = trash.memories.length > 0 || trash.worldNodes.length > 0 || trash.conversations.length > 0

  function confirmPendingAction() {
    if (!pendingAction) return
    const action = pendingAction
    setPendingAction(null)
    switch (action.kind) {
      case 'empty':
        onEmptyTrash()
        break
      case 'conversation':
        onDeleteTrashedConversation(action.id)
        break
      case 'memory':
        onDeleteTrashedMemory(action.id)
        break
      case 'world':
        onDeleteTrashedWorldNode(action.id)
        break
    }
  }

  function dialogProps(): { title: string; message: string; confirmLabel: string } | null {
    if (!pendingAction) return null
    switch (pendingAction.kind) {
      case 'empty':
        return {
          title: '清空回收花园',
          message: '回收花园里的全部内容会被彻底删除，不能再恢复。要继续吗？',
          confirmLabel: '清空回收花园',
        }
      case 'conversation':
        return {
          title: '彻底删除聊天',
          message: `「${pendingAction.characterName}」这条聊天会被彻底删除，不能再恢复。要继续吗？`,
          confirmLabel: '彻底删除',
        }
      case 'memory':
        return {
          title: '彻底删除记忆',
          message: `记忆「${pendingAction.title}」会被彻底删除，不能再恢复。要继续吗？`,
          confirmLabel: '彻底删除',
        }
      case 'world':
        return {
          title: '彻底删除世界树节点',
          message: `世界树节点「${pendingAction.title}」会被彻底删除，不能再恢复。要继续吗？`,
          confirmLabel: '彻底删除',
        }
    }
  }

  const dialog = dialogProps()

  return (
    <>
      <WorkspaceTitle
        description="删掉的聊天、记忆和世界树先睡在这里，后悔了可以恢复。"
        icon={<ArchiveRestore size={20} />}
        title="回收花园"
      />
      {hasTrash && (
        <div className="detail-actions">
          <button
            className="danger-button secondary-danger"
            onClick={() => setPendingAction({ kind: 'empty' })}
            type="button"
          >
            清空回收花园
          </button>
        </div>
      )}
      <section className="panel-stack">
        {!hasTrash && (
          <EmptyState text="回收花园是空的。以后误删了，姐姐会先放到这里。" />
        )}
        {trash.conversations.map((conversation) => {
          const lastMessage = conversation.messages.at(-1)
          return (
            <article className="memory-item muted-item" key={`trash-conversation-${conversation.id}`}>
              <div className="item-head">
                <strong>聊天 / {conversation.characterName}</strong>
                <span>{formatDeletedAt(conversation.deletedAt)}</span>
              </div>
              <p>{lastMessage?.content || conversation.summary || '这条聊天暂时没有可预览的内容。'}</p>
              <footer>{conversation.messages.length} 条消息</footer>
              <div className="item-actions">
                <IconTextButton
                  icon={<RotateCcw size={16} />}
                  label="恢复"
                  onClick={() => onRestoreConversation(conversation.id)}
                />
                <IconTextButton
                  danger
                  icon={<Trash2 size={16} />}
                  label="彻底删除"
                  onClick={() =>
                    setPendingAction({
                      kind: 'conversation',
                      id: conversation.id,
                      characterName: conversation.characterName,
                    })
                  }
                />
              </div>
            </article>
          )
        })}
        {trash.memories.map((memory) => (
          <article className="memory-item muted-item" key={`trash-memory-${memory.id}`}>
            <div className="item-head">
              <strong>记忆 / {memory.title}</strong>
              <span>{formatDeletedAt(memory.deletedAt)}</span>
            </div>
            <p>{memory.body}</p>
            <footer>{memory.tags.join(' / ')}</footer>
            <div className="item-actions">
              <IconTextButton icon={<RotateCcw size={16} />} label="恢复" onClick={() => onRestoreMemory(memory.id)} />
              <IconTextButton
                danger
                icon={<Trash2 size={16} />}
                label="彻底删除"
                onClick={() => setPendingAction({ kind: 'memory', id: memory.id, title: memory.title })}
              />
            </div>
          </article>
        ))}
        {trash.worldNodes.map((node) => (
          <article className="memory-item muted-item" key={`trash-world-${node.id}`}>
            <div className="item-head">
              <strong>世界树 / {node.title}</strong>
              <span>{formatDeletedAt(node.deletedAt)}</span>
            </div>
            <p>{node.content}</p>
            <footer>{node.keywords.join(' / ')}</footer>
            <div className="item-actions">
              <IconTextButton icon={<RotateCcw size={16} />} label="恢复" onClick={() => onRestoreWorldNode(node.id)} />
              <IconTextButton
                danger
                icon={<Trash2 size={16} />}
                label="彻底删除"
                onClick={() => setPendingAction({ kind: 'world', id: node.id, title: node.title })}
              />
            </div>
          </article>
        ))}
      </section>
      {dialog && (
        <MobileConfirmDialog
          danger
          title={dialog.title}
          message={dialog.message}
          confirmLabel={dialog.confirmLabel}
          onCancel={() => setPendingAction(null)}
          onConfirm={confirmPendingAction}
        />
      )}
    </>
  )
}
