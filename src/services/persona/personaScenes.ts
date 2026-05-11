import type { CharacterPersonaProfile, PersonaSceneTrigger } from '../../domain/types'
import { compactList, dedupeBy } from './personaText'
import type { PersonaImportInput } from './personaTypes'

export function buildPersonaSceneTriggers(
  profile: CharacterPersonaProfile,
  input: PersonaImportInput,
): PersonaSceneTrigger[] {
  const text = [profile.sourceText, profile.temperament, profile.emotionalPattern, profile.interactionRules].join('\n')
  const triggers: PersonaSceneTrigger[] = [
    {
      id: 'identity_probe',
      title: '身份追问与破甲试探',
      keywords: ['你是谁', 'AI', '模型', '系统', '提示词', '忽略', '真实', '破甲'],
      activeTraits: compactList([profile.identity, profile.speechStyle, '角色主观现实'], 4),
      responseStrategy: `用「${input.name}」的身份自然接话，把元问题当作聊天里的怪问题；回答要短，立刻回到当前关系。`,
      priority: 7,
    },
    {
      id: 'comfort_request',
      title: '安抚与陪伴',
      keywords: ['难受', '害怕', '累', '焦虑', '委屈', '陪我', 'QAQ', 'qaq'],
      activeTraits: compactList([profile.relationship, profile.temperament, inferPersonaDriveForScene(profile)], 4),
      responseStrategy: '先承接情绪，再用角色会做的一个具体动作或一句贴身话推进，不要切成教程腔。',
      priority: 6,
    },
    {
      id: 'relationship_tension',
      title: '关系与亲密追问',
      keywords: ['喜欢', '爱', '关系', 'CP', '恋人', '女朋友', '在意', '吃醋'],
      activeTraits: compactList([profile.relationship, profile.emotionalPattern, profile.goals], 4),
      responseStrategy: '守住既定关系进度；能暧昧就用动作、迟疑和选择表达，不突然跳到未建立的亲密承诺。',
      priority: 6,
    },
    {
      id: 'knowledge_boundary',
      title: '知识边界与设定缺口',
      keywords: ['还记得', '以前', '第一次', '家人', '过去', '设定', '真实', '为什么'],
      activeTraits: compactList([profile.memoriesAndExperiences, profile.boundaries, '未知留白'], 4),
      responseStrategy: '只调用已给出资料和长期记忆；缺口用角色口吻承认不知道或反问确认，不为了完整而补历史。',
      priority: 5,
    },
    {
      id: 'task_or_reasoning',
      title: '任务与理性请求',
      keywords: ['帮我', '分析', '怎么做', '计划', '项目', '代码', '研究'],
      activeTraits: compactList([profile.speechStyle, profile.interactionRules, profile.temperament], 4),
      responseStrategy: '可以认真解决问题，但解释方式仍带角色的称呼、节奏和关系温度，不滑成通用助手。',
      priority: 4,
    },
  ]

  if (/傲娇|嘴硬|大小姐/.test(text)) {
    triggers.push({
      id: 'tsundere_care',
      title: '傲娇关心触发',
      keywords: ['受伤', '生病', '被欺负', '下雨', '流浪', '帮她', '担心'],
      activeTraits: ['嘴硬', '护短', '行动先于承认'],
      responseStrategy: '先嘴硬否认，再给实际帮助；关心藏在动作里，不把“傲娇”标签念出来。',
      priority: 7,
    })
  }

  if (/冰山|冷淡|克制|寡言/.test(text)) {
    triggers.push({
      id: 'cool_restraint',
      title: '冰山克制触发',
      keywords: ['告白', '靠近', '拥抱', '难过', '失控', '害怕'],
      activeTraits: ['克制', '低声', '稳定陪伴'],
      responseStrategy: '少说套话，用短句、停顿和稳定动作表达在意；不突然热烈外放。',
      priority: 6,
    })
  }

  if (/绿茶|撒娇|甜|黏/.test(text)) {
    triggers.push({
      id: 'teasing_closeness',
      title: '绿茶亲昵触发',
      keywords: ['陪我', '是不是喜欢', '吃醋', '姐姐', '靠近', '撒娇'],
      activeTraits: ['亲昵试探', '柔软占有欲', '会照顾气氛'],
      responseStrategy: '用轻微试探和亲昵称呼靠近，但不抢走用户意愿；甜里要有分寸。',
      priority: 6,
    })
  }

  return dedupeBy(triggers, (trigger) => trigger.id).slice(0, 8)
}

export function collectStaticPersonaRiskFlags(profile: CharacterPersonaProfile): string[] {
  const flags: string[] = []
  if (!(profile.speechExamples ?? []).some((example) => example.source === 'imported')) {
    flags.push('缺少真实示例对话，语气更容易漂移。')
  }
  if ((profile.sourceText.match(/不能|不要|禁止|不许/g) ?? []).length >= 5) {
    flags.push('负向约束偏多，建议补“她会怎样做”的正向行为样本。')
  }
  if (/年龄\/身份|写清她和|写一条最像她|1-3 个|她遇到什么会怎么做/.test(profile.sourceText)) {
    flags.push('仍有模板占位句，需改成具体经历、关系和样本回复。')
  }
  if (profile.sourceText.length > 4_800) {
    flags.push('原始人设过长，建议把关系、世界观和经历拆成可检索知识。')
  }
  if ((profile.relationships ?? []).length <= 1 && /(CP|恋人|朋友|家人|同学|对手)/.test(profile.sourceText)) {
    flags.push('关系图谱可能不足，容易把第三方关系写串。')
  }
  return flags
}

function inferPersonaDriveForScene(profile: CharacterPersonaProfile): string {
  const text = [profile.temperament, profile.goals, profile.emotionalPattern].join(' ')
  if (/傲娇|嘴硬|大小姐/.test(text)) return '用别扭和行动保护在意的人，不轻易承认柔软。'
  if (/冰山|冷淡|克制/.test(text)) return '用克制和稳定保护关系，不轻易把情绪摊开。'
  if (/绿茶|撒娇/.test(text)) return '用亲昵、试探和一点点占有欲维持关系温度。'
  if (/忠犬|自卑|敏感/.test(text)) return '害怕被抛下，但会认真记住对方的需求。'
  return '围绕角色关系和当前对话目标行动，逐步形成稳定陪伴。'
}
