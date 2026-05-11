import { Database, Link2, RotateCcw, Save } from 'lucide-react'
import type { AppSettings } from '../../domain/types'
import type { CloudBackupSummary, CloudMetadata } from '../../services/cloudSync'
import { RetentionButton } from '../memory/atoms'
import { formatBytes, formatCloudTime, formatShortTime, getCloudBusyLabel } from '../memory/memoryPanelUtils'

interface DataSyncSettingsProps {
  cloudBackups: CloudBackupSummary[]
  cloudBusy: 'checking' | 'pulling' | 'pushing' | 'backing-up' | null
  cloudMeta: CloudMetadata | null
  cloudStatus: string
  cloudSyncConfigured: boolean
  onConnectCloud: () => void
  onCreateCloudBackup: () => void
  onDownloadCloudBackup: (fileName: string) => void
  onPullCloud: () => void
  onPushCloud: () => void
  onRefreshCloud: () => void
  onRefreshCloudBackups: () => void
  onUpdateSettings: (settings: AppSettings) => void
  settings: AppSettings
}

export function DataSyncSettings({
  cloudBackups,
  cloudBusy,
  cloudMeta,
  cloudStatus,
  cloudSyncConfigured,
  onConnectCloud,
  onCreateCloudBackup,
  onDownloadCloudBackup,
  onPullCloud,
  onPushCloud,
  onRefreshCloud,
  onRefreshCloudBackups,
  onUpdateSettings,
  settings,
}: DataSyncSettingsProps) {
  const cloudStorageEnabled = settings.dataStorageMode === 'cloud'
  const visibleCloudBackups = cloudBackups.slice(0, 3)
  const hiddenCloudBackupCount = Math.max(0, cloudBackups.length - visibleCloudBackups.length)
  const cloudActionDisabled = !cloudStorageEnabled || !cloudSyncConfigured || Boolean(cloudBusy)

  return (
    <div className="settings-section">
      <div className="settings-section-title">
        <Database size={18} />
        <span>数据与同步</span>
      </div>
      <div className="retention-options">
        <RetentionButton
          active={settings.dataStorageMode === 'cloud'}
          description="聊天、记忆和设置自动同步到云端"
          label="云端同步"
          onClick={() => onUpdateSettings({ ...settings, dataStorageMode: 'cloud' })}
        />
        <RetentionButton
          active={settings.dataStorageMode === 'local'}
          description="只存在这台设备的浏览器里"
          label="仅本地"
          onClick={() => onUpdateSettings({ ...settings, dataStorageMode: 'local' })}
        />
      </div>
      <div className="cloud-meta-strip" aria-label="云端同步状态">
        <span>
          <strong>模式</strong>
          {cloudStorageEnabled ? '云端同步' : '仅本地'}
        </span>
        <span>
          <strong>版本</strong>
          {cloudStorageEnabled && cloudMeta ? `v${cloudMeta.revision}` : '未同步'}
        </span>
        <span>
          <strong>最后保存</strong>
          {cloudStorageEnabled && cloudMeta ? formatCloudTime(cloudMeta.updatedAt) : '暂无记录'}
        </span>
      </div>
      <small className="cloud-status-line">
        {cloudStorageEnabled
          ? cloudBusy
            ? getCloudBusyLabel(cloudBusy)
            : cloudStatus
          : '仅本地模式不会自动上传云端；需要迁移时可以用下面的导出。'}
      </small>
      <div className="settings-actions">
        <button disabled={cloudActionDisabled} onClick={onConnectCloud} type="button">
          <Link2 size={15} />
          检查连接
        </button>
        <button disabled={cloudActionDisabled} onClick={onRefreshCloud} type="button">
          <RotateCcw size={15} />
          检查云端
        </button>
        <button disabled={cloudActionDisabled} onClick={onPushCloud} type="button">
          <Save size={15} />
          保存到云端
        </button>
        <button disabled={cloudActionDisabled} onClick={onPullCloud} type="button">
          <RotateCcw size={15} />
          从云端读取
        </button>
      </div>
      {cloudStorageEnabled && (
        <div className="backup-list">
          {visibleCloudBackups.length === 0 ? (
            <small>还没有读取到云端备份。保存云端或手动创建后，这里会出现下载入口。</small>
          ) : (
            <>
              {visibleCloudBackups.map((backup) => (
                <article className="backup-item" key={backup.fileName}>
                  <div>
                    <strong>{backup.label}</strong>
                    <span>
                      {formatShortTime(backup.createdAt)} / {formatBytes(backup.sizeBytes)}
                    </span>
                    <small>{backup.fileName}</small>
                  </div>
                  <div className="backup-actions">
                    <button onClick={() => onDownloadCloudBackup(backup.fileName)} type="button">
                      下载
                    </button>
                  </div>
                </article>
              ))}
              {hiddenCloudBackupCount > 0 && (
                <small className="backup-more">还有 {hiddenCloudBackupCount} 份旧云端备份已收起。</small>
              )}
            </>
          )}
        </div>
      )}
      <div className="settings-actions">
        <button disabled={cloudActionDisabled} onClick={onCreateCloudBackup} type="button">
          <Save size={15} />
          创建云端备份
        </button>
        <button disabled={cloudActionDisabled} onClick={onRefreshCloudBackups} type="button">
          <RotateCcw size={15} />
          刷新云端备份
        </button>
      </div>
    </div>
  )
}
