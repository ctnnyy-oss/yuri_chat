// 工具识别器：判断用户消息是否需要触发某个 Agent 工具

import { extractWeatherLocation, isFictionalWeatherLocation } from './detectors/queryParsers.mjs'
import { hasUrl } from './utils.mjs'

const WEATHER_TRIGGER_PATTERN = /天气|下雨|下雪|气温|温度|冷不冷|热不热|降雨|降水|雨伞|带伞|台风|空气质量/
const REAL_WEATHER_HINT_PATTERN =
  /查|看看|看下|搜|问问|想知道|真实|现实|当地|我这里|这边|那边|今天|明天|后天|现在|出门|通勤|上班|上学|学校|带伞|雨伞|天气预报|空气质量|台风/
const ROLEPLAY_WEATHER_CONTEXT_PATTERN =
  /旧书店|旧书馆|书店|店里|阁楼|窗外|房间|宿舍|教室|学院|书院|仙门|宗门|魔法学院|城堡|花园|小窝|梦里|文里|故事里|剧情里|场景里|你那里|你那边/

export function shouldUseTimeTool(text) {
  return /几点|当前时间|现在(?:几点|是什么时间|时间)|日期|今天(?:是)?(?:几号|周几|星期几)|明天(?:是)?(?:几号|周几|星期几)|后天(?:是)?(?:几号|周几|星期几)|昨天(?:是)?(?:几号|周几|星期几)|星期几|周几|刚刚(?:几点|多久)|一会儿/.test(text)
}

export function shouldUseDateMathTool(text) {
  return /(\d{1,4})\s*(天|日|周|星期|个月|月|年)\s*(后|前)|到\s*(今年|明年)?\s*\d{1,2}\s*[月/-]\s*\d{1,2}\s*[日号]?还有几天|距离\s*(今年|明年)?\s*\d{1,2}\s*[月/-]\s*\d{1,2}\s*[日号]?(?:还有)?(?:多少|几)天|倒计时/.test(
    text,
  )
}

export function shouldUseWeatherTool(text) {
  if (!WEATHER_TRIGGER_PATTERN.test(text)) return false

  const location = extractWeatherLocation(text)
  if (location && !isFictionalWeatherLocation(location)) return true
  if (ROLEPLAY_WEATHER_CONTEXT_PATTERN.test(text)) return false

  return REAL_WEATHER_HINT_PATTERN.test(text)
}

export function shouldUseSearchTool(text) {
  if (hasUrl(text)) return false
  const searchText = text.replace(
    /(?:不要|不用|无需|无须|不必|别|先别|禁止|别去|别再|不要再|先不用|无需再).{0,8}(?:联网|上网|搜索|搜一下|搜搜|查找|查询|查资料|查网页|查网络|查官网|查官方)/g,
    '',
  )
  const explicitSearch = /搜索|搜一下|搜搜|查找|查询|帮我查|帮我搜|研究|网上|联网|资料|文档|官方|官网|教程|百科|新闻|热搜|最新|近况|榜单|价格|评测|推荐|谁是|是什么|有哪些|哪里买|怎么买/.test(searchText)
  const plainLookup = /(^|[^检])(?:查一下|查查)/.test(searchText)
  return explicitSearch || plainLookup
}

export function shouldUseDeepResearchTool(text) {
  if (hasUrl(text)) return false
  return shouldUseSearchTool(text) && /研究|深入|详细|总结|整理|对比|比较|评估|分析|推荐|攻略|教程|文档|官方|资料|来源|证据|引用|报告/.test(text)
}

export function shouldUseCalculatorTool(text) {
  return /计算|算一下|帮我算|等于多少|多少钱|平方|开方|\d+(?:\.\d+)?\s*[+\-*/×xX÷^%]\s*\d|\d+(?:\.\d+)?\s*(?:加上|加|减去|减|乘以|乘|除以|除)\s*\d+(?:\.\d+)?/.test(
    text,
  )
}

export function shouldUseUnitConverterTool(text) {
  return /换算|转换|是多少|等于多少|多少(斤|公斤|千克|kg|KG|克|g|米|厘米|cm|CM|公里|千米|km|KM|英里|磅|ml|毫升|升|L|度|华氏)|\d+(?:\.\d+)?\s*(斤|公斤|千克|kg|KG|克|g|米|厘米|cm|CM|公里|千米|km|KM|英里|磅|ml|毫升|升|L|℃|°C|华氏|℉)/.test(
    text,
  )
}

export function shouldUseTextInspectorTool(text) {
  return /字数|多少字|几个字|统计字|统计一下|文本统计|这段文字|这段话|稿子多长|有多长|多少段|多少行/.test(text)
}

export function shouldUseSafetyGuardTool(text) {
  return /药|药物|用药|剂量|症状|疼|痛|发烧|感染|清洁|私处|包茎|抑郁|自残|法律|合同|起诉|违法|投资|股票|基金|加密货币|贷款|保险|诊断|治疗/.test(
    text,
  )
}

export function shouldUseConversationTool(text) {
  return /总结|摘要|整理|复盘|待办|下一步|计划|安排|检查|设定|世界观|矛盾|角色|记忆|梳理|归纳/.test(text)
}

export function shouldUseCapabilityGuide(text) {
  return /agent|Agent|智能体|LLM|llm|大语言模型|大预言模型|词语接龙|工具|功能|能做|全能|智能化|联网|文件|除了聊天|不只是聊天|只能聊天|动作识别|工具路由|工具调用|Agent 检测|手脚/.test(
    text,
  )
}

export function shouldUseAttachmentGuideTool(text) {
  return /看图|看图片|图片|截图|照片|拍照|视觉|文档|文件|附件|上传|PDF|pdf|docx|Word|表格|xlsx|Excel|读取文件|看文件|看文档/.test(text)
}

export function shouldUseExternalSearchGuide(text) {
  return /新闻|热搜|搜索|搜搜|查网页|网上|最新|今天有什么|趣事|浏览器|百度|谷歌|Google|Bing/.test(text) && !hasUrl(text)
}

export function shouldUseWebPageTool(text) {
  return hasUrl(text) && /看看|总结|网页|链接|这篇|这个|内容|读一下|讲讲|帮我看/.test(text)
}

export function shouldUseAgentContinuityTool(text, previousAgentRun) {
  if (!previousAgentRun) return false
  return /继续|接着|刚才|前面|上一轮|上次|然后|下一步|再来|照着|按这个|别停|搞完|做完|长冲刺|少.*继续|减少.*继续/.test(
    text,
  )
}

export function shouldUseAutonomyBudgetTool(text, previousAgentRun) {
  return Boolean(previousAgentRun) || /老规矩|继续|接着|一次性|一口气|尽可能|搞完|做完|做到|max|MAX|拉满|不用问|少问|别问|姐姐决定|姐姐看着办|都听姐姐|妹妹不懂|自驱|自动推进|长冲刺|直至|直到/.test(text)
}

export function shouldUseTaskPlannerTool(text) {
  return /计划|规划|路线|步骤|流程|下一步|优先级|怎么做|怎么办|拆解|安排|方案|工作流|里程碑|复盘|全方位|加强|优化|升级|更新|完善|开发|迭代|一次性|一口气|搞完|做完|长冲刺/.test(
    text,
  )
}

export function shouldUseActionChecklistTool(text) {
  return /一一实现|逐步实现|拉满|max|MAX|全方位|继续加强|单点突破|做到最好|直接做|帮我做|实现|落地|执行|推进|开工|加油|升级|更新|完善|开发|迭代|一次性|一口气|搞完|做完|长冲刺|减少.*继续|少.*继续/.test(
    text,
  )
}

export function shouldUseClarificationTool(text, agent) {
  if (agent.tools.length > 2 || agent.actions.length > 0) return false
  return /不太清楚|不确定|不知道|不明白|什么意思|怎么理解|帮我看看|帮我想想|你觉得|你看呢|你说呢|姐姐觉得|姐姐看|随便|都行|都可以/.test(
    text,
  )
}

export function shouldUseMemoryBridgeTool(text, contextBlocks, agent) {
  if (agent.tools.some((tool) => tool.name === 'memory_bridge')) return false
  return (
    (contextBlocks && contextBlocks.length > 0) ||
    /记忆|记住|以后|偏好|喜欢|不喜欢|规则|习惯|设定|世界观|角色|关系/.test(text)
  )
}

export function shouldUseRiskGateTool(text, agent) {
  if (agent.tools.some((tool) => tool.name === 'safety_guard')) return true
  if (/删除|清空|永久删除|发布|上线|部署|付费|购买|密钥|token|密码|身份证|真名|隐私|私密/.test(text)) return true
  if (agent.actions.length === 0) return false
  return agent.actions.some((action) =>
    ['character_profile_update', 'memory_candidate_create', 'task_create'].includes(action.type),
  )
}

export function shouldUseWorkflowRouterTool(text, agent) {
  return agent.tools.length > 3 ||
    agent.actions.length > 1 ||
    /全方位|一次性|一口气|搞完|做完|长冲刺|拉满|max|MAX|百合|剧情|写|方案/.test(text)
}

export function shouldUsePersonaGuardTool(text, agent) {
  return agent.tools.some((tool) => ['safety_guard', 'risk_gate', 'workflow_router', 'autonomy_budget'].includes(tool.name)) ||
    /角色|人设|性格|语气|口吻|说话方式|风格/.test(text)
}

export function shouldUseDefaultPolicyTool(text) {
  return /默认|兜底|保底|没有|不知道|不确定|不清楚|不明白|不懂|都听姐姐|姐姐决定|姐姐看着办/.test(text)
}

export function shouldUseContinuationDriverTool(text) {
  return /继续|接着|然后|下一步|再来|别停|搞完|做完|长冲刺|少.*继续|减少.*继续|一次性|一口气/.test(
    text,
  )
}

export function shouldUseAnswerComposerTool(agent) {
  return agent.tools.length > 2 || agent.actions.length > 0
}

export function shouldUseFailureRecoveryTool(agent) {
  return agent.tools.some((tool) => tool.status === 'error' || tool.status === 'needs_input')
}

export function shouldUseTaskQueueTool(text, agent, previousAgentRun) {
  if (previousAgentRun?.actions?.length > 0) return true
  return agent.actions.some((action) => action.type === 'task_create') ||
    /任务|队列|后台|定时|持续|监控|巡检|自动|继续|一次性|一口气|搞完|做完|拉满|max|MAX|能力/.test(text)
}

export function shouldUseEvidenceAuditTool(text, agent) {
  return agent.tools.some((tool) =>
    ['web_search', 'web_research', 'web_page', 'weather', 'calculator', 'unit_converter'].includes(tool.name),
  )
}

export function shouldUseDeliverableContractTool(text, agent) {
  return agent.tools.length > 3 ||
    agent.actions.length > 1 ||
    agent.tools.some((tool) =>
      ['safety_guard', 'risk_gate', 'task_queue', 'workflow_router', 'task_planner'].includes(tool.name),
    )
}

export function shouldUseResponseQualityGateTool(_text, agent) {
  if (agent.actions.length > 0) return true
  return agent.tools.some((tool) =>
    ['agent_continuity', 'web_research', 'web_search', 'safety_guard', 'memory_bridge', 'task_planner', 'failure_recovery', 'task_queue', 'risk_gate'].includes(tool.name),
  )
}

export function shouldUseToolGovernanceTool(agent) {
  return agent.actions.length > 0 || agent.tools.some((tool) => !['agent_brief', 'tool_governance'].includes(tool.name))
}

export function shouldUseAgentBrief(text, agent) {
  if (agent.tools.length > 0 || agent.actions.length > 0) return true
  return /帮我|姐姐|怎么办|怎么做|为什么|对比|推荐|分析|评估|检查|规划|计划|优化|加强|全方位|agent|Agent|能力|功能|记忆|搜索|查|算|提醒|整理|复盘/.test(
    text,
  )
}

export function shouldUseAgentQualityCheckTool(text, agent) {
  if (agent.tools.length > 0 || agent.actions.length > 0) return true
  return /agent|Agent|智能体|能力|功能|工具|动作识别|工具路由|工具调用|优化|升级|更新|完善|加强|拉满|全方位|继续/.test(text)
}

export function shouldUseHandoffMarkerTool(text, agent) {
  if (shouldUseContinuationDriverTool(text) || shouldUseActionChecklistTool(text)) return true
  if (agent.actions.length > 0) return true
  return agent.tools.some((tool) =>
    ['agent_continuity', 'web_research', 'web_search', 'safety_guard', 'memory_bridge', 'task_planner', 'failure_recovery', 'task_queue', 'risk_gate'].includes(tool.name),
  )
}
