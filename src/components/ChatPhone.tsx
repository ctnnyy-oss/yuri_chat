import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
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
  ChatMessageVoice,
  LongTermMemory,
  MemoryUsageLog,
  SendMessageOptions,
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
  onSend: (options?: SendMessageOptions) => void | Promise<void>
  onGroupProactive?: () => void
  onDirectProactive?: () => void
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

type RecordingPurpose = 'message' | 'call'

const maxRecordingMs = 45_000

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
  const [activePanel, setActivePanel] = useState<ToolPanel>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [voicePanelOpen, setVoicePanelOpen] = useState(false)
  const [voiceCallOpen, setVoiceCallOpen] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingPurpose, setRecordingPurpose] = useState<RecordingPurpose>('message')
  const [recordingDurationMs, setRecordingDurationMs] = useState(0)
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const [voiceError, setVoiceError] = useState('')
  const messageListRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordingStreamRef = useRef<MediaStream | null>(null)
  const recordingChunksRef = useRef<BlobPart[]>([])
  const recordingStartedAtRef = useRef(0)
  const recordingTimerRef = useRef<number | null>(null)
  const voiceTranscriptRef = useRef('')
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

  function clearRecordingTimer() {
    if (recordingTimerRef.current === null) return
    window.clearInterval(recordingTimerRef.current)
    recordingTimerRef.current = null
  }

  function stopRecordingStream() {
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop())
    recordingStreamRef.current = null
  }

  function startRecordingRecognition() {
    const SpeechRecognition =
      (window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setVoiceError('浏览器没有提供语音转文字；这条可以保存为语音，但角色只能读到文字转写。')
      return
    }

    recognitionRef.current?.stop()
    const recognition = new SpeechRecognition()
    recognition.lang = 'zh-CN'
    recognition.interimResults = false
    recognition.continuous = true
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? '')
        .join('')
        .trim()
      if (!transcript) return
      voiceTranscriptRef.current = transcript
      setVoiceTranscript(transcript)
    }
    recognition.onerror = () => {
      setVoiceError('语音转写没有接通；可以重试，或先用文字发给角色。')
    }
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null
    }
    recognitionRef.current = recognition
    recognition.start()
  }

  async function beginVoiceRecording(purpose: RecordingPurpose) {
    if (!settings.voice.inputEnabled) {
      onShellAction?.('设置里还没有开启语音输入')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setVoiceError('当前浏览器不支持网页录音，可以先用听写输入。')
      return
    }

    try {
      setVoiceError('')
      setVoiceTranscript('')
      voiceTranscriptRef.current = ''
      setRecordingPurpose(purpose)
      recordingChunksRef.current = []
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      recordingStreamRef.current = stream
      recordingStartedAtRef.current = Date.now()
      setRecordingDurationMs(0)
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        clearRecordingTimer()
        stopRecordingStream()
        setIsRecording(false)
      }
      recorder.start()
      setIsRecording(true)
      startRecordingRecognition()
      recordingTimerRef.current = window.setInterval(() => {
        const duration = Date.now() - recordingStartedAtRef.current
        setRecordingDurationMs(duration)
        if (duration >= maxRecordingMs) void finishVoiceRecording(true)
      }, 250)
    } catch {
      setVoiceError('麦克风没有接通，请检查浏览器权限。')
      stopRecordingStream()
      clearRecordingTimer()
      setIsRecording(false)
    }
  }

  async function finishVoiceRecording(send: boolean) {
    const recorder = mediaRecorderRef.current
    recognitionRef.current?.stop()
    recognitionRef.current = null
    if (!recorder || recorder.state === 'inactive') {
      stopRecordingStream()
      clearRecordingTimer()
      setIsRecording(false)
      return
    }

    const chunks = recordingChunksRef.current
    const durationMs = Math.max(recordingDurationMs, Date.now() - recordingStartedAtRef.current)
    await new Promise<void>((resolve) => {
      recorder.addEventListener('stop', () => resolve(), { once: true })
      recorder.stop()
    })
    mediaRecorderRef.current = null
    if (!send) {
      onShellAction?.('语音已取消')
      return
    }

    const transcript = voiceTranscriptRef.current.trim()
    if (!transcript) {
      setVoiceError('这次没有拿到文字转写，先不发给角色；妹妹可以重录或用听写输入。')
      return
    }

    const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
    const voice: ChatMessageVoice = {
      kind: 'recorded',
      dataUrl: await blobToDataUrl(blob),
      mimeType: blob.type || 'audio/webm',
      durationMs,
      transcript,
      createdAt: new Date().toISOString(),
    }
    await onSend({ content: transcript, voice })
    setVoiceTranscript('')
    voiceTranscriptRef.current = ''
    if (recordingPurpose === 'call') onShellAction?.('语音已发出，等角色接话')
  }

  function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('语音文件读取失败'))
      reader.onload = () => resolve(String(reader.result || ''))
      reader.readAsDataURL(blob)
    })
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
    return () => {
      stopCameraStream()
      recognitionRef.current?.stop()
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      stopRecordingStream()
      clearRecordingTimer()
    }
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
          <button aria-label="发送" className="composer-send" disabled={!draft.trim() || isSending} type="submit">
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
              disabled={isSending}
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
              disabled={isSending}
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
                  <button className="primary" disabled={isSending} onClick={() => void beginVoiceRecording('call')} type="button">
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

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
