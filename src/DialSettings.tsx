import { useState } from 'react'
import { formatNumber } from './model'

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

export function DialSettings() {
  const [revolutions, setRevolutions] = useState(readDialRevolutions)
  const [error, setError] = useState('')
  return <section className="panel dial-settings" aria-labelledby="dial-settings-title">
    <h2 id="dial-settings-title">Einstellräder</h2>
    <p className="meta">Wie viel soll sich bei einer vollen Umdrehung ändern? Bei 20 g kommst du mit einer Umdrehung von 40 auf 20 g. Plus/Minus und direkte Eingabe bleiben fein. Gilt auf diesem Gerät; der Mahlgrad behält die Skala deiner Mühle.</p>
    <div className="dial-settings-grid">{Object.entries(dialOptions).map(([key, option]) => <label key={key}>
      {option.label} · pro Umdrehung
      <select value={revolutions[key as keyof DialRevolutions]} onChange={event => {
        const next = { ...revolutions, [key]: Number(event.target.value) }
        try { localStorage.setItem(storageKey, JSON.stringify(next)); setRevolutions(next); setError('') }
        catch { setError('Die Einstellungen konnten auf diesem Gerät nicht gespeichert werden.') }
      }}>{option.values.map(value => <option key={value} value={value}>{formatNumber(value)} {option.unit} / 360°</option>)}</select>
    </label>)}</div>
    {error && <p role="status" className="notice">{error}</p>}
  </section>
}
