// Run before the app and its styles load, including on an offline PWA launch.
(() => {
  const system = matchMedia('(prefers-color-scheme: dark)')
  function apply() {
    let choice = 'system'
    try { choice = localStorage.getItem('espresso-diary-theme') || 'system' } catch {}
    const dark = choice === 'dark' || (choice !== 'light' && system.matches)
    const theme = dark ? 'dark' : 'light'
    const color = dark ? '#191714' : '#f7f3ed'
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
