import { Settings2 } from 'lucide-react'
import type { AppSettings, LocalBackupSummary } from '../../domain/types'
import type { CloudBackupSummary, CloudMetadata } from '../../services/cloudSync'
import { WorkspaceTitle } from '../memory/atoms'
import { BackupMigrationSettings } from './BackupMigrationSettings'
import { ChatBehaviorSettings } from './ChatBehaviorSettings'
import { DataSyncSettings } from './DataSyncSettings'
import { MemoryCaptureSettings } from './MemoryCaptureSettings'
import { PreferenceSettings } from './PreferenceSettings'
import { TrashRetentionSettings } from './TrashRetentionSettings'
import { VoiceSettings } from './VoiceSettings'

interface SettingsPanelProps {
  cloudBackups: CloudBackupSummary[]
  cloudBusy: 'checking' | 'pulling' | 'pushing' | 'backing-up' | null
  cloudMeta: CloudMetadata | null
  cloudStatus: string
  cloudSyncConfigured: boolean
  localBackups: LocalBackupSummary[]
  onConnectCloud: () => void
  onCreateCloudBackup: () => void
  onCreateLocalBackup: () => void
  onDeleteLocalBackup: (backupId: string) => void
  onDownloadCloudBackup: (fileName: string) => void
  onExport: () => void
  onImport: (file: File) => void
  onPullCloud: () => void
  onPushCloud: () => void
  onRefreshCloud: () => void
  onRefreshCloudBackups: () => void
  onReset: () => void
  onRestoreLocalBackup: (backupId: string) => void
  onUpdateSettings: (settings: AppSettings) => void
  settings: AppSettings
}

export function SettingsPanel({
  cloudBackups,
  cloudBusy,
  cloudMeta,
  cloudStatus,
  cloudSyncConfigured,
  localBackups,
  onConnectCloud,
  onCreateCloudBackup,
  onCreateLocalBackup,
  onDeleteLocalBackup,
  onDownloadCloudBackup,
  onExport,
  onImport,
  onPullCloud,
  onPushCloud,
  onRefreshCloud,
  onRefreshCloudBackups,
  onReset,
  onRestoreLocalBackup,
  onUpdateSettings,
  settings,
}: SettingsPanelProps) {
  return (
    <>
      <WorkspaceTitle
        description="收纳低频偏好、数据同步、备份迁移和界面颜色。"
        icon={<Settings2 size={20} />}
        title="设置"
      />
      <section className="settings-stack settings-page-stack">
        <PreferenceSettings settings={settings} onUpdateSettings={onUpdateSettings} />

        <div className="settings-balanced-grid">
          <div className="settings-column-stack">
            <ChatBehaviorSettings settings={settings} onUpdateSettings={onUpdateSettings} />
            <VoiceSettings settings={settings} onUpdateSettings={onUpdateSettings} />
            <TrashRetentionSettings settings={settings} onUpdateSettings={onUpdateSettings} />
          </div>
          <div className="settings-column-stack">
            <DataSyncSettings
              cloudBackups={cloudBackups}
              cloudBusy={cloudBusy}
              cloudMeta={cloudMeta}
              cloudStatus={cloudStatus}
              cloudSyncConfigured={cloudSyncConfigured}
              onConnectCloud={onConnectCloud}
              onCreateCloudBackup={onCreateCloudBackup}
              onDownloadCloudBackup={onDownloadCloudBackup}
              onPullCloud={onPullCloud}
              onPushCloud={onPushCloud}
              onRefreshCloud={onRefreshCloud}
              onRefreshCloudBackups={onRefreshCloudBackups}
              onUpdateSettings={onUpdateSettings}
              settings={settings}
            />
            <BackupMigrationSettings
              localBackups={localBackups}
              onCreateLocalBackup={onCreateLocalBackup}
              onDeleteLocalBackup={onDeleteLocalBackup}
              onExport={onExport}
              onImport={onImport}
              onReset={onReset}
              onRestoreLocalBackup={onRestoreLocalBackup}
            />
            <MemoryCaptureSettings settings={settings} onUpdateSettings={onUpdateSettings} />
          </div>
        </div>
      </section>
    </>
  )
}
