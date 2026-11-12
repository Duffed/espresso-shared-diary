import { useState } from 'react'

type Theme = 'system' | 'light' | 'dark'
const key = 'espresso-diary-theme'
const system = window.matchMedia('(prefers-color-scheme: dark)')
function preference(): Theme {
  try { const saved = localStorage.getItem(key); return saved === 'light' || saved === 'dark' ? saved : 'system' } catch { return 'system' }
}
function apply() {
  const choice = preference()
  const dark = choice === 'dark' || (choice === 'system' && system.matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#191714' : '#f7f3ed')
}
apply()
system.addEventListener('change', apply)
window.addEventListener('storage', apply)

export function Appearance() {
  const [theme, setTheme] = useState(preference)
  return <section className="panel appearance" aria-labelledby="appearance-title">
    <h2 id="appearance-title">Darstellung</h2><p className="meta">Dein Look auf diesem Gerät.</p>
    <div className="theme-options" role="group" aria-label="Farbschema">
      {([['system', 'Automatisch', '◐'], ['light', 'Hell', '☀'], ['dark', 'Dunkel', '☾']] as const).map(([value, label, icon]) => <button key={value} type="button" aria-pressed={theme === value} onClick={() => { try { localStorage.setItem(key, value) } catch {} setTheme(value); document.documentElement.dataset.theme = value === 'dark' || (value === 'system' && system.matches) ? 'dark' : 'light'; document.querySelector('meta[name="theme-color"]')?.setAttribute('content', document.documentElement.dataset.theme === 'dark' ? '#191714' : '#f7f3ed') }}><span aria-hidden="true">{icon}</span>{label}</button>)}
    </div>
  </section>
}
