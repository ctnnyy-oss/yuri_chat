import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { readEnv } from './env.mjs'
import { clampNumber } from './shared/utils.mjs'

export const legacyUserId = 'legacy-user'

let cloudDatabase

export class CloudRevisionConflictError extends Error {
  constructor(currentSnapshot, baseRevision) {
    const currentRevision = Number(currentSnapshot?.revision ?? 0)
    super(`云端版本已更新：当前是 v${currentRevision}，本机尝试基于 v${baseRevision} 覆盖。请先读取云端或创建本机备份后再处理。`)
    this.name = 'CloudRevisionConflictError'
    this.currentRevision = currentRevision
    this.updatedAt = currentSnapshot?.updatedAt ?? null
  }
}

export function getCloudDatabase() {
  if (cloudDatabase) return cloudDatabase

  const databasePath = getCloudDatabasePath()
  mkdirSync(dirname(databasePath), { recursive: true })
  cloudDatabase = new DatabaseSync(databasePath)
  cloudDatabase.exec(`
    CREATE TABLE IF NOT EXISTS app_snapshots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '${legacyUserId}',
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      revision INTEGER NOT NULL
    )
  `)
  cloudDatabase.exec(`
    CREATE TABLE IF NOT EXISTS model_profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '${legacyUserId}',
      name TEXT NOT NULL,
      provider_kind TEXT NOT NULL,
      base_url TEXT NOT NULL,
      model TEXT NOT NULL,
      encrypted_api_key TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
  migrateCloudDatabaseSchema(cloudDatabase)
  return cloudDatabase
}

export function closeCloudDatabaseForTests() {
  if (!cloudDatabase) return
  cloudDatabase.close()
  cloudDatabase = null
}

function migrateCloudDatabaseSchema(database) {
  ensureColumn(database, 'app_snapshots', 'user_id', `TEXT NOT NULL DEFAULT '${legacyUserId}'`)
  ensureColumn(database, 'model_profiles', 'user_id', `TEXT NOT NULL DEFAULT '${legacyUserId}'`)
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_app_snapshots_user_id ON app_snapshots(user_id);
    CREATE INDEX IF NOT EXISTS idx_model_profiles_user_id ON model_profiles(user_id, is_default, updated_at);
  `)
}

function ensureColumn(database, tableName, columnName, definition) {
  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all()
  if (columns.some((column) => column.name === columnName)) return
  database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`)
}

function getCloudDatabasePath() {
  return resolve(readEnv('YURI_CHAT_DB_PATH') || './data/yuri_chat.sqlite')
}

function getCloudBackupDir() {
  return resolve(readEnv('YURI_CHAT_BACKUP_DIR') || './data/backups')
}

function shouldCreateAutoBeforeSaveBackup() {
  const intervalMinutes = clampNumber(readEnv('YURI_CHAT_AUTO_BACKUP_INTERVAL_MINUTES'), 0, 1440, 10)
  if (intervalMinutes <= 0) return true

  const backupDir = getCloudBackupDir()
  if (!existsSync(backupDir)) return true

  const cutoffMs = Date.now() - intervalMinutes * 60_000
  return !readdirSync(backupDir).some((fileName) => {
    if (!fileName.startsWith('yuri_chat-auto-before-save-') || !fileName.endsWith('.sqlite')) return false
    try {
      return statSync(join(backupDir, fileName)).mtimeMs >= cutoffMs
    } catch {
      return false
    }
  })
}

export function readSnapshot() {
  return readUserSnapshot(legacyUserId)
}

export function readUserSnapshot(userId) {
  const dataUserId = normalizeDataUserId(userId)
  const row = getCloudDatabase()
    .prepare(
      `SELECT id, payload, updated_at AS updatedAt, revision
       FROM app_snapshots
       WHERE user_id = ?
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .get(dataUserId)

  return row ?? null
}

export function saveSnapshot(state, options = {}) {
  return saveUserSnapshot(state, { ...options, userId: legacyUserId })
}

export function saveUserSnapshot(state, options = {}) {
  const dataUserId = normalizeDataUserId(options.userId)
  const existing = readUserSnapshot(dataUserId)
  const baseRevision = normalizeBaseRevision(options.baseRevision)
  if (baseRevision !== null && Number(existing?.revision ?? 0) !== baseRevision) {
    throw new CloudRevisionConflictError(existing, baseRevision)
  }

  if (existing && shouldCreateAutoBeforeSaveBackup()) {
    createCloudBackup(`auto-before-save-rev${existing.revision}`)
  }
  const nextRevision = Number(existing?.revision ?? 0) + 1
  const updatedAt = new Date().toISOString()
  const payload = JSON.stringify(state)
  const snapshotId = getSnapshotIdForUser(dataUserId)

  if (existing) {
    getCloudDatabase()
      .prepare(
        `UPDATE app_snapshots
         SET id = ?, payload = ?, updated_at = ?, revision = ?
         WHERE user_id = ?`,
      )
      .run(snapshotId, payload, updatedAt, nextRevision, dataUserId)
  } else {
    getCloudDatabase()
      .prepare(
        `INSERT INTO app_snapshots (id, user_id, payload, updated_at, revision)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(snapshotId, dataUserId, payload, updatedAt, nextRevision)
  }

  return { payload, updatedAt, revision: nextRevision }
}

export function claimLegacyCloudDataForUser(userId) {
  const dataUserId = normalizeDataUserId(userId)
  if (dataUserId === legacyUserId) return

  const database = getCloudDatabase()
  const legacySnapshot = readUserSnapshot(legacyUserId)
  const userSnapshot = readUserSnapshot(dataUserId)
  if (legacySnapshot && !userSnapshot) {
    database
      .prepare('UPDATE app_snapshots SET id = ?, user_id = ? WHERE user_id = ?')
      .run(getSnapshotIdForUser(dataUserId), dataUserId, legacyUserId)
  }

  database.prepare('UPDATE model_profiles SET user_id = ? WHERE user_id = ?').run(dataUserId, legacyUserId)
}

export function normalizeDataUserId(userId) {
  const normalized = String(userId || '').trim()
  return normalized || legacyUserId
}

function getSnapshotIdForUser(userId) {
  return `snapshot:${normalizeDataUserId(userId)}`
}

function normalizeBaseRevision(value) {
  if (value === undefined || value === null || value === '') return null
  const revision = Number(value)
  if (!Number.isInteger(revision) || revision < 0) return null
  return revision
}

export function createCloudBackup(reason = 'manual') {
  const database = getCloudDatabase()
  const backupDir = getCloudBackupDir()
  mkdirSync(backupDir, { recursive: true })

  const safeReason = String(reason).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').slice(0, 48) || 'backup'
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const fileName = `yuri_chat-${safeReason}-${stamp}.sqlite`
  const backupPath = join(backupDir, fileName)

  database.exec('PRAGMA wal_checkpoint(FULL)')
  copyFileSync(getCloudDatabasePath(), backupPath)
  pruneCloudBackups()
  return toCloudBackupSummary(backupPath)
}

export function listCloudBackups() {
  const backupDir = getCloudBackupDir()
  if (!existsSync(backupDir)) return []

  return readdirSync(backupDir)
    .filter((fileName) => fileName.startsWith('yuri_chat-') && fileName.endsWith('.sqlite'))
    .map((fileName) => toCloudBackupSummary(join(backupDir, fileName)))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

function pruneCloudBackups() {
  const maxBackups = clampNumber(readEnv('YURI_CHAT_MAX_BACKUPS'), 3, 120, 24)
  const backups = listCloudBackups()
  backups.slice(maxBackups).forEach((backup) => {
    const backupPath = resolveBackupPath(backup.fileName)
    if (backupPath) rmSync(backupPath, { force: true })
  })
}

export function resolveBackupPath(fileName) {
  const cleanName = basename(String(fileName))
  if (!cleanName.startsWith('yuri_chat-') || !cleanName.endsWith('.sqlite')) return null
  const backupDir = getCloudBackupDir()
  const backupPath = resolve(backupDir, cleanName)
  return backupPath.startsWith(`${backupDir}${sep}`) ? backupPath : null
}

function toCloudBackupSummary(backupPath) {
  const stats = statSync(backupPath)
  const fileName = basename(backupPath)
  return {
    fileName,
    label: fileName.replace(/^yuri_chat-/, '').replace(/\.sqlite$/, ''),
    createdAt: stats.mtime.toISOString(),
    sizeBytes: stats.size,
  }
}

export function isValidAppStateShape(state) {
  return (
    state &&
    typeof state === 'object' &&
    Array.isArray(state.characters) &&
    Array.isArray(state.conversations) &&
    Array.isArray(state.memories) &&
    Array.isArray(state.worldNodes) &&
    state.settings &&
    typeof state.settings === 'object'
  )
}
