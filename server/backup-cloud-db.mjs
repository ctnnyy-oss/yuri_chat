import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import dotenv from 'dotenv'
import { readEnv } from './env.mjs'
import { clampNumber, quoteSqlString } from './shared/utils.mjs'

dotenv.config({ path: '.env.local' })
dotenv.config()

const databasePath = resolve(readEnv('YURI_CHAT_DB_PATH') || './data/yuri_chat.sqlite')
const backupDir = resolve(readEnv('YURI_CHAT_BACKUP_DIR') || './data/backups')
const maxBackups = clampNumber(readEnv('YURI_CHAT_MAX_BACKUPS'), 3, 120, 24)

if (!existsSync(databasePath)) {
  console.log(`No database found at ${databasePath}`)
  process.exit(0)
}

mkdirSync(dirname(databasePath), { recursive: true })
mkdirSync(backupDir, { recursive: true })

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const backupPath = join(backupDir, `yuri_chat-scheduled-${stamp}.sqlite`)
const database = new DatabaseSync(databasePath)

database.exec(`VACUUM INTO ${quoteSqlString(backupPath)}`)
database.close()
pruneBackups()

console.log(`Created ${basename(backupPath)}`)

function pruneBackups() {
  readdirSync(backupDir)
    .filter((fileName) => fileName.startsWith('yuri_chat-') && fileName.endsWith('.sqlite'))
    .map((fileName) => {
      const path = join(backupDir, fileName)
      return { path, createdAt: statSync(path).mtime.toISOString() }
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(maxBackups)
    .forEach((backup) => rmSync(backup.path, { force: true }))
}
