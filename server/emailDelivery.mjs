import nodemailer from 'nodemailer'
import { readBooleanEnv, readEnv } from './env.mjs'

export function getEmailDeliveryConfigurationIssue() {
  if (!isProductionLikeRuntime()) return null
  if (getEmailDeliveryMode() !== 'log') return null
  return '生产/公网模式需要配置邮箱发信服务：SMTP 或 Resend。'
}

export function shouldExposeDevEmailCode() {
  return readBooleanEnv('YURI_CHAT_EMAIL_DEV_CODES') ?? !isProductionLikeRuntime()
}

export async function sendVerificationEmail({ to, code, username, expiresAt }) {
  const mode = getEmailDeliveryMode()
  const subject = '百合小窝邮箱验证码'
  const from = readEnv('YURI_CHAT_EMAIL_FROM') || 'yuri_chat <noreply@example.com>'
  const expiresText = formatExpiry(expiresAt)
  const text = [
    `${username || '妹妹'}，欢迎来到百合小窝。`,
    '',
    `本次邮箱验证码是：${code}`,
    `验证码会在 ${expiresText} 过期。`,
    '',
    '如果不是你本人操作，可以忽略这封邮件。',
  ].join('\n')
  const html = `
    <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.7;">
      <p>${escapeHtml(username || '妹妹')}，欢迎来到百合小窝。</p>
      <p>本次邮箱验证码是：</p>
      <p style="font-size: 28px; font-weight: 700; letter-spacing: 4px;">${escapeHtml(code)}</p>
      <p>验证码会在 ${escapeHtml(expiresText)} 过期。</p>
      <p style="color: #667;">如果不是你本人操作，可以忽略这封邮件。</p>
    </div>
  `

  if (mode === 'resend') {
    await sendWithResend({ from, to, subject, text, html })
    return { provider: 'resend' }
  }

  if (mode === 'smtp') {
    await sendWithSmtp({ from, to, subject, text, html })
    return { provider: 'smtp' }
  }

  console.warn(`[yuri_chat email verification] ${to} code=${code} expires=${expiresAt}`)
  return { provider: 'log', devCode: shouldExposeDevEmailCode() ? code : undefined }
}

function getEmailDeliveryMode() {
  const configured = String(readEnv('YURI_CHAT_EMAIL_PROVIDER') || '').trim().toLowerCase()
  if (configured === 'resend' || configured === 'smtp' || configured === 'log') return configured
  if (readEnv('YURI_CHAT_RESEND_API_KEY')) return 'resend'
  if (readEnv('YURI_CHAT_SMTP_HOST')) return 'smtp'
  return 'log'
}

async function sendWithResend({ from, to, subject, text, html }) {
  const apiKey = readEnv('YURI_CHAT_RESEND_API_KEY')
  if (!apiKey) throw new Error('Resend 发信需要配置 YURI_CHAT_RESEND_API_KEY。')

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, text, html }),
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(detail || `Resend 发信失败：${response.status}`)
  }
}

async function sendWithSmtp({ from, to, subject, text, html }) {
  const host = readEnv('YURI_CHAT_SMTP_HOST')
  if (!host) throw new Error('SMTP 发信需要配置 YURI_CHAT_SMTP_HOST。')

  const port = Number(readEnv('YURI_CHAT_SMTP_PORT') || 587)
  const user = readEnv('YURI_CHAT_SMTP_USER')
  const pass = readEnv('YURI_CHAT_SMTP_PASS')
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: readBooleanEnv('YURI_CHAT_SMTP_SECURE') ?? port === 465,
    auth: user || pass ? { user, pass } : undefined,
  })
  await transporter.sendMail({ from, to, subject, text, html })
}

function formatExpiry(expiresAt) {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date(expiresAt))
  } catch {
    return '15 分钟内'
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function isProductionLikeRuntime() {
  return (
    process.env.NODE_ENV === 'production' ||
    readBooleanEnv('YURI_CHAT_PUBLIC_SERVER') === true ||
    readBooleanEnv('YURI_CHAT_PUBLIC_MODE') === true
  )
}
