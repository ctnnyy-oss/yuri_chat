export type ApiErrorFormatter = (status: number, detail: string) => string

export interface ApiFetchOptions extends RequestInit {
  token?: string
  timeoutMs?: number
  timeoutMessage?: string
  errorFormatter?: ApiErrorFormatter
}

export class ApiResponseError extends Error {
  status: number
  detail: string

  constructor(status: number, detail: string, message: string) {
    super(message)
    this.name = 'ApiResponseError'
    this.status = status
    this.detail = detail
  }
}

export async function apiFetch(path: string, options: ApiFetchOptions = {}): Promise<Response> {
  const { token = '', timeoutMs = 30_000, timeoutMessage, errorFormatter = formatDefaultApiError, ...init } = options
  const apiBaseUrl = getApiBaseUrl()
  const headers = new Headers(init.headers)
  const cleanedToken = token.trim()
  if (cleanedToken) headers.set('Authorization', `Bearer ${cleanedToken}`)

  const controller = new AbortController()
  const externalSignal = init.signal
  let timedOut = false
  const timeoutId = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const abortFromExternalSignal = () => controller.abort(externalSignal?.reason)
  if (externalSignal) {
    if (externalSignal.aborted) {
      abortFromExternalSignal()
    } else {
      externalSignal.addEventListener('abort', abortFromExternalSignal, { once: true })
    }
  }

  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    })
  } catch (error) {
    if (timedOut || (error instanceof DOMException && error.name === 'AbortError' && !externalSignal?.aborted)) {
      throw new Error(timeoutMessage || `请求超时（${Math.round(timeoutMs / 1000)} 秒），请检查网络或稍后再试`, {
        cause: error,
      })
    }
    throw error
  } finally {
    window.clearTimeout(timeoutId)
    externalSignal?.removeEventListener('abort', abortFromExternalSignal)
  }

  if (!response.ok) {
    const detail = await readApiError(response)
    throw new ApiResponseError(response.status, detail, errorFormatter(response.status, detail))
  }

  return response
}

export function getApiBaseUrl(): string {
  const configuredUrl = import.meta.env.VITE_API_BASE_URL
  if (!configuredUrl) return ''
  return configuredUrl.replace(/\/+$/, '')
}

export function isStaticPreviewHost(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.hostname.endsWith('github.io') && !getApiBaseUrl()
}

export function looksLikeHtml(value: string): boolean {
  const sample = value.trim().slice(0, 200).toLowerCase()
  return sample.startsWith('<!doctype html') || sample.startsWith('<html') || sample.includes('<title>site not found')
}

async function readApiError(response: Response): Promise<string> {
  const detail = await response.text()
  if (!detail || looksLikeHtml(detail)) return ''

  try {
    const parsed = JSON.parse(detail) as { error?: string; message?: string }
    return parsed.error || parsed.message || detail
  } catch {
    return detail
  }
}

function formatDefaultApiError(status: number, detail: string): string {
  return detail || `请求失败：${status}`
}
