import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { api } from './data'
import { decimal, DiaryError, formatNumber, grinderName, validateRoomPassword, type Basket, type Grinder, type ImageResult, type RoomData } from './model'
import { errorText, Notice, Photo } from './ui'
import { PhotoPicker } from './PhotoPicker'
import { usePhotoPaste } from './usePhotoPaste'

function SettingNumber({ name, label, initial, min, max, step }: { name: string; label: string; initial: number; min: number; max: number; step: number }) {
  const [value, setValue] = useState(initial)
  return <div className="setting-number"><label>{label}<input name={name} type="number" inputMode="decimal" min={min} max={max} step="any" required value={value} onChange={e => { if (Number.isFinite(e.target.valueAsNumber)) setValue(e.target.valueAsNumber) }} /></label>
    <input type="range" aria-label={label + ' schieben'} min={Math.min(0, value)} max={Math.max(name === 'step' ? 1 : name === 'capacity' ? 40 : 100, value)} step={step} value={value} onChange={e => setValue(Number(e.target.value))} />
    <div className="actions"><button type="button" aria-label={label + ' verringern'} onClick={() => setValue(Math.max(min, Number((value - step).toFixed(6))))}>−</button><button type="button" aria-label={label + ' erhöhen'} onClick={() => setValue(Math.min(max, Number((value + step).toFixed(6))))}>＋</button></div>
  </div>
}

type EquipmentDraft = { kind: 'grinders'; item?: Grinder } | { kind: 'baskets'; item?: Basket }

const basketImages = [
  { id: '7g', name: '7 g' },
  { id: '14g', name: '14 g' },
  { id: '18g', name: '18 g' },
  { id: '20g', name: '20 g' },
  { id: '22g', name: '22 g' },
  { id: 'stepdown', name: 'Stepdown' },
]

const basketImageUrl = (id: string) => import.meta.env.BASE_URL + 'baskets/' + id + '.png'

function EquipmentForm({ draft, room, onClose, onSaved }: {
  draft: EquipmentDraft; room: string; onClose: () => void; onSaved: () => Promise<void>
}) {
  const grinder = draft.kind === 'grinders' ? draft.item : undefined
  const basket = draft.kind === 'baskets' ? draft.item : undefined
  const [brand, setBrand] = useState(grinder?.brand ?? '')
  const [model, setModel] = useState(grinder?.model ?? '')
  const [file, setFile] = useState<File>()
  const [basketImage, setBasketImage] = useState<string>()
  const [selected, setSelected] = useState<ImageResult>()
  const [accepted, setAccepted] = useState(false)
  const [clearImage, setClearImage] = useState(false)
  const [results, setResults] = useState<ImageResult[]>([])
  const [searchMessage, setSearchMessage] = useState('')
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  usePhotoPaste(busy, photo => {
    setFile(photo); setBasketImage(undefined); setSelected(undefined); setClearImage(false); setAccepted(false)
  }, setError)
  const hasImage = Boolean(file || basketImage || selected ||
    (!clearImage && (draft.item?.photo_path || draft.item?.photo || grinder?.image_url)))

  useEffect(() => {
    if (draft.kind !== 'grinders' || !brand.trim() || !model.trim()) {
      setResults([])
      setSearchMessage('')
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setSearchMessage('Bilder werden gesucht …')
      setResults([])
      try {
        const { data } = await api.auth.getSession()
        if (controller.signal.aborted) return
        const query = new URLSearchParams({ room, q: brand.trim() + ' ' + model.trim() })
        const response = await fetch('/api/images?' + query, {
          headers: { Authorization: 'Bearer ' + data.session?.access_token },
          signal: controller.signal,
        })
        const body = await response.json() as { error?: string; results?: ImageResult[] }
        if (controller.signal.aborted) return
        setResults(body.results ?? [])
        setSearchMessage(body.error ?? (body.results?.length ? '' : 'Keine Bilder gefunden.'))
      } catch {
        if (!controller.signal.aborted) setSearchMessage('Die Bildsuche ist gerade nicht verfügbar.')
      }
    }, 650)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [draft.kind, brand, model, room, revision])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const get = (name: string) => String(form.get(name) ?? '').trim()
    const id = draft.item?.id ?? crypto.randomUUID()
    let newPath: string | undefined
    setBusy(true)
    setError('')
    try {
      const fields: Record<string, unknown> = {}
      if (draft.kind === 'grinders') {
        const minimum = decimal(get('minimum'))
        const maximum = decimal(get('maximum'))
        const step = decimal(get('step'))
        if (!brand.trim() || !model.trim() || minimum === null || maximum === null || step === null
            || minimum < -100000 || maximum > 100000 || maximum <= minimum
            || step <= 0 || Math.round(step * 1_000_000) > Math.round(maximum * 1_000_000) - Math.round(minimum * 1_000_000)) {
          throw new DiaryError('Prüfe Hersteller, Modell und Skala. Die Schrittweite muss in den gewählten Bereich passen.')
        }
        Object.assign(fields, { brand: brand.trim(), model: model.trim(), minimum, maximum, step })
        if (selected && !accepted) throw new DiaryError('Bestätige bitte, dass du das Bild verwenden darfst.')
        if (selected || file || clearImage) {
          Object.assign(fields, { image_url: selected?.image_url ?? null, source_url: selected?.source_url ?? null })
        }
      } else {
        const capacity = decimal(get('capacity'))
        if (!get('name') || (get('capacity') && (capacity === null || capacity <= 0 || capacity >= 1000))) {
          throw new DiaryError('Prüfe den Siebnamen und die Nennkapazität.')
        }
        Object.assign(fields, { name: get('name'), capacity })
      }
      let photo: Blob | undefined = file
      if (basketImage) {
        const response = await fetch(basketImageUrl(basketImage))
        if (!response.ok) throw new DiaryError('Das ausgewählte Siebbild konnte nicht geladen werden.')
        photo = await response.blob()
      }
      if (photo) {
        const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
        const extension = extensions[photo.type]
        if (!extension || photo.size > 5242880) throw new DiaryError('Wähle ein JPG-, PNG- oder WebP-Bild bis 5 MB.')
        newPath = room + '/' + id + '/' + crypto.randomUUID() + '.' + extension
        const result = await api.storage.from('equipment').upload(newPath, photo)
        if (result.error) throw result.error
        fields.photo_path = newPath
      } else if (selected || clearImage) fields.photo_path = null
      const result = draft.item
        ? await api.from(draft.kind).update(fields).eq('id', id).select('id').single()
        : await api.from(draft.kind).insert({ ...fields, id, room_id: room }).select('id').single()
      if (result.error) throw result.error
      const oldPath = draft.item?.photo_path
      newPath = undefined
      if (oldPath && 'photo_path' in fields && fields.photo_path !== oldPath) {
        await api.storage.from('equipment').remove([oldPath])
      }
      await onSaved()
    } catch (reason) {
      if (newPath) await api.storage.from('equipment').remove([newPath])
      setError(errorText(reason, 'Die Ausrüstung konnte nicht gespeichert werden.'))
    } finally { setBusy(false) }
  }

  return <form className="subpanel" onSubmit={submit}>
    <h3>{draft.kind === 'grinders' ? 'Mühle' : 'Sieb'} {draft.item ? 'bearbeiten' : 'hinzufügen'}</h3>
    {draft.kind === 'grinders' ? <>
      <div className="grid">
        <label>Hersteller<input required maxLength={100} value={brand} onChange={e => setBrand(e.target.value)} /></label>
        <label>Modell<input required maxLength={100} value={model} onChange={e => setModel(e.target.value)} /></label>
      </div>
      <div className="grid scales">
        <SettingNumber name="minimum" label="Minimum" initial={grinder?.minimum ?? 0} min={-100000} max={100000} step={1} />
        <SettingNumber name="maximum" label="Maximum" initial={grinder?.maximum ?? 15} min={-100000} max={100000} step={1} />
        <SettingNumber name="step" label="Schrittweite" initial={grinder?.step ?? 0.1} min={0.000001} max={100} step={0.1} />
      </div>
      <button type="button" className="quiet" disabled={!brand.trim() || !model.trim()} onClick={() => setRevision(value => value + 1)}>Bilder suchen</button>
      <Notice>{searchMessage}</Notice>
      {results.length > 0 && <div className="search-results">{results.map((result, index) =>
        <div key={result.image_url + index}>
          <button type="button" aria-pressed={selected?.image_url === result.image_url} onClick={() => {
            setSelected(result); setFile(undefined); setClearImage(false); setAccepted(false)
          }}><Photo url={result.image_url} /><span>{result.title || 'Bild ' + (index + 1)}</span></button>
          <a href={result.source_url} target="_blank" rel="noreferrer">Quelle</a>
        </div>)}</div>}
    </> : <>
      <div className="basket-fields">
        <label>Name<input name="name" required maxLength={100} defaultValue={basket?.name} /></label>
        <SettingNumber name="capacity" label="Kapazität (g)" initial={basket?.capacity ?? 18} min={0.1} max={999} step={0.1} />
      </div>
      <fieldset disabled={busy}>
        <legend>Siebbild auswählen</legend>
        <div className="tiles basket-images">{basketImages.map(image =>
          <button key={image.id} type="button" aria-label={image.name} title={image.name}
            aria-pressed={basketImage === image.id} onClick={() => {
            setBasketImage(image.id)
            setFile(undefined)
            setClearImage(false)
          }}>
            <Photo url={basketImageUrl(image.id)} />
          </button>)}</div>
      </fieldset>
    </>}
    <PhotoPicker photo={file ?? (!clearImage && !basketImage && !selected ? draft.item?.photo : undefined)}
      url={basketImage ? basketImageUrl(basketImage) : selected?.image_url ?? (!file && !clearImage ? grinder?.image_url : null)}
      hasPhoto={hasImage} busy={busy} label={draft.kind === 'grinders' ? 'Mühlenfoto' : 'Siebfoto'}
      onPhoto={photo => { setFile(photo); setBasketImage(undefined); setSelected(undefined); setClearImage(false); setAccepted(false) }}
      onRemove={() => { setSelected(undefined); setBasketImage(undefined); setFile(undefined); setClearImage(true) }} onError={setError} />
    {selected && <label className="check"><input type="checkbox" required checked={accepted}
      onChange={e => setAccepted(e.target.checked)} />Ich darf dieses Bild verwenden.</label>}
    <Notice>{error}</Notice>
    <div className="actions"><button className="primary" disabled={busy}>Speichern</button>
      <button type="button" className="quiet" disabled={busy} onClick={onClose}>Abbrechen</button></div>
  </form>
}

function SettingsGroup({ title, subtitle, icon, children }: { title: string; subtitle: string; icon: string; children: ReactNode }) {
  return <details className="settings-group"><summary><span className="settings-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg></span><span className="settings-label"><strong>{title}</strong><small>{subtitle}</small></span><span className="settings-chevron" aria-hidden="true">›</span></summary><div className="settings-content">{children}</div></details>
}

export function Admin({ data, refresh }: { data: RoomData; refresh: () => Promise<void> }) {
  const [draft, setDraft] = useState<EquipmentDraft>()
  const [error, setError] = useState('')
  const [invite, setInvite] = useState('')
  const [passwordNotice, setPasswordNotice] = useState('')
  const [profileName, setProfileName] = useState('')
  const [busy, setBusy] = useState(false)
  const { room } = data
  const inviteLink = (id: string) => new URL('/?einladung=' + id, location.origin).href

  async function change(request: () => PromiseLike<{ error: unknown }>) {
    setError('')
    setBusy(true)
    try {
      const { error: problem } = await request()
      if (problem) throw problem
      await refresh()
      return true
    } catch (reason) { setError(errorText(reason)); return false }
    finally { setBusy(false) }
  }

  return <section className="admin settings-hub" aria-label="Raumeinstellungen">
    <Notice>{error}</Notice>
    <span className="settings-category">DEIN SETUP</span>
    <SettingsGroup title="Mühlen" subtitle={data.grinders.filter(item => !item.archived).length + ' aktiv · Mahlgrad & Skala'} icon="M6 3h12l-2 6H8L6 3Zm2 6v4h8V9M7 13h10v8H7v-8Zm3 4h4"><div className="section-heading"><h3>Mühlen</h3>
        <button type="button" onClick={() => setDraft({ kind: 'grinders' })}>Hinzufügen</button></div>
        <ul className="admin-list">{data.grinders.map(item => <li key={item.id}>
          <Photo photo={item.photo} url={item.image_url} /><span>{grinderName(item)}{item.archived && <small>Archiviert</small>}
            {item.source_url && <small><a href={item.source_url} target="_blank" rel="noreferrer">Bildquelle</a></small>}</span>
          <button type="button" className="quiet" onClick={() => setDraft({ kind: 'grinders', item })}>Bearbeiten</button>
          <button type="button" className="quiet" disabled={busy} onClick={() => void change(() =>
            api.from('grinders').update({ archived: !item.archived }).eq('id', item.id))}>
            {item.archived ? 'Aktivieren' : 'Archivieren'}
          </button>
        </li>)}</ul>
      {draft?.kind === 'grinders' && <EquipmentForm key={'grinders' + (draft.item?.id ?? '')} draft={draft} room={room.id} onClose={() => setDraft(undefined)} onSaved={async () => { setDraft(undefined); await refresh() }} />}
    </SettingsGroup>
    <SettingsGroup title="Siebe" subtitle={data.baskets.filter(item => !item.archived).length + ' aktiv · Größe & Kapazität'} icon="M3 7h18M5 7l2 13h10l2-13M8 11h8M9 15h6"><div className="section-heading"><h3>Siebe</h3>
        <button type="button" onClick={() => setDraft({ kind: 'baskets' })}>Hinzufügen</button></div>
        <ul className="admin-list">{data.baskets.map(item => <li key={item.id}>
          <Photo photo={item.photo} /><span>{item.name}{item.archived && <small>Archiviert</small>}</span>
          <button type="button" className="quiet" onClick={() => setDraft({ kind: 'baskets', item })}>Bearbeiten</button>
          <button type="button" className="quiet" disabled={busy} onClick={() => void change(() =>
            api.from('baskets').update({ archived: !item.archived }).eq('id', item.id))}>
            {item.archived ? 'Aktivieren' : 'Archivieren'}
          </button>
        </li>)}</ul>
      {draft?.kind === 'baskets' && <EquipmentForm key={'baskets' + (draft.item?.id ?? '')} draft={draft} room={room.id} onClose={() => setDraft(undefined)} onSaved={async () => { setDraft(undefined); await refresh() }} />}
    </SettingsGroup>
    <SettingsGroup title="Bezugsprofile" subtitle={data.profiles.filter(item => !item.archived).length + ' aktiv · Dein Espresso nach deinem Geschmack'} icon="M3 17l5-9 5 5 5-9 3 3M3 21h18">
      <form className="inline" onSubmit={async e => {
        e.preventDefault()
        if (await change(() => api.from('profiles').insert({ room_id: room.id, name: profileName.trim() }))) setProfileName('')
      }}><label>Profilname<input value={profileName} onChange={e => setProfileName(e.target.value)} required maxLength={100} /></label>
        <button disabled={busy}>Hinzufügen</button></form>
      <ul className="admin-list">{data.profiles.map(item => <li key={item.id}>
        <span>{item.name}{item.archived && <small>Archiviert</small>}</span>
        <button type="button" className="quiet" disabled={busy} onClick={() => void change(() =>
          api.from('profiles').update({ archived: !item.archived }).eq('id', item.id))}>
          {item.archived ? 'Aktivieren' : 'Archivieren'}
        </button>
      </li>)}</ul>
    </SettingsGroup>
    <SettingsGroup title="Import" subtitle={room.gaggimate ? 'GaggiMate ist aktiviert' : 'GaggiMate verbinden'} icon="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5">
    <label className="check settings-switch"><input type="checkbox" checked={room.gaggimate} disabled={busy} onChange={e => {
      const gaggimate = e.target.checked
      void change(() => api.from('rooms').update({ gaggimate }).eq('id', room.id))
    }} role="switch" /> <span><strong>GaggiMate-Import</strong><small>Bezüge aus deiner Maschine übernehmen</small></span></label>
    </SettingsGroup>
    <span className="settings-category">GEMEINSAM KAFFEE MACHEN</span>
    <SettingsGroup title="Raum teilen" subtitle="Raumlink & Passwort" icon="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2">
      <label>Raumlink<input readOnly value={new URL('/?raum=' + room.id, location.origin).href}
        onFocus={e => e.target.select()} /></label>
      <p>Teile den Link und das Raumpasswort. Ein neues Passwort gilt für künftige Beitritte.</p>
      <form className="inline" onSubmit={async event => {
        event.preventDefault()
        const form = event.currentTarget
        const room_password = String(new FormData(form).get('password') ?? '')
        setPasswordNotice('')
        try { validateRoomPassword(room_password) }
        catch (reason) { setPasswordNotice(errorText(reason)); return }
        if (await change(() => api.rpc('set_room_password', { target: room.id, room_password }))) {
          form.reset()
          setPasswordNotice('Raumpasswort gespeichert.')
        }
      }}>
        <label>Neues Raumpasswort<input name="password" type="password" autoComplete="new-password"
          required minLength={8} maxLength={72} /></label>
        <button disabled={busy}>Passwort speichern</button>
      </form>
      <Notice>{passwordNotice}</Notice>
    </SettingsGroup>
    <SettingsGroup title="Mitglieder" subtitle={data.members.length + ' im Raum · Einladungen verwalten'} icon="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21v-2a7 7 0 0 1 14 0v2M17 3a4 4 0 0 1 0 8m2 4a7 7 0 0 1 3 6">
      <div className="section-heading"><h3>Mitglieder</h3>
        <button type="button" disabled={busy} onClick={() => void change(async () => {
          const result = await api.from('invites').insert({ room_id: room.id }).select('id').single()
          if (result.data) setInvite(inviteLink(result.data.id))
          return result
        })}>Einladungslink erstellen</button></div>
      {invite && <label>Einladungslink<input readOnly value={invite} onFocus={e => e.target.select()} /></label>}
      <ul className="admin-list">{data.members.map(member => <li key={member.user_id}>
        <span>{member.name}{member.admin && <small>Admin</small>}</span>
        {!member.admin && <button type="button" className="quiet" disabled={busy} onClick={() => {
          if (confirm(member.name + ' aus dem Raum entfernen?')) void change(() =>
            api.from('members').delete().eq('room_id', room.id).eq('user_id', member.user_id))
        }}>Entfernen</button>}
      </li>)}</ul>
      {data.invites.some(link => !link.used_at && !link.revoked_at && Date.parse(link.expires_at) > Date.now()) && <>
        <h3>Offene Einladungen</h3>
        <ul className="admin-list">{data.invites.filter(link => !link.used_at && !link.revoked_at && Date.parse(link.expires_at) > Date.now()).map(link =>
          <li key={link.id}><span>Gültig bis {new Date(link.expires_at).toLocaleDateString('de-DE')}</span>
            <button type="button" className="quiet" onClick={() => setInvite(inviteLink(link.id))}>Link anzeigen</button>
            <button type="button" className="quiet" disabled={busy} onClick={() => void change(async () => {
              const result = await api.from('invites').update({ revoked_at: new Date().toISOString() }).eq('id', link.id)
              if (!result.error && invite === inviteLink(link.id)) setInvite('')
              return result
            })}>Widerrufen</button></li>)}</ul>
      </>}
    </SettingsGroup>
  </section>
}
