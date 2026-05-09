import { Link2, PlugZap } from 'lucide-react'
import type { ModelProfileSummary } from '../../domain/types'
import { providerKindLabels } from './modelPanelUtils'

interface ModelCurrentStripProps {
  activeProfile?: ModelProfileSummary
  modelBackendHint: string
  modelProfileBusy: boolean
  onFetchCatalog: () => void
  onTestProfile: () => void
}

export function ModelCurrentStrip({
  activeProfile,
  modelBackendHint,
  modelProfileBusy,
  onFetchCatalog,
  onTestProfile,
}: ModelCurrentStripProps) {
  return (
    <section className="model-current-strip" aria-label="当前模型状态">
      <div>
        <small>当前启用</small>
        <strong>{activeProfile ? activeProfile.model : '尚未选择模型'}</strong>
        <span>{activeProfile ? `${activeProfile.name} / ${providerKindLabels[activeProfile.kind]}` : modelBackendHint}</span>
        {activeProfile && <span>{activeProfile.baseUrl}</span>}
      </div>
      <div className="model-current-actions">
        <button disabled={!activeProfile || !activeProfile.hasApiKey || modelProfileBusy} onClick={onFetchCatalog} type="button">
          <Link2 size={15} />
          刷新列表
        </button>
        <button disabled={!activeProfile || !activeProfile.hasApiKey || modelProfileBusy} onClick={onTestProfile} type="button">
          <PlugZap size={15} />
          测试连接
        </button>
      </div>
    </section>
  )
}
