// ChatPhone 静态数据：表情、贴纸、快捷工具、聊天设置行

import { Camera, Clock3, File, Gift, Image, Paintbrush, Star, WalletCards } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { CharacterCard } from '../../domain/types'

export type ChatSettingRow = {
  label: string
  value: string
  switcher?: boolean
  danger?: boolean
  link?: boolean
  action?: 'clear-conversation' | 'delete-character'
}

export const emojiRows = [
  '🥰',
  '🙂',
  '😱',
  '☺️',
  '🥺',
  '😊',
  '🤢',
  '😂',
  '😭',
  '😎',
  '🤔',
  '👍',
  '🙄',
  '🤨',
  '🥳',
  '😵‍💫',
  '🤧',
  '😳',
  '😌',
  '😇',
  '😋',
  '😶‍🌫️',
  '🫠',
  '🥹',
  '😤',
  '😡',
  '😴',
  '🤤',
  '😏',
  '😈',
  '🙈',
  '💗',
  '💕',
  '💞',
  '✨',
  '🌙',
  '🌸',
  '🍰',
  '🍵',
  '🫶',
  '👏',
  '🙏',
]

export const stickers = [
  '(>△<)',
  'QwQ',
  '摸摸',
  '抱抱',
  '收到',
  '贴贴',
  '探头',
  '努力中',
  '已打卡',
  '+1',
  '晚安',
  '姐姐在',
  '歪头',
  '乖巧',
  '捂脸',
  '递茶',
  '小蛋糕',
  '困困',
  '心虚',
  '认真听',
  '雨天',
  '书页',
  '害羞',
  '开摆',
]

export const moreTools: { label: string; icon: LucideIcon }[] = [
  { label: '相册', icon: Image },
  { label: '拍摄', icon: Camera },
  { label: '文件', icon: File },
  { label: '收藏', icon: Star },
  { label: '礼物', icon: Gift },
  { label: '钱包', icon: WalletCards },
  { label: '聊天记录', icon: Clock3 },
  { label: '聊天背景', icon: Paintbrush },
]

export const chatSettingRows: ChatSettingRow[] = [
  { label: '设置置顶', value: 'off', switcher: true },
  { label: '特别关心', value: 'NEW 未开启' },
  { label: '隐藏会话', value: 'off', switcher: true },
  { label: '消息免打扰', value: 'off', switcher: true },
  { label: '消息通知设置', value: '通知预览、提示音等' },
  { label: '设置当前聊天背景', value: '' },
  { label: '删除聊天记录', value: '', danger: true, action: 'clear-conversation' },
  { label: '被骚扰了？举报该用户', value: '', link: true },
]

export function canDeleteCharacter(character: CharacterCard) {
  return (
    character.relationship === '群聊' ||
    character.id.startsWith('character_') ||
    character.tags.includes('自定义角色')
  )
}
