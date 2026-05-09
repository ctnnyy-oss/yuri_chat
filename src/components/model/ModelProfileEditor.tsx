import { KeyRound, PlugZap, RefreshCcw, Save } from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import type { ModelProfileInput, ModelProviderKind } from '../../domain/types'
import { modelProviderPresets, type ModelCatalogItem } from '../../services/modelProfiles'

interface ModelProfileEditorProps {
  canFetchCatalog: boolean
  canUseDraft: boolean
  catalogStatus: string
  draft: ModelProfileInput
  modelOptions: ModelCatalogItem[]
  modelStatusText: string
  onFetchDraftCatalog: () => void
  onPresetChange: (presetId: string) => void
  onResetCatalog: () => void
  onSaveProfile: () => void
  onTestDraft: () => void
  onDraftChange: Dispatch<SetStateAction<ModelProfileInput>>
  selectedPresetId: string
}

export function ModelProfileEditor({
  canFetchCatalog,
  canUseDraft,
  catalogStatus,
  draft,
  modelOptions,
  modelStatusText,
  onFetchDraftCatalog,
  onPresetChange,
  onResetCatalog,
  onSaveProfile,
  onTestDraft,
  onDraftChange,
  selectedPresetId,
}: ModelProfileEditorProps) {
  function updateDraft(patch: Partial<ModelProfileInput>, options: { resetCatalog?: boolean } = {}) {
    if (options.resetCatalog) onResetCatalog()
    onDraftChange((currentDraft) => ({ ...currentDraft, ...patch }))
  }

  return (
    <section className="settings-section model-column">
      <div className="settings-section-title">
        <KeyRound size={18} />
        <span>接入或更换模型</span>
      </div>

      <label>
        <span>平台</span>
        <select value={selectedPresetId} onChange={(event) => onPresetChange(event.target.value)}>
          {modelProviderPresets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
        <small>{modelProviderPresets.find((preset) => preset.id === selectedPresetId)?.description}</small>
      </label>

      <label>
        <span>Base URL</span>
        <input
          autoComplete="off"
          placeholder="https://example.com/v1"
          value={draft.baseUrl}
          onChange={(event) => updateDraft({ baseUrl: event.target.value }, { resetCatalog: true })}
        />
      </label>

      <label>
        <span>API Key</span>
        <input
          autoComplete="off"
          onChange={(event) => updateDraft({ apiKey: event.target.value }, { resetCatalog: true })}
          placeholder={draft.id ? '留空则继续使用已保存密钥' : '填入供应商或中转站密钥'}
          type="password"
          value={draft.apiKey ?? ''}
        />
      </label>

      <label>
        <span>接口格式</span>
        <select
          value={draft.kind}
          onChange={(event) => updateDraft({ kind: event.target.value as ModelProviderKind }, { resetCatalog: true })}
        >
          <option value="openai-compatible">OpenAI 兼容</option>
          <option value="anthropic">Anthropic</option>
          <option value="google-gemini">Gemini</option>
        </select>
      </label>

      <div className="model-picker-row">
        <label>
          <span>模型</span>
          {modelOptions.length > 0 ? (
            <select value={draft.model} onChange={(event) => updateDraft({ model: event.target.value })}>
              {modelOptions.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label && model.label !== model.id ? `${model.label} / ${model.id}` : model.id}
                </option>
              ))}
            </select>
          ) : (
            <input
              autoComplete="off"
              onChange={(event) => updateDraft({ model: event.target.value })}
              placeholder="选择或手填模型 ID"
              value={draft.model || ''}
            />
          )}
        </label>
        <button disabled={!canFetchCatalog} onClick={onFetchDraftCatalog} type="button">
          <RefreshCcw size={15} />
          刷新列表
        </button>
      </div>

      <small className="cloud-status-line">{catalogStatus || modelStatusText}</small>
      <small className="model-warning">
        平台只是帮妹妹填默认地址，不会内置密钥；新配置必须有 Base URL 和 API Key，保存后下次直接选择。
      </small>

      <div className="settings-actions">
        <button className="secondary-action" disabled={!canUseDraft} onClick={onSaveProfile} type="button">
          <Save size={15} />
          保存并启用
        </button>
        <button disabled={!canUseDraft} onClick={onTestDraft} type="button">
          <PlugZap size={15} />
          测试草稿
        </button>
      </div>
    </section>
  )
}
