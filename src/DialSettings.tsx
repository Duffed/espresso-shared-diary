import { SettingsGroup } from './SettingsGroup'
import { PersonalSettings } from './PersonalSettings'
import { DosePresetSettings } from './DosePresets'
import { SettingsToggle } from './SettingsToggle'
import { useState } from 'react'
import { decimal, formatNumber } from './model'
import { verticalDragSlowdown } from './VerticalDial'

const resultDecimalsKey = 'espresso-diary-result-decimals'
export function readResultDecimals(): boolean {
  try { return localStorage.getItem(resultDecimalsKey) === 'true' } catch { return false }
}

const doseRangeKey = 'espresso-diary-dose-range'
export function readDoseRange(): { min: number; max: number } {
  try {
    const range = JSON.parse(localStorage.getItem(doseRangeKey) || 'null')
    if (range && typeof range.min === 'number' && typeof range.max === 'number' && Number.isFinite(range.min) && Number.isFinite(range.max) && range.min >= 0.1 && range.max <= 100 && range.max > range.min && Math.abs(range.min * 2 - Math.round(range.min * 2)) < 1e-7 && Math.abs(range.max * 2 - Math.round(range.max * 2)) < 1e-7) return range
  } catch { /* Use defaults when storage is unavailable or invalid. */ }
  return { min: 7, max: 25 }
}
function DoseRangeSettings() {
  const [range, setRange] = useState(() => { const saved = readDoseRange(); return { min: String(saved.min), max: String(saved.max) } })
  const [message, setMessage] = useState('')
  return <form className="dose-range-settings" onSubmit={event => {
    event.preventDefault()
    const min = decimal(range.min), max = decimal(range.max)
    if (min == null || max == null || min < 0.5 || max > 100 || min >= max || Math.abs(min * 2 - Math.round(min * 2)) > 1e-7 || Math.abs(max * 2 - Math.round(max * 2)) > 1e-7) { setMessage('Wähle 0,5 bis 100 g in 0,5-g-Schritten. Das Maximum muss größer als das Minimum sein.'); return }
    try { localStorage.setItem(doseRangeKey, JSON.stringify({ min, max })); setMessage('Mengenbereich gespeichert.') } catch { setMessage('Der Mengenbereich konnte nicht gespeichert werden.') }
  }}><h3>Kaffeemenge · Bereich</h3><p className="meta">Für neue Bezüge auf diesem Gerät. Standard: 7–25 g.</p><div className="grid"><label>Minimum (g)<input inputMode="decimal" required value={range.min} onChange={e => { setRange({ ...range, min: e.target.value }); setMessage('') }} /></label><label>Maximum (g)<input inputMode="decimal" required value={range.max} onChange={e => { setRange({ ...range, max: e.target.value }); setMessage('') }} /></label></div><button type="submit">Mengenbereich speichern</button>{message && <p role="status">{message}</p>}</form>
}
const storageKey = 'espresso-diary-dial-revolutions'
export const dialOptions = {
  dose: { label: 'Dosis', unit: 'g', values: [6, 10, 20, 40, 60], initial: 20 },
  output: { label: 'Output', unit: 'g', values: [6, 10, 20, 40, 60, 100], initial: 20 },
  duration: { label: 'Laufzeit', unit: 's', values: [6, 10, 30, 60, 120], initial: 60 },
  temperature: { label: 'Solltemperatur', unit: '°C', values: [6, 10, 20, 30], initial: 20 },
}
export type DialRevolutions = Record<keyof typeof dialOptions, number>
export function readDialRevolutions(): DialRevolutions {
  let saved: Partial<DialRevolutions> = {}
  try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}') ?? {} } catch {}
  return Object.fromEntries(Object.entries(dialOptions).map(([key, option]) => {
    const value = saved[key as keyof DialRevolutions]
    return [key, typeof value === 'number' && option.values.includes(value) ? value : option.initial]
  })) as DialRevolutions
}

export function DialSettings({ user }: { user: string }) {
  const [resultDecimals, setResultDecimals] = useState(readResultDecimals)
  const [revolutions, setRevolutions] = useState(readDialRevolutions)
  const [error, setError] = useState('')
  return <><SettingsGroup personal title="Bedienung" subtitle="Schnellauswahl, Empfindlichkeit und Genauigkeit" icon="M4 7h16M4 17h16M8 4v6m8 4v6"><PersonalSettings key={user} user={user} /><section className="dial-settings" aria-labelledby="dial-settings-title">
    <h3 id="dial-settings-title">Einstellräder</h3>
    <p className="meta">Temperatur: Änderung pro voller Umdrehung. Dosis, Output und Laufzeit: Änderung beim vertikalen Ziehen über 240 Bildschirmpixel. Output und Laufzeit verwenden standardmäßig ganze Gramm und Sekunden. Gilt auf diesem Gerät; der Mahlgrad behält die Skala deiner Mühle.</p>
    <SettingsToggle label="Nachkommastellen für Output und Laufzeit" description="Aktiviert: Schritte von 0,1 g und 0,1 s. Bereits gespeicherte Messwerte behalten ihre Genauigkeit." checked={resultDecimals} onChange={checked => {
      try { localStorage.setItem(resultDecimalsKey, String(checked)); setResultDecimals(checked); setError('') }
      catch { setError('Die Einstellungen konnten auf diesem Gerät nicht gespeichert werden.') }
    }} />
    <div className="dial-settings-grid">{Object.entries(dialOptions).map(([key, option]) => <label key={key}>
      {option.label} · {key !== 'temperature' ? 'pro Zug' : 'pro Umdrehung'}
      <select value={revolutions[key as keyof DialRevolutions]} onChange={event => {
        const next = { ...revolutions, [key]: Number(event.target.value) }
        try { localStorage.setItem(storageKey, JSON.stringify(next)); setRevolutions(next); setError('') }
        catch { setError('Die Einstellungen konnten auf diesem Gerät nicht gespeichert werden.') }
      }}>{option.values.map(value => <option key={value} value={value}>{formatNumber(key !== 'temperature' ? value / verticalDragSlowdown : value)} {option.unit} / {key !== 'temperature' ? 'Zug' : '360°'}</option>)}</select>
    </label>)}</div>
    {error && <p role="status" className="notice">{error}</p>}
  </section></SettingsGroup><SettingsGroup personal title="Kaffeemengen" subtitle="Mengengrenzen und vordefinierte Mengen" icon="M4 5h16l-2 14H6L4 5Zm4 5h8m-7 4h6"><DoseRangeSettings /><DosePresetSettings key={user} user={user} /></SettingsGroup></>
}
