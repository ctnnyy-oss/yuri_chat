import { runCaptureChecks } from './memoryEvalCaptureChecks'
import { runHumanMemoryProxyGate } from './memoryEvalGate'
import { runRecallChecks } from './memoryEvalRecallChecks'
import { runVectorChecks } from './memoryEvalVectorChecks'

const recall = runRecallChecks()
const capture = runCaptureChecks()
const vector = runVectorChecks()
const humanMemoryProxyScore = runHumanMemoryProxyGate(recall, capture, vector)

if (
  recall.score < 0.9 ||
  humanMemoryProxyScore < 90 ||
  !recall.hasReflectionCandidate ||
  !recall.reflectionIsExplainable ||
  !recall.rehearsedArchitecture ||
  !recall.valueConflictDetected ||
  !recall.revisionLineKept ||
  !capture.playtestMemoryIsIsolated ||
  !capture.autoCaptureCandidateFirst ||
  capture.candidateRecallLeak ||
  !capture.candidateMergeSuggestionReady ||
  !capture.semanticTombstoneBlocksParaphrase ||
  !vector.vectorIndexHit ||
  !vector.semanticSignatureReady ||
  !vector.embeddingCacheReady ||
  !vector.externalEmbeddingRecallReady ||
  !vector.noiseResistance ||
  !vector.feedbackCalibratesSignals
) {
  console.error('Memory eval failed: below human-memory proxy gate')
  process.exit(1)
}
