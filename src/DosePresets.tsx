import { useState } from 'react'
import { decimal, formatNumber } from './model'
import { SettingsToggle } from './SettingsToggle'
import { TrashIcon } from './Icons'

type Preset = { amount: number; enabled: boolean }
const keyFor = (user: string) => 'espresso-diary-dose-presets:' + user
function valid(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= .1 && value <= 100 && Math.abs(value * 10 - Math.round(value * 10)) < 1e-7 }
function readPresets(user: string): Preset[] {
  try {
    const saved = JSON.parse(localStorage.getItem(keyFor(user)) || 'null')
    if (Array.isArray(saved)) {
      const unique = new Map<number, Preset>()
      for (const item of saved) {
        const amount = typeof item === 'number' ? item : item?.amount
        if (valid(amount)) {
          const rounded = Math.max(.5, Math.round(amount * 2) / 2)
          unique.set(rounded, { amount: rounded, enabled: typeof item === 'number' || item.enabled !== false })
        }
      }
      return [...unique.values()].sort((a,b) => a.amount-b.amount).slice(0,12)
    }
  } catch { /* Use suggestions if storage is unavailable. */ }
  return [7,14,19,25].map(amount => ({ amount, enabled: true }))
}
export function DosePresets({ user, value, min, max, onChange, directOpen, onDirectToggle }: { user: string; value: number; min: number; max: number; onChange: (value: number) => void; directOpen: boolean; onDirectToggle: () => void }) {
  const [presets] = useState(() => readPresets(user))
  return <aside className="dose-presets" aria-label="Kaffeemengen-Presets"><div className="dose-preset-list">
    {presets.filter(preset => preset.enabled).map(({ amount }) => <button key={amount} type="button" className="dose-preset" aria-pressed={value === amount} disabled={amount < min || amount > max} title={amount < min || amount > max ? 'Außerhalb deines Mengenbereichs' : undefined} onClick={() => onChange(amount)}>{formatNumber(amount)} g</button>)}
    <button type="button" className="dose-preset preset-direct" aria-expanded={directOpen} onClick={onDirectToggle}>Wert direkt eingeben</button>
  </div></aside>
}
export function DosePresetSettings({ user }: { user: string }) {
  const [presets, setPresets] = useState(() => readPresets(user))
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  function persist(next: Preset[]) {
    try { localStorage.setItem(keyFor(user), JSON.stringify(next)); setPresets(next); setError(''); return true } catch { setError('Presets konnten nicht gespeichert werden.'); return false }
  }
  return <section className="dose-preset-settings" aria-label="Vordefinierte Kaffeemengen"><h3>Vordefinierte Kaffeemengen</h3><p className="meta">Aktive Mengen erscheinen beim Bezug. Für dich auf diesem Gerät.</p>
    <div className="preset-settings-list">{presets.map(preset => <div className="preset-settings-row" key={preset.amount}>
      <SettingsToggle label={formatNumber(preset.amount) + ' g'} accessibleLabel={formatNumber(preset.amount) + ' g aktiv'} checked={preset.enabled} onChange={enabled => persist(presets.map(item => item.amount === preset.amount ? { ...item, enabled } : item))} />
      <button type="button" className="quiet" aria-label={formatNumber(preset.amount) + ' g entfernen'} onClick={() => persist(presets.filter(item => item.amount !== preset.amount))}><TrashIcon /></button>
    </div>)}</div>
    <form className="preset-settings-add" onSubmit={event => {
      event.preventDefault()
      const amount = decimal(input)
      if (!valid(amount) || amount % .5 !== 0) { setError('Wähle 0,5–100 g in 0,5-g-Schritten.'); return }
      if (presets.some(item => item.amount === amount)) { setError('Diese Menge ist bereits vorhanden.'); return }
      if (presets.length >= 12) { setError('Du kannst bis zu 12 Mengen speichern.'); return }
      if (persist([...presets, { amount, enabled: true }].sort((a,b) => a.amount-b.amount))) setInput('')
    }}><label>Menge (g)<input inputMode="decimal" required value={input} onChange={event => setInput(event.target.value)} /></label><button type="submit">Hinzufügen</button></form>
    <small>Mengen außerhalb des eingestellten Bereichs bleiben beim Bezug gesperrt.</small>
    {error && <p role="status" className="notice">{error}</p>}
  </section>
}
