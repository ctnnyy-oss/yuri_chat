// ChatPhone 底部输入区上方的工具面板：表情、表情包、更多。

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
          <h3>Emoji</h3>
          <div className="emoji-grid">
            {emojiRows.map((emoji) => (
              <button key={emoji} onClick={() => onDraftChange(`${draft}${emoji}`)} type="button">
                {emoji}
              </button>
            ))}
          </div>
          <h3>表情包</h3>
          <div className="sticker-grid sticker-grid-inline">
            {stickers.map((sticker) => (
              <button key={sticker} onClick={() => onDraftChange(`${draft}${sticker}`)} type="button">
                <span>{sticker}</span>
              </button>
            ))}
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
