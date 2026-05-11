import { Sparkles } from 'lucide-react'
import type { AppSettings } from '../../domain/types'

interface ChatBehaviorSettingsProps {
  onUpdateSettings: (settings: AppSettings) => void
  settings: AppSettings
}

export function ChatBehaviorSettings({ onUpdateSettings, settings }: ChatBehaviorSettingsProps) {
  const groupProactiveTurnsUnlimited = settings.groupChatMaxProactiveTurns < 0
  const groupProactiveTurnsValue = groupProactiveTurnsUnlimited
    ? 12
    : clampProactiveTurns(settings.groupChatMaxProactiveTurns)

  function updateGroupProactiveTurns(value: number) {
    onUpdateSettings({ ...settings, groupChatMaxProactiveTurns: clampProactiveTurns(value) })
  }

  return (
    <div className="settings-section">
      <div className="settings-section-title">
        <Sparkles size={18} />
        <span>聊天显示</span>
      </div>
      <label className="toggle-row">
        <span>
          <strong>显示 Agent 调试信息</strong>
          <small>开启后聊天气泡内会显示 Agent 工具和记忆调用详情</small>
        </span>
        <input
          checked={settings.showDevTrace}
          onChange={(event) => onUpdateSettings({ ...settings, showDevTrace: event.target.checked })}
          type="checkbox"
        />
      </label>
      <label className="toggle-row">
        <span>
          <strong>拟真私聊响应</strong>
          <small>私聊里角色会判断是否自然回复；短句可能已读不回，明确求助仍会接住</small>
        </span>
        <input
          checked={settings.directChatHumanMode}
          onChange={(event) => onUpdateSettings({ ...settings, directChatHumanMode: event.target.checked })}
          type="checkbox"
        />
      </label>
      <label className="toggle-row">
        <span>
          <strong>角色主动私聊</strong>
          <small>私聊空闲时，角色可能主动发来一条消息，最多连续一轮</small>
        </span>
        <input
          checked={settings.directChatProactiveMode}
          onChange={(event) => onUpdateSettings({ ...settings, directChatProactiveMode: event.target.checked })}
          type="checkbox"
        />
      </label>
      <label className="toggle-row">
        <span>
          <strong>拟真群聊响应</strong>
          <small>群成员会各自判断是否接话；成员越多，模型消耗越高</small>
        </span>
        <input
          checked={settings.groupChatHumanMode}
          onChange={(event) => onUpdateSettings({ ...settings, groupChatHumanMode: event.target.checked })}
          type="checkbox"
        />
      </label>
      <label className="toggle-row">
        <span>
          <strong>群成员主动发言</strong>
          <small>群聊空闲时，成员会随机起话题或互相接话；想省额度可以关掉</small>
        </span>
        <input
          checked={settings.groupChatProactiveMode}
          onChange={(event) => onUpdateSettings({ ...settings, groupChatProactiveMode: event.target.checked })}
          type="checkbox"
        />
      </label>
      <label className="range-control">
        <span>
          <strong>自发续聊轮数</strong>
          <small>{groupProactiveTurnsUnlimited ? '无限' : `${groupProactiveTurnsValue} 轮`}</small>
        </span>
        <input
          disabled={!settings.groupChatProactiveMode || groupProactiveTurnsUnlimited}
          max="999"
          min="0"
          onChange={(event) => updateGroupProactiveTurns(Number(event.target.value))}
          step="1"
          type="number"
          value={groupProactiveTurnsValue}
        />
      </label>
      <label className="toggle-row">
        <span>
          <strong>无限续聊</strong>
          <small>页面开着时，群成员可以一直慢慢聊下去，模型额度消耗会更高</small>
        </span>
        <input
          checked={groupProactiveTurnsUnlimited}
          disabled={!settings.groupChatProactiveMode}
          onChange={(event) => onUpdateSettings({
            ...settings,
            groupChatMaxProactiveTurns: event.target.checked ? -1 : 2,
          })}
          type="checkbox"
        />
      </label>
      <label className="range-control">
        <span>
          <strong>每轮最多接话人数</strong>
          <small>{settings.groupChatMaxAutoReplies} 位</small>
        </span>
        <input
          max="4"
          min="1"
          onChange={(event) => onUpdateSettings({ ...settings, groupChatMaxAutoReplies: Number(event.target.value) })}
          step="1"
          type="range"
          value={settings.groupChatMaxAutoReplies}
        />
      </label>
    </div>
  )
}

function clampProactiveTurns(value: number): number {
  const normalized = Number.isFinite(value) ? Math.trunc(value) : 2
  return Math.min(999, Math.max(0, normalized))
}
