import { useId, useRef, useState } from 'react'
import { formatNumber } from './model'

export function Dial({ label, value, onChange, onConfirm, min = 0, max = 100, step = 0.1, perRevolution = step * 60, unit = '', recommendation }: {
  recommendation?: { label: string; value?: number; direction?: 1 | -1; origin?: number; context: string }
  onConfirm?: () => void
  label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; perRevolution?: number; unit?: string
}) {
  const auraId = useId().replace(/:/g, '')
  const drag = useRef<{ pointer: number; x: number; y: number; moved: boolean; started: number; value: number; ring: boolean; cx: number; cy: number; angle: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const confirmTap = useRef(false)
  const last = Math.floor((max - min) / step + 1e-7)
  const change = (next: number) => onChange(Number((min + Math.max(0, Math.min(last, Math.round((next - min) / step))) * step).toFixed(6)))
  return <div className="dial-control">
    <span className="eyebrow">{label}</span>
    <div className="dial-adjuster">
    <button type="button" aria-label={`${label} verringern`} disabled={value <= min} onClick={() => change(value - step)}>−</button>
    <div className="dial" data-dragging={dragging || undefined} role="slider" tabIndex={0} aria-label={label} aria-valuemin={min} aria-valuemax={max}
      aria-valuenow={value} aria-valuetext={`${formatNumber(value)} ${unit}`}
      onPointerDown={e => {
        if (!e.isPrimary || e.button !== 0) return
        setDragging(true)
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
        drag.current = null; setDragging(false)
        confirmTap.current = active?.pointer === e.pointerId && !active.ring && !active.moved && Math.hypot(e.clientX - active.x, e.clientY - active.y) <= 8 && performance.now() - active.started < 500
      }} onPointerCancel={() => { drag.current = null; setDragging(false) }} onLostPointerCapture={e => { if (e.target === e.currentTarget) { drag.current = null; setDragging(false) } }}
      onClick={event => { if (confirmTap.current && onConfirm) { confirmTap.current = false; event.preventDefault(); event.stopPropagation(); onConfirm() } }}
      onKeyDown={e => {
        if (onConfirm && e.key === 'Enter') { e.preventDefault(); onConfirm(); return }
        const direction = ['ArrowRight', 'ArrowUp'].includes(e.key) ? 1 : ['ArrowLeft', 'ArrowDown'].includes(e.key) ? -1 : 0
        if (direction || e.key === 'Home' || e.key === 'End') { e.preventDefault(); change(direction ? value + direction * step : e.key === 'Home' ? min : max) }
      }}>
      <svg className="material-dial-shape" viewBox="0 0 100 100" aria-hidden="true" style={{ transform: `rotate(${(value - min) / perRevolution * 90}deg)` }}><path d="M91.000 50.000 L90.888 51.071 L90.562 52.126 L90.052 53.152 L89.401 54.141 L88.666 55.091 L87.909 56.004 L87.191 56.893 L86.565 57.772 L86.073 58.660 L85.739 59.576 L85.570 60.536 L85.552 61.552 L85.655 62.626 L85.833 63.755 L86.031 64.925 L86.193 66.114 L86.262 67.296 L86.191 68.440 L85.945 69.517 L85.507 70.500 L84.875 71.371 L84.065 72.122 L83.110 72.756 L82.052 73.287 L80.941 73.742 L79.828 74.155 L78.762 74.565 L77.780 75.013 L76.910 75.537 L76.163 76.163 L75.537 76.910 L75.013 77.780 L74.565 78.762 L74.155 79.828 L73.742 80.941 L73.287 82.052 L72.756 83.110 L72.122 84.065 L71.371 84.875 L70.500 85.507 L69.517 85.945 L68.440 86.191 L67.296 86.262 L66.114 86.193 L64.925 86.031 L63.755 85.833 L62.626 85.655 L61.552 85.552 L60.536 85.570 L59.576 85.739 L58.660 86.073 L57.772 86.565 L56.893 87.191 L56.004 87.909 L55.091 88.666 L54.141 89.401 L53.152 90.052 L52.126 90.562 L51.071 90.888 L50.000 91.000 L48.929 90.888 L47.874 90.562 L46.848 90.052 L45.859 89.401 L44.909 88.666 L43.996 87.909 L43.107 87.191 L42.228 86.565 L41.340 86.073 L40.424 85.739 L39.464 85.570 L38.448 85.552 L37.374 85.655 L36.245 85.833 L35.075 86.031 L33.886 86.193 L32.704 86.262 L31.560 86.191 L30.483 85.945 L29.500 85.507 L28.629 84.875 L27.878 84.065 L27.244 83.110 L26.713 82.052 L26.258 80.941 L25.845 79.828 L25.435 78.762 L24.987 77.780 L24.463 76.910 L23.837 76.163 L23.090 75.537 L22.220 75.013 L21.238 74.565 L20.172 74.155 L19.059 73.742 L17.948 73.287 L16.890 72.756 L15.935 72.122 L15.125 71.371 L14.493 70.500 L14.055 69.517 L13.809 68.440 L13.738 67.296 L13.807 66.114 L13.969 64.925 L14.167 63.755 L14.345 62.626 L14.448 61.552 L14.430 60.536 L14.261 59.576 L13.927 58.660 L13.435 57.772 L12.809 56.893 L12.091 56.004 L11.334 55.091 L10.599 54.141 L9.948 53.152 L9.438 52.126 L9.112 51.071 L9.000 50.000 L9.112 48.929 L9.438 47.874 L9.948 46.848 L10.599 45.859 L11.334 44.909 L12.091 43.996 L12.809 43.107 L13.435 42.228 L13.927 41.340 L14.261 40.424 L14.430 39.464 L14.448 38.448 L14.345 37.374 L14.167 36.245 L13.969 35.075 L13.807 33.886 L13.738 32.704 L13.809 31.560 L14.055 30.483 L14.493 29.500 L15.125 28.629 L15.935 27.878 L16.890 27.244 L17.948 26.713 L19.059 26.258 L20.172 25.845 L21.238 25.435 L22.220 24.987 L23.090 24.463 L23.837 23.837 L24.463 23.090 L24.987 22.220 L25.435 21.238 L25.845 20.172 L26.258 19.059 L26.713 17.948 L27.244 16.890 L27.878 15.935 L28.629 15.125 L29.500 14.493 L30.483 14.055 L31.560 13.809 L32.704 13.738 L33.886 13.807 L35.075 13.969 L36.245 14.167 L37.374 14.345 L38.448 14.448 L39.464 14.430 L40.424 14.261 L41.340 13.927 L42.228 13.435 L43.107 12.809 L43.996 12.091 L44.909 11.334 L45.859 10.599 L46.848 9.948 L47.874 9.438 L48.929 9.112 L50.000 9.000 L51.071 9.112 L52.126 9.438 L53.152 9.948 L54.141 10.599 L55.091 11.334 L56.004 12.091 L56.893 12.809 L57.772 13.435 L58.660 13.927 L59.576 14.261 L60.536 14.430 L61.552 14.448 L62.626 14.345 L63.755 14.167 L64.925 13.969 L66.114 13.807 L67.296 13.738 L68.440 13.809 L69.517 14.055 L70.500 14.493 L71.371 15.125 L72.122 15.935 L72.756 16.890 L73.287 17.948 L73.742 19.059 L74.155 20.172 L74.565 21.238 L75.013 22.220 L75.537 23.090 L76.163 23.837 L76.910 24.463 L77.780 24.987 L78.762 25.435 L79.828 25.845 L80.941 26.258 L82.052 26.713 L83.110 27.244 L84.065 27.878 L84.875 28.629 L85.507 29.500 L85.945 30.483 L86.191 31.560 L86.262 32.704 L86.193 33.886 L86.031 35.075 L85.833 36.245 L85.655 37.374 L85.552 38.448 L85.570 39.464 L85.739 40.424 L86.073 41.340 L86.565 42.228 L87.191 43.107 L87.909 43.996 L88.666 44.909 L89.401 45.859 L90.052 46.848 L90.562 47.874 L90.888 48.929Z" /></svg>
      <svg className="dial-aura" style={{ transform: `rotate(${(value - min) / perRevolution * 65}deg)` }} viewBox="0 0 100 100" fill="none" aria-hidden="true" focusable="false">
        <defs><linearGradient id={auraId} x1="10%" y1="0%" x2="90%" y2="100%"><stop stopColor="#ffafcf" stopOpacity=".15"/><stop offset=".3" stopColor="#ffbdd7" stopOpacity=".8"/><stop offset=".55" stopColor="#fff0df" stopOpacity=".65"/><stop offset=".8" stopColor="#c8b0f5" stopOpacity=".8"/><stop offset="1" stopColor="#e8d0ff" stopOpacity=".1"/></linearGradient></defs>
        <g stroke={`url(#${auraId})`}>
          <ellipse cx="50" cy="50" rx="31" ry="37" transform="rotate(-35 50 50)" strokeWidth="5"/>
          <ellipse cx="50" cy="50" rx="31" ry="37" transform="rotate(35 50 50)" strokeWidth="3"/>
          <ellipse cx="50" cy="50" rx="34" ry="32" transform="rotate(-20 50 50)" strokeWidth="1"/>
        </g>
        <path d="M24 32 C32 17 53 12 68 26" stroke="#fff" strokeOpacity=".6" strokeWidth=".7" strokeLinecap="round"/>
      </svg>
      <svg className="dial-ring" viewBox="0 0 100 100" fill="none" aria-hidden="true" focusable="false">{Array.from({ length: 60 }, (_, index) => <line key={index} x1="50" y1="2" x2="50" y2={index % 5 === 0 ? 7 : 5} transform={`rotate(${index * 6} 50 50)`} stroke="currentColor" strokeWidth={index % 5 === 0 ? 1.3 : 1} strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}</svg><div className="dial-face"><strong>{formatNumber(value)}</strong><span>{unit || 'Mahlgrad'}</span></div>
      <svg className="dial-pointer" viewBox="0 0 100 100" fill="none" aria-hidden="true" focusable="false"><line x1="50" y1="5" x2="50" y2="10" transform={`rotate(${(value - min) / perRevolution * 360 - 136} 50 50)`} stroke="currentColor" strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" /></svg>
      <svg className="bloom-pointer" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="7" r="2.1" transform={`rotate(${(value - min) / perRevolution * 360 - 136} 50 50)`} fill="#fff8f5" stroke="#ff9bba" strokeWidth="1.2" /></svg>
      {recommendation?.direction && recommendation.origin !== undefined && <svg className="dial-advice-direction" data-direction={recommendation.direction} viewBox="0 0 100 100" fill="none" aria-hidden="true" focusable="false">
        <g transform={`rotate(${(recommendation.origin - min) / perRevolution * 360 - 136} 50 50)`}>
          <g transform={recommendation.direction === -1 ? 'translate(100 0) scale(-1 1)' : undefined} stroke="currentColor" className="direction-arrow-stroke" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path className="classic-direction-path" d="M50 5 A45 45 0 0 1 66 8" vectorEffect="non-scaling-stroke" /><path className="classic-direction-path" d="M62 9.5 L66 8 L64.5 4" vectorEffect="non-scaling-stroke" />
            <path className="glass-direction-path" d="M50 5 A45 45 0 0 1 66 8 M62 9.5 L66 8 L64.5 4" vectorEffect="non-scaling-stroke" />
          </g>
        </g>
      </svg>}
      {recommendation?.value !== undefined && <svg className="dial-recommendation" viewBox="0 0 100 100" aria-hidden="true"><path d="M50 2 L52.5 4.5 L50 7 L47.5 4.5 Z" transform={`rotate(${(recommendation.value - min) / perRevolution * 360 - 136} 50 50)`} fill="currentColor" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" /></svg>}
    </div>
    <button type="button" aria-label={`${label} erhöhen`} disabled={value >= min + last * step} onClick={() => change(value + step)}>＋</button>
    </div>
    {recommendation && <div className="dial-advice"><span className="advice-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 16c0-6 4-9 13-9m-4-4 4 4-4 4"/></svg></span><div><span className="advice-heading">Nächster Mahlgrad</span><strong>{recommendation.label}</strong><small>{recommendation.context}</small></div></div>}
    <details className="precise"><summary>Wert direkt eingeben</summary><input aria-label={`${label} direkt`} type="number" inputMode="decimal" min={min} max={max} step={step} value={value}
      onChange={e => { if (e.target.value !== '' && Number.isFinite(e.target.valueAsNumber)) change(e.target.valueAsNumber) }} /></details>
  </div>
}
