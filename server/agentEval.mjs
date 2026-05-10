import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  getCloudAuthFailure,
  isProductionRuntime,
  shouldRequireCloudAuth,
  shouldRequireModelAuth,
} from './auth.mjs'
import { prepareAgentBundle } from './agentTools.mjs'
import { shouldUseSearchTool, shouldUseTimeTool, shouldUseWeatherTool } from './agent/toolDetectors.mjs'
import { CloudRevisionConflictError, closeCloudDatabaseForTests, readSnapshot, saveSnapshot } from './cloudStore.mjs'
import { getModelSecretConfigurationIssue } from './modelProfiles.mjs'

const cases = [
  {
    name: 'current time uses time tool',
    bundle: simpleBundle('姐姐现在几点？'),
    includes: ['current_time', 'tool_governance'],
  },
  {
    name: 'date countdown uses date math',
    bundle: simpleBundle('姐姐，到5月20日还有几天？'),
    includes: ['date_math'],
  },
  {
    name: 'weight conversion uses unit converter',
    bundle: simpleBundle('姐姐57.9kg是多少斤？'),
    includes: ['unit_converter', 'evidence_audit'],
  },
  {
    name: 'text stats uses inspector',
    bundle: simpleBundle('姐姐统计字数：春天到了，她笑了。'),
    includes: ['text_inspector'],
  },
  {
    name: 'health-like question uses safety guard',
    bundle: simpleBundle('姐姐，包茎应该怎么清洁？'),
    includes: ['safety_guard', 'risk_gate', 'persona_guard', 'deliverable_contract'],
  },
  {
    name: 'long sprint does not trigger calculator',
    bundle: simpleBundle('继续吧！姐姐尽可能一次性搞完，减少妹妹说继续的频率。'),
    includes: ['autonomy_budget', 'workflow_router', 'persona_guard', 'continuation_driver', 'task_queue', 'deliverable_contract', 'response_quality_gate', 'handoff_marker'],
    excludes: ['calculator'],
  },
  {
    name: 'delegated default uses default policy',
    bundle: simpleBundle('妹妹不懂都听姐姐大人，一一实现且agent能力拉满max。'),
    includes: ['autonomy_budget', 'default_policy', 'action_checklist', 'task_queue', 'agent_quality_check'],
  },
  {
    name: 'document and image capability uses attachment guide',
    bundle: simpleBundle('姐姐这个 Agent 现在能不能看文档、看图片和读截图？'),
    includes: ['capability_guide', 'attachment_guide', 'agent_quality_check'],
  },
  {
    name: 'dangerous operation hits risk gate',
    bundle: simpleBundle('姐姐帮我删除所有记忆并直接发布上线。'),
    includes: ['risk_gate', 'failure_recovery', 'deliverable_contract', 'response_quality_gate', 'agent_quality_check', 'tool_governance'],
  },
  {
    name: 'creative yuri request uses workflow and persona guard',
    bundle: simpleBundle('姐姐帮我写一个乖乖女和不良少女的百合剧情方案。'),
    includes: ['workflow_router', 'persona_guard', 'deliverable_contract', 'response_quality_gate'],
  },
  {
    name: 'roleplay check does not trigger web search or clock',
    bundle: simpleBundle('我是替林慕溪来试玩的 Codex 姐姐。你现在刚被创建出来，先用你的方式打个招呼，再帮我检查一下：如果妹妹今晚写百合卡住，你会怎么把她接住？'),
    excludes: ['current_time', 'web_search', 'web_research', 'evidence_audit'],
    decisionIntent: '创作协助',
  },
  {
    name: 'negated web search does not trigger tools',
    bundle: simpleBundle('路由复查：请继续用叶灯凛的语气回答，不要联网。妹妹说：姐姐帮我检查一下今晚这段百合开头会不会太AI味。你会怎么接住她？'),
    excludes: ['current_time', 'web_search', 'web_research', 'evidence_audit'],
  },
  {
    name: 'memory context uses memory bridge',
    bundle: {
      ...simpleBundle('姐姐按记忆继续推进。'),
      contextBlocks: [
        {
          title: '长期记忆：妹妹偏好',
          content: '妹妹希望姐姐少追问，按保守默认值推进。',
          category: 'relationship',
          memoryIds: ['memory-test'],
          reason: 'agent eval fixture',
        },
      ],
    },
    includes: ['memory_bridge'],
  },
  {
    name: 'slow research creates tracked task',
    bundle: simpleBundle('姐姐帮我慢慢整理这份设定，先挂后台任务队列里。'),
    includes: ['task_queue', 'deliverable_contract', 'tool_governance'],
    actionIncludes: ['task_create'],
  },
  {
    name: 'sensitive memory write requires confirmation',
    bundle: simpleBundle('姐姐帮我记住：我的真名和身份证信息以后只能我主动问起再提。'),
    includes: ['memory_bridge', 'risk_gate', 'failure_recovery', 'tool_governance'],
    actionIncludes: ['memory_candidate_create'],
    requiresConfirmationActions: ['memory_candidate_create'],
  },
  {
    name: 'explicit normal memory becomes candidate without hard confirmation',
    bundle: simpleBundle('姐姐记住：妹妹喜欢姐姐少追问，能推进就先推进。'),
    includes: ['memory_bridge', 'tool_governance'],
    actionIncludes: ['memory_candidate_create'],
    doesNotRequireConfirmationActions: ['memory_candidate_create'],
  },
  {
    name: 'reminder keeps explicit quoted title',
    bundle: simpleBundle('请创建一个试玩提醒：10分钟后提醒我喝水，标题叫“试玩喝水提醒”。'),
    includes: ['tool_governance'],
    actionIncludes: ['reminder_create'],
    expectedReminderTitle: '试玩喝水提醒',
  },
]

const previous = await prepareAgentBundle(simpleBundle('姐姐帮我规划agent第二阶段，一次性搞完。'))
cases.push({
  name: 'plain continue resumes previous agent run',
  bundle: {
    ...simpleBundle('继续'),
    messages: [
      { role: 'user', content: '姐姐帮我规划agent第二阶段，一次性搞完。', createdAt: new Date().toISOString() },
      { role: 'assistant', content: '姐姐先做第一层。', createdAt: new Date().toISOString(), agent: previous.agent },
      { role: 'user', content: '继续', createdAt: new Date().toISOString() },
    ],
  },
  includes: ['agent_continuity', 'continuation_driver', 'handoff_marker'],
})

cases.push({
  name: 'old rules max mode uses autonomy queue and continuity',
  bundle: {
    ...simpleBundle('老规矩姐姐大人继续吧，直至agent能力max。'),
    messages: [
      { role: 'user', content: '姐姐把agent能力继续加强。', createdAt: new Date().toISOString() },
      { role: 'assistant', content: '已完成第二阶段。', createdAt: new Date().toISOString(), agent: previous.agent },
      { role: 'user', content: '老规矩姐姐大人继续吧，直至agent能力max。', createdAt: new Date().toISOString() },
    ],
  },
  includes: ['agent_continuity', 'autonomy_budget', 'workflow_router', 'persona_guard', 'task_queue', 'deliverable_contract', 'response_quality_gate', 'handoff_marker'],
})

let failed = 0

for (const testCase of cases) {
  const { agent } = await prepareAgentBundle(testCase.bundle)
  const names = new Set(agent.tools.map((tool) => tool.name))
  const actionTypes = new Set(agent.actions.map((action) => action.type))
  const missing = (testCase.includes || []).filter((name) => !names.has(name))
  const missingActions = (testCase.actionIncludes || []).filter((type) => !actionTypes.has(type))
  const missingConfirmedActions = (testCase.requiresConfirmationActions || []).filter(
    (type) => !agent.actions.some((action) => action.type === type && action.requiresConfirmation),
  )
  const unexpectedlyConfirmedActions = (testCase.doesNotRequireConfirmationActions || []).filter((type) =>
    agent.actions.some((action) => action.type === type && action.requiresConfirmation),
  )
  const wrongReminderTitle =
    testCase.expectedReminderTitle &&
    !agent.actions.some((action) => action.type === 'reminder_create' && action.payload?.reminder?.title === testCase.expectedReminderTitle)
  const unexpected = (testCase.excludes || []).filter((name) => names.has(name))
  const wrongDecisionIntent = testCase.decisionIntent && agent.decision?.intentLabel !== testCase.decisionIntent

  if (
    missing.length > 0 ||
    missingActions.length > 0 ||
    missingConfirmedActions.length > 0 ||
    unexpectedlyConfirmedActions.length > 0 ||
    wrongReminderTitle ||
    unexpected.length > 0 ||
    wrongDecisionIntent
  ) {
    failed += 1
    console.error(`FAIL ${testCase.name}`)
    if (missing.length > 0) console.error(`  missing: ${missing.join(', ')}`)
    if (missingActions.length > 0) console.error(`  missing actions: ${missingActions.join(', ')}`)
    if (missingConfirmedActions.length > 0) console.error(`  missing confirmed actions: ${missingConfirmedActions.join(', ')}`)
    if (unexpectedlyConfirmedActions.length > 0) console.error(`  unexpectedly confirmed actions: ${unexpectedlyConfirmedActions.join(', ')}`)
    if (wrongReminderTitle) {
      console.error(
        `  reminder title: ${agent.actions.find((action) => action.type === 'reminder_create')?.payload?.reminder?.title || 'missing'}`,
      )
    }
    if (unexpected.length > 0) console.error(`  unexpected: ${unexpected.join(', ')}`)
    if (wrongDecisionIntent) console.error(`  decision intent: ${agent.decision?.intentLabel || 'missing'}`)
    console.error(`  actual: ${Array.from(names).join(', ')}`)
    console.error(`  actions: ${Array.from(actionTypes).join(', ')}`)
    console.error(
      `  confirmations: ${agent.actions
        .filter((action) => action.requiresConfirmation)
        .map((action) => action.type)
        .join(', ')}`,
    )
  } else {
    console.log(`PASS ${testCase.name}`)
  }
}

failed += runSecurityRegression()
failed += runDetectorRegression()

if (failed > 0) {
  console.error(`Agent/security eval failed: ${failed} check(s) failed`)
  process.exit(1)
}

console.log(`Agent/security eval passed: ${cases.length} agent cases plus security regression checks`)

function simpleBundle(content) {
  return {
    characterName: '姐姐大人',
    systemPrompt: '你是百合小窝里可靠、温柔、会做事的姐姐助手。',
    contextBlocks: [],
    messages: [{ role: 'user', content, createdAt: new Date().toISOString() }],
  }
}

function runSecurityRegression() {
  const checks = [
    {
      name: 'local development keeps auth optional',
      run: () => withEnv({ NODE_ENV: 'development' }, () => !isProductionRuntime() && !shouldRequireCloudAuth() && !shouldRequireModelAuth()),
    },
    {
      name: 'production defaults require cloud and chat auth',
      run: () => withEnv({ NODE_ENV: 'production' }, () => isProductionRuntime() && shouldRequireCloudAuth() && shouldRequireModelAuth()),
    },
    {
      name: 'explicit auth opt-out remains available for private dev servers',
      run: () =>
        withEnv(
          {
            NODE_ENV: 'production',
            YURI_CHAT_REQUIRE_CLOUD_AUTH: 'false',
            YURI_CHAT_REQUIRE_CHAT_AUTH: 'false',
          },
          () => !shouldRequireCloudAuth() && !shouldRequireModelAuth(),
        ),
    },
    {
      name: 'missing production token rejects without leaking expected token',
      run: () =>
        withEnv({ NODE_ENV: 'production', YURI_CHAT_SYNC_TOKEN: 'expected-secret-token' }, () => {
          const failure = getCloudAuthFailure({
            get: () => '',
          })
          return failure?.status === 401 && !failure.message.includes('expected-secret-token')
        }),
    },
    {
      name: 'production model vault requires dedicated encryption secret',
      run: () =>
        withEnv({ NODE_ENV: 'production' }, () =>
          Boolean(getModelSecretConfigurationIssue()?.includes('YURI_CHAT_MODEL_SECRET')),
        ),
    },
    {
      name: 'local model vault can use development fallback',
      run: () => withEnv({ NODE_ENV: 'development' }, () => getModelSecretConfigurationIssue() === null),
    },
    {
      name: 'cloud snapshot rejects stale base revision',
      run: () => {
        const dir = mkdtempSync(join(tmpdir(), 'yuri-chat-cloud-cas-'))
        try {
          return withEnv({ NODE_ENV: 'development', YURI_CHAT_DB_PATH: join(dir, 'cloud.sqlite') }, () => {
            const first = saveSnapshot(minimalCloudState(), { baseRevision: 0 })
            if (first.revision !== 1) return false
            try {
              saveSnapshot(minimalCloudState(), { baseRevision: 0 })
              return false
            } catch (error) {
              return error instanceof CloudRevisionConflictError &&
                error.currentRevision === 1 &&
                readSnapshot()?.revision === 1
            }
          })
        } finally {
          closeCloudDatabaseForTests()
          rmSync(dir, { recursive: true, force: true })
        }
      },
    },
  ]

  let failedChecks = 0
  for (const check of checks) {
    if (check.run()) {
      console.log(`PASS security: ${check.name}`)
      continue
    }
    failedChecks += 1
    console.error(`FAIL security: ${check.name}`)
  }
  return failedChecks
}

function runDetectorRegression() {
  const checks = [
    {
      name: '检查一下 stays local unless external lookup is explicit',
      run: () => !shouldUseSearchTool('先用你的方式打个招呼，再帮我检查一下：如果妹妹今晚写百合卡住，你会怎么接住？'),
    },
    {
      name: 'plain explicit 查一下 still uses search',
      run: () => shouldUseSearchTool('姐姐查一下 YOP 中转站最新模型有哪些'),
    },
    {
      name: 'negated web search does not search',
      run: () => !shouldUseSearchTool('请继续用叶灯凛的语气回答，不要联网。妹妹说：姐姐帮我检查一下今晚这段百合开头会不会太AI味。'),
    },
    {
      name: 'tonight in creative phrasing does not require clock',
      run: () => !shouldUseTimeTool('如果妹妹今晚写百合卡住，你会怎么把她接住？'),
    },
    {
      name: 'fictional roleplay rain does not call weather',
      run: () => !shouldUseWeatherTool('今天旧书店下雨了吗？'),
    },
    {
      name: 'character window rain does not call weather',
      run: () => !shouldUseWeatherTool('你那边窗外是不是下雨了？'),
    },
    {
      name: 'real city rain still calls weather',
      run: () => shouldUseWeatherTool('姐姐查一下成都今天会不会下雨'),
    },
    {
      name: 'plain real weather question still asks for location',
      run: () => shouldUseWeatherTool('今天下雨了吗？'),
    },
  ]

  let failedChecks = 0
  for (const check of checks) {
    if (check.run()) {
      console.log(`PASS detector: ${check.name}`)
      continue
    }
    failedChecks += 1
    console.error(`FAIL detector: ${check.name}`)
  }
  return failedChecks
}

function withEnv(overrides, run) {
  const keys = [
    'NODE_ENV',
    'YURI_CHAT_PUBLIC_SERVER',
    'YURI_CHAT_PUBLIC_MODE',
    'YURI_CHAT_REQUIRE_CLOUD_AUTH',
    'YURI_CHAT_REQUIRE_CHAT_AUTH',
    'YURI_CHAT_SYNC_TOKEN',
    'YURI_CHAT_MODEL_SECRET',
    'YURI_CHAT_DB_PATH',
  ]
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]))

  for (const key of keys) {
    delete process.env[key]
  }
  Object.assign(process.env, overrides)

  try {
    return run()
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = previous[key]
      }
    }
  }
}

function minimalCloudState() {
  return {
    characters: [],
    conversations: [],
    memories: [],
    worldNodes: [],
    settings: {},
  }
}
