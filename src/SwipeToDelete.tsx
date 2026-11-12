import { useRef, useState, type ReactNode } from 'react'
import { TrashIcon } from './Icons'

export function SwipeToDelete({ enabled, onDelete, children }: { enabled: boolean; onDelete: () => void; children: ReactNode }) {
  const gesture = useRef<{ id: number; x: number; y: number; horizontal: boolean } | null>(null)
  const suppressClick = useRef(false)
  const [offset, setOffset] = useState(0)
  return <div className="swipe-entry" data-enabled={enabled || undefined}
    onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false } }}
    onPointerDown={event => {
      suppressClick.current = false
      if (!enabled || !event.isPrimary || event.button !== 0 || (event.target as Element).closest('button, a, input, select, textarea, summary')) return
      gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, horizontal: false }
    }}
    onPointerMove={event => {
      const start = gesture.current
      if (!start || start.id !== event.pointerId) return
      const dx = event.clientX - start.x, dy = event.clientY - start.y
      if (!start.horizontal) {
        if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) { gesture.current = null; return }
        if (Math.abs(dx) < 12 || Math.abs(dx) <= Math.abs(dy)) return
        start.horizontal = true
        event.currentTarget.setPointerCapture(event.pointerId)
      }
      suppressClick.current = true
      setOffset(Math.max(-140, Math.min(0, dx)))
    }}
    onPointerUp={event => {
      const start = gesture.current
      if (!start || start.id !== event.pointerId) return
      gesture.current = null; setOffset(0)
      if (start.horizontal && event.clientX - start.x <= -90) onDelete()
    }}
    onPointerCancel={() => { gesture.current = null; setOffset(0) }}
    onLostPointerCapture={event => {
      // Touch starts with implicit capture on a child. Ignore that child's loss
      // when capture is transferred to this wrapper for horizontal dragging.
      if (event.target === event.currentTarget) { gesture.current = null; setOffset(0) }
    }}>
    {enabled && <div className="swipe-delete-hint" style={{ visibility: offset < 0 ? 'visible' : 'hidden' }} aria-hidden="true"><TrashIcon /></div>}
    <div className="swipe-entry-content" style={{ transform: `translateX(${offset}px)` }}>{children}</div>
  </div>
}
