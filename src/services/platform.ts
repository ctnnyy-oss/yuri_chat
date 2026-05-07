import type { AgentAction, AgentTaskPriority, AgentTaskStatus } from '../domain/types'
import { getCloudApiBaseUrl, getSavedCloudToken } from './cloudSync'

export type PlatformTaskStatus = AgentTaskStatus | 'cancelled'
export type PlatformTaskKind = 'generic' | 'web_fetch' | 'file_scan' | 'connector_check'

export interface PlatformTaskStep {
  id: string
  title: string
  status: PlatformTaskStatus
}

export interface PlatformTask {
  id: string
  title: string
  detail: string
  kind: PlatformTaskKind
  status: PlatformTaskStatus
  priority: AgentTaskPriority
  source: 'agent' | 'user'
  createdAt: string
  updatedAt: string
  startedAt: string | null
  completedAt: string | null
  result: string
  error: string
  logs: string[]
  steps: PlatformTaskStep[]
}

export interface PlatformConnector {
  id: string
  label: string
  category: string
  status: 'env_ready' | 'manual_ready' | 'not_connected' | 'disabled'
  connected: boolean
  mode: 'server_env' | 'manual' | 'none'
  envReady: boolean
  updatedAt: string | null
  metadata: Record<string, unknown>
}

export interface PlatformExecutor {
  id: PlatformTaskKind
  label: string
  enabled: boolean
  risk: 'low' | 'medium' | 'high'
}

export interface PlatformNotification {
  id: string
  title: string
  body: string
  kind: string
  status: 'unseen' | 'seen'
  taskId: string | null
  createdAt: string
  seenAt: string | null
}

export interface PlatformStatus {
  ok: boolean
  worker: {
    enabled: boolean
    intervalMs: number
  }
  queue: Record<'queued' | 'running' | 'completed' | 'failed' | 'blocked', number>
  notifications: {
    unseen: number
  }
  connectors: PlatformConnector[]
  executors: PlatformExecutor[]
}

export interface PlatformTaskInput {
  title: string
  detail: string
  kind?: PlatformTaskKind
  priority?: AgentTaskPriority
  source?: 'agent' | 'user'
  steps?: string[]
}

export async function getPlatformStatus(): Promise<PlatformStatus> {
  const response = await platformFetch('/api/platform/status')
  return response.json()
}

export async function listPlatformTasks(): Promise<PlatformTask[]> {
  const response = await platformFetch('/api/platform/tasks')
  const payload = (await response.json()) as { tasks?: PlatformTask[] }
  return payload.tasks ?? []
}

export async function createPlatformTask(task: PlatformTaskInput): Promise<PlatformTask> {
  const response = await platformFetch('/api/platform/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task }),
  })
  const payload = (await response.json()) as { task: PlatformTask }
  return payload.task
}

export async function updatePlatformTask(taskId: string, status: PlatformTaskStatus): Promise<PlatformTask> {
  const response = await platformFetch(`/api/platform/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  const payload = (await response.json()) as { task: PlatformTask }
  return payload.task
}

export async function listPlatformNotifications(): Promise<PlatformNotification[]> {
  const response = await platformFetch('/api/platform/notifications')
  const payload = (await response.json()) as { notifications?: PlatformNotification[] }
  return payload.notifications ?? []
}

export async function markPlatformNotificationsSeen(ids: string[]): Promise<PlatformNotification[]> {
  const response = await platformFetch('/api/platform/notifications', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
  const payload = (await response.json()) as { notifications?: PlatformNotification[] }
  return payload.notifications ?? []
}

export async function updatePlatformConnector(connectorId: string, action: 'mark_manual' | 'disconnect') {
  const response = await platformFetch(`/api/platform/connectors/${encodeURIComponent(connectorId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  })
  return response.json() as Promise<{ connector: PlatformConnector; connectors: PlatformConnector[] }>
}

export async function enqueueAgentTaskAction(action: AgentAction): Promise<PlatformTask | null> {
  const task = action.payload.task
  if (action.type !== 'task_create' || !task) return null

  return createPlatformTask({
    title: task.title,
    detail: task.detail,
    priority: task.priority,
    source: 'agent',
    steps: task.steps,
  })
}

export function getBrowserNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return window.Notification.permission
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return window.Notification.requestPermission()
}

export async function showBrowserNotification(title: string, body: string): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  if (window.Notification.permission !== 'granted') return false

  const options = {
    body,
    icon: `${normalizeBaseUrl(import.meta.env.BASE_URL)}favicon.svg`,
    badge: `${normalizeBaseUrl(import.meta.env.BASE_URL)}favicon.svg`,
  }

  try {
    const registration = await navigator.serviceWorker?.ready
    if (registration?.showNotification) {
      await registration.showNotification(title, options)
      return true
    }
  } catch {
    // Fall through to regular page notification.
  }

  new window.Notification(title, options)
  return true
}

async function platformFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const apiBaseUrl = getPlatformApiBaseUrl()
  if (!apiBaseUrl && isStaticPreviewHost()) {
    throw new Error('线上静态版还没有连接后台平台。后台任务、通知和账号连接需要云端后端。')
  }
  const headers = new Headers(init.headers)
  const token = getSavedCloudToken()
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
      throw new Error('后台平台请求超时（30 秒），请检查网络或稍后再试', { cause: error })
    }
    throw error
  } finally {
    window.clearTimeout(timeoutId)
  }

  if (!response.ok) {
    const detail = await readPlatformError(response)
    if (!detail) throw new Error(`后台平台暂时没有接通：${response.status}`)
    throw new Error(detail || `平台请求失败：${response.status}`)
  }

  return response
}

function getPlatformApiBaseUrl(): string {
  const configuredUrl = getCloudApiBaseUrl()
  if (configuredUrl) return configuredUrl
  return ''
}

function isStaticPreviewHost(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.hostname.endsWith('github.io') && !getCloudApiBaseUrl()
}

async function readPlatformError(response: Response): Promise<string> {
  const detail = await response.text()
  if (!detail) return ''
  if (looksLikeHtml(detail)) return ''

  try {
    const parsed = JSON.parse(detail) as { error?: string; message?: string }
    return parsed.error || parsed.message || detail
  } catch {
    return detail
  }
}

function looksLikeHtml(value: string): boolean {
  const sample = value.trim().slice(0, 200).toLowerCase()
  return sample.startsWith('<!doctype html') || sample.startsWith('<html') || sample.includes('<title>site not found')
}

function normalizeBaseUrl(value: string) {
  if (!value) return '/'
  return value.endsWith('/') ? value : `${value}/`
}
