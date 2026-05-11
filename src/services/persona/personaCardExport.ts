import type { CharacterPersonaProfile, PersonaImportedCardBookEntry } from '../../domain/types'
import { compactSentence } from './personaText'

export interface CharacterCardV2Export {
  spec: 'chara_card_v2'
  spec_version: '2.0'
  data: {
    name: string
    description: string
    personality: string
    scenario: string
    first_mes: string
    mes_example: string
    creator_notes: string
    system_prompt: string
    post_history_instructions: string
    alternate_greetings: string[]
    character_book: {
      entries: Array<{
        keys: string[]
        content: string
        enabled: boolean
        insertion_order: number
        priority: number
        name: string
        extensions: Record<string, unknown>
      }>
      extensions: Record<string, unknown>
    }
    tags: string[]
    creator: string
    character_version: string
    extensions: Record<string, unknown>
  }
}

export function exportPersonaProfileToCharacterCardV2(profile: CharacterPersonaProfile): CharacterCardV2Export {
  const card = profile.cardFields

  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: card?.name || inferNameFromProfile(profile),
      description: card?.description || profile.identity,
      personality: card?.personality || profile.temperament,
      scenario: card?.scenario || profile.relationship,
      first_mes: card?.firstMessage || '',
      mes_example: card?.messageExamples || buildExampleText(profile),
      creator_notes: card?.creatorNotes || '',
      system_prompt: card?.systemPrompt || profile.interactionRules,
      post_history_instructions: card?.postHistoryInstructions || (profile.oocGuards ?? []).slice(0, 4).join('\n'),
      alternate_greetings: card?.alternateGreetings ?? [],
      character_book: {
        entries: buildCharacterBookEntries(profile),
        extensions: {},
      },
      tags: card?.tags ?? [],
      creator: card?.creator ?? '',
      character_version: card?.characterVersion ?? String(profile.schemaVersion ?? 2),
      extensions: card?.extensions ?? {},
    },
  }
}

function buildExampleText(profile: CharacterPersonaProfile): string {
  return (profile.speechExamples ?? [])
    .slice(0, 5)
    .map((example) => `<START>\n{{user}}: ${example.user}\n{{char}}: ${example.character}`)
    .join('\n')
}

function buildCharacterBookEntries(profile: CharacterPersonaProfile): CharacterCardV2Export['data']['character_book']['entries'] {
  const cardEntries = profile.cardFields?.characterBookEntries
  const sourceEntries: PersonaImportedCardBookEntry[] =
    cardEntries && cardEntries.length > 0
      ? cardEntries
      : (profile.loreEntries ?? []).map((entry) => ({
          name: entry.title,
          content: entry.content,
          keys: entry.keywords,
          priority: entry.priority,
          enabled: true,
        }))

  return sourceEntries.slice(0, 24).map((entry, index) => ({
    keys: entry.keys,
    content: entry.content,
    enabled: entry.enabled ?? true,
    insertion_order: index,
    priority: entry.priority,
    name: entry.name || `角色书条目 ${index + 1}`,
    extensions: {},
  }))
}

function inferNameFromProfile(profile: CharacterPersonaProfile): string {
  const firstSentence = compactSentence(profile.identity, 32)
  const match = firstSentence.match(/^[\u4e00-\u9fa5A-Za-z0-9_·]{2,12}/)
  return match?.[0] || '角色'
}
