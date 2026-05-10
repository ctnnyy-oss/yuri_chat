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
      <p>系统会把自然语言整理成身份、关系、经历、说话方式、情绪模式、边界和互动规则，再和长期记忆一起使用。</p>
      {analysis.strengths.length > 0 && (
        <small>已覆盖：{analysis.strengths.join(' / ')}</small>
      )}
      {analysis.missing.length > 0 && (
        <small>可补：{analysis.missing.slice(0, 2).join('；')}</small>
      )}
    </div>
  )
}
