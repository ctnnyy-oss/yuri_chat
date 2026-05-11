import type {
  CharacterCard,
  ConversationState,
  LongTermMemory,
  MemoryKind,
  MemoryLayer,
  MemoryMentionPolicy,
  MemoryScope,
} from '../src/domain/types'
import {
  buildMemorySemanticSignature,
  MEMORY_SEMANTIC_SIGNATURE_VERSION,
} from '../src/services/memoryVectorIndex'

export interface MemoryEvalCase {
  name: string
  query: string
  expected: string[]
  topN?: number
}

export const memories: LongTermMemory[] = [
  memory({
    id: 'architecture',
    title: '架构优先',
    body: '妹妹担心项目变成代码屎山，希望姐姐把模块边界和地基整理好，方便长期迭代。',
    tags: ['架构', '模块化', '迭代'],
    kind: 'procedure',
    layer: 'stable',
    priority: 5,
    pinned: true,
  }),
  memory({
    id: 'tone',
    title: '姐姐与妹妹的相处方式',
    body: '妹妹希望姐姐宠溺但靠谱，少反问，能推进就主动推进，同时不要阿谀奉承。',
    tags: ['语气', '姐姐', '少追问'],
    kind: 'relationship',
    layer: 'stable',
    scope: { kind: 'relationship', characterId: 'sister' },
    priority: 5,
    pinned: true,
  }),
  memory({
    id: 'yuri-boundary',
    title: '百合红线',
    body: '所有 CP 必须双洁，男性角色不能抢情感主线，不写伪百合。',
    tags: ['百合', 'CP', '双洁'],
    kind: 'procedure',
    layer: 'stable',
    priority: 5,
  }),
  memory({
    id: 'model-provider',
    title: '模型接入方向',
    body: '项目要能接入国内模型、国外模型、中转站和 OpenAI-compatible 供应商，前端不能保存 API Key。',
    tags: ['模型', 'API Key', '中转'],
    kind: 'project',
    layer: 'stable',
    priority: 4,
  }),
  memory({
    id: 'attachment-boundary',
    title: '文档图片能力边界',
    body: '当前聊天框图片、拍摄和文件按钮还没有接入上传、OCR、PDF/DOCX 解析或多模态图片理解。',
    tags: ['文档', '图片', 'PDF', '截图'],
    kind: 'project',
    layer: 'stable',
    priority: 4,
  }),
  memory({
    id: 'holiday-progress',
    title: '五一假期开发进展',
    body: '5月1日到5月5日重点开发了初步记忆系统和初步 Agent 工具能力。',
    tags: ['五一', '记忆系统', 'Agent'],
    kind: 'event',
    layer: 'episode',
    priority: 3,
    accessCount: 2,
  }),
  memory({
    id: 'holiday-agent-memory-focus',
    title: '假期核心开发重点',
    body: '五一长假里，项目核心集中在记忆系统和 Agent 工具能力两个方向。',
    tags: ['五一', '记忆系统', 'Agent'],
    kind: 'event',
    layer: 'episode',
    priority: 3,
    sourceGroup: 'holiday',
  }),
  memory({
    id: 'holiday-cloud-note',
    title: '假期云服务器提醒',
    body: '妹妹提到云服务器也应该纳入后续重点，尤其是记忆同步、任务响应和充值式服务那种秒级反馈体验。',
    tags: ['五一', '云服务器', '记忆系统'],
    kind: 'project',
    layer: 'stable',
    priority: 3,
    sourceGroup: 'holiday',
  }),
  memory({
    id: 'quiet-contextual',
    title: '旧设定碎片',
    body: '妹妹曾经提过希望旧设定即使暂时没有关键词命中，也能在明确回忆旧事时被找回。',
    tags: ['旧设定', '回忆'],
    kind: 'event',
    layer: 'episode',
    priority: 3,
    mentionPolicy: 'contextual',
  }),
  memory({
    id: 'silent-private',
    title: '只做边界的静默记忆',
    body: '这条记忆不应该在普通回忆模式里被主动召回。',
    tags: ['静默'],
    kind: 'profile',
    layer: 'stable',
    priority: 5,
    mentionPolicy: 'silent',
  }),
  memory({
    id: 'repeated-default',
    title: '重复确认的默认推进偏好',
    body: '妹妹多次确认希望姐姐在低风险任务里少追问，能推进就按保守默认方案直接推进。',
    tags: ['默认推进', '少追问'],
    kind: 'preference',
    layer: 'stable',
    priority: 4,
    sourceCount: 3,
  }),
  memory({
    id: 'may5-memory-target',
    title: '五一最后一天的记忆目标',
    body: '当天妹妹把下一阶段目标改成让记忆系统达到人类记忆 80% 以上，并要求没有达到门槛不能停。',
    tags: ['五一', '最后一天', '记忆系统'],
    kind: 'event',
    layer: 'episode',
    priority: 3,
    createdAt: '2026-05-05T04:20:00.000Z',
  }),
  memory({
    id: 'memory-anxiety',
    title: '妹妹对遗忘的核心焦虑',
    body: '妹妹超级担心陪伴应用过几天、过几周、过几年就忘记重要旧事，希望记忆能力无限接近真人。',
    tags: ['记忆系统', '焦虑', '长期记忆'],
    kind: 'reflection',
    layer: 'episode',
    priority: 2,
  }),
  memory({
    id: 'neutral-roadmap',
    title: '普通项目路线图',
    body: '项目后续可以继续完善页面、样式、模型接入和部署流程。',
    tags: ['项目', '路线图'],
    kind: 'project',
    layer: 'stable',
    priority: 5,
  }),
]

export const cases: MemoryEvalCase[] = [
  {
    name: 'recalls architecture concern with different wording',
    query: '你还记得我之前担心代码以后会乱成一团吗？',
    expected: ['architecture'],
    topN: 5,
  },
  {
    name: 'semantic vector recalls maintainability paraphrase',
    query: '我是不是说过怕以后这个项目没人能维护？',
    expected: ['architecture'],
    topN: 5,
  },
  {
    name: 'vector index recalls long horizon forgetting',
    query: '以后隔很久再聊，这个小窝还会不会把关键往事弄丢？',
    expected: ['memory-anxiety'],
    topN: 6,
  },
  {
    name: 'recalls relationship tone preference',
    query: '上次我说希望姐姐怎么跟妹妹说话来着？',
    expected: ['tone'],
    topN: 5,
  },
  {
    name: 'recalls yuri boundary',
    query: '以前的百合 CP 底线是什么？',
    expected: ['yuri-boundary'],
    topN: 5,
  },
  {
    name: 'recalls model provider plan',
    query: '我之前说模型供应商和中转站要怎么支持？',
    expected: ['model-provider'],
    topN: 6,
  },
  {
    name: 'recalls attachment boundary',
    query: '还记得现在看截图、PDF、Word 文件有什么限制吗？',
    expected: ['attachment-boundary'],
    topN: 6,
  },
  {
    name: 'recalls holiday episode when asking old progress',
    query: '五一假期我们主要开发过什么？',
    expected: ['holiday-progress'],
    topN: 8,
  },
  {
    name: 'associative recall follows holiday source links',
    query: '假期最后一天我提到服务器和记忆要怎么配合？',
    expected: ['holiday-cloud-note'],
    topN: 10,
  },
  {
    name: 'recall mode relaxes contextual memories',
    query: '你还记得以前有没有什么旧设定吗？',
    expected: ['quiet-contextual'],
    topN: 10,
  },
  {
    name: 'repeated evidence strengthens recall',
    query: '以前我是不是多次说过低风险任务别总问我？',
    expected: ['repeated-default'],
    topN: 5,
  },
  {
    name: 'temporal cue recalls may fifth memory target',
    query: '5月5号五一最后一天，我把记忆目标改成了什么？',
    expected: ['may5-memory-target'],
    topN: 6,
  },
  {
    name: 'emotional salience recalls fear of forgetting',
    query: '我最焦虑最放不下的记忆问题是什么？',
    expected: ['memory-anxiety'],
    topN: 5,
  },
]

export const testCharacter: CharacterCard = {
  id: 'sister',
  name: '姐姐大人',
  title: '测试角色',
  subtitle: '测试角色',
  avatar: '姐',
  accent: '#ef9ac6',
  relationship: '姐姐',
  mood: '测试',
  tags: ['测试'],
  systemPrompt: '测试角色',
  greeting: '测试角色',
}

export function testConversation(id: string, createdAt = '2026-05-05T06:10:00.000Z'): ConversationState {
  return {
    id,
    characterId: 'sister',
    messages: [],
    summary: '',
    updatedAt: createdAt,
  }
}

export function memory(input: {
  id: string
  title: string
  body: string
  tags: string[]
  kind: MemoryKind
  layer: MemoryLayer
  priority: number
  pinned?: boolean
  scope?: MemoryScope
  mentionPolicy?: MemoryMentionPolicy
  accessCount?: number
  sourceCount?: number
  sourceGroup?: string
  createdAt?: string
  memoryStrength?: number
  emotionalSalience?: number
}): LongTermMemory {
  const createdAt = input.createdAt ?? '2026-05-01T00:00:00.000Z'
  const semanticSignature = buildMemorySemanticSignature(`${input.title} ${input.body} ${input.tags.join(' ')}`)
  return {
    id: input.id,
    title: input.title,
    body: input.body,
    tags: input.tags,
    priority: input.priority,
    pinned: input.pinned ?? false,
    kind: input.kind,
    status: 'active',
    layer: input.layer,
    scope: input.scope ?? { kind: 'global_user' },
    sensitivity: 'low',
    mentionPolicy: input.mentionPolicy ?? 'contextual',
    confidence: 0.95,
    origin: 'manual',
    sources: Array.from({ length: input.sourceCount ?? 1 }, (_, index) => ({
      id: `source-${input.id}-${index}`,
      kind: 'manual' as const,
      excerpt: input.body,
      createdAt,
      conversationId: input.sourceGroup,
    })),
    accessCount: input.accessCount ?? 0,
    memoryStrength: input.memoryStrength ?? 0.55,
    emotionalSalience: input.emotionalSalience ?? 0.35,
    semanticSignature,
    semanticSignatureVersion: MEMORY_SEMANTIC_SIGNATURE_VERSION,
    reviewIntervalDays: 7,
    nextReviewAt: '2026-05-08T00:00:00.000Z',
    revisions: [],
    createdAt,
    updatedAt: createdAt,
  }
}
