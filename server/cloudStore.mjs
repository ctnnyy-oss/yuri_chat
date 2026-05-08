import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { readEnv } from './env.mjs'
import { clampNumber, quoteSqlString } from './shared/utils.mjs'

const snapshotId = 'default'

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
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      revision INTEGER NOT NULL
    )
  `)
  cloudDatabase.exec(`
    CREATE TABLE IF NOT EXISTS model_profiles (
      id TEXT PRIMARY KEY,
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
  return cloudDatabase
}

export function closeCloudDatabaseForTests() {
  if (!cloudDatabase) return
  cloudDatabase.close()
  cloudDatabase = null
}

function getCloudDatabasePath() {
  return resolve(readEnv('YURI_CHAT_DB_PATH') || './data/yuri-chat.sqlite')
}

function getCloudBackupDir() {
  return resolve(readEnv('YURI_CHAT_BACKUP_DIR') || './data/backups')
}

export function readSnapshot() {
  const row = getCloudDatabase()
    .prepare('SELECT payload, updated_at AS updatedAt, revision FROM app_snapshots WHERE id = ?')
    .get(snapshotId)

  return row ?? null
}

export function saveSnapshot(state, options = {}) {
  const existing = readSnapshot()
  const baseRevision = normalizeBaseRevision(options.baseRevision)
  if (baseRevision !== null && Number(existing?.revision ?? 0) !== baseRevision) {
    throw new CloudRevisionConflictError(existing, baseRevision)
  }

  if (existing) {
    createCloudBackup(`auto-before-save-rev${existing.revision}`)
  }
  const nextRevision = Number(existing?.revision ?? 0) + 1
  const updatedAt = new Date().toISOString()
  const payload = JSON.stringify(state)

  getCloudDatabase()
    .prepare(
      `INSERT INTO app_snapshots (id, payload, updated_at, revision)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         payload = excluded.payload,
         updated_at = excluded.updated_at,
         revision = excluded.revision`,
    )
    .run(snapshotId, payload, updatedAt, nextRevision)

  return { payload, updatedAt, revision: nextRevision }
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
  const fileName = `yuri-chat-${safeReason}-${stamp}.sqlite`
  const backupPath = join(backupDir, fileName)

  database.exec(`VACUUM INTO ${quoteSqlString(backupPath)}`)
  pruneCloudBackups()
  return toCloudBackupSummary(backupPath)
}

export function listCloudBackups() {
  const backupDir = getCloudBackupDir()
  if (!existsSync(backupDir)) return []

  return readdirSync(backupDir)
    .filter((fileName) => fileName.startsWith('yuri-chat-') && fileName.endsWith('.sqlite'))
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
  if (!cleanName.startsWith('yuri-chat-') || !cleanName.endsWith('.sqlite')) return null
  const backupDir = getCloudBackupDir()
  const backupPath = resolve(backupDir, cleanName)
  return backupPath.startsWith(`${backupDir}${sep}`) ? backupPath : null
}

function toCloudBackupSummary(backupPath) {
  const stats = statSync(backupPath)
  const fileName = basename(backupPath)
  return {
    fileName,
    label: fileName.replace(/^yuri-chat-/, '').replace(/\.sqlite$/, ''),
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
