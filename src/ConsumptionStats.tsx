import { useEffect, useState } from 'react'
import { packageStock } from './packages'
import { consumption } from './consumption'
import { formatNumber, type BeanPackage, type PackageAdjustment, type Bean, type Shot } from './model'

const colors = ['#397f78', '#b87946', '#8b7396', '#6f8051', '#b55e60', '#647e9b']
export function Consumption({ shots, beans, pendingIds, packages = [], adjustments = [], onEditPackage, onDeletePackage }: { shots: Shot[]; beans: Bean[]; pendingIds: string[]; packages?: BeanPackage[]; adjustments?: PackageAdjustment[]; onEditPackage?: (pack: BeanPackage) => void; onDeletePackage?: (pack: BeanPackage) => void }) {
  const [days, setDays] = useState(0)
  const [packageId, setPackageId] = useState('')
  useEffect(() => { if (packageId && !packages.some(p => p.id === packageId)) setPackageId('') }, [packages, packageId])
  const pack = packages.find(p => p.id === packageId)
  const stock = pack ? packageStock(pack, shots, adjustments) : null
  const packageShots = packageId ? shots.filter(s => s.package_id === packageId) : shots
  const cutoff = new Date()
  cutoff.setHours(0, 0, 0, 0)
  cutoff.setDate(cutoff.getDate() - days + 1)
  const selected = days ? packageShots.filter(shot => Date.parse(shot.brewed_at) >= cutoff.getTime()) : packageShots
  const stats = consumption(selected)
  const people = [...new Set(shots.map(shot => shot.author_id))].sort()
  const color = (id: string) => { const index = people.indexOf(id) % colors.length; return `var(--consumption-${index}, ${colors[index]})` }
  const pendingCount = selected.filter(shot => pendingIds.includes(shot.id)).length
  const largest = stats.beans[0]?.grams || 1
  return <section className="consumption" aria-label="Kaffeeverbrauch">
    <div className="consumption-heading"><div><span className="eyebrow">GEMEINSAM GENOSSEN</span><h2>Kaffeeverbrauch</h2></div></div>
    {packages.length > 0 && <label className="package-filter">Packung<select aria-label="Packung" value={packageId} onChange={e => setPackageId(e.target.value)}><option value="">Alle Packungen & frühere Bezüge</option>{packages.map(p => <option key={p.id} value={p.id}>{beans.find(b => b.id === p.bean_id)?.name ?? 'Bohne'} · {new Date(p.opened_at).toLocaleDateString('de-DE')} · {formatNumber(p.quantity)} g{p.closed_at ? ' · abgeschlossen' : ' · aktiv'}</option>)}</select></label>}
    {pack && stock && <div className="panel package-history"><button type="button" className="quiet" disabled={!navigator.onLine} onClick={() => onEditPackage?.(pack)}>Packung bearbeiten</button><button type="button" className="quiet" disabled={!navigator.onLine} onClick={() => onDeletePackage?.(pack)}>Packung löschen</button><strong>{pack.closed_at ? 'Abgeschlossene Packung' : 'Aktive Packung'}</strong><p className="meta">Geöffnet: {new Date(pack.opened_at).toLocaleString('de-DE')}{pack.closed_at ? ' · abgeschlossen: ' + new Date(pack.closed_at).toLocaleString('de-DE') : ''}</p><p>{formatNumber(pack.quantity)} g Packungsmenge{pack.carried_in > 0 ? ' + ' + formatNumber(pack.carried_in) + ' g übernommen' : ''} · {formatNumber(stock.consumed)} g verbraucht</p>{pack.closed_at ? <p className="meta">{pack.close_reason === 'carried' ? formatNumber(pack.transferred_out) + ' g in die nächste Packung übernommen' : pack.close_reason === 'discarded' ? formatNumber(pack.closed_remaining ?? 0) + ' g Rest entsorgt' : 'Ohne Restübernahme abgeschlossen'}</p> : <p>Noch ca. {formatNumber(stock.remaining)} g</p>}{adjustments.filter(a => a.package_id === pack.id).map(a => <p className="meta" key={a.id}>{new Date(a.created_at).toLocaleDateString('de-DE')} · {a.amount > 0 ? '+' : ''}{formatNumber(a.amount)} g · {a.reason}</p>)}</div>}
    <div className="consumption-period" role="group" aria-label="Zeitraum">{[[0, 'Gesamt'], [30, '30 Tage'], [7, '7 Tage']].map(([value, label]) => <button key={value} aria-pressed={days === value} onClick={() => setDays(Number(value))}>{label}</button>)}</div>
    <div className="consumption-overview"><div><strong className="consumption-total">{formatNumber(stats.grams >= 1000 ? Math.round(stats.grams / 10) / 100 : stats.grams)} <small>{stats.grams >= 1000 ? 'kg' : 'g'}</small></strong><span>Kaffee verbraucht</span></div><div><b>{stats.beans.reduce((sum, bean) => sum + bean.count, 0)}</b><span>Bezüge</span></div><div><b>{stats.beans.length}</b><span>Bohnen</span></div></div>
    <p className="consumption-caption">Erfasste Kaffeemenge · {days ? `letzte ${days} Tage inklusive heute` : 'gesamter Zeitraum'}</p>
    {stats.beans.length === 0 && <p className="panel empty">Noch kein Verbrauch für diesen Zeitraum erfasst.</p>}
    <div className="consumption-chart">{stats.beans.map(row => {
      const bean = beans.find(bean => bean.id === row.id)
      return <section className="consumption-bean" key={row.id}>
        <div className="consumption-row"><strong>{bean?.name ?? (row.id ? 'Unbekannte Bohne' : 'Ohne Bohne')}{bean?.archived && <small>Archiviert</small>}</strong><b>{formatNumber(row.grams)} <small>g</small></b></div>
        <div className="consumption-bar" aria-hidden="true"><div style={{ width: `${row.grams / largest * 100}%` }}>{row.people.map(person => <i key={person.id} style={{ width: `${person.grams / row.grams * 100}%`, background: color(person.id) }} />)}</div></div>
        <div className="consumption-people">{row.people.map(person => <div className="consumption-person" key={person.id}><i style={{ background: color(person.id) }} aria-hidden="true" /><span>{person.name}<small>{person.count} {person.count === 1 ? 'Bezug' : 'Bezüge'}</small></span><b>{formatNumber(person.grams)} <small>g</small></b></div>)}</div>
      </section>
    })}</div>
    {(pendingCount > 0 || stats.missingDose > 0) && <p className="meta">{pendingCount > 0 && `${pendingCount} noch nicht synchronisierte Bezüge enthalten. `}{stats.missingDose > 0 && `${stats.missingDose} Bezüge ohne Kaffeemenge nicht eingerechnet.`}</p>}
  </section>
}
