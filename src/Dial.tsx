import { useRef } from 'react'
import { formatNumber } from './model'

export function Dial({ label, value, onChange, onConfirm, min = 0, max = 100, step = 0.1, perRevolution = step * 60, unit = '' }: {
  onConfirm?: () => void
  label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; perRevolution?: number; unit?: string
}) {
  const drag = useRef<{ pointer: number; x: number; y: number; moved: boolean; started: number; value: number; ring: boolean; cx: number; cy: number; angle: number } | null>(null)
  const confirmTap = useRef(false)
  const last = Math.floor((max - min) / step + 1e-7)
  const change = (next: number) => onChange(Number((min + Math.max(0, Math.min(last, Math.round((next - min) / step))) * step).toFixed(6)))
  return <div className="dial-control">
    <span className="eyebrow">{label}</span>
    <div className="dial-adjuster">
    <button type="button" aria-label={`${label} verringern`} disabled={value <= min} onClick={() => change(value - step)}>−</button>
    <div className="dial" role="slider" tabIndex={0} aria-label={label} aria-valuemin={min} aria-valuemax={max}
      aria-valuenow={value} aria-valuetext={`${formatNumber(value)} ${unit}`}
      onPointerDown={e => {
        if (!e.isPrimary || e.button !== 0) return
        confirmTap.current = false
        const box = e.currentTarget.getBoundingClientRect()
        const cx = box.left + box.width / 2, cy = box.top + box.height / 2
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { pointer: e.pointerId, x: e.clientX, y: e.clientY, moved: false, started: performance.now(), value, cx, cy,
          ring: Math.hypot(e.clientX - cx, e.clientY - cy) >= box.width * .28,
          angle: Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI }
      }}
      onPointerMove={e => {
        const active = drag.current
        if (!active || active.pointer !== e.pointerId) return
        if (Math.hypot(e.clientX - active.x, e.clientY - active.y) > 8) active.moved = true
        if (onConfirm && !active.ring && !active.moved) return
        if (!active.ring) { change(active.value + (e.clientX - active.x) / 480 * perRevolution); return }
        const angle = Math.atan2(e.clientY - active.cy, e.clientX - active.cx) * 180 / Math.PI
        const delta = ((angle - active.angle + 540) % 360) - 180
        active.angle = angle
        active.value = Math.min(min + last * step, Math.max(min, active.value + delta / 360 * perRevolution))
        change(active.value)
      }}
      onPointerUp={e => {
        const active = drag.current
        drag.current = null
        confirmTap.current = active?.pointer === e.pointerId && !active.ring && !active.moved && Math.hypot(e.clientX - active.x, e.clientY - active.y) <= 8 && performance.now() - active.started < 500
      }} onPointerCancel={() => { drag.current = null }} onLostPointerCapture={e => { if (e.target === e.currentTarget) drag.current = null }}
      onClick={event => { if (confirmTap.current && onConfirm) { confirmTap.current = false; event.preventDefault(); event.stopPropagation(); onConfirm() } }}
      onKeyDown={e => {
        if (onConfirm && e.key === 'Enter') { e.preventDefault(); onConfirm(); return }
        const direction = ['ArrowRight', 'ArrowUp'].includes(e.key) ? 1 : ['ArrowLeft', 'ArrowDown'].includes(e.key) ? -1 : 0
        if (direction || e.key === 'Home' || e.key === 'End') { e.preventDefault(); change(direction ? value + direction * step : e.key === 'Home' ? min : max) }
      }}>
      <svg className="dial-ring" viewBox="0 0 100 100" fill="none" aria-hidden="true" focusable="false">{Array.from({ length: 60 }, (_, index) => <line key={index} x1="50" y1="2" x2="50" y2={index % 5 === 0 ? 7 : 5} transform={`rotate(${index * 6} 50 50)`} stroke="currentColor" strokeWidth={index % 5 === 0 ? 1.3 : 1} strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}</svg><div className="dial-face"><strong>{formatNumber(value)}</strong><span>{unit || 'Mahlgrad'}</span></div>
      <svg className="dial-pointer" viewBox="0 0 100 100" fill="none" aria-hidden="true" focusable="false"><line x1="50" y1="5" x2="50" y2="10" transform={`rotate(${(value - min) / perRevolution * 360 - 136} 50 50)`} stroke="currentColor" strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" /></svg>
    </div>
    <button type="button" aria-label={`${label} erhöhen`} disabled={value >= min + last * step} onClick={() => change(value + step)}>＋</button>
    </div>
    <details className="precise"><summary>Wert direkt eingeben</summary><input aria-label={`${label} direkt`} type="number" inputMode="decimal" min={min} max={max} step={step} value={value}
      onChange={e => { if (e.target.value !== '' && Number.isFinite(e.target.valueAsNumber)) change(e.target.valueAsNumber) }} /></details>
  </div>
}
