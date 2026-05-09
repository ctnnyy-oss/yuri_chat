import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'
import { isProductionRuntime } from './auth.mjs'
import { getCloudDatabase, legacyUserId, normalizeDataUserId } from './cloudStore.mjs'
import { readBooleanEnv, readEnv } from './env.mjs'
import { getBaseUrl, getModel, stripTrailingSlash } from './modelProvider.mjs'

export const serverEnvProfileId = 'server-env'

const modelProviderKinds = new Set(['openai-compatible', 'anthropic', 'google-gemini'])

export function hasApiKey() {
  return Boolean(process.env.AI_API_KEY || process.env.OPENAI_API_KEY)
}

export function getModelSecretConfigurationIssue() {
  if (isProductionRuntime() && !readEnv('YURI_CHAT_MODEL_SECRET')) {
    return '生产环境需要配置 YURI_CHAT_MODEL_SECRET，才能安全使用服务器模型保险箱。'
  }
  return null
}

export function listModelProfiles(account) {
  const profiles = listStoredModelProfiles(getAccountUserId(account))
  return canUseServerEnvProfile(account) ? [getServerEnvProfileSummary(account), ...profiles] : profiles
}

export function upsertModelProfile(input, userId) {
  const dataUserId = normalizeDataUserId(userId)
  const profile = normalizeModelProfileInput(input)
  const now = new Date().toISOString()
  const existing = profile.id ? readStoredModelProfile(profile.id, dataUserId) : null
  const idAlreadyUsedByAnotherUser = Boolean(
    profile.id && !existing && getCloudDatabase().prepare('SELECT id FROM model_profiles WHERE id = ?').get(profile.id),
  )
  const id = existing?.id ?? (idAlreadyUsedByAnotherUser ? randomUUID() : profile.id) ?? randomUUID()
  const encryptedApiKey =
    profile.apiKey && profile.apiKey.trim() ? encryptSecret(profile.apiKey.trim()) : existing?.encryptedApiKey ?? null

  if (profile.isDefault) clearDefaultModelProfiles(dataUserId)

  getCloudDatabase()
    .prepare(
      `INSERT INTO model_profiles
        (id, user_id, name, provider_kind, base_url, model, encrypted_api_key, enabled, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         user_id = excluded.user_id,
         name = excluded.name,
         provider_kind = excluded.provider_kind,
         base_url = excluded.base_url,
         model = excluded.model,
         encrypted_api_key = excluded.encrypted_api_key,
         enabled = excluded.enabled,
         is_default = excluded.is_default,
         updated_at = excluded.updated_at`,
    )
    .run(
      id,
      dataUserId,
      profile.name,
      profile.kind,
      stripTrailingSlash(profile.baseUrl),
      profile.model,
      encryptedApiKey,
      profile.enabled ? 1 : 0,
      profile.isDefault ? 1 : 0,
      existing?.createdAt ?? now,
      now,
    )

  return toModelProfileSummary(readStoredModelProfile(id, dataUserId))
}

export function deleteModelProfile(profileId, userId) {
  if (!profileId || profileId === serverEnvProfileId) return false
  const result = getCloudDatabase()
    .prepare('DELETE FROM model_profiles WHERE id = ? AND user_id = ?')
    .run(String(profileId), normalizeDataUserId(userId))
  return result.changes > 0
}

export function resolveRuntimeProfileForChat(settings, account) {
  const dataUserId = normalizeDataUserId(getAccountUserId(account))
  const selectedProfileId = settings?.modelProfileId
  if (selectedProfileId && selectedProfileId !== serverEnvProfileId) {
    return storedProfileToRuntime(readStoredModelProfile(selectedProfileId, dataUserId))
  }

  if (selectedProfileId === serverEnvProfileId) {
    return resolveServerEnvProfile(settings, account)
  }

  const defaultStoredProfile = readDefaultStoredModelProfile(dataUserId)
  if (defaultStoredProfile) {
    return storedProfileToRuntime(defaultStoredProfile)
  }

  return null
}

export function resolveRuntimeProfileForTest(input, account) {
  const dataUserId = normalizeDataUserId(getAccountUserId(account))
  if (input.profile) {
    const normalized = normalizeModelProfileInput(input.profile)
    return {
      id: normalized.id ?? 'draft',
      name: normalized.name,
      kind: normalized.kind,
      baseUrl: normalized.baseUrl,
      model: normalized.model,
      apiKey: normalized.apiKey?.trim() || '',
    }
  }

  if (input.profileId === serverEnvProfileId) {
    return resolveRuntimeProfileForChat({ modelProfileId: serverEnvProfileId, model: process.env.AI_MODEL }, account)
  }

  return storedProfileToRuntime(readStoredModelProfile(input.profileId, dataUserId))
}

export function resolveRuntimeProfileForModelCatalog(input, account) {
  const dataUserId = normalizeDataUserId(getAccountUserId(account))
  if (input.profile) {
    const normalized = normalizeModelProfileInput(input.profile, { requireModel: false })
    return {
      id: normalized.id ?? 'draft',
      name: normalized.name,
      kind: normalized.kind,
      baseUrl: normalized.baseUrl,
      model: normalized.model,
      apiKey: normalized.apiKey?.trim() || '',
    }
  }

  if (input.profileId === serverEnvProfileId) {
    return resolveRuntimeProfileForChat({ modelProfileId: serverEnvProfileId, model: process.env.AI_MODEL }, account)
  }

  return storedProfileToRuntime(readStoredModelProfile(input.profileId, dataUserId))
}

function listStoredModelProfiles(userId) {
  return getCloudDatabase()
    .prepare(
      `SELECT id, name, provider_kind AS kind, base_url AS baseUrl, model, encrypted_api_key AS encryptedApiKey,
              enabled, is_default AS isDefault, created_at AS createdAt, updated_at AS updatedAt
       FROM model_profiles
       WHERE user_id = ?
       ORDER BY is_default DESC, updated_at DESC`,
    )
    .all(normalizeDataUserId(userId))
    .map((row) => toModelProfileSummary(row))
}

function readStoredModelProfile(profileId, userId) {
  if (!profileId || profileId === serverEnvProfileId) return null
  const row = getCloudDatabase()
    .prepare(
      `SELECT id, name, provider_kind AS kind, base_url AS baseUrl, model, encrypted_api_key AS encryptedApiKey,
              enabled, is_default AS isDefault, created_at AS createdAt, updated_at AS updatedAt
       FROM model_profiles
       WHERE id = ? AND user_id = ?`,
    )
    .get(String(profileId), normalizeDataUserId(userId))

  return row ? toModelProfileRecord(row) : null
}

function readDefaultStoredModelProfile(userId) {
  const row = getCloudDatabase()
    .prepare(
      `SELECT id, name, provider_kind AS kind, base_url AS baseUrl, model, encrypted_api_key AS encryptedApiKey,
              enabled, is_default AS isDefault, created_at AS createdAt, updated_at AS updatedAt
       FROM model_profiles
       WHERE user_id = ? AND enabled = 1 AND is_default = 1
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .get(normalizeDataUserId(userId))

  return row ? toModelProfileRecord(row) : null
}

function clearDefaultModelProfiles(userId) {
  getCloudDatabase().prepare('UPDATE model_profiles SET is_default = 0 WHERE user_id = ?').run(normalizeDataUserId(userId))
}

function normalizeModelProfileInput(input, options = {}) {
  if (!input || typeof input !== 'object') throw new Error('模型配置格式不对')

  const kind = String(input.kind || 'openai-compatible')
  if (!modelProviderKinds.has(kind)) throw new Error('暂不支持这个模型接口类型')

  const baseUrl = String(input.baseUrl || '').trim()
  const model = String(input.model || '').trim()
  const name = deriveModelProfileName({ name: input.name, kind, baseUrl, model })

  if (!baseUrl) throw new Error('模型配置需要 Base URL')
  if (options.requireModel !== false && !model) throw new Error('模型配置需要模型名')

  return {
    id: input.id && input.id !== serverEnvProfileId ? String(input.id) : undefined,
    name: name.slice(0, 80),
    kind,
    baseUrl: stripTrailingSlash(baseUrl),
    model: model.slice(0, 160),
    apiKey: typeof input.apiKey === 'string' ? input.apiKey : '',
    enabled: input.enabled !== false,
    isDefault: Boolean(input.isDefault),
  }
}

function deriveModelProfileName(input) {
  const explicitName = String(input.name || '').trim()
  if (explicitName) return explicitName

  const host = getProfileHostLabel(input.baseUrl)
  const kindLabel = input.kind === 'anthropic' ? 'Anthropic' : input.kind === 'google-gemini' ? 'Gemini' : 'OpenAI 兼容'
  const model = String(input.model || '').trim()

  if (model && host) return `${host} / ${model}`
  if (host) return `${host} / ${kindLabel}`
  if (model) return model
  return '我的模型配置'
}

function getProfileHostLabel(baseUrl) {
  try {
    const hostname = new URL(stripTrailingSlash(baseUrl)).hostname
    return hostname.replace(/^api\./, '').replace(/^www\./, '')
  } catch {
    return ''
  }
}

function toModelProfileRecord(row) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    baseUrl: row.baseUrl,
    model: row.model,
    encryptedApiKey: row.encryptedApiKey,
    hasApiKey: Boolean(row.encryptedApiKey),
    enabled: Boolean(row.enabled),
    isDefault: Boolean(row.isDefault),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toModelProfileSummary(row) {
  const record = row.encryptedApiKey === undefined ? row : toModelProfileRecord(row)
  return {
    id: record.id,
    name: record.name,
    kind: record.kind,
    baseUrl: record.baseUrl,
    model: record.model,
    hasApiKey: record.hasApiKey,
    enabled: record.enabled,
    isDefault: record.isDefault,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

function getServerEnvProfileSummary(account) {
  const now = new Date(0).toISOString()
  return {
    id: serverEnvProfileId,
    name: '服务器默认配置',
    kind: 'openai-compatible',
    baseUrl: getBaseUrl(),
    model: process.env.AI_MODEL || process.env.OPENAI_MODEL || 'deepseek-v4-flash',
    hasApiKey: hasApiKey(),
    enabled: true,
    isDefault: !readDefaultStoredModelProfile(getAccountUserId(account)),
    createdAt: now,
    updatedAt: now,
  }
}

function resolveServerEnvProfile(settings, account) {
  if (!canUseServerEnvProfile(account)) throw new Error('普通账号需要在模型页保存自己的 API Key，不能使用服务器默认模型。')
  if (!hasApiKey()) return null

  return {
    id: serverEnvProfileId,
    name: '服务器默认配置',
    kind: 'openai-compatible',
    baseUrl: getBaseUrl(),
    model: getModel(settings),
    apiKey: process.env.AI_API_KEY || process.env.OPENAI_API_KEY,
  }
}

function getAccountUserId(account) {
  if (account && typeof account === 'object') return account.id
  return account
}

function canUseServerEnvProfile(account) {
  if (readBooleanEnv('YURI_CHAT_ALLOW_SERVER_ENV_FOR_USERS') === true) return true
  if (!account || typeof account !== 'object') return true
  return account.role === 'admin' || account.id === legacyUserId
}

function storedProfileToRuntime(profile) {
  if (!profile) throw new Error('没有找到这个模型配置')
  if (!profile.enabled) throw new Error('这个模型配置已经停用')

  return {
    id: profile.id,
    name: profile.name,
    kind: profile.kind,
    baseUrl: profile.baseUrl,
    model: profile.model,
    apiKey: profile.encryptedApiKey ? decryptSecret(profile.encryptedApiKey) : '',
  }
}

function encryptSecret(value) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getModelSecretKey(), iv)
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ['v1', iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':')
}

function decryptSecret(value) {
  if (!value) return ''
  const [version, iv, tag, encrypted] = String(value).split(':')
  if (version !== 'v1' || !iv || !tag || !encrypted) return ''

  const decipher = createDecipheriv('aes-256-gcm', getModelSecretKey(), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8')
}

function getModelSecretKey() {
  const configurationIssue = getModelSecretConfigurationIssue()
  if (configurationIssue) throw new Error(configurationIssue)

  const material =
    readEnv('YURI_CHAT_MODEL_SECRET') ||
    readEnv('YURI_CHAT_SYNC_TOKEN') ||
    process.env.AI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    'local-yuri-chat-development-secret'
  return createHash('sha256').update(material).digest()
}
