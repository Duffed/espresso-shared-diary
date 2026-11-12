import type { Bean, Shot } from './model'
import { useState } from 'react'
import { emptyHistoryFilter, type HistoryFilter } from './historyQuery'

export function HistoryFilters({ value, onChange, shots, beans, count }: {
  value: HistoryFilter; onChange: (value: HistoryFilter) => void; shots: Shot[]; beans: Bean[]; count: number
}) {
  const [open, setOpen] = useState(false)
  const update = (key: keyof HistoryFilter, next: string) => onChange({ ...value, [key]: next })
  const active = Object.values(value).filter(Boolean).length
  const beanIds = [...new Set(shots.map(shot => shot.bean_id || 'none'))]
  const authors = [...new Map(shots.map(shot => [shot.author_id, shot.author_name])).entries()]
  const profiles = [...new Set(shots.map(shot => shot.profile || ''))].sort((a, b) => a.localeCompare(b, 'de'))
  return <section className="history-filters" aria-label="Verlauf filtern">
    <div className="history-search-row"><input type="search" aria-label="Bezüge durchsuchen" placeholder="Bohne, Person oder Profil suchen …" value={value.search} onChange={event => update('search', event.target.value)} /><button type="button" className="history-filter-toggle" aria-label="Filter" title="Filter" aria-expanded={open} aria-controls="history-filter-fields" onClick={() => setOpen(!open)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 4h18l-7 8v7l-4 2v-9Z" /></svg>{active > 0 && <span className="filter-active-dot" />}</button></div>
    <div id="history-filter-fields" className="history-filter-fields" hidden={!open}>
      <label>Bohne<select aria-label="Bohne" value={value.bean} onChange={event => update('bean', event.target.value)}><option value="">Alle Bohnen</option>{beanIds.map(id => <option key={id} value={id}>{id === 'none' ? 'Ohne Bohne' : beans.find(bean => bean.id === id)?.name || 'Unbekannte Bohne'}</option>)}</select></label>
      <label>Person<select aria-label="Person" value={value.author} onChange={event => update('author', event.target.value)}><option value="">Alle Personen</option>{authors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label>Profil<select aria-label="Profil" value={value.profile} onChange={event => update('profile', event.target.value)}><option value="">Alle Profile</option>{profiles.map(name => <option key={name} value={name ? 'profile:' + name : 'none'}>{name || 'Ohne Profil'}</option>)}</select></label>
      <label>Von<input type="date" value={value.from} onChange={event => update('from', event.target.value)} /></label>
      <label>Bis<input type="date" value={value.to} onChange={event => update('to', event.target.value)} /></label>
    </div>
    <div className="history-filter-status"><small role="status">{count} von {shots.length} Bezügen</small>{active > 0 && <button type="button" className="quiet" onClick={() => onChange({ ...emptyHistoryFilter })}>Filter zurücksetzen</button>}</div>
  </section>
}
