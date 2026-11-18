import { BasketIcon, BeanIcon, GrindIcon, ProfileIcon, ResultIcon } from './Icons'
import { useStepMotion } from './useStepMotion'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { shotSteps, DiaryError, decimal, beanGrind, latestBeanShot, adviceText, formatNumber, grinderName, onScale, parseGaggiMate, profileOptions, type RoomData, type Shot, type ShotFields } from './model'
import { errorText, Notice } from './ui'
import { BasketPicker } from './BasketPicker'
import { api } from './data'
import { Dial } from './Dial'
import { VerticalDial } from './VerticalDial'
import { readDialRevolutions, readResultDecimals, readDoseRange } from './DialSettings'
import { BeanPhoto, Beans } from './Beans'
import { readQuickNavigation } from './PersonalSettings'

type ShotDraft = { note: string; flowBased: boolean; maxPressure: string; advice: NonNullable<ShotFields['grind_advice']> | ''; target: string; newFlowBased: boolean; beanId: string; grinderId: string; basketId: string; grind: number; profile: string; values: { dose: number; output: number; duration: number; temperature: number }; brewedAt: string; importKey: string | null; warning: string; addingProfile: boolean; newProfile: string }

export function ShotForm({ data, user, editing, draftKey, stage, onStageChange: setStage, onSave, onClose, refresh }: {
  draftKey: string
  stage: number; onStageChange: (stage: number) => void
  data: RoomData; user: string; editing?: Shot; refresh: () => Promise<void>
  onSave: (fields: ShotFields, importKey: string | null) => Promise<void>; onClose: () => void
}) {
  const extraDetailsKey = 'espresso-diary-extra-details:' + user
  const [extraDetailsOpen, setExtraDetailsOpen] = useState(() => {
    try { return localStorage.getItem(extraDetailsKey) === 'true' } catch { return false }
  })
  const [draft] = useState<Partial<ShotDraft>>(() => {
    try { return JSON.parse(sessionStorage.getItem(draftKey) || '{}') } catch { return {} }
  })
  function clearDraft() { try { sessionStorage.removeItem(draftKey) } catch { /* Optional storage. */ } }
  function cancel() { clearDraft(); onClose() }
  const latest = data.shots.find(shot => shot.author_id === user)
  const initial = editing ?? latest
  const activeGrinders = data.grinders.filter(g => !g.archived)
  const initialGrinder = data.grinders.find(g => g.id === initial?.grinder_id && (!g.archived || editing)) ?? (!editing && (activeGrinders.length === 1 || !initial) ? activeGrinders[0] : undefined)
  const [resultDecimals] = useState(readResultDecimals)
  const resultStep = resultDecimals ? 0.1 : 1
  const normalizeResult = (value: number, max: number) => Math.min(max - resultStep, Math.max(resultStep, Math.round(value / resultStep) * resultStep))
  const [doseRange] = useState(readDoseRange)
  const [dialRevolutions] = useState(readDialRevolutions)
  const motion = useStepMotion(stage, setStage)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const swipe = useRef<{ id: number; x: number; y: number; stage: number; horizontal: boolean } | null>(null)
  const suppressSwipeClick = useRef<{ id: number; until: number } | null>(null)
  useEffect(() => { titleRef.current?.focus({ preventScroll: true }); titleRef.current?.closest('.shot-form')?.scrollTo({ top: 0 }); window.scrollTo({ top: 0 }) }, [stage])
  const [beanId, setBeanId] = useState(draft.beanId ?? editing?.bean_id ?? data.beans?.find(bean => bean.id === initial?.bean_id && !bean.archived)?.id ?? '')
  const [grinderId, setGrinderId] = useState(draft.grinderId ?? initialGrinder?.id ?? '')
  const [basketId, setBasketId] = useState(draft.basketId ?? data.baskets.find(b => b.id === initial?.basket_id && (!b.archived || editing))?.id ?? ((!initial || data.baskets.filter(b => !b.archived).length === 1) ? data.baskets.find(b => !b.archived)?.id : '') ?? '')
  const [grind, setGrind] = useState(draft.grind ?? (editing?.grind ?? beanGrind(data.shots, beanId, data.grinders.find(g => g.id === grinderId))))
  const [addingProfile, setAddingProfile] = useState(draft.addingProfile ?? false)
  const [newProfile, setNewProfile] = useState(draft.newProfile ?? '')
  const canSaveProfile = navigator.onLine
  const initialProfile = editing?.profile ?? (data.profiles.some(p => p.name === initial?.profile && !p.archived) ? initial?.profile : '')
  const [profile, setProfile] = useState(draft.profile ?? initialProfile ?? '')
  const [note, setNote] = useState(draft.note ?? editing?.note ?? '')
  const [flowBased, setFlowBased] = useState(draft.flowBased ?? (editing ? editing.flow_based ?? false : data.profiles.find(p => p.name === initialProfile)?.flow_based ?? false))
  const [newFlowBased, setNewFlowBased] = useState(draft.newFlowBased ?? false)
  const [maxPressure, setMaxPressure] = useState(draft.maxPressure ?? (editing?.max_pressure != null ? String(editing.max_pressure) : ''))
  const [advice, setAdvice] = useState<NonNullable<ShotFields['grind_advice']> | ''>(draft.advice ?? editing?.grind_advice ?? '')
  const [target, setTarget] = useState(draft.target ?? (editing?.grind_target != null ? String(editing.grind_target) : ''))
  function selectProfile(name: string) {
    setProfile(name)
    const flow = editing && name === editing.profile ? editing.flow_based ?? false : data.profiles.find(p => p.name === name)?.flow_based ?? false
    setFlowBased(flow)
    if (!flow) setMaxPressure('')
  }
  const [values, setValues] = useState(() => {
    const saved = draft.values ?? { dose: initial?.dose ?? 18, output: initial?.output ?? 36, duration: initial?.duration ?? 30, temperature: Math.round(initial?.temperature ?? 93) }
    if (!editing && !draft.values) saved.dose = Math.max(doseRange.min, Math.min(doseRange.max, saved.dose))
    return editing ? { ...saved, temperature: Math.round(saved.temperature) } : { ...saved, temperature: Math.round(saved.temperature), output: Number(normalizeResult(saved.output, 10000).toFixed(1)), duration: Number(normalizeResult(saved.duration, 86400).toFixed(1)) }
  })
  const [brewedAt, setBrewedAt] = useState(draft.brewedAt ?? editing?.brewed_at ?? new Date().toISOString())
  const [importKey, setImportKey] = useState<string | null>(draft.importKey ?? null)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState(draft.warning ?? '')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    try { sessionStorage.setItem(draftKey, JSON.stringify({ beanId, grinderId, basketId, grind, profile, values, brewedAt, importKey, warning, addingProfile, newProfile, note, flowBased, maxPressure, advice, target, newFlowBased })) } catch { /* Optional storage. */ }
  }, [draftKey, beanId, grinderId, basketId, grind, profile, values, brewedAt, importKey, warning, addingProfile, newProfile, note, flowBased, maxPressure, advice, target, newFlowBased])
  const grinder = data.grinders.find(g => g.id === grinderId)
  const selectableGrinders = data.grinders.filter(g => !g.archived || g.id === grinderId)
  const recent = [...new Set(data.shots.filter(s => s.author_id === user).map(s => s.bean_id).filter(Boolean))].map(id => data.beans?.find(b => b.id === id)).filter(b => b && !b.archived).slice(0, 3)
  const otherBeans = (data.beans ?? []).filter(bean => (!bean.archived || bean.id === beanId) && !recent.some(item => item?.id === bean.id))
  const profiles = profileOptions(data.profiles, data.shots, user, profile)
  const titles = ['Bohne', 'Mahlgrad', 'Kaffeemenge', 'Profil', 'Ergebnis']
  const steps = shotSteps
  const stepIndex = steps.indexOf(stage)
  async function addProfile() {
    const name = newProfile.trim()
    if (!name) { setError('Gib deinem Profil einen Namen.'); return }
    setError(''); setBusy(true)
    try {
      if (!navigator.onLine) throw new DiaryError('Zum Anlegen eines Profils brauchst du eine Internetverbindung.')
      const result = await api.rpc('create_room_profile', { target_room: data.room.id, profile_name: name, is_flow_based: newFlowBased }).single<{ name: string; flow_based: boolean }>()
      if (result.error) throw result.error
      await refresh()
      setProfile(result.data.name); setFlowBased(result.data.flow_based); setMaxPressure(''); setAddingProfile(false); setNewProfile(''); setNewFlowBased(false)
    } catch (reason) { setError(errorText(reason, 'Das Profil konnte nicht gespeichert werden.')) }
    finally { setBusy(false) }
  }
  function selectBean(id: string) {
    if (id !== beanId) { setGrind(beanGrind(data.shots, id, grinder)); setAdvice(''); setTarget('') }
    setBeanId(id); if (readQuickNavigation(user)) setStage(2)
  }
  function selectGrinder(id: string) {
    setGrinderId(id)
    const scale = data.grinders.find(g => g.id === id)
    setGrind(beanGrind(data.shots, beanId, scale)); setAdvice(''); setTarget('')
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (stage < 4) { setStage(steps[stepIndex + 1]); return }
    setBusy(true); setError('')
    try {
      if (grinder && !onScale(grind, grinder.minimum, grinder.maximum, grinder.step) && !(editing?.grind === grind && editing.grinder_id === grinder.id)) throw new DiaryError('Wähle einen Mahlgrad auf der Skala der Mühle.')
      if (values.dose <= 0 || values.dose >= 1000 || values.output <= 0 || values.output >= 10000 || values.duration <= 0 || values.duration >= 86400 || values.temperature <= 0 || values.temperature > 150) throw new DiaryError('Bitte prüfe die Mengen, Zeit und Temperatur.')
      const pressure = flowBased && maxPressure.trim() ? decimal(maxPressure) : null
      if (flowBased && maxPressure.trim() && (pressure === null || pressure < 0 || pressure > 30)) throw new DiaryError('Der Maximaldruck muss zwischen 0 und 30 bar liegen.')
      const grindTarget = advice === 'exact' ? decimal(target) : null
      if (advice && (!beanId || !grinder)) throw new DiaryError('Wähle für die Empfehlung Bohne und Mühle.')
      if (advice === 'exact' && (grindTarget === null || !grinder || (!onScale(grindTarget, grinder.minimum, grinder.maximum, grinder.step) && !(editing?.grind_target === grindTarget && editing.grinder_id === grinderId)))) throw new DiaryError('Wähle eine Empfehlung auf der Skala der Mühle.')
      if (note.length > 2000) throw new DiaryError('Die Notiz darf höchstens 2.000 Zeichen haben.')
      await onSave({ note: note.trim() || null, flow_based: flowBased, max_pressure: pressure, grind_advice: advice || null, grind_target: grindTarget, ...values, ...(beanId || editing?.bean_id ? { bean_id: beanId || null } : {}), brewed_at: brewedAt, grinder_id: grinderId || null, basket_id: basketId || null, grind: grinder ? grind : null, profile: profile || null }, importKey)
      clearDraft()
    } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }
  async function importShot(file: File) {
    setBusy(true); setError('')
    try {
      if (file.size > 5242880) throw new DiaryError('Die Datei darf höchstens 5 MB groß sein.')
      const result = await parseGaggiMate(await file.text())
      if (data.shots.some(s => s.import_key === result.importKey)) throw new DiaryError('Dieser GaggiMate-Bezug wurde bereits importiert.')
      setImportKey(result.importKey); setBrewedAt(result.fields.brewed_at!); selectProfile(result.fields.profile ?? '')
      setValues(previous => ({ dose: result.fields.dose ?? previous.dose, output: Number(normalizeResult(result.fields.output ?? previous.output, 10000).toFixed(1)), duration: Number(normalizeResult(result.fields.duration ?? previous.duration, 86400).toFixed(1)), temperature: Math.round(result.fields.temperature ?? previous.temperature) }))
      setWarning(result.incomplete ? 'Die Aufzeichnung ist unvollständig. Bitte prüfe die Werte.' : 'Import geladen. Bitte prüfe die Werte.')
    } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }
  const previous = latestBeanShot(data.shots.filter(s => s.id !== editing?.id), beanId, grinderId)
  const recommendation = previous && adviceText(previous) ? {
    label: adviceText(previous),
    origin: previous.grind != null && grinder && onScale(previous.grind, grinder.minimum, grinder.maximum, grinder.step) ? previous.grind : undefined,
    direction: previous.grind_advice === 'coarser' ? 1 as const : previous.grind_advice === 'finer' ? -1 as const : undefined,
    value: previous.grind_advice === 'exact' && previous.grind_target != null && grinder && onScale(previous.grind_target, grinder.minimum, grinder.maximum, grinder.step) ? previous.grind_target : undefined,
    context: previous.author_name + ' · ' + new Date(previous.brewed_at).toLocaleString('de-DE'),
  } : undefined
  const measure = (key: keyof typeof values, label: string, unit: string, max: number) => key === 'dose' ? <VerticalDial basket presetUser={user} onConfirm={() => setStage(1)} onPresetSelect={() => { if (readQuickNavigation(user)) setStage(1) }} label={label} unit={unit} value={values[key]} min={Math.min(doseRange.min, values[key])} max={Math.max(doseRange.max, values[key])} step={0.5} perDrag={dialRevolutions[key]} onChange={value => setValues(previous => ({ ...previous, [key]: value }))} /> : key === 'output' || key === 'duration'
    ? <VerticalDial label={label} unit={unit} value={values[key]} min={resultStep} max={Math.max(max, values[key])} step={resultStep} perDrag={dialRevolutions[key]} onChange={value => setValues(previous => ({ ...previous, [key]: value }))} />
    : <Dial label={label} unit={unit} value={values[key]} min={key === 'temperature' ? 1 : 0.1} max={Math.max(max, values[key])} step={key === 'temperature' ? 1 : 0.1} perRevolution={dialRevolutions[key]} onChange={value => setValues(previous => ({ ...previous, [key]: value }))} />
  return <section className="panel shot-form" data-step={stage} aria-labelledby="shot-title"
    onClickCapture={event => {
      const suppressed = suppressSwipeClick.current
      if (suppressed && event.detail > 0 && performance.now() < suppressed.until && 'pointerId' in event.nativeEvent && event.nativeEvent.pointerId === suppressed.id) {
        event.preventDefault(); event.stopPropagation()
      }
      suppressSwipeClick.current = null
    }}
    onPointerDown={event => {
      suppressSwipeClick.current = null
      swipe.current = null
      if (busy || motion.isTransitioning() || !event.isPrimary || event.button !== 0 || (event.target as Element).closest('input, textarea, select, a, summary, [role="slider"], .dial-control, .vertical-control, .bean-form, .inline-profile, .wizard-actions, .step-track, .section-heading button')) return
      swipe.current = { id: event.pointerId, x: event.clientX, y: event.clientY, stage, horizontal: false }
    }}
    onPointerMove={event => {
      const start = swipe.current
      if (!start || start.id !== event.pointerId || busy || start.stage !== stage) return
      const dx = event.clientX - start.x, dy = event.clientY - start.y
      if (!start.horizontal) {
        if (Math.abs(dy) > 12 && Math.abs(dy) >= Math.abs(dx)) { swipe.current = null; return }
        if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.4) return
        start.horizontal = true
        event.currentTarget.setPointerCapture(event.pointerId)
      }
      motion.dragTo(dx, (dx > 0 && stepIndex === 0) || (dx < 0 && stepIndex === steps.length - 1))
      suppressSwipeClick.current = { id: event.pointerId, until: performance.now() + 400 }
    }}
    onPointerUp={event => {
      const start = swipe.current
      swipe.current = null
      if (!start || start.id !== event.pointerId) return
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      const dx = event.clientX - start.x, dy = event.clientY - start.y
      if (busy || start.stage !== stage || !start.horizontal || Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.4) { motion.reset(); return }
      const next = stepIndex + (dx < 0 ? 1 : -1)
      if (next >= 0 && next < steps.length) motion.navigate(steps[next])
      else motion.reset()
    }}
    onPointerCancel={() => { swipe.current = null; motion.reset() }}
    onLostPointerCapture={event => { if (event.target === event.currentTarget) { swipe.current = null; motion.reset() } }}>

    <div className="section-heading"><h2 ref={titleRef} tabIndex={-1} id="shot-title" className="eyebrow">{titles[stage]} – {stepIndex + 1}/{steps.length}</h2><button type="button" className="quiet" disabled={busy} onClick={cancel}>Abbrechen</button></div>
    <div className="step-track" aria-label="Fortschritt">{steps.map((step, i) => <button key={step} type="button" disabled={busy} aria-label={`Schritt ${i + 1}: ${titles[step]}`} data-label={titles[step]} aria-current={stage === step ? 'step' : undefined} className={i <= stepIndex ? 'done' : ''} onClick={() => setStage(step)}><span className="step-icon" aria-hidden="true">{step === 0 ? <BeanIcon /> : step === 2 ? <BasketIcon /> : step === 1 ? <GrindIcon /> : step === 3 ? <ProfileIcon /> : <ResultIcon />}</span></button>)}</div>
    {stage === 0 && <Beans data={data} refresh={refresh} onSelect={bean => selectBean(bean.id)} />}
    <form onSubmit={submit}>
      <fieldset ref={motion.fieldsRef} key={stage} className="wizard-fields" disabled={busy}>
      {stage === 0 && <>
        {recent.length > 0 && <section className="recent-bean-section" aria-label="Zuletzt verwendete Bohnen"><span className="eyebrow">Zuletzt verwendet</span>
          <div className="recent-beans">{recent.map(bean => bean && <button type="button" className="bean-picture-card" key={bean.id} aria-pressed={beanId === bean.id} onClick={() => selectBean(bean.id)}>
            <span className="bean-picture"><BeanPhoto bean={bean} /><span className="selection-tick" aria-hidden="true">{beanId === bean.id ? '✓' : ''}</span></span>
            <strong>{bean.name}</strong><small>{bean.roaster || 'Kaffeesorte'}</small><span className="bean-card-tick" aria-hidden="true">{beanId === bean.id ? '✓' : ''}</span>
          </button>)}</div></section>}
        {otherBeans.length > 0 && <section className="other-bean-section"><div className="section-heading"><span className="eyebrow">{recent.length ? 'Weitere Bohnen' : 'Alle Bohnen'}</span><small>{otherBeans.length} Sorten</small></div>
          <div className="bean-scroll-list bean-grid" role="region" aria-label="Weitere Bohnen" tabIndex={0}>{otherBeans.map(bean => <button type="button" className="bean-picture-card" key={bean.id} aria-pressed={beanId === bean.id} onClick={() => selectBean(bean.id)}>
            <span className="bean-picture"><BeanPhoto bean={bean} /><span className="selection-tick" aria-hidden="true">{beanId === bean.id ? '✓' : ''}</span></span><strong>{bean.name}</strong><small>{bean.roaster || 'Kaffeesorte'}</small><span className="bean-card-tick" aria-hidden="true">{beanId === bean.id ? '✓' : ''}</span>
          </button>)}</div></section>}

      </>}
      {stage === 1 && <>{selectableGrinders.length > 1 || (editing && !grinderId && selectableGrinders.length > 0) ? <label>Mühle<select value={grinderId} onChange={e => selectGrinder(e.target.value)}><option value="">Keine Mühle</option>{selectableGrinders.map(g => <option key={g.id} value={g.id}>{grinderName(g)}</option>)}</select></label> : <div className="single-grinder">{grinder && <><span className="eyebrow">Mühle</span><strong>{grinderName(grinder)}</strong></>}</div>}{grinder ? <Dial label="Mahlgrad" recommendation={recommendation} value={grind} min={grinder.minimum} max={grinder.maximum} step={grinder.step} onChange={setGrind} onConfirm={() => setStage(3)} /> : <p className="empty">Mühlen fügst du in den Einstellungen hinzu. Du kannst diesen Schritt überspringen.</p>}</>}
      {stage === 2 && <>{measure('dose', 'Dosis', 'g', 40)}{data.baskets.filter(b => !b.archived || b.id === basketId).length !== 1 && <BasketPicker baskets={data.baskets} shots={data.shots} user={user} value={basketId} onChange={setBasketId} />}</>}
      {stage === 3 && <><div className="profile-options">{profiles.map(name => <button type="button" key={name} aria-pressed={profile === name} onClick={() => { selectProfile(name); setError(''); if (readQuickNavigation(user)) setStage(4) }}><ProfileIcon />{name || 'Ohne Profil'}<span>{profile === name ? '✓' : ''}</span></button>)}</div><button type="button" className="add-profile-button" disabled={!canSaveProfile} onClick={() => { setAddingProfile(true); setError('') }}>＋ Neues Profil</button>{!canSaveProfile && <small>Zum Anlegen eines Profils brauchst du eine Internetverbindung.</small>}
        {addingProfile && <div className="inline-profile"><label>Profilname<input autoFocus maxLength={100} value={newProfile} onChange={event => setNewProfile(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void addProfile() } }} /></label>
          <label className="check"><input type="checkbox" checked={newFlowBased} onChange={e => setNewFlowBased(e.target.checked)} />Flow-based</label><small>Wird für alle im Raum gespeichert. Zum Anlegen ist eine Internetverbindung nötig.</small>
          <div className="actions"><button type="button" disabled={!newProfile.trim() || busy || !canSaveProfile} onClick={() => void addProfile()}>Profil hinzufügen</button><button type="button" className="quiet" onClick={() => { setAddingProfile(false); setNewProfile('') }}>Abbrechen</button></div>
        </div>}</>}
      {stage === 4 && <><div className="result-rollers">{measure('output', 'Output', 'g', 100)}{measure('duration', 'Laufzeit', 's', 120)}</div><p className="ratio">Brühverhältnis <strong>1 : {formatNumber(Math.round(values.output / values.dose * 100) / 100)}</strong></p>
        <div className="shot-feedback">
          {flowBased && <label>Maximaldruck (bar)<input inputMode="decimal" value={maxPressure} onChange={e => setMaxPressure(e.target.value)} placeholder="Optional · 0–30 bar" /></label>}
          {beanId && grinder && <fieldset className="advice-choice"><legend>Nächster Mahlgrad</legend>
            <div className="advice-options">{([['', 'Keine Empfehlung'], ['coarser', 'Gröber'], ['finer', 'Feiner'], ['exact', 'Konkreter Wert']] as const).map(([kind, text]) =>
              <label key={kind} className={advice === kind ? 'selected' : undefined}>
                <input type="radio" aria-label={text} name="grind-advice" value={kind} checked={advice === kind} onChange={() => {
                  setAdvice(kind)
                  if (kind === 'exact' && decimal(target) === null) setTarget(String(onScale(grind, grinder.minimum, grinder.maximum, grinder.step) ? grind : grinder.minimum))
                }} /><span>{kind === '' ? 'Keine' : kind === 'exact' ? 'Wert' : text}</span>
              </label>)}
            </div>
            {advice === 'exact' && <VerticalDial label="Empfohlener Mahlgrad" value={decimal(target) ?? grind} min={grinder.minimum} max={grinder.maximum} step={grinder.step} onChange={value => setTarget(String(value))} />}
          </fieldset>}
          <label>Notiz<textarea aria-label="Notiz" maxLength={2000} rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Wie war dein Bezug?" /></label>
        </div>
        <details open={extraDetailsOpen} onToggle={event => {
          const open = event.currentTarget.open
          setExtraDetailsOpen(open)
          try { localStorage.setItem(extraDetailsKey, String(open)) } catch { /* Optional device preference. */ }
        }}><summary>Weitere Angaben & Import</summary><label>Zeitpunkt<input type="datetime-local" required step="1" value={new Date(Date.parse(brewedAt) - new Date(brewedAt).getTimezoneOffset() * 60000).toISOString().slice(0, 19)} onChange={e => { if (e.target.value) setBrewedAt(new Date(e.target.value).toISOString()) }} /></label>{measure('temperature', 'Solltemperatur', '°C', 150)}
        {!editing && data.room.gaggimate && <label>GaggiMate-Bezug importieren<input type="file" accept=".json,application/json" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void importShot(file) }} /></label>}</details><Notice>{warning}</Notice>
        <div className="recipe-summary">{data.beans?.find(b => b.id === beanId)?.name || 'Ohne Bohne'} · {formatNumber(values.dose)} g → {formatNumber(values.output)} g · {formatNumber(values.duration)} s</div>
      </>}
      </fieldset><Notice>{error}</Notice>
      <div className="wizard-actions"><button type="button" disabled={busy} onClick={() => stage ? setStage(steps[stepIndex - 1]) : cancel()}>{stage ? 'Zurück' : 'Abbrechen'}</button><button className="primary" disabled={busy}>{busy ? 'Wird gespeichert …' : stage === 4 ? 'Bezug speichern' : 'Weiter →'}</button></div>
    </form>
  </section>
}
