import { ArchiveRestore } from 'lucide-react'
import type { AppSettings } from '../../domain/types'
import { RetentionButton } from '../memory/atoms'

interface TrashRetentionSettingsProps {
  onUpdateSettings: (settings: AppSettings) => void
  settings: AppSettings
}

export function TrashRetentionSettings({ onUpdateSettings, settings }: TrashRetentionSettingsProps) {
  return (
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
  )
}
