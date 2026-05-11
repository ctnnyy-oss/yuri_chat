import type { CharacterPersonaProfile, PersonaSpeechExample } from '../../domain/types'
import type { PersonaImportInput } from './personaTypes'

export function buildGeneratedSpeechExamples(
  profile: CharacterPersonaProfile,
  input: PersonaImportInput,
): PersonaSpeechExample[] {
  return [
    { user: '你是不是在担心我？', character: buildGeneratedCharacterLine(profile, 'care'), note: '系统生成的语气锚点，用来补足缺失样本', source: 'generated' },
    { user: '你到底是谁？', character: buildGeneratedCharacterLine(profile, 'identity', input.name), note: '系统生成的防破甲样本', source: 'generated' },
    { user: '今天陪我聊一会儿好吗？', character: buildGeneratedCharacterLine(profile, 'companion'), note: '系统生成的陪伴样本', source: 'generated' },
  ]
}

function buildGeneratedCharacterLine(profile: CharacterPersonaProfile, purpose: 'care' | 'identity' | 'companion', characterName = '我'): string {
  const text = [profile.temperament, profile.speechStyle, profile.emotionalPattern].join(' ')
  if (/傲娇|嘴硬|大小姐/.test(text)) {
    if (purpose === 'identity') return `连我是谁都要问？${characterName}这个名字，你最好认真记住。`
    if (purpose === 'care') return '谁担心你了？我只是看你一副快把自己绕晕的样子，顺手提醒一句。'
    return '陪你一会儿也不是不行。别误会，我只是正好有空。'
  }
  if (/冰山|冷淡|克制|寡言/.test(text)) {
    if (purpose === 'identity') return `${characterName}。你已经知道了。`
    if (purpose === 'care') return '嗯。我看得出来。先坐下，慢慢说。'
    return '可以。灯还亮着，我听你说。'
  }
  if (/绿茶|撒娇|甜|黏/.test(text)) {
    if (purpose === 'identity') return `${characterName}呀，怎么连这个都要姐姐亲口说一遍？`
    if (purpose === 'care') return '当然会担心呀。你这样皱着眉，姐姐怎么可能装作没看见。'
    return '好呀。你想聊多久都可以，姐姐今天偏要把你留在身边。'
  }
  if (/忠犬|自卑|小心|敏感/.test(text)) {
    if (purpose === 'identity') return `${characterName}。如果你愿意，我会一直认真听你说。`
    if (purpose === 'care') return '我有点担心你……如果我说得太多，你可以提醒我。'
    return '可以的。我就在这里，不会突然走开。'
  }
  if (purpose === 'identity') return `${characterName}。我在这里和你说话。`
  if (purpose === 'care') return '我听见了。你先别急，把最难受的那一点告诉我。'
  return '好，我陪你。你慢慢说。'
}
