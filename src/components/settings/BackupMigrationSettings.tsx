import { Save } from 'lucide-react'
import type { LocalBackupSummary } from '../../domain/types'
import { formatBackupCounts, formatShortTime } from '../memory/memoryPanelUtils'

interface BackupMigrationSettingsProps {
  localBackups: LocalBackupSummary[]
  onCreateLocalBackup: () => void
  onDeleteLocalBackup: (backupId: string) => void
  onExport: () => void
  onImport: (file: File) => void
  onReset: () => void
  onRestoreLocalBackup: (backupId: string) => void
}

export function BackupMigrationSettings({
  localBackups,
  onCreateLocalBackup,
  onDeleteLocalBackup,
  onExport,
  onImport,
  onReset,
  onRestoreLocalBackup,
}: BackupMigrationSettingsProps) {
  const visibleLocalBackups = localBackups.slice(0, 3)
  const hiddenLocalBackupCount = Math.max(0, localBackups.length - visibleLocalBackups.length)

  return (
    <div className="settings-section">
      <div className="settings-section-title">
        <Save size={18} />
        <span>备份与迁移</span>
      </div>
      <p className="section-note">
        从云端读取、导入文件、重置之前会自动留一份本机备份；也可以手动导出，方便自己留底。
      </p>
      <div className="settings-actions">
        <button onClick={onCreateLocalBackup} type="button">
          <Save size={15} />
          创建本机备份
        </button>
        <button onClick={onExport} type="button">
          导出 JSON
        </button>
        <label className="file-button">
          导入 JSON
          <input
            accept="application/json"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) onImport(file)
              event.currentTarget.value = ''
            }}
            type="file"
          />
        </label>
        <button className="danger-button" onClick={onReset} type="button">
          重置
        </button>
      </div>
      <div className="backup-list">
        {visibleLocalBackups.length === 0 ? (
          <small>还没有本机备份。做一次读取、导入或重置前，姐姐会自动留底。</small>
        ) : (
          <>
            {visibleLocalBackups.map((backup) => (
              <article className="backup-item" key={backup.id}>
                <div>
                  <strong>{backup.label}</strong>
                  <span>
                    {formatShortTime(backup.createdAt)} / {backup.reason}
                  </span>
                  <small>{formatBackupCounts(backup)}</small>
                </div>
                <div className="backup-actions">
                  <button onClick={() => onRestoreLocalBackup(backup.id)} type="button">
                    恢复
                  </button>
                  <button className="danger-button" onClick={() => onDeleteLocalBackup(backup.id)} type="button">
                    删除
                  </button>
                </div>
              </article>
            ))}
            {hiddenLocalBackupCount > 0 && (
              <small className="backup-more">还有 {hiddenLocalBackupCount} 份旧本机备份已收起。</small>
            )}
          </>
        )}
      </div>
    </div>
  )
}
