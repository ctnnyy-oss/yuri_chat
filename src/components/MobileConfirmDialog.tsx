import { AlertTriangle } from 'lucide-react'

interface MobileConfirmDialogProps {
  title: string
  message: string
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function MobileConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = '取消',
  danger = false,
  onCancel,
  onConfirm,
}: MobileConfirmDialogProps) {
  return (
    <div className="app-confirm-backdrop" role="presentation" onClick={onCancel}>
      <section
        aria-labelledby="app-confirm-title"
        aria-modal="true"
        className={`app-confirm-dialog ${danger ? 'danger' : ''}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <span className="app-confirm-icon" aria-hidden="true">
          <AlertTriangle size={20} />
        </span>
        <strong id="app-confirm-title">{title}</strong>
        <p>{message}</p>
        <div>
          <button className="app-confirm-cancel" onClick={onCancel} type="button">
            {cancelLabel}
          </button>
          <button className="app-confirm-submit" onClick={onConfirm} type="button">
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}
