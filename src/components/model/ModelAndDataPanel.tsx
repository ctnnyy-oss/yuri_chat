import { Activity, AlertCircle, CheckCircle2, CircleDashed, SlidersHorizontal, XCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { AppSettings, ModelProfileInput, ModelProfileSummary } from '../../domain/types'
import { checkCloudHealth, saveCloudToken } from '../../services/cloudSync'
import { listModelProfiles, testModelProfile, type ModelCatalogResult } from '../../services/modelProfiles'
import { WorkspaceTitle } from '../memory/atoms'
import { GenerationSettings } from './GenerationSettings'
import { ModelCurrentStrip } from './ModelCurrentStrip'
import { ModelProfileEditor } from './ModelProfileEditor'
import { SavedModelProfiles } from './SavedModelProfiles'
import { useModelProfileDraft } from './useModelProfileDraft'

type DiagnosticStatus = 'idle' | 'running' | 'ok' | 'warn' | 'fail'

interface DiagnosticItem {
  id: 'cloud' | 'profiles' | 'model'
  label: string
  status: DiagnosticStatus
  detail: string
}

const initialDiagnostics: DiagnosticItem[] = [
  {
    id: 'cloud',
    label: '云端同步',
    status: 'idle',
    detail: '还没有检查云端读写入口。',
  },
  {
    id: 'profiles',
    label: '模型档案',
    status: 'idle',
    detail: '还没有读取服务器模型配置。',
  },
  {
    id: 'model',
    label: '当前模型',
    status: 'idle',
    detail: '还没有测试当前模型响应。',
  },
]

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function summarizeDiagnostics(items: DiagnosticItem[]): string {
  if (items.some((item) => item.status === 'fail')) return '巡检发现阻断项，按红色提示处理后再试。'
  if (items.some((item) => item.status === 'warn')) return '巡检基本可用，但有一项需要留意。'
  if (items.every((item) => item.status === 'ok')) return '巡检通过：云端、模型档案、当前模型都能正常响应。'
  return '点击巡检后，姐姐会依次检查云端、模型档案和当前模型。'
}

function getDiagnosticIcon(status: DiagnosticStatus) {
  if (status === 'ok') return <CheckCircle2 size={18} />
  if (status === 'warn') return <AlertCircle size={18} />
  if (status === 'fail') return <XCircle size={18} />
  if (status === 'running') return <Activity size={18} />
  return <CircleDashed size={18} />
}

interface ModelAndDataPanelProps {
  settings: AppSettings
  onUpdateSettings: (settings: AppSettings) => void
  modelProfiles: ModelProfileSummary[]
  modelProfileStatus: string
  modelProfileBusy: boolean
  cloudSyncConfigured: boolean
  cloudToken: string
  usesAccountSession?: boolean
  cloudStatus?: string
  onSaveModelProfile: (profile: ModelProfileInput) => Promise<void>
  onDeleteModelProfile: (profileId: string) => Promise<void>
  onFetchModelCatalog: (input: { profileId?: string; profile?: ModelProfileInput }) => Promise<ModelCatalogResult>
  onTestModelProfile: (input: { profileId?: string; profile?: ModelProfileInput }) => Promise<void>
}

export function ModelAndDataPanel({
  settings,
  onUpdateSettings,
  modelProfiles,
  modelProfileStatus,
  modelProfileBusy,
  cloudSyncConfigured,
  cloudToken,
  usesAccountSession = false,
  cloudStatus,
  onSaveModelProfile,
  onDeleteModelProfile,
  onFetchModelCatalog,
  onTestModelProfile,
}: ModelAndDataPanelProps) {
  const activeProfile =
    modelProfiles.find((profile) => profile.id === settings.modelProfileId) ??
    modelProfiles.find((profile) => profile.isDefault) ??
    modelProfiles[0]
  const draftController = useModelProfileDraft({
    modelProfileBusy,
    onFetchModelCatalog,
    onSaveModelProfile,
    onTestModelProfile,
  })
  const modelBackendHint = cloudSyncConfigured ? '云端模型后端' : '本机 /api 模型后端'
  const showLegacyCloudToken = cloudSyncConfigured && !usesAccountSession
  const [cloudTokenDraft, setCloudTokenDraft] = useState('')
  const [diagnostics, setDiagnostics] = useState<DiagnosticItem[]>(initialDiagnostics)
  const [diagnosticBusy, setDiagnosticBusy] = useState(false)
  const [modelActionNotice, setModelActionNotice] = useState('')
  const hydratedProfileKeyRef = useRef('')
  const diagnosticSummary = summarizeDiagnostics(diagnostics)

  useEffect(() => {
    if (!activeProfile) return
    const profileKey = `${activeProfile.id}:${activeProfile.updatedAt}`
    if (hydratedProfileKeyRef.current === profileKey) return

    hydratedProfileKeyRef.current = profileKey
    draftController.loadProfileIntoDraft(activeProfile)
  }, [activeProfile, draftController])

  useEffect(() => {
    if (!modelActionNotice) return

    const timer = window.setTimeout(() => setModelActionNotice(''), 2600)
    return () => window.clearTimeout(timer)
  }, [modelActionNotice])

  function scrollModelFormIntoView() {
    if (typeof document === 'undefined') return
    window.requestAnimationFrame(() => {
      document.querySelector('.model-profile-editor')?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    })
  }

  function handleUseProfile(profile: ModelProfileSummary) {
    onUpdateSettings({
      ...settings,
      modelProfileId: profile.id,
      model: profile.model,
    })
    draftController.loadProfileIntoDraft(profile)
    hydratedProfileKeyRef.current = `${profile.id}:${profile.updatedAt}`
    setModelActionNotice(`已切换到 ${profile.model}，上方表单已载入这组配置。`)
    scrollModelFormIntoView()
  }

  function handleEditProfile(profile: ModelProfileSummary) {
    draftController.loadProfileIntoDraft(profile)
    setModelActionNotice(`已载入 ${profile.model}，可直接修改 URL、模型或替换密钥。`)
    scrollModelFormIntoView()
  }

  function handleFetchActiveCatalog() {
    if (!activeProfile) return
    void draftController.handleFetchProfileCatalog(activeProfile)
  }

  function handleTestActiveProfile() {
    if (!activeProfile) return
    void onTestModelProfile({ profileId: activeProfile.id })
  }

  function handleStoreCloudToken(token: string) {
    saveCloudToken(token)
    setCloudTokenDraft(token)
  }

  async function handleRunDiagnostics() {
    if (diagnosticBusy) return

    setDiagnosticBusy(true)
    const token = cloudToken.trim()
    const nextDiagnostics = initialDiagnostics.map((item) => ({ ...item, status: 'running' as DiagnosticStatus }))
    const publish = (id: DiagnosticItem['id'], status: DiagnosticStatus, detail: string) => {
      const target = nextDiagnostics.find((item) => item.id === id)
      if (!target) return
      target.status = status
      target.detail = detail
      setDiagnostics(nextDiagnostics.map((item) => ({ ...item })))
    }

    setDiagnostics(nextDiagnostics.map((item) => ({ ...item })))

    if (!cloudSyncConfigured) {
      publish('cloud', 'fail', '当前页面没有连接云端后端。')
      publish('profiles', 'warn', '云端不可用时，无法读取线上模型档案。')
      publish('model', 'warn', '云端不可用时，无法测试线上模型。')
      setDiagnosticBusy(false)
      return
    }

    if (!token) {
      publish('cloud', 'fail', usesAccountSession ? '当前账号授权失效，请退出后重新登录。' : '先填写旧云端口令，再运行巡检。')
      publish('profiles', 'warn', usesAccountSession ? '账号授权失效，暂时不能读取模型档案。' : '缺少旧口令，暂时不能读取模型档案。')
      publish('model', 'warn', usesAccountSession ? '账号授权失效，暂时不能测试模型。' : '缺少旧口令，暂时不能测试模型。')
      setDiagnosticBusy(false)
      return
    }

    try {
      const metadata = await checkCloudHealth(token)
      publish('cloud', 'ok', metadata.hasState ? `云端可读，当前版本 v${metadata.revision}。` : '云端可访问，但还没有保存过数据。')
    } catch (error) {
      publish('cloud', 'fail', getErrorMessage(error, '云端检查失败。'))
      publish('profiles', 'warn', '云端检查失败，已停止后续模型巡检。')
      publish('model', 'warn', '云端检查失败，已停止后续模型巡检。')
      setDiagnosticBusy(false)
      return
    }

    let latestProfiles: ModelProfileSummary[]
    try {
      latestProfiles = await listModelProfiles(token)
      publish('profiles', latestProfiles.length > 0 ? 'ok' : 'warn', latestProfiles.length > 0 ? `已读取 ${latestProfiles.length} 个模型档案。` : '服务器还没有可用模型档案。')
    } catch (error) {
      publish('profiles', 'fail', getErrorMessage(error, '读取模型档案失败。'))
      publish('model', 'warn', '模型档案读取失败，已跳过模型测试。')
      setDiagnosticBusy(false)
      return
    }

    const profileForTest =
      latestProfiles.find((profile) => profile.id === activeProfile?.id) ??
      latestProfiles.find((profile) => profile.id === settings.modelProfileId) ??
      latestProfiles.find((profile) => profile.isDefault) ??
      latestProfiles[0]

    if (!profileForTest) {
      publish('model', 'fail', '没有可测试的模型档案。')
      setDiagnosticBusy(false)
      return
    }

    if (!profileForTest.hasApiKey) {
      publish('model', 'warn', `“${profileForTest.name}”还没有可用密钥。`)
      setDiagnosticBusy(false)
      return
    }

    try {
      const result = await testModelProfile(token, { profileId: profileForTest.id })
      const latencyText = Number.isFinite(result.latencyMs) ? `，${result.latencyMs}ms` : ''
      publish('model', 'ok', `${result.model} 已响应${latencyText}。`)
    } catch (error) {
      publish('model', 'fail', getErrorMessage(error, '当前模型测试失败。'))
    } finally {
      setDiagnosticBusy(false)
    }
  }

  return (
    <>
      <WorkspaceTitle
        description="选择平台或自定义，填 Base URL 和 API Key 后自动拉取模型列表。"
        icon={<SlidersHorizontal size={20} />}
        title="模型接入"
      />

      <section className="settings-stack model-settings-stack model-connect-stack">
        {showLegacyCloudToken && (
          <section className="settings-section model-auth-section">
            <div className="settings-section-title">
              <span>云端口令</span>
            </div>
            <label>
              <span>后端授权</span>
              <input
                autoComplete="off"
                onChange={(event) => setCloudTokenDraft(event.target.value)}
                placeholder={cloudToken ? '已保存到当前浏览器，留空可清除' : '填入云端同步口令'}
                type="password"
                value={cloudTokenDraft}
              />
              <small>
                公开后端开启授权时，先保存一次口令；口令只存在当前浏览器，不会写进仓库或导出文件。
                {cloudStatus ? ` 当前状态：${cloudStatus}` : ''}
              </small>
            </label>
            <div className="settings-actions">
              <button onClick={() => handleStoreCloudToken(cloudTokenDraft)} type="button">
                保存口令
              </button>
              <button className="quiet-action" onClick={() => handleStoreCloudToken('')} type="button">
                清空口令
              </button>
            </div>
          </section>
        )}

        <div className="model-layout">
          <ModelProfileEditor
            actionNotice={modelActionNotice}
            canFetchCatalog={draftController.canFetchCatalog}
            canUseDraft={draftController.canUseDraft}
            catalogStatus={draftController.catalogStatus}
            draft={draftController.draft}
            modelOptions={draftController.modelOptions}
            modelStatusText={modelProfileStatus}
            onDraftChange={draftController.setDraft}
            onFetchDraftCatalog={draftController.handleFetchDraftCatalog}
            onPresetChange={draftController.handlePresetChange}
            onResetCatalog={draftController.resetCatalog}
            onSaveProfile={draftController.handleSaveProfile}
            onTestDraft={draftController.handleTestDraft}
            selectedPresetId={draftController.selectedPresetId}
          />

          <section className="settings-section model-column model-saved-section">
            <SavedModelProfiles
              activeProfileId={settings.modelProfileId}
              modelProfiles={modelProfiles}
              onDeleteModelProfile={onDeleteModelProfile}
              onEditProfile={handleEditProfile}
              onTestProfile={(profile) => void onTestModelProfile({ profileId: profile.id })}
              onUseProfile={handleUseProfile}
            />
          </section>
        </div>

        <section className="settings-section model-column model-generation-section">
          <GenerationSettings onUpdateSettings={onUpdateSettings} settings={settings} />
        </section>

        <ModelCurrentStrip
          activeProfile={activeProfile}
          modelBackendHint={modelBackendHint}
          modelProfileBusy={modelProfileBusy}
          onFetchCatalog={handleFetchActiveCatalog}
          onTestProfile={handleTestActiveProfile}
        />

        <section className="settings-section model-diagnostics-section">
          <div className="settings-section-title">
            <Activity size={18} />
            <span>一键巡检</span>
          </div>
          <p className="section-note">只检查连接状态，不创建角色、不写入聊天记录，也不会展示密钥。</p>
          <div className="model-diagnostic-list">
            {diagnostics.map((item) => (
              <div className={`model-diagnostic-item ${item.status}`} key={item.id}>
                <span className="model-diagnostic-icon">{getDiagnosticIcon(item.status)}</span>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </span>
              </div>
            ))}
          </div>
          <div className="settings-actions">
            <button disabled={diagnosticBusy || modelProfileBusy} onClick={handleRunDiagnostics} type="button">
              <Activity size={15} />
              {diagnosticBusy ? '巡检中' : '开始巡检'}
            </button>
          </div>
          <p className="section-note">{diagnosticSummary}</p>
        </section>
      </section>
    </>
  )
}
