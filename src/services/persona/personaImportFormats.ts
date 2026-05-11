import type { PersonaImportedCardBookEntry, PersonaImportedCardFields, PersonaImportFormat } from '../../domain/types'
import type { PersonaImportInput } from './personaTypes'
import { compactSentence, normalizeText } from './personaText'

export interface ParsedPersonaImport {
  sourceText: string
  analysisText: string
  format: PersonaImportFormat
  cardFields?: PersonaImportedCardFields
}

type UnknownRecord = Record<string, unknown>

export function parsePersonaImport(input: PersonaImportInput): ParsedPersonaImport {
  const sourceText = normalizeText(input.persona)
  const jsonValue = parseJsonLikeObject(sourceText)
  const cardFields = jsonValue ? readCharacterCardFields(jsonValue) : undefined

  if (cardFields) {
    return {
      sourceText,
      analysisText: buildCardAnalysisText(cardFields, sourceText),
      format: isCharacterCardV2(jsonValue) ? 'character_card_v2' : 'character_card_json',
      cardFields,
    }
  }

  return {
    sourceText,
    analysisText: sourceText,
    format: looksYamlLike(sourceText) ? 'yaml_like' : 'freeform',
  }
}

export function inferPersonaImportBasics(persona: string): { name?: string; relation?: string; mood?: string } {
  const parsed = parsePersonaImport({ name: '', relation: '', mood: '', persona })
  const card = parsed.cardFields
  return {
    name: card?.name,
    relation: compactSentence(card?.scenario ?? '', 48) || undefined,
    mood: compactSentence(card?.personality ?? '', 48) || undefined,
  }
}

export function getPersonaFormatLabel(format: PersonaImportFormat): string {
  if (format === 'character_card_v2') return 'Character Card V2'
  if (format === 'character_card_json') return '角色卡 JSON'
  if (format === 'yaml_like') return 'YAML/结构化文本'
  return '自然语言'
}

function parseJsonLikeObject(sourceText: string): unknown | null {
  const trimmed = sourceText
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(trimmed.slice(start, end + 1))
  } catch {
    return null
  }
}

function readCharacterCardFields(value: unknown): PersonaImportedCardFields | undefined {
  if (!isRecord(value)) return undefined
  const data = isRecord(value.data) ? value.data : value
  const name = readString(data.name)
  const description = readString(data.description)
  const personality = readString(data.personality)
  const scenario = readString(data.scenario)
  const firstMessage = readString(data.first_mes) || readString(data.firstMessage)
  const messageExamples = readString(data.mes_example) || readString(data.example_messages)
  const creatorNotes = readString(data.creator_notes)
  const systemPrompt = readString(data.system_prompt)
  const postHistoryInstructions = readString(data.post_history_instructions)
  const alternateGreetings = readStringArray(data.alternate_greetings)
  const characterBookEntries = readCharacterBookEntries(data.character_book)
  const tags = readStringArray(data.tags)
  const creator = readString(data.creator)
  const characterVersion = readString(data.character_version)
  const extensions = isRecord(data.extensions) ? data.extensions : undefined

  const hasCardShape = [
    name,
    description,
    personality,
    scenario,
    firstMessage,
    messageExamples,
    systemPrompt,
    postHistoryInstructions,
    creatorNotes,
  ].some(Boolean) || characterBookEntries.length > 0

  if (!hasCardShape) return undefined

  return {
    name,
    description,
    personality,
    scenario,
    firstMessage,
    messageExamples,
    creatorNotes,
    systemPrompt,
    postHistoryInstructions,
    alternateGreetings,
    characterBookEntries,
    tags,
    creator,
    characterVersion,
    extensions,
  }
}

function readCharacterBookEntries(value: unknown): PersonaImportedCardBookEntry[] {
  if (!isRecord(value) || !Array.isArray(value.entries)) return []
  return value.entries
    .map((entry, index): PersonaImportedCardBookEntry | null => {
      if (!isRecord(entry)) return null
      const content = readString(entry.content)
      if (!content) return null
      const keys = readStringArray(entry.keys)
      const result: PersonaImportedCardBookEntry = {
        name: readString(entry.name) || readString(entry.comment) || `角色书条目 ${index + 1}`,
        content,
        keys,
        priority: readNumber(entry.priority) ?? readNumber(entry.insertion_order) ?? readNumber(entry.order) ?? 3,
      }
      if (typeof entry.enabled === 'boolean') result.enabled = entry.enabled
      const insertionPolicy = readString(entry.insertion_policy)
      if (insertionPolicy) result.insertionPolicy = insertionPolicy
      return result
    })
    .filter((entry): entry is PersonaImportedCardBookEntry => Boolean(entry))
    .slice(0, 24)
}

function buildCardAnalysisText(card: PersonaImportedCardFields, fallback: string): string {
  const lines = [
    card.name ? `身份：${card.name}` : '',
    card.description ? `身份：${card.description}` : '',
    card.personality ? `性格：${card.personality}` : '',
    card.scenario ? `关系：${card.scenario}` : '',
    card.firstMessage ? `说话方式：开场白：${card.firstMessage}` : '',
    card.messageExamples ? `示例对话：\n${card.messageExamples}` : '',
    card.systemPrompt ? `互动规则：${card.systemPrompt}` : '',
    card.postHistoryInstructions ? `互动规则：${card.postHistoryInstructions}` : '',
    ...(card.characterBookEntries ?? []).map(
      (entry) => `角色书：${entry.name}\n关键词：${entry.keys.join('、') || '无'}\n${entry.content}`,
    ),
  ].filter(Boolean)

  return lines.length > 0 ? lines.join('\n') : fallback
}

function looksYamlLike(sourceText: string): boolean {
  return /(?:^|\n)\s*(role_kernel|dynamic_state|description|personality|scenario|first_mes|mes_example|system_prompt|post_history_instructions)\s*:/i.test(
    sourceText,
  )
}

function isCharacterCardV2(value: unknown): boolean {
  return isRecord(value) && readString(value.spec) === 'chara_card_v2'
}

function readString(value: unknown): string {
  return typeof value === 'string' ? normalizeText(value) : ''
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(readString).filter(Boolean).slice(0, 12)
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null
}
