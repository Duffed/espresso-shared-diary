import { BeanIcon } from './Icons'
import { useState } from 'react'
import { api } from './data'
import { DiaryError, type Bean, type RoomData } from './model'
import { errorText, Notice, Photo } from './ui'
import { PhotoPicker } from './PhotoPicker'
import { usePhotoPaste } from './usePhotoPaste'

export function BeanPhoto({ bean }: { bean: Bean }) {
  return bean.photo_path || bean.photo ? <Photo className="bean-photo" photo={bean.photo} /> : <span className="bean-symbol" aria-hidden="true"><BeanIcon /></span>
}

function BeanForm({ bean, room, onSaved, onClose }: {
  bean?: Bean; room: string; onSaved: (bean: Bean) => Promise<void>; onClose: () => void
}) {
  const [file, setFile] = useState<File>()
  const [removed, setRemoved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  usePhotoPaste(busy, photo => { setFile(photo); setRemoved(false) }, setError)
  const hasPhoto = Boolean(file || (!removed && (bean?.photo_path || bean?.photo)))
  return <form className="panel bean-form" onSubmit={async e => {
    e.preventDefault(); const fields = new FormData(e.currentTarget); setBusy(true); setError('')
    const id = bean?.id ?? crypto.randomUUID()
    let uploaded: string | undefined
    let saved = false
    try {
      const values: { name: string; roaster: string; photo_path?: string | null } = {
        name: String(fields.get('name')).trim(), roaster: String(fields.get('roaster')).trim(),
      }
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
      <Notice>{error}</Notice>
      <div className="actions"><button className="primary">{busy ? 'Wird gespeichert …' : 'Bohne speichern'}</button><button type="button" onClick={onClose}>Abbrechen</button></div>
    </fieldset>
  </form>
}

export function Beans({ data, refresh, onSelect, hideHeading = false }: { data: RoomData; refresh: () => Promise<void>; onSelect?: (bean: Bean) => void; hideHeading?: boolean }) {
  const [editing, setEditing] = useState<Bean | 'new'>()
  return <section className="bean-library">
    <div className={hideHeading ? 'section-heading bean-library-actions' : 'section-heading'}>{!hideHeading && <h2>Deine Bohnen</h2>}<button disabled={!navigator.onLine || Boolean(editing)} onClick={() => setEditing('new')}>＋ Bohne</button></div>
    {editing && <BeanForm key={editing === 'new' ? 'new' : editing.id} bean={editing === 'new' ? undefined : editing} room={data.room.id}
      onClose={() => setEditing(undefined)} onSaved={async bean => { await refresh(); setEditing(undefined); onSelect?.(bean) }} />}
    {!data.beans?.length && !editing && <p className="empty">Dein nächster Lieblingskaffee beginnt hier.<br />Speichere deine erste Bohne.</p>}
    {!onSelect && <div className="bean-list">{data.beans?.map(bean => <div className="bean-card" key={bean.id}><BeanPhoto bean={bean} />
      <span><strong>{bean.name}</strong><small>{bean.roaster || 'Kaffeesorte'}</small></span><button className="quiet" disabled={!navigator.onLine || Boolean(editing)} onClick={() => setEditing(bean)}>Bearbeiten</button></div>)}</div>}
  </section>
}
