import { existsSync } from 'node:fs'
import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { prepareAgentBundle } from './agentTools.mjs'
import { createDemoReply, createProviderFallbackReply } from './chatReplies.mjs'
import { readEnv } from './env.mjs'
import { authRateLimiter, chatRateLimiter, cloudRateLimiter } from './rateLimits.mjs'
import {
  getSecurityStartupHints,
  hasCloudSyncToken,
  isProductionRuntime,
  getRequestSessionToken,
  requireAccountAuth,
  requireAdminAuth,
  resolveAccountAuth,
} from './auth.mjs'
import { callModelEmbeddings } from './embeddingProvider.mjs'
import {
  createCloudBackup,
  CloudRevisionConflictError,
  isValidAppStateShape,
  listCloudBackups,
  readUserSnapshot,
  resolveBackupPath,
  saveUserSnapshot,
} from './cloudStore.mjs'
import {
  callModelChat,
  createModelTestBundle,
  createModelTestSettings,
  fetchProviderModels,
  getBaseUrl,
  getModel,
} from './modelProvider.mjs'
import { callTextToSpeech } from './voiceProvider.mjs'
import {
  deleteModelProfile,
  getModelSecretConfigurationIssue,
  hasApiKey,
  listModelProfiles,
  resolveRuntimeProfileForChat,
  resolveRuntimeProfileForSpeech,
  resolveRuntimeProfileForModelCatalog,
  resolveRuntimeProfileForTest,
  upsertModelProfile,
} from './modelProfiles.mjs'
import {
  createPlatformTask,
  getPlatformStatus,
  initializePlatform,
  listPlatformConnectors,
  listPlatformExecutors,
  listPlatformNotifications,
  listPlatformTasks,
  markPlatformNotificationsSeen,
  startPlatformWorker,
  updatePlatformConnector,
  updatePlatformTask,
} from './platform.mjs'
import {
  destroySessionToken,
  initializeAccountStore,
  loginAccount,
  registerAccount,
  resendEmailVerification,
  verifyEmailCode,
} from './userAccounts.mjs'

dotenv.config({ path: '.env.local' })
dotenv.config()

const app = express()
const port = Number(readEnv('YURI_CHAT_API_PORT') || 8787)
const corsOrigin = getCorsOrigin()
const appName = 'Yuri Chat'

app.set('trust proxy', 1)
app.use(cors({ origin: corsOrigin }))
app.use(express.json({ limit: readEnv('YURI_CHAT_JSON_LIMIT') || '10mb' }))
initializeAccountStore()
getSecurityStartupHints().forEach((hint) => console.warn(`[${appName} 安全提示] ${hint}`))
const modelSecretIssue = getModelSecretConfigurationIssue()
if (modelSecretIssue) console.warn(`[${appName} 安全提示] ${modelSecretIssue}`)

app.use('/api/auth', authRateLimiter)

app.get('/api/auth/session', (request, response) => {
  try {
    const user = resolveAccountAuth(request)
    response.json({ ok: true, user })
  } catch (error) {
    response.status(error?.status || 401).json({ error: error instanceof Error ? error.message : '登录状态无效。' })
  }
})

app.post('/api/auth/register', async (request, response) => {
  try {
    response.json({
      ok: true,
      ...(await registerAccount(request.body ?? {}, { userAgent: request.get('user-agent') })),
    })
  } catch (error) {
    response.status(error?.status || 400).json({ error: error instanceof Error ? error.message : '注册失败。' })
  }
})

app.post('/api/auth/login', async (request, response) => {
  try {
    response.json({
      ok: true,
      ...(await loginAccount(request.body ?? {}, { userAgent: request.get('user-agent') })),
    })
  } catch (error) {
    response.status(error?.status || 401).json({ error: error instanceof Error ? error.message : '登录失败。' })
  }
})

app.post('/api/auth/verify-email', async (request, response) => {
  try {
    response.json({
      ok: true,
      ...(await verifyEmailCode(request.body ?? {}, { userAgent: request.get('user-agent') })),
    })
  } catch (error) {
    response.status(error?.status || 400).json({ error: error instanceof Error ? error.message : '邮箱验证失败。' })
  }
})

app.post('/api/auth/resend-verification', async (request, response) => {
  try {
    response.json({
      ok: true,
      ...(await resendEmailVerification(request.body ?? {}, { userAgent: request.get('user-agent') })),
    })
  } catch (error) {
    response.status(error?.status || 400).json({ error: error instanceof Error ? error.message : '验证码发送失败。' })
  }
})

app.post('/api/auth/logout', (request, response) => {
  destroySessionToken(getRequestSessionToken(request))
  response.json({ ok: true })
})

app.get('/api/health', (_request, response) => {
  response.json({
    ok: true,
    provider: hasApiKey() ? 'openai-compatible' : 'local-demo',
    cloudSync: hasCloudSyncToken() ? 'configured' : 'not-configured',
    baseUrl: getBaseUrl(),
    model: getModel(),
  })
})

app.get('/api/cloud/health', requireAccountAuth, (request, response) => {
  const snapshot = readUserSnapshot(request.user.id)
  response.json({
    ok: true,
    hasState: Boolean(snapshot),
    updatedAt: snapshot?.updatedAt ?? null,
    revision: snapshot?.revision ?? 0,
  })
})

app.use('/api/cloud', cloudRateLimiter)

app.get('/api/cloud/state', requireAccountAuth, (request, response) => {
  const snapshot = readUserSnapshot(request.user.id)
  response.json({
    ok: true,
    state: snapshot ? JSON.parse(snapshot.payload) : null,
    updatedAt: snapshot?.updatedAt ?? null,
    revision: snapshot?.revision ?? 0,
  })
})

app.get('/api/cloud/backups', requireAdminAuth, (_request, response) => {
  response.json({
    ok: true,
    backups: listCloudBackups(),
  })
})

app.post('/api/cloud/backups', requireAdminAuth, (_request, response) => {
  const backup = createCloudBackup('manual')
  response.json({
    ok: true,
    backup,
    backups: listCloudBackups(),
  })
})

app.get('/api/cloud/backups/:fileName', requireAdminAuth, (request, response) => {
  const backupPath = resolveBackupPath(request.params.fileName)
  if (!backupPath || !existsSync(backupPath)) {
    response.status(404).json({ error: 'Backup not found' })
    return
  }

  response.download(backupPath)
})

app.put('/api/cloud/state', requireAccountAuth, (request, response) => {
  const state = request.body?.state
  if (!isValidAppStateShape(state)) {
    response.status(400).json({ error: `Invalid ${appName} state payload` })
    return
  }

  try {
    const snapshot = saveUserSnapshot(state, { baseRevision: request.body?.baseRevision, userId: request.user.id })
    response.json({
      ok: true,
      updatedAt: snapshot.updatedAt,
      revision: snapshot.revision,
    })
  } catch (error) {
    if (error instanceof CloudRevisionConflictError) {
      response.status(409).json({
        error: error.message,
        currentRevision: error.currentRevision,
        updatedAt: error.updatedAt,
      })
      return
    }
    throw error
  }
})

app.get('/api/model/profiles', requireAccountAuth, (request, response) => {
  response.json({
    ok: true,
    profiles: listModelProfiles(request.user),
  })
})

app.post('/api/model/profiles', requireAccountAuth, (request, response) => {
  try {
    const profile = upsertModelProfile(request.body?.profile, request.user.id)
    response.json({
      ok: true,
      profile,
      profiles: listModelProfiles(request.user),
    })
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : '模型配置保存失败' })
  }
})

app.delete('/api/model/profiles/:profileId', requireAccountAuth, (request, response) => {
  const deleted = deleteModelProfile(request.params.profileId, request.user.id)
  if (!deleted) {
    response.status(404).json({ error: '没有找到这个模型配置' })
    return
  }

  response.json({
    ok: true,
    profiles: listModelProfiles(request.user),
  })
})

app.post('/api/model/test', requireAccountAuth, async (request, response) => {
  try {
    const runtimeProfile = resolveRuntimeProfileForTest(request.body ?? {}, request.user)
    if (!runtimeProfile.apiKey) {
      response.status(400).json({ error: '这个模型配置还没有保存密钥' })
      return
    }

    const startedAt = Date.now()
    const reply = await callModelChat(createModelTestBundle(), createModelTestSettings(runtimeProfile), runtimeProfile)
    response.json({
      ok: true,
      provider: runtimeProfile.name,
      model: runtimeProfile.model,
      latencyMs: Date.now() - startedAt,
      preview: reply.slice(0, 160),
    })
  } catch (error) {
    response.status(502).json({ error: error instanceof Error ? error.message : '模型测试失败' })
  }
})

app.post('/api/model/models', requireAccountAuth, async (request, response) => {
  try {
    const runtimeProfile = resolveRuntimeProfileForModelCatalog(request.body ?? {}, request.user)
    if (!runtimeProfile.apiKey) {
      response.status(400).json({ error: '拉取模型列表需要先填写或保存 API Key' })
      return
    }

    response.json(await fetchProviderModels(runtimeProfile))
  } catch (error) {
    response.status(502).json({ error: error instanceof Error ? error.message : '模型列表拉取失败' })
  }
})

app.post('/api/model/embeddings', requireAccountAuth, async (request, response) => {
  try {
    const runtimeProfile = resolveRuntimeProfileForModelCatalog(request.body ?? {}, request.user)
    if (!runtimeProfile.apiKey) {
      response.status(400).json({ error: '生成 embedding 需要先填写或保存 API Key' })
      return
    }

    const startedAt = Date.now()
    const result = await callModelEmbeddings(request.body?.texts, runtimeProfile, {
      model: request.body?.model,
      dimensions: request.body?.dimensions,
    })
    response.json({
      ...result,
      latencyMs: Date.now() - startedAt,
    })
  } catch (error) {
    response.status(502).json({ error: error instanceof Error ? error.message : 'embedding 生成失败' })
  }
})

app.post('/api/voice/speech', requireAccountAuth, chatRateLimiter, async (request, response) => {
  try {
    const profile = resolveRuntimeProfileForSpeech(request.body?.settings, request.user)
    const result = await callTextToSpeech(request.body ?? {}, profile)
    response.json({ ok: true, ...result })
  } catch (error) {
    response.status(502).json({ error: error instanceof Error ? error.message : '语音生成失败。' })
  }
})

app.get('/api/platform/status', requireAccountAuth, (_request, response) => {
  response.json(getPlatformStatus())
})

app.get('/api/platform/tasks', requireAccountAuth, (request, response) => {
  response.json({
    ok: true,
    tasks: listPlatformTasks(request.query.limit),
  })
})

app.post('/api/platform/tasks', requireAccountAuth, (request, response) => {
  try {
    response.json({
      ok: true,
      task: createPlatformTask(request.body?.task ?? request.body ?? {}),
    })
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : '后台任务创建失败' })
  }
})

app.patch('/api/platform/tasks/:taskId', requireAccountAuth, (request, response) => {
  const task = updatePlatformTask(request.params.taskId, request.body ?? {})
  if (!task) {
    response.status(404).json({ error: '没有找到这个后台任务' })
    return
  }

  response.json({ ok: true, task })
})

app.get('/api/platform/notifications', requireAccountAuth, (request, response) => {
  response.json({
    ok: true,
    notifications: listPlatformNotifications(request.query.limit),
  })
})

app.patch('/api/platform/notifications', requireAccountAuth, (request, response) => {
  response.json({
    ok: true,
    notifications: markPlatformNotificationsSeen(request.body?.ids ?? []),
  })
})

app.get('/api/platform/connectors', requireAccountAuth, (_request, response) => {
  response.json({
    ok: true,
    connectors: listPlatformConnectors(),
  })
})

app.patch('/api/platform/connectors/:connectorId', requireAccountAuth, (request, response) => {
  const connector = updatePlatformConnector(request.params.connectorId, request.body ?? {})
  if (!connector) {
    response.status(404).json({ error: '没有找到这个连接器' })
    return
  }

  response.json({ ok: true, connector, connectors: listPlatformConnectors() })
})

app.get('/api/platform/executors', requireAccountAuth, (_request, response) => {
  response.json({
    ok: true,
    executors: listPlatformExecutors(),
  })
})

app.post('/api/chat', requireAccountAuth, chatRateLimiter, async (request, response) => {
  const { bundle, settings } = request.body ?? {}

  if (!bundle?.systemPrompt || !Array.isArray(bundle?.messages)) {
    response.status(400).json({ error: 'Invalid chat payload' })
    return
  }

  const agentRun = await prepareAgentBundle(bundle)
  const agentBundle = agentRun.bundle
  let runtimeProfile
  try {
    runtimeProfile = resolveRuntimeProfileForChat(settings, request.user)
  } catch (error) {
    response.status(formatModelConfigErrorStatus(error)).json({
      error: error instanceof Error ? error.message : '模型配置暂时不可用',
    })
    return
  }
  if (!runtimeProfile?.apiKey) {
    response.json({
      provider: 'local-demo',
      reply: createDemoReply(agentBundle, appName),
      agent: agentRun.agent,
    })
    return
  }

  try {
    const reply = await callModelChat(agentBundle, settings, runtimeProfile)
    response.json({ provider: runtimeProfile.name, model: runtimeProfile.model, reply, agent: agentRun.agent })
  } catch (error) {
    console.error(error)
    response.json({
      provider: 'agent-fallback',
      model: runtimeProfile.model,
      reply: createProviderFallbackReply(error, agentRun.agent),
      agent: agentRun.agent,
      warning: error instanceof Error ? error.message : 'Model request failed',
    })
  }
})

initializePlatform()
startPlatformWorker()

app.listen(port, '127.0.0.1', () => {
  console.log(`${appName} API listening on http://127.0.0.1:${port}`)
})

function getCorsOrigin() {
  const configured = readEnv('YURI_CHAT_CORS_ORIGIN')
  if (!configured) return isProductionRuntime() ? ['https://ctnnyy-oss.github.io'] : true
  const origins = configured
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  return origins.length > 1 ? origins : origins[0] || true
}

function formatModelConfigErrorStatus(error) {
  const message = error instanceof Error ? error.message : ''
  return /YURI_CHAT_MODEL_SECRET|生产环境/.test(message) ? 503 : 400
}
