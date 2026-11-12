import { useState } from 'react'
import { errorText, Notice } from './ui'

export function ShotRating({ value, editable, unavailable, onChange }: {
  value: number | null; editable: boolean; unavailable?: string; onChange: (value: number | null) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function rate(next: number | null) {
    if (busy || !editable) return
    setBusy(true); setError('')
    try { await onChange(next) } catch (reason) { setError(errorText(reason, 'Bewertung konnte nicht gespeichert werden. Bitte versuche es erneut.')) }
    finally { setBusy(false) }
  }
  return <div className="shot-rating">
    <div className="rating-row" role="group" aria-label="Kaffee bewerten" title={unavailable}>
      {[1, 2, 3, 4, 5].map(stars => <button type="button" className="rating-star" key={stars} aria-label={stars === 1 ? '1 Stern' : `${stars} Sterne`} aria-pressed={value === stars} disabled={!editable || busy} title={value === stars ? 'Erneut tippen zum Entfernen' : undefined} onClick={() => void rate(value === stars ? null : stars)}>
        <svg viewBox="0 0 24 24" aria-hidden="true" className={value != null && value >= stars ? 'filled' : ''}><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" /></svg>
      </button>)}
    </div>
    <small className="sr-only" role="status">{busy ? 'Wird gespeichert …' : value == null ? 'Noch nicht bewertet' : `${value} von 5 Sternen`}{!editable && unavailable ? ' · ' + unavailable : ''}</small>
    <Notice>{error}</Notice>
  </div>
}
