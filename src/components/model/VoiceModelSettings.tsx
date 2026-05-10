import { Mic, ShieldCheck, Volume2 } from 'lucide-react'
import type { AppSettings, ModelProfileSummary } from '../../domain/types'

interface VoiceModelSettingsProps {
  modelProfiles: ModelProfileSummary[]
  onUpdateSettings: (settings: AppSettings) => void
  settings: AppSettings
}

export function VoiceModelSettings({ modelProfiles, onUpdateSettings, settings }: VoiceModelSettingsProps) {
  const activeChatProfile = modelProfiles.find((profile) => profile.id === settings.modelProfileId)
  const openAiCompatibleProfiles = modelProfiles.filter((profile) => profile.kind === 'openai-compatible')
  const selectedTtsProfile = openAiCompatibleProfiles.find((profile) => profile.id === settings.voice.ttsProfileId)
  const selectedTtsProfileId = selectedTtsProfile ? settings.voice.ttsProfileId : ''
  const voiceModelLabel =
    settings.voice.provider === 'browser'
      ? '浏览器朗读'
      : selectedTtsProfile?.name ?? activeChatProfile?.name ?? '沿用 LLM 档案'
  const voiceModelDetail =
    settings.voice.provider === 'browser'
      ? '使用当前设备自带声音'
      : selectedTtsProfile
        ? `${selectedTtsProfile.model} / ${selectedTtsProfile.baseUrl}`
        : activeChatProfile
          ? `${activeChatProfile.model} / ${activeChatProfile.baseUrl}`
          : '还没有可用模型档案'

  return (
    <section className="settings-section model-column model-voice-section">
      <div className="settings-section-title">
        <Volume2 size={18} />
        <span>TTS 发语音工具</span>
      </div>

      <article className="voice-model-card tts-card">
        <span className="voice-model-kicker">Agent 工具</span>
        <strong>当前 TTS 模型</strong>
        <small>{voiceModelLabel}</small>
        <p>{voiceModelDetail}</p>
      </article>

      <div className="voice-provider-grid">
        <button
          className={settings.voice.provider === 'openai-compatible' ? 'active' : ''}
          onClick={() => onUpdateSettings({ ...settings, voice: { ...settings.voice, provider: 'openai-compatible' } })}
          type="button"
        >
          <Mic size={16} />
          TTS 工具
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
          <strong>TTS 档案</strong>
          <small>角色决定发语音时调用的模型档案</small>
        </span>
        <select
          disabled={settings.voice.provider === 'browser'}
          onChange={(event) =>
            onUpdateSettings({ ...settings, voice: { ...settings.voice, ttsProfileId: event.target.value } })
          }
          value={selectedTtsProfileId}
        >
          <option value="">沿用当前 LLM 档案</option>
          {openAiCompatibleProfiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name} / {profile.model}
            </option>
          ))}
        </select>
      </label>

      <div className="voice-config-grid">
        <label className="text-control">
          <span>
            <strong>TTS 模型</strong>
            <small>例如 gpt-4o-mini-tts / mimo-v2.5-tts</small>
          </span>
          <input
            disabled={settings.voice.provider === 'browser'}
            onChange={(event) =>
              onUpdateSettings({ ...settings, voice: { ...settings.voice, ttsModel: event.target.value } })
            }
            value={settings.voice.ttsModel}
          />
        </label>
        <label className="text-control">
          <span>
            <strong>默认音色 ID</strong>
            <small>可填供应商的 voice_id</small>
          </span>
          <input
            disabled={settings.voice.provider === 'browser'}
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
            disabled={settings.voice.provider === 'browser'}
            onChange={(event) =>
              onUpdateSettings({ ...settings, voice: { ...settings.voice, defaultVoiceLabel: event.target.value } })
            }
            value={settings.voice.defaultVoiceLabel}
          />
        </label>
        <label className="range-control">
          <span>
            <strong>语速</strong>
            <small>{settings.voice.speechRate.toFixed(2)}x</small>
          </span>
          <input
            disabled={settings.voice.provider === 'browser'}
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
      </div>

      <label className="text-control">
        <span>
          <strong>默认说话风格</strong>
          <small>作为工具提示传给 TTS</small>
        </span>
        <textarea
          disabled={settings.voice.provider === 'browser'}
          onChange={(event) =>
            onUpdateSettings({ ...settings, voice: { ...settings.voice, defaultStylePrompt: event.target.value } })
          }
          value={settings.voice.defaultStylePrompt}
        />
      </label>

      <div className="voice-safety-note">
        <ShieldCheck size={17} />
        <span>音色克隆只接入已授权的供应商音色 ID；现实人物、亲友、角色声线都需要本人或权利方同意。</span>
      </div>
    </section>
  )
}
