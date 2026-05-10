import { useEffect, useRef, useState } from 'react'
import type { AppSettings, ChatMessageVoice, SendMessageOptions } from '../../domain/types'

export type ToolPanel = 'emoji' | 'sticker' | 'more' | null
export type RecordingPurpose = 'message' | 'call'

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

interface UseChatPhoneMediaInput {
  draft: string
  settings: AppSettings
  onDraftChange: (value: string) => void
  onSend: (options?: SendMessageOptions) => void | Promise<void>
  onShellAction?: (message: string) => void
}

const maxRecordingMs = 45_000

export function useChatPhoneMedia({
  draft,
  settings,
  onDraftChange,
  onSend,
  onShellAction,
}: UseChatPhoneMediaInput) {
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

  function togglePanel(panel: Exclude<ToolPanel, null>) {
    setActivePanel((current) => (current === panel ? null : panel))
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

  return {
    activePanel,
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
    appendAttachmentLabel,
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('语音文件读取失败'))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsDataURL(blob)
  })
}

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
