// Run before the app and its styles load, including on an offline PWA launch.
(() => {
  const system = matchMedia('(prefers-color-scheme: dark)')
  function apply() {
    let choice = 'system'
    let design = 'classic'
    try { choice = localStorage.getItem('espresso-diary-theme') || 'system' } catch {}
    try { const saved = localStorage.getItem('espresso-diary-design'); if (saved === 'glass') design = saved; else if (saved === 'orbit') localStorage.setItem('espresso-diary-design', 'classic') } catch {}
    let palette = 'default', seed = '#654532'
    try { const saved = localStorage.getItem('espresso-diary-palette'); if (saved === 'device' || saved === 'custom') palette = saved; const color = localStorage.getItem('espresso-diary-seed'); if (/^#[0-9a-f]{6}$/i.test(color || '')) seed = color } catch {}
    document.documentElement.dataset.palette = palette
    document.documentElement.style.setProperty('--you-seed', seed)
    const dark = choice === 'dark' || (choice !== 'light' && system.matches)
    const theme = dark ? 'dark' : 'light'
    const color = design === 'glass' ? (dark ? '#101017' : '#f3eff2') : (dark ? '#191714' : '#f7f3ed')
    document.documentElement.dataset.design = design
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    document.documentElement.style.backgroundColor = color
    document.querySelector('meta[name="theme-color"]').setAttribute('content', color)
    document.querySelector('meta[name="color-scheme"]').setAttribute('content', theme)
  }
  apply()
  system.addEventListener('change', apply)
  window.addEventListener('storage', apply)
  window.addEventListener('espresso-theme-change', apply)
  window.addEventListener('pageshow', apply)
})()
