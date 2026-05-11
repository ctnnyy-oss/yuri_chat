import { Sparkles } from 'lucide-react'
import type { AppSettings } from '../../domain/types'

interface MemoryCaptureSettingsProps {
  onUpdateSettings: (settings: AppSettings) => void
  settings: AppSettings
}

export function MemoryCaptureSettings({ onUpdateSettings, settings }: MemoryCaptureSettingsProps) {
  return (
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
          onChange={(event) => onUpdateSettings({ ...settings, memoryConfidenceFloor: Number(event.target.value) })}
          step="0.05"
          type="range"
          value={settings.memoryConfidenceFloor}
        />
      </label>
    </div>
  )
}
