import { useState } from 'react'
import { Loader2, Mic, Play, ShieldCheck, SlidersHorizontal, Volume2 } from 'lucide-react'
import type { AppSettings, ModelProfileSummary, VoiceBlendLayer } from '../../domain/types'
import { requestSpeechAudio, speakWithBrowserVoice, stopBrowserSpeech } from '../../services/voiceApi'

interface VoiceModelSettingsProps {
  modelProfiles: ModelProfileSummary[]
  onUpdateSettings: (settings: AppSettings) => void
  settings: AppSettings
}

const voiceEmotionOptions = [
  { value: 'natural', label: '自然' },
  { value: 'warm', label: '温柔' },
  { value: 'cheerful', label: '开心' },
  { value: 'shy', label: '害羞' },
  { value: 'soft', label: '软糯' },
  { value: 'fragile', label: '病弱' },
  { value: 'nervous', label: '紧张' },
  { value: 'cool', label: '冷淡' },
  { value: 'sad', label: '低落' },
  { value: 'angry', label: '生气' },
]

const previewText = '今晚的雨声很好听。妹妹靠近一点，姐姐把这句话调成最适合你的声音。'

export function VoiceModelSettings({ modelProfiles, onUpdateSettings, settings }: VoiceModelSettingsProps) {
  const [previewBusy, setPreviewBusy] = useState(false)
  const [previewNotice, setPreviewNotice] = useState('')
  const activeChatProfile = modelProfiles.find((profile) => profile.id === settings.modelProfileId)
  const openAiCompatibleProfiles = modelProfiles.filter((profile) => profile.kind === 'openai-compatible')
  const selectedTtsProfile = openAiCompatibleProfiles.find((profile) => profile.id === settings.voice.ttsProfileId)
  const selectedTtsProfileId = selectedTtsProfile ? settings.voice.ttsProfileId : ''
  const usingBrowserVoice = settings.voice.provider === 'browser'
  const voiceModelLabel =
    usingBrowserVoice
      ? '浏览器朗读'
      : selectedTtsProfile?.name ?? activeChatProfile?.name ?? '沿用 LLM 档案'
  const voiceModelDetail =
    usingBrowserVoice
      ? '使用当前设备自带声音'
      : selectedTtsProfile
        ? `${selectedTtsProfile.model} / ${selectedTtsProfile.baseUrl}`
        : activeChatProfile
          ? `${activeChatProfile.model} / ${activeChatProfile.baseUrl}`
          : '还没有可用模型档案'
  const blendLayers = normalizeBlendLayers(settings.voice.voiceBlendLayers)
  const currentEmotion = voiceEmotionOptions.some((option) => option.value === settings.voice.speechEmotion)
    ? settings.voice.speechEmotion
    : 'natural'

  function updateVoice(patch: Partial<AppSettings['voice']>) {
    onUpdateSettings({ ...settings, voice: { ...settings.voice, ...patch } })
  }

  function updateBlendLayer(index: number, patch: Partial<VoiceBlendLayer>) {
    const nextLayers = blendLayers.map((layer, layerIndex) => layerIndex === index ? { ...layer, ...patch } : layer)
    updateVoice({ voiceBlendLayers: nextLayers })
  }

  async function previewCurrentTuning() {
    setPreviewBusy(true)
    setPreviewNotice('')

    try {
      if (usingBrowserVoice) {
        const started = speakWithBrowserVoice(
          previewText,
          settings.voice.speechRate,
          settings.voice.speechPitch,
          settings.voice.speechVolume,
        )
        setPreviewNotice(started ? '已用浏览器朗读试听。' : '浏览器朗读不可用。')
        return
      }

      const result = await requestSpeechAudio({
        text: previewText,
        characterName: settings.voice.defaultVoiceLabel || '试听角色',
        settings,
      })
      stopBrowserSpeech()
      await new Audio(result.audioUrl).play()
      setPreviewNotice(`试听已生成：${result.voiceId}`)
    } catch (error) {
      setPreviewNotice(error instanceof Error ? error.message : '试听失败，可以稍后再试。')
    } finally {
      setPreviewBusy(false)
    }
  }

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
          onClick={() => updateVoice({ provider: 'openai-compatible' })}
          type="button"
        >
          <Mic size={16} />
          TTS 工具
        </button>
        <button
          className={settings.voice.provider === 'browser' ? 'active' : ''}
          onClick={() => updateVoice({ provider: 'browser' })}
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
          disabled={usingBrowserVoice}
          onChange={(event) => updateVoice({ ttsProfileId: event.target.value })}
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
            disabled={usingBrowserVoice}
            onChange={(event) => updateVoice({ ttsModel: event.target.value })}
            value={settings.voice.ttsModel}
          />
        </label>
        <label className="text-control">
          <span>
            <strong>默认音色 ID</strong>
            <small>可填供应商的 voice_id</small>
          </span>
          <input
            disabled={usingBrowserVoice}
            onChange={(event) => updateVoice({ defaultVoiceId: event.target.value })}
            value={settings.voice.defaultVoiceId}
          />
        </label>
        <label className="text-control">
          <span>
            <strong>默认音色名</strong>
            <small>只用于界面显示</small>
          </span>
          <input
            disabled={usingBrowserVoice}
            onChange={(event) => updateVoice({ defaultVoiceLabel: event.target.value })}
            value={settings.voice.defaultVoiceLabel}
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
            onChange={(event) => updateVoice({ speechRate: Number(event.target.value) })}
            step="0.05"
            type="range"
            value={settings.voice.speechRate}
          />
        </label>
        <label className="range-control">
          <span>
            <strong>音高</strong>
            <small>{settings.voice.speechPitch.toFixed(2)}x</small>
          </span>
          <input
            max="1.25"
            min="0.75"
            onChange={(event) => updateVoice({ speechPitch: Number(event.target.value) })}
            step="0.01"
            type="range"
            value={settings.voice.speechPitch}
          />
        </label>
        <label className="range-control">
          <span>
            <strong>饱满度</strong>
            <small>{settings.voice.speechVolume.toFixed(2)}x</small>
          </span>
          <input
            max="1.5"
            min="0.5"
            onChange={(event) => updateVoice({ speechVolume: Number(event.target.value) })}
            step="0.05"
            type="range"
            value={settings.voice.speechVolume}
          />
        </label>
        <label className="range-control">
          <span>
            <strong>风格强度</strong>
            <small>{formatPercent(settings.voice.speechStyleIntensity)}</small>
          </span>
          <input
            disabled={usingBrowserVoice}
            max="1"
            min="0"
            onChange={(event) => updateVoice({ speechStyleIntensity: Number(event.target.value) })}
            step="0.05"
            type="range"
            value={settings.voice.speechStyleIntensity}
          />
        </label>
        <label className="range-control">
          <span>
            <strong>清亮度</strong>
            <small>{formatPercent(settings.voice.speechBrightness)}</small>
          </span>
          <input
            disabled={usingBrowserVoice}
            max="1"
            min="0"
            onChange={(event) => updateVoice({ speechBrightness: Number(event.target.value) })}
            step="0.01"
            type="range"
            value={settings.voice.speechBrightness}
          />
        </label>
        <label className="range-control">
          <span>
            <strong>气声</strong>
            <small>{formatPercent(settings.voice.speechBreathiness)}</small>
          </span>
          <input
            disabled={usingBrowserVoice}
            max="1"
            min="0"
            onChange={(event) => updateVoice({ speechBreathiness: Number(event.target.value) })}
            step="0.01"
            type="range"
            value={settings.voice.speechBreathiness}
          />
        </label>
        <label className="range-control">
          <span>
            <strong>松紧感</strong>
            <small>{formatPercent(settings.voice.speechTension)}</small>
          </span>
          <input
            disabled={usingBrowserVoice}
            max="1"
            min="0"
            onChange={(event) => updateVoice({ speechTension: Number(event.target.value) })}
            step="0.01"
            type="range"
            value={settings.voice.speechTension}
          />
        </label>
        <label className="range-control">
          <span>
            <strong>温暖度</strong>
            <small>{formatPercent(settings.voice.speechWarmth)}</small>
          </span>
          <input
            disabled={usingBrowserVoice}
            max="1"
            min="0"
            onChange={(event) => updateVoice({ speechWarmth: Number(event.target.value) })}
            step="0.01"
            type="range"
            value={settings.voice.speechWarmth}
          />
        </label>
        <label className="text-control">
          <span>
            <strong>情绪风格</strong>
            <small>配合风格提示影响语气</small>
          </span>
          <select
            disabled={usingBrowserVoice}
            onChange={(event) => updateVoice({ speechEmotion: event.target.value })}
            value={currentEmotion}
          >
            {voiceEmotionOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="text-control">
        <span>
          <strong>默认说话风格</strong>
          <small>作为工具提示传给 TTS</small>
        </span>
        <textarea
          disabled={usingBrowserVoice}
          onChange={(event) => updateVoice({ defaultStylePrompt: event.target.value })}
          value={settings.voice.defaultStylePrompt}
        />
      </label>

      <article className="voice-tuning-card">
        <div className="voice-tuning-header">
          <span>
            <SlidersHorizontal size={17} />
            <strong>声线调色盘</strong>
          </span>
          <button disabled={previewBusy} onClick={() => void previewCurrentTuning()} type="button">
            {previewBusy ? <Loader2 size={15} /> : <Play size={15} />}
            <span>{previewBusy ? '生成中' : '试听'}</span>
          </button>
        </div>
        {previewNotice && <p className="voice-preview-notice" role="status">{previewNotice}</p>}

        <label className="toggle-row voice-tuning-toggle">
          <span>
            <strong>启用声线配方</strong>
            <small>最多三层声线权重；有音色 ID 时优先使用权重最高的一层</small>
          </span>
          <input
            checked={settings.voice.voiceBlendEnabled}
            disabled={usingBrowserVoice}
            onChange={(event) => updateVoice({ voiceBlendEnabled: event.target.checked })}
            type="checkbox"
          />
        </label>

        <div className="voice-blend-list">
          {blendLayers.map((layer, index) => (
            <div className="voice-blend-row" key={index}>
              <div className="voice-blend-fields">
                <label>
                  <span>声线名</span>
                  <input
                    disabled={usingBrowserVoice}
                    onChange={(event) => updateBlendLayer(index, { label: event.target.value })}
                    value={layer.label}
                  />
                </label>
                <label>
                  <span>音色 ID</span>
                  <input
                    disabled={usingBrowserVoice}
                    onChange={(event) => updateBlendLayer(index, { voiceId: event.target.value })}
                    placeholder="可留空，只作风格参考"
                    value={layer.voiceId}
                  />
                </label>
              </div>
              <label className="range-control voice-blend-weight">
                <span>
                  <strong>权重</strong>
                  <small>{formatPercent(layer.weight)}</small>
                </span>
                <input
                  disabled={usingBrowserVoice || !settings.voice.voiceBlendEnabled}
                  max="1"
                  min="0"
                  onChange={(event) => updateBlendLayer(index, { weight: Number(event.target.value) })}
                  step="0.05"
                  type="range"
                  value={layer.weight}
                />
              </label>
            </div>
          ))}
        </div>
      </article>

      <div className="voice-safety-note">
        <ShieldCheck size={17} />
        <span>音色克隆只接入已授权的供应商音色 ID；现实人物、亲友、角色声线都需要本人或权利方同意。</span>
      </div>
    </section>
  )
}

function normalizeBlendLayers(layers: VoiceBlendLayer[] | undefined): VoiceBlendLayer[] {
  const defaults = [
    { label: '温柔姐姐感', voiceId: '', weight: 0.65 },
    { label: '病弱少女感', voiceId: '', weight: 0.25 },
    { label: '冷淡距离感', voiceId: '', weight: 0.1 },
  ]

  return defaults.map((fallback, index) => ({ ...fallback, ...layers?.[index] }))
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}
