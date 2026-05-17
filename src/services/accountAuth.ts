import { storageConfig } from '../config/storage'
import { apiFetch } from './apiClient'

export interface AccountUser {
  id: string
  username: string
  email: string
  emailVerifiedAt: string | null
  displayName: string
  role: 'admin' | 'user'
  createdAt: string
  updatedAt: string
}

export interface AccountSessionPayload {
  token: string
  user: AccountUser
  expiresAt: string
}

export interface EmailVerificationPendingPayload {
  requiresEmailVerification: true
  email: string
  verificationExpiresAt: string
  devVerificationCode?: string
  user?: AccountUser
}

export type AccountAuthPayload = AccountSessionPayload | EmailVerificationPendingPayload

export function isEmailVerificationPending(payload: AccountAuthPayload): payload is EmailVerificationPendingPayload {
  return 'requiresEmailVerification' in payload && payload.requiresEmailVerification === true
}

export function getSavedSessionToken(): string {
  if (typeof window === 'undefined') return ''
  try {
    return getStoredValueWithLegacyFallback(
      storageConfig.accountSessionStorageKey,
      storageConfig.legacyAccountSessionStorageKeys,
    )
  } catch {
    return ''
  }
}

export function saveSessionToken(token: string): void {
  if (typeof window === 'undefined') return
  const cleanedToken = token.trim()
  try {
    if (cleanedToken) {
      window.localStorage.setItem(storageConfig.accountSessionStorageKey, cleanedToken)
      removeStoredValues(storageConfig.legacyAccountSessionStorageKeys)
    } else {
      window.localStorage.removeItem(storageConfig.accountSessionStorageKey)
      removeStoredValues(storageConfig.legacyAccountSessionStorageKeys)
    }
  } catch {
    // Session 只影响当前浏览器；localStorage 不可用时交给本次内存态兜底。
  }
}

function getStoredValueWithLegacyFallback(primaryKey: string, legacyKeys: string[]): string {
  const primaryValue = window.localStorage.getItem(primaryKey)
  if (primaryValue) return primaryValue

  for (const legacyKey of legacyKeys) {
    const legacyValue = window.localStorage.getItem(legacyKey)
    if (!legacyValue) continue
    try {
      window.localStorage.setItem(primaryKey, legacyValue)
    } catch {
      // 读取旧 key 已经足够维持当前会话。
    }
    return legacyValue
  }

  return ''
}

function removeStoredValues(keys: string[]): void {
  for (const key of keys) {
    window.localStorage.removeItem(key)
  }
}

export async function fetchCurrentAccount(token: string): Promise<AccountUser | null> {
  if (!token.trim()) return null
  const response = await apiFetch('/api/auth/session', { token })
  const payload = (await response.json()) as { user?: AccountUser | null }
  return payload.user ?? null
}

export async function registerAccount(input: {
  username: string
  email: string
  password: string
  displayName?: string
}): Promise<AccountAuthPayload> {
  const response = await apiFetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    timeoutMs: 30_000,
    errorFormatter: formatAuthError,
  })
  return response.json()
}

export async function loginAccount(input: { email: string; password: string }): Promise<AccountAuthPayload> {
  const response = await apiFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    timeoutMs: 30_000,
    errorFormatter: formatAuthError,
  })
  return response.json()
}

export async function verifyAccountEmail(input: { email: string; code: string }): Promise<AccountSessionPayload> {
  const response = await apiFetch('/api/auth/verify-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    timeoutMs: 30_000,
    errorFormatter: formatAuthError,
  })
  return response.json()
}

export async function resendAccountVerification(input: { email: string }): Promise<EmailVerificationPendingPayload> {
  const response = await apiFetch('/api/auth/resend-verification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    timeoutMs: 30_000,
    errorFormatter: formatAuthError,
  })
  return response.json()
}

export async function logoutAccount(token: string): Promise<void> {
  if (!token.trim()) return
  await apiFetch('/api/auth/logout', {
    method: 'POST',
    token,
    timeoutMs: 10_000,
    errorFormatter: formatAuthError,
  })
}

function formatAuthError(status: number, detail: string): string {
  if (status === 401) return detail || '邮箱或密码不对。'
  if (status === 403) return detail || '邮箱还没有验证。'
  if (status === 409) return detail || '这个邮箱已经注册过啦。'
  if (status === 429) return '账号请求太频繁啦，稍等一分钟再试。'
  if (status >= 500) return detail || '账号服务暂时没有接住。'
  return detail || `账号请求失败：${status}`
}
