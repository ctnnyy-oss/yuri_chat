import type { LongTermMemory } from '../src/domain/types'
import { consolidateMemoryGarden } from '../src/services/memoryFactory'
import { detectMemoryConflicts, updateMemoryWithRevision } from '../src/services/memoryEngine'
import { getActiveMemories, touchRelevantMemories } from '../src/services/memoryRetrieval'
import { cases, memories, memory } from './memoryEvalFixtures'

export interface RecallChecks {
  caseResults: Map<string, boolean>
  hasReflectionCandidate: boolean
  passed: number
  reflectionIsExplainable: boolean
  rehearsedArchitecture?: LongTermMemory
  revisionLineKept: boolean
  roleplaySuppressesProjectAnchors: boolean
  score: number
  valueConflictDetected: boolean
}

export function runRecallChecks(): RecallChecks {
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

  const roleplaySuppressesProjectAnchors = checkRoleplayContext()
  const { hasReflectionCandidate, reflectionIsExplainable } = checkReflectionCandidate()
  const rehearsedArchitecture = checkRecallRehearsal()
  const valueConflictDetected = checkValueConflict()
  const revisionLineKept = checkRevisionHistory()

  return {
    caseResults,
    hasReflectionCandidate,
    passed,
    reflectionIsExplainable,
    rehearsedArchitecture,
    revisionLineKept,
    roleplaySuppressesProjectAnchors,
    score,
    valueConflictDetected,
  }
}

function checkRoleplayContext() {
  const roleplayMemories = [
    ...memories,
    memory({
      id: 'core-cp-world',
      title: '三对核心 CP 最新定稿',
      body: '沈朝歌与顾晚吟、闻霜寒与听露泣、故渊与池鱼是核心百合 CP，池鱼思故渊是第三对的典故。不要写成一见钟情，不加入男主情感主线。',
      tags: ['百合', 'CP', '修仙'],
      kind: 'world',
      layer: 'stable',
      priority: 5,
      pinned: true,
    }),
  ]
  const roleplayContextIds = getActiveMemories(roleplayMemories, '我把伞立在门边，听见你低声哼了一小段曲子。那叫什么名字？', {
    characterId: 'custom-roleplay-character',
    maxItems: 12,
    recallMode: false,
  }).map((item) => item.id)
  const passed =
    !roleplayContextIds.includes('architecture') &&
    !roleplayContextIds.includes('model-provider') &&
    !roleplayContextIds.includes('neutral-roadmap') &&
    !roleplayContextIds.includes('core-cp-world')
  if (!passed) {
    console.error('FAIL roleplay context suppresses unrelated project anchors')
    console.error(`  recalled: ${roleplayContextIds.join(', ')}`)
  } else {
    console.log('PASS roleplay context suppresses unrelated project anchors')
  }
  return passed
}

function checkReflectionCandidate() {
  const maintenanceReport = consolidateMemoryGarden(memories)
  const reflectionCandidate = maintenanceReport.memories.find(
    (item) => item.status === 'candidate' && item.kind === 'reflection' && item.title.includes('记忆系统'),
  )
  const hasReflectionCandidate = Boolean(reflectionCandidate)
  const reflectionIsExplainable = Boolean(
    reflectionCandidate?.body.includes('可沉淀原则：') &&
      reflectionCandidate.body.includes('证据：') &&
      reflectionCandidate.body.includes('时间线：') &&
      reflectionCandidate.body.includes('仍需确认：'),
  )

  console[hasReflectionCandidate ? 'log' : 'error'](
    `${hasReflectionCandidate ? 'PASS' : 'FAIL'} consolidation creates reflection candidate`,
  )
  console[reflectionIsExplainable ? 'log' : 'error'](
    `${reflectionIsExplainable ? 'PASS' : 'FAIL'} reflection candidate carries explainable rule and evidence`,
  )
  return { hasReflectionCandidate, reflectionIsExplainable }
}

function checkRecallRehearsal() {
  const rehearsedMemories = touchRelevantMemories(memories, '你还记得我之前担心代码以后会乱成一团吗？', {
    characterId: 'sister',
    recallMode: true,
    maxItems: 18,
  })
  const originalArchitecture = memories.find((item) => item.id === 'architecture')
  const rehearsedArchitecture = rehearsedMemories.find((item) => item.id === 'architecture')
  const passed =
    Boolean(rehearsedArchitecture) &&
    (rehearsedArchitecture?.accessCount ?? 0) > (originalArchitecture?.accessCount ?? 0) &&
    Boolean(rehearsedArchitecture?.nextReviewAt) &&
    (rehearsedArchitecture?.memoryStrength ?? 0) > (originalArchitecture?.memoryStrength ?? 0)
  console[passed ? 'log' : 'error'](`${passed ? 'PASS' : 'FAIL'} recall rehearsal strengthens memory`)
  return rehearsedArchitecture
}

function checkValueConflict() {
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
  const passed = detectMemoryConflicts(conflictMemories).some((conflict) => conflict.conflictType === 'value')
  console[passed ? 'log' : 'error'](`${passed ? 'PASS' : 'FAIL'} detects opposite preference for reconsolidation`)
  return passed
}

function checkRevisionHistory() {
  const revisedArchitecture = updateMemoryWithRevision(
    memories[0],
    {
      ...memories[0],
      body: `${memories[0].body} 现在这条记忆被妹妹修正过，必须保留版本线。`,
      userEdited: true,
    },
    '妹妹当前修正',
  )
  const passed =
    revisedArchitecture.revisions.length > memories[0].revisions.length &&
    revisedArchitecture.revisions.some((revision) => revision.reason === '妹妹当前修正')
  console[passed ? 'log' : 'error'](`${passed ? 'PASS' : 'FAIL'} manual reconsolidation keeps revision history`)
  return passed
}
