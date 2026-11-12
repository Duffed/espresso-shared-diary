import { useRef } from 'react'
import { Photo } from './ui'

export function PhotoPicker({ photo, url, hasPhoto, busy, label, onPhoto, onRemove, onError }: {
  photo?: Blob; url?: string | null; hasPhoto: boolean; busy: boolean; label: string
  onPhoto: (file: File) => void; onRemove: () => void; onError: (message: string) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ V' : 'Strg + V'
  return <div className="photo-picker photo-edit">
    <div className="photo-picker-heading"><span>Foto</span><span className="photo-picker-status">{hasPhoto ? 'Hinzugefügt' : 'Optional'}</span></div>
    <input ref={input} type="file" hidden disabled={busy} aria-label={label} accept="image/jpeg,image/png,image/webp" onChange={e => {
      const file = e.target.files?.[0]; e.target.value = ''; if (!file) return
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5242880) {
        onError('Wähle ein JPG-, PNG- oder WebP-Bild bis 5 MB.'); return
      }
      onError(''); onPhoto(file)
    }} />
    <button type="button" className="photo-picker-preview" disabled={busy} aria-label={hasPhoto ? 'Fotovorschau ändern' : 'Foto auswählen'} onClick={() => input.current?.click()}>
      {hasPhoto ? <Photo photo={photo} url={url} /> : <span className="photo-picker-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-9M3 16l5-5 5 5 3-3 4 4M18 2v6m-3-3h6" /></svg><strong>Dein Foto, dein Kaffee.</strong><span>Bild auswählen oder einfügen</span></span>}
    </button>
    <div className="photo-picker-actions"><button type="button" disabled={busy} onClick={() => input.current?.click()}>{hasPhoto ? 'Foto ändern' : 'Foto hinzufügen'}</button>
      {hasPhoto && <button type="button" className="photo-picker-remove" disabled={busy} onClick={onRemove}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7" /></svg>Foto entfernen</button>}
    </div>
    <div className="photo-picker-help"><span>Einfügen mit <kbd>{shortcut}</kbd></span><small>JPG, PNG, WebP · max. 5 MB</small></div>
    <span className="sr-only" role="status">{photo ? 'Fotovorschau bereit. Zum Übernehmen speichern.' : ''}</span>
  </div>
}
