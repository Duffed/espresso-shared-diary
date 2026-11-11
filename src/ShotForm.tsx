import { useState, type FormEvent } from 'react'
import { decimal, DiaryError, formatNumber, grinderName, onScale, parseGaggiMate, stepGrind,
  type RoomData, type Shot, type ShotFields } from './model'
import { errorText, Notice, Photo } from './ui'

const measures = [
  { key: 'dose', label: 'Dosis (g)', max: 1000 },
  { key: 'output', label: 'Output (g)', max: 10000 },
  { key: 'temperature', label: 'Solltemperatur (°C)', max: 150 },
  { key: 'duration', label: 'Laufzeit (s)', max: 86400 },
] as const

function dateInput(value = new Date().toISOString()) {
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19)
}

export function ShotForm({ data, user, editing, onSave, onClose }: {
  data: RoomData; user: string; editing?: Shot
  onSave: (fields: ShotFields, importKey: string | null) => Promise<void>; onClose: () => void
}) {
  const [grinderId, setGrinderId] = useState(editing?.grinder_id ?? '')
  const [basketId, setBasketId] = useState(editing?.basket_id ?? '')
  const [grind, setGrind] = useState(editing?.grind == null ? '' : formatNumber(editing.grind))
  const [brewedAt, setBrewedAt] = useState(dateInput(editing?.brewed_at))
  const [profile, setProfile] = useState(editing?.profile ?? '')
  const [values, setValues] = useState(() => Object.fromEntries(measures.map(({ key }) =>
    [key, editing?.[key] == null ? '' : formatNumber(editing[key])])))
  const [importKey, setImportKey] = useState<string | null>(null)
  const [warning, setWarning] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const grinder = data.grinders.find(item => item.id === grinderId)
  const profileNames = [...new Set([...data.profiles.filter(item => !item.archived).map(item => item.name), profile].filter(Boolean))]

  function selectGrinder(id: string) {
    setGrinderId(id)
    const scale = data.grinders.find(item => item.id === id)
    const last = data.shots.find(shot => shot.author_id === user && shot.grinder_id === id && shot.grind !== null)
    setGrind(scale && last?.grind != null && onScale(last.grind, scale.minimum, scale.maximum, scale.step)
      ? formatNumber(last.grind) : '')
  }

  async function importShot(file: File) {
    setError('')
    setBusy(true)
    try {
      if (file.size > 5 * 1024 * 1024) throw new DiaryError('Die Datei darf höchstens 5 MB groß sein.')
      const result = await parseGaggiMate(await file.text())
      if (data.shots.some(shot => shot.import_key === result.importKey)) {
        throw new DiaryError('Dieser GaggiMate-Bezug wurde bereits importiert.')
      }
      setImportKey(result.importKey)
      setBrewedAt(dateInput(result.fields.brewed_at))
      setProfile(result.fields.profile ?? '')
      setValues(Object.fromEntries(measures.map(({ key }) => {
        const value = result.fields[key]
        return [key, value == null ? '' : formatNumber(value)]
      })))
      setWarning(result.incomplete ? 'Die GaggiMate-Aufzeichnung ist unvollständig. Bitte prüfe die Werte.' : '')
    } catch (reason) { setError(errorText(reason, 'Die Datei konnte nicht gelesen werden.')) }
    finally { setBusy(false) }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const value = decimal(grind)
      if (grind.trim() && (!grinder || value === null ||
        (!(editing?.grinder_id === grinderId && editing?.grind === value)
          && !onScale(value, grinder.minimum, grinder.maximum, grinder.step)))) {
        throw new DiaryError('Wähle einen Mahlgrad auf der Skala der Mühle.')
      }
      const numeric = Object.fromEntries(measures.map(({ key, label, max }) => {
        const raw = values[key].trim()
        const number = decimal(raw)
        if (raw && (number === null || number <= 0 || number > max || (number === max && key !== 'temperature'))) {
          throw new DiaryError('Prüfe den Wert für ' + label + '.')
        }
        return [key, number]
      })) as Pick<ShotFields, typeof measures[number]['key']>
      await onSave({
        ...numeric, brewed_at: new Date(brewedAt).toISOString(), grinder_id: grinderId || null,
        basket_id: basketId || null, grind: value, profile: profile || null,
      }, importKey)
    } catch (reason) { setError(errorText(reason)) }
    finally { setBusy(false) }
  }

  return <section className="panel shot-form" aria-labelledby="shot-title">
    <div className="section-heading"><h2 id="shot-title">{editing ? 'Bezug bearbeiten' : 'Neuer Bezug'}</h2>
      <button type="button" className="quiet" onClick={onClose}>Schließen</button></div>
    <form onSubmit={submit}>
      {!editing && data.room.gaggimate && <label className="file-label">GaggiMate-Bezug importieren
        <input type="file" accept=".json,application/json" disabled={busy} onChange={event => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void importShot(file)
        }} />
      </label>}
      <Notice>{warning}</Notice>
      <div className="grid">
        <label>Zeitpunkt<input type="datetime-local" required step="1" value={brewedAt} onChange={e => setBrewedAt(e.target.value)} /></label>
        <label>Profil<select value={profile} onChange={e => setProfile(e.target.value)}>
          <option value="">Kein Profil</option>{profileNames.map(name => <option key={name}>{name}</option>)}
        </select></label>
      </div>
      <fieldset><legend>Mühle</legend><div className="tiles">
        <button type="button" aria-pressed={!grinderId} onClick={() => selectGrinder('')}>Keine</button>
        {data.grinders.filter(item => !item.archived || item.id === grinderId).map(item =>
          <button type="button" key={item.id} aria-pressed={grinderId === item.id} onClick={() => selectGrinder(item.id)}>
            <Photo photo={item.photo} url={item.image_url} />{grinderName(item)}
          </button>)}
      </div></fieldset>
      {grinder && <label>Mahlgrad <small>{formatNumber(grinder.minimum)} bis {formatNumber(grinder.maximum)} · Schritt {formatNumber(grinder.step)}</small>
        <span className="stepper">
          <button type="button" aria-label="Mahlgrad verringern" onClick={() => setGrind(formatNumber(stepGrind(decimal(grind), grinder, -1)))}>−</button>
          <input value={grind} inputMode="decimal" onChange={event => setGrind(event.target.value)} />
          <button type="button" aria-label="Mahlgrad erhöhen" onClick={() => setGrind(formatNumber(stepGrind(decimal(grind), grinder, 1)))}>+</button>
        </span></label>}
      <fieldset><legend>Sieb</legend><div className="tiles">
        <button type="button" aria-pressed={!basketId} onClick={() => setBasketId('')}>Keins</button>
        {data.baskets.filter(item => !item.archived || item.id === basketId).map(item =>
          <button type="button" key={item.id} aria-pressed={basketId === item.id} onClick={() => setBasketId(item.id)}>
            <Photo photo={item.photo} />{item.name}
            <small>{[item.capacity && formatNumber(item.capacity) + ' g', item.diameter && formatNumber(item.diameter) + ' mm', item.shape].filter(Boolean).join(' · ')}</small>
          </button>)}
      </div></fieldset>
      <div className="grid metrics">{measures.map(({ key, label }) =>
        <label key={key}>{label}<input inputMode="decimal" value={values[key]} onChange={e =>
          setValues(previous => ({ ...previous, [key]: e.target.value }))} /></label>)}</div>
      <Notice>{error}</Notice>
      <button className="primary" disabled={busy}>{busy ? 'Bitte warten …' : 'Bezug speichern'}</button>
    </form>
  </section>
}
