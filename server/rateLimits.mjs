import rateLimit from 'express-rate-limit'
import { readEnv } from './env.mjs'
import { clampNumber } from './shared/utils.mjs'

const ONE_MINUTE_MS = 60_000

export const chatRateLimiter = createRateLimiter({
  limit: readLimit('YURI_CHAT_RATELIMIT_CHAT', 30),
  message: '聊天请求太密集了，请稍等一分钟再继续。',
})

export const cloudRateLimiter = createRateLimiter({
  limit: readLimit('YURI_CHAT_RATELIMIT_CLOUD', 60),
  message: '云端同步请求太密集了，请稍等一分钟再继续。',
})

export const authRateLimiter = createRateLimiter({
  limit: readLimit('YURI_CHAT_RATELIMIT_AUTH', 20),
  message: '账号请求太频繁啦，稍等一分钟再试。',
})

function createRateLimiter({ limit, message }) {
  return rateLimit({
    windowMs: ONE_MINUTE_MS,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: message },
  })
}

function readLimit(name, fallback) {
  return clampNumber(readEnv(name), 1, 10_000, fallback)
}
