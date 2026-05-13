import { useCallback, useEffect, useState } from 'react'
import { Loader2, Mic, Play, ShieldCheck, SlidersHorizontal, Volume2 } from 'lucide-react'
import type { AppSettings, CharacterVoiceProfile, ModelProfileSummary, VoiceBlendLayer } from '../../domain/types'
import { buildVoiceProfileSettingsPatch } from '../../services/modelProfileCapabilities'
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

type VoicePreviewSample = {
  id: string
  name: string
  title: string
  text: string
  stylePrompt: string
  tuning: Partial<AppSettings['voice']>
}

const coreVoicePreviewSamples: VoicePreviewSample[] = [
  {
    id: 'ningan-princess',
    name: '沈朝歌',
    title: '傲娇大小姐',
    text: '顾晚吟，披风拿来。本小姐不是冷，是不想让你站在风口里。',
    stylePrompt: '骄矜、别扭、清亮，嘴硬但藏着在意，不要播音腔。',
    tuning: {
      speechRate: 1.05,
      speechPitch: 1.05,
      speechVolume: 1.04,
      speechBrightness: 0.72,
      speechBreathiness: 0.08,
      speechTension: 0.68,
      speechWarmth: 0.45,
      speechStyleIntensity: 0.85,
      speechEmotion: 'cool',
    },
  },
  {
    id: 'aling-maid',
    name: '顾晚吟',
    title: '自卑忠犬',
    text: '小姐吩咐的事，我都记着。若能护着她，我站远些也没关系。',
    stylePrompt: '克制、低声、真诚，小心翼翼但坚定，语尾收住。',
    tuning: {
      speechRate: 0.9,
      speechPitch: 0.92,
      speechVolume: 0.9,
      speechBrightness: 0.36,
      speechBreathiness: 0.25,
      speechTension: 0.28,
      speechWarmth: 0.78,
      speechStyleIntensity: 0.82,
      speechEmotion: 'warm',
    },
  },
  {
    id: 'shen-wanci',
    name: '闻霜寒',
    title: '冰山美人',
    text: '茶还温着。你若只是想坐一会儿，就坐吧，我不赶你。',
    stylePrompt: '冷淡、清晰、克制，句子短，留一点距离感。',
    tuning: {
      speechRate: 0.88,
      speechPitch: 0.96,
      speechVolume: 0.92,
      speechBrightness: 0.58,
      speechBreathiness: 0.1,
      speechTension: 0.42,
      speechWarmth: 0.28,
      speechStyleIntensity: 0.86,
      speechEmotion: 'cool',
    },
  },
  {
    id: 'lu-wanzhao',
    name: '听露泣',
    title: '绿茶攻',
    text: '霜寒姐姐不看我也没关系呀，我就坐近一点，等你先开口。',
    stylePrompt: '柔软、会撒娇、轻声靠近，甜但不腻，像真实聊天。',
    tuning: {
      speechRate: 0.98,
      speechPitch: 1.08,
      speechVolume: 0.98,
      speechBrightness: 0.68,
      speechBreathiness: 0.45,
      speechTension: 0.2,
      speechWarmth: 0.86,
      speechStyleIntensity: 0.9,
      speechEmotion: 'shy',
    },
  },
  {
    id: 'xie-zhao',
    name: '故渊',
    title: '不良少女',
    text: '别跟着我，池鱼。……算了，路黑，你要跟就跟紧点。',
    stylePrompt: '低一点、叛逆、嘴硬，别扭地关心，不要太甜。',
    tuning: {
      speechRate: 1.02,
      speechPitch: 0.88,
      speechVolume: 1.02,
      speechBrightness: 0.45,
      speechBreathiness: 0.18,
      speechTension: 0.76,
      speechWarmth: 0.32,
      speechStyleIntensity: 0.84,
      speechEmotion: 'cool',
    },
  },
  {
    id: 'su-wanyin',
    name: '池鱼',
    title: '乖乖女',
    text: '我知道你嘴硬。可我还是想过去，哪怕只陪你走一小段。',
    stylePrompt: '温顺、主动、安静有韧性，语气温暖但不软弱。',
    tuning: {
      speechRate: 0.92,
      speechPitch: 1.02,
      speechVolume: 0.96,
      speechBrightness: 0.5,
      speechBreathiness: 0.22,
      speechTension: 0.24,
      speechWarmth: 0.92,
      speechStyleIntensity: 0.82,
      speechEmotion: 'warm',
    },
  },
]

const defaultCustomPreviewText = '今晚想听哪一句，妹妹可以直接写在这里。'

export function VoiceModelSettings({ modelProfiles, onUpdateSettings, settings }: VoiceModelSettingsProps) {
  const [previewBusyId, setPreviewBusyId] = useState('')
  const [previewNotice, setPreviewNotice] = useState('')
  const [customPreviewText, setCustomPreviewText] = useState(defaultCustomPreviewText)
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

  const updateVoice = useCallback((patch: Partial<AppSettings['voice']>) => {
    onUpdateSettings({ ...settings, voice: { ...settings.voice, ...patch } })
  }, [onUpdateSettings, settings])

  useEffect(() => {
    if (usingBrowserVoice || !selectedTtsProfile) return

    const patch = buildVoiceProfileSettingsPatch(selectedTtsProfile, settings.voice)
    if (Object.keys(patch).length > 0) updateVoice(patch)
  }, [selectedTtsProfile, settings.voice, updateVoice, usingBrowserVoice])

  function handleTtsProfileChange(profileId: string) {
    const profile = openAiCompatibleProfiles.find((candidate) => candidate.id === profileId)
    updateVoice({
      ttsProfileId: profileId,
      ...(profile ? buildVoiceProfileSettingsPatch(profile, settings.voice) : {}),
    })
  }

  function updateBlendLayer(index: number, patch: Partial<VoiceBlendLayer>) {
    const nextLayers = blendLayers.map((layer, layerIndex) => layerIndex === index ? { ...layer, ...patch } : layer)
    updateVoice({ voiceBlendLayers: nextLayers })
  }

  async function previewCurrentTuning(sample: VoicePreviewSample) {
    setPreviewBusyId(sample.id)
    setPreviewNotice('')
    const previewSettings = mergePreviewSettings(settings, sample)
    const previewVoiceProfile = buildPreviewVoiceProfile(sample)

    try {
      if (usingBrowserVoice) {
        const started = speakWithBrowserVoice(
          sample.text,
          previewSettings.voice.speechRate,
          previewSettings.voice.speechPitch,
          previewSettings.voice.speechVolume,
        )
        setPreviewNotice(started ? `已试听：${sample.name}` : '浏览器朗读不可用。')
        return
      }

      const result = await requestSpeechAudio({
        text: sample.text,
        characterName: sample.name,
        characterVoice: previewVoiceProfile,
        settings: previewSettings,
      })
      stopBrowserSpeech()
      await new Audio(result.audioUrl).play()
      setPreviewNotice(`已试听：${sample.name} / ${result.voiceId}`)
    } catch (error) {
      setPreviewNotice(error instanceof Error ? error.message : '试听失败，可以稍后再试。')
    } finally {
      setPreviewBusyId('')
    }
  }

  function previewCustomTuning() {
    const text = customPreviewText.trim()
    if (!text) {
      setPreviewNotice('先写一句自定义试听文本。')
      return
    }

    void previewCurrentTuning({
      id: 'custom',
      name: '自定义试听',
      title: '自由句子',
      text,
      stylePrompt: settings.voice.defaultStylePrompt,
      tuning: {},
    })
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
          onChange={(event) => handleTtsProfileChange(event.target.value)}
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
            <small>例如 gpt-4o-mini-tts / mimo-v2.5-tts / volcano_tts</small>
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
            <small>六角色 + 自定义试听</small>
          </span>
        </div>
        {previewNotice && <p className="voice-preview-notice" role="status">{previewNotice}</p>}

        <div className="voice-preview-grid" aria-label="六角色试听">
          {coreVoicePreviewSamples.map((sample) => {
            const loading = previewBusyId === sample.id
            return (
              <button
                disabled={Boolean(previewBusyId)}
                key={sample.id}
                onClick={() => void previewCurrentTuning(sample)}
                type="button"
              >
                {loading ? <Loader2 size={15} /> : <Play size={15} />}
                <span>
                  <strong>{sample.name}</strong>
                  <small>{sample.title}</small>
                </span>
              </button>
            )
          })}
        </div>

        <div className="voice-custom-preview">
          <label>
            <span>自定义试听</span>
            <input
              onChange={(event) => setCustomPreviewText(event.target.value)}
              placeholder="输入任意一句话试听当前调音"
              value={customPreviewText}
            />
          </label>
          <button disabled={Boolean(previewBusyId)} onClick={previewCustomTuning} type="button">
            {previewBusyId === 'custom' ? <Loader2 size={15} /> : <Play size={15} />}
            <span>{previewBusyId === 'custom' ? '生成中' : '试听自定义'}</span>
          </button>
        </div>

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

function mergePreviewSettings(settings: AppSettings, sample: VoicePreviewSample): AppSettings {
  return {
    ...settings,
    voice: {
      ...settings.voice,
      ...sample.tuning,
      defaultStylePrompt: sample.stylePrompt || settings.voice.defaultStylePrompt,
    },
  }
}

function buildPreviewVoiceProfile(sample: VoicePreviewSample): CharacterVoiceProfile {
  return {
    displayName: sample.name,
    providerVoiceId: '',
    stylePrompt: '',
    source: 'built-in',
    consentConfirmed: true,
    updatedAt: new Date().toISOString(),
  }
}
