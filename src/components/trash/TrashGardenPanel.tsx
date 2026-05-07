import { ArchiveRestore, RotateCcw, Trash2 } from 'lucide-react'
import type { AppTrash } from '../../domain/types'
import { EmptyState, IconTextButton, WorkspaceTitle } from '../memory/atoms'
import { formatDeletedAt } from '../memory/memoryPanelUtils'

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
  const hasTrash = trash.memories.length > 0 || trash.worldNodes.length > 0 || trash.conversations.length > 0

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
            onClick={() => {
              if (window.confirm('回收花园里的内容会全部彻底删除，不能再恢复。确定吗？')) {
                onEmptyTrash()
              }
            }}
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
                  onClick={() => {
                    if (window.confirm('这条聊天会被彻底删除，不能再恢复。确定吗？')) {
                      onDeleteTrashedConversation(conversation.id)
                    }
                  }}
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
                onClick={() => {
                  if (window.confirm('这条记忆会被彻底删除，不能再恢复。确定吗？')) {
                    onDeleteTrashedMemory(memory.id)
                  }
                }}
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
                onClick={() => {
                  if (window.confirm('这个世界树节点会被彻底删除，不能再恢复。确定吗？')) {
                    onDeleteTrashedWorldNode(node.id)
                  }
                }}
              />
            </div>
          </article>
        ))}
      </section>
    </>
  )
}
