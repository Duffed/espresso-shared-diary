import { useEffect, useRef, useState } from 'react'

/** Follow the app's inner scroll containers, not the non-scrolling document. */
export function useScrollHeader(pinned: boolean) {
  const headerRef = useRef<HTMLElement>(null)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const header = headerRef.current
    if (!header) return
    const root = header.parentElement!
    const measure = () => root.style.setProperty('--top-bar-height', `${header.offsetHeight}px`)
    measure()
    const resize = new ResizeObserver(measure)
    resize.observe(header)
    let source: HTMLElement | null = null
    let previous = 0
    let previousMax = 0
    let travel = 0
    const reveal = () => { setHidden(false); travel = 0; source = null }
    reveal()

    function scroll(event: Event) {
      const target = event.target
      if (!(target instanceof HTMLElement) || !target.matches('#root, .room-content, .wizard-fields, .shot-form, .bean-scroll-list')) return
      const max = Math.max(0, target.scrollHeight - target.clientHeight)
      const position = Math.max(0, Math.min(target.scrollTop, max))
      if (source !== target) { source = target; previous = 0; previousMax = max; travel = 0 }
      const delta = position - previous
      previous = position
      // Resizing the viewport can clamp scrollTop without user scrolling.
      const resized = Math.abs(max - previousMax) > 1
      previousMax = max
      if (resized && delta < 0 && position >= max - 1) { travel = 0; return }
      if (pinned || position <= 4) { setHidden(false); travel = 0; return }
      if (!delta) return
      travel = Math.sign(delta) === Math.sign(travel) ? travel + delta : delta
      if (travel >= 24 && position > header!.offsetHeight) setHidden(true)
      if (travel <= -8) setHidden(false)
    }
    function navigate(event: MouseEvent) {
      if (event.target instanceof Element && event.target.closest('.bottom-nav button, .quick-brew, .step-track button')) reveal()
    }
    document.addEventListener('scroll', scroll, { capture: true, passive: true })
    document.addEventListener('click', navigate)
    window.addEventListener('popstate', reveal)
    return () => {
      resize.disconnect()
      root.style.removeProperty('--top-bar-height')
      document.removeEventListener('scroll', scroll, true)
      document.removeEventListener('click', navigate)
      window.removeEventListener('popstate', reveal)
    }
  }, [pinned])

  return { headerRef, hidden, revealHeader: () => setHidden(false) }
}
