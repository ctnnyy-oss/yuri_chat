import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Camera,
  ChevronLeft,
  Image,
  Menu,
  Mic,
  MonitorUp,
  MoreHorizontal,
  Paperclip,
  Phone,
  Plus,
  PlusCircle,
  Send,
  Smile,
  Video,
} from 'lucide-react'
import type {
  AppSettings,
  CharacterCard,
  ChatMessage,
  LongTermMemory,
  MemoryUsageLog,
} from '../domain/types'
import type { MemoryFeedbackAction } from '../services/memoryFeedback'
import { buildMessageMemoryTrace } from '../services/memoryTrace'
import { MessageBubble } from './MessageBubble'
import { MobileStatusBar } from './chat/MobileStatusBar'
import { ChatToolPanels } from './chat/ChatToolPanels'
import { ChatInfoDrawer } from './chat/ChatInfoDrawer'
import { chatSettingRows } from './chat/data'

interface ChatPhoneProps {
  character: CharacterCard
  characters: CharacterCard[]
  activeCharacterId: string
  messages: ChatMessage[]
  memories: LongTermMemory[]
  memoryUsageLogs: MemoryUsageLog[]
  draft: string
  isSending: boolean
  systemAlert?: string
  settings: AppSettings
  onDraftChange: (value: string) => void
  onBackToList?: () => void
  onSelectCharacter: (characterId: string) => void
  onMemoryFeedback: (memoryId: string, action: MemoryFeedbackAction) => void
  onClearConversation: (characterId: string) => void
  onDeleteCharacter: (characterId: string) => boolean
  onSend: () => void
  onShellAction?: (message: string) => void
}

type ToolPanel = 'emoji' | 'sticker' | 'more' | 'info' | 'settings' | null

type BrowserSpeechRecognition = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type SpeechWindow = Window & {
  SpeechRecognition?: new () => BrowserSpeechRecognition
  webkitSpeechRecognition?: new () => BrowserSpeechRecognition
}

export function ChatPhone({
  character,
  characters,
  activeCharacterId,
  messages,
  memories,
  memoryUsageLogs,
  draft,
  isSending,
  systemAlert,
  settings,
  onDraftChange,
  onBackToList,
  onSelectCharacter,
  onMemoryFeedback,
  onClearConversation,
  onDeleteCharacter,
  onSend,
  onShellAction,
}: ChatPhoneProps) {
  const [activePanel, setActivePanel] = useState<ToolPanel>(null)
  const messageListRef = useRef<HTMLDivElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null)
  const traceByAssistantMessageId = useMemo(() => {
    return new Map(
      memoryUsageLogs
        .filter((log) => log.assistantMessageId)
        .map((log) => [log.assistantMessageId as string, buildMessageMemoryTrace(log, memories)]),
    )
  }, [memories, memoryUsageLogs])
  const settingRows = chatSettingRows

  function togglePanel(panel: Exclude<ToolPanel, null>) {
    setActivePanel((current) => (current === panel ? null : panel))
  }

  function insertLineBreak(textarea: HTMLTextAreaElement) {
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const nextDraft = `${draft.slice(0, start)}\n${draft.slice(end)}`
    onDraftChange(nextDraft)

    requestAnimationFrame(() => {
      textarea.selectionStart = start + 1
      textarea.selectionEnd = start + 1
    })
  }

  function appendAttachmentLabel(label: string, file?: File) {
    if (!file) return
    const prefix = draft.trim() ? '\n' : ''
    onDraftChange(`${draft}${prefix}【${label}：${file.name}】`)
    onShellAction?.(`${label}已放进输入框，可以补一句说明再发送`)
  }

  function startVoiceInput() {
    const SpeechRecognition =
      (window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition
    if (!SpeechRecognition) {
      onShellAction?.('当前浏览器不支持网页语音输入，可以先用手机键盘自带语音')
      return
    }

    recognitionRef.current?.stop()
    const recognition = new SpeechRecognition()
    recognition.lang = 'zh-CN'
    recognition.interimResults = false
    recognition.continuous = false
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? '')
        .join('')
        .trim()
      if (!transcript) return
      const prefix = draft.trim() ? ' ' : ''
      onDraftChange(`${draft}${prefix}${transcript}`)
    }
    recognition.onerror = () => onShellAction?.('语音输入没有接通，检查一下浏览器麦克风权限')
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null
    }
    recognitionRef.current = recognition
    recognition.start()
    onShellAction?.('正在听妹妹说话...')
  }

  useEffect(() => {
    messageListRef.current?.scrollTo({
      top: messageListRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, isSending, systemAlert])

  return (
    <main className="workspace chat-workspace">
      <MobileStatusBar />
      <header
        className="chat-topbar"
        onClick={(event) => {
          const actionButton = (event.target as HTMLElement).closest('.chat-topbar-actions button')
          if (!actionButton || actionButton.classList.contains('mobile-menu-button')) return
          onShellAction?.('通话、视频和协作入口已保留，后续接入实时模型能力')
        }}
        style={{ '--avatar-accent': character.accent } as CSSProperties}
      >
        <button aria-label="返回消息" className="mobile-chat-back" onClick={onBackToList} type="button">
          <ChevronLeft size={34} />
        </button>
        <div className="chat-topbar-main">
          <span className="chat-topbar-avatar">{character.avatar}</span>
          <div className="chat-topbar-text">
            <strong>{character.name}</strong>
            <span>{character.subtitle || character.title}</span>
          </div>
          <select
            aria-label="切换聊天角色"
            className="chat-character-select"
            onChange={(event) => onSelectCharacter(event.target.value)}
            value={activeCharacterId}
          >
            {characters.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <div className="chat-topbar-actions" aria-label="聊天工具">
          <button aria-label="语音通话" title="语音通话" type="button">
            <Phone size={20} />
          </button>
          <button aria-label="视频通话" title="视频通话" type="button">
            <Video size={20} />
          </button>
          <button aria-label="屏幕分享" title="屏幕分享" type="button">
            <MonitorUp size={20} />
          </button>
          <button aria-label="发起协作" title="发起协作" type="button">
            <PlusCircle size={21} />
          </button>
          <button aria-label="更多" title="更多" type="button">
            <MoreHorizontal size={22} />
          </button>
          <button
            aria-label="聊天信息"
            className="mobile-menu-button"
            onClick={() => togglePanel('info')}
            title="聊天信息"
            type="button"
          >
            <Menu size={30} />
          </button>
        </div>
      </header>

      <div className="message-list" ref={messageListRef}>
        <div className="message-column">
          {systemAlert && (
            <div className="chat-system-banner" role="status">
              <strong>系统提示</strong>
              <span>{systemAlert}</span>
            </div>
          )}
          {messages.map((message, index) => (
            <MessageBubble
              key={message.id}
              message={message}
              character={character}
              previousMessage={messages[index - 1] ?? null}
              showDevTrace={settings.showDevTrace}
              memoryTrace={message.role === 'assistant' ? traceByAssistantMessageId.get(message.id) : undefined}
              onMemoryFeedback={onMemoryFeedback}
            />
          ))}
          {isSending && (
            <div className="chat-row chat-row-assistant">
              <span
                className="chat-row-avatar"
                style={{ '--avatar-accent': character.accent } as CSSProperties}
              >
                {character.avatar}
              </span>
              <article className="message message-assistant pending" aria-label="正在输入">
                <span className="typing-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </article>
            </div>
          )}
        </div>
      </div>

      {(activePanel === 'info' || activePanel === 'settings') && (
        <ChatInfoDrawer
          panel={activePanel}
          character={character}
          characters={characters}
          settingRows={settingRows}
          onClose={() => setActivePanel(null)}
          onOpenSettings={() => setActivePanel('settings')}
          onBackToInfo={() => setActivePanel('info')}
          onClearConversation={onClearConversation}
          onDeleteCharacter={onDeleteCharacter}
        />
      )}

      <form
        className={`composer ${activePanel ? 'with-tool-panel' : ''}`}
        onSubmit={(event) => {
          event.preventDefault()
          onSend()
        }}
      >
        <div className="composer-entry">
          <textarea
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.nativeEvent.isComposing) return

              if (settings.enterToSend) {
                if (event.ctrlKey || event.metaKey) {
                  event.preventDefault()
                  insertLineBreak(event.currentTarget)
                  return
                }

                if (event.shiftKey) return
                event.preventDefault()
                onSend()
                return
              }

              if (event.ctrlKey || event.metaKey) {
                event.preventDefault()
                onSend()
              }
            }}
            onChange={(event) => onDraftChange(event.target.value)}
            onFocus={() => {
              if (activePanel !== 'info' && activePanel !== 'settings') setActivePanel(null)
            }}
            placeholder=""
            rows={1}
            value={draft}
          />
          <button aria-label="发送" className="composer-send" disabled={!draft.trim() || isSending} type="submit">
            <span>发送</span>
            <Send size={18} />
          </button>
        </div>
        <div className="composer-toolbar" aria-label="快捷工具">
          <button aria-label="语音" className="composer-tool" onClick={startVoiceInput} title="语音" type="button">
            <Mic size={24} />
          </button>
          <button
            aria-label="图片"
            className="composer-tool"
            onClick={() => galleryInputRef.current?.click()}
            title="图片"
            type="button"
          >
            <Image size={24} />
          </button>
          <button
            aria-label="拍摄"
            className="composer-tool"
            onClick={() => cameraInputRef.current?.click()}
            title="拍摄"
            type="button"
          >
            <Camera size={24} />
          </button>
          <button
            aria-label="文件"
            className="composer-tool"
            onClick={() => fileInputRef.current?.click()}
            title="文件"
            type="button"
          >
            <Paperclip size={23} />
          </button>
          <button
            aria-label="表情"
            className={`composer-tool ${activePanel === 'emoji' ? 'active' : ''}`}
            onClick={() => togglePanel('emoji')}
            title="表情"
            type="button"
          >
            <Smile size={24} />
          </button>
          <button
            aria-label="更多"
            className={`composer-tool ${activePanel === 'more' ? 'active' : ''}`}
            onClick={() => togglePanel('more')}
            title="更多"
            type="button"
          >
            <Plus size={26} />
          </button>
        </div>

        {(activePanel === 'emoji' || activePanel === 'sticker' || activePanel === 'more') && (
          <ChatToolPanels
            panel={activePanel}
            draft={draft}
            onDraftChange={onDraftChange}
            onOpenCamera={() => cameraInputRef.current?.click()}
            onOpenFile={() => fileInputRef.current?.click()}
            onOpenGallery={() => galleryInputRef.current?.click()}
            onShellAction={onShellAction}
          />
        )}
        <input
          accept="image/*"
          className="chat-file-input"
          onChange={(event) => {
            appendAttachmentLabel('图片', event.target.files?.[0])
            event.target.value = ''
          }}
          ref={galleryInputRef}
          type="file"
        />
        <input
          accept="image/*"
          capture="environment"
          className="chat-file-input"
          onChange={(event) => {
            appendAttachmentLabel('拍摄', event.target.files?.[0])
            event.target.value = ''
          }}
          ref={cameraInputRef}
          type="file"
        />
        <input
          className="chat-file-input"
          onChange={(event) => {
            appendAttachmentLabel('文件', event.target.files?.[0])
            event.target.value = ''
          }}
          ref={fileInputRef}
          type="file"
        />
      </form>
    </main>
  )
}
