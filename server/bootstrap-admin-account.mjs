import dotenv from 'dotenv'
import { createCloudBackup } from './cloudStore.mjs'
import { bootstrapVerifiedAdminAccount } from './userAccounts.mjs'

dotenv.config({ path: '.env.local' })
dotenv.config()

const options = parseOptions(process.argv.slice(2))
const email = options.email || process.env.YURI_CHAT_BOOTSTRAP_EMAIL
const username = options.username || process.env.YURI_CHAT_BOOTSTRAP_USERNAME
const displayName = options.displayName || process.env.YURI_CHAT_BOOTSTRAP_DISPLAY_NAME || username
const password = options.password || process.env.YURI_CHAT_BOOTSTRAP_PASSWORD
const allowWeakPassword = Boolean(options.allowWeakPassword || process.env.YURI_CHAT_BOOTSTRAP_ALLOW_WEAK_PASSWORD === 'true')
const skipBackup = Boolean(options.skipBackup || process.env.YURI_CHAT_BOOTSTRAP_SKIP_BACKUP === 'true')

if (!email || !password) {
  console.error('Usage: node server/bootstrap-admin-account.mjs --email <email> --password <password> [--username <name>] [--display-name <name>]')
  process.exit(1)
}

if (password.length < 8 && !allowWeakPassword) {
  console.error('Refusing a password shorter than 8 characters. Add --allow-weak-password only for local temporary testing.')
  process.exit(1)
}

try {
  const backup = skipBackup ? null : createCloudBackup('before-bootstrap-admin')
  const result = await bootstrapVerifiedAdminAccount({
    email,
    username: username || displayName,
    displayName: displayName || username,
    password,
  })

  console.log(
    JSON.stringify(
      {
        ok: true,
        created: result.created,
        user: {
          ...result.user,
          email: maskEmail(result.user.email),
        },
        backup: backup?.fileName ?? null,
      },
      null,
      2,
    ),
  )
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

function parseOptions(args) {
  const parsed = {}
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
    const next = args[index + 1]
    if (!next || next.startsWith('--')) {
      parsed[key] = true
      continue
    }
    parsed[key] = next
    index += 1
  }
  return parsed
}

function maskEmail(value) {
  const [name, domain] = String(value || '').split('@')
  if (!name || !domain) return ''
  return `${name.slice(0, 2)}***@${domain}`
}
