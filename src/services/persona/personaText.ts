import type { PersonaSpeechExample } from '../../domain/types'
import { FIELD_ALIASES } from './personaTypes'

export function normalizeText(value: string) {
  return value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
}

export function extractField(sourceText: string, aliases: string[]) {
  if (!sourceText) return ''
  const inlineValue = extractInlineField(sourceText, aliases)
  if (inlineValue) return inlineValue

  const lines = sourceText.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const alias = aliases.find((item) => line.startsWith(`${item}:`) || line.startsWith(`${item}：`) || line === item)
    if (!alias) continue

    const value = line.replace(new RegExp(`^${escapeRegExp(alias)}[:：]?`), '').trim()
    if (value) return value

    const block: string[] = []
    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      const nextLine = lines[nextIndex]
      if (isFieldHeading(nextLine)) break
      block.push(nextLine)
    }
    return block.join('\n').trim()
  }
  return ''
}

export function extractSentencesByHints(sourceText: string, hints: string[]) {
  if (!sourceText) return ''
  const sentences = sourceText
    .split(/[。！？!?；;\n]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
  const matches = sentences.filter((sentence) => hints.some((hint) => sentence.includes(hint)))
  return matches.slice(0, 2).join('。')
}

export function formatSpeechExample(example: PersonaSpeechExample): string {
  return [
    `{{user}}：${example.user}`,
    `{{char}}：${example.character}`,
    example.note ? `用途：${example.note}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export function formatList(title: string, values: string[]): string {
  const cleanValues = compactList(values, 8)
  if (cleanValues.length === 0) return `${title}：待补充`
  return [`${title}：`, ...cleanValues.map((value) => `- ${value}`)].join('\n')
}

export function compactList(values: Array<string | undefined | null>, limit: number): string[] {
  return dedupeBy(
    values
      .flatMap((value) => splitPersonaFacts(value ?? '', 4))
      .map((value) => compactSentence(value, 220))
      .filter(Boolean),
    (value) => value,
  ).slice(0, limit)
}

export function splitPersonaFacts(text: string, limit: number): string[] {
  return String(text)
    .split(/[。；;\n]+/)
    .map((item) => item.replace(/^[-*]\s*/, '').trim())
    .filter((item) => item && !/待补充/.test(item))
    .slice(0, limit)
}

export function compactSentence(text: string, limit: number): string {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`
}

export function trimLongText(text: string, limit: number): string {
  if (text.length <= limit) return text
  return `${text.slice(0, limit).trimEnd()}\n…（原始资料较长，已保留前半部分；结构化角色知识会继续参与运行时检索。）`
}

export function extractPersonaKeywords(text: string): string[] {
  const hints = [
    '傲娇',
    '大小姐',
    '善良',
    '高中',
    '同学',
    '姐姐',
    '妹妹',
    '恋人',
    'CP',
    '冰山',
    '绿茶',
    '忠犬',
    '自卑',
    '不良',
    '乖乖女',
    '边界',
    '经历',
    '说话',
    '关系',
  ]
  const matched = hints.filter((hint) => text.includes(hint))
  const chineseNames = text.match(/[\u4e00-\u9fa5]{2,6}/g) ?? []
  return dedupeBy([...matched, ...chineseNames.slice(0, 8)], (item) => item).slice(0, 12)
}

export function dedupeBy<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>()
  const result: T[] = []
  for (const item of items) {
    const key = getKey(item)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractInlineField(sourceText: string, aliases: string[]) {
  const allAliases = Object.values(FIELD_ALIASES).flat()
  for (const alias of aliases) {
    const match = new RegExp(`${escapeRegExp(alias)}[:：]`).exec(sourceText)
    if (!match) continue

    const valueStart = match.index + match[0].length
    const nextFieldStart = allAliases.reduce<number | null>((nearest, nextAlias) => {
      const nextMatch = new RegExp(`${escapeRegExp(nextAlias)}[:：]`).exec(sourceText.slice(valueStart))
      if (!nextMatch) return nearest
      const absoluteIndex = valueStart + nextMatch.index
      if (absoluteIndex <= match.index) return nearest
      return nearest === null || absoluteIndex < nearest ? absoluteIndex : nearest
    }, null)
    return sourceText.slice(valueStart, nextFieldStart ?? sourceText.length).trim()
  }
  return ''
}

function isFieldHeading(line: string) {
  return Object.values(FIELD_ALIASES)
    .flat()
    .some((alias) => line.startsWith(`${alias}:`) || line.startsWith(`${alias}：`) || line === alias)
}
