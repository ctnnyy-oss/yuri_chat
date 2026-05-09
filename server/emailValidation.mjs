import { readEnv } from './env.mjs'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const defaultDisposableEmailDomains = new Set([
  '10minutemail.com',
  'guerrillamail.com',
  'mailinator.com',
  'sharklasers.com',
  'tempmail.com',
  'temp-mail.org',
  'throwawaymail.com',
  'yopmail.com',
])

export function normalizeEmail(value) {
  return String(value || '').trim()
}

export function getEmailKey(email) {
  return normalizeEmail(email).normalize('NFKC').toLowerCase()
}

export function getEmailValidationError(email) {
  if (!emailPattern.test(email) || email.length > 254) return '邮箱格式不太对。'

  const domain = email.split('@').pop()?.toLowerCase() ?? ''
  const allowedDomains = readEmailDomainList('YURI_CHAT_ALLOWED_EMAIL_DOMAINS')
  if (allowedDomains.length > 0 && !allowedDomains.includes(domain)) {
    return '这个邮箱域名暂时不在开放名单里。'
  }

  const blockedDomains = new Set([...defaultDisposableEmailDomains, ...readEmailDomainList('YURI_CHAT_BLOCKED_EMAIL_DOMAINS')])
  if (blockedDomains.has(domain)) return '这个邮箱看起来像临时邮箱，换一个常用邮箱试试。'
  return null
}

function readEmailDomainList(envName) {
  return String(readEnv(envName) || '')
    .split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean)
}
