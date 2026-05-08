import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { claimLegacyCloudDataForUser, getCloudDatabase, legacyUserId } from './cloudStore.mjs'
import { readBooleanEnv, readEnv } from './env.mjs'

const sessionDurationMs = 1000 * 60 * 60 * 24 * 30
const usernamePattern = /^[\p{L}\p{N}_\-.\u4e00-\u9fa5]{2,32}$/u

export function initializeAccountStore() {
  const database = getCloudDatabase()
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      username_key TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      user_agent TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
  `)
  ensureColumn(database, 'users', 'role', "TEXT NOT NULL DEFAULT 'user'")
}

export function getAuthStartupHints() {
  const hints = []
  const issue = getAuthSecretConfigurationIssue()
  if (issue) hints.push(issue)
  return hints
}

export function getAuthSecretConfigurationIssue() {
  if (isProductionLikeRuntime() && !readEnv('YURI_CHAT_AUTH_SECRET')) {
    return '生产/公网模式需要配置 YURI_CHAT_AUTH_SECRET，账号 session 才能安全启用。'
  }
  return null
}

export async function registerAccount(input, requestMeta = {}) {
  initializeAccountStore()
  const configurationIssue = getAuthSecretConfigurationIssue()
  if (configurationIssue) throw createPublicError(configurationIssue, 503)
  const username = normalizeUsername(input?.username)
  const usernameKey = getUsernameKey(username)
  const password = String(input?.password || '')
  const displayName = normalizeDisplayName(input?.displayName, username)

  validateUsername(username)
  validatePassword(password)

  const database = getCloudDatabase()
  const existing = database.prepare('SELECT id FROM users WHERE username_key = ?').get(usernameKey)
  if (existing) throw createPublicError('这个用户名已经被占用啦，换一个试试。', 409)

  const now = new Date().toISOString()
  const passwordHash = await bcrypt.hash(password, getBcryptCost())
  let user

  database.exec('BEGIN IMMEDIATE')
  try {
    const freshExisting = database.prepare('SELECT id FROM users WHERE username_key = ?').get(usernameKey)
    if (freshExisting) throw createPublicError('这个用户名已经被占用啦，换一个试试。', 409)

    user = {
      id: randomUUID(),
      username,
      usernameKey,
      displayName,
      role: countUsers(database) === 0 ? 'admin' : 'user',
    }
    database
      .prepare(
        `INSERT INTO users (id, username, username_key, display_name, password_hash, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(user.id, user.username, user.usernameKey, user.displayName, passwordHash, user.role, now, now)
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }

  if (user.role === 'admin') claimLegacyCloudDataForUser(user.id)

  return createSessionPayload(toPublicUser(user), requestMeta)
}

export async function loginAccount(input, requestMeta = {}) {
  initializeAccountStore()
  const configurationIssue = getAuthSecretConfigurationIssue()
  if (configurationIssue) throw createPublicError(configurationIssue, 503)
  const usernameKey = getUsernameKey(normalizeUsername(input?.username))
  const password = String(input?.password || '')
  const userRecord = readUserByUsernameKey(usernameKey)

  if (!userRecord || !(await bcrypt.compare(password, userRecord.passwordHash))) {
    throw createPublicError('用户名或密码不对。', 401)
  }

  return createSessionPayload(toPublicUser(userRecord), requestMeta)
}

export function verifySessionToken(token) {
  initializeAccountStore()
  const cleanedToken = String(token || '').trim()
  if (!cleanedToken) return null

  const tokenHash = hashSessionToken(cleanedToken)
  const row = getCloudDatabase()
    .prepare(
      `SELECT
        s.token_hash AS tokenHash,
        s.expires_at AS expiresAt,
        u.id,
        u.username,
        u.display_name AS displayName,
        u.role,
        u.created_at AS createdAt,
        u.updated_at AS updatedAt
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .get(tokenHash)

  if (!row) return null
  if (new Date(row.expiresAt).getTime() <= Date.now()) {
    destroySessionToken(cleanedToken)
    return null
  }

  getCloudDatabase()
    .prepare('UPDATE user_sessions SET last_seen_at = ? WHERE token_hash = ?')
    .run(new Date().toISOString(), tokenHash)

  return toPublicUser(row)
}

export function destroySessionToken(token) {
  initializeAccountStore()
  const cleanedToken = String(token || '').trim()
  if (!cleanedToken) return false
  const result = getCloudDatabase().prepare('DELETE FROM user_sessions WHERE token_hash = ?').run(hashSessionToken(cleanedToken))
  return result.changes > 0
}

export function getLegacyAuthUser() {
  return {
    id: legacyUserId,
    username: 'legacy',
    displayName: '旧云端口令',
    role: 'admin',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  }
}

export function toPublicUser(record) {
  return {
    id: String(record.id),
    username: String(record.username),
    displayName: String(record.displayName ?? record.display_name ?? record.username),
    role: record.role === 'admin' ? 'admin' : 'user',
    createdAt: String(record.createdAt ?? record.created_at ?? ''),
    updatedAt: String(record.updatedAt ?? record.updated_at ?? ''),
  }
}

export function createPublicError(message, status = 400) {
  const error = new Error(message)
  error.status = status
  return error
}

function createSessionPayload(user, requestMeta = {}) {
  const token = randomBytes(32).toString('base64url')
  const now = new Date()
  const expiresAt = new Date(now.getTime() + sessionDurationMs).toISOString()
  getCloudDatabase()
    .prepare(
      `INSERT INTO user_sessions (token_hash, user_id, created_at, last_seen_at, expires_at, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      hashSessionToken(token),
      user.id,
      now.toISOString(),
      now.toISOString(),
      expiresAt,
      String(requestMeta.userAgent || '').slice(0, 240),
    )

  return { token, user, expiresAt }
}

function readUserByUsernameKey(usernameKey) {
  const row = getCloudDatabase()
    .prepare(
      `SELECT id, username, username_key AS usernameKey, display_name AS displayName, password_hash AS passwordHash,
              role, created_at AS createdAt, updated_at AS updatedAt
       FROM users
       WHERE username_key = ?`,
    )
    .get(usernameKey)
  return row ?? null
}

function countUsers(database = getCloudDatabase()) {
  return Number(database.prepare('SELECT COUNT(*) AS count FROM users').get()?.count ?? 0)
}

function hashSessionToken(token) {
  const secret = getAuthSecret()
  return createHmac('sha256', secret).update(String(token)).digest('hex')
}

function getAuthSecret() {
  const configured = readEnv('YURI_CHAT_AUTH_SECRET')
  if (configured) return configured
  const issue = getAuthSecretConfigurationIssue()
  if (issue) throw createPublicError(issue, 503)
  return readEnv('YURI_CHAT_SYNC_TOKEN') || readEnv('YURI_CHAT_MODEL_SECRET') || 'local-yuri-chat-account-secret'
}

function getBcryptCost() {
  const configured = Number(readEnv('YURI_CHAT_BCRYPT_COST'))
  if (Number.isInteger(configured) && configured >= 8 && configured <= 15) return configured
  return 11
}

function normalizeUsername(value) {
  return String(value || '').trim()
}

function normalizeDisplayName(value, username) {
  const displayName = String(value || '').trim()
  return (displayName || username).slice(0, 40)
}

function getUsernameKey(username) {
  return username.normalize('NFKC').toLowerCase()
}

function validateUsername(username) {
  if (!usernamePattern.test(username)) {
    throw createPublicError('用户名需要 2-32 个字符，可用中文、字母、数字、下划线、短横线或点。')
  }
}

function validatePassword(password) {
  if (password.length < 8) throw createPublicError('密码至少需要 8 位。')
  if (password.length > 128) throw createPublicError('密码太长啦，最多 128 位。')
}

function ensureColumn(database, tableName, columnName, definition) {
  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all()
  if (columns.some((column) => column.name === columnName)) return
  database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`)
}

function isProductionLikeRuntime() {
  return (
    process.env.NODE_ENV === 'production' ||
    readBooleanEnv('YURI_CHAT_PUBLIC_SERVER') === true ||
    readBooleanEnv('YURI_CHAT_PUBLIC_MODE') === true
  )
}
