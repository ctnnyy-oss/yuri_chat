import type { CSSProperties } from 'react'
import type { AgentAction, AgentRunSummary, AgentToolStatus, CharacterCard, ChatMessage } from '../domain/types'
import type { MemoryFeedbackAction } from '../services/memoryFeedback'
import type { MessageMemoryTrace } from '../services/memoryTrace'

interface MessageBubbleProps {
  message: ChatMessage
  character: CharacterCard
  characters?: CharacterCard[]
  previousMessage: ChatMessage | null
  showDevTrace: boolean
  memoryTrace?: MessageMemoryTrace
  onMemoryFeedback?: (memoryId: string, action: MemoryFeedbackAction) => void
}

const TIME_GAP_MS = 5 * 60 * 1000

export function MessageBubble({
  memoryTrace,
  message,
  character,
  characters,
  previousMessage,
  showDevTrace,
  onMemoryFeedback,
}: MessageBubbleProps) {
  const content = formatDisplayText(message.content)
  const isUser = message.role === 'user'
  const assistantCharacter = !isUser && message.authorCharacterId
    ? characters?.find((item) => item.id === message.authorCharacterId)
    : undefined
  const assistantName = message.authorName ?? assistantCharacter?.name ?? character.name
  const assistantAvatar = message.authorAvatar ?? assistantCharacter?.avatar ?? character.avatar
  const assistantAccent = message.authorAccent ?? assistantCharacter?.accent ?? character.accent
  const isGroupAssistant = !isUser && Boolean(message.authorCharacterId || message.authorName)
  const showAvatar = getMessageIdentity(previousMessage, character) !== getMessageIdentity(message, character)
  const showTimeSeparator = shouldShowTimeSeparator(previousMessage, message)

  return (
    <>
      {showTimeSeparator && (
        <div className="chat-time-separator">
          {formatTimeSeparator(message.createdAt)}
        </div>
      )}
      <div className={`chat-row ${isUser ? 'chat-row-user' : 'chat-row-assistant'}`}>
        <span
          className="chat-row-avatar"
          style={{ '--avatar-accent': isUser ? 'var(--pink-400)' : assistantAccent, visibility: showAvatar ? 'visible' : 'hidden' } as CSSProperties}
        >
          {isUser ? '我' : assistantAvatar}
        </span>
        <article className={`message message-${message.role}`}>
          {isGroupAssistant && showAvatar && <strong className="message-author-name">{assistantName}</strong>}
          <p>{content}</p>
          {showDevTrace && message.agent && <AgentTrace trace={message.agent} />}
          {showDevTrace && memoryTrace && <MemoryTrace onMemoryFeedback={onMemoryFeedback} trace={memoryTrace} />}
        </article>
      </div>
    </>
  )
}

function getMessageIdentity(message: ChatMessage | null, character: CharacterCard): string {
  if (!message) return ''
  if (message.role === 'user') return 'user'
  return message.authorCharacterId ?? message.authorName ?? character.id
}

function shouldShowTimeSeparator(prev: ChatMessage | null, current: ChatMessage): boolean {
  if (!prev) return true
  const prevTime = new Date(prev.createdAt).getTime()
  const currTime = new Date(current.createdAt).getTime()
  return currTime - prevTime > TIME_GAP_MS
}

function formatTimeSeparator(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = date.toDateString() === yesterday.toDateString()

  const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(date)

  if (isToday) return time
  if (isYesterday) return `昨天 ${time}`
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
}

const toolStatusLabels: Record<AgentToolStatus, string> = {
  success: '已完成',
  needs_input: '需确认',
  error: '未完成',
}

function AgentTrace({ trace }: { trace: AgentRunSummary }) {
  const tools = trace.tools ?? []
  const coreTools = tools.filter((tool) => !isMetaTraceTool(tool.name))
  const metaTools = tools.filter((tool) => isMetaTraceTool(tool.name))
  const actions = trace.actions ?? []
  const visibleActions = actions.filter((action) => !action.requiresConfirmation)
  const pendingActions = actions.filter((action) => action.requiresConfirmation)
  const itemCount = tools.length + actions.length

  if (itemCount === 0) return null

  return (
    <details className="message-agent-trace">
      <summary>
        <span>Agent 做了 {itemCount} 件事</span>
        <small>{buildAgentSummary(coreTools.length, metaTools.length, visibleActions.length, pendingActions.length)}</small>
      </summary>
      {trace.decision && (
        <div className={`agent-decision-card agent-decision-${trace.decision.riskLevel}`}>
          <div>
            <strong>{trace.decision.intentLabel}</strong>
            <span>{trace.decision.workflow}</span>
          </div>
          <p>{trace.decision.memoryMode}</p>
          <small>下一步：{trace.decision.nextStep}</small>
        </div>
      )}
      {tools.length > 0 && (
        <div className="agent-trace-list">
          {tools.map((tool) => (
            <div
              className={`agent-trace-item agent-trace-${tool.status} ${isMetaTraceTool(tool.name) ? 'agent-trace-meta' : ''}`}
              key={tool.id}
            >
              <strong>{tool.title.replace('Agent 工具：', '')}</strong>
              <span>{toolStatusLabels[tool.status]}</span>
              <p>{tool.summary}</p>
              {tool.content && <small>{formatToolEvidence(tool.content)}</small>}
            </div>
          ))}
        </div>
      )}
      {actions.length > 0 && (
        <div className="agent-trace-list">
          {actions.map((action) => (
            <div className="agent-trace-item agent-action-item" key={action.id}>
              <strong>{action.title}</strong>
              <span>{action.requiresConfirmation ? '等待妹妹确认' : '已交给小窝处理'}</span>
              <p>{formatActionDetail(action)}</p>
            </div>
          ))}
        </div>
      )}
    </details>
  )
}

function buildAgentSummary(toolCount: number, metaToolCount: number, actionCount: number, pendingCount: number): string {
  const parts = []
  if (toolCount > 0) parts.push(`${toolCount} 个工具`)
  if (metaToolCount > 0) parts.push(`${metaToolCount} 个整理`)
  if (actionCount > 0) parts.push(`${actionCount} 个动作`)
  if (pendingCount > 0) parts.push(`${pendingCount} 个待确认`)
  return parts.join(' / ') || '普通聊天'
}

function isMetaTraceTool(name: string): boolean {
  return [
    'agent_brief',
    'capability_guide',
    'attachment_guide',
    'agent_continuity',
    'memory_bridge',
    'autonomy_budget',
    'risk_gate',
    'task_queue',
    'workflow_router',
    'persona_guard',
    'failure_recovery',
    'evidence_audit',
    'answer_composer',
    'deliverable_contract',
    'response_quality_gate',
    'agent_quality_check',
    'handoff_marker',
    'tool_governance',
  ].includes(name)
}

function formatActionDetail(action: AgentAction): string {
  return action.detail || action.sourceTool || action.type
}

function formatToolEvidence(content: string): string {
  if (looksLikeHtml(content)) return '后台接口暂时没有接通，已隐藏原始错误页面。'
  return content
    .replace(/\\u([\da-fA-F]{4})/g, (_, code: string) => String.fromCharCode(Number.parseInt(code, 16)))
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('工具 ') && !line.startsWith('回答时') && !line.startsWith('最终回复'))
    .slice(0, 3)
    .join(' / ')
    .slice(0, 220)
}

function formatDisplayText(content: string): string {
  if (looksLikeHtml(content)) return '后台接口暂时没有接通，刚才收到的是错误页面，姐姐已经拦下不展示原文。'
  if (!/\\u[\da-fA-F]{4}/.test(content)) return content

  return content
    .replace(/\\u([\da-fA-F]{4})/g, (_, code: string) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/\\n/g, '\n')
}

function looksLikeHtml(value: string): boolean {
  const sample = value.trim().slice(0, 240).toLowerCase()
  return sample.startsWith('<!doctype html') || sample.startsWith('<html') || sample.includes('<title>site not found')
}

const memoryFeedbackLabels: Record<MemoryFeedbackAction, string> = {
  cooldown: '冷却7天',
  contextual: '少用',
  explicit: '问起再提',
  sensitive: '标敏感',
  archive: '归档',
}

function MemoryTrace({
  onMemoryFeedback,
  trace,
}: {
  onMemoryFeedback?: (memoryId: string, action: MemoryFeedbackAction) => void
  trace: MessageMemoryTrace
}) {
  const usedMemoryText = trace.memoryCount > 0 ? `调用 ${trace.memoryCount} 条记忆` : '只用最近对话'

  return (
    <details className="message-memory-trace">
      <summary>
        <span>{usedMemoryText}</span>
        {trace.groupTitles.length > 0 && <small>{trace.groupTitles.join(' / ')}</small>}
      </summary>
      {trace.items.length === 0 ? (
        <p className="trace-empty">这条回复没有注入长期记忆。</p>
      ) : (
        <div className="trace-memory-list">
          {trace.items.map((item) => (
            <div className="trace-memory-item" key={item.id}>
              <strong>{item.title}</strong>
              <span>{item.meta}</span>
              <p>{item.body}</p>
              {onMemoryFeedback && (
                <div aria-label="记忆反馈" className="trace-feedback-row">
                  {item.enabledActions.length > 0 ? (
                    item.enabledActions.map((action) => (
                      <button key={action} onClick={() => onMemoryFeedback(item.id, action)} type="button">
                        {memoryFeedbackLabels[action]}
                      </button>
                    ))
                  ) : (
                    <small>{item.status === 'archived' ? '已归档' : '已按保守方式使用'}</small>
                  )}
                </div>
              )}
            </div>
          ))}
          {trace.missingCount > 0 && <small>另有 {trace.missingCount} 条记忆已被删除或归档。</small>}
        </div>
      )}
    </details>
  )
}
