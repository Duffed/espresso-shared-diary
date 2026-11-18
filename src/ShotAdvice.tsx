import { useEffect, useRef, useState } from 'react'
import { type Grinder, type Shot, type ShotFields, onScale } from './model'
import { VerticalDial } from './VerticalDial'
import { Notice, errorText } from './ui'

type Advice = NonNullable<ShotFields['grind_advice']> | ''
export function ShotAdvice({ shot, grinder, editable, onSave }: { shot: Shot; grinder: Grinder; editable: boolean; onSave: (fields: Partial<ShotFields>) => Promise<void> }) {
  const [kind, setKind] = useState<Advice>(shot.grind_advice ?? '')
  const [target, setTarget] = useState(shot.grind_target ?? shot.grind ?? grinder.minimum)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const pending = useRef<{ kind: Advice; target: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const save = useRef(onSave)
  save.current = onSave
  async function flush() {
    const next = pending.current
    if (!next) return
    pending.current = null
    if (next.kind === 'exact' && !onScale(next.target, grinder.minimum, grinder.maximum, grinder.step)) { setError('Bitte wähle einen Mahlgrad innerhalb der Mühlenskala.'); return }
    setBusy(true); setError(''); setSaved(false)
    try { await save.current({ grind_advice: next.kind || null, grind_target: next.kind === 'exact' ? next.target : null }); setSaved(true) }
    catch (reason) { setError(errorText(reason, 'Empfehlung konnte nicht gespeichert werden. Bitte erneut auswählen.')) }
    finally { setBusy(false) }
  }
  useEffect(() => () => { clearTimeout(timer.current); void flush() }, [])
  function choose(next: Advice, value: number, delay = 0) {
    clearTimeout(timer.current)
    setKind(next); setTarget(value); setSaved(false); setError('')
    pending.current = { kind: next, target: value }
    if (delay) timer.current = setTimeout(() => void flush(), delay)
    else void flush()
  }
  if (!editable) return null
  return <div className="detail-advice">
    <fieldset className="advice-choice" disabled={busy}><legend>Nächster Mahlgrad</legend>
      <div className="advice-options">{([['', 'Keine'], ['coarser', 'Gröber'], ['finer', 'Feiner'], ['exact', 'Wert']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={kind === value} onClick={() => choose(value, value === 'exact' && !onScale(target, grinder.minimum, grinder.maximum, grinder.step) ? grinder.minimum : target)}>{label}</button>)}</div>
      {kind === 'exact' && <div inert={busy || undefined}><VerticalDial label="Empfohlener Mahlgrad" value={target} min={grinder.minimum} max={grinder.maximum} step={grinder.step} onChange={value => choose('exact', value, 400)} /></div>}
    </fieldset>
    <Notice>{error}</Notice><small role="status">{busy ? 'Wird gespeichert …' : saved ? 'Empfehlung gespeichert.' : ''}</small>
  </div>
}
