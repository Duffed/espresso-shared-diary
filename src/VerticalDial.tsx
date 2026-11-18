import { DosePresets } from './DosePresets'
import { useId, useLayoutEffect, useRef, useState } from 'react'
import { formatNumber } from './model'

// Preserve stored sensitivity preferences while making vertical gestures four times finer.
export const verticalDragSlowdown = 4

/** A linear roller: dragging upward increases the value; horizontal motion is ignored. */
export function VerticalDial({ label, value, onChange, min, max, step, perDrag = step * 20, unit = '', basket = false, presetUser, onConfirm, onPresetSelect }: {
  label: string; value: number; onChange: (value: number) => void
  min: number; max: number; step: number; perDrag?: number; unit?: string; basket?: boolean; presetUser?: string; onConfirm?: () => void; onPresetSelect?: (value: number) => void
}) {
  const hint = useId()
  const basketClip = useId().replace(/:/g, '')
  const drag = useRef<{ pointer: number; y: number; value: number; startX: number; startY: number; started: number; moved: boolean; center: boolean } | null>(null)
  const confirmTap = useRef(false)
  const [directOpen, setDirectOpen] = useState(false)
  const [visualValue, setVisualValue] = useState(value)
  const [dragging, setDragging] = useState(false)
  useLayoutEffect(() => { if (!drag.current) setVisualValue(value) }, [value])
  const fill = Math.max(0, Math.min(1, visualValue / max))
  const position = (visualValue - min) / step
  const center = Math.round(position)
  const settle = () => { drag.current = null; setDragging(false); setVisualValue(value) }
  const origin = basket ? 0 : min
  const minimum = basket ? Math.ceil(min / step) * step : min
  const maximum = Number((origin + Math.floor((max - origin) / step + 1e-7) * step).toFixed(6))
  const change = (next: number) => onChange(Number(Math.min(maximum, Math.max(minimum, origin + Math.round((next - origin) / step) * step)).toFixed(6)))
  return <div className={`vertical-control${basket ? ' dose-control' : ''}`}>
    {!basket && <span className="eyebrow">{label}</span>}
    <div className={basket ? "dose-layout" : "roller-layout"}><div className="roller-shell">
      <button type="button" className="roller-button" aria-label={label + ' erhöhen'} disabled={value >= maximum} onClick={() => change(value + step)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 14 5-4 5 4"/></svg></button>
      <div className="vertical-dial" role="slider" tabIndex={0} aria-label={label} aria-orientation="vertical"
        aria-valuemin={min} aria-valuemax={maximum} aria-valuenow={value} aria-valuetext={formatNumber(value) + ' ' + unit} aria-describedby={basket ? undefined : hint}
        onPointerDown={event => {
          if (!event.isPrimary || event.button !== 0 || event.currentTarget.closest('fieldset:disabled')) return
          event.currentTarget.focus({ preventScroll: true })
          event.currentTarget.setPointerCapture(event.pointerId)
          const box = event.currentTarget.querySelector('.dose-value')?.getBoundingClientRect()
          confirmTap.current = false
          drag.current = { pointer: event.pointerId, y: event.clientY, value: visualValue, startX: event.clientX, startY: event.clientY, started: performance.now(), moved: false, center: Boolean(box && event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom) }
          setDragging(true)
        }}
        onPointerMove={event => {
          const active = drag.current
          if (!active || active.pointer !== event.pointerId || event.currentTarget.closest('fieldset:disabled')) return
          if (Math.hypot(event.clientX - active.startX, event.clientY - active.startY) > 8) active.moved = true
          if (active.y === event.clientY || (basket && !active.moved)) return
          active.value = Math.min(maximum, Math.max(min, active.value + (active.y - event.clientY) / (240 * verticalDragSlowdown) * perDrag))
          active.y = event.clientY
          setVisualValue(active.value)
          change(active.value)
        }}
        onPointerUp={event => {
          const active = drag.current
          confirmTap.current = Boolean(active && active.pointer === event.pointerId && active.center && !active.moved && Math.hypot(event.clientX - active.startX, event.clientY - active.startY) <= 8 && performance.now() - active.started < 500)
          settle()
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        }}
        onClick={event => { if (confirmTap.current && onConfirm) { confirmTap.current = false; event.preventDefault(); event.stopPropagation(); onConfirm() } }}
        onPointerCancel={() => { confirmTap.current = false; settle() }}
        onLostPointerCapture={() => { if (drag.current) settle() }}
        onKeyDown={event => {
          if (onConfirm && event.key === 'Enter' && !event.currentTarget.closest('fieldset:disabled')) { event.preventDefault(); onConfirm(); return }
          if (event.currentTarget.closest('fieldset:disabled') || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          change(event.key === 'Home' ? min : event.key === 'End' ? maximum : value + (event.key === 'ArrowUp' ? step : -step))
        }}>
        {basket && <svg className="dose-basket" viewBox="0 7.5 240 180" aria-hidden="true">
          <defs>
            <clipPath id={basketClip}><path d="M38 39H202L183 141Q181 156 166 156H74Q59 156 57 141Z" /></clipPath>
            <linearGradient id={basketClip + '-glass'} x1="0" y1="0" x2="1" y2="1"><stop stopColor="white" stopOpacity=".42"/><stop offset=".35" stopColor="white" stopOpacity=".04"/><stop offset=".7" stopColor="white" stopOpacity=".02"/><stop offset="1" stopColor="white" stopOpacity=".24"/></linearGradient>
          </defs>
          <path className="basket-body" d="M38 39H202L183 141Q181 156 166 156H74Q59 156 57 141Z"/>
          <g clipPath={`url(#${basketClip})`}><rect className="basket-coffee" x="38" y={156 - fill * 112} width="164" height={fill * 112}/><path className="basket-fill-edge" d={`M38 ${156 - fill * 112} Q120 ${150 - fill * 112} 202 ${156 - fill * 112}`} /></g>
          <path className="basket-glass-surface" d="M38 39H202L183 141Q181 156 166 156H74Q59 156 57 141Z" fill={`url(#${basketClip}-glass)`}/>
          <path className="basket-outline" d="M38 39H202L183 141Q181 156 166 156H74Q59 156 57 141Z M31 39H209"/>
          <path className="basket-glass-reflection" d="M48 53L62 126M190 55L177 132"/>
          {Array.from({length:9},(_,i)=><circle key={i} className="basket-hole" cx={80+i*10} cy="146" r="1.2"/>)}
        </svg>}
        {basket && <div className="dose-value" aria-hidden="true"><strong>{formatNumber(value)}</strong><span>{unit}</span></div>}
        <div className="roller-window" aria-hidden="true" />
        <div className="roller-stage" aria-hidden="true"><div className="roller-drum"><div className="roller-rotor" data-dragging={dragging || undefined}>
          {[-2, -1, 0, 1, 2].map(offset => {
            const index = center + offset
            const number = Number((min + index * step).toFixed(6))
            const angle = (position - index) * 40
            return <div key={index} className="roller-face" style={{ transform: `rotateX(${angle}deg) translateZ(70px)`, opacity: Math.max(0.12, 1 - Math.abs(angle) / 95) }}><strong>{number >= min && number <= maximum ? formatNumber(number) : '–'}</strong>{unit && <span>{unit}</span>}</div>
          })}
        </div></div></div>
        <span className="roller-ticks" aria-hidden="true" />
      </div>
      <button type="button" className="roller-button" aria-label={label + ' verringern'} disabled={value <= min} onClick={() => change(value - step)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 10 5 4 5-4"/></svg></button>
    </div>
    {basket && presetUser && <DosePresets key={presetUser} user={presetUser} value={value} min={min} max={maximum} onChange={amount => { change(amount); onPresetSelect?.(amount) }} directOpen={directOpen} onDirectToggle={() => setDirectOpen(!directOpen)} />}
    </div>
    {!basket && <small id={hint} className="roller-hint">Hochziehen: mehr · runter: weniger</small>}
    {basket && directOpen && <label className="dose-direct-input">Dosis direkt<input aria-label={label + ' direkt'} type="number" inputMode="decimal" min={min} max={max} step={step} value={value} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); setDirectOpen(false) } }} onChange={event => { if (event.target.value !== '' && Number.isFinite(event.target.valueAsNumber)) change(event.target.valueAsNumber) }} /></label>}
    {!basket && <details className="precise"><summary>Wert direkt eingeben</summary><input aria-label={label + ' direkt'} type="number" inputMode={Number.isInteger(step) && Number.isInteger(min) ? 'numeric' : 'decimal'} min={min} max={max} step={step} value={value}
      onChange={event => { if (event.target.value !== '' && Number.isFinite(event.target.valueAsNumber)) change(event.target.valueAsNumber) }} /></details>}
  </div>
}
