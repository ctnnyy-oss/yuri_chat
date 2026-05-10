import {
  ArchiveRestore,
  Database,
  Keyboard,
  Link2,
  Mic,
  Palette,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
  Type,
  Volume2,
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
  const selectedAccentTheme =
    settings.accentTheme === 'white' || settings.accentTheme === 'custom' ? settings.accentTheme : 'sakura'

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
                className={`swatch-button ${selectedAccentTheme === theme.id ? 'active' : ''}`}
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
              className={`swatch-button swatch-button-custom ${selectedAccentTheme === 'custom' ? 'active' : ''}`}
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
          <label className="toggle-row">
            <span>
              <strong>拟真私聊响应</strong><small>私聊里角色会判断是否自然回复；短句可能已读不回，明确求助仍会接住</small>
            </span>
            <input checked={settings.directChatHumanMode} onChange={(event) => onUpdateSettings({ ...settings, directChatHumanMode: event.target.checked })} type="checkbox" />
          </label>
          <label className="toggle-row">
            <span>
              <strong>角色主动私聊</strong><small>私聊空闲时，角色可能主动发来一条消息，最多连续一轮</small>
            </span>
            <input checked={settings.directChatProactiveMode} onChange={(event) => onUpdateSettings({ ...settings, directChatProactiveMode: event.target.checked })} type="checkbox" />
          </label>
          <label className="toggle-row">
            <span>
              <strong>拟真群聊响应</strong><small>群成员会各自判断是否接话；成员越多，模型消耗越高</small>
            </span>
            <input checked={settings.groupChatHumanMode} onChange={(event) => onUpdateSettings({ ...settings, groupChatHumanMode: event.target.checked })} type="checkbox" />
          </label>
          <label className="toggle-row">
            <span>
              <strong>群成员主动发言</strong><small>群聊空闲时，成员会随机起话题或互相接话，最多连续两轮</small>
            </span>
            <input checked={settings.groupChatProactiveMode} onChange={(event) => onUpdateSettings({ ...settings, groupChatProactiveMode: event.target.checked })} type="checkbox" />
          </label>
          <label className="range-control">
            <span>
              <strong>每轮最多接话人数</strong>
              <small>{settings.groupChatMaxAutoReplies} 位</small>
            </span>
            <input
              max="4"
              min="1"
              onChange={(event) =>
                onUpdateSettings({ ...settings, groupChatMaxAutoReplies: Number(event.target.value) })
              }
              step="1"
              type="range"
              value={settings.groupChatMaxAutoReplies}
            />
          </label>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">
            <Volume2 size={18} />
            <span>语音功能</span>
          </div>
          <label className="toggle-row">
            <span>
              <strong>语音输入</strong>
              <small>聊天里可以录音发送，也会尽量转成文字给角色理解</small>
            </span>
            <input
              checked={settings.voice.inputEnabled}
              onChange={(event) =>
                onUpdateSettings({ ...settings, voice: { ...settings.voice, inputEnabled: event.target.checked } })
              }
              type="checkbox"
            />
          </label>
          <label className="toggle-row">
            <span>
              <strong>角色语音播放</strong>
              <small>角色文字回复旁会出现朗读按钮；供应商不支持 TTS 时可自动退回浏览器朗读</small>
            </span>
            <input
              checked={settings.voice.assistantPlaybackEnabled}
              onChange={(event) =>
                onUpdateSettings({
                  ...settings,
                  voice: { ...settings.voice, assistantPlaybackEnabled: event.target.checked },
                })
              }
              type="checkbox"
            />
          </label>
          <label className="toggle-row">
            <span>
              <strong>回复后自动播放</strong>
              <small>打开后角色回复会直接出声；语音通话中会自动播放最新回复</small>
            </span>
            <input
              checked={settings.voice.autoPlayAssistantVoice}
              onChange={(event) =>
                onUpdateSettings({
                  ...settings,
                  voice: { ...settings.voice, autoPlayAssistantVoice: event.target.checked },
                })
              }
              type="checkbox"
            />
          </label>
          <label className="toggle-row">
            <span>
              <strong>语音通话入口</strong>
              <small>聊天顶栏显示电话按钮；当前是回合式通话，后续可升级 Realtime</small>
            </span>
            <input
              checked={settings.voice.callModeEnabled}
              onChange={(event) =>
                onUpdateSettings({ ...settings, voice: { ...settings.voice, callModeEnabled: event.target.checked } })
              }
              type="checkbox"
            />
          </label>
          <div className="voice-provider-grid">
            <button
              className={settings.voice.provider === 'openai-compatible' ? 'active' : ''}
              onClick={() => onUpdateSettings({ ...settings, voice: { ...settings.voice, provider: 'openai-compatible' } })}
              type="button"
            >
              <Mic size={16} />
              TTS 模型
            </button>
            <button
              className={settings.voice.provider === 'browser' ? 'active' : ''}
              onClick={() => onUpdateSettings({ ...settings, voice: { ...settings.voice, provider: 'browser' } })}
              type="button"
            >
              <Volume2 size={16} />
              浏览器朗读
            </button>
          </div>
          <label className="text-control">
            <span>
              <strong>TTS 模型</strong>
              <small>OpenAI 兼容接口常见值：gpt-4o-mini-tts；中转站需支持 /audio/speech</small>
            </span>
            <input
              onChange={(event) =>
                onUpdateSettings({ ...settings, voice: { ...settings.voice, ttsModel: event.target.value } })
              }
              value={settings.voice.ttsModel}
            />
          </label>
          <label className="text-control">
            <span>
              <strong>默认音色 ID</strong>
              <small>没有为角色单独配置音色时使用；也可填供应商里的自定义 voice_id</small>
            </span>
            <input
              onChange={(event) =>
                onUpdateSettings({ ...settings, voice: { ...settings.voice, defaultVoiceId: event.target.value } })
              }
              value={settings.voice.defaultVoiceId}
            />
          </label>
          <label className="text-control">
            <span>
              <strong>默认音色名</strong>
              <small>只用于界面显示</small>
            </span>
            <input
              onChange={(event) =>
                onUpdateSettings({ ...settings, voice: { ...settings.voice, defaultVoiceLabel: event.target.value } })
              }
              value={settings.voice.defaultVoiceLabel}
            />
          </label>
          <label className="text-control">
            <span>
              <strong>默认说话风格</strong>
              <small>传给 TTS 的语气提示</small>
            </span>
            <textarea
              onChange={(event) =>
                onUpdateSettings({ ...settings, voice: { ...settings.voice, defaultStylePrompt: event.target.value } })
              }
              value={settings.voice.defaultStylePrompt}
            />
          </label>
          <label className="range-control">
            <span>
              <strong>语速</strong>
              <small>{settings.voice.speechRate.toFixed(2)}x</small>
            </span>
            <input
              max="1.35"
              min="0.65"
              onChange={(event) =>
                onUpdateSettings({ ...settings, voice: { ...settings.voice, speechRate: Number(event.target.value) } })
              }
              step="0.05"
              type="range"
              value={settings.voice.speechRate}
            />
          </label>
          <label className="toggle-row">
            <span>
              <strong>失败时浏览器朗读</strong>
              <small>如果中转站暂不支持 TTS，仍然能听到角色声音，只是音色不克隆</small>
            </span>
            <input
              checked={settings.voice.browserFallbackEnabled}
              onChange={(event) =>
                onUpdateSettings({
                  ...settings,
                  voice: { ...settings.voice, browserFallbackEnabled: event.target.checked },
                })
              }
              type="checkbox"
            />
          </label>
          <div className="voice-safety-note">
            <ShieldCheck size={17} />
            <span>音色克隆只接入已授权的供应商音色 ID；现实人物、亲友、角色声线都需要本人或权利方同意。</span>
          </div>
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
