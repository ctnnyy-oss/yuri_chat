// ChatPhone 底部输入区上方的三个工具面板：表情、贴纸、更多

import { Laugh, Search, Smile, Star } from 'lucide-react'
import { emojiRows, stickers, moreTools } from './data'

interface ChatToolPanelsProps {
  panel: 'emoji' | 'sticker' | 'more'
  draft: string
  onDraftChange: (next: string) => void
  onOpenCamera?: () => void
  onOpenFile?: () => void
  onOpenGallery?: () => void
  onShellAction?: (message: string) => void
}

export function ChatToolPanels({
  panel,
  draft,
  onDraftChange,
  onOpenCamera,
  onOpenFile,
  onOpenGallery,
  onShellAction,
}: ChatToolPanelsProps) {
  function handleMoreTool(label: string) {
    if (label === '相册') {
      onOpenGallery?.()
      return
    }
    if (label === '拍摄') {
      onOpenCamera?.()
      return
    }
    if (label === '文件') {
      onOpenFile?.()
      return
    }
    onShellAction?.(`${label}入口已保留，后续接入真实功能`)
  }

  return (
    <section className="chat-tool-panel" aria-label="聊天工具面板">
      {panel === 'emoji' && (
        <>
          <h3>最近使用</h3>
          <div className="emoji-grid">
            {emojiRows.map((emoji) => (
              <button key={emoji} onClick={() => onDraftChange(`${draft}${emoji}`)} type="button">
                {emoji}
              </button>
            ))}
          </div>
          <h3>超级表情</h3>
          <div className="emoji-grid compact">
            {emojiRows.slice(6).map((emoji) => (
              <button key={`super-${emoji}`} onClick={() => onDraftChange(`${draft}${emoji}`)} type="button">
                {emoji}
              </button>
            ))}
            <button type="button">...</button>
          </div>
          <div className="emoji-tabs">
            <Search size={23} />
            <Smile size={23} />
            <Laugh size={23} />
            <Star size={23} />
            <b>GIF</b>
            <b>AI</b>
          </div>
        </>
      )}

      {panel === 'sticker' && (
        <>
          <div className="sticker-grid">
            <button className="sticker-add" type="button">+</button>
            <button className="sticker-add" type="button">☺</button>
            {stickers.map((sticker) => (
              <button key={sticker} onClick={() => onDraftChange(`${draft}${sticker}`)} type="button">
                <span>{sticker}</span>
              </button>
            ))}
          </div>
          <div className="emoji-tabs">
            <Search size={23} />
            <Smile size={23} />
            <Laugh size={23} />
            <Star size={23} />
            <b>GIF</b>
            <b>AI</b>
          </div>
        </>
      )}

      {panel === 'more' && (
        <div className="more-tool-grid">
          {moreTools.map((tool) => {
            const Icon = tool.icon
            return (
              <button
                key={tool.label}
                onClick={() => handleMoreTool(tool.label)}
                type="button"
              >
                <Icon size={24} />
                <span>{tool.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
