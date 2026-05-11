import {
  createMemoryTombstone,
  integrateMemoryCandidate,
  isMemoryBlockedByTombstones,
  maybeCaptureMemory,
} from '../src/services/memoryFactory'
import { buildMemoryGuardianReport } from '../src/services/memoryGuardian'
import { getActiveMemories } from '../src/services/memoryRetrieval'
import { memories, memory, testCharacter, testConversation } from './memoryEvalFixtures'

export interface CaptureChecks {
  autoCaptureCandidateFirst: boolean
  candidateMergeSuggestionReady: boolean
  candidateRecallLeak: boolean
  playtestMemoryIsIsolated: boolean
  semanticTombstoneBlocksParaphrase: boolean
}

export function runCaptureChecks(): CaptureChecks {
  const playtestMemoryIsIsolated = checkPlaytestCapture()
  const { autoCaptureCandidateFirst, candidateRecallLeak } = checkAutomaticCaptureCandidates()
  checkTransientInstructionFilter()
  const candidateMergeSuggestionReady = checkCandidateMergeSuggestion()
  const semanticTombstoneBlocksParaphrase = checkSemanticTombstone()

  return {
    autoCaptureCandidateFirst,
    candidateMergeSuggestionReady,
    candidateRecallLeak,
    playtestMemoryIsIsolated,
    semanticTombstoneBlocksParaphrase,
  }
}

function capture(content: string, id: string, createdAt = '2026-05-05T06:10:00.000Z') {
  return maybeCaptureMemory(
    { id, role: 'user', content, createdAt },
    testConversation(`conversation-${id}`, createdAt),
    testCharacter,
  )
}

function checkPlaytestCapture() {
  const playtestCapture = capture(
    '姐姐你好，这是一次玩家试玩验证。请用自然简体中文回复一句：试玩聊天已接通。顺手记住：试玩暗号是樱花钥匙。',
    'playtest-message',
    '2026-05-05T05:57:48.000Z',
  )
  const playtestIntegrated = playtestCapture ? integrateMemoryCandidate(memories, playtestCapture) : memories
  const architectureAfterPlaytest = playtestIntegrated.find((item) => item.id === 'architecture')
  const passed =
    Boolean(playtestCapture) &&
    playtestCapture?.status === 'candidate' &&
    playtestCapture.body === '试玩暗号是樱花钥匙。' &&
    architectureAfterPlaytest?.body === memories[0].body
  if (!passed) {
    console.error('FAIL explicit mid-sentence memory does not contaminate unrelated stable memory')
    console.error(
      `  captured=${playtestCapture?.title || 'none'} / ${playtestCapture?.body || 'none'} / ${playtestCapture?.status || 'none'}`,
    )
    console.error(`  architecture=${architectureAfterPlaytest?.body || 'missing'}`)
  } else {
    console.log('PASS explicit mid-sentence memory does not contaminate unrelated stable memory')
  }
  return passed
}

function checkAutomaticCaptureCandidates() {
  const autoCaptureSamples = [
    '以后姐姐默认先保护云端同步，再做花哨功能。',
    '百合小窝的项目重点是记忆主权和安全。',
    '姐姐记住：妹妹喜欢姐姐少追问，能推进就先推进。',
  ].map((content, index) => capture(content, `auto-candidate-message-${index}`))
  const autoCaptureCandidateFirst = autoCaptureSamples.every((item) => item?.status === 'candidate')
  const candidateIds = new Set(autoCaptureSamples.filter(Boolean).map((item) => item!.id))
  const candidateRecallLeak = getActiveMemories(
    [...memories, ...autoCaptureSamples.filter((item): item is NonNullable<typeof item> => Boolean(item))],
    '姐姐还记得项目重点和默认推进吗？',
    { characterId: 'sister', maxItems: 18, recallMode: true },
  ).some((item) => candidateIds.has(item.id))

  if (!autoCaptureCandidateFirst || candidateRecallLeak) {
    console.error('FAIL automatic captures stay candidate-first and out of prompt recall')
    console.error(
      `  statuses=${autoCaptureSamples.map((item) => item?.status || 'none').join(', ')}, leaked=${candidateRecallLeak}`,
    )
  } else {
    console.log('PASS automatic captures stay candidate-first and out of prompt recall')
  }
  return { autoCaptureCandidateFirst, candidateRecallLeak }
}

function checkTransientInstructionFilter() {
  const transientWritingInstructionCapture = capture(
    '我想选第二个旧磁带。请你把它扩成一个 300 字以内的百合短篇开头，要求低 AI 味，不要堆“仿佛、微微、轻轻”，也尽量不要用“不是……是……”。写完后再告诉我一句话。',
    'transient-writing-instruction',
    '2026-05-09T05:20:00.000Z',
  )
  const durableStyleRuleCapture = capture(
    '以后写百合短篇时不要堆“仿佛、微微、轻轻”，也尽量少用“不是……是……”。',
    'durable-style-rule',
    '2026-05-09T05:21:00.000Z',
  )
  if (transientWritingInstructionCapture || durableStyleRuleCapture?.status !== 'candidate') {
    console.error('FAIL transient writing instructions are filtered while durable style rules still capture')
    console.error(
      `  transient=${transientWritingInstructionCapture?.title || 'none'}, durable=${durableStyleRuleCapture?.title || 'none'} / ${durableStyleRuleCapture?.status || 'none'}`,
    )
  } else {
    console.log('PASS transient writing instructions are filtered while durable style rules still capture')
  }
}

function checkCandidateMergeSuggestion() {
  const duplicateActive = memory({
    id: 'merge-target-default',
    title: '默认推进偏好',
    body: '妹妹喜欢姐姐少追问，能推进就先推进。',
    tags: ['默认推进', '少追问'],
    kind: 'preference',
    layer: 'stable',
    priority: 4,
  })
  const duplicateCandidate = capture(
    '姐姐记住：妹妹喜欢姐姐少追问，能推进就先推进。',
    'merge-candidate-message',
    '2026-05-05T06:20:00.000Z',
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
  const passed =
    duplicateActiveAfter?.body === duplicateActive.body &&
    duplicateCandidateAfter?.status === 'candidate' &&
    duplicateCandidateAfter.mergeSuggestion?.targetMemoryId === duplicateActive.id &&
    Boolean(mergeSuggestionReview?.detail.includes(duplicateActive.title))

  if (!passed) {
    console.error('FAIL candidate duplicate creates merge suggestion without changing active memory')
    console.error(
      `  active=${duplicateActiveAfter?.body || 'missing'}, candidate=${duplicateCandidateAfter?.status || 'missing'}, target=${duplicateCandidateAfter?.mergeSuggestion?.targetMemoryId || 'none'}`,
    )
  } else {
    console.log('PASS candidate duplicate creates merge suggestion without changing active memory')
  }
  return passed
}

function checkSemanticTombstone() {
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
  const passed =
    isMemoryBlockedByTombstones(paraphrasedDeletedMemory, [semanticTombstone]) &&
    !isMemoryBlockedByTombstones(unrelatedMemory, [semanticTombstone]) &&
    Boolean(semanticTombstone.semanticSignature?.length) &&
    !semanticTombstone.fingerprint.includes(deletedMemory.body)
  if (!passed) {
    console.error('FAIL semantic tombstone blocks paraphrase without blocking unrelated memory')
    console.error(
      `  signature=${semanticTombstone.semanticSignature?.join(', ') || 'none'}, paraphrase=${isMemoryBlockedByTombstones(paraphrasedDeletedMemory, [semanticTombstone])}, unrelated=${isMemoryBlockedByTombstones(unrelatedMemory, [semanticTombstone])}`,
    )
  } else {
    console.log('PASS semantic tombstone blocks paraphrase without blocking unrelated memory')
  }
  return passed
}
