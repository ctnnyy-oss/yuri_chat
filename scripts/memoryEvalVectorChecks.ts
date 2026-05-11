import { applyMemoryFeedback } from '../src/services/memoryFeedback'
import {
  getEmbeddingCacheStats,
  getEmbeddingRecallHits,
  getEmbeddingRecallHitsForVector,
  refreshLocalMemoryEmbeddingCache,
  upsertMemoryEmbeddingRecordsFromVectors,
} from '../src/services/memoryEmbeddingIndex'
import { getActiveMemories } from '../src/services/memoryRetrieval'
import {
  getVectorIndexStats,
  getVectorRecallHits,
  MEMORY_SEMANTIC_SIGNATURE_VERSION,
} from '../src/services/memoryVectorIndex'
import { memories, memory } from './memoryEvalFixtures'

export interface VectorChecks {
  embeddingCacheReady: boolean
  externalEmbeddingRecallReady: boolean
  feedbackCalibratesSignals: boolean
  noiseResistance: boolean
  semanticSignatureReady: boolean
  vectorIndexHit: boolean
}

export function runVectorChecks(): VectorChecks {
  const vectorIndexHit = checkVectorRecall()
  const { embeddingCacheReady, externalEmbeddingRecallReady } = checkEmbeddingRecall()
  const semanticSignatureReady = checkSemanticSignatures()
  const noiseResistance = checkNoiseResistance()
  const feedbackCalibratesSignals = checkFeedbackCalibration()

  return {
    embeddingCacheReady,
    externalEmbeddingRecallReady,
    feedbackCalibratesSignals,
    noiseResistance,
    semanticSignatureReady,
    vectorIndexHit,
  }
}

function checkVectorRecall() {
  const vectorHits = getVectorRecallHits(
    memories,
    '以后隔很久再聊，这个小窝还会不会把关键往事弄丢？',
    { limit: 6, minSimilarity: 0.12 },
  )
  const passed = vectorHits.some((hit) => hit.memory.id === 'memory-anxiety')
  console[passed ? 'log' : 'error'](
    `${passed ? 'PASS' : 'FAIL'} vector index retrieves long horizon forgetting memory`,
  )
  return passed
}

function checkEmbeddingRecall() {
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
  ).map((item) => item.id)
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

  const externalEmbeddingRecallReady = checkExternalEmbeddingRecall(embeddingRecords)
  return { embeddingCacheReady, externalEmbeddingRecallReady }
}

function checkExternalEmbeddingRecall(embeddingRecords: ReturnType<typeof refreshLocalMemoryEmbeddingCache>) {
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
  ).map((item) => item.id)
  const passed =
    externalEmbeddingHits[0]?.memory.id === 'memory-anxiety' &&
    externalEmbeddingIntegratedIds.includes('memory-anxiety')
  if (!passed) {
    console.error('FAIL external embedding query vector participates in recall mode')
    console.error(
      `  hits=${externalEmbeddingHits.map((hit) => hit.memory.id).join(', ')}, integrated=${externalEmbeddingIntegratedIds.slice(0, 8).join(', ')}`,
    )
  } else {
    console.log('PASS external embedding query vector participates in recall mode')
  }
  return passed
}

function checkSemanticSignatures() {
  const vectorStats = getVectorIndexStats(memories)
  const passed =
    vectorStats.signatureCoverage >= 0.95 &&
    vectorStats.averageSignatureSize >= 8 &&
    memories.every((item) => item.semanticSignatureVersion === MEMORY_SEMANTIC_SIGNATURE_VERSION)
  if (!passed) {
    console.error('FAIL semantic signatures are persisted for vector-ready memory')
    console.error(
      `  coverage=${Math.round(vectorStats.signatureCoverage * 100)}%, avgSize=${vectorStats.averageSignatureSize.toFixed(1)}`,
    )
  } else {
    console.log('PASS semantic signatures are persisted for vector-ready memory')
  }
  return passed
}

function checkNoiseResistance() {
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
  const passed = noisyRecallIds.includes('memory-anxiety') && (genericRoadmapIndex === -1 || anxietyIndex < genericRoadmapIndex)
  if (!passed) {
    console.error('FAIL noisy high-priority roadmap memories do not bury specific anxiety')
    console.error(`  top: ${noisyRecallIds.join(', ')}`)
  } else {
    console.log('PASS noisy high-priority roadmap memories do not bury specific anxiety')
  }
  return passed
}

function checkFeedbackCalibration() {
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
  const passed =
    (cooledFeedback.memoryStrength ?? 1) < (feedbackSource.memoryStrength ?? 0) &&
    (cooledFeedback.emotionalSalience ?? 1) < (feedbackSource.emotionalSalience ?? 0) &&
    (archivedFeedback.memoryStrength ?? 1) < (cooledFeedback.memoryStrength ?? 0) &&
    archivedFeedback.status === 'archived'
  console[passed ? 'log' : 'error'](`${passed ? 'PASS' : 'FAIL'} feedback calibrates memory strength and salience`)
  return passed
}
