import {
  ArchiveRestore,
  Database,
  Keyboard,
  Link2,
  Palette,
  RotateCcw,
  Save,
  Settings2,
  Sparkles,
  Type,
} from 'lucide-react'
import type { AccentTheme, AppSettings, LocalBackupSummary } from '../../domain/types'
import type { CloudBackupSummary, CloudMetadata } from '../../services/cloudSync'
import { RetentionButton, WorkspaceTitle } from '../memory/atoms'
import {
  formatBackupCounts,
  formatBytes,
  formatCloudTime,
  formatShortTime,
  getCloudBusyLabel,
} from '../memory/memoryPanelUtils'

const accentThemes: Array<{ id: Extract<AccentTheme, 'sakura' | 'white'>; label: string; color: string }> = [
  { id: 'sakura', label: '樱花粉', color: '#ffabcc' },
  { id: 'white', label: '月白', color: '#ffffff' },
]

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
  const cloudStorageEnabled = settings.dataStorageMode === 'cloud'
  const visibleCloudBackups = cloudBackups.slice(0, 3)
  const visibleLocalBackups = localBackups.slice(0, 3)
  const hiddenCloudBackupCount = Math.max(0, cloudBackups.length - visibleCloudBackups.length)
  const hiddenLocalBackupCount = Math.max(0, localBackups.length - visibleLocalBackups.length)

  return (
    <>
      <WorkspaceTitle
        description="收纳低频偏好、数据同步、备份迁移和界面颜色。"
        icon={<Settings2 size={20} />}
        title="设置"
      />
      <section className="settings-stack">
        <div className="settings-section">
          <div className="settings-section-title">
            <Keyboard size={18} />
            <span>输入习惯</span>
          </div>
          <label className="toggle-row">
            <span>
              <strong>回车发送</strong>
              <small>{settings.enterToSend ? 'Ctrl + Enter 换行' : 'Enter 换行，Ctrl + Enter 发送'}</small>
            </span>
            <input
              checked={settings.enterToSend}
              onChange={(event) => onUpdateSettings({ ...settings, enterToSend: event.target.checked })}
              type="checkbox"
            />
          </label>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">
            <Type size={18} />
            <span>阅读大小</span>
          </div>
          <label className="range-control">
            <span>
              <strong>字体大小</strong>
              <small>{settings.fontSize}px</small>
            </span>
            <input
              max="18"
              min="13"
              onChange={(event) => onUpdateSettings({ ...settings, fontSize: Number(event.target.value) })}
              step="1"
              type="range"
              value={settings.fontSize}
            />
          </label>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">
            <Palette size={18} />
            <span>主题颜色</span>
          </div>
          <div className="theme-swatches">
            {accentThemes.map((theme) => (
              <button
                aria-label={`切换到${theme.label}`}
                className={`swatch-button ${settings.accentTheme === theme.id ? 'active' : ''}`}
                key={theme.id}
                onClick={() => onUpdateSettings({ ...settings, accentTheme: theme.id })}
                type="button"
              >
                <span className="swatch-dot" style={{ background: theme.color }} />
                <span>{theme.label}</span>
              </button>
            ))}
            <label
              aria-label="自定义主题色"
              className={`swatch-button swatch-button-custom ${settings.accentTheme === 'custom' ? 'active' : ''}`}
              onClick={() => onUpdateSettings({ ...settings, accentTheme: 'custom' })}
            >
              <span className="swatch-dot" style={{ background: settings.customAccentColor || '#ffabcc' }} />
              <span>自定义</span>
              <input
                aria-label="自定义主题主色"
                onChange={(event) =>
                  onUpdateSettings({
                    ...settings,
                    accentTheme: 'custom',
                    customAccentColor: event.target.value,
                  })
                }
                type="color"
                value={settings.customAccentColor || '#ffabcc'}
              />
            </label>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">
            <Sparkles size={18} />
            <span>聊天显示</span>
          </div>
          <label className="toggle-row">
            <span>
              <strong>显示 Agent 调试信息</strong>
              <small>开启后聊天气泡内会显示 Agent 工具和记忆调用详情</small>
            </span>
            <input
              checked={settings.showDevTrace}
              onChange={(event) => onUpdateSettings({ ...settings, showDevTrace: event.target.checked })}
              type="checkbox"
            />
          </label>
        </div>

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
            <button
              disabled={!cloudStorageEnabled || !cloudSyncConfigured || Boolean(cloudBusy)}
              onClick={onConnectCloud}
              type="button"
            >
              <Link2 size={15} />
              检查连接
            </button>
            <button
              disabled={!cloudStorageEnabled || !cloudSyncConfigured || Boolean(cloudBusy)}
              onClick={onRefreshCloud}
              type="button"
            >
              <RotateCcw size={15} />
              检查云端
            </button>
            <button
              disabled={!cloudStorageEnabled || !cloudSyncConfigured || Boolean(cloudBusy)}
              onClick={onPushCloud}
              type="button"
            >
              <Save size={15} />
              保存到云端
            </button>
            <button
              disabled={!cloudStorageEnabled || !cloudSyncConfigured || Boolean(cloudBusy)}
              onClick={onPullCloud}
              type="button"
            >
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
            <button
              disabled={!cloudStorageEnabled || !cloudSyncConfigured || Boolean(cloudBusy)}
              onClick={onCreateCloudBackup}
              type="button"
            >
              <Save size={15} />
              创建云端备份
            </button>
            <button
              disabled={!cloudStorageEnabled || !cloudSyncConfigured || Boolean(cloudBusy)}
              onClick={onRefreshCloudBackups}
              type="button"
            >
              <RotateCcw size={15} />
              刷新云端备份
            </button>
          </div>
        </div>

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

        <div className="settings-section">
          <div className="settings-section-title">
            <Sparkles size={18} />
            <span>记忆系统</span>
          </div>
          <label className="toggle-row">
            <span>
              <strong>自动捕捉记忆</strong>
              <small>只保存有长期价值的偏好、规则和项目线索</small>
            </span>
            <input
              checked={settings.autoMemoryEnabled}
              onChange={(event) => onUpdateSettings({ ...settings, autoMemoryEnabled: event.target.checked })}
              type="checkbox"
            />
          </label>
          <label className="range-control">
            <span>
              <strong>自动记忆门槛</strong>
              <small>{Math.round(settings.memoryConfidenceFloor * 100)}%</small>
            </span>
            <input
              max="0.95"
              min="0.5"
              onChange={(event) =>
                onUpdateSettings({ ...settings, memoryConfidenceFloor: Number(event.target.value) })
              }
              step="0.05"
              type="range"
              value={settings.memoryConfidenceFloor}
            />
          </label>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">
            <ArchiveRestore size={18} />
            <span>回收花园</span>
          </div>
          <div className="retention-options">
            <RetentionButton
              active={settings.trashRetentionMode === 'forever'}
              description="不会自动清理"
              label="永久保存"
              onClick={() => onUpdateSettings({ ...settings, trashRetentionMode: 'forever' })}
            />
            <RetentionButton
              active={settings.trashRetentionMode === 'default'}
              description="30 天后清理"
              label="默认 30 天"
              onClick={() => onUpdateSettings({ ...settings, trashRetentionMode: 'default', trashRetentionDays: 30 })}
            />
            <RetentionButton
              active={settings.trashRetentionMode === 'custom'}
              description="1-365 天"
              label="自定义"
              onClick={() => onUpdateSettings({ ...settings, trashRetentionMode: 'custom' })}
            />
          </div>
          {settings.trashRetentionMode === 'custom' && (
            <label className="number-control">
              <span>
                <strong>保留天数</strong>
                <small>只能设置 1 到 365 天</small>
              </span>
              <input
                max="365"
                min="1"
                onChange={(event) => onUpdateSettings({ ...settings, trashRetentionDays: Number(event.target.value) })}
                type="number"
                value={settings.trashRetentionDays}
              />
            </label>
          )}
        </div>
      </section>
    </>
  )
}
