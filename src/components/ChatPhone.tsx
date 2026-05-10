import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Camera,
  ChevronLeft,
  Image,
  Mic,
  Paperclip,
  Plus,
  Send,
  Smile,
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
  onSend: () => void
  onShellAction?: (message: string) => void
}

type ToolPanel = 'emoji' | 'sticker' | 'more' | null

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
  onSend,
  onShellAction,
}: ChatPhoneProps) {
  const [activePanel, setActivePanel] = useState<ToolPanel>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const messageListRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null)
  const traceByAssistantMessageId = useMemo(() => {
    return new Map(
      memoryUsageLogs
        .filter((log) => log.assistantMessageId)
        .map((log) => [log.assistantMessageId as string, buildMessageMemoryTrace(log, memories)]),
    )
  }, [memories, memoryUsageLogs])
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

  function stopCameraStream() {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
    cameraStreamRef.current = null
  }

  function closeCameraCapture() {
    stopCameraStream()
    setCameraOpen(false)
    setCameraError('')
  }

  async function openCameraCapture() {
    setActivePanel(null)
    setCameraError('')

    if (!navigator.mediaDevices?.getUserMedia) {
      cameraInputRef.current?.click()
      return
    }

    try {
      stopCameraStream()
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      cameraStreamRef.current = stream
      setCameraOpen(true)
    } catch {
      onShellAction?.('摄像头没有接通，先为妹妹打开系统拍摄入口')
      cameraInputRef.current?.click()
    }
  }

  function captureCameraFrame() {
    const video = videoRef.current
    if (!video || video.readyState < 2) {
      setCameraError('摄像头还在启动，稍等一下再拍')
      return
    }

    const canvas = document.createElement('canvas')
    const width = video.videoWidth || 1280
    const height = video.videoHeight || 720
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d')?.drawImage(video, 0, 0, width, height)
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setCameraError('这次拍摄没有生成图片，再试一次')
          return
        }
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        const file = new File([blob], `拍摄-${stamp}.jpg`, { type: 'image/jpeg' })
        appendAttachmentLabel('拍摄', file)
        closeCameraCapture()
      },
      'image/jpeg',
      0.92,
    )
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

  useEffect(() => {
    if (!cameraOpen || !videoRef.current || !cameraStreamRef.current) return
    videoRef.current.srcObject = cameraStreamRef.current
    void videoRef.current.play().catch(() => setCameraError('摄像头预览没有启动，请检查浏览器权限'))
  }, [cameraOpen])

  useEffect(() => {
    return () => stopCameraStream()
  }, [])

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
              characters={characters}
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
              if (activePanel) setActivePanel(null)
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
