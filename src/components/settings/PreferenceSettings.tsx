import { Keyboard, Palette, Type } from 'lucide-react'
import type { AccentTheme, AppSettings } from '../../domain/types'

const accentThemes: Array<{ id: Extract<AccentTheme, 'sakura' | 'white'>; label: string; color: string }> = [
  { id: 'sakura', label: '樱花粉', color: '#ffabcc' },
  { id: 'white', label: '月白', color: '#ffffff' },
]

interface PreferenceSettingsProps {
  settings: AppSettings
  onUpdateSettings: (settings: AppSettings) => void
}

export function PreferenceSettings({ settings, onUpdateSettings }: PreferenceSettingsProps) {
  const selectedAccentTheme =
    settings.accentTheme === 'white' || settings.accentTheme === 'custom' ? settings.accentTheme : 'sakura'

  return (
    <div className="settings-top-grid">
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
    </div>
  )
}
