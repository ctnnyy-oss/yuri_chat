const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off'])

const LEGACY_ENV_NAMES = new Map([
  ['YURI_CHAT_AUTH_SECRET', 'YURI_NEST_AUTH_SECRET'],
  ['YURI_CHAT_API_PORT', 'YURI_NEST_API_PORT'],
  ['YURI_CHAT_BACKUP_DIR', 'YURI_NEST_BACKUP_DIR'],
  ['YURI_CHAT_BCRYPT_COST', 'YURI_NEST_BCRYPT_COST'],
  ['YURI_CHAT_CORS_ORIGIN', 'YURI_NEST_CORS_ORIGIN'],
  ['YURI_CHAT_DB_PATH', 'YURI_NEST_DB_PATH'],
  ['YURI_CHAT_JSON_LIMIT', 'YURI_NEST_JSON_LIMIT'],
  ['YURI_CHAT_MAX_BACKUPS', 'YURI_NEST_MAX_BACKUPS'],
  ['YURI_CHAT_MODEL_SECRET', 'YURI_NEST_MODEL_SECRET'],
  ['YURI_CHAT_PUBLIC_MODE', 'YURI_NEST_PUBLIC_MODE'],
  ['YURI_CHAT_PUBLIC_SERVER', 'YURI_NEST_PUBLIC_SERVER'],
  ['YURI_CHAT_RATELIMIT_AUTH', 'YURI_NEST_RATELIMIT_AUTH'],
  ['YURI_CHAT_REQUIRE_CHAT_AUTH', 'YURI_NEST_REQUIRE_CHAT_AUTH'],
  ['YURI_CHAT_REQUIRE_CLOUD_AUTH', 'YURI_NEST_REQUIRE_CLOUD_AUTH'],
  ['YURI_CHAT_SYNC_TOKEN', 'YURI_NEST_SYNC_TOKEN'],
])

export function readEnv(name) {
  const currentValue = process.env[name]
  if (currentValue !== undefined) return currentValue
  const legacyName = LEGACY_ENV_NAMES.get(name)
  return legacyName ? process.env[legacyName] : undefined
}

export function readBooleanEnv(name) {
  const rawValue = readEnv(name)
  if (rawValue === undefined) return null
  const normalized = String(rawValue).trim().toLowerCase()
  if (TRUE_VALUES.has(normalized)) return true
  if (FALSE_VALUES.has(normalized)) return false
  return null
}
