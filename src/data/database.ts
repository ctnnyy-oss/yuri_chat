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

export async function loadAppState(): Promise<AppState> {
  const database = await getDatabase()
  const savedState = await database.get(storeName, stateKey)
  return applyTrashRetention(migrateAppState(savedState ?? createSeedState()))
}

export async function saveAppState(state: AppState): Promise<void> {
  const database = await getDatabase()
  await database.put(storeName, applyTrashRetention(withMemoryEmbeddingCache(state)), stateKey)
}

export async function resetAppState(): Promise<AppState> {
  const nextState = createSeedState()
  await saveAppState(nextState)
  return nextState
}

export async function createLocalBackup(state: AppState, reason: string): Promise<LocalBackupSummary> {
  const database = await getDatabase()
  const backup = buildLocalBackup(applyTrashRetention(state), reason)
  await database.put(storeName, backup, backupKey(backup.id))
  await pruneLocalBackups()
  return toBackupSummary(backup)
}

export async function listLocalBackups(): Promise<LocalBackupSummary[]> {
  const database = await getDatabase()
  const backups = await readLocalBackups(database)
  return backups.map(toBackupSummary)
}

export async function loadLocalBackup(backupId: string): Promise<AppState | null> {
  const database = await getDatabase()
  const backup = (await database.get(storeName, backupKey(backupId))) as LocalBackup | undefined
  return backup?.state ? migrateAppState(backup.state) : null
}

export async function deleteLocalBackup(backupId: string): Promise<void> {
  const database = await getDatabase()
  await database.delete(storeName, backupKey(backupId))
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

function backupKey(backupId: string): string {
  return `${backupKeyPrefix}${backupId}`
}

async function readLocalBackups(database: Awaited<ReturnType<typeof getDatabase>>): Promise<LocalBackup[]> {
  const keys = await database.getAllKeys(storeName)
  const backupKeys = keys.filter((key): key is string => typeof key === 'string' && key.startsWith(backupKeyPrefix))
  const backups = await Promise.all(
    backupKeys.map(async (key) => (await database.get(storeName, key)) as LocalBackup | undefined),
  )
  return backups
    .filter((backup): backup is LocalBackup => Boolean(backup?.state))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

async function pruneLocalBackups(): Promise<void> {
  const database = await getDatabase()
  const backups = await readLocalBackups(database)
  await Promise.all(backups.slice(maxLocalBackups).map((backup) => database.delete(storeName, backupKey(backup.id))))
}
