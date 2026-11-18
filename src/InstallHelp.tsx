import { useEffect, useState } from 'react'

type InstallPrompt = Event & { prompt: () => Promise<{ outcome: 'accepted' | 'dismissed' }> }
const installedKey = 'espresso-diary-installed'
function remembered() { try { return localStorage.getItem(installedKey) === 'true' } catch { return false } }
function standalone() { return matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true }

export function InstallHelp() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const android = /Android/.test(navigator.userAgent)
  const [installed, setInstalled] = useState(() => standalone() || remembered())
  const [dismissed, setDismissed] = useState(false)
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null)
  const [busy, setBusy] = useState(false)
  function markInstalled() {
    try { localStorage.setItem(installedKey, 'true') } catch { /* Storage can be disabled. */ }
    setInstalled(true)
  }
  useEffect(() => {
    const mode = matchMedia('(display-mode: standalone)')
    const check = () => { if (standalone() || remembered()) markInstalled() }
    const available = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt) }
    check()
    mode.addEventListener('change', check)
    window.addEventListener('appinstalled', markInstalled)
    window.addEventListener('beforeinstallprompt', available)
    window.addEventListener('storage', check)
    return () => {
      mode.removeEventListener('change', check)
      window.removeEventListener('appinstalled', markInstalled)
      window.removeEventListener('beforeinstallprompt', available)
      window.removeEventListener('storage', check)
    }
  }, [])
  if (installed || dismissed || (!ios && !android)) return null
  return <aside className="install-help" aria-label="App installieren">
    <details>
      <summary><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 3H5v18h14V3h-3M12 2v11m-4-4 4 4 4-4M10 18h4" /></svg><span><strong>Espresso Diary auf deinem Homescreen</strong><small>Mit einem Tippen direkt zu deinem Kaffee</small></span></summary>
      {ios ? <ol><li>Öffne diese Seite in <strong>Safari</strong>.</li><li>Tippe auf <strong>Teilen</strong> (Quadrat mit Pfeil nach oben), gegebenenfalls im Menü.</li><li>Wähle <strong>Zum Home-Bildschirm</strong>. Falls angeboten, aktiviere „Als Web-App öffnen“ und tippe auf <strong>Hinzufügen</strong>.</li></ol>
        : <ol><li>Öffne diese Seite in <strong>Chrome</strong>.</li><li>Öffne das <strong>Drei-Punkte-Menü ⋮</strong>.</li><li>Wähle <strong>Zum Startbildschirm hinzufügen</strong> oder <strong>App installieren</strong> und bestätige.</li></ol>}
      <div className="actions">
        {prompt && <button disabled={busy} onClick={async () => {
          setBusy(true)
          try { if ((await prompt.prompt()).outcome === 'accepted') markInstalled() } catch { /* Manual instructions remain available. */ }
          finally { setPrompt(null); setBusy(false) }
        }}>Jetzt installieren</button>}
        <button className="quiet" onClick={markInstalled}>Bereits installiert</button>
        <button className="quiet" onClick={() => setDismissed(true)}>Später</button>
      </div>
    </details>
  </aside>
}
