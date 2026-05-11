import type { CharacterPersonaProfile } from '../../domain/types'

export interface PersonaImportInput {
  name: string
  relation: string
  mood: string
  persona: string
}

export interface PersonaImportAnalysis {
  score: number
  detectedFormat: string
  strengths: string[]
  missing: string[]
  v2: {
    loreCount: number
    relationshipCount: number
    speechExampleCount: number
    sceneTriggerCount: number
    guardCount: number
    riskCount: number
    cardBookCount: number
    alternateGreetingCount: number
    hasPostHistoryInstructions: boolean
  }
}

export type PersonaProfileCoreField =
  | 'identity'
  | 'relationship'
  | 'temperament'
  | 'speechStyle'
  | 'emotionalPattern'
  | 'memoriesAndExperiences'
  | 'goals'
  | 'boundaries'
  | 'interactionRules'

export const FIELD_ALIASES: Record<PersonaProfileCoreField, string[]> = {
  identity: ['身份', '基本信息', '角色身份', '人设定位', '设定定位', 'description', '角色描述', 'profile'],
  relationship: ['关系', '关系定位', '和用户关系', '感情关系', 'CP关系', 'scenario', '场景', '世界观'],
  temperament: ['性格', '性格底色', '人格', '气质', '性格特点', 'personality'],
  speechStyle: [
    '说话方式',
    '语气',
    '口癖',
    '台词',
    '表达风格',
    '称呼',
    '聊天样例',
    '示例对话',
    '样例回复',
    'first_mes',
    'first_message',
    'mes_example',
    'example_messages',
  ],
  emotionalPattern: ['情绪', '情绪模式', '情感模式', '雷点', '软肋', '破防点', '心软点'],
  memoriesAndExperiences: ['经历', '过去', '记忆', '背景', '重要经历', '成长经历', 'creator_notes'],
  goals: ['目标', '愿望', '动机', '想要什么', '价值观', '偏好', 'motivation'],
  boundaries: ['边界', '禁忌', '不要', '不能', '避雷', 'knowledge_boundary'],
  interactionRules: [
    '互动方式',
    '相处方式',
    '回复规则',
    '聊天方式',
    '相处规则',
    '互动规则',
    'system_prompt',
    'post_history_instructions',
  ],
}

export const FIELD_HINTS: Record<PersonaProfileCoreField, string[]> = {
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

export type PersonaProfileExtracted = Record<PersonaProfileCoreField, string>

export type PersonaProfileDimension = [string, keyof Pick<
  CharacterPersonaProfile,
  | 'identity'
  | 'relationship'
  | 'temperament'
  | 'speechStyle'
  | 'emotionalPattern'
  | 'memoriesAndExperiences'
  | 'goals'
  | 'boundaries'
  | 'interactionRules'
>]
