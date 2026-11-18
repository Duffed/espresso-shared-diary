import { useEffect, useState } from 'react'

export function useDesign() {
  const [design, setDesign] = useState(() => document.documentElement.dataset.design || 'classic')
  useEffect(() => {
    const update = () => setDesign(document.documentElement.dataset.design || 'classic')
    window.addEventListener('espresso-theme-change', update)
    window.addEventListener('storage', update)
    window.addEventListener('pageshow', update)
    return () => {
      window.removeEventListener('espresso-theme-change', update)
      window.removeEventListener('storage', update)
      window.removeEventListener('pageshow', update)
    }
  }, [])
  return design
}
