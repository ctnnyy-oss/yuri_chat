import { KeyRound, PlugZap, RefreshCcw, Save } from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import type { ModelProfileInput, ModelProviderKind } from '../../domain/types'
import { modelProviderPresets, type ModelCatalogItem } from '../../services/modelProfiles'
import { isServerEnvProfileId } from './modelPanelUtils'

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
  onSaveProfileAsSpare: () => void
  onTestDraft: () => void
  onDraftChange: Dispatch<SetStateAction<ModelProfileInput>>
  selectedPresetId: string
  actionNotice?: string
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
  onSaveProfileAsSpare,
  onTestDraft,
  onDraftChange,
  selectedPresetId,
  actionNotice = '',
}: ModelProfileEditorProps) {
  const hasStoredApiKey = Boolean(draft.id && !isServerEnvProfileId(draft.id))

  function updateDraft(patch: Partial<ModelProfileInput>, options: { resetCatalog?: boolean } = {}) {
    if (options.resetCatalog) onResetCatalog()
    onDraftChange((currentDraft) => ({ ...currentDraft, ...patch }))
  }

  return (
    <section className="settings-section model-column model-profile-editor">
      <div className="settings-section-title">
        <KeyRound size={18} />
        <span>LLM 大语言模型</span>
      </div>

      {actionNotice && <p className="model-action-notice" role="status">{actionNotice}</p>}

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
          placeholder={hasStoredApiKey ? '已保存密钥，留空继续沿用' : '填入供应商或中转站密钥'}
          type="password"
          value={draft.apiKey ?? ''}
        />
        {hasStoredApiKey && <small>这组配置已有云端密钥。这里不会明文显示；要换密钥时再输入新的。</small>}
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
        平台只是帮妹妹填默认地址，不会内置密钥。聊天模型用“保存并启用”；只给语音用的供应商用“仅保存档案”，再到右侧 TTS 语音模型里选择。
      </small>

      <div className="settings-actions">
        <button className="secondary-action" disabled={!canUseDraft} onClick={onSaveProfile} type="button">
          <Save size={15} />
          保存并启用
        </button>
        <button disabled={!canUseDraft} onClick={onSaveProfileAsSpare} type="button">
          <Save size={15} />
          仅保存档案
        </button>
        <button disabled={!canUseDraft} onClick={onTestDraft} type="button">
          <PlugZap size={15} />
          测试草稿
        </button>
      </div>
    </section>
  )
}
