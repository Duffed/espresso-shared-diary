import { useEffect, useState, type ReactNode } from 'react'
import { DiaryError } from './model'

export function errorText(error: unknown, fallback = 'Das hat nicht geklappt. Bitte versuche es erneut.') {
  if (error instanceof DiaryError) return error.message
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
      && /^(Diese Einladung|Der Mahlgrad|GaggiMate ist)/.test(error.message)) return error.message
  return fallback
}

export function Notice({ children }: { children: ReactNode }) {
  return children ? <p className="notice" role="status">{children}</p> : null
}

export function Photo({ photo, url }: { photo?: Blob; url?: string | null }) {
  const [local, setLocal] = useState<string>()
  const [broken, setBroken] = useState(false)
  useEffect(() => {
    if (!photo) { setLocal(undefined); return }
    const objectUrl = URL.createObjectURL(photo)
    setLocal(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [photo])
  const src = local ?? url
  useEffect(() => setBroken(false), [src])
  return <span className="photo" aria-hidden="true">
    {src && !broken ? <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} /> :
      <span className="photo-placeholder">◉</span>}
  </span>
}
