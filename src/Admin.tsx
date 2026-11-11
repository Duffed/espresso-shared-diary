import { useEffect, useState, type FormEvent } from 'react'
import { api } from './data'
import { decimal, DiaryError, formatNumber, grinderName, type Basket, type Grinder, type ImageResult, type RoomData } from './model'
import { errorText, Notice, Photo } from './ui'

type EquipmentDraft = { kind: 'grinders'; item?: Grinder } | { kind: 'baskets'; item?: Basket }

function EquipmentForm({ draft, room, onClose, onSaved }: {
  draft: EquipmentDraft; room: string; onClose: () => void; onSaved: () => Promise<void>
}) {
  const grinder = draft.kind === 'grinders' ? draft.item : undefined
  const basket = draft.kind === 'baskets' ? draft.item : undefined
  const [brand, setBrand] = useState(grinder?.brand ?? '')
  const [model, setModel] = useState(grinder?.model ?? '')
  const [file, setFile] = useState<File>()
  const [selected, setSelected] = useState<ImageResult>()
  const [accepted, setAccepted] = useState(false)
  const [clearImage, setClearImage] = useState(false)
  const [results, setResults] = useState<ImageResult[]>([])
  const [searchMessage, setSearchMessage] = useState('')
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

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
        const diameter = decimal(get('diameter'))
        if (!get('name') || (get('capacity') && (capacity === null || capacity <= 0 || capacity >= 1000))
          || (get('diameter') && (diameter === null || diameter <= 0 || diameter >= 1000))) {
          throw new DiaryError('Prüfe den Siebnamen, die Nennkapazität und den Durchmesser.')
        }
        Object.assign(fields, { name: get('name'), capacity, diameter, shape: get('shape') })
      }
      if (file) {
        const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
        const extension = extensions[file.type]
        if (!extension || file.size > 5242880) throw new DiaryError('Wähle ein JPG-, PNG- oder WebP-Bild bis 5 MB.')
        newPath = room + '/' + id + '/' + crypto.randomUUID() + '.' + extension
        const result = await api.storage.from('equipment').upload(newPath, file)
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
        <label>Minimum<input name="minimum" inputMode="decimal" defaultValue={formatNumber(grinder?.minimum ?? 0)} required /></label>
        <label>Maximum<input name="maximum" inputMode="decimal" defaultValue={formatNumber(grinder?.maximum ?? 15)} required /></label>
        <label>Schrittweite<input name="step" inputMode="decimal" defaultValue={formatNumber(grinder?.step ?? 0.1)} required /></label>
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
      <label>Name<input name="name" required maxLength={100} defaultValue={basket?.name} /></label>
      <div className="grid">
        <label>Nennkapazität (g)<input name="capacity" inputMode="decimal" defaultValue={basket?.capacity == null ? '' : formatNumber(basket.capacity)} /></label>
        <label>Durchmesser (mm)<input name="diameter" inputMode="decimal" defaultValue={basket?.diameter == null ? '' : formatNumber(basket.diameter)} /></label>
      </div>
      <label>Bauform<input name="shape" maxLength={100} defaultValue={basket?.shape} /></label>
    </>}
    <div className="photo-edit">
      <Photo photo={file ?? (!selected && !clearImage ? draft.item?.photo : undefined)}
        url={selected?.image_url ?? (!file && !clearImage ? grinder?.image_url : null)} />
      <label>Eigenes Foto<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => {
        const upload = e.target.files?.[0]
        e.target.value = ''
        if (upload) { setFile(upload); setSelected(undefined); setClearImage(false) }
      }} /></label>
      {file && <small>{file.name}</small>}
      <button type="button" className="quiet" onClick={() => {
        setSelected(undefined); setFile(undefined); setClearImage(true)
      }}>Bild entfernen</button>
    </div>
    {selected && <label className="check"><input type="checkbox" required checked={accepted}
      onChange={e => setAccepted(e.target.checked)} />Ich darf dieses Bild verwenden.</label>}
    <Notice>{error}</Notice>
    <div className="actions"><button className="primary" disabled={busy}>Speichern</button>
      <button type="button" className="quiet" disabled={busy} onClick={onClose}>Abbrechen</button></div>
  </form>
}

export function Admin({ data, refresh }: { data: RoomData; refresh: () => Promise<void> }) {
  const [draft, setDraft] = useState<EquipmentDraft>()
  const [error, setError] = useState('')
  const [invite, setInvite] = useState('')
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

  return <section className="panel admin">
    <h2>Raum verwalten</h2>
    <Notice>{error}</Notice>
    <label className="check"><input type="checkbox" checked={room.gaggimate} disabled={busy} onChange={e => {
      const gaggimate = e.target.checked
      void change(() => api.from('rooms').update({ gaggimate }).eq('id', room.id))
    }} />GaggiMate-Import erlauben</label>
    <div className="admin-columns">
      <section><div className="section-heading"><h3>Mühlen</h3>
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
      </section>
      <section><div className="section-heading"><h3>Siebe</h3>
        <button type="button" onClick={() => setDraft({ kind: 'baskets' })}>Hinzufügen</button></div>
        <ul className="admin-list">{data.baskets.map(item => <li key={item.id}>
          <Photo photo={item.photo} /><span>{item.name}{item.archived && <small>Archiviert</small>}</span>
          <button type="button" className="quiet" onClick={() => setDraft({ kind: 'baskets', item })}>Bearbeiten</button>
          <button type="button" className="quiet" disabled={busy} onClick={() => void change(() =>
            api.from('baskets').update({ archived: !item.archived }).eq('id', item.id))}>
            {item.archived ? 'Aktivieren' : 'Archivieren'}
          </button>
        </li>)}</ul>
      </section>
    </div>
    {draft && <EquipmentForm key={draft.kind + (draft.item?.id ?? '')} draft={draft} room={room.id}
      onClose={() => setDraft(undefined)} onSaved={async () => { setDraft(undefined); await refresh() }} />}
    <section>
      <h3>Profile</h3>
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
    </section>
    <section>
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
    </section>
  </section>
}
