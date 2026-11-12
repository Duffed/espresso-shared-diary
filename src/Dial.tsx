import { useRef, type CSSProperties } from 'react'
import { formatNumber } from './model'

export function Dial({ label, value, onChange, min = 0, max = 100, step = 0.1, unit = '' }: {
  label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; unit?: string
}) {
  const drag = useRef<{ pointer: number; x: number; value: number; ring: boolean; cx: number; cy: number; angle: number } | null>(null)
  const last = Math.floor((max - min) / step + 1e-7)
  const change = (next: number) => onChange(Number((min + Math.max(0, Math.min(last, Math.round((next - min) / step))) * step).toFixed(6)))
  return <div className="dial-control">
    <span className="eyebrow">{label}</span>
    <div className="dial" role="slider" tabIndex={0} aria-label={label} aria-valuemin={min} aria-valuemax={max}
      aria-valuenow={value} aria-valuetext={`${formatNumber(value)} ${unit}`} style={{ '--angle': `${(value - min) / step * 6 - 135}deg` } as CSSProperties}
      onPointerDown={e => {
        if (!e.isPrimary || e.button !== 0) return
        const box = e.currentTarget.getBoundingClientRect()
        const cx = box.left + box.width / 2, cy = box.top + box.height / 2
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { pointer: e.pointerId, x: e.clientX, value, cx, cy,
          ring: Math.hypot(e.clientX - cx, e.clientY - cy) >= box.width * .28,
          angle: Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI }
      }}
      onPointerMove={e => {
        const active = drag.current
        if (!active || active.pointer !== e.pointerId) return
        if (!active.ring) { change(active.value + (e.clientX - active.x) / 8 * step); return }
        const angle = Math.atan2(e.clientY - active.cy, e.clientX - active.cx) * 180 / Math.PI
        const delta = ((angle - active.angle + 540) % 360) - 180
        active.angle = angle
        active.value = Math.min(min + last * step, Math.max(min, active.value + delta / 6 * step))
        change(active.value)
      }}
      onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }} onLostPointerCapture={() => { drag.current = null }}
      onKeyDown={e => {
        const direction = ['ArrowRight', 'ArrowUp'].includes(e.key) ? 1 : ['ArrowLeft', 'ArrowDown'].includes(e.key) ? -1 : 0
        if (direction || e.key === 'Home' || e.key === 'End') { e.preventDefault(); change(direction ? value + direction * step : e.key === 'Home' ? min : max) }
      }}>
      <div className="dial-ring" /><div className="dial-face"><strong>{formatNumber(value)}</strong><span>{unit || 'Mahlgrad'}</span></div>
    </div>
    <div className="dial-buttons"><button type="button" aria-label={`${label} verringern`} disabled={value <= min} onClick={() => change(value - step)}>−</button>
      <small>Am Rand drehen</small><button type="button" aria-label={`${label} erhöhen`} disabled={value >= min + last * step} onClick={() => change(value + step)}>＋</button></div>
    <details className="precise"><summary>Wert direkt eingeben</summary><input aria-label={`${label} direkt`} type="number" inputMode="decimal" min={min} max={max} step={step} value={value}
      onChange={e => { if (e.target.value !== '' && Number.isFinite(e.target.valueAsNumber)) change(e.target.valueAsNumber) }} /></details>
  </div>
}
