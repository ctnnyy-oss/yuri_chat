import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { claimLegacyCloudDataForUser, getCloudDatabase, legacyUserId } from './cloudStore.mjs'
import { getEmailDeliveryConfigurationIssue, sendVerificationEmail } from './emailDelivery.mjs'
import { getEmailKey, getEmailValidationError, normalizeEmail } from './emailValidation.mjs'
import { readBooleanEnv, readEnv } from './env.mjs'
import { initializeAccountStore } from './userAccountStore.mjs'

const sessionDurationMs = 1000 * 60 * 60 * 24 * 30
const usernamePattern = /^[\p{L}\p{N}_\-.\u4e00-\u9fa5]{2,32}$/u
const verificationCodeAttempts = 6

export { initializeAccountStore } from './userAccountStore.mjs'
export function getAuthStartupHints() {
  const hints = []
  const issue = getAuthSecretConfigurationIssue()
  if (issue) hints.push(issue)
  const emailIssue = getEmailDeliveryConfigurationIssue()
  if (emailIssue) hints.push(emailIssue)
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
  const email = normalizeEmail(input?.email)
  const emailKey = getEmailKey(email)
  const password = String(input?.password || '')
  const displayName = normalizeDisplayName(input?.displayName, username)

  validateUsername(username)
  validateEmail(email)
  validatePassword(password)
  validateEmailDeliveryConfigured()

  const database = getCloudDatabase()
  const existingEmail = database.prepare('SELECT id FROM users WHERE email_key = ?').get(emailKey)
  if (existingEmail) throw createPublicError('这个邮箱已经注册过啦，直接登录就好。', 409)

  const now = new Date().toISOString()
  const passwordHash = await bcrypt.hash(password, getBcryptCost())
  let user

  database.exec('BEGIN IMMEDIATE')
  try {
    const freshExistingEmail = database.prepare('SELECT id FROM users WHERE email_key = ?').get(emailKey)
    if (freshExistingEmail) throw createPublicError('这个邮箱已经注册过啦，直接登录就好。', 409)

    user = {
      id: randomUUID(),
      username,
      usernameKey,
      email,
      emailKey,
      displayName,
      role: 'user',
    }
    database
      .prepare(
        `INSERT INTO users
          (id, username, username_key, email, email_key, email_verified_at, display_name, password_hash, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
      )
      .run(user.id, user.username, user.usernameKey, user.email, user.emailKey, user.displayName, passwordHash, user.role, now, now)
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }

  return sendAccountVerification(user, requestMeta)
}

export async function loginAccount(input, requestMeta = {}) {
  initializeAccountStore()
  const configurationIssue = getAuthSecretConfigurationIssue()
  if (configurationIssue) throw createPublicError(configurationIssue, 503)
  const email = normalizeEmail(input?.email ?? input?.username)
  const emailKey = getEmailKey(email)
  const password = String(input?.password || '')
  const userRecord = readUserByEmailKey(emailKey)

  if (!userRecord || !(await bcrypt.compare(password, userRecord.passwordHash))) {
    throw createPublicError('邮箱或密码不对。', 401)
  }

  if (userRecord.emailKey && !userRecord.emailVerifiedAt) {
    validateEmailDeliveryConfigured()
    return sendAccountVerification(userRecord, requestMeta)
  }

  return createSessionPayload(toPublicUser(userRecord), requestMeta)
}

export async function verifyEmailCode(input, requestMeta = {}) {
  initializeAccountStore()
  const configurationIssue = getAuthSecretConfigurationIssue()
  if (configurationIssue) throw createPublicError(configurationIssue, 503)
  const emailKey = getEmailKey(normalizeEmail(input?.email))
  const code = normalizeVerificationCode(input?.code)
  if (!emailKey || !code) throw createPublicError('请填写邮箱和验证码。')

  const database = getCloudDatabase()
  const userRecord = readUserByEmailKey(emailKey)
  if (!userRecord) throw createPublicError('没有找到这个邮箱对应的账号。', 404)
  if (userRecord.emailVerifiedAt) return createSessionPayload(toPublicUser(userRecord), requestMeta)

  const verification = database
    .prepare(
      `SELECT id, user_id AS userId, email_key AS emailKey, code_hash AS codeHash, attempts, expires_at AS expiresAt
       FROM email_verification_codes
       WHERE user_id = ? AND email_key = ? AND consumed_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get(userRecord.id, emailKey)
  if (!verification) throw createPublicError('验证码已经失效，请重新发送。')
  if (new Date(verification.expiresAt).getTime() <= Date.now()) {
    throw createPublicError('验证码已经过期，请重新发送。')
  }
  if (Number(verification.attempts) >= verificationCodeAttempts) {
    throw createPublicError('验证码试错次数太多啦，请重新发送。', 429)
  }
  if (!isSameHash(verification.codeHash, hashVerificationCode(userRecord.id, emailKey, code))) {
    database
      .prepare('UPDATE email_verification_codes SET attempts = attempts + 1 WHERE id = ?')
      .run(verification.id)
    throw createPublicError('验证码不对，再检查一下邮箱里的 6 位数字。', 401)
  }

  const verifiedAt = new Date().toISOString()
  let becameAdmin = false
  let publicUser
  database.exec('BEGIN IMMEDIATE')
  try {
    const freshUser = readUserByEmailKey(emailKey)
    if (!freshUser) throw createPublicError('没有找到这个邮箱对应的账号。', 404)
    const verifiedUserCount = Number(
      database.prepare('SELECT COUNT(*) AS count FROM users WHERE email_verified_at IS NOT NULL OR email_key IS NULL').get()?.count ?? 0,
    )
    const nextRole = verifiedUserCount === 0 ? 'admin' : freshUser.role
    becameAdmin = nextRole === 'admin' && freshUser.role !== 'admin'
    database
      .prepare('UPDATE users SET email_verified_at = ?, role = ?, updated_at = ? WHERE id = ?')
      .run(verifiedAt, nextRole, verifiedAt, freshUser.id)
    database
      .prepare('UPDATE email_verification_codes SET consumed_at = ? WHERE id = ?')
      .run(verifiedAt, verification.id)
    database.exec('COMMIT')
    publicUser = toPublicUser({ ...freshUser, role: nextRole, emailVerifiedAt: verifiedAt, updatedAt: verifiedAt })
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }

  if (becameAdmin) claimLegacyCloudDataForUser(publicUser.id)
  return createSessionPayload(publicUser, requestMeta)
}

export async function resendEmailVerification(input, requestMeta = {}) {
  initializeAccountStore()
  const configurationIssue = getAuthSecretConfigurationIssue()
  if (configurationIssue) throw createPublicError(configurationIssue, 503)
  validateEmailDeliveryConfigured()
  const email = normalizeEmail(input?.email)
  const emailKey = getEmailKey(email)
  validateEmail(email)
  const userRecord = readUserByEmailKey(emailKey)
  if (!userRecord) throw createPublicError('没有找到这个邮箱对应的账号。', 404)
  if (userRecord.emailVerifiedAt) {
    return {
      email: userRecord.email,
      emailVerified: true,
      requiresEmailVerification: false,
    }
  }
  return sendAccountVerification(userRecord, requestMeta)
}

export async function bootstrapVerifiedAdminAccount(input) {
  initializeAccountStore()
  const email = normalizeEmail(input?.email)
  const emailKey = getEmailKey(email)
  const username = normalizeUsername(input?.username || input?.displayName || email.split('@')[0])
  const usernameKey = getUsernameKey(username)
  const displayName = normalizeDisplayName(input?.displayName, username)
  const password = String(input?.password || '')

  validateUsername(username)
  validateEmail(email)
  if (!password) throw createPublicError('请填写初始化管理员密码。')

  const database = getCloudDatabase()
  const now = new Date().toISOString()
  const passwordHash = await bcrypt.hash(password, getBcryptCost())
  let publicUser
  let created = false

  database.exec('BEGIN IMMEDIATE')
  try {
    const existingUser = readUserByEmailKey(emailKey)
    if (existingUser) {
      database
        .prepare(
          `UPDATE users
           SET username = ?, username_key = ?, email = ?, email_key = ?,
               email_verified_at = COALESCE(email_verified_at, ?),
               display_name = ?, password_hash = ?, role = 'admin', updated_at = ?
           WHERE id = ?`,
        )
        .run(username, usernameKey, email, emailKey, now, displayName, passwordHash, now, existingUser.id)
      publicUser = toPublicUser({
        ...existingUser,
        username,
        usernameKey,
        email,
        emailKey,
        emailVerifiedAt: existingUser.emailVerifiedAt || now,
        displayName,
        role: 'admin',
        updatedAt: now,
      })
    } else {
      created = true
      const user = {
        id: randomUUID(),
        username,
        usernameKey,
        email,
        emailKey,
        emailVerifiedAt: now,
        displayName,
        role: 'admin',
        createdAt: now,
        updatedAt: now,
      }
      database
        .prepare(
          `INSERT INTO users
            (id, username, username_key, email, email_key, email_verified_at, display_name, password_hash, role, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'admin', ?, ?)`,
        )
        .run(user.id, user.username, user.usernameKey, user.email, user.emailKey, user.emailVerifiedAt, user.displayName, passwordHash, now, now)
      publicUser = toPublicUser(user)
    }
    database.prepare('DELETE FROM email_verification_codes WHERE email_key = ?').run(emailKey)
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }

  claimLegacyCloudDataForUser(publicUser.id)
  return { created, user: publicUser }
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
        u.email,
        u.email_key AS emailKey,
        u.email_verified_at AS emailVerifiedAt,
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
    email: '',
    emailVerifiedAt: new Date(0).toISOString(),
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
    email: String(record.email ?? ''),
    emailVerifiedAt: record.emailVerifiedAt ?? record.email_verified_at ?? null,
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

async function sendAccountVerification(user, requestMeta = {}) {
  const code = createVerificationCode()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + getVerificationCodeTtlMs()).toISOString()
  const emailKey = user.emailKey ?? getEmailKey(user.email)
  getCloudDatabase()
    .prepare(
      `INSERT INTO email_verification_codes
        (id, user_id, email_key, code_hash, attempts, created_at, expires_at, consumed_at, user_agent)
       VALUES (?, ?, ?, ?, 0, ?, ?, NULL, ?)`,
    )
    .run(
      randomUUID(),
      user.id,
      emailKey,
      hashVerificationCode(user.id, emailKey, code),
      now.toISOString(),
      expiresAt,
      String(requestMeta.userAgent || '').slice(0, 240),
    )
  const delivery = await sendVerificationEmail({
    to: user.email,
    code,
    username: user.displayName ?? user.username,
    expiresAt,
  })

  return {
    email: user.email,
    verificationExpiresAt: expiresAt,
    requiresEmailVerification: true,
    devVerificationCode: delivery.devCode,
    user: toPublicUser(user),
  }
}

function readUserByEmailKey(emailKey) {
  const row = getCloudDatabase()
    .prepare(
      `SELECT id, username, username_key AS usernameKey, display_name AS displayName, password_hash AS passwordHash,
              email, email_key AS emailKey, email_verified_at AS emailVerifiedAt,
              role, created_at AS createdAt, updated_at AS updatedAt
       FROM users
       WHERE email_key = ?`,
    )
    .get(emailKey)
  return row ?? null
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
  return readEnv('YURI_CHAT_SYNC_TOKEN') || readEnv('YURI_CHAT_MODEL_SECRET') || 'local-yuri_chat-account-secret'
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
    throw createPublicError('昵称需要 2-32 个字符，可用中文、字母、数字、下划线、短横线或点。')
  }
}

function validatePassword(password) {
  if (password.length < 8) throw createPublicError('密码至少需要 8 位。')
  if (password.length > 128) throw createPublicError('密码太长啦，最多 128 位。')
}

function validateEmail(email) {
  const issue = getEmailValidationError(email)
  if (issue) throw createPublicError(issue)
}

function validateEmailDeliveryConfigured() {
  const emailIssue = getEmailDeliveryConfigurationIssue()
  if (emailIssue) throw createPublicError(emailIssue, 503)
}

function createVerificationCode() {
  return String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, '0')
}

function normalizeVerificationCode(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 6)
}

function hashVerificationCode(userId, emailKey, code) {
  return createHmac('sha256', getAuthSecret()).update(`${userId}:${emailKey}:${code}`).digest('hex')
}

function isSameHash(left, right) {
  const leftBuffer = Buffer.from(String(left))
  const rightBuffer = Buffer.from(String(right))
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function getVerificationCodeTtlMs() {
  const minutes = Number(readEnv('YURI_CHAT_EMAIL_CODE_TTL_MINUTES'))
  const safeMinutes = Number.isFinite(minutes) && minutes >= 5 && minutes <= 60 ? minutes : 15
  return safeMinutes * 60 * 1000
}

function isProductionLikeRuntime() {
  return (
    process.env.NODE_ENV === 'production' ||
    readBooleanEnv('YURI_CHAT_PUBLIC_SERVER') === true ||
    readBooleanEnv('YURI_CHAT_PUBLIC_MODE') === true
  )
}
