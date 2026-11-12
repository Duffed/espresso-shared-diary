import { ProfileIcon } from './Icons'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { DiaryError, formatNumber, grinderName, onScale, parseGaggiMate, type RoomData, type Shot, type ShotFields } from './model'
import { errorText, Notice } from './ui'
import { BasketPicker } from './BasketPicker'
import { api } from './data'
import { Dial } from './Dial'
import { readDialRevolutions } from './DialSettings'
import { BeanPhoto, Beans } from './Beans'

type ShotDraft = { beanId: string; grinderId: string; basketId: string; grind: number; profile: string; values: { dose: number; output: number; duration: number; temperature: number }; brewedAt: string; importKey: string | null; warning: string; addingProfile: boolean; newProfile: string }

export function ShotForm({ data, user, editing, draftKey, stage, onStageChange: setStage, onSave, onClose, refresh }: {
  draftKey: string
  stage: number; onStageChange: (stage: number) => void
  data: RoomData; user: string; editing?: Shot; refresh: () => Promise<void>
  onSave: (fields: ShotFields, importKey: string | null) => Promise<void>; onClose: () => void
}) {
  const [draft] = useState<Partial<ShotDraft>>(() => {
    try { return JSON.parse(sessionStorage.getItem(draftKey) || '{}') } catch { return {} }
  })
  function clearDraft() { try { sessionStorage.removeItem(draftKey) } catch { /* Optional storage. */ } }
  function cancel() { clearDraft(); onClose() }
  const latest = data.shots.find(shot => shot.author_id === user)
  const initial = editing ?? latest
  const activeGrinders = data.grinders.filter(g => !g.archived)
  const initialGrinder = data.grinders.find(g => g.id === initial?.grinder_id && (!g.archived || editing)) ?? (!editing && (activeGrinders.length === 1 || !initial) ? activeGrinders[0] : undefined)
  const [dialRevolutions] = useState(readDialRevolutions)
  const titleRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => { titleRef.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0 }) }, [stage])
  const [beanId, setBeanId] = useState(draft.beanId ?? initial?.bean_id ?? '')
  const [grinderId, setGrinderId] = useState(draft.grinderId ?? initialGrinder?.id ?? '')
  const [basketId, setBasketId] = useState(draft.basketId ?? data.baskets.find(b => b.id === initial?.basket_id && (!b.archived || editing))?.id ?? ((!initial || data.baskets.filter(b => !b.archived).length === 1) ? data.baskets.find(b => !b.archived)?.id : '') ?? '')
  const [grind, setGrind] = useState(draft.grind ?? (initialGrinder && initial?.grind != null && onScale(initial.grind, initialGrinder.minimum, initialGrinder.maximum, initialGrinder.step) ? initial.grind : initialGrinder?.minimum ?? 0))
  const [addingProfile, setAddingProfile] = useState(draft.addingProfile ?? false)
  const [newProfile, setNewProfile] = useState(draft.newProfile ?? '')
  const canSaveProfile = navigator.onLine && data.members.some(member => member.user_id === user && member.admin)
  const [profile, setProfile] = useState(draft.profile ?? initial?.profile ?? '')
  const [values, setValues] = useState(draft.values ?? { dose: initial?.dose ?? 18, output: initial?.output ?? 36, duration: initial?.duration ?? 30, temperature: initial?.temperature ?? 93 })
  const [brewedAt, setBrewedAt] = useState(draft.brewedAt ?? editing?.brewed_at ?? new Date().toISOString())
  const [importKey, setImportKey] = useState<string | null>(draft.importKey ?? null)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState(draft.warning ?? '')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    try { sessionStorage.setItem(draftKey, JSON.stringify({ beanId, grinderId, basketId, grind, profile, values, brewedAt, importKey, warning, addingProfile, newProfile })) } catch { /* Optional storage. */ }
  }, [draftKey, beanId, grinderId, basketId, grind, profile, values, brewedAt, importKey, warning, addingProfile, newProfile])
  const grinder = data.grinders.find(g => g.id === grinderId)
  const selectableGrinders = data.grinders.filter(g => !g.archived || g.id === grinderId)
  const recent = [...new Set(data.shots.filter(s => s.author_id === user).map(s => s.bean_id).filter(Boolean))].map(id => data.beans?.find(b => b.id === id)).filter(b => b && !b.archived).slice(0, 3)
  const otherBeans = (data.beans ?? []).filter(bean => (!bean.archived || bean.id === beanId) && !recent.some(item => item?.id === bean.id))
  const profiles = [...new Set(['', ...data.profiles.filter(p => !p.archived).map(p => p.name), profile])]
  const titles = ['Bohne', 'Mahlgrad', 'Kaffeemenge', 'Profil', 'Ergebnis']
  const steps = data.profiles.some(p => !p.archived) ? [0, 1, 2, 3, 4] : [0, 1, 2, 4]
  const stepIndex = steps.indexOf(stage)
  async function addProfile() {
    const name = newProfile.trim()
    if (!name) { setError('Gib deinem Profil einen Namen.'); return }
    setError(''); setBusy(true)
    try {
      if (canSaveProfile && !data.profiles.some(item => item.name === name && !item.archived)) {
        const result = await api.from('profiles').insert({ room_id: data.room.id, name })
        if (result.error) throw result.error
        await refresh()
      }
      setProfile(name); setAddingProfile(false); setNewProfile('')
    } catch { setError('Das Profil konnte nicht gespeichert werden. Bitte versuche es erneut.') }
    finally { setBusy(false) }
  }
  function selectBean(id: string) { setBeanId(id); setStage(1) }
  function selectGrinder(id: string) {
    setGrinderId(id)
    const scale = data.grinders.find(g => g.id === id)
    const last = data.shots.find(s => s.author_id === user && s.grinder_id === id && s.grind !== null)
    setGrind(scale && last?.grind != null && onScale(last.grind, scale.minimum, scale.maximum, scale.step) ? last.grind : scale?.minimum ?? 0)
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (stage < 4) { setStage(steps[stepIndex + 1]); return }
    setBusy(true); setError('')
    try {
      if (grinder && !onScale(grind, grinder.minimum, grinder.maximum, grinder.step) && !(editing?.grind === grind && editing.grinder_id === grinder.id)) throw new DiaryError('Wähle einen Mahlgrad auf der Skala der Mühle.')
      if (values.dose <= 0 || values.dose >= 1000 || values.output <= 0 || values.output >= 10000 || values.duration <= 0 || values.duration >= 86400 || values.temperature <= 0 || values.temperature > 150) throw new DiaryError('Bitte prüfe die Mengen, Zeit und Temperatur.')
      await onSave({ ...values, ...(beanId || editing?.bean_id ? { bean_id: beanId || null } : {}), brewed_at: brewedAt, grinder_id: grinderId || null, basket_id: basketId || null, grind: grinder ? grind : null, profile: profile || null }, importKey)
      clearDraft()
    } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }
  async function importShot(file: File) {
    setBusy(true); setError('')
    try {
      if (file.size > 5242880) throw new DiaryError('Die Datei darf höchstens 5 MB groß sein.')
      const result = await parseGaggiMate(await file.text())
      if (data.shots.some(s => s.import_key === result.importKey)) throw new DiaryError('Dieser GaggiMate-Bezug wurde bereits importiert.')
      setImportKey(result.importKey); setBrewedAt(result.fields.brewed_at!); setProfile(result.fields.profile ?? '')
      setValues(previous => ({ dose: result.fields.dose ?? previous.dose, output: result.fields.output ?? previous.output, duration: result.fields.duration ?? previous.duration, temperature: result.fields.temperature ?? previous.temperature }))
      setWarning(result.incomplete ? 'Die Aufzeichnung ist unvollständig. Bitte prüfe die Werte.' : 'Import geladen. Bitte prüfe die Werte.')
    } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }
  const measure = (key: keyof typeof values, label: string, unit: string, max: number) => <Dial label={label} unit={unit} value={values[key]} min={0.1} max={Math.max(max, values[key])} step={0.1} perRevolution={dialRevolutions[key]} onConfirm={key === 'dose' ? () => setStage(steps[stepIndex + 1]) : undefined} onChange={value => setValues(previous => ({ ...previous, [key]: value }))} />
  return <section className="panel shot-form" data-step={stage} aria-labelledby="shot-title">
    <div className="section-heading"><h2 ref={titleRef} tabIndex={-1} id="shot-title" className="eyebrow">{titles[stage]} – {stepIndex + 1}/{steps.length}</h2><button type="button" className="quiet" disabled={busy} onClick={cancel}>Abbrechen</button></div>
    <div className="step-track" aria-label="Fortschritt">{steps.map((step, i) => <button key={step} type="button" disabled={busy} aria-label={`Schritt ${i + 1}: ${titles[step]}`} aria-current={stage === step ? 'step' : undefined} className={step <= stage ? 'done' : ''} onClick={() => setStage(step)} />)}</div>
    {stage === 0 && <Beans data={data} refresh={refresh} onSelect={bean => selectBean(bean.id)} />}
    <form onSubmit={submit}>
      <fieldset key={stage} className="wizard-fields" disabled={busy}>
      {stage === 0 && <>
        {recent.length > 0 && <section aria-label="Zuletzt verwendete Bohnen"><span className="eyebrow">Zuletzt verwendet</span>
          <div className="recent-beans">{recent.map(bean => bean && <button type="button" className="bean-picture-card" key={bean.id} aria-pressed={beanId === bean.id} onClick={() => selectBean(bean.id)}>
            <span className="bean-picture"><BeanPhoto bean={bean} /><span className="selection-tick" aria-hidden="true">{beanId === bean.id ? '✓' : ''}</span></span>
            <strong>{bean.name}</strong><small>{bean.roaster || 'Kaffeesorte'}</small>
          </button>)}</div></section>}
        {otherBeans.length > 0 && <section><div className="section-heading"><span className="eyebrow">{recent.length ? 'Weitere Bohnen' : 'Alle Bohnen'}</span><small>{otherBeans.length} Sorten</small></div>
          <div className="bean-scroll-list bean-grid" role="region" aria-label="Weitere Bohnen" tabIndex={0}>{otherBeans.map(bean => <button type="button" className="bean-picture-card" key={bean.id} aria-pressed={beanId === bean.id} onClick={() => selectBean(bean.id)}>
            <span className="bean-picture"><BeanPhoto bean={bean} /><span className="selection-tick" aria-hidden="true">{beanId === bean.id ? '✓' : ''}</span></span><strong>{bean.name}</strong><small>{bean.roaster || 'Kaffeesorte'}</small>
          </button>)}</div></section>}

      </>}
      {stage === 1 && <>{selectableGrinders.length > 1 || (editing && !grinderId && selectableGrinders.length > 0) ? <label>Mühle<select value={grinderId} onChange={e => selectGrinder(e.target.value)}><option value="">Keine Mühle</option>{selectableGrinders.map(g => <option key={g.id} value={g.id}>{grinderName(g)}</option>)}</select></label> : <div className="single-grinder">{grinder && <><span className="eyebrow">Mühle</span><strong>{grinderName(grinder)}</strong></>}</div>}{grinder ? <Dial label="Mahlgrad" value={grind} min={grinder.minimum} max={grinder.maximum} step={grinder.step} onChange={setGrind} onConfirm={() => setStage(2)} /> : <p className="empty">Mühlen fügst du in den Einstellungen hinzu. Du kannst diesen Schritt überspringen.</p>}</>}
      {stage === 2 && <>{measure('dose', 'Dosis', 'g', 40)}{data.baskets.filter(b => !b.archived || b.id === basketId).length !== 1 && <BasketPicker baskets={data.baskets} shots={data.shots} user={user} value={basketId} onChange={setBasketId} />}</>}
      {stage === 3 && <><div className="profile-options">{profiles.map(name => <button type="button" key={name} aria-pressed={profile === name} onClick={() => { setProfile(name); setError(''); setStage(4) }}><ProfileIcon />{name || 'Ohne Profil'}<span>{profile === name ? '✓' : ''}</span></button>)}</div><button type="button" className="add-profile-button" onClick={() => { setAddingProfile(true); setError('') }}>＋ Neues Profil</button>
        {addingProfile && <div className="inline-profile"><label>Profilname<input autoFocus maxLength={100} value={newProfile} onChange={event => setNewProfile(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void addProfile() } }} /></label>
          <small>{canSaveProfile ? 'Wird für alle im Raum gespeichert.' : 'Wird für diesen Bezug verwendet.'}</small>
          <div className="actions"><button type="button" disabled={!newProfile.trim() || busy} onClick={() => void addProfile()}>{canSaveProfile ? 'Profil hinzufügen' : 'Profil verwenden'}</button><button type="button" className="quiet" onClick={() => { setAddingProfile(false); setNewProfile('') }}>Abbrechen</button></div>
        </div>}</>}
      {stage === 4 && <><div className="result-dials">{measure('output', 'Output', 'g', 100)}{measure('duration', 'Laufzeit', 's', 120)}</div><p className="ratio">Brühverhältnis <strong>1 : {formatNumber(Math.round(values.output / values.dose * 100) / 100)}</strong></p>
        <details><summary>Weitere Angaben & Import</summary><label>Zeitpunkt<input type="datetime-local" required step="1" value={new Date(Date.parse(brewedAt) - new Date(brewedAt).getTimezoneOffset() * 60000).toISOString().slice(0, 19)} onChange={e => { if (e.target.value) setBrewedAt(new Date(e.target.value).toISOString()) }} /></label>{measure('temperature', 'Solltemperatur', '°C', 150)}
        {!editing && data.room.gaggimate && <label>GaggiMate-Bezug importieren<input type="file" accept=".json,application/json" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void importShot(file) }} /></label>}</details><Notice>{warning}</Notice>
        <div className="recipe-summary">{data.beans?.find(b => b.id === beanId)?.name || 'Ohne Bohne'} · {formatNumber(values.dose)} g → {formatNumber(values.output)} g · {formatNumber(values.duration)} s</div>
      </>}
      </fieldset><Notice>{error}</Notice>
      <div className="wizard-actions"><button type="button" disabled={busy} onClick={() => stage ? setStage(steps[stepIndex - 1]) : cancel()}>{stage ? 'Zurück' : 'Abbrechen'}</button><button className="primary" disabled={busy}>{busy ? 'Wird gespeichert …' : stage === 4 ? 'Bezug speichern' : 'Weiter →'}</button></div>
    </form>
  </section>
}
