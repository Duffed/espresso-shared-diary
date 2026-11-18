import { useEffect, useRef, useState } from 'react'
import { shotSteps, type Shot } from './model'

type Page = 'home' | 'history' | 'beans' | 'settings'
type Route = { page: Page; form?: true | Shot; stage: number; origin?: number; formToken?: string }
type Entry = { owner: string; scope: string; depth: number; route: Route }

function stored<T>(key: string, fallback: T): T {
  try { return JSON.parse(sessionStorage.getItem(key) || 'null') ?? fallback } catch { return fallback }
}
function store(key: string, value: unknown) {
  try { sessionStorage.setItem(key, JSON.stringify(value)) } catch { /* Navigation still works without session storage. */ }
}

export function useRoomNavigation(owner: string) {
  const [initialEntry] = useState<Entry>(() => {
    const saved = history.state?.espressoNavigation as Entry | undefined
    if (saved?.owner === owner && ['home', 'history', 'beans', 'settings'].includes(saved.route?.page) && saved.depth >= 0) return saved
    return { owner, scope: crypto.randomUUID(), depth: 0, route: { page: 'home', stage: 0 } }
  })
  const scope = useRef(initialEntry.scope)
  const initial = initialEntry.route
  const storageKey = 'espresso-navigation-' + scope.current
  const current = useRef<Entry>(initialEntry)
  const entries = useRef<Route[]>(stored(storageKey, [initial]))
  const closingPage = useRef<Page | undefined>(undefined)
  const closedForms = useRef(new Set<string>(stored(storageKey + '-closed', [])))
  const [route, setRoute] = useState(initial)

  function replace(entry: Entry) {
    history.replaceState({ ...history.state, espressoNavigation: entry }, '')
    current.current = entry
    entries.current[entry.depth] = entry.route
    store(storageKey, entries.current)
    setRoute(entry.route)
  }

  useEffect(() => {
    history.replaceState({ ...history.state, espressoNavigation: current.current }, '')
    const pop = (event: PopStateEvent) => {
      const entry = event.state?.espressoNavigation as Entry | undefined
      if (!entry || entry.owner !== owner || entry.scope !== scope.current) return
      current.current = entry
      if (closingPage.current) {
        const page = closingPage.current
        closingPage.current = undefined
        replace({ ...entry, route: { page, stage: 0 } })
      } else if (entry.route.formToken && closedForms.current.has(entry.route.formToken)) {
        replace({ ...entry, route: { page: entry.route.page, stage: 0 } })
      } else setRoute(entry.route)
    }
    window.addEventListener('popstate', pop)
    return () => window.removeEventListener('popstate', pop)
  }, [])

  function push(next: Route) {
    const entry = { owner, scope: scope.current, depth: current.current.depth + 1, route: next }
    history.pushState({ ...history.state, espressoNavigation: entry }, '')
    entries.current = entries.current.slice(0, entry.depth)
    entries.current.push(next)
    store(storageKey, entries.current)
    current.current = entry
    setRoute(next)
  }

  function closeForm(page?: Page) {
    const entry = current.current
    if (entry.route.formToken) closedForms.current.add(entry.route.formToken)
    store(storageKey + '-closed', [...closedForms.current])
    if (entry.route.form && entry.route.origin !== undefined && entry.depth > entry.route.origin) {
      closingPage.current = page
      history.go(entry.route.origin - entry.depth)
    } else replace({ ...entry, route: { page: page ?? entry.route.page, stage: 0 } })
  }

  function setPage(page: Page) {
    if (page !== current.current.route.page || current.current.route.form) push({ page, stage: 0 })
  }

  function setForm(form?: true | Shot) {
    if (!form) { closeForm(); return }
    push({ page: current.current.route.page, form, stage: 0, origin: current.current.depth, formToken: crypto.randomUUID() })
  }

  function setStage(stage: number) {
    const entry = current.current
    if (stage === entry.route.stage) return
    if (shotSteps.indexOf(stage) < shotSteps.indexOf(entry.route.stage)) {
      for (let depth = entry.depth - 1; depth > (entry.route.origin ?? -1); depth--) {
        if (entries.current[depth]?.stage === stage) { history.go(depth - entry.depth); return }
      }
    }
    push({ ...entry.route, stage })
  }

  return { ...route, setPage, setForm, setStage, closeForm }
}
