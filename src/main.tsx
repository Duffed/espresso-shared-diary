import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { Admin } from './Admin'
import { ShotForm } from './ShotForm'
import { api, cachedRoom, cachedRooms, configured, loadRoom, loadRooms,
  pendingShots, removePending, savePending, syncPending } from './data'
import { DiaryError, formatNumber, grinderName, type Pending, type Room, type RoomData, type Shot, type ShotFields } from './model'
import { errorText, Notice } from './ui'
import '@fontsource-variable/dm-sans'
import '@fontsource/instrument-serif/400.css'
import './style.css'

const timestamp = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
const inviteToken = () => new URLSearchParams(location.search).get('einladung')
const isUuid = (value: string) => /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value)

function clearInvitation() {
  const url = new URL(location.href)
  url.searchParams.delete('einladung')
  history.replaceState(null, '', url)
}

function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = sent
        ? await api.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
        : await api.auth.signInWithOtp({ email: email.trim() })
      if (result.error) throw result.error
      setSent(true)
    } catch {
      setError(sent ? 'Der Code ist ungültig oder abgelaufen. Du kannst einen neuen anfordern.'
        : 'Der Code konnte nicht gesendet werden. Prüfe deine E-Mail-Adresse und Verbindung.')
    } finally { setBusy(false) }
  }
  return <main className="welcome">
    <div className="welcome-copy"><span className="brand-mark" aria-hidden="true"><Cup /></span>
      <h1>Espresso<br />Diary<span>.</span></h1>
      <p>Halte deine Bezüge fest und teile sie mit den Menschen, mit denen du Kaffee machst.</p></div>
    <section className="panel login">
      <h2>Anmelden</h2>
      {inviteToken() && <p>Melde dich an, um die Einladung anzunehmen.</p>}
      {!configured && <Notice>Die Anmeldung ist noch nicht eingerichtet.</Notice>}
      <form onSubmit={submit}>
        <label>E-Mail-Adresse<input type="email" autoComplete="email" required value={email} readOnly={sent}
          placeholder="du@beispiel.de" onChange={e => setEmail(e.target.value)} /></label>
        {sent && <label>Code aus der E-Mail<input inputMode="numeric" autoComplete="one-time-code" required
          value={code} onChange={e => setCode(e.target.value)} /></label>}
        <Notice>{error}</Notice>
        <button className="primary" disabled={!configured || busy}>{busy ? 'Bitte warten …' : sent ? 'Anmelden' : 'Code senden'}</button>
        {sent && <button type="button" className="quiet" onClick={() => { setSent(false); setCode(''); setError('') }}>Neuen Code anfordern</button>}
      </form>
    </section>
  </main>
}

function Cup() {
  return <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path d="M6 12h17v5a8.5 8.5 0 0 1-17 0v-5Zm17 2h3a2.5 2.5 0 0 1 0 5h-3M5 27h21M12 5v3m6-5v5"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}

function RoomForm({ token, onDone, onCancel }: {
  token: string | null; onDone: (room: string) => void; onCancel: () => void
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const display_name = String(form.get('display') ?? '').trim()
    const room_name = String(form.get('room') ?? '').trim()
    setBusy(true)
    setError('')
    try {
      if (!display_name || (!token && !room_name)) throw new DiaryError('Bitte fülle beide Namensfelder aus.')
      if (token && !isUuid(token)) throw new DiaryError('Der Einladungslink ist ungültig.')
      const { data, error: problem } = token
        ? await api.rpc('accept_invite', { token, display_name })
        : await api.rpc('create_room', { room_name, display_name })
      if (problem) throw problem
      onDone(data as string)
    } catch (reason) { setError(errorText(reason)) }
    finally { setBusy(false) }
  }
  return <section className="panel room-form">
    <h2>{token ? 'Einladung annehmen' : 'Raum erstellen'}</h2>
    <form onSubmit={submit}>
      {!token && <label>Raumname<input name="room" required maxLength={100} /></label>}
      <label>Dein Name im Raum<input name="display" autoComplete="nickname" required maxLength={80} /></label>
      <Notice>{error}</Notice>
      <div className="actions"><button className="primary" disabled={busy}>{token ? 'Raum beitreten' : 'Raum erstellen'}</button>
        <button type="button" className="quiet" onClick={onCancel}>Abbrechen</button></div>
    </form>
  </section>
}

function RoomView({ room, user, online, pending, synchronize }: {
  room: string; user: string; online: boolean; pending: Pending[]; synchronize: () => Promise<void>
}) {
  const [data, setData] = useState<RoomData>()
  const [error, setError] = useState('')
  const [page, setPage] = useState<'history' | 'settings'>('history')
  const [form, setForm] = useState<true | Shot>()
  const refreshInProgress = useRef<Promise<void> | null>(null)
  const active = useRef(false)

  const refresh = useCallback(async () => {
    if (!navigator.onLine) return
    if (refreshInProgress.current) return refreshInProgress.current
    const task = (async () => {
      try {
        const next = await loadRoom(user, room)
        if (active.current) { setData(next); setError('') }
      } catch (reason) {
        if (!active.current) return
        if (reason instanceof DiaryError) setData(undefined)
        setError(errorText(reason, 'Der Raum konnte nicht aktualisiert werden.'))
      }
    })()
    refreshInProgress.current = task
    await task
    refreshInProgress.current = null
  }, [room, user])

  useEffect(() => {
    active.current = true
    void (async () => {
      try {
        const cache = await cachedRoom(user, room)
        if (active.current && cache) setData(cache)
      } catch {
        if (active.current) setError('Die Daten auf diesem Gerät konnten nicht geladen werden.')
      }
      if (active.current) await refresh()
    })()
    return () => { active.current = false }
  }, [refresh, room, user])

  useEffect(() => {
    if (!online) return
    void refresh()
    const channel = api.channel('room-' + room)
    for (const table of ['shots', 'grinders', 'baskets', 'profiles', 'rooms']) {
      channel.on('postgres_changes', {
        event: '*', schema: 'public', table, filter: (table === 'rooms' ? 'id' : 'room_id') + '=eq.' + room,
      }, () => void refresh())
    }
    channel.subscribe()
    const timer = window.setInterval(() => { if (!document.hidden) void refresh() }, 15000)
    return () => { window.clearInterval(timer); void api.removeChannel(channel) }
  }, [online, refresh, room])

  async function save(fields: ShotFields, importKey: string | null) {
    if (form && form !== true) {
      if (!navigator.onLine) throw new DiaryError('Zum Bearbeiten brauchst du eine Internetverbindung.')
      const result = await api.from('shots').update(fields).eq('id', form.id).eq('version', form.version)
        .select('id').maybeSingle()
      if (result.error) throw result.error
      if (!result.data) {
        await refresh()
        throw new DiaryError('Der Bezug wurde inzwischen geändert. Schließe das Formular und öffne den aktuellen Eintrag.')
      }
    } else {
      if (importKey && !data?.room.gaggimate) throw new DiaryError('GaggiMate ist in diesem Raum ausgeschaltet.')
      const author = data?.members.find(member => member.user_id === user)?.name
      if (!author) throw new DiaryError('Du hast keinen Zugriff mehr auf diesen Raum.')
      await savePending({ user, author, shot: { ...fields, id: crypto.randomUUID(), room_id: room, import_key: importKey } })
    }
    setForm(undefined)
    await synchronize()
    await refresh()
  }

  async function deleteShot(shot: Shot) {
    if (!confirm('Diesen Bezug löschen?')) return
    const result = await api.from('shots').update({ deleted_at: new Date().toISOString() })
      .eq('id', shot.id).eq('version', shot.version).select('id').maybeSingle()
    await refresh()
    if (result.error || !result.data) setError('Der Bezug konnte nicht gelöscht werden. Prüfe den aktuellen Stand.')
  }

  async function discardPending(item: Pending) {
    if (!confirm('Den lokal gespeicherten Bezug verwerfen?')) return
    try {
      await removePending(user, item.shot.id)
      await synchronize()
    } catch { setError('Der lokale Bezug konnte nicht entfernt werden.') }
  }

  const queued = pending.filter(item => item.shot.room_id === room)
  if (!data) return <section className="panel"><Notice>{error || (online ? 'Raum wird geladen …' : 'Dieser Raum wurde auf diesem Gerät noch nicht geladen.')}</Notice>
    <ul className="admin-list">{queued.map(item => <li key={item.shot.id}>
      <span>{timestamp.format(new Date(item.shot.brewed_at))}<small>{item.error || 'Wartet auf Synchronisierung'}</small></span>
      {item.error && <button onClick={() => void discardPending(item)}>Verwerfen</button>}
    </li>)}</ul></section>
  const admin = data.members.some(member => member.user_id === user && member.admin)
  const timeline = [...data.shots, ...queued.filter(item => !data.shots.some(shot => shot.id === item.shot.id)).map(item =>
    ({ ...item.shot, author_name: item.author, author_id: user, version: 0 }))]
    .sort((a, b) => Date.parse(b.brewed_at) - Date.parse(a.brewed_at))
  return <>
    <section className="room-heading">
      <div><h1>{data.room.name}</h1><p>{data.members.length} {data.members.length === 1 ? 'Mitglied' : 'Mitglieder'}</p></div>
      <div className="actions">
        <button className="primary" onClick={() => { setPage('history'); setForm(true) }}>＋ Neuer Bezug</button>
        {admin && online && <button onClick={() => setPage(page === 'history' ? 'settings' : 'history')}>
          {page === 'history' ? 'Raum verwalten' : 'Zur Chronik'}</button>}
      </div>
    </section>
    <Notice>{error}</Notice>
    {page === 'settings' && admin && online ? <Admin data={data} refresh={refresh} /> : <>
      {form && <ShotForm key={form === true ? 'new' : form.id} data={{ ...data, shots: timeline }} user={user}
        editing={form === true ? undefined : form} onSave={save} onClose={() => setForm(undefined)} />}
      <section className="chronicle">
        <h2>Chronik</h2>
        {timeline.length === 0 && <div className="panel empty"><Cup /><p>In diesem Raum gibt es noch keine Bezüge.</p>
          {!form && <button onClick={() => setForm(true)}>Ersten Bezug erfassen</button>}</div>}
        {timeline.map(shot => {
          const item = queued.find(entry => entry.shot.id === shot.id)
          const grinder = data.grinders.find(entry => entry.id === shot.grinder_id)
          const basket = data.baskets.find(entry => entry.id === shot.basket_id)
          const metrics = [
            ['Dosis', shot.dose, 'g'], ['Output', shot.output, 'g'],
            ['Laufzeit', shot.duration, 's'], ['Solltemperatur', shot.temperature, '°C'],
          ] as const
          return <article className="panel entry" key={shot.id}>
            <div className="section-heading"><div><h3>{shot.profile || 'Espresso'}</h3>
              <p className="meta">{timestamp.format(new Date(shot.brewed_at))} · {shot.author_name}</p></div>
              {item ? <span className="status">{item.error || 'Wartet auf Synchronisierung'}</span>
                : shot.author_id === user && online && <div className="actions">
                  <button className="quiet" onClick={() => setForm(shot)}>Bearbeiten</button>
                  <button className="quiet" onClick={() => void deleteShot(shot)}>Löschen</button>
                </div>}
            </div>
            <dl className="values">{metrics.map(([label, value, unit]) => value !== null &&
              <div key={label}><dt>{label}</dt><dd>{formatNumber(value)} <small>{unit}</small></dd></div>)}</dl>
            {(grinder || basket) && <p className="meta equipment-line">{[
              grinder && grinderName(grinder) + (shot.grind === null ? '' : ' · Mahlgrad ' + formatNumber(shot.grind)),
              basket && basket.name,
            ].filter(Boolean).join(' / ')}</p>}
            {item?.error && <button className="quiet" onClick={() => void discardPending(item)}>Lokalen Eintrag verwerfen</button>}
          </article>
        })}
      </section>
    </>}
  </>
}

function Workspace({ user }: { user: string }) {
  const [rooms, setRooms] = useState<Room[]>([])
  const [current, setCurrent] = useState(() => localStorage.getItem('room-' + user) ?? '')
  const [invitation, setInvitation] = useState(inviteToken)
  const [creating, setCreating] = useState(false)
  const [pending, setPending] = useState<Pending[]>([])
  const [online, setOnline] = useState(navigator.onLine)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const syncInProgress = useRef(Promise.resolve())

  const synchronize = useCallback(async () => {
    setPending(await pendingShots(user))
    if (!navigator.onLine) return
    const task = syncInProgress.current.catch(() => {}).then(async () => {
      await syncPending(user)
      setPending(await pendingShots(user))
    })
    syncInProgress.current = task
    await task
  }, [user])

  const refreshRooms = useCallback(async () => {
    try {
      if (!navigator.onLine) return
      setRooms(await loadRooms(user))
      setError('')
    } catch { setError('Die Räume konnten nicht aktualisiert werden.') }
    finally { setLoading(false) }
  }, [user])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const cache = await cachedRooms(user)
        if (active && cache) setRooms(cache)
      } catch {
        if (active) setError('Die Räume konnten auf diesem Gerät nicht geladen werden.')
      }
      if (active) await refreshRooms()
    })()
    function update() {
      setOnline(navigator.onLine)
      void synchronize().catch(() => setError('Die lokalen Bezüge konnten nicht synchronisiert werden.'))
      void refreshRooms()
    }
    update()
    const visible = () => { if (!document.hidden) update() }
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    document.addEventListener('visibilitychange', visible)
    const timer = window.setInterval(visible, 30000)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [refreshRooms, synchronize, user])

  const selected = rooms.find(room => room.id === current)?.id ?? rooms[0]?.id
  function selectRoom(room: string) {
    setCurrent(room)
    localStorage.setItem('room-' + user, room)
  }

  return <>
    <header className="top"><div className="top-inner">
      <a className="brand" href="/"><Cup />Espresso Diary</a>
      <div className="actions">{!online && <span className="status">Offline</span>}
        <button className="quiet" disabled={!online} onClick={() => void api.auth.signOut({ scope: 'local' }).then(({ error: problem }) => {
          if (problem) setError('Du konntest nicht abgemeldet werden.')
        })}>Abmelden</button></div>
    </div></header>
    <main className="workspace">
      <nav className="room-bar" aria-label="Räume">
        {rooms.length > 0 && <label>Raum<select value={selected} onChange={e => selectRoom(e.target.value)}>
          {rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
        </select></label>}
        {online && <button onClick={() => setCreating(true)}>＋ Raum erstellen</button>}
      </nav>
      <Notice>{error}</Notice>
      {online && (creating || invitation) && <RoomForm key={invitation ?? 'create'} token={invitation}
        onDone={id => { selectRoom(id); clearInvitation(); setInvitation(null); setCreating(false); void refreshRooms() }}
        onCancel={() => { clearInvitation(); setInvitation(null); setCreating(false) }} />}
      {selected ? <RoomView key={selected} room={selected} user={user} online={online} pending={pending} synchronize={synchronize} />
        : !creating && !invitation && <div className="panel empty"><Cup /><h1>Deine Räume</h1>
          <p>{loading ? 'Räume werden geladen …' : online ? 'Erstelle einen Raum oder öffne einen Einladungslink.' : 'Auf diesem Gerät ist noch kein Raum offline verfügbar.'}</p></div>}
      {pending.filter(item => !rooms.some(room => room.id === item.shot.room_id)).map(item =>
        <div className="panel orphan" key={item.shot.id}>
          <span>{timestamp.format(new Date(item.shot.brewed_at))} · {item.error || 'Wartet auf Synchronisierung'}</span>
          {item.error && <button className="quiet" onClick={() => {
            if (confirm('Den lokal gespeicherten Bezug verwerfen?')) {
              void removePending(user, item.shot.id).then(synchronize).catch(() => setError('Der lokale Bezug konnte nicht entfernt werden.'))
            }
          }}>Verwerfen</button>}
        </div>)}
    </main>
  </>
}

function App() {
  const [user, setUser] = useState<string | null | undefined>()
  useEffect(() => {
    const accountKey = 'last-signed-in-account'
    if (!navigator.onLine) setUser(localStorage.getItem(accountKey))
    const { data } = api.auth.onAuthStateChange((event, session) => {
      if (session) localStorage.setItem(accountKey, session.user.id)
      if (event === 'SIGNED_OUT') localStorage.removeItem(accountKey)
      setUser(session?.user.id ?? (navigator.onLine ? null : localStorage.getItem(accountKey)))
    })
    function reconnect() {
      void api.auth.getSession().then(({ data: current, error }) => {
        if (!error) setUser(current.session?.user.id ?? null)
      })
    }
    window.addEventListener('online', reconnect)
    return () => {
      data.subscription.unsubscribe()
      window.removeEventListener('online', reconnect)
    }
  }, [])
  if (user === undefined) return <main className="workspace"><p role="status">Espresso Diary wird geöffnet …</p></main>
  return user ? <Workspace key={user} user={user} /> : <Login />
}

createRoot(document.getElementById('root')!).render(<App />)
