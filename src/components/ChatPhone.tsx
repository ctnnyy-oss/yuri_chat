import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef } from 'react'
import {
  Camera,
  ChevronLeft,
  Image,
  Mic,
  Paperclip,
  PhoneCall,
  Plus,
  Send,
  Smile,
  Sparkles,
  Square,
  X,
} from 'lucide-react'
import type {
  AppSettings,
  CharacterCard,
  ChatMessage,
  LongTermMemory,
  MemoryUsageLog,
  SendMessageOptions,
} from '../domain/types'
import type { MemoryFeedbackAction } from '../services/memoryFeedback'
import { buildMessageMemoryTrace } from '../services/memoryTrace'
import { MessageBubble } from './MessageBubble'
import { MobileStatusBar } from './chat/MobileStatusBar'
import { ChatToolPanels } from './chat/ChatToolPanels'
import { formatDuration, useChatPhoneMedia } from './chat/useChatPhoneMedia'

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
  onSend: (options?: SendMessageOptions) => void | Promise<void>
  onGroupProactive?: () => void
  onDirectProactive?: () => void
  onShellAction?: (message: string) => void
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
  onSend,
  onGroupProactive,
  onDirectProactive,
  onShellAction,
}: ChatPhoneProps) {
  const messageListRef = useRef<HTMLDivElement>(null)
  const {
    activePanel,
    appendAttachmentLabel,
    beginVoiceRecording,
    cameraError,
    cameraInputRef,
    cameraOpen,
    captureCameraFrame,
    closeCameraCapture,
    fileInputRef,
    finishVoiceRecording,
    galleryInputRef,
    isRecording,
    openCameraCapture,
    recordingDurationMs,
    recordingPurpose,
    setActivePanel,
    setVoiceCallOpen,
    setVoicePanelOpen,
    startVoiceInput,
    togglePanel,
    videoRef,
    voiceCallOpen,
    voiceError,
    voicePanelOpen,
    voiceTranscript,
  } = useChatPhoneMedia({
    draft,
    settings,
    onDraftChange,
    onSend,
    onShellAction,
  })
  const latestAssistantMessageId = useMemo(() => {
    return [...messages].reverse().find((message) => message.role === 'assistant')?.id ?? ''
  }, [messages])
  const traceByAssistantMessageId = useMemo(() => {
    return new Map(
      memoryUsageLogs
        .filter((log) => log.assistantMessageId)
        .map((log) => [log.assistantMessageId as string, buildMessageMemoryTrace(log, memories)]),
    )
  }, [memories, memoryUsageLogs])
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
        {settings.voice.callModeEnabled && (
          <div className="chat-topbar-actions">
            <button aria-label="语音通话" onClick={() => setVoiceCallOpen(true)} title="语音通话" type="button">
              <PhoneCall size={20} />
            </button>
          </div>
        )}
      </header>

      <div className="message-list" ref={messageListRef}>
        <div className="message-column">
          {systemAlert && (
            <div className="chat-system-banner" role="status">
              <strong>系统提示</strong>
              <span>{systemAlert}</span>
            </div>
          )}
          {messages.length === 0 && <ChatEmptyState character={character} />}
          {messages.map((message, index) => (
            <MessageBubble
              key={message.id}
              message={message}
              character={character}
              characters={characters}
              previousMessage={messages[index - 1] ?? null}
              showDevTrace={settings.showDevTrace}
              settings={settings}
              autoPlayVoice={
                message.id === latestAssistantMessageId &&
                (voiceCallOpen || settings.voice.autoPlayAssistantVoice)
              }
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

      <form
        className={`composer ${activePanel || voicePanelOpen ? 'with-tool-panel' : ''}`}
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
              if (activePanel) setActivePanel(null)
            }}
            placeholder=""
            rows={1}
            value={draft}
          />
          <button aria-label="发送" className="composer-send" disabled={!draft.trim()} type="submit">
            <span>发送</span>
            <Send size={18} />
          </button>
        </div>
        <div className="composer-toolbar" aria-label="快捷工具">
          <button
            aria-label="语音"
            className={`composer-tool ${voicePanelOpen ? 'active' : ''}`}
            onClick={() => {
              setActivePanel(null)
              setVoicePanelOpen((open) => !open)
            }}
            title="语音"
            type="button"
          >
            <Mic size={24} />
          </button>
          {onGroupProactive && (
            <button
              aria-label="让群里自己聊"
              className="composer-tool group-proactive-tool"
              onClick={onGroupProactive}
              title="让群里自己聊"
              type="button"
            >
              <Sparkles size={23} />
            </button>
          )}
          {onDirectProactive && (
            <button
              aria-label="让她主动说话"
              className="composer-tool direct-proactive-tool"
              onClick={onDirectProactive}
              title="让她主动说话"
              type="button"
            >
              <Sparkles size={23} />
            </button>
          )}
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
            onClick={openCameraCapture}
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

        {voicePanelOpen && (
          <section className="chat-tool-panel voice-tool-panel" aria-label="语音工具">
            <div className="voice-tool-head">
              <strong>语音</strong>
              <span>{isRecording ? formatDuration(recordingDurationMs) : '录音会同时转成文字给角色理解'}</span>
            </div>
            <div className="voice-transcript-preview">
              {voiceTranscript || (isRecording ? '正在听妹妹说话...' : '可以录一条语音消息，也可以只听写到输入框。')}
            </div>
            {voiceError && <p className="voice-error">{voiceError}</p>}
            <div className="voice-tool-actions">
              {isRecording && recordingPurpose === 'message' ? (
                <>
                  <button className="voice-record-button danger" onClick={() => void finishVoiceRecording(false)} type="button">
                    <X size={18} />
                    取消
                  </button>
                  <button className="voice-record-button primary" onClick={() => void finishVoiceRecording(true)} type="button">
                    <Square size={17} />
                    发送语音
                  </button>
                </>
              ) : (
                <button
                  className="voice-record-button primary"
                  disabled={isRecording}
                  onClick={() => void beginVoiceRecording('message')}
                  type="button"
                >
                  <Mic size={18} />
                  录语音消息
                </button>
              )}
              <button className="voice-record-button" disabled={isRecording} onClick={startVoiceInput} type="button">
                <Mic size={18} />
                听写到输入框
              </button>
            </div>
          </section>
        )}

        {(activePanel === 'emoji' || activePanel === 'sticker' || activePanel === 'more') && (
          <ChatToolPanels
            panel={activePanel}
            draft={draft}
            onDraftChange={onDraftChange}
            onOpenCamera={openCameraCapture}
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
        {voiceCallOpen && (
          <div className="voice-call-layer" role="dialog" aria-label={`与${character.name}语音通话`}>
            <section className="voice-call-panel" style={{ '--avatar-accent': character.accent } as CSSProperties}>
              <button aria-label="关闭语音通话" className="voice-call-close" onClick={() => setVoiceCallOpen(false)} type="button">
                <X size={22} />
              </button>
              <span className="voice-call-avatar">{character.avatar}</span>
              <strong>{character.name}</strong>
              <small>{isRecording && recordingPurpose === 'call' ? `正在收音 ${formatDuration(recordingDurationMs)}` : '回合式语音通话'}</small>
              <p>{voiceTranscript || (isRecording && recordingPurpose === 'call' ? '姐姐正在听...' : '点麦克风说一句，结束后角色会按聊天记忆接话并朗读。')}</p>
              {voiceError && <em>{voiceError}</em>}
              <div className="voice-call-actions">
                {isRecording && recordingPurpose === 'call' ? (
                  <>
                    <button onClick={() => void finishVoiceRecording(false)} type="button">
                      <X size={20} />
                      取消
                    </button>
                    <button className="primary" onClick={() => void finishVoiceRecording(true)} type="button">
                      <Square size={18} />
                      结束并发送
                    </button>
                  </>
                ) : (
                  <button className="primary" onClick={() => void beginVoiceRecording('call')} type="button">
                    <Mic size={22} />
                    开始说话
                  </button>
                )}
              </div>
            </section>
          </div>
        )}
        {cameraOpen && (
          <div className="camera-capture-layer" role="dialog" aria-label="拍摄照片">
            <section className="camera-capture-panel">
              <video ref={videoRef} playsInline muted />
              {cameraError && <p>{cameraError}</p>}
              <div>
                <button onClick={closeCameraCapture} type="button">取消</button>
                <button onClick={captureCameraFrame} type="button">拍摄</button>
              </div>
            </section>
          </div>
        )}
      </form>
    </main>
  )
}

function ChatEmptyState({ character }: { character: CharacterCard }) {
  const isGroup = character.relationship === '群聊'
  return (
    <div className="chat-empty-state" style={{ '--avatar-accent': character.accent } as CSSProperties}>
      <span>{character.avatar}</span>
      <strong>{character.name}</strong>
      <p>{isGroup ? character.mood || '群聊刚建好，成员们还在等第一句话。' : character.greeting || character.title}</p>
    </div>
  )
}
