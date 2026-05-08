import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useState } from 'react'
import { brand } from '../config/brand'
import {
  createLocalBackup,
  deleteLocalBackup,
  listLocalBackups,
  loadLocalBackup,
  resetAppState,
} from '../data/database'
import type { AppState, LocalBackupSummary } from '../domain/types'
import { migrateAppState } from '../data/migrations'
import { applyTrashRetention } from '../services/trashRetention'
import { addMemoryEventToState } from './agentActions'
import { formatShortDateTime } from './formatters'

interface UseBackupRestoreDeps {
  state: AppState
  setState: Dispatch<SetStateAction<AppState>>
  setNotice: Dispatch<SetStateAction<string>>
  characterId: string
  accountId: string
}

export function useBackupRestore({ state, setState, setNotice, characterId, accountId }: UseBackupRestoreDeps) {
  const [localBackups, setLocalBackups] = useState<LocalBackupSummary[]>([])

  const refreshLocalBackups = useCallback(async () => {
    const backups = await listLocalBackups(accountId)
    setLocalBackups(backups)
  }, [accountId])

  async function makeLocalBackup(reason: string) {
    const backup = await createLocalBackup(applyTrashRetention(state), reason, accountId)
    await refreshLocalBackups()
    return backup
  }

  async function handleCreateLocalBackup() {
    try {
      const stateWithEvent = addMemoryEventToState(applyTrashRetention(state), {
        type: 'local_backup_created',
        actor: 'user',
        title: '创建本机备份',
        detail: '妹妹手动创建了一份本机保险箱备份。',
        memoryIds: [],
        characterId,
      })
      const backup = await createLocalBackup(stateWithEvent, '妹妹手动创建', accountId)
      setState(stateWithEvent)
      await refreshLocalBackups()
      setNotice(`已创建本机备份：${formatShortDateTime(backup.createdAt)}`)
    } catch {
      setNotice('本机备份创建失败')
    }
  }

  async function handleRestoreLocalBackup(backupId: string) {
    const backup = localBackups.find((item) => item.id === backupId)
    const label = backup ? `${backup.label} / ${formatShortDateTime(backup.createdAt)}` : '这份备份'
    if (!window.confirm(`恢复 ${label} 会覆盖当前本机数据。姐姐会先给当前状态再留一份备份，确定恢复吗？`)) {
      setNotice('已取消恢复备份')
      return
    }

    try {
      await makeLocalBackup('恢复本机备份前自动备份')
      const restoredState = await loadLocalBackup(backupId, accountId)
      if (!restoredState) {
        setNotice('这份本机备份没有找到')
        await refreshLocalBackups()
        return
      }

      setState(
        addMemoryEventToState(restoredState, {
          type: 'local_backup_restored',
          actor: 'user',
          title: '恢复本机备份',
          detail: `恢复 ${label}，恢复前已自动备份当前状态。`,
          memoryIds: [],
          characterId,
        }),
      )
      setNotice('已恢复本机备份')
    } catch {
      setNotice('恢复本机备份失败')
    }
  }

  async function handleDeleteLocalBackup(backupId: string) {
    if (!window.confirm('这只会删除这份本机备份，不影响当前数据。确定删除吗？')) return

    await deleteLocalBackup(backupId, accountId)
    await refreshLocalBackups()
    setNotice('本机备份已删除')
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${brand.exportPrefix}-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setNotice('数据已导出')
  }

  async function handleImport(file: File) {
    try {
      const importedState = JSON.parse(await file.text()) as AppState
      if (!Array.isArray(importedState.characters) || !Array.isArray(importedState.conversations)) {
        throw new Error('Invalid state file')
      }
      await makeLocalBackup('导入文件前自动备份')
      const migratedState = migrateAppState(importedState)
      setState(
        addMemoryEventToState(migratedState, {
          type: 'imported',
          actor: 'user',
          title: '导入数据',
          detail: '从 JSON 文件导入应用数据，导入前已自动备份当前状态。',
          memoryIds: migratedState.memories.slice(0, 8).map((memory) => memory.id),
          characterId,
        }),
      )
      setNotice('数据已导入')
    } catch {
      setNotice('导入失败，文件格式或本机备份没有通过')
    }
  }

  async function handleReset() {
    if (!window.confirm('重置会回到初始状态。姐姐会先创建本机备份，确定继续吗？')) {
      setNotice('已取消重置')
      return
    }

    try {
      await makeLocalBackup('重置前自动备份')
      const nextState = await resetAppState(accountId)
      setState(
        addMemoryEventToState(nextState, {
          type: 'reset',
          actor: 'user',
          title: '重置应用',
          detail: '回到初始状态，重置前已自动备份当前状态。',
          memoryIds: nextState.memories.map((memory) => memory.id),
          characterId,
        }),
      )
      setNotice('已回到初始状态，本机旧数据已备份')
    } catch {
      setNotice('重置失败，本机备份没有通过')
    }
  }

  return {
    localBackups,
    refreshLocalBackups,
    makeLocalBackup,
    handleCreateLocalBackup,
    handleRestoreLocalBackup,
    handleDeleteLocalBackup,
    handleExport,
    handleImport,
    handleReset,
  }
}
