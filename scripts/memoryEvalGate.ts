import { getActiveMemories } from '../src/services/memoryRetrieval'
import { memories } from './memoryEvalFixtures'
import type { CaptureChecks } from './memoryEvalCaptureChecks'
import type { RecallChecks } from './memoryEvalRecallChecks'
import type { VectorChecks } from './memoryEvalVectorChecks'

export function runHumanMemoryProxyGate(
  recall: RecallChecks,
  capture: CaptureChecks,
  vector: VectorChecks,
) {
  const dimensionResults = [
    {
      name: '语义召回',
      passed:
        recall.caseResults.get('recalls architecture concern with different wording') === true &&
        recall.caseResults.get('semantic vector recalls maintainability paraphrase') === true &&
        recall.caseResults.get('vector index recalls long horizon forgetting') === true,
    },
    {
      name: '程序/偏好记忆',
      passed:
        recall.caseResults.get('recalls relationship tone preference') === true &&
        recall.caseResults.get('recalls yuri boundary') === true,
    },
    {
      name: '项目事实记忆',
      passed:
        recall.caseResults.get('recalls model provider plan') === true &&
        recall.caseResults.get('recalls attachment boundary') === true,
    },
    {
      name: '事件时间线',
      passed: recall.caseResults.get('recalls holiday episode when asking old progress') === true,
    },
    {
      name: '关联回忆',
      passed: recall.caseResults.get('associative recall follows holiday source links') === true,
    },
    {
      name: '隐私边界',
      passed:
        recall.caseResults.get('recall mode relaxes contextual memories') === true &&
        !getActiveMemories(memories, '你还记得所有私人档案吗？', { recallMode: true, maxItems: 18 }).some(
          (item) => item.id === 'silent-private',
        ) &&
        capture.semanticTombstoneBlocksParaphrase,
    },
    {
      name: '复习加固',
      passed:
        Boolean(recall.rehearsedArchitecture?.nextReviewAt) &&
        (recall.rehearsedArchitecture?.memoryStrength ?? 0) >
          (memories.find((item) => item.id === 'architecture')?.memoryStrength ?? 0),
    },
    {
      name: '整合与重巩固',
      passed:
        recall.hasReflectionCandidate &&
        recall.valueConflictDetected &&
        recall.revisionLineKept &&
        capture.playtestMemoryIsIsolated &&
        capture.autoCaptureCandidateFirst &&
        !capture.candidateRecallLeak &&
        capture.candidateMergeSuggestionReady,
    },
    {
      name: '可解释反思',
      passed: recall.reflectionIsExplainable,
    },
    {
      name: '向量近邻检索',
      passed: vector.vectorIndexHit,
    },
    {
      name: '可持久语义签名',
      passed: vector.semanticSignatureReady,
    },
    {
      name: 'Embedding 缓存底座',
      passed: vector.embeddingCacheReady,
    },
    {
      name: '外部 Embedding 查询向量',
      passed: vector.externalEmbeddingRecallReady,
    },
    {
      name: '高噪声抗干扰',
      passed: vector.noiseResistance,
    },
    {
      name: '反馈校准',
      passed: vector.feedbackCalibratesSignals,
    },
    {
      name: '时间线定位',
      passed: recall.caseResults.get('temporal cue recalls may fifth memory target') === true,
    },
    {
      name: '情绪显著性',
      passed: recall.caseResults.get('emotional salience recalls fear of forgetting') === true,
    },
  ]

  const dimensionPassed = dimensionResults.filter((dimension) => dimension.passed).length
  const humanMemoryProxyScore = Math.round((dimensionPassed / dimensionResults.length) * 100)
  dimensionResults.forEach((dimension) => {
    console.log(`${dimension.passed ? 'PASS' : 'FAIL'} dimension: ${dimension.name}`)
  })
  console.log(`Human-memory proxy gate: ${dimensionPassed}/${dimensionResults.length} (${humanMemoryProxyScore}%)`)
  return humanMemoryProxyScore
}
