import { SettingsGroup } from './SettingsGroup'
import { SettingsToggle } from './SettingsToggle'
import { useState, type CSSProperties } from 'react'

type Theme = 'system' | 'light' | 'dark'
const colorPresets = [['#654532', 'Mokka'], ['#6442a5', 'Lavendel'], ['#2277aa', 'Ozean'], ['#4c8060', 'Salbei'], ['#b55c78', 'Rose'], ['#b98032', 'Honig']] as const
const key = 'espresso-diary-theme'
function preference(): Theme {
  try { const saved = localStorage.getItem(key); return saved === 'light' || saved === 'dark' ? saved : 'system' } catch { return 'system' }
}

export function Appearance() {
  const [theme, setTheme] = useState(preference)
  const [design, setDesign] = useState(() => document.documentElement.dataset.design || 'classic')
  const [palette, setPalette] = useState(() => document.documentElement.dataset.palette || 'default')
  const [seed, setSeed] = useState(() => document.documentElement.style.getPropertyValue('--you-seed') || '#654532')
  const deviceColors = CSS.supports('color', 'AccentColor')
  function savePalette(next: string, color = seed) {
    try { localStorage.setItem('espresso-diary-palette', next); localStorage.setItem('espresso-diary-seed', color); setPalette(next); setSeed(color); setError(''); window.dispatchEvent(new Event('espresso-theme-change')) }
    catch { setError('Die Farbe konnte nicht gespeichert werden.') }
  }
  const [error, setError] = useState('')
  return <SettingsGroup personal title="Darstellung" subtitle="Design, Farben und Erscheinungsbild" icon="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-4c-1-1 0-3 2-3h2a3 3 0 0 0 3-3 9 9 0 0 0-9-8Z"><div className="appearance">
    <p className="meta">Dein Look auf diesem Gerät.</p>
    <div className="design-options" role="group" aria-label="Design">
      {([['classic', 'Klassisch', 'Material · Expressiv'], ['glass', 'Glas', 'Licht & Tiefe'], ['orbit', 'Retro 98', 'Desktop · Nostalgie']] as const).map(([value, label, description]) => <button key={value} type="button" className="design-option" aria-label={label} aria-pressed={design === value} onClick={() => {
        try { localStorage.setItem('espresso-diary-design', value) } catch { setError('Das Design konnte auf diesem Gerät nicht gespeichert werden.'); return }
        setDesign(value); setError(''); window.dispatchEvent(new Event('espresso-theme-change'))
      }}><span className={'design-preview preview-' + value} aria-hidden="true"><i /><i /><i /></span><strong>{label}</strong><small>{description}</small></button>)}
    </div>
    {design === 'classic' && <div className="you-colors">
      <SettingsToggle label="Material You" description="Optionale persönliche Farben für das Material-Design." checked={palette !== 'default'} onChange={enabled => savePalette(enabled ? (deviceColors ? 'device' : 'custom') : 'default')} />
      {palette !== 'default' && <><div className="theme-options" role="group" aria-label="Akzentfarbe"><button type="button" disabled={!deviceColors} aria-pressed={palette === 'device'} onClick={() => savePalette('device')}>Gerätefarbe</button><button type="button" aria-pressed={palette === 'custom'} onClick={() => savePalette('custom')}>Eigene Farbe</button></div>
      <p className="meta">{palette === 'custom' ? 'Wähle deine Farbpalette.' : deviceColors ? 'Der Browser liefert die System-Akzentfarbe. Sie kann von deinen Android-Hintergrundfarben abweichen.' : 'Dieser Browser gibt die Gerätefarbe nicht frei. Du kannst eine eigene Akzentfarbe wählen.'}</p>
      {palette === 'custom' && <div className="palette-presets" role="group" aria-label="Farbpalette">{[...colorPresets, ...(!colorPresets.some(([color]) => color === seed.toLowerCase()) ? [[seed, 'Gespeichert']] : [])].map(([color, name]) => <button type="button" className="palette-preset" key={color} aria-label={name} aria-pressed={seed.toLowerCase() === color.toLowerCase()} style={{ '--swatch': color } as CSSProperties} onClick={() => savePalette('custom', color)}><span className="palette-disc" aria-hidden="true"><i/><i/><i/><i/><span className="palette-check">✓</span></span><span>{name}</span></button>)}</div>}</>}
    </div>}
    {error && <p className="notice" role="status">{error}</p>}
    <div className="theme-options" role="group" aria-label="Farbschema">
      {([['system', 'Automatisch', '◐'], ['light', 'Hell', '☀'], ['dark', 'Dunkel', '☾']] as const).map(([value, label, icon]) => <button key={value} type="button" aria-pressed={theme === value} onClick={() => { try { localStorage.setItem(key, value) } catch { return } setTheme(value); window.dispatchEvent(new Event('espresso-theme-change')) }}><span aria-hidden="true">{icon}</span>{label}</button>)}
    </div>
  </div></SettingsGroup>
}
