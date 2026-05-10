import {
  Brain,
  ListTodo,
  MessageCircle,
  Settings,
  SlidersHorizontal,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import type { CharacterCard, ConversationState } from '../domain/types'

export type AppView = 'chat' | 'role' | 'group' | 'moments' | 'tasks' | 'memory' | 'world' | 'model' | 'settings' | 'trash'

export type RailItem = { id: AppView; label: string; description: string; icon: LucideIcon; badge?: string }
export type AppPaneRow = { title: string; text: string; icon: LucideIcon; view: AppView; active?: boolean }

export const primaryNavigationItems: RailItem[] = [
  { id: 'chat', label: '聊天', description: '最近聊天', icon: MessageCircle },
  { id: 'role', label: '角色', description: '角色管理', icon: UserRound },
  { id: 'model', label: '模型', description: '模型配置', icon: SlidersHorizontal },
  { id: 'memory', label: '记忆', description: '记忆系统', icon: Brain },
  { id: 'settings', label: '设置', description: '应用设置', icon: Settings },
]

export const channelRows = [
  { id: 'group:cp-tea', title: '三对CP茶会', text: '六位角色都在这里，当前可拉起本地群聊', time: '今天', avatar: '群', badge: '6' },
  { id: 'group:yuri-room', title: '百合创作小屋', text: '只保留项目需要的群聊入口', time: '星期六', avatar: '百', badge: '' },
]

const appRows: AppPaneRow[] = [
  { title: '模型管理', text: 'URL、API Key、官方或第三方协议', icon: SlidersHorizontal, view: 'model' as AppView },
  { title: '记忆管理', text: '长期记忆、关系记忆、世界观资料', icon: Brain, view: 'memory' as AppView },
  { title: 'Agent 任务', text: '后台队列、自检和任务推进状态', icon: ListTodo, view: 'tasks' as AppView },
  { title: '设置中心', text: '不属于聊天、角色、模型、记忆的入口都放这里', icon: Settings, view: 'settings' as AppView },
]

const featureRowsByView: Partial<Record<AppView, AppPaneRow[]>> = {
  model: [
    { title: '模型接入', text: 'Base URL、API Key、当前模型', icon: SlidersHorizontal, view: 'model', active: true },
    { title: '一键巡检', text: '云端、模型档案、聊天响应', icon: ListTodo, view: 'model' },
    { title: '已保存模型', text: '统一入口，后续可切换供应商', icon: Brain, view: 'model' },
    { title: '生成参数', text: '温度、回复上限、短期记忆', icon: Settings, view: 'model' },
  ],
  memory: [
    { title: '记忆空间', text: '长期记忆、关系记忆、世界观', icon: Brain, view: 'memory', active: true },
    { title: '调用痕迹', text: '查看每轮聊天用到的记忆', icon: ListTodo, view: 'memory' },
    { title: '记忆整理', text: '合并、确认、降噪和冲突处理', icon: SlidersHorizontal, view: 'memory' },
    { title: '回收站', text: '误删内容可以先从这里找回', icon: Settings, view: 'trash' },
  ],
  settings: [
    { title: '外观与输入', text: '主题、字号、回车发送', icon: Settings, view: 'settings', active: true },
    { title: '数据同步', text: '账号云端、导入导出、备份', icon: SlidersHorizontal, view: 'settings' },
    { title: '保留策略', text: '回收站保存天数和清理规则', icon: ListTodo, view: 'settings' },
    { title: '关于应用', text: 'Yuri Chat 的基础信息', icon: Brain, view: 'settings' },
  ],
  trash: [
    { title: '回收站', text: '被删除的聊天、记忆和世界观节点', icon: Settings, view: 'trash', active: true },
    { title: '记忆管理', text: '返回长期记忆整理页面', icon: Brain, view: 'memory' },
  ],
}

export function getFeatureRows(view: AppView): AppPaneRow[] {
  return featureRowsByView[view] ?? appRows
}

export function characterThreadTime(index: number, active: boolean) {
  if (active) return '昨天20:21'
  return ['星期三', '03/19', '03/18', '03/18', '03/16', '02/25', '02/23'][index % 7]
}

export function formatThreadTime(value?: string, fallback = '今天') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function getLastConversationText(conversation?: ConversationState, fallback = '还没有聊天记录') {
  const lastMessage = conversation?.messages.at(-1)
  if (!lastMessage?.content) return fallback
  return lastMessage.content.replace(/\s+/g, ' ').slice(0, 28)
}

export function getUnreadCount(conversation?: ConversationState) {
  return Math.max(0, conversation?.unreadCount ?? 0)
}

export function formatUnreadBadge(count: number) {
  if (count <= 0) return ''
  return count > 99 ? '99+' : String(count)
}

export function isGroupCharacter(character: CharacterCard) {
  return character.relationship === '群聊'
}
