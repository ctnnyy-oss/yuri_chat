import { Volume2 } from 'lucide-react'
import type { AppSettings } from '../../domain/types'

interface VoiceSettingsProps {
  onUpdateSettings: (settings: AppSettings) => void
  settings: AppSettings
}

export function VoiceSettings({ onUpdateSettings, settings }: VoiceSettingsProps) {
  return (
    <div className="settings-section voice-settings-section">
      <div className="settings-section-title">
        <Volume2 size={18} />
        <span>语音功能</span>
      </div>

      <div className="voice-toggle-grid">
        <label className="toggle-row">
          <span>
            <strong>语音输入</strong>
            <small>录音消息会尽量转写给角色理解</small>
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
            <small>角色文字回复旁显示朗读按钮</small>
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
            <small>语音通话中会自动播放最新回复</small>
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
            <small>聊天顶栏显示电话按钮</small>
          </span>
          <input
            checked={settings.voice.callModeEnabled}
            onChange={(event) =>
              onUpdateSettings({ ...settings, voice: { ...settings.voice, callModeEnabled: event.target.checked } })
            }
            type="checkbox"
          />
        </label>
        <label className="toggle-row">
          <span>
            <strong>失败时浏览器朗读</strong>
            <small>TTS 不通时仍能听到声音</small>
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
      </div>
    </div>
  )
}
