import type { CSSProperties } from 'react'
import { Plus, Save, Trash2, Wand2 } from 'lucide-react'
import type { analyzePersonaImport } from '../../services/personaImport'
import { applyPersonaImportTemplate, type ManagedRole, type MobileEditorMode, type RoleDraft } from './rolePanelModel'
import { RolePersonaMeter } from './RolePersonaMeter'

type PersonaAnalysis = ReturnType<typeof analyzePersonaImport>

interface DesktopRoleEditorProps {
  canEditSelectedRole: boolean
  editorEditable: boolean
  mobileEditorMode: MobileEditorMode
  personaAnalysis: PersonaAnalysis
  roleDraft: RoleDraft
  selectedRole?: ManagedRole
  onAddRole: () => void
  onDeleteRole: () => void
  onSaveRole: () => void
  onUpdateDraft: <K extends keyof RoleDraft>(field: K, value: RoleDraft[K]) => void
}

export function DesktopRoleEditor({
  canEditSelectedRole,
  editorEditable,
  mobileEditorMode,
  personaAnalysis,
  roleDraft,
  selectedRole,
  onAddRole,
  onDeleteRole,
  onSaveRole,
  onUpdateDraft,
}: DesktopRoleEditorProps) {
  return (
    <section className="role-detail" aria-label="角色详情">
      <div className="role-detail-head">
        <span className="avatar" style={{ '--avatar-accent': selectedRole?.accent ?? '#ef9ac6' } as CSSProperties}>
          {selectedRole?.avatar ?? '角'}
        </span>
        <div>
          <strong>{selectedRole?.name ?? '新角色'}</strong>
          <small>{selectedRole?.source === '内置' ? '只读参考' : '可以编辑'}</small>
        </div>
      </div>
      <p>{selectedRole?.persona ?? '点新增角色后填写人设。'}</p>
      <div className="role-editor-fields">
        <label>
          名称
          <input
            disabled={!editorEditable}
            value={roleDraft.name}
            onChange={(event) => onUpdateDraft('name', event.target.value)}
            placeholder="比如：姐姐 / 恋人 / 原创角色"
          />
        </label>
        <label>
          关系
          <input
            disabled={!editorEditable}
            value={roleDraft.relation}
            onChange={(event) => onUpdateDraft('relation', event.target.value)}
            placeholder="姐姐、恋人、朋友、角色"
          />
        </label>
        <label>
          氛围
          <input
            disabled={!editorEditable}
            value={roleDraft.mood}
            onChange={(event) => onUpdateDraft('mood', event.target.value)}
            placeholder="温柔、傲娇、绿茶、忠犬..."
          />
        </label>
        <div className="persona-import-field">
          <span className="persona-field-head">
            人设导入
            <button
              aria-label="套用人设结构模板"
              disabled={!editorEditable}
              onClick={() => onUpdateDraft('persona', applyPersonaImportTemplate(roleDraft))}
              type="button"
            >
              <Wand2 size={15} />
              <span>套用结构</span>
            </button>
          </span>
          <textarea
            aria-label="人设导入"
            disabled={!editorEditable}
            value={roleDraft.persona}
            onChange={(event) => onUpdateDraft('persona', event.target.value)}
            placeholder="可以直接粘贴自然语言。越包含经历、说话方式、情绪模式、边界和相处规则，越像真人。"
          />
        </div>
        <label>
          音色名
          <input
            disabled={!editorEditable}
            value={roleDraft.voiceDisplayName}
            onChange={(event) => onUpdateDraft('voiceDisplayName', event.target.value)}
            placeholder="比如：温柔姐姐音 / 自定义音色"
          />
        </label>
        <label>
          音色 ID
          <input
            disabled={!editorEditable}
            value={roleDraft.voiceId}
            onChange={(event) => onUpdateDraft('voiceId', event.target.value)}
            placeholder="供应商里的 voice_id；克隆训练在供应商后台完成"
          />
        </label>
        <label>
          声音风格
          <textarea
            disabled={!editorEditable}
            value={roleDraft.voicePrompt}
            onChange={(event) => onUpdateDraft('voicePrompt', event.target.value)}
            placeholder="自然聊天、轻声、清晰、不要播音腔；也可以写角色语气。"
          />
        </label>
        <label className="voice-consent-row">
          <span>
            已确认授权
            <small>只保存本人或明确授权的音色；不要仿冒现实人物或未授权角色。</small>
          </span>
          <input
            checked={roleDraft.voiceConsentConfirmed}
            disabled={!editorEditable}
            onChange={(event) => onUpdateDraft('voiceConsentConfirmed', event.target.checked)}
            type="checkbox"
          />
        </label>
        <RolePersonaMeter analysis={personaAnalysis} />
      </div>
      <div className="role-template-list role-action-list">
        {mobileEditorMode === 'create' ? (
          <button onClick={onAddRole} type="button">
            <Plus size={17} />
            <span>创建角色</span>
          </button>
        ) : null}
        {canEditSelectedRole && (
          <>
            <button onClick={onSaveRole} type="button">
              <Save size={17} />
              <span>保存角色</span>
            </button>
            <button className="danger-role-action" onClick={onDeleteRole} type="button">
              <Trash2 size={17} />
              <span>删除角色</span>
            </button>
          </>
        )}
      </div>
    </section>
  )
}
