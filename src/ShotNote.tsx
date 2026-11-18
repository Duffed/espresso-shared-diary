import { useEffect, useId, useRef, useState } from 'react'
import { Notice, errorText } from './ui'
export function ShotNote({ note, own, available, onSave }: { note: string | null | undefined; own: boolean; available: boolean; onSave: (note: string | null) => Promise<void> }) {
 const id = useId()
 const [draft, setDraft] = useState(note ?? '')
 const [status, setStatus] = useState('')
 const [error, setError] = useState('')
 const pending = useRef<string | null>(null)
 const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
 const busy = useRef(false)
 const save = useRef(onSave); save.current = onSave
 const allowed = useRef(available); allowed.current = available
 async function flush() {
  if (busy.current || pending.current === null || !allowed.current) return
  const value = pending.current; pending.current = null; busy.current = true
  setStatus('Wird gespeichert …'); setError('')
  try { await save.current(value.trim() || null); setStatus('Automatisch gespeichert.') }
  catch (reason) { if (pending.current === null) pending.current = value; setError(errorText(reason, 'Notiz konnte nicht gespeichert werden.')); setStatus(''); busy.current = false; return }
  busy.current = false
  if (pending.current !== null) timer.current = setTimeout(() => void flush(), 100)
 }
 useEffect(() => () => { clearTimeout(timer.current); void flush() }, [])
 useEffect(() => { if (available && pending.current !== null) void flush() }, [available])
 if (!own && !note) return null
 return <section className="detail-note" aria-label="Notiz"><div className="section-heading"><h3 id={id + "-label"}>Notiz</h3></div>
 {own ? <><textarea id={id} aria-labelledby={id + "-label"} placeholder="Wie war dein Bezug? Schreib deine Notiz …" readOnly={!available} rows={4} maxLength={2000} value={draft} onBlur={() => void flush()} onChange={event => { setDraft(event.target.value); pending.current = event.target.value; setStatus('Ungespeicherte Änderung …'); clearTimeout(timer.current); timer.current = setTimeout(() => void flush(), 600) }} /><small role="status">{status}</small><Notice>{error}</Notice>{error && <button type="button" onClick={() => void flush()}>Erneut versuchen</button>}</> : note ? <p className="shot-note detail-note-text" tabIndex={0}>{note}</p> : null}
 {own && !available && <small>Speichern nach Synchronisierung und mit Internetverbindung möglich.</small>}</section>
}
