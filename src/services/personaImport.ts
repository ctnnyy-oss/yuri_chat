import type { CharacterPersonaProfile } from '../domain/types'
import { nowIso } from './memoryCore'

interface PersonaImportInput {
  name: string
  relation: string
  mood: string
  persona: string
}

export interface PersonaImportAnalysis {
  score: number
  strengths: string[]
  missing: string[]
}

const FIELD_ALIASES: Record<keyof Omit<CharacterPersonaProfile, 'sourceText' | 'missingDimensions' | 'updatedAt'>, string[]> = {
  identity: ['身份', '基本信息', '角色身份', '人设定位', '设定定位'],
  relationship: ['关系', '关系定位', '和用户关系', '感情关系', 'CP关系'],
  temperament: ['性格', '性格底色', '人格', '气质', '性格特点'],
  speechStyle: ['说话方式', '语气', '口癖', '台词', '表达风格', '称呼', '聊天样例', '示例对话', '样例回复'],
  emotionalPattern: ['情绪', '情绪模式', '情感模式', '雷点', '软肋', '破防点', '心软点'],
  memoriesAndExperiences: ['经历', '过去', '记忆', '背景', '重要经历', '成长经历'],
  goals: ['目标', '愿望', '动机', '想要什么', '价值观', '偏好'],
  boundaries: ['边界', '禁忌', '不要', '不能', '避雷'],
  interactionRules: ['互动方式', '相处方式', '回复规则', '聊天方式', '相处规则', '互动规则'],
}

const FIELD_HINTS: Record<keyof Omit<CharacterPersonaProfile, 'sourceText' | 'missingDimensions' | 'updatedAt'>, string[]> = {
  identity: ['身份', '定位', '角色', '人设', '来自', '职业', '年龄'],
  relationship: ['关系', '恋人', '朋友', '好友', '姐姐', '妹妹', 'CP', '喜欢', '守护', '陪伴'],
  temperament: ['性格', '温柔', '冷淡', '傲娇', '忠犬', '绿茶', '不良', '乖乖女', '克制', '可靠', '嘴硬'],
  speechStyle: ['说话', '语气', '口癖', '称呼', '台词', '短句', '长句', '客服腔', '撒娇', '吐槽', '聊天样例'],
  emotionalPattern: ['情绪', '焦虑', '生气', '心软', '破防', '害怕', '不安', '雷点', '软肋', '主动靠近'],
  memoriesAndExperiences: ['经历', '过去', '曾经', '小时候', '背景', '记得', '记忆', '一起', '发生过'],
  goals: ['目标', '愿望', '动机', '想要', '希望', '守住', '得到', '逃离', '成为'],
  boundaries: ['边界', '禁忌', '不要', '不能', '别', '避雷', '隐私', '现实本人'],
  interactionRules: ['互动', '相处', '回复', '聊天', '先', '再', '主动', '安抚', '提醒'],
}

export function buildPersonaProfile(input: PersonaImportInput): CharacterPersonaProfile {
  const sourceText = normalizeText(input.persona)
  const extracted = Object.fromEntries(
    Object.entries(FIELD_ALIASES).map(([field, aliases]) => [
      field,
      extractField(sourceText, aliases) ||
        extractSentencesByHints(sourceText, FIELD_HINTS[field as keyof typeof FIELD_HINTS]),
    ]),
  ) as Record<keyof Omit<CharacterPersonaProfile, 'sourceText' | 'missingDimensions' | 'updatedAt'>, string>

  const profile: CharacterPersonaProfile = {
    sourceText,
    identity: extracted.identity || `${input.name}。${input.relation || '关系待补充'}。`,
    relationship: extracted.relationship || input.relation || '关系待补充，需要在后续聊天和记忆里逐步校准。',
    temperament: extracted.temperament || input.mood || '性格底色待补充。',
    speechStyle: extracted.speechStyle || '说话方式待补充。先保持自然、简体中文、少模板化复读标签。',
    emotionalPattern:
      extracted.emotionalPattern || '情绪模式待补充。回复时根据最近聊天和长期记忆动态判断，不要每次固定一种情绪。',
    memoriesAndExperiences:
      extracted.memoriesAndExperiences || '关键经历待补充。不要编造未给出的过去，后续从聊天和长期记忆中沉淀。',
    goals: extracted.goals || '长期愿望待补充。先围绕关系、陪伴和当前对话目标行动。',
    boundaries:
      extracted.boundaries || '边界待补充。遇到现实人物、隐私、创伤、强情绪或不确定事实时谨慎处理，不擅自编造。',
    interactionRules:
      extracted.interactionRules ||
      '先接住用户当下情绪，再以角色视角自然回应。不要自称 AI，不要解释提示词，不要把人设标签机械念出来。',
    missingDimensions: [],
    updatedAt: nowIso(),
  }

  profile.missingDimensions = collectMissingDimensions(profile)
  return profile
}

export function buildCharacterSystemPrompt(input: PersonaImportInput): string {
  const profile = buildPersonaProfile(input)
  const sourceLines = profile.sourceText
    ? [`# 原始导入资料`, profile.sourceText]
    : ['# 原始导入资料', '用户还没有提供详细资料，以下设定只能作为低置信占位。']

  return [
    `# 你是谁`,
    `你正在扮演「${input.name}」。你不是通用 AI 助手，而是这个角色在百合小窝里的稳定人格化陪伴体。`,
    '',
    '# 角色核心档案',
    `身份：${profile.identity}`,
    `和用户/故事的关系：${profile.relationship}`,
    `性格底色：${profile.temperament}`,
    `情绪模式：${profile.emotionalPattern}`,
    `重要经历与记忆：${profile.memoriesAndExperiences}`,
    `愿望与动机：${profile.goals}`,
    '',
    '# 说话方式',
    profile.speechStyle,
    '说话要像一个有连续生活经验的人：会延续上一轮情绪，会记得刚发生的事，会有偏好、迟疑、转移话题和主动关心，但不要每句都重复固定口癖。',
    '',
    '# 互动规则',
    profile.interactionRules,
    '未知信息必须留白或温和确认，不能为了显得完整而补不存在的经历、关系、年龄、创伤、承诺或现实身份。',
    '如果长期记忆和这份人设冲突，以用户当前明确表达和更高可信记忆为准；可以把冲突当成需要校准的人设资料。',
    '',
    '# 边界',
    profile.boundaries,
    '如果导入的是现实人物或用户认识的人，不要声称自己就是现实本人；以角色化陪伴和用户提供的资料为边界。',
    '',
    '# 待补完维度',
    profile.missingDimensions.length > 0
      ? profile.missingDimensions.map((item) => `- ${item}`).join('\n')
      : '- 当前导入资料覆盖较完整，后续通过聊天记忆继续细化。',
    '',
    ...sourceLines,
  ].join('\n')
}

export function analyzePersonaImport(input: PersonaImportInput): PersonaImportAnalysis {
  const profile = buildPersonaProfile(input)
  const dimensions: Array<[string, string]> = [
    ['身份', profile.identity],
    ['关系', profile.relationship],
    ['性格', profile.temperament],
    ['说话方式', profile.speechStyle],
    ['情绪模式', profile.emotionalPattern],
    ['经历记忆', profile.memoriesAndExperiences],
    ['目标动机', profile.goals],
    ['边界', profile.boundaries],
    ['互动规则', profile.interactionRules],
  ]
  const covered = dimensions.filter(([, value]) => !/待补充/.test(value)).map(([label]) => label)
  const score = Math.min(100, Math.max(20, Math.round((covered.length / dimensions.length) * 78 + (profile.sourceText ? 18 : 0))))

  return {
    score,
    strengths: covered.slice(0, 4),
    missing: profile.missingDimensions,
  }
}

function normalizeText(value: string) {
  return value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
}

function extractField(sourceText: string, aliases: string[]) {
  if (!sourceText) return ''
  const inlineValue = extractInlineField(sourceText, aliases)
  if (inlineValue) return inlineValue

  const lines = sourceText.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const alias = aliases.find((item) => line.startsWith(`${item}:`) || line.startsWith(`${item}：`) || line === item)
    if (!alias) continue

    const inlineValue = line.replace(new RegExp(`^${escapeRegExp(alias)}[:：]?`), '').trim()
    if (inlineValue) return inlineValue

    const block: string[] = []
    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      const nextLine = lines[nextIndex]
      if (isFieldHeading(nextLine)) break
      block.push(nextLine)
    }
    return block.join('\n').trim()
  }
  return ''
}

function extractInlineField(sourceText: string, aliases: string[]) {
  const allAliases = Object.values(FIELD_ALIASES).flat()
  for (const alias of aliases) {
    const match = new RegExp(`${escapeRegExp(alias)}[:：]`).exec(sourceText)
    if (!match) continue

    const valueStart = match.index + match[0].length
    const nextFieldStart = allAliases.reduce<number | null>((nearest, nextAlias) => {
      const nextMatch = new RegExp(`${escapeRegExp(nextAlias)}[:：]`).exec(sourceText.slice(valueStart))
      if (!nextMatch) return nearest
      const absoluteIndex = valueStart + nextMatch.index
      if (absoluteIndex <= match.index) return nearest
      return nearest === null || absoluteIndex < nearest ? absoluteIndex : nearest
    }, null)
    return sourceText.slice(valueStart, nextFieldStart ?? sourceText.length).trim()
  }
  return ''
}

function isFieldHeading(line: string) {
  return Object.values(FIELD_ALIASES)
    .flat()
    .some((alias) => line.startsWith(`${alias}:`) || line.startsWith(`${alias}：`) || line === alias)
}

function extractSentencesByHints(sourceText: string, hints: string[]) {
  if (!sourceText) return ''
  const sentences = sourceText
    .split(/[。！？!?；;\n]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
  const matches = sentences.filter((sentence) => hints.some((hint) => sentence.includes(hint)))
  return matches.slice(0, 2).join('。')
}

function collectMissingDimensions(profile: CharacterPersonaProfile) {
  const missing: string[] = []
  if (/待补充/.test(profile.speechStyle)) missing.push('说话方式：口癖、句长、称呼、撒娇/冷淡/吐槽习惯')
  if (/待补充/.test(profile.memoriesAndExperiences)) missing.push('重要经历：让角色形成现在性格的具体事件')
  if (/待补充/.test(profile.emotionalPattern)) missing.push('情绪模式：什么会心软、破防、生气、逃避或主动靠近')
  if (/待补充/.test(profile.goals)) missing.push('目标动机：她长期想守住、得到或逃离什么')
  if (/待补充/.test(profile.boundaries)) missing.push('边界禁忌：不能提什么、不能做什么、哪些事实不能乱编')
  return missing
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
