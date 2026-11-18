import { SwipeToDelete } from './SwipeToDelete'
import { PackageAmount, PackageForm, PackageStock, localTime } from './PackageControls'
import { Consumption } from './ConsumptionStats'
import { EditIcon, BeanIcon, GridIcon, ListIcon } from './Icons'
import { useState } from 'react'
import { api } from './data'
import { decimal, DiaryError, type Bean, type BeanPackage, type RoomData } from './model'
import { errorText, Notice, Photo } from './ui'
import { PhotoPicker } from './PhotoPicker'
import { usePhotoPaste } from './usePhotoPaste'

export function BeanPhoto({ bean }: { bean: Bean }) {
  return bean.photo_path || bean.photo ? <Photo className="bean-photo" photo={bean.photo} /> : <span className="bean-symbol" aria-hidden="true"><BeanIcon /></span>
}

function BeanForm({ bean, room, onSaved, onClose, packagesEnabled }: {
  bean?: Bean; room: string; packagesEnabled: boolean; onSaved: (bean: Bean) => Promise<void>; onClose: () => void
}) {
  const [beanKey] = useState(() => crypto.randomUUID())
  const [packageKey] = useState(() => crypto.randomUUID())
  const [trackPackage, setTrackPackage] = useState(false)
  const [quantity, setQuantity] = useState('250')
  const [opened, setOpened] = useState(localTime)
  const [file, setFile] = useState<File>()
  const [removed, setRemoved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  usePhotoPaste(busy, photo => { setFile(photo); setRemoved(false) }, setError)
  const hasPhoto = Boolean(file || (!removed && (bean?.photo_path || bean?.photo)))
  return <form className="panel bean-form" onSubmit={async e => {
    e.preventDefault(); const fields = new FormData(e.currentTarget); setBusy(true); setError('')
    const id = bean?.id ?? beanKey
    let uploaded: string | undefined
    let saved = false
    try {
      const values: { name: string; roaster: string; photo_path?: string | null } = {
        name: String(fields.get('name')).trim(), roaster: String(fields.get('roaster')).trim(),
      }
      const grams = decimal(quantity)
      if (trackPackage && (grams == null || grams <= 0 || grams > 100000)) throw new DiaryError('Prüfe die Packungsmenge.')
      if (!values.name) throw new DiaryError('Bitte gib einen Namen für die Kaffeesorte ein.')
      if (file) {
        const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as Record<string, string>)[file.type]
        if (!extension || file.size > 5242880) throw new DiaryError('Wähle ein JPG-, PNG- oder WebP-Bild bis 5 MB.')
        const path = `${room}/${id}/${crypto.randomUUID()}.${extension}`
        const upload = await api.storage.from('bean-photos').upload(path, file)
        if (upload.error) throw new DiaryError('Das Foto konnte nicht hochgeladen werden. Prüfe deine Verbindung. Die Migration für Bohnenfotos muss in Supabase eingerichtet sein.')
        uploaded = path; values.photo_path = path
      } else if (removed) values.photo_path = null
      const result = bean ? await api.from('beans').update(values).eq('id', id).select().single()
        : trackPackage ? await api.rpc('create_bean_with_package', { bean_key: id, target_room: room, bean_name: values.name, bean_roaster: values.roaster, bean_photo: values.photo_path ?? null, package_key: packageKey, grams, opened: new Date(opened).toISOString() }).single()
        : await api.from('beans').insert({ ...values, id, room_id: room }).select().single()
      if (result.error) throw result.error
      saved = true
      // Remove the former file only after the database points at the new photo.
      if (bean?.photo_path && 'photo_path' in values && values.photo_path !== bean.photo_path) {
        await api.storage.from('bean-photos').remove([bean.photo_path]).catch(() => {})
      }
      await onSaved(result.data as Bean)
    } catch (reason) {
      if (uploaded && !saved) await api.storage.from('bean-photos').remove([uploaded]).catch(() => {})
      setError(errorText(reason, 'Bohne konnte nicht gespeichert werden. Bitte prüfe die Verbindung und versuche es erneut.'))
    } finally { setBusy(false) }
  }}>
    <fieldset className="wizard-fields" disabled={busy}>
      <PhotoPicker photo={file ?? (!removed ? bean?.photo : undefined)} hasPhoto={hasPhoto} busy={busy} label="Bohnenfoto"
        onPhoto={photo => { setFile(photo); setRemoved(false) }} onRemove={() => { setFile(undefined); setRemoved(true) }} onError={setError} />
      <label>Kaffeesorte<input name="name" required maxLength={100} defaultValue={bean?.name ?? ''} /></label>
      <label>Rösterei · optional<input name="roaster" maxLength={100} defaultValue={bean?.roaster ?? ''} /></label>
      {!bean && packagesEnabled && <><label className="check"><input type="checkbox" checked={trackPackage} onChange={e => setTrackPackage(e.target.checked)} />Erste Packung erfassen</label>{trackPackage && <><PackageAmount value={quantity} onChange={setQuantity} /><label>Geöffnet am<input type="datetime-local" step="1" required value={opened} onChange={e => setOpened(e.target.value)} /></label></>}</>}
      <Notice>{error}</Notice>
      <div className="actions"><button className="primary">{busy ? 'Wird gespeichert …' : 'Bohne speichern'}</button><button type="button" onClick={onClose}>Abbrechen</button></div>
    </fieldset>
  </form>
}

export function Beans({ data, refresh, onSelect, hideHeading = false, pendingIds = [] }: { data: RoomData; refresh: () => Promise<void>; onSelect?: (bean: Bean) => void; hideHeading?: boolean; pendingIds?: string[] }) {
  const [packageDraft, setPackageDraft] = useState<{ bean: Bean; correction?: boolean; editing?: BeanPackage }>()
  const [section, setSection] = useState<'beans' | 'consumption'>('beans')
  const [editing, setEditing] = useState<Bean | 'new'>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const activeBeans = (data.beans ?? []).filter(bean => !bean.archived)
  const archivedBeans = (data.beans ?? []).filter(bean => bean.archived)
  async function archive(bean: Bean) {
    setBusy(true); setError('')
    try {
      const result = await api.from('beans').update({ archived: !bean.archived }).eq('id', bean.id).eq('room_id', data.room.id).select('id').single()
      if (result.error) throw result.error
      await refresh()
    } catch (reason) { setError(errorText(reason, 'Die Bohne konnte nicht aktualisiert werden.')) }
    finally { setBusy(false) }
  }
  async function deleteBean(bean: Bean) {
    if (!navigator.onLine || busy) return
    if (data.shots.some(shot => shot.bean_id === bean.id) || data.packages?.some(pack => pack.bean_id === bean.id)) {
      setError('Diese Bohne hat bereits Bezüge oder Packungen. Du kannst sie nach rechts wischen und archivieren.'); return
    }
    if (!confirm('„' + bean.name + '“ endgültig löschen?')) return
    setBusy(true); setError('')
    try {
      const result = await api.from('beans').delete().eq('id', bean.id).eq('room_id', data.room.id).select('id').single()
      if (result.error) {
        if (result.error.code === '23503') throw new DiaryError('Diese Bohne wird inzwischen verwendet und kann nur archiviert werden.')
        throw result.error
      }
      if (bean.photo_path) await api.storage.from('bean-photos').remove([bean.photo_path]).catch(() => {})
      await refresh()
    } catch (reason) { setError(errorText(reason, 'Die Bohne konnte nicht gelöscht werden. Bitte Verbindung und Datenbankmigration prüfen.')) }
    finally { setBusy(false) }
  }
  async function deletePackage(pack: BeanPackage) {
    if (!navigator.onLine || busy) return
    if (data.shots.some(s => s.bean_id === pack.bean_id && s.version === 0)) { setError('Bitte zuerst die ausstehenden Bezüge dieser Bohne synchronisieren.'); return }
    if (!confirm('Packung wirklich löschen? Alle Bezüge bleiben erhalten, verlieren aber ihre Packungszuordnung. Bestandskorrekturen dieser Packung werden entfernt. Verbundene Restübernahmen werden zurückgenommen; frühere Packungen bleiben abgeschlossen.')) return
    setBusy(true); setError('')
    try {
      const result = await api.rpc('delete_bean_package', { target_package: pack.id, expected_quantity: pack.quantity, expected_opened: pack.opened_at, expected_closed: pack.closed_at })
      if (result.error) throw result.error
      if (packageDraft?.editing?.id === pack.id) setPackageDraft(undefined)
      await refresh()
    } catch (reason) { setError(errorText(reason, 'Die Packung konnte nicht gelöscht werden. Bitte aktualisieren und erneut versuchen.')) }
    finally { setBusy(false) }
  }
  function beanList(beans: Bean[]) {
    return <div className={`bean-list${view === 'grid' ? ' bean-library-grid' : ''}`}>{beans.map(bean => <SwipeToDelete key={bean.id} enabled={navigator.onLine && !busy && !editing && !packageDraft} onDelete={() => void deleteBean(bean)} onArchive={() => void archive(bean)} archived={bean.archived} label={bean.name}><div className="bean-card bean-stock-card"><BeanPhoto bean={bean} />
      <span><strong>{bean.name}</strong><small>{bean.roaster || 'Kaffeesorte'}</small></span><div className="bean-actions"><button className="quiet" disabled={!navigator.onLine || busy || Boolean(editing)} onClick={() => setEditing(bean)} aria-label="Bearbeiten" title="Bohne bearbeiten"><EditIcon /></button>{!bean.archived && data.packages && <button className="quiet add-package" disabled={!navigator.onLine || busy || Boolean(editing)} onClick={() => setPackageDraft({ bean })} aria-label="+ Packung" title="Neue Packung öffnen">+ Packung</button>}</div>{data.packages?.filter(p => p.bean_id === bean.id && !p.closed_at).map(pack => <PackageStock key={pack.id} pack={pack} data={data} onCorrect={() => setPackageDraft({ bean, correction: true })} onEdit={() => setPackageDraft({ bean, editing: pack })} onDelete={() => void deletePackage(pack)} />)}</div></SwipeToDelete>)}</div>
  }
  const [view, setView] = useState<'list' | 'grid'>(() => {
    try { return localStorage.getItem('espresso-diary-bean-view') === 'grid' ? 'grid' : 'list' } catch { return 'list' }
  })
  function changeView(next: 'list' | 'grid') {
    setView(next)
    try { localStorage.setItem('espresso-diary-bean-view', next) } catch { /* Keep the selection for this session. */ }
  }
  return <section className="bean-library">
    {!onSelect && <div className="bean-section-tabs" role="group" aria-label="Bohnen und Verbrauch"><button aria-pressed={section === 'beans'} onClick={() => setSection('beans')}>Meine Bohnen</button><button aria-pressed={section === 'consumption'} onClick={() => setSection('consumption')}>Verbrauch</button></div>}
    <Notice>{error}</Notice>
    {packageDraft && <PackageForm key={packageDraft.bean.id + Boolean(packageDraft.correction) + (packageDraft.editing?.id ?? '')} bean={packageDraft.bean} data={data} correction={packageDraft.correction} editing={packageDraft.editing} refresh={refresh} onClose={() => setPackageDraft(undefined)} />}
    {section === 'consumption' && !onSelect ? <Consumption shots={data.shots} beans={data.beans ?? []} pendingIds={pendingIds} packages={data.packages} adjustments={data.packageAdjustments} onDeletePackage={pack => void deletePackage(pack)} onEditPackage={pack => { const bean = data.beans?.find(b => b.id === pack.bean_id); if (bean) setPackageDraft({ bean, editing: pack }) }} /> : <>
    <div className={hideHeading ? 'section-heading bean-library-actions' : 'section-heading'}>{!hideHeading && <h2>Deine Bohnen</h2>}{!onSelect && <div className="bean-view-toggle" role="group" aria-label="Bohnenansicht"><button aria-label="Listenansicht" title="Listenansicht" aria-pressed={view === 'list'} onClick={() => changeView('list')}><ListIcon /></button><button aria-label="Rasteransicht" title="Rasteransicht" aria-pressed={view === 'grid'} onClick={() => changeView('grid')}><GridIcon /></button></div>}<button disabled={!navigator.onLine || Boolean(editing)} onClick={() => setEditing('new')}>＋ Bohne</button></div>
    {editing && <BeanForm key={editing === 'new' ? 'new' : editing.id} bean={editing === 'new' ? undefined : editing} room={data.room.id} packagesEnabled={Boolean(data.packages)}
      onClose={() => setEditing(undefined)} onSaved={async bean => { await refresh(); setEditing(undefined); onSelect?.(bean) }} />}
    {!data.beans?.length && !editing && <p className="empty">Dein nächster Lieblingskaffee beginnt hier.<br />Speichere deine erste Bohne.</p>}
    {!onSelect && <><p className="bean-swipe-help">← Löschen · Nach rechts wischen: Archivieren / Aktivieren →</p>{beanList(activeBeans)}{archivedBeans.length > 0 && <details className="archived-beans"><summary>Archivierte Bohnen ({archivedBeans.length})</summary>{beanList(archivedBeans)}</details>}</>}
    </>}
  </section>
}
