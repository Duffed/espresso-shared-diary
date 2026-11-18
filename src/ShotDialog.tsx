import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function ShotDialog({ title, image, onClose, children }: { title: string; image: ReactNode; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [closing, setClosing] = useState(false)
  const dismiss = () => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) onClose()
    else setClosing(true)
  }
  useEffect(() => {
    if (!closing) return
    const timeout = window.setTimeout(onClose, 220)
    return () => window.clearTimeout(timeout)
  }, [closing, onClose])
  useEffect(() => {
    const element = dialog.current!
    const previous = document.activeElement
    element.showModal()
    return () => { element.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }) }
  }, [])
  return createPortal(<dialog ref={dialog} className="shot-dialog" data-closing={closing || undefined} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); dismiss() }}
    onClick={event => {
      event.stopPropagation()
      if (event.target !== event.currentTarget) return
      const rect = event.currentTarget.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dismiss()
    }}>
    <div className="shot-dialog-heading"><div className="shot-dialog-photo">{image}</div><div className="shot-dialog-title"><small>Bezugsübersicht</small><h2 id={titleId}>{title}</h2></div><button type="button" className="quiet" aria-label="Übersicht schließen" onClick={dismiss} autoFocus><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div>
    {children}
  </dialog>, document.body)
}
