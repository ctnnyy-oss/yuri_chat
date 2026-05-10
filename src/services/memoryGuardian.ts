import type {
  AppTrash,
  LongTermMemory,
  MemoryConflict,
  MemoryEvent,
  MemoryMentionPolicy,
  MemoryUsageLog,
} from '../domain/types'
import { isCoreMemoryAnchor, isMemoryReviewDue } from './memoryCore'
import { getMemoryEventTypeLabel } from './memoryEvents'

export type MemoryGuardianSeverity = 'danger' | 'warning' | 'info'
export type MemoryTimelineKind = 'created' | 'updated' | 'called' | 'deleted' | 'candidate' | 'review' | 'event'

export interface MemoryGuardianSummary {
  activeCount: number
  stableCount: number
  episodeCount: number
  workingCount: number
  reviewCount: number
  protectedCount: number
  recentUsageCount: number
  healthScore: number
  healthLabel: string
}

export interface MemoryReviewItem {
  id: string
  memoryId: string
  title: string
  detail: string
  severity: MemoryGuardianSeverity
  suggestedAction: string
}

export interface MemoryTimelineItem {
  id: string
  memoryId?: string
  title: string
  detail: string
  at: string
  kind: MemoryTimelineKind
}

export interface MemoryGuardianLane {
  id: string
  label: string
  description: string
  count: number
}

export interface MemoryGuardianReport {
  summary: MemoryGuardianSummary
  lanes: MemoryGuardianLane[]
  reviewItems: MemoryReviewItem[]
  timelineItems: MemoryTimelineItem[]
}

interface BuildMemoryGuardianReportInput {
  memories: LongTermMemory[]
  conflicts: MemoryConflict[]
  usageLogs: MemoryUsageLog[]
  memoryEvents: MemoryEvent[]
  trash: AppTrash
  now?: Date
}

const sensitiveMentionPolicies = new Set<MemoryMentionPolicy>(['explicit', 'silent'])

export function buildMemoryGuardianReport({
  memories,
  conflicts,
  usageLogs,
  memoryEvents,
  trash,
  now = new Date(),
}: BuildMemoryGuardianReportInput): MemoryGuardianReport {
  const visibleMemories = memories.filter((memory) => memory.status !== 'trashed' && memory.status !== 'permanently_deleted')
  const activeMemories = visibleMemories.filter((memory) => memory.status === 'active')
  const candidateMemories = visibleMemories.filter((memory) => memory.status === 'candidate')
  const protectedMemories = activeMemories.filter(isProtectedMemory)
  const stableCount = activeMemories.filter((memory) => memory.layer === 'stable').length
  const episodeCount = activeMemories.filter((memory) => memory.layer === 'episode').length
  const workingCount = activeMemories.filter((memory) => memory.layer === 'working').length
  const recentUsageCount = usageLogs.filter((log) => daysBetween(log.createdAt, now) <= 7).length
  const reviewItems = buildReviewItems(visibleMemories, conflicts, now)
  const summary = buildSummary({
    activeCount: activeMemories.length,
    stableCount,
    episodeCount,
    workingCount,
    reviewCount: reviewItems.length,
    protectedCount: protectedMemories.length,
    recentUsageCount,
    candidateCount: candidateMemories.length,
    conflictCount: conflicts.length,
    missingSourceCount: activeMemories.filter((memory) => memory.sources.length === 0).length,
    lowConfidenceCount: activeMemories.filter((memory) => memory.confidence < 0.72).length,
  })

  return {
    summary,
    lanes: [
      {
        id: 'stable',
        label: '稳定事实',
        description: '会长期帮助姐姐理解妹妹、角色和项目。',
        count: summary.stableCount,
      },
      {
        id: 'episode',
        label: '阶段事件',
        description: '记录发生过的脉络，但不会变成永久偏好。',
        count: summary.episodeCount,
      },
      {
        id: 'working',
        label: '临时工作',
        description: '只在当前任务强相关时使用，避免污染长期人格。',
        count: summary.workingCount,
      },
      {
        id: 'protected',
        label: '边界保护',
        description: '敏感、禁忌、冷却或只做安全边界的记忆。',
        count: summary.protectedCount,
      },
    ],
    reviewItems,
    timelineItems: buildTimelineItems(visibleMemories, usageLogs, memoryEvents, trash, now),
  }
}

function buildSummary(input: {
  activeCount: number
  stableCount: number
  reviewCount: number
  protectedCount: number
  recentUsageCount: number
  episodeCount: number
  workingCount: number
  candidateCount: number
  conflictCount: number
  missingSourceCount: number
  lowConfidenceCount: number
}): MemoryGuardianSummary {
  const penalty =
    Math.min(input.reviewCount * 3, 18) +
    Math.min(input.candidateCount * 1.25, 18) +
    Math.min(input.conflictCount * 6, 24) +
    Math.min(input.missingSourceCount * 2, 10) +
    Math.min(input.lowConfidenceCount * 4, 16) +
    Math.min(input.workingCount * 1.5, 8)
  const activityBonus = Math.min(input.recentUsageCount * 2, 10)
  const healthScore = clamp(Math.round(100 - penalty + activityBonus), 0, 100)

  return {
    activeCount: input.activeCount,
    stableCount: input.stableCount,
    episodeCount: input.episodeCount,
    workingCount: input.workingCount,
    reviewCount: input.reviewCount,
    protectedCount: input.protectedCount,
    recentUsageCount: input.recentUsageCount,
    healthScore,
    healthLabel: getHealthLabel(healthScore),
  }
}

function buildReviewItems(
  memories: LongTermMemory[],
  conflicts: MemoryConflict[],
  now: Date,
): MemoryReviewItem[] {
  const items: MemoryReviewItem[] = []
  const conflictMemoryIds = new Set(conflicts.flatMap((conflict) => conflict.memoryIds))

  memories.forEach((memory) => {
    if (memory.status === 'candidate') {
      items.push({
        id: `candidate-${memory.id}`,
        memoryId: memory.id,
        title: memory.title,
        detail: memory.mergeSuggestion
          ? `这条还是候选记忆，确认前不会进入聊天提示；它像是「${memory.mergeSuggestion.targetTitle}」的补充。`
          : '这条还是候选记忆，确认前不会进入聊天提示。',
        severity: 'warning',
        suggestedAction: memory.mergeSuggestion
          ? '打开候选检查来源；确认后合并到原记忆，或编辑成单独记忆。'
          : '确认、编辑后保存，或删除它。',
      })
    }

    if (conflictMemoryIds.has(memory.id)) {
      items.push({
        id: `conflict-${memory.id}`,
        memoryId: memory.id,
        title: memory.title,
        detail: '这条记忆卷入了冲突提醒，可能重复、相反或放错空间。',
        severity: 'danger',
        suggestedAction: '打开档案检查来源，再决定合并、迁移或归档。',
      })
    }

    if (memory.status !== 'active') return

    if (memory.layer === 'stable' && (memory.kind === 'event' || memory.kind === 'reflection')) {
      items.push({
        id: `layer-stable-event-${memory.id}`,
        memoryId: memory.id,
        title: memory.title,
        detail: '事件类内容被放进稳定事实，后面可能被误当成永久偏好。',
        severity: 'warning',
        suggestedAction: '改成“阶段事件”，让它留在时间线里。',
      })
    }

    if (memory.layer === 'episode' && ['profile', 'preference', 'procedure', 'taboo', 'safety'].includes(memory.kind)) {
      items.push({
        id: `layer-episode-rule-${memory.id}`,
        memoryId: memory.id,
        title: memory.title,
        detail: '这类记忆更像长期事实或规则，不该只当阶段事件。',
        severity: 'info',
        suggestedAction: '确认无误后可转成“稳定事实”。',
      })
    }

    if (memory.layer === 'working' && daysBetween(memory.updatedAt, now) > 7) {
      items.push({
        id: `working-stale-${memory.id}`,
        memoryId: memory.id,
        title: memory.title,
        detail: '临时工作记忆已经超过 7 天，可能该归档、删除或转成事件。',
        severity: 'info',
        suggestedAction: '复查它是否还服务当前任务。',
      })
    }

    if (memory.confidence < 0.72) {
      items.push({
        id: `confidence-${memory.id}`,
        memoryId: memory.id,
        title: memory.title,
        detail: `可信度只有 ${Math.round(memory.confidence * 100)}%，不适合长期无脑相信。`,
        severity: 'warning',
        suggestedAction: '补充来源、提高可信度，或先归档。',
      })
    }

    if (memory.sources.length === 0) {
      items.push({
        id: `source-${memory.id}`,
        memoryId: memory.id,
        title: memory.title,
        detail: '缺少来源证据，后面很难判断它是不是旧版本遗留。',
        severity: 'info',
        suggestedAction: '手动确认内容，或等后续补来源。',
      })
    }

    if (memory.sensitivity === 'high' && !sensitiveMentionPolicies.has(memory.mentionPolicy)) {
      items.push({
        id: `sensitive-${memory.id}`,
        memoryId: memory.id,
        title: memory.title,
        detail: '高敏记忆不适合自然主动提起。',
        severity: 'danger',
        suggestedAction: '改成“问起再提”或“只做边界”。',
      })
    }

    if (memory.kind === 'relationship' && memory.scope.kind === 'global_user') {
      items.push({
        id: `scope-${memory.id}`,
        memoryId: memory.id,
        title: memory.title,
        detail: '关系记忆还在全局空间，多角色聊天时容易串戏。',
        severity: 'warning',
        suggestedAction: '迁移到当前角色关系或角色私有空间。',
      })
    }

    if (!memory.pinned && memory.accessCount === 0 && daysBetween(memory.updatedAt, now) > 45) {
      items.push({
        id: `stale-${memory.id}`,
        memoryId: memory.id,
        title: memory.title,
        detail: '这条记忆很久没有被调用，可能已经过期或权重过高。',
        severity: 'info',
        suggestedAction: '复查是否还需要保留，或者降权归档。',
      })
    }

    if (isCoreMemoryAnchor(memory) && isMemoryReviewDue(memory, now)) {
      items.push({
        id: `rehearsal-${memory.id}`,
        memoryId: memory.id,
        title: memory.title,
        detail: '这条是核心记忆，但很久没有被主动调用。真人记忆会靠复习和线索重新巩固，这条适合在整理时确认一次。',
        severity: 'info',
        suggestedAction: '打开档案确认仍然准确；确认后保持置顶或提高可信度。',
      })
    }
  })

  return dedupeReviewItems(items).slice(0, 8)
}

function buildTimelineItems(
  memories: LongTermMemory[],
  usageLogs: MemoryUsageLog[],
  memoryEvents: MemoryEvent[],
  trash: AppTrash,
  now: Date,
): MemoryTimelineItem[] {
  const memoryTitleById = new Map(memories.map((memory) => [memory.id, memory.title]))
  const items: MemoryTimelineItem[] = []

  memories.forEach((memory) => {
    items.push({
      id: `created-${memory.id}`,
      memoryId: memory.id,
      title: memory.title,
      detail: memory.status === 'candidate' ? '捕捉为候选记忆，等待确认。' : '写入长期记忆。',
      at: memory.createdAt,
      kind: memory.status === 'candidate' ? 'candidate' : 'created',
    })

    if (Math.abs(new Date(memory.updatedAt).getTime() - new Date(memory.createdAt).getTime()) > 60_000) {
      items.push({
        id: `updated-${memory.id}`,
        memoryId: memory.id,
        title: memory.title,
        detail: `最近更新，当前权重 ${memory.priority}，可信度 ${Math.round(memory.confidence * 100)}%。`,
        at: memory.updatedAt,
        kind: 'updated',
      })
    }

    if (memory.lastAccessedAt) {
      items.push({
        id: `accessed-${memory.id}`,
        memoryId: memory.id,
        title: memory.title,
        detail: `聊天提示中累计调用 ${memory.accessCount} 次。`,
        at: memory.lastAccessedAt,
        kind: 'called',
      })
    }

    memory.revisions.slice(-2).forEach((revision) => {
      items.push({
        id: `revision-${memory.id}-${revision.id}`,
        memoryId: memory.id,
        title: memory.title,
        detail: `版本记录：${revision.reason}`,
        at: revision.createdAt,
        kind: 'updated',
      })
    })
  })

  usageLogs.slice(0, 10).forEach((log) => {
    items.push({
      id: `usage-${log.id}`,
      title: log.memoryIds.length > 0 ? '本轮聊天调用了长期记忆' : '本轮聊天只使用最近对话',
      detail:
        log.memoryIds.length > 0
          ? log.memoryIds
              .slice(0, 4)
              .map((id) => memoryTitleById.get(id) ?? '已删除记忆')
              .join(' / ')
          : '没有注入长期记忆。',
      at: log.createdAt,
      kind: 'called',
    })
  })

  memoryEvents.slice(0, 24).forEach((event) => {
    items.push({
      id: `event-${event.id}`,
      memoryId: event.memoryIds[0],
      title: event.title,
      detail: `${getMemoryEventTypeLabel(event.type)}：${event.detail}`,
      at: event.createdAt,
      kind: 'event',
    })
  })

  trash.memories.forEach((memory) => {
    items.push({
      id: `deleted-${memory.id}`,
      memoryId: memory.id,
      title: memory.title,
      detail: '移入回收花园，仍可恢复。',
      at: memory.deletedAt,
      kind: 'deleted',
    })
  })

  return items
    .filter((item) => !Number.isNaN(new Date(item.at).getTime()) && new Date(item.at).getTime() <= now.getTime() + 60_000)
    .sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())
    .slice(0, 12)
}

function isProtectedMemory(memory: LongTermMemory): boolean {
  if (memory.kind === 'taboo' || memory.kind === 'safety') return true
  if (memory.sensitivity === 'critical' || memory.sensitivity === 'high') return true
  if (memory.mentionPolicy === 'silent' || memory.mentionPolicy === 'explicit') return true
  return Boolean(memory.cooldownUntil && new Date(memory.cooldownUntil).getTime() > Date.now())
}

function dedupeReviewItems(items: MemoryReviewItem[]): MemoryReviewItem[] {
  const rank: Record<MemoryGuardianSeverity, number> = { danger: 0, warning: 1, info: 2 }
  const bestByMemory = new Map<string, MemoryReviewItem>()

  items.forEach((item) => {
    const previous = bestByMemory.get(item.memoryId)
    if (!previous || rank[item.severity] < rank[previous.severity]) {
      bestByMemory.set(item.memoryId, item)
    }
  })

  return [...bestByMemory.values()].sort((left, right) => rank[left.severity] - rank[right.severity])
}

function getHealthLabel(score: number): string {
  if (score >= 88) return '很稳'
  if (score >= 72) return '可用'
  if (score >= 54) return '待打理'
  return '需要姐姐清园'
}

function daysBetween(value: string, now: Date): number {
  const time = new Date(value).getTime()
  if (Number.isNaN(time)) return 999
  return (now.getTime() - time) / 86_400_000
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
