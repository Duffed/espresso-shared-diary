import { useState } from 'react'

type Theme = 'system' | 'light' | 'dark'
const key = 'espresso-diary-theme'
function preference(): Theme {
  try { const saved = localStorage.getItem(key); return saved === 'light' || saved === 'dark' ? saved : 'system' } catch { return 'system' }
}

export function Appearance() {
  const [theme, setTheme] = useState(preference)
  return <section className="panel appearance" aria-labelledby="appearance-title">
    <h2 id="appearance-title">Darstellung</h2><p className="meta">Dein Look auf diesem Gerät.</p>
    <div className="theme-options" role="group" aria-label="Farbschema">
      {([['system', 'Automatisch', '◐'], ['light', 'Hell', '☀'], ['dark', 'Dunkel', '☾']] as const).map(([value, label, icon]) => <button key={value} type="button" aria-pressed={theme === value} onClick={() => { try { localStorage.setItem(key, value) } catch { return } setTheme(value); window.dispatchEvent(new Event('espresso-theme-change')) }}><span aria-hidden="true">{icon}</span>{label}</button>)}
    </div>
  </section>
}
