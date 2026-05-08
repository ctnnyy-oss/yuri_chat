import { storageConfig } from '../config/storage'
import { apiFetch } from './apiClient'

export interface AccountUser {
  id: string
  username: string
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

export function getSavedSessionToken(): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(storageConfig.accountSessionStorageKey) ?? ''
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
    } else {
      window.localStorage.removeItem(storageConfig.accountSessionStorageKey)
    }
  } catch {
    // Session 只影响当前浏览器；localStorage 不可用时交给本次内存态兜底。
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
  password: string
  displayName?: string
}): Promise<AccountSessionPayload> {
  const response = await apiFetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    timeoutMs: 30_000,
    errorFormatter: formatAuthError,
  })
  return response.json()
}

export async function loginAccount(input: { username: string; password: string }): Promise<AccountSessionPayload> {
  const response = await apiFetch('/api/auth/login', {
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
  if (status === 401) return detail || '账号或密码不对。'
  if (status === 409) return detail || '这个用户名已经被占用啦。'
  if (status === 429) return '账号请求太频繁啦，稍等一分钟再试。'
  if (status >= 500) return detail || '账号服务暂时没有接住。'
  return detail || `账号请求失败：${status}`
}
