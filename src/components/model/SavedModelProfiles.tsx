import { useState } from 'react'
import { CheckCircle2, Trash2 } from 'lucide-react'
import type { ModelProfileSummary } from '../../domain/types'
import { MobileConfirmDialog } from '../MobileConfirmDialog'
import { isServerEnvProfileId, providerKindLabels } from './modelPanelUtils'

interface SavedModelProfilesProps {
  activeProfileId: string
  modelProfiles: ModelProfileSummary[]
  onDeleteModelProfile: (profileId: string) => Promise<void>
  onEditProfile: (profile: ModelProfileSummary) => void
  onTestProfile: (profile: ModelProfileSummary) => void
  onUseProfile: (profile: ModelProfileSummary) => void
}

export function SavedModelProfiles({
  activeProfileId,
  modelProfiles,
  onDeleteModelProfile,
  onEditProfile,
  onTestProfile,
  onUseProfile,
}: SavedModelProfilesProps) {
  const [pendingDeleteProfile, setPendingDeleteProfile] = useState<ModelProfileSummary | null>(null)

  function confirmDeletePendingProfile() {
    if (!pendingDeleteProfile) return
    const profileId = pendingDeleteProfile.id
    setPendingDeleteProfile(null)
    void onDeleteModelProfile(profileId)
  }

  return (
    <>
      <div className="settings-section-title">
        <CheckCircle2 size={18} />
        <span>已保存模型</span>
      </div>
      <div className="model-profile-list">
        {modelProfiles.length === 0 ? (
          <small className="model-empty-note">还没有保存模型。先选平台或自定义，填 URL 和 API Key，模型列表出来后保存。</small>
        ) : (
          modelProfiles.map((profile) => (
            <article className={`model-profile-item ${profile.id === activeProfileId ? 'active' : ''}`} key={profile.id}>
              <div className="model-profile-main">
                <strong>{profile.model}</strong>
                <dl className="model-profile-meta">
                  <div>
                    <dt>平台</dt>
                    <dd>{profile.name}</dd>
                  </div>
                  <div>
                    <dt>接口</dt>
                    <dd>{providerKindLabels[profile.kind]}</dd>
                  </div>
                  <div>
                    <dt>地址</dt>
                    <dd>{profile.baseUrl}</dd>
                  </div>
                  <div>
                    <dt>密钥</dt>
                    <dd>{profile.hasApiKey ? '已保存' : '未填写'}</dd>
                  </div>
                </dl>
              </div>
              <div className="backup-actions">
                <button onClick={() => onUseProfile(profile)} type="button">
                  使用
                </button>
                <button onClick={() => onEditProfile(profile)} type="button">
                  {isServerEnvProfileId(profile.id) ? '复制' : '编辑'}
                </button>
                <button disabled={!profile.hasApiKey} onClick={() => onTestProfile(profile)} type="button">
                  测试
                </button>
                {!isServerEnvProfileId(profile.id) && (
                  <button
                    className="danger-button"
                    onClick={() => setPendingDeleteProfile(profile)}
                    type="button"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </article>
          ))
        )}
      </div>
      {pendingDeleteProfile && (
        <MobileConfirmDialog
          danger
          title="删除模型配置"
          message={`会删除「${pendingDeleteProfile.model}」这组模型配置，保存的密钥也会一起清掉。这个操作不能恢复。`}
          confirmLabel="删除配置"
          onCancel={() => setPendingDeleteProfile(null)}
          onConfirm={confirmDeletePendingProfile}
        />
      )}
    </>
  )
}
