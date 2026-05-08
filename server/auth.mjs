import { timingSafeEqual } from 'node:crypto'
import { readBooleanEnv, readEnv } from './env.mjs'

export function hasCloudSyncToken() {
  return Boolean(readEnv('YURI_CHAT_SYNC_TOKEN'))
}

export function requireCloudAuth(request, response, next) {
  if (!shouldRequireCloudAuth()) {
    next()
    return
  }

  const failure = getCloudAuthFailure(request)
  if (failure) {
    response.status(failure.status).json({ error: failure.message })
    return
  }

  next()
}

export function shouldRequireCloudAuth() {
  return readBooleanEnv('YURI_CHAT_REQUIRE_CLOUD_AUTH') ?? isProductionRuntime()
}

export function shouldRequireModelAuth() {
  return readBooleanEnv('YURI_CHAT_REQUIRE_CHAT_AUTH') ?? isProductionRuntime()
}

export function isProductionRuntime() {
  return (
    process.env.NODE_ENV === 'production' ||
    readBooleanEnv('YURI_CHAT_PUBLIC_SERVER') === true ||
    readBooleanEnv('YURI_CHAT_PUBLIC_MODE') === true
  )
}

export function getSecurityStartupHints() {
  const hints = []
  if (shouldRequireCloudAuth() && !hasCloudSyncToken()) {
    hints.push('生产/公网模式已默认要求云端授权，但 YURI_CHAT_SYNC_TOKEN 还没有配置。云端与模型保险箱接口会拒绝访问。')
  }
  if (shouldRequireModelAuth() && !hasCloudSyncToken()) {
    hints.push('生产/公网模式已默认要求聊天授权，但 YURI_CHAT_SYNC_TOKEN 还没有配置。/api/chat 会拒绝访问。')
  }
  return hints
}

export function getCloudAuthFailure(request) {
  const expectedToken = readEnv('YURI_CHAT_SYNC_TOKEN')
  if (!expectedToken) {
    return { status: 503, message: '云端同步口令还没有在服务器配置，请设置 YURI_CHAT_SYNC_TOKEN。' }
  }

  if (!isSameToken(getProvidedCloudToken(request), expectedToken)) {
    return { status: 401, message: '云端同步口令无效。' }
  }

  return null
}

function getProvidedCloudToken(request) {
  return (
    request.get('x-yuri-chat-token') ||
    request.get('x-yuri-nest-token') ||
    request.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    ''
  )
}

function isSameToken(providedToken, expectedToken) {
  const provided = Buffer.from(String(providedToken))
  const expected = Buffer.from(String(expectedToken))
  return provided.length === expected.length && timingSafeEqual(provided, expected)
}
