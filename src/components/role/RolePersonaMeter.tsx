import type { analyzePersonaImport } from '../../services/personaImport'

type PersonaAnalysis = ReturnType<typeof analyzePersonaImport>

interface RolePersonaMeterProps {
  analysis: PersonaAnalysis
}

export function RolePersonaMeter({ analysis }: RolePersonaMeterProps) {
  return (
    <div className="persona-import-meter" aria-label="人设导入质量">
      <div>
        <strong>人设导入质量</strong>
        <span>{analysis.score}%</span>
      </div>
      <p>
        已识别为{analysis.detectedFormat}。Persona V2 会整理成人格宪法、关系图谱、说话样本、场景触发、角色知识库和 OOC 守门，再和长期记忆一起使用。
      </p>
      <small>
        已编译：{analysis.v2.loreCount} 条知识 / {analysis.v2.speechExampleCount} 个语气样本 / {analysis.v2.sceneTriggerCount} 个场景触发 / {analysis.v2.guardCount} 条守门规则
      </small>
      {(analysis.v2.cardBookCount > 0 || analysis.v2.alternateGreetingCount > 0 || analysis.v2.hasPostHistoryInstructions) && (
        <small>
          角色卡槽位：{analysis.v2.cardBookCount} 条角色书 / {analysis.v2.alternateGreetingCount} 个备用开场 / {analysis.v2.hasPostHistoryInstructions ? '已带后置指令' : '无后置指令'}
        </small>
      )}
      {analysis.strengths.length > 0 && (
        <small>已覆盖：{analysis.strengths.join(' / ')}</small>
      )}
      {analysis.missing.length > 0 && (
        <small>可补：{analysis.missing.slice(0, 2).join('；')}</small>
      )}
      {analysis.v2.riskCount > 0 && (
        <small>风险提示：有 {analysis.v2.riskCount} 处需要用示例或关系图补稳</small>
      )}
    </div>
  )
}
