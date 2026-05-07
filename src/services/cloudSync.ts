import { storageConfig } from '../config/storage'
import type { AppState } from '../domain/types'

export interface CloudMetadata {
  hasState: boolean
  updatedAt: string | null
  revision: number
}

export interface CloudSnapshot extends CloudMetadata {
  state: AppState | null
}

export interface CloudBackupSummary {
  fileName: string
  label: string
  createdAt: string
  sizeBytes: number
}

export function isCloudSyncConfigured(): boolean {
  return Boolean(getCloudApiBaseUrl())
}

export function getSavedCloudToken(): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(storageConfig.cloudTokenStorageKey) ?? ''
  } catch {
    // iOS Safari 严格模式 / 无痕窗口 / quota 满都会抛
    return ''
  }
}

export function saveCloudToken(token: string): void {
  if (typeof window === 'undefined') return
  const cleanedToken = token.trim()
  try {
    if (cleanedToken) {
      window.localStorage.setItem(storageConfig.cloudTokenStorageKey, cleanedToken)
    } else {
      window.localStorage.removeItem(storageConfig.cloudTokenStorageKey)
    }
  } catch {
    // localStorage 不可用时静默——token 仅本会话有效，不影响功能
  }
}

export async function checkCloudHealth(token: string): Promise<CloudMetadata> {
  const response = await cloudFetch('/api/cloud/health', token)
  return response.json()
}

export async function pullCloudState(token: string): Promise<CloudSnapshot> {
  const response = await cloudFetch('/api/cloud/state', token)
  return response.json()
}

export async function pushCloudState(
  state: AppState,
  token: string,
  options: { baseRevision?: number | null } = {},
): Promise<Pick<CloudSnapshot, 'updatedAt' | 'revision'>> {
  const response = await cloudFetch('/api/cloud/state', token, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ state, baseRevision: options.baseRevision ?? null }),
  })
  return response.json()
}

export async function listCloudBackups(token: string): Promise<CloudBackupSummary[]> {
  const response = await cloudFetch('/api/cloud/backups', token)
  const payload = (await response.json()) as { backups?: CloudBackupSummary[] }
  return payload.backups ?? []
}

export async function createCloudBackup(token: string): Promise<CloudBackupSummary[]> {
  const response = await cloudFetch('/api/cloud/backups', token, { method: 'POST' })
  const payload = (await response.json()) as { backups?: CloudBackupSummary[] }
  return payload.backups ?? []
}

export async function downloadCloudBackup(token: string, fileName: string): Promise<Blob> {
  const safeName = encodeURIComponent(fileName)
  const response = await cloudFetch(`/api/cloud/backups/${safeName}`, token)
  return response.blob()
}

async function cloudFetch(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  const apiBaseUrl = getCloudApiBaseUrl()
  if (!apiBaseUrl) throw new Error('云端后端还没有配置')
  const headers = new Headers(init.headers)
  if (token.trim()) headers.set('Authorization', `Bearer ${token.trim()}`)

  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 30_000)
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers,
      signal: init.signal ?? controller.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('云端请求超时（30 秒），请检查网络或稍后再试', { cause: error })
    }
    throw error
  } finally {
    window.clearTimeout(timeoutId)
  }

  if (!response.ok) {
    const detail = await readCloudError(response)
    throw new Error(formatCloudError(response.status, detail))
  }

  return response
}

async function readCloudError(response: Response): Promise<string> {
  const detail = await response.text()
  if (!detail) return ''

  try {
    const parsed = JSON.parse(detail) as { error?: string; message?: string }
    return parsed.error || parsed.message || detail
  } catch {
    return detail
  }
}

function formatCloudError(status: number, detail: string): string {
  if (status === 401) return '服务器拒绝访问。以后开启登录后，需要重新登录。'
  if (status === 409) return detail || '云端版本已经变化。请先读取云端，或先创建本机备份后再决定如何处理。'
  if (status === 503) return '云端同步还没有在服务器启用'
  if (status >= 500) return `云端服务暂时没接住：${detail || status}`
  return detail || `云端请求失败：${status}`
}

export function getCloudApiBaseUrl(): string {
  const configuredUrl = import.meta.env.VITE_API_BASE_URL
  if (!configuredUrl) return ''
  return configuredUrl.replace(/\/+$/, '')
}
