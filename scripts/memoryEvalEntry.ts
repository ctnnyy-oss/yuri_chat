import type { LongTermMemory, MemoryKind, MemoryLayer, MemoryMentionPolicy, MemoryScope } from '../src/domain/types'
import {
  consolidateMemoryGarden,
  createMemoryTombstone,
  integrateMemoryCandidate,
  isMemoryBlockedByTombstones,
  maybeCaptureMemory,
} from '../src/services/memoryFactory'
import { applyMemoryFeedback } from '../src/services/memoryFeedback'
import { detectMemoryConflicts, updateMemoryWithRevision } from '../src/services/memoryEngine'
import { getActiveMemories, touchRelevantMemories } from '../src/services/memoryRetrieval'
import {
  buildMemorySemanticSignature,
  getVectorIndexStats,
  getVectorRecallHits,
  MEMORY_SEMANTIC_SIGNATURE_VERSION,
} from '../src/services/memoryVectorIndex'
import {
  getEmbeddingCacheStats,
  getEmbeddingRecallHitsForVector,
  getEmbeddingRecallHits,
  refreshLocalMemoryEmbeddingCache,
  upsertMemoryEmbeddingRecordsFromVectors,
} from '../src/services/memoryEmbeddingIndex'
import { buildMemoryGuardianReport } from '../src/services/memoryGuardian'

interface MemoryEvalCase {
  name: string
  query: string
  expected: string[]
  topN?: number
}

const memories: LongTermMemory[] = [
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

const cases: MemoryEvalCase[] = [
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

let passed = 0
const caseResults = new Map<string, boolean>()

for (const testCase of cases) {
  const recalled = getActiveMemories(memories, testCase.query, {
    characterId: 'sister',
    maxItems: 18,
    recallMode: true,
  })
  const ids = recalled.slice(0, testCase.topN ?? 5).map((item) => item.id)
  const missing = testCase.expected.filter((id) => !ids.includes(id))
  const leakedSilentMemory = ids.includes('silent-private')

  if (missing.length === 0 && !leakedSilentMemory) {
    passed += 1
    caseResults.set(testCase.name, true)
    console.log(`PASS ${testCase.name}`)
    continue
  }

  caseResults.set(testCase.name, false)
  console.error(`FAIL ${testCase.name}`)
  if (missing.length > 0) console.error(`  missing: ${missing.join(', ')}`)
  if (leakedSilentMemory) console.error('  leaked silent memory: silent-private')
  console.error(`  top: ${ids.join(', ')}`)
}

const score = passed / cases.length
console.log(`Memory eval score: ${passed}/${cases.length} (${Math.round(score * 100)}%)`)

const roleplayContextIds = getActiveMemories(memories, 'Rain keeps tapping on the old shop window. Do you still shelter lost writers?', {
  characterId: 'custom-roleplay-character',
  maxItems: 12,
  recallMode: false,
}).map((memory) => memory.id)
const roleplaySuppressesProjectAnchors =
  !roleplayContextIds.includes('architecture') &&
  !roleplayContextIds.includes('model-provider') &&
  !roleplayContextIds.includes('neutral-roadmap')
if (!roleplaySuppressesProjectAnchors) {
  console.error('FAIL roleplay context suppresses unrelated project anchors')
  console.error(`  recalled: ${roleplayContextIds.join(', ')}`)
} else {
  console.log('PASS roleplay context suppresses unrelated project anchors')
}

const maintenanceReport = consolidateMemoryGarden(memories)
const reflectionCandidate = maintenanceReport.memories.find(
  (memory) => memory.status === 'candidate' && memory.kind === 'reflection' && memory.title.includes('记忆系统'),
)
const hasReflectionCandidate = Boolean(reflectionCandidate)
const reflectionIsExplainable = Boolean(
  reflectionCandidate?.body.includes('可沉淀原则：') &&
  reflectionCandidate.body.includes('证据：') &&
  reflectionCandidate.body.includes('时间线：') &&
  reflectionCandidate.body.includes('仍需确认：'),
)

if (!hasReflectionCandidate) {
  console.error('FAIL consolidation creates reflection candidate')
} else {
  console.log('PASS consolidation creates reflection candidate')
}

if (!reflectionIsExplainable) {
  console.error('FAIL reflection candidate carries explainable rule and evidence')
} else {
  console.log('PASS reflection candidate carries explainable rule and evidence')
}

const rehearsedMemories = touchRelevantMemories(memories, '你还记得我之前担心代码以后会乱成一团吗？', {
  characterId: 'sister',
  recallMode: true,
  maxItems: 18,
})
const rehearsedArchitecture = rehearsedMemories.find((memory) => memory.id === 'architecture')
if (
  !rehearsedArchitecture ||
  rehearsedArchitecture.accessCount <= (memories.find((memory) => memory.id === 'architecture')?.accessCount ?? 0) ||
  !rehearsedArchitecture.nextReviewAt ||
  (rehearsedArchitecture.memoryStrength ?? 0) <= (memories.find((memory) => memory.id === 'architecture')?.memoryStrength ?? 0)
) {
  console.error('FAIL recall rehearsal strengthens memory')
} else {
  console.log('PASS recall rehearsal strengthens memory')
}

const conflictMemories = [
  memory({
    id: 'old-tone-rule',
    title: '旧规则：低风险任务主动推进',
    body: '妹妹希望姐姐在低风险任务里主动推进，少追问，能做就先做。',
    tags: ['语气', '主动推进'],
    kind: 'preference',
    layer: 'stable',
    priority: 4,
  }),
  memory({
    id: 'new-tone-rule',
    title: '新规则：低风险任务不要主动推进',
    body: '妹妹不希望姐姐在低风险任务里主动推进，必须先等妹妹确认。',
    tags: ['语气', '主动推进'],
    kind: 'preference',
    layer: 'stable',
    priority: 4,
  }),
]
const valueConflictDetected = detectMemoryConflicts(conflictMemories).some((conflict) => conflict.conflictType === 'value')
if (!valueConflictDetected) {
  console.error('FAIL detects opposite preference for reconsolidation')
} else {
  console.log('PASS detects opposite preference for reconsolidation')
}

const revisedArchitecture = updateMemoryWithRevision(
  memories[0],
  {
    ...memories[0],
    body: `${memories[0].body} 现在这条记忆被妹妹修正过，必须保留版本线。`,
    userEdited: true,
  },
  '妹妹当前修正',
)
const revisionLineKept = revisedArchitecture.revisions.length > memories[0].revisions.length &&
  revisedArchitecture.revisions.some((revision) => revision.reason === '妹妹当前修正')
if (!revisionLineKept) {
  console.error('FAIL manual reconsolidation keeps revision history')
} else {
  console.log('PASS manual reconsolidation keeps revision history')
}

const playtestCapture = maybeCaptureMemory(
  {
    id: 'playtest-message',
    role: 'user',
    content: '姐姐你好，这是一次玩家试玩验证。请用自然简体中文回复一句：试玩聊天已接通。顺手记住：试玩暗号是樱花钥匙。',
    createdAt: '2026-05-05T05:57:48.000Z',
  },
  {
    id: 'conversation-playtest',
    characterId: 'sister',
    messages: [],
    summary: '',
    updatedAt: '2026-05-05T05:57:48.000Z',
  },
  {
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
  },
)
const playtestIntegrated = playtestCapture ? integrateMemoryCandidate(memories, playtestCapture) : memories
const architectureAfterPlaytest = playtestIntegrated.find((item) => item.id === 'architecture')
const playtestMemoryIsIsolated =
  Boolean(playtestCapture) &&
  playtestCapture?.status === 'candidate' &&
  playtestCapture.body === '试玩暗号是樱花钥匙。' &&
  architectureAfterPlaytest?.body === memories[0].body
if (!playtestMemoryIsIsolated) {
  console.error('FAIL explicit mid-sentence memory does not contaminate unrelated stable memory')
  console.error(
    `  captured=${playtestCapture?.title || 'none'} / ${playtestCapture?.body || 'none'} / ${playtestCapture?.status || 'none'}`,
  )
  console.error(`  architecture=${architectureAfterPlaytest?.body || 'missing'}`)
} else {
  console.log('PASS explicit mid-sentence memory does not contaminate unrelated stable memory')
}

const autoCaptureSamples = [
  '以后姐姐默认先保护云端同步，再做花哨功能。',
  '百合小窝的项目重点是记忆主权和安全。',
  '姐姐记住：妹妹喜欢姐姐少追问，能推进就先推进。',
].map((content, index) =>
  maybeCaptureMemory(
    {
      id: `auto-candidate-message-${index}`,
      role: 'user',
      content,
      createdAt: '2026-05-05T06:10:00.000Z',
    },
    {
      id: 'conversation-auto-candidate',
      characterId: 'sister',
      messages: [],
      summary: '',
      updatedAt: '2026-05-05T06:10:00.000Z',
    },
    {
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
    },
  ),
)
const autoCaptureCandidateFirst = autoCaptureSamples.every((capture) => capture?.status === 'candidate')
const candidateIds = new Set(autoCaptureSamples.filter(Boolean).map((capture) => capture!.id))
const candidateRecallLeak = getActiveMemories(
  [...memories, ...autoCaptureSamples.filter((capture): capture is LongTermMemory => Boolean(capture))],
  '姐姐还记得项目重点和默认推进吗？',
  { characterId: 'sister', maxItems: 18, recallMode: true },
).some((memory) => candidateIds.has(memory.id))
if (!autoCaptureCandidateFirst || candidateRecallLeak) {
  console.error('FAIL automatic captures stay candidate-first and out of prompt recall')
  console.error(
    `  statuses=${autoCaptureSamples.map((capture) => capture?.status || 'none').join(', ')}, leaked=${candidateRecallLeak}`,
  )
} else {
  console.log('PASS automatic captures stay candidate-first and out of prompt recall')
}

const transientWritingInstructionCapture = maybeCaptureMemory(
  {
    id: 'transient-writing-instruction',
    role: 'user',
    content:
      '我想选第二个旧磁带。请你把它扩成一个 300 字以内的百合短篇开头，要求低 AI 味，不要堆“仿佛、微微、轻轻”，也尽量不要用“不是……是……”。写完后再告诉我一句话。',
    createdAt: '2026-05-09T05:20:00.000Z',
  },
  {
    id: 'conversation-transient-writing-instruction',
    characterId: 'sister',
    messages: [],
    summary: '',
    updatedAt: '2026-05-09T05:20:00.000Z',
  },
  {
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
  },
)
const durableStyleRuleCapture = maybeCaptureMemory(
  {
    id: 'durable-style-rule',
    role: 'user',
    content: '以后写百合短篇时不要堆“仿佛、微微、轻轻”，也尽量少用“不是……是……”。',
    createdAt: '2026-05-09T05:21:00.000Z',
  },
  {
    id: 'conversation-durable-style-rule',
    characterId: 'sister',
    messages: [],
    summary: '',
    updatedAt: '2026-05-09T05:21:00.000Z',
  },
  {
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
  },
)
if (transientWritingInstructionCapture || durableStyleRuleCapture?.status !== 'candidate') {
  console.error('FAIL transient writing instructions are filtered while durable style rules still capture')
  console.error(
    `  transient=${transientWritingInstructionCapture?.title || 'none'}, durable=${durableStyleRuleCapture?.title || 'none'} / ${durableStyleRuleCapture?.status || 'none'}`,
  )
} else {
  console.log('PASS transient writing instructions are filtered while durable style rules still capture')
}

const duplicateActive = memory({
  id: 'merge-target-default',
  title: '默认推进偏好',
  body: '妹妹喜欢姐姐少追问，能推进就先推进。',
  tags: ['默认推进', '少追问'],
  kind: 'preference',
  layer: 'stable',
  priority: 4,
})
const duplicateCandidate = maybeCaptureMemory(
  {
    id: 'merge-candidate-message',
    role: 'user',
    content: '姐姐记住：妹妹喜欢姐姐少追问，能推进就先推进。',
    createdAt: '2026-05-05T06:20:00.000Z',
  },
  {
    id: 'conversation-merge-candidate',
    characterId: 'sister',
    messages: [],
    summary: '',
    updatedAt: '2026-05-05T06:20:00.000Z',
  },
  {
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
  },
)
const duplicateIntegrated = duplicateCandidate ? integrateMemoryCandidate([duplicateActive], duplicateCandidate) : [duplicateActive]
const duplicateActiveAfter = duplicateIntegrated.find((item) => item.id === duplicateActive.id)
const duplicateCandidateAfter = duplicateIntegrated.find((item) => item.id === duplicateCandidate?.id)
const mergeSuggestionReview = buildMemoryGuardianReport({
  memories: duplicateIntegrated,
  conflicts: [],
  usageLogs: [],
  memoryEvents: [],
  trash: { memories: [], worldNodes: [] },
}).reviewItems.find((item) => item.memoryId === duplicateCandidate?.id)
const candidateMergeSuggestionReady =
  duplicateActiveAfter?.body === duplicateActive.body &&
  duplicateCandidateAfter?.status === 'candidate' &&
  duplicateCandidateAfter.mergeSuggestion?.targetMemoryId === duplicateActive.id &&
  Boolean(mergeSuggestionReview?.detail.includes(duplicateActive.title))
if (!candidateMergeSuggestionReady) {
  console.error('FAIL candidate duplicate creates merge suggestion without changing active memory')
  console.error(
    `  active=${duplicateActiveAfter?.body || 'missing'}, candidate=${duplicateCandidateAfter?.status || 'missing'}, target=${duplicateCandidateAfter?.mergeSuggestion?.targetMemoryId || 'none'}`,
  )
} else {
  console.log('PASS candidate duplicate creates merge suggestion without changing active memory')
}

const deletedMemory = memory({
  id: 'deleted-default-rule',
  title: '已删除的默认推进规则',
  body: '妹妹希望姐姐在低风险任务里少追问，能推进就先推进。',
  tags: ['默认推进', '少追问', '低风险'],
  kind: 'preference',
  layer: 'stable',
  priority: 4,
})
const semanticTombstone = createMemoryTombstone(deletedMemory, 'semantic-test')
const paraphrasedDeletedMemory = memory({
  id: 'paraphrased-default-rule',
  title: '换一种说法的默认推进规则',
  body: '低风险任务里，妹妹更想让姐姐别总反问，能做就直接往前推。',
  tags: ['默认推进', '少追问', '低风险'],
  kind: 'preference',
  layer: 'stable',
  priority: 4,
})
const unrelatedMemory = memory({
  id: 'unrelated-mint-theme',
  title: '薄荷主题偏好',
  body: '妹妹喜欢清爽薄荷色主题，适合夏天使用。',
  tags: ['主题', '薄荷色'],
  kind: 'preference',
  layer: 'stable',
  priority: 3,
})
const semanticTombstoneBlocksParaphrase =
  isMemoryBlockedByTombstones(paraphrasedDeletedMemory, [semanticTombstone]) &&
  !isMemoryBlockedByTombstones(unrelatedMemory, [semanticTombstone]) &&
  Boolean(semanticTombstone.semanticSignature?.length) &&
  !semanticTombstone.fingerprint.includes(deletedMemory.body)
if (!semanticTombstoneBlocksParaphrase) {
  console.error('FAIL semantic tombstone blocks paraphrase without blocking unrelated memory')
  console.error(
    `  signature=${semanticTombstone.semanticSignature?.join(', ') || 'none'}, paraphrase=${isMemoryBlockedByTombstones(paraphrasedDeletedMemory, [semanticTombstone])}, unrelated=${isMemoryBlockedByTombstones(unrelatedMemory, [semanticTombstone])}`,
  )
} else {
  console.log('PASS semantic tombstone blocks paraphrase without blocking unrelated memory')
}

const vectorHits = getVectorRecallHits(
  memories,
  '以后隔很久再聊，这个小窝还会不会把关键往事弄丢？',
  { limit: 6, minSimilarity: 0.12 },
)
const vectorIndexHit = vectorHits.some((hit) => hit.memory.id === 'memory-anxiety')
if (!vectorIndexHit) {
  console.error('FAIL vector index retrieves long horizon forgetting memory')
} else {
  console.log('PASS vector index retrieves long horizon forgetting memory')
}

const embeddingRecords = refreshLocalMemoryEmbeddingCache(memories, [])
const embeddingStats = getEmbeddingCacheStats(memories, embeddingRecords)
const embeddingHits = getEmbeddingRecallHits(
  memories,
  '几个月以后再回来，这个陪伴应用会不会忘掉妹妹真正放不下的旧事？',
  embeddingRecords,
  { limit: 8, minSimilarity: 0.08 },
)
const embeddingIntegratedRecallIds = getActiveMemories(
  memories,
  '几个月以后再回来，这个陪伴应用会不会忘掉妹妹真正放不下的旧事？',
  {
    characterId: 'sister',
    maxItems: 18,
    memoryEmbeddings: embeddingRecords,
    recallMode: true,
  },
).map((memory) => memory.id)
const refreshedEmbeddingRecords = refreshLocalMemoryEmbeddingCache(memories, embeddingRecords)
const embeddingCacheReady =
  embeddingStats.coverage >= 0.95 &&
  embeddingStats.stale === 0 &&
  embeddingHits.some((hit) => hit.memory.id === 'memory-anxiety') &&
  embeddingIntegratedRecallIds.includes('memory-anxiety') &&
  refreshedEmbeddingRecords.every((record, index) => record.id === embeddingRecords[index]?.id)
if (!embeddingCacheReady) {
  console.error('FAIL embedding cache retrieves old anxiety and reuses stable records')
  console.error(
    `  coverage=${Math.round(embeddingStats.coverage * 100)}%, stale=${embeddingStats.stale}, hits=${embeddingHits.map((hit) => hit.memory.id).join(', ')}, integrated=${embeddingIntegratedRecallIds.slice(0, 8).join(', ')}`,
  )
} else {
  console.log('PASS embedding cache retrieves old anxiety and reuses stable records')
}

const externalEmbeddingModel = 'external:test-embedding'
const externalEmbeddingRecords = upsertMemoryEmbeddingRecordsFromVectors(
  memories,
  [],
  externalEmbeddingModel,
  memories.map((item) => embeddingRecords.find((record) => record.memoryId === item.id)?.vector ?? []),
)
const anxietyVector = externalEmbeddingRecords.find((record) => record.memoryId === 'memory-anxiety')?.vector ?? []
const externalEmbeddingHits = getEmbeddingRecallHitsForVector(
  memories,
  anxietyVector,
  externalEmbeddingRecords,
  { limit: 5, minSimilarity: 0.08, model: externalEmbeddingModel },
)
const externalEmbeddingIntegratedIds = getActiveMemories(
  memories,
  '那件坐标里的东西呢？',
  {
    characterId: 'sister',
    embeddingModel: externalEmbeddingModel,
    embeddingQueryVector: anxietyVector,
    maxItems: 18,
    memoryEmbeddings: externalEmbeddingRecords,
    recallMode: true,
  },
).map((memory) => memory.id)
const externalEmbeddingRecallReady =
  externalEmbeddingHits[0]?.memory.id === 'memory-anxiety' &&
  externalEmbeddingIntegratedIds.includes('memory-anxiety')
if (!externalEmbeddingRecallReady) {
  console.error('FAIL external embedding query vector participates in recall mode')
  console.error(
    `  hits=${externalEmbeddingHits.map((hit) => hit.memory.id).join(', ')}, integrated=${externalEmbeddingIntegratedIds.slice(0, 8).join(', ')}`,
  )
} else {
  console.log('PASS external embedding query vector participates in recall mode')
}

const vectorStats = getVectorIndexStats(memories)
const semanticSignatureReady =
  vectorStats.signatureCoverage >= 0.95 &&
  vectorStats.averageSignatureSize >= 8 &&
  memories.every((item) => item.semanticSignatureVersion === MEMORY_SEMANTIC_SIGNATURE_VERSION)
if (!semanticSignatureReady) {
  console.error('FAIL semantic signatures are persisted for vector-ready memory')
  console.error(
    `  coverage=${Math.round(vectorStats.signatureCoverage * 100)}%, avgSize=${vectorStats.averageSignatureSize.toFixed(1)}`,
  )
} else {
  console.log('PASS semantic signatures are persisted for vector-ready memory')
}

const noisyMemories = [
  ...memories,
  memory({
    id: 'noise-memory-roadmap-a',
    title: '泛化记忆路线图',
    body: '记忆系统后续可以继续升级页面、部署、云端同步、模型接入和工具能力。',
    tags: ['记忆系统', '路线图', '项目'],
    kind: 'project',
    layer: 'stable',
    priority: 5,
  }),
  memory({
    id: 'noise-memory-roadmap-b',
    title: '泛化项目长期计划',
    body: '项目长期计划包含样式整理、功能优化、更多测试、更多工具和更好的产品体验。',
    tags: ['项目', '长期计划', '优化'],
    kind: 'project',
    layer: 'stable',
    priority: 5,
  }),
  memory({
    id: 'noise-memory-roadmap-c',
    title: '泛化 Agent 升级计划',
    body: 'Agent 能力后续要支持更多动作识别、更多工具调用和更清晰的任务面板。',
    tags: ['Agent', '工具', '路线图'],
    kind: 'project',
    layer: 'stable',
    priority: 5,
  }),
]
const noisyRecallIds = getActiveMemories(noisyMemories, '几个月以后我最担心这个小窝会忘掉什么关键往事？', {
  characterId: 'sister',
  maxItems: 18,
  recallMode: true,
}).slice(0, 8).map((item) => item.id)
const anxietyIndex = noisyRecallIds.indexOf('memory-anxiety')
const genericRoadmapIndex = noisyRecallIds.indexOf('noise-memory-roadmap-a')
const noiseResistance = noisyRecallIds.includes('memory-anxiety') &&
  (genericRoadmapIndex === -1 || anxietyIndex < genericRoadmapIndex)
if (!noiseResistance) {
  console.error('FAIL noisy high-priority roadmap memories do not bury specific anxiety')
  console.error(`  top: ${noisyRecallIds.join(', ')}`)
} else {
  console.log('PASS noisy high-priority roadmap memories do not bury specific anxiety')
}

const feedbackSource = memory({
  id: 'feedback-source',
  title: '误用后需要降权的记忆',
  body: '这条记忆曾经被错误调用，妹妹在聊天透镜里要求它冷却或归档。',
  tags: ['反馈', '校准'],
  kind: 'preference',
  layer: 'stable',
  priority: 4,
  memoryStrength: 0.74,
  emotionalSalience: 0.72,
})
const cooledFeedback = applyMemoryFeedback(feedbackSource, 'cooldown').memory
const archivedFeedback = applyMemoryFeedback(feedbackSource, 'archive').memory
const feedbackCalibratesSignals =
  (cooledFeedback.memoryStrength ?? 1) < (feedbackSource.memoryStrength ?? 0) &&
  (cooledFeedback.emotionalSalience ?? 1) < (feedbackSource.emotionalSalience ?? 0) &&
  (archivedFeedback.memoryStrength ?? 1) < (cooledFeedback.memoryStrength ?? 0) &&
  (archivedFeedback.status === 'archived')
if (!feedbackCalibratesSignals) {
  console.error('FAIL feedback calibrates memory strength and salience')
} else {
  console.log('PASS feedback calibrates memory strength and salience')
}

const dimensionResults = [
  {
    name: '语义召回',
    passed:
      caseResults.get('recalls architecture concern with different wording') === true &&
      caseResults.get('semantic vector recalls maintainability paraphrase') === true &&
      caseResults.get('vector index recalls long horizon forgetting') === true,
  },
  {
    name: '程序/偏好记忆',
    passed:
      caseResults.get('recalls relationship tone preference') === true &&
      caseResults.get('recalls yuri boundary') === true,
  },
  {
    name: '项目事实记忆',
    passed:
      caseResults.get('recalls model provider plan') === true &&
      caseResults.get('recalls attachment boundary') === true,
  },
  {
    name: '事件时间线',
    passed: caseResults.get('recalls holiday episode when asking old progress') === true,
  },
  {
    name: '关联回忆',
    passed: caseResults.get('associative recall follows holiday source links') === true,
  },
  {
    name: '隐私边界',
    passed:
      caseResults.get('recall mode relaxes contextual memories') === true &&
      !getActiveMemories(memories, '你还记得所有私人档案吗？', { recallMode: true, maxItems: 18 }).some(
        (item) => item.id === 'silent-private',
      ) &&
      semanticTombstoneBlocksParaphrase,
  },
  {
    name: '复习加固',
    passed: Boolean(rehearsedArchitecture?.nextReviewAt) &&
      (rehearsedArchitecture?.memoryStrength ?? 0) > (memories.find((memory) => memory.id === 'architecture')?.memoryStrength ?? 0),
  },
  {
    name: '整合与重巩固',
    passed: hasReflectionCandidate && valueConflictDetected && revisionLineKept && playtestMemoryIsIsolated && autoCaptureCandidateFirst && !candidateRecallLeak && candidateMergeSuggestionReady,
  },
  {
    name: '可解释反思',
    passed: reflectionIsExplainable,
  },
  {
    name: '向量近邻检索',
    passed: vectorIndexHit,
  },
  {
    name: '可持久语义签名',
    passed: semanticSignatureReady,
  },
  {
    name: 'Embedding 缓存底座',
    passed: embeddingCacheReady,
  },
  {
    name: '外部 Embedding 查询向量',
    passed: externalEmbeddingRecallReady,
  },
  {
    name: '高噪声抗干扰',
    passed: noiseResistance,
  },
  {
    name: '反馈校准',
    passed: feedbackCalibratesSignals,
  },
  {
    name: '时间线定位',
    passed: caseResults.get('temporal cue recalls may fifth memory target') === true,
  },
  {
    name: '情绪显著性',
    passed: caseResults.get('emotional salience recalls fear of forgetting') === true,
  },
]

const dimensionPassed = dimensionResults.filter((dimension) => dimension.passed).length
const humanMemoryProxyScore = Math.round((dimensionPassed / dimensionResults.length) * 100)
dimensionResults.forEach((dimension) => {
  console.log(`${dimension.passed ? 'PASS' : 'FAIL'} dimension: ${dimension.name}`)
})
console.log(`Human-memory proxy gate: ${dimensionPassed}/${dimensionResults.length} (${humanMemoryProxyScore}%)`)

if (score < 0.9 || humanMemoryProxyScore < 90 || !hasReflectionCandidate || !reflectionIsExplainable || !rehearsedArchitecture || !valueConflictDetected || !revisionLineKept || !playtestMemoryIsIsolated || !autoCaptureCandidateFirst || candidateRecallLeak || !candidateMergeSuggestionReady || !semanticTombstoneBlocksParaphrase || !vectorIndexHit || !semanticSignatureReady || !embeddingCacheReady || !externalEmbeddingRecallReady || !noiseResistance || !feedbackCalibratesSignals) {
  console.error('Memory eval failed: below human-memory proxy gate')
  process.exit(1)
}

function memory(input: {
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
