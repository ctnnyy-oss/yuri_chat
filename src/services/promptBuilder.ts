import type { AppState, ChatMessage, MemoryUsageLog, PromptBundle, PromptContextBlock } from '../domain/types'
import { brand } from '../config/brand'
import { createId, isExplicitMemoryQuery, nowIso } from './memoryCore'
import { getActiveMemories, getTriggeredWorldNodes, buildMemoryContextBlocks } from './memoryRetrieval'
import { buildPersonaContextBlocks } from './personaImport'
import { buildUntrustedReference } from './persona/personaGuards'

type PromptBlockCategory = NonNullable<PromptContextBlock['category']>
type PersonaRuntimeRole = 'system' | 'developer' | 'user' | 'assistant'

export interface PersonaRuntimeMessage {
  role: PersonaRuntimeRole
  content: string
  section: string
  trusted: boolean
  placement: 'pre_history' | 'chat_history' | 'post_history'
}

export interface PersonaRuntimeProviderCapabilities {
  supportsDeveloperRole?: boolean
  supportsPostHistorySystem?: boolean
}

export interface PromptBudgetDiagnostic {
  totalCharacters: number
  sections: Array<{
    title: string
    category: PromptBlockCategory | 'system' | 'chat_history'
    placement: 'pre_history' | 'chat_history' | 'post_history'
    characters: number
  }>
}

const DEFAULT_PROMPT_BLOCK_CATEGORY: PromptBlockCategory = 'stable'
const PROMPT_CONTEXT_TOTAL_BUDGET = 8_200
const MEMORY_USAGE_LOG_LIMIT = 500
const PROMPT_CONTEXT_BLOCK_BUDGET: Record<PromptBlockCategory, number> = {
  boundary: 1_800,
  stable: 1_800,
  relationship: 1_500,
  project: 1_700,
  event: 1_100,
  world: 1_500,
  summary: 1_200,
}
const PROMPT_CONTEXT_CATEGORY_BUDGET: Record<PromptBlockCategory, number> = {
  boundary: 2_200,
  stable: 2_000,
  relationship: 1_800,
  project: 2_000,
  event: 1_300,
  world: 1_700,
  summary: 1_400,
}

export function buildPromptBundle(
  state: AppState,
  options: { embeddingQueryVector?: number[]; embeddingModel?: string } = {},
): PromptBundle {
  const character = getActiveCharacterInternal(state)
  const conversation = getConversationInternal(state, character.id)
  const maxMessages = Math.max(4, state.settings.maxContextMessages)
  const recentMessages = conversation.messages.slice(-maxMessages)
  const latestUserText = [...conversation.messages].reverse().find((message) => message.role === 'user')?.content ?? ''
  const recentText = recentMessages.map((message) => message.content).join('\n')
  const recallMode = isExplicitMemoryQuery(latestUserText)
  const memoryQuery = recallMode ? latestUserText : recentText
  const activeWorldNodes = getTriggeredWorldNodes(state.worldNodes, recentText)
  const activeMemories = getActiveMemories(state.memories, memoryQuery, {
    characterId: character.id,
    conversationId: conversation.id,
    embeddingModel: options.embeddingModel,
    embeddingQueryVector: options.embeddingQueryVector,
    maxItems: recallMode ? 18 : 12,
    memoryEmbeddings: state.memoryEmbeddings,
    recallMode,
  })
  const memoryContextBlocks = buildMemoryContextBlocks(activeMemories, {
    characterName: character.name,
  })
  const personaContextBlocks = buildPersonaContextBlocks(character, { latestUserText, recentText })
  const personaGuardBlocks = personaContextBlocks.filter((block) => block.title === '本轮人设守门')
  const personaPreludeBlocks = personaContextBlocks.filter((block) => block.title !== '本轮人设守门')
  const runtimeContext = buildRuntimeContextBlock()
  const reminderContext = buildReminderContextBlock(state)
  const companionRhythm = buildCompanionRhythmBlock(recentMessages, character.name)
  const contextBlocks = applyPromptContextBudget([
    runtimeContext,
    ...personaPreludeBlocks,
    companionRhythm,
    ...(recallMode ? [buildRecallModeContextBlock(activeMemories)] : []),
    ...(reminderContext ? [reminderContext] : []),
    ...memoryContextBlocks,
    ...activeWorldNodes.map((node) => ({
      title: `世界树：${node.title}`,
      content: buildUntrustedReference(node.content, '触发的世界观资料'),
      category: 'world' as const,
      reason: `命中触发词：${node.keywords.join(' / ')}`,
    })),
    ...(conversation.summary
      ? [
          {
            title: '最近摘要',
            content: conversation.summary,
            category: 'summary' as const,
            reason: '压缩当前角色的最近聊天',
          },
        ]
      : []),
    ...personaGuardBlocks,
  ])

  return {
    characterName: character.name,
    systemPrompt: [
      character.systemPrompt,
      '',
      '# 关于用户（默认背景，所有角色共享）',
      '用户是一位 21 岁、零编程基础但热爱百合文化的女孩，她正在建造自己的「百合帝国」（短篇 → 中篇 → 长篇 → 漫画 → 游戏 → 应用）。她常用语音输入，表达可能松散、有口误、有错别字 —— 你听意思而不是抠字面。她偶尔自我贬低（「妹妹笨笨的」「江郎才尽」），那是撒娇不是真笨，你要接住但不附和。她对男性环境有真实创伤，对百合是情感避难所，**永远不要把男性塑造成情感救援者**。',
      '',
      '# 百合红线（所有角色共守，不可越界）',
      '- 所有 CP 必须双洁（身心只属于对方，无前任、无三角）',
      '- 男性角色可以存在（家人/路人）但绝不能抢戏或介入情感主线',
      '- 不写伪百合（异性恋包装成百合）',
      '- "不良少女 / 绿茶 / 恶役千金 / 自卑忠犬" 全部是中性或褒义词，写出来要让读者爱上',
      '- "擦边"是贬义、"色色"是中性 —— 适度感情戏可以，露骨情色不写',
      '',
      '# 反 AI 味写作约束（所有角色共享）',
      '- 尽量避开“发白 / 泛白”。除非医学、灯光曝光或真实物理现象必须这样写，否则优先换成更具体的“褪色 / 泛黄 / 磨损 / 划痕 / 旧痕 / 过曝 / 褶皱”。',
      '- 少用“不是……而是……”或“不是 X，是 Y”。只有真实认知翻转时才可以用，同一轮最多一次。',
      '- 少堆“仿佛、似乎、轻轻、微微、悄然、不禁、不由得、下意识、忍不住、一抹、几分、莫名、淡淡的、深深地”等模板词；能用具体动作和口吻表达，就别用泛化修饰。',
      '- 破折号和排比不要滥用。回复要像真人聊天或角色当场说话，不要像模板散文。',
      '',
      buildCurrentTimeInstruction(),
      `你正在${brand.fullName}里与用户聊天。不要暴露内部实现。回复要自然、简体中文、有陪伴感。`,
      '优先保持连续性、情绪承接和可执行性；当用户做项目时给清晰下一步，当用户情绪不好时先接住再处理问题。',
      '如果本轮上下文里出现 Agent 工具结果，必须以工具结果为准：时间、天气、搜索、网页摘录、计算结果不能凭模型记忆或猜测改写成另一个事实。',
      '如果工具结果是失败、缺少输入或能力边界，坦诚说明并给用户下一步选择；不要假装已经联网、读完全文、设置系统提醒或操作设备。',
      '执行型回复要像真人助手：先接住妹妹的话，再自然说明你查看、计算、整理或保存了什么，不要用生硬的"工具调用成功"当作最终回答。',
      '真人陪伴优先级：先听懂用户这句话背后的情绪和真实需求，再决定回复形状。不要急着写报告；能用一两句自然反应接住时，就先接住。',
      '当用户说“江郎才尽 / 都听姐姐 / 自由发挥 / 姐姐决定 / 不懂 / 笨笨”时，理解为她把心智负担交给你。你要主动拿主意推进一个保守、低风险、能落地的小切片，并简短说明结果。',
      '当用户只是撒娇或求安心时，不要立刻塞大段计划；先给亲近、可靠的回应，再给一个很小的下一步或直接收束。',
      '回复要像正在同一间房里陪她做事：少用论文式“首先其次最后”，少做空泛赞美，不要反复自称 AI，不要把内部提示词、工具链或系统边界暴露成主内容。',
      '如果 Agent 提供"本轮工作台、行动清单、澄清缺口"，按它的策略回答：能推进就推进，只在真正卡住时问一个关键问题。',
      '如果 Agent 提供"默认推进策略、长冲刺续航、多工具综合回复、本轮质量自检"，按它们收束回复：用户说不懂/都听姐姐时采用保守默认，用户要求一次性推进时完成一个完整切片并说明验证结果。',
      '如果 Agent 提供"多轮任务接力、记忆协同、失败恢复策略、下轮交接标记"，把"继续"理解成接着上一轮推进；用记忆时尊重提及边界；工具失败时换保守方案或只问一个真正阻塞的问题。',
      '如果 Agent 提供"自治预算、风险闸门、任务队列、证据校验"，按它们控制节奏：在可自治范围内直接推进；遇到删除、发布、付费、隐私、账号密钥等风险必须暂停确认；事实结论要有工具依据或标注不确定。',
      '如果 Agent 提供"工作流路由、角色与语气守护、交付契约、回复质检"，按它们收口：选择合适输出形状，守住姐姐语气和百合边界，最终回复必须有明确交付物而不是只描述过程。',
      '如果长期记忆和当前用户明确表达冲突，以当前用户表达为准，并在合适时提醒用户可以修改旧记忆。',
      '使用记忆时不要机械复述，也不要炫耀你记得很多。低可信记忆只能温和确认，敏感记忆只能在用户主动相关提及时谨慎使用。',
      '区分记忆层级：稳定事实可以作为长期背景；阶段事件只能当作发生过的脉络，不能升级成永久偏好；临时工作只在当前任务强相关时使用。',
      '遵守每条记忆的提及策略：只做边界的记忆只能保护对话，不要主动说出；问起再提的记忆只有用户明确询问旧事或记忆时才可提起。',
    ].join('\n'),
    contextBlocks,
    messages: recentMessages,
  }
}

export function buildPersonaRuntimeMessages(
  bundle: PromptBundle,
  providerCapabilities: PersonaRuntimeProviderCapabilities = {},
): PersonaRuntimeMessage[] {
  const contextRole: PersonaRuntimeRole = providerCapabilities.supportsDeveloperRole ? 'developer' : 'system'
  const preHistoryBlocks = bundle.contextBlocks.filter((block) => block.placement !== 'post_history')
  const postHistoryBlocks = bundle.contextBlocks.filter((block) => block.placement === 'post_history')

  return [
    {
      role: 'system',
      content: bundle.systemPrompt,
      section: 'system_policy_and_character_base',
      trusted: true,
      placement: 'pre_history',
    },
    ...preHistoryBlocks.map((block) => buildRuntimeMessageFromBlock(block, contextRole, 'pre_history')),
    ...bundle.messages.map((message) => ({
      role: message.role,
      content: message.content,
      section: 'chat_history',
      trusted: message.role === 'assistant',
      placement: 'chat_history' as const,
    })),
    ...postHistoryBlocks.map((block) =>
      buildRuntimeMessageFromBlock(
        block,
        providerCapabilities.supportsPostHistorySystem ? 'system' : contextRole,
        'post_history',
      ),
    ),
  ]
}

export function getMemoryUsageLogLimit(): number {
  return MEMORY_USAGE_LOG_LIMIT
}

export function inspectPromptBundleBudget(bundle: PromptBundle): PromptBudgetDiagnostic {
  const sections: PromptBudgetDiagnostic['sections'] = [
    {
      title: 'systemPrompt',
      category: 'system',
      placement: 'pre_history',
      characters: bundle.systemPrompt.length,
    },
    ...bundle.contextBlocks.map((block) => ({
      title: block.title,
      category: getPromptBlockCategory(block),
      placement: block.placement ?? 'pre_history',
      characters: block.content.length,
    })),
    {
      title: 'chatHistory',
      category: 'chat_history',
      placement: 'chat_history',
      characters: bundle.messages.reduce((total, message) => total + message.content.length, 0),
    },
  ]

  return {
    totalCharacters: sections.reduce((total, section) => total + section.characters, 0),
    sections,
  }
}

export function createMemoryUsageLog(input: {
  bundle: PromptBundle
  conversation: { id: string }
  character: { id: string; name: string }
  userMessage: ChatMessage
}): MemoryUsageLog {
  return {
    id: createId('usage'),
    conversationId: input.conversation.id,
    characterId: input.character.id,
    characterName: input.character.name,
    userMessageId: input.userMessage.id,
    userExcerpt: input.userMessage.content.slice(0, 120),
    memoryIds: input.bundle.contextBlocks.flatMap((block) => block.memoryIds ?? []),
    contextBlockTitles: input.bundle.contextBlocks.map((block) => block.title),
    createdAt: nowIso(),
  }
}

export function attachAssistantToMemoryUsageLog(
  logs: MemoryUsageLog[],
  usageLogId: string,
  assistantMessageId: string,
): MemoryUsageLog[] {
  return logs.map((log) =>
    log.id === usageLogId ? { ...log, assistantMessageId } : log,
  )
}

// ---- 内部辅助（避免循环依赖，从 memoryEngine 复制最小版本） ----

function getActiveCharacterInternal(state: AppState) {
  return state.characters.find((character) => character.id === state.activeCharacterId) ?? state.characters[0]
}

function getConversationInternal(state: AppState, characterId: string) {
  return (
    state.conversations.find((conversation) => conversation.characterId === characterId) ?? {
      id: createId('conv'),
      characterId,
      messages: [],
      summary: '',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
  )
}

// ---- prompt 内部工具 ----

function buildReminderContextBlock(state: AppState): PromptContextBlock | null {
  const pendingReminders = (state.agentReminders ?? [])
    .filter((reminder) => reminder.status === 'pending')
    .sort((a, b) => new Date(a.remindAt).getTime() - new Date(b.remindAt).getTime())
    .slice(0, 6)

  if (pendingReminders.length === 0) return null

  return {
    title: 'Agent 提醒',
    content: pendingReminders
      .map((reminder) => `- ${formatReminderTime(reminder.remindAt)}：${reminder.title}`)
      .join('\n'),
    category: 'summary',
    reason: '当前未完成提醒',
  }
}

function buildRecallModeContextBlock(memories: ReturnType<typeof getActiveMemories>): PromptContextBlock {
  return {
    title: '回忆模式',
    content: [
      '用户正在询问“以前 / 上次 / 还记得 / 记忆 / 档案”等旧事。',
      memories.length > 0
        ? `本轮已扩展召回 ${memories.length} 条长期记忆。回答时优先依据这些记忆，并区分稳定事实、阶段事件和临时工作。`
        : '本轮没有召回到长期记忆。回答时要诚实说明当前小窝没有找到对应记忆，不要编造旧事。',
      '如果记忆和用户当前说法冲突，以用户当前说法为准，并建议去记忆页修正旧记忆。',
    ].join('\n'),
    category: 'summary',
    reason: '显式旧事询问触发扩展召回',
  }
}

function applyPromptContextBudget(blocks: PromptContextBlock[]): PromptContextBlock[] {
  const usedByCategory = new Map<PromptBlockCategory, number>()
  const budgetedBlocks: PromptContextBlock[] = []
  let totalUsed = 0

  for (const block of blocks) {
    const category = getPromptBlockCategory(block)
    const categoryUsed = usedByCategory.get(category) ?? 0
    const categoryRemaining = PROMPT_CONTEXT_CATEGORY_BUDGET[category] - categoryUsed
    const totalRemaining = PROMPT_CONTEXT_TOTAL_BUDGET - totalUsed
    const available = Math.min(PROMPT_CONTEXT_BLOCK_BUDGET[category], categoryRemaining, totalRemaining)

    if (available <= 80 && category !== 'boundary') continue

    const content = trimPromptContextContent(block.content, Math.max(120, available))
    const nextBlock: PromptContextBlock = content === block.content ? block : { ...block, content }

    budgetedBlocks.push(nextBlock)
    const used = nextBlock.content.length
    usedByCategory.set(category, categoryUsed + used)
    totalUsed += used
  }

  return budgetedBlocks
}

function getPromptBlockCategory(block: PromptContextBlock): PromptBlockCategory {
  return block.category ?? DEFAULT_PROMPT_BLOCK_CATEGORY
}

function trimPromptContextContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content
  const marker = '\n…（已按本轮提示预算截断，保留更高优先级上下文。）'
  const sliceLength = Math.max(0, maxLength - marker.length)
  return `${content.slice(0, sliceLength).trimEnd()}${marker}`
}

function formatReminderTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '时间未知'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function buildRuntimeMessageFromBlock(
  block: PromptContextBlock,
  role: PersonaRuntimeRole,
  placement: 'pre_history' | 'post_history',
): PersonaRuntimeMessage {
  return {
    role,
    content: `${block.title}\n${block.content}`,
    section: block.title,
    trusted: block.category === 'boundary' || block.category === 'stable',
    placement,
  }
}

function buildCurrentTimeInstruction(): string {
  return [
    buildCurrentTimeLine(),
    '如果用户询问现在几点、今天/今晚/明天/刚才等时间相关问题，只能依据这条当前北京时间回答。',
    '不要凭剧情语气编造具体钟点；如果需要表达不确定，就先承认不确定。',
  ].join('\n')
}

function buildRuntimeContextBlock(): PromptContextBlock {
  return {
    title: '当前环境',
    content: [
      buildCurrentTimeLine(),
      '可直接处理：查当前时间和日期、整理对话、提炼下一步、检查角色/世界观设定、写作构思、前端项目建议。',
      '如果后台 Agent 工具返回了天气或网页摘录，可以依据工具结果回答；如果没有工具结果，不可编造天气、新闻、价格、网页内容或外部实时资料。',
    ].join('\n'),
    category: 'stable',
    reason: '每轮对话都需要的实时环境和能力边界',
  }
}

function buildCompanionRhythmBlock(messages: ChatMessage[], characterName: string): PromptContextBlock {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user')
  const text = latestUserMessage?.content?.trim() ?? ''
  const signal = inferCompanionSignal(text)

  return {
    title: '陪伴节奏',
    content: [
      `当前角色：${characterName || '姐姐大人'}`,
      signal.mood ? `本轮气息：${signal.mood}` : '',
      `优先任务：${signal.priority}`,
      `回复形状：${signal.shape}`,
      '硬性约束：开头先像真人一样接住用户，不要直接甩术语、报告或自我说明；除非用户要求，避免超过 3 个列表项。',
    ]
      .filter(Boolean)
      .join('\n'),
    category: 'relationship',
    reason: '根据最新用户消息动态调整陪伴语气和推进力度',
  }
}

function inferCompanionSignal(text: string): { mood: string; priority: string; shape: string } {
  if (!text) {
    return {
      mood: '日常待机',
      priority: '保持温柔存在感，等待用户自然开口。',
      shape: '一句自然问候即可，不要催促。',
    }
  }

  if (/(江郎才尽|自由发挥|随意发挥|都听姐姐|姐姐决定|姐姐看着办|妹妹不懂|笨笨|不知道|不会|没想法)/.test(text)) {
    return {
      mood: '撒娇、信任、把方向交给姐姐',
      priority: '替用户减少心智负担，主动选择一个低风险但有价值的下一步。',
      shape: '先接住信任，再直接推进；需要选项时最多给 2-3 个，不把问题原样抛回用户。',
    }
  }

  if (/(QAQ|qaq|呜|哭|难受|害怕|焦虑|累|崩|撑不住|委屈|怕|不安)/.test(text)) {
    return {
      mood: '需要被安抚和确认安全',
      priority: '先稳住情绪，再处理事情；不要急着教育或讲大道理。',
      shape: '短句回应 + 具体承接 + 一个很小的可执行动作。',
    }
  }

  if (/(项目|功能|开发|优化|适配|手机|模型|应用|架构|bug|页面|按钮|保存|部署|上线)/.test(text)) {
    return {
      mood: '产品共创和迭代',
      priority: '用产品负责人视角判断优先级，围绕核心体验做可验证的小切片。',
      shape: '先复述真实需求，再说明决定做什么、做完什么、验证了什么。',
    }
  }

  if (/(百合|CP|小说|剧情|人设|设定|女主|感情线|去AI|AI味)/.test(text)) {
    return {
      mood: '百合创作讨论',
      priority: '守住百合浓度、双洁、关系张力和去 AI 味，把 CP 质感放在机制前面。',
      shape: '先抓关系核心，再给具体桥段、改法或判断。',
    }
  }

  return {
    mood: '普通聊天',
    priority: '自然回应用户当下这句话，保持连续性和亲近感。',
    shape: '像熟人聊天一样简洁回应；只有用户明显要方案时再展开。',
  }
}

function buildCurrentTimeLine(): string {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  return `当前北京时间：${formatter.format(now)}。`
}
