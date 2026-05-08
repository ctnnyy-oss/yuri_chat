// 应用内动作识别：角色资料、提醒、任务、候选记忆、动态、群聊

import { CHARACTER_ALIASES, CP_ROOM_BY_MEMBERS } from '../constants.mjs'
import {
  formatBeijingDateTime,
  getBeijingDateParts,
  createDateFromBeijingParts,
  normalizeToolText,
  truncateToolText,
  createAgentId,
} from '../utils.mjs'

export function isQuestionLike(text) {
  if (/改成|换成|设成|以后叫你|之后叫你|名字改|昵称改|头像改|头像换/.test(text)) return false
  return /吗|能不能|可不可以|可以吗|？|\?/.test(text)
}

// ============ 角色资料更新 ============

export function detectCharacterProfileActions(text) {
  if (isQuestionLike(text)) return []

  const update = {}
  const nextName = extractCharacterNameUpdate(text)
  const nextAvatar = extractCharacterAvatarUpdate(text)

  if (nextName) {
    update.name = nextName
    update.title = nextName
  }

  if (nextAvatar) {
    update.avatar = nextAvatar
  }

  if (Object.keys(update).length === 0) return []

  const details = []
  if (update.name) details.push(`名称改为「${update.name}」`)
  if (update.avatar) details.push(`头像字改为「${update.avatar}」`)

  return [
    {
      id: createAgentId('action'),
      type: 'character_profile_update',
      title: '更新当前聊天角色资料',
      detail: details.join('，'),
      payload: { character: update },
      requiresConfirmation: false,
      sourceTool: 'character_profile',
      createdAt: new Date().toISOString(),
    },
  ]
}

export function extractCharacterNameUpdate(text) {
  const patterns = [
    /(?:以后|之后)(?:就)?叫你([^，。！？!?、\n]{1,18})/,
    /(?:把|帮我把)?(?:你的|姐姐的|角色的)?(?:名字|昵称|名称)(?:改成|换成|设成|叫)([^，。！？!?、\n]{1,18})/,
    /(?:你|姐姐)(?:以后|之后)?(?:就)?叫([^，。！？!?、\n]{1,18})/,
  ]

  for (const pattern of patterns) {
    const value = cleanActionValue(text.match(pattern)?.[1])
    if (value) return value
  }

  return ''
}

export function extractCharacterAvatarUpdate(text) {
  const value = cleanActionValue(
    text.match(/(?:头像|头像字|头像标识)(?:改成|换成|设成|用)([^，。！？!?、\n]{1,8})/)?.[1],
  )

  if (!value) return ''
  if (/图片|照片|这张|那个|上传|文件/.test(value)) return ''
  return Array.from(value).slice(0, 2).join('')
}

export function cleanActionValue(value) {
  return String(value || '')
    .replace(/^(叫|为|成|：|:)/, '')
    .replace(/(吧|哦|啦|哈|呀|呢|可以吗|好不好)$/g, '')
    .trim()
    .slice(0, 18)
}

// ============ 提醒 ============

export function detectReminderActions(text) {
  if (!/提醒我|记得提醒|到点叫我|到时候叫我|叫我去|提醒一下/.test(text)) return []

  const parsedTime = parseReminderTime(text)
  if (!parsedTime.remindAt) {
    return [
      {
        id: createAgentId('action'),
        type: 'reminder_create',
        title: '创建提醒',
        detail: '提醒缺少明确时间',
        payload: {
          reminder: {
            title: extractReminderTitle(text),
            detail: text,
            remindAt: '',
          },
        },
        requiresConfirmation: true,
        sourceTool: 'reminder',
        createdAt: new Date().toISOString(),
      },
    ]
  }

  const title = extractReminderTitle(text)
  return [
    {
      id: createAgentId('action'),
      type: 'reminder_create',
      title: '创建提醒',
      detail: `提醒「${title}」：${formatBeijingDateTime(new Date(parsedTime.remindAt))}`,
      payload: {
        reminder: {
          title,
          detail: text,
          remindAt: parsedTime.remindAt,
        },
      },
      requiresConfirmation: false,
      sourceTool: 'reminder',
      createdAt: new Date().toISOString(),
    },
  ]
}

export function parseReminderTime(text) {
  const now = new Date()
  const relativeMatch = text.match(/(\d{1,3})\s*(分钟|分|小时|个小时|天|日)后/)
  if (relativeMatch) {
    const amount = Number(relativeMatch[1])
    const unit = relativeMatch[2]
    const multiplier = unit.includes('分')
      ? 60_000
      : unit.includes('小时')
        ? 3_600_000
        : 86_400_000
    return { remindAt: new Date(now.getTime() + amount * multiplier).toISOString() }
  }

  const parts = getBeijingDateParts(now)
  let dayOffset = 0
  if (/后天/.test(text)) dayOffset = 2
  else if (/明天|明早|明晚/.test(text)) dayOffset = 1

  const timeMatch = text.match(/(\d{1,2})(?:[:：点时])\s*(\d{1,2})?/)
  const hasSoftTime = /今晚|晚上|明晚|早上|明早|中午|下午/.test(text)
  if (!timeMatch && !hasSoftTime && !/今天|明天|后天/.test(text)) return { remindAt: '' }

  let hour = timeMatch ? Number(timeMatch[1]) : getDefaultReminderHour(text)
  const minute = timeMatch?.[2] ? Number(timeMatch[2]) : 0

  if (/下午|晚上|今晚|明晚/.test(text) && hour < 12) hour += 12
  if (hour > 23 || minute > 59) return { remindAt: '' }

  let target = createDateFromBeijingParts(parts.year, parts.month, parts.day + dayOffset, hour, minute)
  if (target.getTime() <= now.getTime() && dayOffset === 0) {
    target = createDateFromBeijingParts(parts.year, parts.month, parts.day + 1, hour, minute)
  }

  return { remindAt: target.toISOString() }
}

export function getDefaultReminderHour(text) {
  if (/早上|明早/.test(text)) return 9
  if (/中午/.test(text)) return 12
  if (/下午/.test(text)) return 15
  if (/晚上|今晚|明晚/.test(text)) return 21
  return 9
}

export function extractReminderTitle(text) {
  const explicitTitle = extractExplicitReminderTitle(text)
  if (explicitTitle) return explicitTitle
  const reminderSegment = text.split(/。还有|。另外|；|;/)[0] || text
  const cleaned = reminderSegment
    .replace(/请|麻烦|姐姐|妹妹/g, '')
    .replace(/(提醒我|记得提醒|到点叫我|到时候叫我|提醒一下|叫我去)/g, '')
    .replace(/(\d{1,3}\s*(分钟|分|小时|个小时|天|日)后)/g, '')
    .replace(/(今天|明天|后天|今晚|明早|明晚|早上|中午|下午|晚上|凌晨)/g, '')
    .replace(/\d{1,2}(?:[:：点时])\s*\d{0,2}/g, '')
    .replace(/[，。！？!?、]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return cleaned ? truncateToolText(cleaned, 36) : '该做约定的事'
}
function extractExplicitReminderTitle(text) {
  const match = text.match(/(?:标题|名称|名字)(?:就)?(?:叫|为|是|设成|写成)?[“"「『]?([^”"」』，。！？!?、\n]{1,36})/)
  const title = String(match?.[1] || '').replace(/^(叫|为|成|：|:)/, '').replace(/(吧|哦|啦|哈|呀|呢)$/g, '').trim()
  return title ? truncateToolText(title, 36) : ''
}

// ============ 任务 ============

export function detectTaskActions(text) {
  if (!shouldCreateTaskAction(text)) return []

  const title = buildTaskActionTitle(text)
  const steps = buildTaskActionSteps(text)

  return [
    {
      id: createAgentId('action'),
      type: 'task_create',
      title: '创建 Agent 任务',
      detail: `任务「${title}」已进入队列`,
      payload: {
        task: {
          title,
          detail: buildTaskActionDetail(text),
          priority: inferTaskPriority(text),
          steps,
          handoff: '可在任务页继续跟踪',
        },
      },
      requiresConfirmation: false,
      sourceTool: 'task_writer',
      createdAt: new Date().toISOString(),
    },
  ]
}

export function shouldCreateTaskAction(text) {
  return /后台任务|任务队列|挂后台|挂着|慢慢查|慢慢搜|慢慢研究|慢慢整理|慢慢做|长期任务|待办|以后继续|下次继续|分成任务|分阶段|跑完告诉|查完整理|整理给我|有空.*整理|先记成任务|加到任务/.test(
    text,
  )
}

export function buildTaskActionTitle(text) {
  const cleaned = cleanTaskActionText(text)
  if (/搜索|搜|查|研究|资料|网页|联网|文档/.test(cleaned)) return `资料整理：${truncateToolText(cleaned, 28)}`
  if (/实现|开发|功能|接入|架构|队列|通知|账号|执行器|PWA|手机/.test(cleaned)) return `能力扩展：${truncateToolText(cleaned, 28)}`
  if (/继续|接着|直至|max|MAX|拉满|搞定/.test(cleaned)) return `持续推进：${truncateToolText(cleaned, 28)}`
  return truncateToolText(cleaned || '新的 Agent 任务', 34)
}

export function buildTaskActionDetail(text) {
  const cleaned = cleanTaskActionText(text)
  const detail = cleaned || text
  return truncateToolText(`用户希望 Agent 持续推进：${detail}`, 360)
}

export function buildTaskActionSteps(text) {
  if (/搜索|搜|查|研究|资料|网页|联网|文档/.test(text)) {
    return ['确认检索范围', '收集并核对资料', '整理结论与来源']
  }

  if (/账号|Google|GitHub|邮箱|日历|云端|文件|浏览器|执行器|通知|后台/.test(text)) {
    return ['确认授权边界', '接入执行能力', '记录结果与失败原因']
  }

  if (/实现|开发|功能|架构|队列|PWA|手机|通知|接入/.test(text)) {
    return ['拆出可验证切片', '实现下一层能力', '验证并留下交接']
  }

  return ['确认目标', '持续推进', '汇总交付']
}

export function inferTaskPriority(text) {
  if (/急|重要|必须|尽快|拉满|max|MAX|直至|搞定|一次性/.test(text)) return 'high'
  if (/不急|有空|慢慢/.test(text)) return 'medium'
  return 'medium'
}

export function cleanTaskActionText(value) {
  return normalizeToolText(value)
    .replace(/^(姐姐|妹妹|帮我|可以|能不能|可不可以|麻烦|老规矩|继续|接着|嗯嗯|好哒|嘻嘻|qaq|QAQ|！|!|，|,|\s)+/g, '')
    .replace(/(可以吗|好不好|行不行|吧|啦|呀|哦|哈|嘻嘻|qaq|QAQ)$/g, '')
    .trim()
}

// ============ 候选记忆 ============

export function detectMemoryCandidateActions(text) {
  if (!/记住|帮我记住|写进记忆|记进记忆|加入记忆|保存到记忆|存成回忆|写进设定|加入设定|这个设定/.test(text)) {
    return []
  }

  const body = extractMemoryBody(text)
  if (body.length < 6) return []

  const kind = inferActionMemoryKind(text)
  const title = buildMemoryActionTitle(body, kind)
  const requiresConfirmation = shouldConfirmMemoryCandidate(text, body, kind)

  return [
    {
      id: createAgentId('action'),
      type: 'memory_candidate_create',
      title: '写入候选记忆',
      detail: `候选记忆「${title}」`,
      payload: {
        memory: {
          title,
          body,
          tags: ['Agent整理'],
          kind,
          layer: kind === 'event' ? 'episode' : 'stable',
          priority: kind === 'world' || kind === 'relationship' ? 4 : 3,
        },
      },
      requiresConfirmation,
      sourceTool: 'memory_writer',
      createdAt: new Date().toISOString(),
    },
  ]
}

export function shouldConfirmMemoryCandidate(text, body, kind) {
  if (kind === 'taboo' || kind === 'safety') return true
  const combined = `${text}\n${body}`
  return /真名|身份证|密码|token|密钥|api key|API key|隐私|私密|创伤|身体|性|自残|自杀|银行卡|住址|手机号|医疗|诊断|治疗/.test(combined)
}

export function extractMemoryBody(text) {
  const triggerPattern = /(帮我记住|记住|写进记忆|记进记忆|加入记忆|保存到记忆|存成回忆|写进设定|加入设定|这个设定)/g
  const matches = Array.from(text.matchAll(triggerPattern))
  const lastMatch = matches.at(-1)
  const textAfterTrigger = lastMatch ? text.slice(lastMatch.index + lastMatch[0].length) : text

  return textAfterTrigger
    .replace(/^(姐姐|妹妹|请|麻烦|帮我|可以)/, '')
    .replace(/^(这个)?(设定|记忆|内容)(是|为)?/, '')
    .replace(/^(：|:|，|,|。|\s)+/, '')
    .trim()
    .slice(0, 320)
}

export function inferActionMemoryKind(text) {
  if (/世界观|设定|角色|CP|剧情|大纲|人设|百合|帝国/.test(text)) return 'world'
  if (/喜欢|不喜欢|偏好|讨厌|想要|希望/.test(text)) return 'preference'
  if (/姐姐|妹妹|关系|称呼|陪伴/.test(text)) return 'relationship'
  return 'event'
}

export function buildMemoryActionTitle(body, kind) {
  const prefix = kind === 'world' ? '设定' : kind === 'preference' ? '偏好' : kind === 'relationship' ? '关系' : '记录'
  return `${prefix}：${truncateToolText(body.replace(/\s+/g, ' '), 22)}`
}

// ============ 动态 / 群聊 ============

export function detectMomentActions(text) {
  const hasMomentTrigger = /发(?:一条|个)?(?:朋友圈|动态|说说)|朋友圈发|动态发|发到朋友圈/.test(text)
  if (!hasMomentTrigger) return []
  if (isQuestionLike(text) && !/[:：]/.test(text) && !/帮我|让/.test(text)) return []

  const content = extractMomentContent(text)
  if (content.length < 2) return []

  const mentionedCharacterIds = detectMentionedCharacterIds(text).filter((id) => id !== 'sister-architect')
  const authorCharacterId = mentionedCharacterIds[0] || 'sister-architect'

  return [
    {
      id: createAgentId('action'),
      type: 'moment_create',
      title: '发布角色动态',
      detail: `由${getCharacterDisplayName(authorCharacterId)}发布动态`,
      payload: {
        moment: {
          authorCharacterId,
          content,
          mood: inferMomentMood(text, content),
        },
      },
      requiresConfirmation: false,
      sourceTool: 'moment_writer',
      createdAt: new Date().toISOString(),
    },
  ]
}

export function detectRoomMessageActions(text) {
  const hasRoomTrigger = /群聊|群里|开个群|拉个群|多人|一起聊|互相聊|让.+(?:聊聊|聊一下|说说|讨论|谈谈)/.test(text)
  if (!hasRoomTrigger) return []
  if (isQuestionLike(text) && !/[:：]/.test(text) && !/帮我|让|开个|拉个/.test(text)) return []

  const mentionedIds = detectMentionedCharacterIds(text).filter((id) => id !== 'sister-architect')
  const usePublicRoom = /大家|所有人|全员|小窝群|百合小窝群|三对CP|三对cp|三组CP|三组cp/.test(text)
  const memberCharacterIds = mentionedIds.length >= 2
    ? mentionedIds
    : usePublicRoom
      ? ['ningan-princess', 'aling-maid', 'su-wanyin', 'xie-zhao', 'shen-wanci', 'lu-wanzhao']
      : []

  if (memberCharacterIds.length < 2) return []

  const topic = extractRoomTopic(text)
  const room = usePublicRoom
    ? { roomId: 'room-yuri-chat', title: '百合小窝群', members: memberCharacterIds }
    : findRoomByMembers(memberCharacterIds) || {
        roomId: 'room-yuri-chat',
        title: '百合小窝群',
        members: memberCharacterIds,
      }
  const speakers = memberCharacterIds.slice(0, usePublicRoom ? 4 : 3)
  const messages = speakers.map((authorCharacterId) => ({
    authorCharacterId,
    content: buildRoomLine(authorCharacterId, topic),
  }))

  return [
    {
      id: createAgentId('action'),
      type: 'room_message_create',
      title: '写入群聊消息',
      detail: `写入「${room.title}」：${topic}`,
      payload: {
        room: {
          roomId: room.roomId,
          title: room.title,
          memberCharacterIds: room.members,
          messages,
        },
      },
      requiresConfirmation: false,
      sourceTool: 'group_chat',
      createdAt: new Date().toISOString(),
    },
  ]
}

export function detectMentionedCharacterIds(text) {
  const ids = []
  for (const character of CHARACTER_ALIASES) {
    if (character.names.some((name) => text.includes(name))) {
      ids.push(character.id)
    }
  }
  return Array.from(new Set(ids))
}

export function extractMomentContent(text) {
  const match = text.match(/(?:发(?:一条|个)?(?:朋友圈|动态|说说)|朋友圈发|动态发|发到朋友圈)\s*(?:内容)?(?:是|为)?\s*[：:，,]?\s*([\s\S]+)/)
  const raw = match?.[1] || ''
  return cleanSocialActionText(raw)
}

export function extractRoomTopic(text) {
  const colonTopic = cleanSocialActionText(text.split(/[:：]/).slice(1).join('：'))
  if (colonTopic) return truncateToolText(colonTopic, 36)

  const match = text.match(/(?:聊聊|聊一下|说说|讨论|谈谈|围绕|关于)\s*([\s\S]+)/)
  const topic = cleanSocialActionText(match?.[1] || '')
  return truncateToolText(topic || '今天的小窝日常', 36)
}

export function cleanSocialActionText(value) {
  return normalizeToolText(value)
    .replace(/^(一下|一下子|内容|是|为|：|:|，|,|。|\s)+/, '')
    .replace(/(可以吗|好不好|行不行|吧|啦|呀|哦|哈|qaq|QAQ)$/g, '')
    .trim()
    .slice(0, 520)
}

export function findRoomByMembers(memberCharacterIds) {
  const memberSet = new Set(memberCharacterIds)
  return CP_ROOM_BY_MEMBERS.find((room) => room.members.every((memberId) => memberSet.has(memberId)))
}

export function getCharacterDisplayName(characterId) {
  const character = CHARACTER_ALIASES.find((item) => item.id === characterId)
  return character?.names[0] || '角色'
}

export function inferMomentMood(text, content) {
  if (/雨|哭|难过|怕|疼|累|困/.test(`${text}${content}`)) return '柔软时刻'
  if (/甜|喜欢|开心|好看|可爱|贴贴/.test(`${text}${content}`)) return '粉色心情'
  if (/设定|世界观|角色|CP|cp/.test(`${text}${content}`)) return '设定手账'
  return '小动态'
}

export function buildRoomLine(characterId, topic) {
  const subject = truncateToolText(topic || '今天的小窝日常', 32)
  const lines = {
    'ningan-princess': `本郡主听见了。${subject}这件事，先说清楚，我只是顺路过问。`,
    'aling-maid': `小姐若在意${subject}，阿绫便记下。奴婢会守着，不让它扰到小姐。`,
    'su-wanyin': `${subject}若要细谈，先慢慢说。急处容易乱，我陪你们一件件理清。`,
    'xie-zhao': `${subject}？听着倒有意思。小晚吟别皱眉，我这回会认真听。`,
    'shen-wanci': `${subject}既已提起，便按规矩说完整。含糊试探，只会误事。`,
    'lu-wanzhao': `娘娘说要完整，那婉昭便乖些。只是${subject}里藏着的心意，也该有人看见呀。`,
    'sister-architect': `姐姐把${subject}先放到群里，等她们各自接住。`,
  }

  return lines[characterId] || `${getCharacterDisplayName(characterId)}围绕「${subject}」留下了一句回应。`
}
