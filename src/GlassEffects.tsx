import { useEffect } from 'react'

export function GlassEffects() {
  useEffect(() => {
    const enabled = matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)')
    let active: HTMLElement | null = null
    let frame = 0
    let x = 0, y = 0
    const clear = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      active?.removeAttribute('data-glass-hover')
      active?.style.removeProperty('--light-x')
      active?.style.removeProperty('--light-y')
      active = null
    }
    const move = (event: PointerEvent) => {
      if (!enabled.matches || event.pointerType !== 'mouse' || document.documentElement.dataset.design !== 'glass') { clear(); return }
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('button:enabled:not([aria-disabled="true"])') : null
      if (active !== target) { clear(); active = target }
      if (!active) return
      x = event.clientX; y = event.clientY
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0
        if (!active) return
        const rect = active.getBoundingClientRect()
        active.style.setProperty('--light-x', `${x - rect.left}px`)
        active.style.setProperty('--light-y', `${y - rect.top}px`)
        active.setAttribute('data-glass-hover', '')
      })
    }
    document.addEventListener('pointermove', move, { passive: true })
    document.documentElement.addEventListener('pointerleave', clear)
    window.addEventListener('blur', clear)
    window.addEventListener('espresso-theme-change', clear)
    enabled.addEventListener('change', clear)
    return () => {
      clear()
      document.removeEventListener('pointermove', move)
      document.documentElement.removeEventListener('pointerleave', clear)
      window.removeEventListener('blur', clear)
      window.removeEventListener('espresso-theme-change', clear)
      enabled.removeEventListener('change', clear)
    }
  }, [])
  return null
}
