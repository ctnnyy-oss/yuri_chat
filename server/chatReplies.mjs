import { truncateToolText } from './agent/utils.mjs'

const DEMO_META_AGENT_REASONS = new Set([
  'agent_brief',
  'capability_guide',
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
])

export function createDemoReply(bundle, appName = 'Yuri Chat') {
  const lastUserMessage = [...bundle.messages].reverse().find((message) => message.role === 'user')
  const characterName = bundle.characterName || appName
  const agentBlocks = bundle.contextBlocks.filter((block) => block.title?.startsWith('Agent '))
  const visibleAgentBlocks = agentBlocks.filter((block) => !DEMO_META_AGENT_REASONS.has(block.reason))
  const memoryHint = bundle.contextBlocks
    .filter((block) => !block.title?.startsWith('Agent '))
    .map((block) => block.title)
    .slice(0, 2)
    .join(' / ')

  if (agentBlocks.length > 0) {
    return [
      `妹妹，${characterName}在。现在还只是本地演示回复，但本地工具已经先把能看的部分处理好了：`,
      ...(visibleAgentBlocks.length > 0 ? visibleAgentBlocks : agentBlocks)
        .slice(0, 4)
        .map((block) => `${cleanDemoAgentTitle(block.title)}：${extractDemoAgentLine(block.content)}`),
      '等模型页保存一组能用的模型后，姐姐会把这些结果自然揉进角色回复里，不会像报告一样硬邦邦地甩出来。',
    ].join('\n\n')
  }

  const userText = truncateToolText(lastUserMessage?.content ?? 'hello', 120)
  const memoryLine = memoryHint ? `这轮已经准备好的上下文：${memoryHint}。` : '这轮暂时没有额外命中长期记忆。'

  return [
    `妹妹，${characterName}在。刚才那句姐姐接到了：${userText}`,
    `${memoryLine}现在还没接上可用模型，所以这只是本地兜底回复；聊天、记忆和页面状态都没有丢。`,
    '去模型页保存一组 Base URL、API Key 和模型名后，姐姐就能按当前角色和记忆认真陪妹妹聊。',
  ].join('\n\n')
}

export function createProviderFallbackReply(error, agent) {
  const actionCount = Array.isArray(agent?.actions) ? agent.actions.filter((action) => !action.requiresConfirmation).length : 0
  const tools = Array.isArray(agent?.tools) ? agent.tools : []
  const toolCount = tools.filter((tool) => !DEMO_META_AGENT_REASONS.has(tool.name)).length
  const reason = formatFallbackReason(error instanceof Error ? error.message : '模型供应商暂时没有接住请求')
  const usefulToolLines = buildProviderFallbackToolLines(tools)

  return [
    usefulToolLines.length > 0
      ? '妹妹，刚才不是姐姐不回你，是这组模型没有接住请求；本地 Agent 已经先把能办的部分做完了。'
      : '妹妹，刚才不是姐姐不回你，是这组模型没有接住请求；本地聊天、记忆和页面状态都没有丢。',
    ...usefulToolLines,
    actionCount > 0 ? `姐姐已经把 ${actionCount} 个可执行动作交给网页处理。` : '',
    usefulToolLines.length === 0 && toolCount > 0 ? `这轮后台工具已执行 ${toolCount} 项，等模型恢复后就能自然回答。` : '',
    `模型提示：${reason}`,
    '可以先去模型页换一组配置，或者补好余额/额度后再发一次。',
  ]
    .filter(Boolean)
    .join('\n\n')
}

function cleanDemoAgentTitle(title) {
  return String(title || '').replace(/^Agent (工具|动作)：/, '')
}

function extractDemoAgentLine(content) {
  const lines = String(content || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^工具 .*已执行。$/.test(line))
    .filter((line) => !/^回答时|^请|^前端收到|^当前|^你可以/.test(line))

  return lines[0]?.slice(0, 220) || '工具已运行，但没有返回可展示摘要。'
}

function formatFallbackReason(message) {
  const text = String(message || '').trim()
  if (/insufficient\s*balance|余额|额度|欠费|quota|credit/i.test(text)) {
    return '当前模型额度或余额不足。'
  }
  if (/invalid[_ -]?model|model.+not.+valid|model.+not.+found|不接受这个模型名/i.test(text)) {
    return '当前模型名不被供应商接受。'
  }
  if (/密钥|api key|apikey|unauthorized|forbidden|401|403/i.test(text)) {
    return '当前 API Key 没通过，可能是密钥、权限或平台配置不对。'
  }
  return text || '模型供应商暂时没有接住请求。'
}

function buildProviderFallbackToolLines(tools) {
  return tools
    .filter((tool) => tool?.name && !DEMO_META_AGENT_REASONS.has(tool.name))
    .slice(0, 4)
    .map((tool) => {
      const label = String(tool.title || tool.name).replace(/^Agent 工具：/, '')
      const summary = String(tool.summary || '').trim()
      if (!summary) return ''
      if (tool.status === 'success') return `${label}：${summary}`
      if (tool.status === 'needs_input') return `${label}：还缺关键信息，${summary}`
      return `${label}：这次没查成，${summary}`
    })
    .filter(Boolean)
}
