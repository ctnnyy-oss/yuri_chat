import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useState } from 'react'
import type { AppState, ModelProfileInput, ModelProfileSummary } from '../domain/types'
import {
  deleteModelProfile,
  fetchModelCatalog,
  listModelProfiles,
  saveModelProfile,
  testModelProfile,
  type ModelCatalogResult,
} from '../services/modelProfiles'
import { isLikelyVoiceOnlyProfile, pickFallbackChatProfile } from '../services/modelProfileCapabilities'
import { isCloudSyncConfigured } from '../services/cloudSync'
import { normalizeTrashRetentionSettings } from '../services/trashRetention'

interface UseModelProfilesDeps {
  setState: Dispatch<SetStateAction<AppState>>
  setNotice: Dispatch<SetStateAction<string>>
  getCloudToken: () => string
}

export function useModelProfiles({ setState, setNotice, getCloudToken }: UseModelProfilesDeps) {
  const [modelProfiles, setModelProfiles] = useState<ModelProfileSummary[]>([])
  const [modelProfileStatus, setModelProfileStatus] = useState(() => {
    if (!isCloudSyncConfigured()) return '模型配置会保存到本机 /api 保险箱'
    return '模型配置会保存到云端保险箱'
  })
  const [modelProfileBusy, setModelProfileBusy] = useState(false)

  const refreshModelProfileList = useCallback(async (tokenOverride?: string) => {
    const token = (tokenOverride ?? getCloudToken()).trim()
    setModelProfileBusy(true)
    setModelProfileStatus('正在读取模型配置...')
    try {
      const profiles = await listModelProfiles(token)
      setModelProfiles(profiles)
      const fallbackProfile = pickFallbackChatProfile(profiles)
      setState((currentState) => {
        const selectedProfile = profiles.find((profile) => profile.id === currentState.settings.modelProfileId)
        if (selectedProfile && !isLikelyVoiceOnlyProfile(selectedProfile)) return currentState
        if (!fallbackProfile && !selectedProfile) return currentState

        return {
          ...currentState,
          settings: normalizeTrashRetentionSettings({
            ...currentState.settings,
            modelProfileId: fallbackProfile?.id ?? '',
            model: fallbackProfile?.model ?? '',
          }),
        }
      })
      setModelProfileStatus(`已读取 ${profiles.length} 组模型配置`)
      return profiles
    } catch (error) {
      setModelProfiles([])
      setModelProfileStatus(error instanceof Error ? error.message : '读取模型配置失败')
      return []
    } finally {
      setModelProfileBusy(false)
    }
  }, [getCloudToken, setState])

  async function handleSaveModelProfile(profile: ModelProfileInput) {
    try {
      const token = getCloudToken().trim()
      setModelProfileBusy(true)
      setModelProfileStatus('正在保存模型配置...')
      const result = await saveModelProfile(token, profile)
      setModelProfiles(result.profiles)
      const shouldActivate = profile.isDefault !== false
      if (shouldActivate) {
        setState((currentState) => ({
          ...currentState,
          settings: normalizeTrashRetentionSettings({
            ...currentState.settings,
            modelProfileId: result.profile.id,
            model: result.profile.model,
          }),
        }))
      }
      setModelProfileStatus(shouldActivate ? `已保存并启用：${result.profile.name}` : `已保存备用档案：${result.profile.name}`)
      setNotice(shouldActivate ? '模型配置已保存' : '备用模型档案已保存')
    } catch (error) {
      setModelProfileStatus(error instanceof Error ? error.message : '保存模型配置失败')
    } finally {
      setModelProfileBusy(false)
    }
  }

  async function handleDeleteModelProfile(profileId: string) {
    try {
      const token = getCloudToken().trim()
      setModelProfileBusy(true)
      const profiles = await deleteModelProfile(token, profileId)
      setModelProfiles(profiles)
      const fallbackProfile = pickFallbackChatProfile(profiles)
      setState((currentState) => {
        const deletingChatProfile = currentState.settings.modelProfileId === profileId
        const deletingTtsProfile = currentState.settings.voice.ttsProfileId === profileId
        if (!deletingChatProfile && !deletingTtsProfile) return currentState

        return {
          ...currentState,
          settings: normalizeTrashRetentionSettings({
            ...currentState.settings,
            modelProfileId: deletingChatProfile ? fallbackProfile?.id ?? '' : currentState.settings.modelProfileId,
            model: deletingChatProfile ? fallbackProfile?.model ?? currentState.settings.model : currentState.settings.model,
            voice: {
              ...currentState.settings.voice,
              ttsProfileId: deletingTtsProfile ? '' : currentState.settings.voice.ttsProfileId,
            },
          }),
        }
      })
      setModelProfileStatus('模型配置已删除')
      setNotice('模型配置已删除')
    } catch (error) {
      setModelProfileStatus(error instanceof Error ? error.message : '删除模型配置失败')
    } finally {
      setModelProfileBusy(false)
    }
  }

  async function handleTestModelProfile(input: { profileId?: string; profile?: ModelProfileInput }) {
    try {
      const token = getCloudToken().trim()
      setModelProfileBusy(true)
      setModelProfileStatus('正在测试模型连通性...')
      const result = await testModelProfile(token, input)
      setModelProfileStatus(`测试成功：${result.provider} / ${result.model}，${result.latencyMs}ms，${result.preview}`)
      setNotice('模型测试成功')
    } catch (error) {
      setModelProfileStatus(error instanceof Error ? error.message : '模型测试失败')
      setNotice('模型测试失败')
    } finally {
      setModelProfileBusy(false)
    }
  }

  async function handleFetchModelCatalog(input: {
    profileId?: string
    profile?: ModelProfileInput
  }): Promise<ModelCatalogResult> {
    try {
      const token = getCloudToken().trim()
      setModelProfileBusy(true)
      setModelProfileStatus('正在拉取模型列表...')
      const result = await fetchModelCatalog(token, input)
      setModelProfileStatus(`已拉取 ${result.models.length} 个模型`)
      setNotice('模型列表已更新')
      return result
    } catch (error) {
      setModelProfileStatus(error instanceof Error ? error.message : '模型列表拉取失败')
      setNotice('模型列表拉取失败')
      throw error
    } finally {
      setModelProfileBusy(false)
    }
  }

  const initModelProfiles = useCallback(async () => {
    await refreshModelProfileList()
  }, [refreshModelProfileList])

  return {
    modelProfiles,
    modelProfileStatus,
    setModelProfileStatus,
    modelProfileBusy,
    refreshModelProfileList,
    handleSaveModelProfile,
    handleDeleteModelProfile,
    handleTestModelProfile,
    handleFetchModelCatalog,
    initModelProfiles,
  }
}
