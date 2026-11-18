import { useEffect, useState, type ReactNode } from 'react'
import { transparentBasket } from './basketAssets'
import { DiaryError } from './model'

export function errorText(error: unknown, fallback = 'Das hat nicht geklappt. Bitte versuche es erneut.') {
  if (error instanceof DiaryError) return error.message
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
      && /^(Diese Einladung|Dieses Profil|Die Empfehlung|Die Profilliste|Nur Raummitglieder|Nur Raum-Admins|Das Mitglied|Der Mahlgrad|GaggiMate ist|Der Öffnungszeitpunkt|Die Restübernahme|Die aktive Packung|Die neue Packung|Die Packung|Diese Packung|Bitte die Bohne|Prüfe Packungsmenge|Prüfe den gemessenen|Wähle den Umgang)/.test(error.message)) return error.message
  return fallback
}

export function Notice({ children }: { children: ReactNode }) {
  return children ? <p className="notice" role="status">{children}</p> : null
}

export function Photo({ photo, url, className = '' }: { photo?: Blob; url?: string | null; className?: string }) {
  const [local, setLocal] = useState<string>()
  const [broken, setBroken] = useState(false)
  useEffect(() => {
    if (!photo) { setLocal(undefined); return }
    const objectUrl = URL.createObjectURL(photo)
    setLocal(objectUrl)
    let active = true
    void transparentBasket(photo).then(url => { if (active && url) setLocal(url) }).catch(() => {})
    return () => { active = false; URL.revokeObjectURL(objectUrl) }
  }, [photo])
  const src = local ?? url
  useEffect(() => setBroken(false), [src])
  return <span className={'photo ' + className} aria-hidden="true">
    {src && !broken ? <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} /> :
      <span className="photo-placeholder">◉</span>}
  </span>
}
