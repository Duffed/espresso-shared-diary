import { useLayoutEffect, useRef } from 'react'
import { shotSteps } from './model'

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Move only the step contents; heading, progress and actions stay in place. */
export function useStepMotion(stage: number, onStageChange: (stage: number) => void) {
  const fieldsRef = useRef<HTMLFieldSetElement>(null)
  const animation = useRef<Animation | null>(null)
  const pending = useRef<{ from: number; to: number; direction: number } | null>(null)
  const currentStage = useRef(stage)
  currentStage.current = stage

  function clear() {
    animation.current?.cancel()
    animation.current = null
    const fields = fieldsRef.current
    if (fields) { fields.style.transform = ''; fields.style.opacity = ''; delete fields.dataset.motion }
  }

  useLayoutEffect(() => {
    const move = pending.current
    clear()
    if (!move || move.to !== stage) { pending.current = null; return }
    const fields = fieldsRef.current
    if (!fields || reducedMotion()) { pending.current = null; return }
    fields.dataset.motion = 'incoming'
    const entering = fields.animate([
      { transform: 'translateX(' + move.direction * 48 + 'px)', opacity: .35 },
      { transform: 'translateX(0)', opacity: 1 },
    ], { duration: 190, easing: 'cubic-bezier(.2,.7,.2,1)' })
    animation.current = entering
    void entering.finished.then(() => {
      if (animation.current === entering) { pending.current = null; clear() }
    }).catch(() => {})
  }, [stage])

  useLayoutEffect(() => () => { pending.current = null; clear() }, [])

  function dragTo(distance: number, atBoundary: boolean) {
    const fields = fieldsRef.current
    if (!fields || pending.current || reducedMotion()) return
    animation.current?.cancel()
    animation.current = null
    fields.dataset.motion = 'dragging'
    const offset = Math.max(-90, Math.min(90, distance * (atBoundary ? .12 : .45)))
    fields.style.transform = 'translateX(' + offset + 'px)'
  }

  function reset() {
    const fields = fieldsRef.current
    if (!fields || pending.current) return
    const transform = fields.style.transform
    if (!transform || reducedMotion()) { clear(); return }
    animation.current?.cancel()
    fields.dataset.motion = 'returning'
    const returning = fields.animate([{ transform }, { transform: 'translateX(0)' }], { duration: 150, easing: 'ease-out', fill: 'forwards' })
    animation.current = returning
    void returning.finished.then(() => { if (animation.current === returning) clear() }).catch(() => {})
  }

  function navigate(next: number) {
    if (pending.current || next === currentStage.current) return
    const fields = fieldsRef.current
    if (!fields || reducedMotion()) { clear(); onStageChange(next); return }
    const move = { from: currentStage.current, to: next, direction: shotSteps.indexOf(next) > shotSteps.indexOf(currentStage.current) ? 1 : -1 }
    pending.current = move
    animation.current?.cancel()
    fields.dataset.motion = 'outgoing'
    const leaving = fields.animate([
      { transform: fields.style.transform || 'translateX(0)', opacity: 1 },
      { transform: 'translateX(' + -move.direction * 90 + 'px)', opacity: 0 },
    ], { duration: 130, easing: 'ease-in', fill: 'forwards' })
    animation.current = leaving
    void leaving.finished.then(() => {
      if (pending.current === move && currentStage.current === move.from) onStageChange(move.to)
    }).catch(() => {})
  }

  return { fieldsRef, dragTo, reset, navigate, isTransitioning: () => pending.current !== null }
}
