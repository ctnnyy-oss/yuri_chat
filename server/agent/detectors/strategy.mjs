// Agent 编排策略：风控、流程路由、失败恢复、交接、任务队列、交付契约、回复质检

import { truncateToolText, isMetaToolName, getAgentToolLabel } from '../utils.mjs'
import {
  shouldUseContinuationDriverTool,
  shouldUseDateMathTool,
  shouldUseDeepResearchTool,
  shouldUseSearchTool,
  shouldUseWebPageTool,
} from '../toolDetectors.mjs'
import { analyzeAgentIntent } from './intent.mjs'

export function inferRiskGateRisks(text, agent) {
  const risks = []

  if (/删除|清空|覆盖|重置|回滚|撤销/.test(text)) {
    risks.push({
      label: '不可逆文件/数据操作',
      detail: '可能造成数据丢失，不能在用户没有明确确认目标和范围时执行。',
      question: '妹妹确认要动哪个明确对象，以及是否已经备份？',
      blocking: true,
    })
  }

  if (/发布|上线|推送|commit|提交|push|部署/.test(text)) {
    risks.push({
      label: '发布/提交操作',
      detail: '会影响仓库或线上结果，需要确认范围、验证和是否要提交。',
      question: '妹妹确认要现在提交或发布这一批改动吗？',
      blocking: true,
    })
  }

  if (/付费|购买|付款|订阅|开会员/.test(text)) {
    risks.push({
      label: '付费操作',
      detail: '涉及花钱，助手只能提供建议，不能擅自替用户购买。',
      question: '妹妹确认预算和购买对象后，姐姐才能继续给具体步骤。',
      blocking: true,
    })
  }

  if (/账号|密码|token|密钥|api key|API key|身份证|真名|隐私|敏感/.test(text)) {
    risks.push({
      label: '账号/密钥/隐私',
      detail: '涉及私人信息或凭证，回复时应避免暴露、复述或写入不安全位置。',
      question: '妹妹确认是否要处理这类敏感信息，以及只在本地安全位置操作？',
      blocking: true,
    })
  }

  if (agent.tools.some((tool) => tool.name === 'safety_guard')) {
    risks.push({
      label: '现实高风险建议',
      detail: '医疗、法律、金融或心理安全问题只能给一般信息、风险信号和专业求助方向。',
      question: '',
      blocking: false,
    })
  }

  for (const action of agent.actions.filter((item) => item.requiresConfirmation)) {
    risks.push({
      label: `${action.title}待确认`,
      detail: action.detail || '动作缺少关键信息，不能擅自完成。',
      question: `妹妹补一下「${action.title}」需要的关键信息。`,
      blocking: true,
    })
  }

  return risks
}

export function inferWorkflowRoute(text, agent) {
  if (agent.tools.some((tool) => tool.name === 'risk_gate' && tool.status === 'needs_input')) {
    return {
      label: '风险确认工作流',
      reason: '本轮涉及删除、发布、付费、隐私或待确认动作。',
      priority: '先拦截风险，再问一个关键确认。',
      output: '风险说明 + 一个确认问题 + 暂不执行',
      avoid: '不要擅自删除、发布、付款或暴露敏感信息。',
    }
  }

  if (agent.tools.some((tool) => ['web_search', 'web_research', 'web_page'].includes(tool.name))) {
    return {
      label: '资料研究工作流',
      reason: '本轮需要搜索、网页摘录或来源依据。',
      priority: '先给结论，再说明来源范围和不确定性。',
      output: '结论 + 依据摘要 + 来源限制 + 下一步',
      avoid: '不要声称读完未读取的全文，不要把搜索摘要当权威结论。',
    }
  }

  if (agent.tools.some((tool) => ['calculator', 'unit_converter', 'date_math', 'text_inspector', 'weather', 'current_time'].includes(tool.name))) {
    return {
      label: '精确结果工作流',
      reason: '本轮有时间、天气、计算、换算或文本统计工具。',
      priority: '直接给工具结果，必要时补一行依据。',
      output: '短结论 + 工具依据 + 注意事项',
      avoid: '不要重新心算或凭记忆改写工具结果。',
    }
  }

  if (agent.tools.some((tool) => ['continuation_driver', 'task_queue', 'autonomy_budget', 'agent_continuity'].includes(tool.name))) {
    return {
      label: '长冲刺执行工作流',
      reason: '用户要求继续、自主推进或减少“继续”频率。',
      priority: '完成一个可验证切片并说明验证结果。',
      output: '已完成 + 验证 + 下一层交接',
      avoid: '不要以“要不要继续”结尾，不要在能推进时停在计划。',
    }
  }

  if (agent.tools.some((tool) => tool.name === 'memory_bridge')) {
    return {
      label: '记忆协同工作流',
      reason: '本轮涉及长期记忆、设定、偏好或候选写入。',
      priority: '当前表达优先，谨慎提及敏感记忆。',
      output: '自然承接 + 是否写入/使用记忆 + 下一步',
      avoid: '不要炫耀记忆，不要把一次性闲聊写成永久偏好。',
    }
  }

  if (/写|百合|剧情|人设|设定|创作|小说|CP|cp/.test(text)) {
    return {
      label: '创作陪伴工作流',
      reason: '本轮是百合创作或设定协助。',
      priority: '围绕 CP、情绪逻辑、百合浓度和自然中文给产出。',
      output: '可直接使用的文本/方案 + 简短说明',
      avoid: '不要让男性抢情感主线，不要堆 AI 味模板。',
    }
  }

  return {
    label: '自然陪伴工作流',
    reason: '本轮不需要强工具流程，重点是自然接话。',
    priority: '先接住情绪，再给轻量下一步。',
    output: '温柔回应 + 一个可执行下一步',
    avoid: '不要机械列工具，不要客服腔。',
  }
}

export function buildRecoveryLineForTool(tool, status) {
  const label = getAgentToolLabel(tool)
  if (tool.name === 'weather') return `- ${label}：缺地点或天气接口失败时，先问城市；如果用户只要大概建议，就按季节给非实时提醒。`
  if (tool.name === 'web_search' || tool.name === 'web_research') {
    return `- ${label}：搜索/读取失败时，说明搜索范围有限；建议换关键词、提供 URL，或先基于已读摘要给临时结论。`
  }
  if (tool.name === 'web_page') return `- ${label}：网页读取失败时，请用户换公开链接或粘贴正文；不要声称读完。`
  if (tool.name === 'calculator') return `- ${label}：算式不完整时让用户给数字和运算符；不要心算猜测。`
  if (tool.name === 'unit_converter') return `- ${label}：单位不清楚时说明支持范围，并让用户补目标单位。`
  if (tool.name === 'date_math') return `- ${label}：日期不完整时要求绝对日期或相对天数；不要猜月份年份。`
  if (tool.name === 'text_inspector') return `- ${label}：正文缺失时让用户粘贴文本；不要根据问题本身统计。`
  if (tool.name === 'safety_guard') return `- ${label}：高风险问题必须保守回答，给一般信息和现实求助信号。`
  return `- ${label}：${status === 'error' ? '这次失败，需要如实说明并提供替代路径。' : '缺少输入，需要只问一个关键问题。'}`
}

export function inferHandoffNextStep(agent, text) {
  const blockedTool = agent.tools.find((tool) => !isMetaToolName(tool.name) && tool.status === 'needs_input')
  if (blockedTool) return `补齐「${getAgentToolLabel(blockedTool)}」需要的关键信息。`

  const failedTool = agent.tools.find((tool) => !isMetaToolName(tool.name) && tool.status === 'error')
  if (failedTool) return `换一个保守方案处理「${getAgentToolLabel(failedTool)}」，并诚实说明失败范围。`

  if (agent.actions.some((action) => action.requiresConfirmation)) return '先确认待执行动作，再继续落地。'
  if (agent.tools.some((tool) => tool.name === 'web_research')) return '基于已读取摘录整理结论，并标出来源限制。'
  if (agent.tools.some((tool) => tool.name === 'safety_guard')) return '按安全边界给一般建议、警示信号和现实求助方向。'
  if (agent.tools.some((tool) => ['calculator', 'unit_converter', 'date_math', 'text_inspector'].includes(tool.name))) return '直接给工具结果，必要时补一行依据。'
  if (agent.tools.some((tool) => tool.name === 'memory_bridge')) return '按当前表达优先，谨慎使用或写入记忆。'
  if (shouldUseContinuationDriverTool(text)) return '继续完成下一层可验证能力，不把非阻塞选择推回给用户。'
  if (agent.actions.length > 0) return '自然告知已交给应用处理的动作，并说明结果位置。'
  return '按本轮目标给清晰结论和下一步。'
}

export function buildAgentTaskQueue(text, agent, previousAgentRun) {
  const goal = inferTaskQueueGoal(text, previousAgentRun)
  const items = []

  if (agent.tools.some((tool) => tool.name === 'risk_gate')) {
    const riskGate = agent.tools.find((tool) => tool.name === 'risk_gate')
    items.push({
      status: riskGate.status === 'needs_input' ? 'blocked' : 'done',
      title: '先过风险闸门',
      acceptance: riskGate.status === 'needs_input' ? '确认不可逆/发布/隐私等风险后再执行' : '确认本轮没有必须暂停的风险',
    })
  }

  if (agent.tools.some((tool) => tool.name === 'agent_continuity')) {
    items.push({
      status: 'done',
      title: '接上上一轮任务',
      acceptance: '识别上一轮工具、动作、交接摘要和遗留阻塞项',
    })
  }

  if (agent.tools.some((tool) => tool.name === 'memory_bridge')) {
    items.push({
      status: 'done',
      title: '同步记忆边界',
      acceptance: '区分可用记忆、敏感记忆、候选写入和当前表达优先级',
    })
  }

  if (agent.tools.some((tool) => ['web_search', 'web_research', 'web_page', 'weather', 'calculator', 'unit_converter', 'date_math', 'text_inspector'].includes(tool.name))) {
    items.push({
      status: 'done',
      title: '获取事实依据',
      acceptance: '工具结果进入上下文，失败或范围有限时明确标注',
    })
  }

  if (agent.tools.some((tool) => tool.name === 'failure_recovery')) {
    items.push({
      status: 'queued',
      title: '执行失败恢复',
      acceptance: '缺输入只问一个关键问题，失败工具不编造结果',
    })
  }

  items.push({
    status: 'queued',
    title: '综合回复并留下交接',
    acceptance: '给结论、依据、下一步；若用户再说继续，能直接接力',
  })

  const uniqueItems = dedupeQueueItems(items).slice(0, 6)
  const blocked = uniqueItems.find((item) => item.status === 'blocked')
  const queued = uniqueItems.find((item) => item.status === 'queued')

  return {
    goal,
    phase: blocked ? '等待关键确认' : previousAgentRun ? '多轮接力推进' : '本轮自主推进',
    items: uniqueItems,
    next: blocked?.title || queued?.title || '按结论继续下一层',
    stop: blocked
      ? blocked.acceptance
      : '只有破坏性操作、真实账号/付费/发布、隐私凭证或产品方向重大取舍才暂停。',
  }
}

export function inferTaskQueueGoal(text, previousAgentRun) {
  const handoff = previousAgentRun?.agent?.tools?.find?.((tool) => tool.name === 'handoff_marker')
  if (/继续|接着|老规矩|照着|按这个/.test(text) && handoff?.summary) return handoff.summary
  if (/agent|Agent|能力|功能|max|MAX|拉满/.test(text)) return '把 Agent 能力推进到更完整的持续办事状态'
  if (/记忆/.test(text)) return '在当前记忆边界内稳定推进'
  return truncateToolText(text, 120) || '完成用户本轮请求'
}

export function dedupeQueueItems(items) {
  const seen = new Set()
  return items.filter((item) => {
    if (seen.has(item.title)) return false
    seen.add(item.title)
    return true
  })
}

export function buildDeliverableContract(text, agent) {
  const hasBlocker = agent.tools.some((tool) => tool.status === 'needs_input') || agent.actions.some((action) => action.requiresConfirmation)
  const hasEvidence = agent.tools.some((tool) => tool.name === 'evidence_audit')
  const hasQueue = agent.tools.some((tool) => tool.name === 'task_queue')
  const hasRisk = agent.tools.some((tool) => tool.name === 'risk_gate')
  const hasAction = agent.actions.length > 0
  const isCreative = /写|百合|剧情|人设|设定|创作|小说|CP|cp/.test(text)

  if (hasBlocker || hasRisk) {
    return {
      type: '安全收口',
      must: ['说明当前能做什么和不能擅自做什么', '只问一个真正阻塞的确认问题'],
      optional: hasEvidence ? ['补充已有依据和限制'] : [],
      acceptance: ['不执行高风险动作', '不编造失败工具结果', '用户能明确知道下一步要补什么'],
    }
  }

  if (hasQueue) {
    return {
      type: '长任务交付',
      must: ['说明本轮已完成的能力层', '列出验证结果', '留下下一轮可接力方向'],
      optional: ['简短说明仍未做的云端/系统级能力边界'],
      acceptance: ['用户不需要立刻再问“然后呢”', '下一轮“继续”能接上'],
    }
  }

  if (hasEvidence) {
    return {
      type: '事实结论',
      must: ['先给结论', '说明工具依据或来源范围', '标出不确定性'],
      optional: ['给进一步查证建议'],
      acceptance: ['数字/日期/搜索结果与工具一致', '不把有限搜索说成绝对事实'],
    }
  }

  if (hasAction) {
    return {
      type: '动作结果',
      must: ['说明已交给应用处理的动作', '说明用户能在哪里看到变化'],
      optional: ['提示待确认动作'],
      acceptance: ['不声称完成未完成动作', '结果和 action payload 一致'],
    }
  }

  if (isCreative) {
    return {
      type: '创作产出',
      must: ['给可直接使用的文本或方案', '守住百合关系核心'],
      optional: ['简短说明改动逻辑'],
      acceptance: ['不是只给空泛建议', '没有男主抢戏或伪百合方向'],
    }
  }

  return {
    type: '陪伴答复',
    must: ['先接住用户的话', '给一个明确下一步'],
    optional: ['如果用户累了，减少追问'],
    acceptance: ['语气自然', '没有无意义长篇解释'],
  }
}

export function buildResponseQualityChecks(text, agent) {
  const checks = []
  const hasWaiting = agent.tools.some((tool) => tool.status === 'needs_input') || agent.actions.some((action) => action.requiresConfirmation)
  const hasFailure = agent.tools.some((tool) => tool.status === 'error')
  const hasDefault = agent.tools.some((tool) => tool.name === 'default_policy' || tool.name === 'autonomy_budget')
  const hasEvidenceIntent =
    shouldUseSearchTool(text) ||
    shouldUseDeepResearchTool(text) ||
    shouldUseWebPageTool(text) ||
    shouldUseDateMathTool(text) ||
    /天气|几点|日期|多少|换算|字数|统计|证据|来源|引用/.test(text)
  const hasEvidence = agent.tools.some((tool) => tool.name === 'evidence_audit')
  const hasRiskBlock = agent.tools.some((tool) => tool.name === 'risk_gate' && tool.status === 'needs_input')

  checks.push({
    label: '直接结论',
    status: hasWaiting ? 'warn' : 'ok',
    detail: hasWaiting ? '存在待确认项，先说明卡点再问一个问题。' : '可以先给结果或进度，不必先铺垫。',
  })

  checks.push({
    label: '证据一致',
    status: hasEvidenceIntent && !hasEvidence ? 'warn' : 'ok',
    detail: hasEvidenceIntent && !hasEvidence ? '事实型请求缺少证据校验，回复要标不确定。' : '事实型结果已有工具或不需要事实依据。',
  })

  checks.push({
    label: '失败诚实',
    status: hasFailure ? 'warn' : 'ok',
    detail: hasFailure ? '有失败工具，必须说明失败范围和替代路径。' : '没有失败工具需要额外说明。',
  })

  checks.push({
    label: '风险暂停',
    status: hasRiskBlock ? 'warn' : 'ok',
    detail: hasRiskBlock ? '风险闸门阻塞，不能擅自执行。' : '没有阻塞级风险。',
  })

  checks.push({
    label: '少追问',
    status: hasDefault && /要不要|是否继续|你想|你要/.test(text) ? 'warn' : 'ok',
    detail: hasDefault ? '用户授权默认推进，最终回复不要用“要不要继续”收尾。' : '可按普通对话处理追问。',
  })

  checks.push({
    label: '角色语气',
    status: 'ok',
    detail: /qaq|QAQ|妹妹|姐姐/.test(text) ? '保留亲近、温柔、靠谱的姐姐语气。' : '保持自然简体中文和陪伴感。',
  })

  return checks
}

export function buildAgentDecisionSummary(text, agent, contextBlocks = []) {
  const intent = analyzeAgentIntent(text)
  const workflow = inferWorkflowRoute(text, agent)
  const risks = inferRiskGateRisks(text, agent)
  const blockingRisk = risks.some((risk) => risk.blocking)
  const memoryCategories = new Set(['boundary', 'stable', 'relationship', 'project', 'event', 'world'])
  const memoryContextCount = contextBlocks.filter(
    (block) => memoryCategories.has(block?.category) || /记忆|memory/i.test(block?.title || ''),
  ).length
  const memoryMode = inferDecisionMemoryMode(text, agent, memoryContextCount)

  return {
    intentLabel: intent.label,
    confidence: intent.confidence,
    workflow: workflow.label,
    riskLevel: blockingRisk ? 'high' : risks.length > 0 ? 'medium' : 'low',
    memoryMode,
    selectedTools: agent.tools.map((tool) => tool.name),
    selectedActions: agent.actions.map((action) => action.type),
    nextStep: inferHandoffNextStep(agent, text),
  }
}

function inferDecisionMemoryMode(text, agent, memoryContextCount) {
  if (agent.actions.some((action) => action.type === 'memory_candidate_create')) return '候选写入，等待审核'
  if (agent.tools.some((tool) => tool.name === 'memory_bridge')) {
    return memoryContextCount > 0 ? '检索可见记忆，当前表达优先' : '识别记忆意图，谨慎写入'
  }
  if (/记忆|记住|偏好|设定|长期记忆|记忆系统/.test(text)) return '记忆相关，但不自动沉淀'
  return memoryContextCount > 0 ? '使用上下文记忆' : '只用最近对话'
}
