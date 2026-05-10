import { useEffect, useMemo, useRef, useState } from 'react'
import type { ModelProfileInput, ModelProfileSummary } from '../../domain/types'
import { modelProviderPresets, type ModelCatalogItem, type ModelCatalogResult } from '../../services/modelProfiles'
import {
  buildProfileName,
  createDraftFromPreset,
  findPresetForProfile,
  isServerEnvProfileId,
} from './modelPanelUtils'

interface UseModelProfileDraftDeps {
  modelProfileBusy: boolean
  onSaveModelProfile: (profile: ModelProfileInput) => Promise<void>
  onFetchModelCatalog: (input: { profileId?: string; profile?: ModelProfileInput }) => Promise<ModelCatalogResult>
  onTestModelProfile: (input: { profileId?: string; profile?: ModelProfileInput }) => Promise<void>
}

export function useModelProfileDraft({
  modelProfileBusy,
  onSaveModelProfile,
  onFetchModelCatalog,
  onTestModelProfile,
}: UseModelProfileDraftDeps) {
  const defaultPreset = modelProviderPresets.find((preset) => preset.id === 'custom') ?? modelProviderPresets[0]
  const [selectedPresetId, setSelectedPresetId] = useState(defaultPreset.id)
  const [draft, setDraft] = useState<ModelProfileInput>(() => createDraftFromPreset(defaultPreset))
  const [catalogModels, setCatalogModels] = useState<ModelCatalogItem[]>([])
  const [catalogStatus, setCatalogStatus] = useState('')
  const autoFetchKeyRef = useRef('')

  const modelOptions = useMemo(() => {
    const options = catalogModels.filter((model) => model.id.trim())
    if (draft.model && !options.some((model) => model.id === draft.model)) {
      return [{ id: draft.model, label: draft.model }, ...options]
    }
    return options
  }, [catalogModels, draft.model])

  const hasFreshApiKey = Boolean((draft.apiKey ?? '').trim())
  const hasSavedApiKey = Boolean(draft.id && !isServerEnvProfileId(draft.id))
  const hasUsableApiKey = hasFreshApiKey || hasSavedApiKey
  const canFetchCatalog = !modelProfileBusy && Boolean(draft.baseUrl.trim()) && hasUsableApiKey
  const canUseDraft =
    !modelProfileBusy &&
    Boolean(draft.baseUrl.trim()) &&
    Boolean(draft.model.trim()) &&
    hasUsableApiKey

  useEffect(() => {
    const baseUrl = draft.baseUrl.trim()
    const apiKey = (draft.apiKey ?? '').trim()
    if (modelProfileBusy || !baseUrl || (!apiKey && !hasSavedApiKey)) return

    const fetchKey = `${draft.kind}|${baseUrl}|${apiKey ? apiKey.slice(0, 12) : `saved:${draft.id}`}`
    if (autoFetchKeyRef.current === fetchKey) return

    const timer = window.setTimeout(async () => {
      autoFetchKeyRef.current = fetchKey
      setCatalogStatus('正在自动拉取模型...')

      try {
        const result = await onFetchModelCatalog(
          apiKey ? { profile: { ...draft, baseUrl, name: buildProfileName(draft) } } : { profileId: draft.id },
        )
        setCatalogModels(result.models)
        setCatalogStatus(`已自动拉取 ${result.models.length} 个模型`)

        if (result.models[0]?.id) {
          setDraft((currentDraft) => {
            const currentStillExists = result.models.some((model) => model.id === currentDraft.model)
            return currentDraft.model && currentStillExists ? currentDraft : { ...currentDraft, model: result.models[0].id }
          })
        }
      } catch (error) {
        setCatalogStatus(error instanceof Error ? error.message : '自动拉取模型失败，修改 URL 或 API Key 后会重试。')
      }
    }, 900)

    return () => window.clearTimeout(timer)
  }, [draft, hasSavedApiKey, modelProfileBusy, onFetchModelCatalog])

  function resetCatalog() {
    setCatalogModels([])
    setCatalogStatus('')
  }

  function loadProfileIntoDraft(profile: ModelProfileSummary) {
    const preset = findPresetForProfile(profile)
    setSelectedPresetId(preset.id)
    setDraft({
      id: profile.id,
      name: profile.name,
      kind: profile.kind,
      baseUrl: profile.baseUrl,
      model: profile.model,
      apiKey: '',
      enabled: profile.enabled,
      isDefault: profile.isDefault,
    })
    resetCatalog()
  }

  function handlePresetChange(presetId: string) {
    setSelectedPresetId(presetId)
    const preset = modelProviderPresets.find((item) => item.id === presetId) ?? defaultPreset
    setDraft(createDraftFromPreset(preset))
    resetCatalog()
  }

  async function handleSaveProfile() {
    await onSaveModelProfile({ ...draft, name: buildProfileName(draft), isDefault: true, enabled: true })
  }

  async function handleSaveProfileAsSpare() {
    await onSaveModelProfile({ ...draft, name: buildProfileName(draft), isDefault: false, enabled: true })
  }

  async function handleTestDraft() {
    await onTestModelProfile({ profile: { ...draft, name: buildProfileName(draft) } })
  }

  async function handleFetchDraftCatalog() {
    const baseUrl = draft.baseUrl.trim()
    if (!baseUrl) return

    setCatalogStatus('正在拉取模型列表...')
    try {
      const result = await fetchDraftCatalog(baseUrl)
      setCatalogModels(result.models)
      setCatalogStatus(`已拉取 ${result.models.length} 个模型`)
      if (result.models[0]?.id && !draft.model) setDraft({ ...draft, model: result.models[0].id })
    } catch (error) {
      setCatalogStatus(error instanceof Error ? error.message : '模型列表拉取失败')
    }
  }

  async function handleFetchProfileCatalog(profile: ModelProfileSummary) {
    setCatalogStatus('正在拉取当前模型列表...')
    try {
      const result = await onFetchModelCatalog({ profileId: profile.id })
      setCatalogModels(result.models)
      setCatalogStatus(`已拉取 ${result.models.length} 个模型`)
    } catch (error) {
      setCatalogStatus(error instanceof Error ? error.message : '当前模型列表拉取失败')
    }
  }

  async function fetchDraftCatalog(baseUrl: string) {
    if (draft.id && !hasFreshApiKey && !isServerEnvProfileId(draft.id)) {
      return onFetchModelCatalog({ profileId: draft.id })
    }

    return onFetchModelCatalog({ profile: { ...draft, baseUrl, name: buildProfileName(draft) } })
  }

  return {
    canFetchCatalog,
    canUseDraft,
    catalogStatus,
    draft,
    handleFetchDraftCatalog,
    handleFetchProfileCatalog,
    handlePresetChange,
    resetCatalog,
    handleSaveProfile,
    handleSaveProfileAsSpare,
    handleTestDraft,
    loadProfileIntoDraft,
    modelOptions,
    selectedPresetId,
    setDraft,
  }
}
