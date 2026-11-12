import { BeanIcon, HistoryIcon, SettingsIcon } from './Icons'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { BeanPhoto, Beans } from './Beans'
import { Admin } from './Admin'
import { Appearance } from './Appearance'
import { ShotRating } from './ShotRating'
import { ShotForm } from './ShotForm'
import { api, cachedRoom, cachedRooms, configured, loadRoom, loadRooms,
  pendingShots, removePending, savePending, syncPending } from './data'
import { DiaryError, formatNumber, grinderName, validateRoomPassword, type Pending, type Room, type RoomData, type Shot, type ShotFields } from './model'
import { errorText, Notice } from './ui'
import '@fontsource-variable/dm-sans'
import '@fontsource/instrument-serif/400.css'
import './style.css'

const timestamp = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
const inviteKey = 'espresso-diary-invitation'
type Invitation = { kind: 'room' | 'once'; id: string }
function getInvitation(): Invitation | null {
  const query = new URLSearchParams(location.search)
  const room = query.get('raum')
  const token = query.get('einladung')
  const current = room ? { kind: 'room' as const, id: room } : token ? { kind: 'once' as const, id: token } : null
  if (current) return current
  const saved = sessionStorage.getItem(inviteKey)
  if (!saved) return null
  const [kind, id] = saved.split(':')
  return (kind === 'room' || kind === 'once') && isUuid(id ?? '') ? { kind, id } : null
}
const isUuid = (value: string) => /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value)

function clearInvitation() {
  const url = new URL(location.href)
  url.searchParams.delete('einladung')
  url.searchParams.delete('raum')
  sessionStorage.removeItem(inviteKey)
  history.replaceState(null, '', url)
}

function Login() {
  const invitation = getInvitation()
  const [error, setError] = useState(() => new URLSearchParams(location.search).has('error') || /(?:^#|&)error=/.test(location.hash)
    ? 'Die Google-Anmeldung wurde abgebrochen oder ist fehlgeschlagen.' : '')
  const [busy, setBusy] = useState(false)
  async function signIn() {
    setBusy(true)
    setError('')
    try {
      if (invitation && isUuid(invitation.id)) sessionStorage.setItem(inviteKey, invitation.kind + ':' + invitation.id)
      const { data, error: problem } = await api.auth.signInWithOAuth({
        provider: 'google', options: { redirectTo: location.origin + '/', skipBrowserRedirect: true },
      })
      if (problem || !data.url) throw problem
      location.assign(data.url)
    } catch {
      setError('Die Google-Anmeldung konnte nicht gestartet werden. Bitte versuche es erneut.')
      setBusy(false)
    }
  }
  return <main className="welcome">
    <div className="welcome-copy"><span className="brand-mark" aria-hidden="true"><Cup /></span>
      <h1>Espresso<br />Diary<span>.</span></h1>
      <p>Halte deine Bezüge fest und teile sie mit den Menschen, mit denen du Kaffee machst.</p></div>
    <section className="panel login">
      <h2>Anmelden</h2>
      {invitation && <p>Melde dich an, um dem Raum beizutreten.</p>}
      {!configured && <Notice>Die Anmeldung ist noch nicht eingerichtet.</Notice>}
      <Notice>{error}</Notice>
      <button className="primary" disabled={!configured || busy} onClick={() => void signIn()}>
        {busy ? 'Google wird geöffnet …' : 'Mit Google anmelden'}
      </button>
    </section>
  </main>
}

function Cup() {
  return <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path d="M6 12h17v5a8.5 8.5 0 0 1-17 0v-5Zm17 2h3a2.5 2.5 0 0 1 0 5h-3M5 27h21M12 5v3m6-5v5"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}

function RoomForm({ invitation, onDone, onCancel }: {
  invitation: Invitation | null; onDone: (room: string) => void; onCancel: () => void
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const display_name = String(form.get('display') ?? '').trim()
    const room_name = String(form.get('room') ?? '').trim()
    const room_password = String(form.get('password') ?? '')
    setBusy(true)
    setError('')
    try {
      if (!display_name || (!invitation && !room_name)) throw new DiaryError('Bitte fülle die Namensfelder aus.')
      if (invitation && !isUuid(invitation.id)) throw new DiaryError('Der Einladungslink ist ungültig.')
      if (invitation?.kind !== 'once') validateRoomPassword(room_password)
      const { data, error: problem } = invitation?.kind === 'once'
        ? await api.rpc('accept_invite', { token: invitation.id, display_name })
        : invitation
          ? await api.rpc('join_password_room', { target: invitation.id, display_name, room_password })
          : await api.rpc('create_password_room', { room_name, display_name, room_password })
      if (problem) throw problem
      if (invitation?.kind === 'room' && data !== 'joined') {
        throw new DiaryError(data === 'limited' ? 'Zu viele Versuche. Warte bis zu 15 Minuten und versuche es erneut.'
          : 'Der Raumlink oder das Raumpasswort ist ungültig.')
      }
      onDone(invitation?.kind === 'room' ? invitation.id : data as string)
    } catch (reason) { setError(errorText(reason)) }
    finally { setBusy(false) }
  }
  return <section className="panel room-form">
    <h2>{invitation ? 'Raum beitreten' : 'Raum erstellen'}</h2>
    <form onSubmit={submit}>
      {!invitation && <label>Raumname<input name="room" required maxLength={100} /></label>}
      <label>Dein Name im Raum<input name="display" autoComplete="nickname" required maxLength={80} /></label>
      {invitation?.kind !== 'once' && <label>Raumpasswort<input name="password" type="password"
        autoComplete={invitation ? 'current-password' : 'new-password'} required minLength={8} maxLength={72} />
        {!invitation && <small>Mindestens 8 Zeichen. Teile das Passwort mit deinen Freunden.</small>}</label>}
      <Notice>{error}</Notice>
      <div className="actions"><button className="primary" disabled={busy}>{invitation ? 'Raum beitreten' : 'Raum erstellen'}</button>
        <button type="button" className="quiet" onClick={onCancel}>Abbrechen</button></div>
    </form>
  </section>
}

function RoomView({ room, user, online, pending, synchronize }: {
  room: string; user: string; online: boolean; pending: Pending[]; synchronize: () => Promise<void>
}) {
  const [data, setData] = useState<RoomData>()
  const [error, setError] = useState('')
  const [page, setPage] = useState<'home' | 'history' | 'beans' | 'settings'>('home')
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
    for (const table of ['shots', 'grinders', 'baskets', 'profiles', 'beans', 'rooms']) {
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
    setPage('home')
    await synchronize()
    await refresh()
  }

  async function rateShot(shot: Shot, rating: number | null) {
    if (!navigator.onLine) throw new DiaryError('Zum Bewerten brauchst du eine Internetverbindung.')
    const result = await api.from('shots').update({ rating }).eq('id', shot.id).eq('version', shot.version).select('*').maybeSingle<Shot>()
    if (result.error) {
      if (['42703', 'PGRST204'].includes(result.error.code)) throw new DiaryError('Die Bewertungsfunktion muss noch in der Datenbank eingerichtet werden.')
      throw result.error
    }
    if (!result.data) { await refresh(); throw new DiaryError('Der Bezug wurde inzwischen geändert. Bitte wähle deine Bewertung erneut.') }
    const updated = result.data
    setData(previous => previous ? { ...previous, shots: previous.shots.map(item => item.id === updated.id ? updated : item) } : previous)
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
    {!form && <h1 className="page-title">{page === 'home' ? data.room.name : ({ history: 'Verlauf', beans: 'Bohnen', settings: 'Einstellungen' })[page]}</h1>}
    <Notice>{error}</Notice>
    {form ? <ShotForm key={form === true ? 'new' : form.id} data={{ ...data, shots: timeline }} user={user} refresh={refresh}
      editing={form === true ? undefined : form} onSave={save} onClose={() => setForm(undefined)} /> : <>
    {page === 'home' && <section className="home-screen">
      <button className="brew-hero" onClick={() => setForm(true)}><span className="hero-cup"><Cup /></span><span><small>Zeit für Espresso</small><strong>Neuer Bezug</strong><span>In fünf Schritten zu deinem Kaffee</span></span><b>＋</b></button>
      <div className="home-links"><button onClick={() => setPage('history')}><span><HistoryIcon /></span><strong>Verlauf</strong><small>{timeline.length} Bezüge entdecken →</small></button><button onClick={() => setPage('beans')}><span><BeanIcon /></span><strong>Deine Bohnen</strong><small>{data.beans?.length ?? 0} Kaffeesorten →</small></button></div>
      <div className="section-heading"><h2>Letzte Bezüge</h2>{timeline.length > 0 && <button className="quiet" onClick={() => setPage('history')}>Alle ansehen →</button>}</div>
    </section>}
    {page === 'beans' && <Beans data={data} refresh={refresh} hideHeading />}
    {page === 'settings' && <><Appearance />{admin && online ? <Admin data={data} refresh={refresh} /> : <p className="panel">{online ? 'Die Raumeinstellungen werden von deinem Raum-Admin verwaltet.' : 'Zum Ändern der Einstellungen brauchst du eine Internetverbindung.'}</p>}</>}
    {(page === 'history' || page === 'home') && <>
      <section className="chronicle">
        <div className="section-heading">{page === 'history' && <><button className="primary" onClick={() => setForm(true)}>＋ Neuer Bezug</button></>}</div>
        {timeline.length === 0 && <div className="panel empty"><Cup /><p>In diesem Raum gibt es noch keine Bezüge.</p>
          {!form && <button onClick={() => setForm(true)}>Ersten Bezug erfassen</button>}</div>}
        {(page === 'home' ? timeline.slice(0, 10) : timeline).map(shot => {
          const item = queued.find(entry => entry.shot.id === shot.id)
          const grinder = data.grinders.find(entry => entry.id === shot.grinder_id)
          const basket = data.baskets.find(entry => entry.id === shot.basket_id)
          const bean = data.beans?.find(bean => bean.id === shot.bean_id)
          return <article className="panel entry history-entry" key={shot.id} onClick={event => {
            if ((event.target as Element).closest('button, a, input, select, textarea, summary, .shot-rating')) return
            const details = event.currentTarget.querySelector('details')
            if (details) details.open = !details.open
          }}>
            <div className="entry-summary">
              <div className="entry-photo">{bean ? <BeanPhoto bean={bean} /> : <span className="bean-symbol" aria-hidden="true"><Cup /></span>}</div>
              <div className="entry-copy"><h3>{bean?.name || shot.profile || 'Espresso'}</h3>
                <p className="meta entry-byline"><span>{timestamp.format(new Date(shot.brewed_at))}</span><span className="entry-author"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="8" r="3" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></svg>{shot.author_name}</span></p>
                <p className="entry-recipe"><span aria-label="Dosis">{shot.dose == null ? '–' : formatNumber(shot.dose)} <small>g</small></span><span aria-hidden="true">→</span><span aria-label="Output">{shot.output == null ? '–' : formatNumber(shot.output)} <small>g</small></span><span className="recipe-divider" aria-hidden="true">·</span><span aria-label="Laufzeit">{shot.duration == null ? '–' : formatNumber(shot.duration)} <small>s</small></span></p>
              </div>
            <ShotRating value={shot.rating ?? null} editable={shot.author_id === user && online && !item}
              unavailable={shot.author_id !== user ? undefined : item ? 'Nach Synchronisierung bewertbar' : !online ? 'Zum Bewerten online gehen' : undefined}
              onChange={rating => rateShot(shot, rating)} />
            </div>

            {item && <span className="status">{item.error || 'Wartet auf Synchronisierung'}</span>}
            <details className="entry-details"><summary aria-label="Bezugsdetails ein- oder ausklappen">Bezugsdetails ein- oder ausklappen</summary><div className="entry-detail-body">
              <p className="meta">Von {shot.author_name}{shot.profile ? ' · ' + shot.profile : ''}{shot.temperature != null ? ' · ' + formatNumber(shot.temperature) + ' °C' : ''}</p>
              {(grinder || basket) && <p className="meta equipment-line">{[
                grinder && grinderName(grinder) + (shot.grind === null ? '' : ' · Mahlgrad ' + formatNumber(shot.grind)),
                basket && basket.name,
              ].filter(Boolean).join(' / ')}</p>}
              {!item && shot.author_id === user && online && <div className="actions"><button className="quiet" onClick={() => setForm(shot)}>Bearbeiten</button><button className="quiet" onClick={() => void deleteShot(shot)}>Löschen</button></div>}
              {item?.error && <button className="quiet" onClick={() => void discardPending(item)}>Lokalen Eintrag verwerfen</button>}
            </div></details>
          </article>
        })}
      </section>
    </>}
    <button type="button" className="primary quick-brew" onClick={() => setForm(true)}><span aria-hidden="true">＋</span> Neuer Bezug</button>
    <nav className="bottom-nav" aria-label="Hauptnavigation">{([
      ['home', <Cup />, 'Start'], ['history', <HistoryIcon />, 'Verlauf'], ['beans', <BeanIcon />, 'Bohnen'], ['settings', <SettingsIcon />, 'Einstellungen'],
    ] as const).map(([id, icon, label]) => <button key={id} aria-current={page === id ? 'page' : undefined} onClick={() => setPage(id)}><span aria-hidden="true">{icon}</span>{label}</button>)}</nav>
    </>}
  </>
}

function Workspace({ user }: { user: string }) {
  const [rooms, setRooms] = useState<Room[]>([])
  const [current, setCurrent] = useState(() => localStorage.getItem('room-' + user) ?? '')
  const [invitation, setInvitation] = useState(getInvitation)
  const [accountOpen, setAccountOpen] = useState(false)
  const accountRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!accountOpen) return
    function dismiss(event: PointerEvent) { if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false) }
    function escape(event: KeyboardEvent) { if (event.key === 'Escape') { setAccountOpen(false); menuButtonRef.current?.focus() } }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape) }
  }, [accountOpen])
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
      <a className="brand app-brand" href="/">Espresso Diary</a>
      <div className="actions">{!online && <span className="status">Offline</span>}
        <div className="account-menu-anchor" ref={accountRef} onBlur={event => {
          if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setAccountOpen(false)
        }}>
          <button ref={menuButtonRef} className="quiet menu-trigger" aria-label="Menü" aria-controls="account-menu" aria-expanded={accountOpen} onClick={() => setAccountOpen(!accountOpen)}>☰</button>
          {accountOpen && <nav id="account-menu" className="account-menu" aria-label="Konto und Räume">
            <span className="eyebrow">Dein Raum</span>
            {rooms.length > 0 && <label className="menu-room-label">Raum wechseln<select value={selected} onChange={e => { selectRoom(e.target.value); setAccountOpen(false) }}>
              {rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
            </select></label>}
            <button disabled={!online} onClick={() => { setCreating(true); setAccountOpen(false) }}>＋ Raum erstellen</button>
            <div className="menu-divider" />
            <button disabled={!online} onClick={() => {
              setAccountOpen(false)
              void api.auth.signOut({ scope: 'local' }).then(({ error: problem }) => {
                if (problem) setError('Du konntest nicht abgemeldet werden.')
              })
            }}>Abmelden <span aria-hidden="true">↗</span></button>
          </nav>}
        </div>
      </div>
    </div></header>
    <main className="workspace">
      {!rooms.length && online && <div className="room-bar"><button onClick={() => setCreating(true)}>＋ Raum erstellen</button></div>}
      <Notice>{error}</Notice>
      {online && (creating || invitation) && <RoomForm key={invitation?.id ?? 'create'} invitation={invitation}
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
