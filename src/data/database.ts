import { openDB } from 'idb'
import { storageConfig } from '../config/storage'
import type { AppState, LocalBackup, LocalBackupSummary } from '../domain/types'
import { refreshLocalMemoryEmbeddingCache } from '../services/memoryEmbeddingIndex'
import { applyTrashRetention } from '../services/trashRetention'
import { migrateAppState } from './migrations'
import { createSeedState } from './seed'

const { backupKeyPrefix, databaseName, maxLocalBackups, stateKey, storeName } = storageConfig

async function getDatabase() {
  return openDB(databaseName, 1, {
    upgrade(database) {
      database.createObjectStore(storeName)
    },
  })
}

export async function loadAppState(accountId = ''): Promise<AppState> {
  const database = await getDatabase()
  const key = stateKeyForAccount(accountId)
  let savedState = await database.get(storeName, key)
  if (!savedState && accountId) {
    savedState = await claimLegacyLocalState(database, accountId)
  }
  return applyTrashRetention(migrateAppState(savedState ?? createSeedState()))
}

export async function saveAppState(state: AppState, accountId = ''): Promise<void> {
  const database = await getDatabase()
  await database.put(storeName, applyTrashRetention(withMemoryEmbeddingCache(state)), stateKeyForAccount(accountId))
}

export async function resetAppState(accountId = ''): Promise<AppState> {
  const nextState = createSeedState()
  await saveAppState(nextState, accountId)
  return nextState
}

export async function createLocalBackup(state: AppState, reason: string, accountId = ''): Promise<LocalBackupSummary> {
  const database = await getDatabase()
  const backup = buildLocalBackup(applyTrashRetention(state), reason)
  await database.put(storeName, backup, backupKey(backup.id, accountId))
  await pruneLocalBackups(accountId)
  return toBackupSummary(backup)
}

export async function listLocalBackups(accountId = ''): Promise<LocalBackupSummary[]> {
  const database = await getDatabase()
  const backups = await readLocalBackups(database, accountId)
  return backups.map(toBackupSummary)
}

export async function loadLocalBackup(backupId: string, accountId = ''): Promise<AppState | null> {
  const database = await getDatabase()
  const backup = (await database.get(storeName, backupKey(backupId, accountId))) as LocalBackup | undefined
  return backup?.state ? migrateAppState(backup.state) : null
}

export async function deleteLocalBackup(backupId: string, accountId = ''): Promise<void> {
  const database = await getDatabase()
  await database.delete(storeName, backupKey(backupId, accountId))
}

function buildLocalBackup(state: AppState, reason: string): LocalBackup {
  const createdAt = new Date().toISOString()
  const suffix = createdAt.slice(0, 19).replace(/[T:]/g, '-')
  const stateWithEmbeddingCache = withMemoryEmbeddingCache(state)
  return {
    id: `local-${suffix}-${Math.random().toString(36).slice(2, 8)}`,
    label: `本机备份 ${createdAt.slice(0, 10)}`,
    reason,
    createdAt,
    stateVersion: stateWithEmbeddingCache.version,
    counts: {
      conversations: stateWithEmbeddingCache.conversations.length,
      memories: stateWithEmbeddingCache.memories.length,
      worldNodes: stateWithEmbeddingCache.worldNodes.length,
      trashedItems:
        stateWithEmbeddingCache.trash.memories.length +
        stateWithEmbeddingCache.trash.worldNodes.length +
        stateWithEmbeddingCache.trash.conversations.length,
    },
    state: stateWithEmbeddingCache,
  }
}

function withMemoryEmbeddingCache(state: AppState): AppState {
  return {
    ...state,
    memoryEmbeddings: refreshLocalMemoryEmbeddingCache(state.memories, state.memoryEmbeddings),
  }
}

function toBackupSummary(backup: LocalBackup): LocalBackupSummary {
  return {
    id: backup.id,
    label: backup.label,
    reason: backup.reason,
    createdAt: backup.createdAt,
    stateVersion: backup.stateVersion,
    counts: backup.counts,
  }
}

function stateKeyForAccount(accountId: string): string {
  return accountId ? `${stateKey}:${accountId}` : stateKey
}

function backupKey(backupId: string, accountId = ''): string {
  return `${backupKeyPrefix}${backupIdPrefix(accountId)}${backupId}`
}

function backupIdPrefix(accountId: string): string {
  return accountId ? `${accountId}:` : ''
}

async function readLocalBackups(
  database: Awaited<ReturnType<typeof getDatabase>>,
  accountId = '',
): Promise<LocalBackup[]> {
  const keys = await database.getAllKeys(storeName)
  const prefix = `${backupKeyPrefix}${backupIdPrefix(accountId)}`
  const backupKeys = keys.filter((key): key is string => typeof key === 'string' && key.startsWith(prefix))
  const backups = await Promise.all(
    backupKeys.map(async (key) => (await database.get(storeName, key)) as LocalBackup | undefined),
  )
  return backups
    .filter((backup): backup is LocalBackup => Boolean(backup?.state))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

async function pruneLocalBackups(accountId = ''): Promise<void> {
  const database = await getDatabase()
  const backups = await readLocalBackups(database, accountId)
  await Promise.all(
    backups.slice(maxLocalBackups).map((backup) => database.delete(storeName, backupKey(backup.id, accountId))),
  )
}

async function claimLegacyLocalState(
  database: Awaited<ReturnType<typeof getDatabase>>,
  accountId: string,
): Promise<AppState | undefined> {
  const legacyState = await database.get(storeName, stateKey)
  if (!legacyState) return undefined
  if (typeof window !== 'undefined') {
    try {
      const claimedBy = window.localStorage.getItem(storageConfig.legacyLocalClaimStorageKey)
      if (claimedBy && claimedBy !== accountId) return undefined
      window.localStorage.setItem(storageConfig.legacyLocalClaimStorageKey, accountId)
    } catch {
      // 无痕窗口里 localStorage 可能不可写；账号专属 key 仍然会保存当前状态。
    }
  }
  await database.put(storeName, legacyState, stateKeyForAccount(accountId))
  return legacyState
}
