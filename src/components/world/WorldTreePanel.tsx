import { Database, Pencil, Save, Trash2, X } from 'lucide-react'
import type { WorldNode } from '../../domain/types'
import { EmptyState, IconTextButton, WorkspaceTitle } from '../memory/atoms'
import type { WorldDraft } from '../memory/memoryPanelTypes'
import { CoreCpProfiles } from './CoreCpProfiles'

interface WorldTreePanelProps {
  editingWorldId: string | null
  onCancelEdit: () => void
  onDraftChange: (draft: WorldDraft) => void
  onSaveWorld: (node: WorldNode) => void
  onStartWorldEdit: (node: WorldNode) => void
  onTrashWorldNode: (nodeId: string) => void
  worldDraft: WorldDraft | null
  worldNodes: WorldNode[]
}

export function WorldTreePanel({
  editingWorldId,
  onCancelEdit,
  onDraftChange,
  onSaveWorld,
  onStartWorldEdit,
  onTrashWorldNode,
  worldDraft,
  worldNodes,
}: WorldTreePanelProps) {
  return (
    <>
      <WorkspaceTitle
        description="三对核心 CP、四时代世界观规则和触发词先放在这里，后续可以慢慢补全。"
        icon={<Database size={20} />}
        title="百合小窝"
      />
      <CoreCpProfiles />
      <section className="panel-stack">
        {worldNodes.length === 0 && <EmptyState text="当前没有世界树节点。删掉的内容可以去回收花园找回。" />}
        {worldNodes.map((node) => (
          <article className="memory-item" key={node.id}>
            {editingWorldId === node.id && worldDraft ? (
              <div className="edit-form">
                <label>
                  <span>标题</span>
                  <input onChange={(event) => onDraftChange({ ...worldDraft, title: event.target.value })} value={worldDraft.title} />
                </label>
                <label>
                  <span>触发词</span>
                  <input
                    onChange={(event) => onDraftChange({ ...worldDraft, keywords: event.target.value })}
                    value={worldDraft.keywords}
                  />
                </label>
                <label>
                  <span>内容</span>
                  <textarea
                    onChange={(event) => onDraftChange({ ...worldDraft, content: event.target.value })}
                    rows={4}
                    value={worldDraft.content}
                  />
                </label>
                <div className="edit-row">
                  <label>
                    <span>权重</span>
                    <input
                      max="5"
                      min="1"
                      onChange={(event) => onDraftChange({ ...worldDraft, priority: Number(event.target.value) })}
                      type="number"
                      value={worldDraft.priority}
                    />
                  </label>
                  <label className="compact-check">
                    <input
                      checked={worldDraft.enabled}
                      onChange={(event) => onDraftChange({ ...worldDraft, enabled: event.target.checked })}
                      type="checkbox"
                    />
                    <span>启用</span>
                  </label>
                </div>
                <div className="item-actions">
                  <IconTextButton icon={<Save size={16} />} label="保存" onClick={() => onSaveWorld(node)} />
                  <IconTextButton icon={<X size={16} />} label="取消" onClick={onCancelEdit} />
                </div>
              </div>
            ) : (
              <>
                <div className="item-head">
                  <strong>{node.title}</strong>
                  <span>{node.enabled ? '启用' : '关闭'} / 权重 {node.priority}</span>
                </div>
                <p>{node.content}</p>
                <footer>{node.keywords.join(' / ')}</footer>
                <div className="item-actions">
                  <IconTextButton icon={<Pencil size={16} />} label="编辑" onClick={() => onStartWorldEdit(node)} />
                  <IconTextButton icon={<Trash2 size={16} />} label="删除" onClick={() => onTrashWorldNode(node.id)} />
                </div>
              </>
            )}
          </article>
        ))}
      </section>
    </>
  )
}
