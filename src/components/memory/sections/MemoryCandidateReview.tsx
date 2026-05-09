import { ArchiveRestore, CheckCircle2, FileText, Pencil, ShieldCheck, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { CharacterCard, LongTermMemory } from '../../../domain/types'
import {
  memoryKindLabels,
  memoryMentionPolicyLabels,
  memorySensitivityLabels,
} from '../../../domain/memoryLabels'
import { IconTextButton } from '../atoms'
import { formatScopeDisplay, isCoolingDown } from '../memoryPanelUtils'

export function MemoryCandidateReview({
  candidates,
  characters,
  onArchive,
  onConfirm,
  onEdit,
  onOpen,
  onTrash,
}: {
  candidates: LongTermMemory[]
  characters: CharacterCard[]
  onArchive: (memory: LongTermMemory) => void
  onConfirm: (memory: LongTermMemory) => void
  onEdit: (memory: LongTermMemory) => void
  onOpen: (memory: LongTermMemory) => void
  onTrash: (memory: LongTermMemory) => void
}) {
  const [showAll, setShowAll] = useState(false)

  if (candidates.length === 0) {
    return (
      <section className="candidate-review empty-review" aria-label="候选记忆审核中心">
        <div className="candidate-review-head">
          <div>
            <strong>候选记忆审核</strong>
            <span>暂时没有等妹妹拍板的记忆。关系和低确定性内容会先来这里排队。</span>
          </div>
          <CheckCircle2 size={18} />
        </div>
      </section>
    )
  }

  const visibleCandidates = showAll ? candidates : candidates.slice(0, 3)
  const hiddenCount = Math.max(0, candidates.length - visibleCandidates.length)

  return (
    <section className="candidate-review" aria-label="候选记忆审核中心">
      <div className="candidate-review-head">
        <div>
          <strong>候选记忆审核</strong>
          <span>{candidates.length} 条记忆等妹妹确认，确认前不会进入聊天提示。</span>
        </div>
        <ShieldCheck size={18} />
      </div>
      <div className="candidate-list">
        {visibleCandidates.map((memory) => (
          <article className="candidate-card" key={memory.id}>
            <div className="candidate-card-head">
              <strong>{memory.title}</strong>
              <span>{Math.round(memory.confidence * 100)}%</span>
            </div>
            <div className="memory-meta">
              <span>{memoryKindLabels[memory.kind]}</span>
              <span>{formatScopeDisplay(memory.scope, characters)}</span>
              <span>{memorySensitivityLabels[memory.sensitivity]}</span>
              <span>{memoryMentionPolicyLabels[memory.mentionPolicy]}</span>
              {isCoolingDown(memory.cooldownUntil) && <span>冷却中</span>}
              <span>来源 {memory.sources.length}</span>
            </div>
            <p>{memory.body}</p>
            <footer>{memory.tags.join(' / ')}</footer>
            <div className="item-actions">
              <IconTextButton icon={<CheckCircle2 size={16} />} label="保存生效" onClick={() => onConfirm(memory)} />
              <IconTextButton icon={<FileText size={16} />} label="看档案" onClick={() => onOpen(memory)} />
              <IconTextButton icon={<Pencil size={16} />} label="先编辑" onClick={() => onEdit(memory)} />
              <IconTextButton icon={<ArchiveRestore size={16} />} label="暂存归档" onClick={() => onArchive(memory)} />
              <IconTextButton danger icon={<Trash2 size={16} />} label="删除" onClick={() => onTrash(memory)} />
            </div>
          </article>
        ))}
        {hiddenCount > 0 && (
          <button className="memory-expand-action" type="button" onClick={() => setShowAll(true)}>
            展开剩余 {hiddenCount} 条候选记忆
          </button>
        )}
      </div>
    </section>
  )
}
