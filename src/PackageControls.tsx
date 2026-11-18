import { AdjustIcon, EditIcon, TrashIcon } from './Icons'
import { useEffect, useRef, useState } from 'react'
import { api } from './data'
import { decimal, DiaryError, formatNumber, type Bean, type BeanPackage, type RoomData } from './model'
import { packageStock } from './packages'
import { errorText, Notice } from './ui'

export const localTime = (date = new Date()) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19)
export function PackageAmount({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <div className="package-amount"><div className="package-presets" role="group" aria-label="Packungsgröße">{[250, 500, 1000].map(grams => <button type="button" key={grams} aria-pressed={Number(value) === grams} onClick={() => onChange(String(grams))}>{grams === 1000 ? '1 kg' : grams + ' g'}</button>)}</div><label>Packungsmenge (g)<input inputMode="decimal" required value={value} onChange={e => onChange(e.target.value)} placeholder="Eigene Menge" /></label></div>
}
export function PackageForm({ bean, data, refresh, onClose, correction = false, editing }: { bean: Bean; data: RoomData; refresh: () => Promise<void>; onClose: () => void; correction?: boolean; editing?: BeanPackage }) {
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => { formRef.current?.scrollIntoView({ block: 'start' }) }, [])
  const [active] = useState(() => editing ?? data.packages?.find(p => p.bean_id === bean.id && !p.closed_at))
  const stock = active ? packageStock(active, data.shots, data.packageAdjustments) : null
  const [id] = useState(() => crypto.randomUUID())
  const [amount, setAmount] = useState(correction && stock ? String(stock.remaining) : editing ? String(editing.quantity) : '250')
  const [opened, setOpened] = useState(() => editing ? localTime(new Date(editing.opened_at)) : localTime())
  const [started] = useState(Date.now)
  const [includeHistory, setIncludeHistory] = useState<'yes' | 'no' | ''>('')
  const askHistory = !correction && (Boolean(editing) || new Date(opened).getTime() < started - 60000)
  const candidates = data.shots.filter(s => s.bean_id === bean.id && s.version > 0 && Date.parse(s.brewed_at) >= new Date(opened).getTime() && Date.parse(s.brewed_at) <= Date.now() && (!editing?.closed_at || Date.parse(s.brewed_at) < Date.parse(editing.closed_at)) && (editing ? !s.package_id : (!s.package_id || s.package_id === active?.id)))
  const historyDose = candidates.reduce((sum, s) => sum + (s.dose ?? 0), 0)
  const [remainder, setRemainder] = useState('finished')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = data.shots.some(s => s.bean_id === bean.id && s.version === 0)
  return <form ref={formRef} className="panel package-form" onSubmit={async e => {
    e.preventDefault(); setBusy(true); setError('')
    try {
      if (!navigator.onLine || pending) throw new DiaryError('Bitte zuerst die ausstehenden Bezüge synchronisieren und online bleiben.')
      if (askHistory && !includeHistory) throw new DiaryError('Bitte wähle, ob bisherige Bezüge einbezogen werden sollen.')
      const grams = decimal(amount)
      if (grams == null || grams < (correction ? 0 : .001) || grams > 100000 || Math.abs(Math.round(grams * 1000) - grams * 1000) > 1e-7) throw new DiaryError('Gib eine gültige Menge mit höchstens drei Nachkommastellen ein.')
      const openedAt = editing && opened === localTime(new Date(editing.opened_at)) ? editing.opened_at : new Date(opened).toISOString()
      const result = editing && active
        ? await api.rpc('edit_bean_package_with_history', { target_package: active.id, grams, opened: openedAt, expected_quantity: active.quantity, expected_opened: active.opened_at, expected_closed: active.closed_at, include_existing: includeHistory === 'yes' })
        : correction && active
        ? await api.rpc('correct_package_stock', { target_package: active.id, correction_id: id, remaining: grams, note: reason.trim() })
        : askHistory ? await api.rpc('open_bean_package_with_history', { target_bean: bean.id, new_id: id, grams, opened: openedAt, expected_active: active?.id ?? null, remainder, include_existing: includeHistory === 'yes' })
        : await api.rpc('open_bean_package', { target_bean: bean.id, new_id: id, grams, opened: new Date(opened).toISOString(), expected_active: active?.id ?? null, remainder })
      if (result.error) throw result.error
      await refresh(); onClose()
    } catch (reason) { setError(errorText(reason, 'Die Packung konnte nicht gespeichert werden. Bitte aktualisieren und erneut versuchen.')) }
    finally { setBusy(false) }
  }}>
    <h3>{editing ? 'Packung bearbeiten' : correction ? 'Bestand korrigieren' : 'Neue Packung öffnen'} · {bean.name}</h3>
    <fieldset disabled={busy || pending || !navigator.onLine} className="wizard-fields">
      {correction ? <><label>Gemessener Restbestand (g)<input inputMode="decimal" required value={amount} onChange={e => setAmount(e.target.value)} /></label><label>Grund<input required maxLength={200} value={reason} onChange={e => setReason(e.target.value)} placeholder="Zum Beispiel Einstellversuche oder nachgewogen" /></label></> : <>
        <PackageAmount value={amount} onChange={setAmount} />
        <label>Geöffnet am<input type="datetime-local" step="1" required value={opened} onChange={e => { setOpened(e.target.value); setIncludeHistory('') }} /></label>
        {askHistory && <fieldset className="package-history-choice"><legend>Bisherige Bezüge einbeziehen?</legend><p>{candidates.length} Bezüge dieser Bohne ab dem gewählten Datum {editing?.closed_at ? 'bis zum Packungsende' : 'bis heute'} · {formatNumber(historyDose)} g.</p><label><input type="radio" name="package-history" required checked={includeHistory === 'yes'} onChange={() => setIncludeHistory('yes')} />Ja, dieser Packung zuordnen</label><label><input type="radio" name="package-history" required checked={includeHistory === 'no'} onChange={() => setIncludeHistory('no')} />Nein, bisherige Zuordnung behalten</label><small>Gilt für alle Personen im Raum. {editing ? 'Bereits zugeordnete Bezüge bleiben bei ihrer bisherigen Packung.' : 'Bezüge abgeschlossener älterer Packungen werden nicht verändert.'} Der Gesamtverbrauch bleibt gleich.</small></fieldset>}
        {active && !editing && <fieldset className="package-remainder"><legend>Bisherige Packung · ca. {formatNumber(includeHistory === 'yes' ? Math.max(0, stock!.rawRemaining + candidates.filter(s => s.package_id === active.id).reduce((sum, s) => sum + (s.dose ?? 0), 0)) : stock!.remaining)} g übrig</legend>{[['finished', 'Alte Packung abschließen', 'Der Rest wird nicht übernommen.'], ['carried', 'Rest übernehmen', 'Der berechnete Rest kommt zur neuen Packung dazu.'], ['discarded', 'Rest entsorgt', 'Als entsorgten Rest dokumentieren.']].map(([value, title, help]) => <label key={value}><input type="radio" name="remainder" value={value} checked={remainder === value} onChange={() => setRemainder(value)} /><span>{title}<small>{help}</small></span></label>)}</fieldset>}
        <p className="meta">{editing ? 'Die ursprüngliche Füllmenge wird korrigiert und der Restbestand neu berechnet. Bereits zugeordnete Bezüge, Bestandskorrekturen und übernommene Restmengen bleiben erhalten; mit Ja kommen die passenden unzugeordneten Bezüge hinzu.' : includeHistory === 'yes' ? 'Die ausgewählten Bezüge und künftige Bezüge werden dieser Packung zugeordnet und vom Restbestand abgezogen.' : 'Ab diesem Zeitpunkt werden neue Bezüge der Packung zugeordnet. Bestehende Bezüge behalten ihre Zuordnung.'}</p>
      </>}
      <button className="primary">{busy ? 'Wird gespeichert …' : editing ? 'Änderungen speichern' : correction ? 'Bestand speichern' : 'Packung öffnen'}</button>
    </fieldset>
    {pending && <Notice>Bitte zuerst die ausstehenden Bezüge dieser Bohne synchronisieren.</Notice>}
    <Notice>{error}</Notice><button type="button" className="quiet" disabled={busy} onClick={onClose}>Abbrechen</button>
  </form>
}

export function PackageStock({ pack, data, onCorrect, onEdit, onDelete }: { pack: BeanPackage; data: RoomData; onCorrect: () => void; onEdit: () => void; onDelete: () => void }) {
  const stock = packageStock(pack, data.shots, data.packageAdjustments)
  return <div className="package-stock">
    <div className="package-stock-heading"><div><strong>Noch ca. {formatNumber(stock.remaining)} g</strong><small>von {formatNumber(stock.total)} g{pack.carried_in > 0 ? ` · davon ${formatNumber(pack.carried_in)} g übernommen` : ''}</small></div><details className="package-menu" onKeyDown={e => { if (e.key === 'Escape') { e.currentTarget.open = false; e.currentTarget.querySelector('summary')?.focus() } }} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) e.currentTarget.open = false }}><summary aria-label="Packungsaktionen" title="Packungsaktionen">…</summary><div><button type="button" className="quiet" disabled={!navigator.onLine} onClick={e => { e.currentTarget.closest('details')!.open = false; onEdit() }}><EditIcon />Packung bearbeiten</button><button type="button" className="quiet" disabled={!navigator.onLine} onClick={e => { e.currentTarget.closest('details')!.open = false; onCorrect() }}><AdjustIcon />Bestand korrigieren</button><button type="button" className="quiet" disabled={!navigator.onLine} onClick={e => { e.currentTarget.closest('details')!.open = false; onDelete() }}><TrashIcon />Packung löschen</button></div></details></div>
    <div className="package-stock-bar" role="meter" aria-label="Restbestand" aria-valuemin={0} aria-valuemax={Math.max(stock.total, stock.remaining)} aria-valuenow={stock.remaining}><i style={{ width: `${Math.min(100, stock.remaining / stock.total * 100)}%` }} /></div>
    <small>{formatNumber(stock.consumed)} g verbraucht{stock.shotsLeft != null ? ` · etwa ${stock.shotsLeft} Bezüge übrig` : ''}</small>
    {stock.correction !== 0 && <small>Bestandskorrekturen: {stock.correction > 0 ? '+' : ''}{formatNumber(stock.correction)} g</small>}
    {stock.rawRemaining <= 0 && <p className="meta">Rechnerisch leer – neue Packung öffnen oder Bestand korrigieren. Weitere Bezüge bleiben möglich.</p>}


  </div>
}
