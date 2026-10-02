import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'

// A modal dialog (ui-spec.md §12): labelled by its title, keeps focus
// inside while open, and returns it to the control that opened it. Escape
// calls `onDismiss`, and so does the backdrop when `dismissOnBackdrop` is
// set; a dialog given no `onDismiss` closes only by its own buttons.
export function Dialog({
  title,
  children,
  onDismiss,
  dismissOnBackdrop = false,
  className = '',
}: {
  title: string
  children: ReactNode
  onDismiss?: () => void
  dismissOnBackdrop?: boolean
  className?: string
}) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  // Taken as the dialog first renders, before any effect inside it can move
  // the focus.
  const [opener] = useState(() => document.activeElement)

  useEffect(() => {
    const dialog = dialogRef.current!
    ;(dialog.querySelector<HTMLElement>(FOCUSABLE) ?? dialog).focus()

    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [opener])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      // A dialog opened over another one is the only one Escape closes.
      event.stopPropagation()
      onDismiss?.()
      return
    }
    if (event.key !== 'Tab') return

    const focusable = [...dialogRef.current!.querySelectorAll<HTMLElement>(FOCUSABLE)]
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const outside = !dialogRef.current!.contains(document.activeElement)
    if (!first) {
      event.preventDefault()
    } else if (event.shiftKey && (document.activeElement === first || outside)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (document.activeElement === last || outside)) {
      event.preventDefault()
      first.focus()
    }
  }

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (dismissOnBackdrop && event.target === event.currentTarget) onDismiss?.()
  }

  return (
    <div className="tk-dialog-backdrop" onClick={handleBackdropClick} onKeyDown={handleKeyDown}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`tk-dialog card ${className}`}
      >
        <div className="card-body">
          <h2 id={titleId} className="h5 mb-3">
            {title}
          </h2>
          {children}
        </div>
      </div>
    </div>
  )
}

// Confirmation dialog (ui-spec.md §2.3): what will happen, a Cancel, and a
// confirm button that is Destructive when the action is. Cancel, Escape,
// and the backdrop all dismiss it and send no request.
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string
  children: ReactNode
  confirmLabel: string
  destructive?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog title={title} onDismiss={busy ? undefined : onCancel} dismissOnBackdrop>
      <p>{children}</p>
      <div className="tk-dialog__actions">
        <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={`btn ${destructive ? 'btn-outline-danger' : 'btn-primary'}`}
          disabled={busy}
          aria-busy={busy}
          onClick={onConfirm}
        >
          {busy && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  )
}
