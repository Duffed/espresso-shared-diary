import { useState } from 'react'
import { SettingsToggle } from './SettingsToggle'

export function quickNavigationKey(user: string) { return 'espresso-diary-quick-navigation:' + user }
export function readQuickNavigation(user: string): boolean {
  try { return localStorage.getItem(quickNavigationKey(user)) === 'true' } catch { return false }
}

export function PersonalSettings({ user }: { user: string }) {
  const [quick, setQuick] = useState(() => readQuickNavigation(user))
  const [error, setError] = useState('')
  return <section className="personal-settings" aria-labelledby="personal-settings-title">
    <h3 id="personal-settings-title">Schnellauswahl</h3>
    <p className="meta">Deine persönliche Einstellung auf diesem Gerät.</p>
    <SettingsToggle label="Schnellauswahl" description="Nach der Auswahl einer Bohne, eines Mengen-Presets oder eines Profils direkt zum nächsten Schritt wechseln. Ausgeschaltet bestätigst du mit „Weiter“." checked={quick} onChange={checked => {
      try { localStorage.setItem(quickNavigationKey(user), String(checked)); setQuick(checked); setError('') }
      catch { setError('Die Einstellung konnte auf diesem Gerät nicht gespeichert werden.') }
    }} />
    {error && <p className="notice" role="status">{error}</p>}
  </section>
}
