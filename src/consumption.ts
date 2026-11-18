import type { Shot } from './model.ts'

export function consumption(shots: Shot[]) {
  const beans = new Map<string, { id: string; grams: number; count: number; people: Map<string, { id: string; name: string; grams: number; count: number }> }>()
  let missingDose = 0
  for (const shot of shots) {
    if (shot.dose == null || !Number.isFinite(shot.dose) || shot.dose <= 0) { missingDose++; continue }
    const id = shot.bean_id || ''
    const bean = beans.get(id) ?? { id, grams: 0, count: 0, people: new Map() }
    const person = bean.people.get(shot.author_id) ?? { id: shot.author_id, name: shot.author_name, grams: 0, count: 0 }
    // Integer micrograms avoid accumulating floating-point rounding errors.
    const amount = Math.round(shot.dose * 1_000_000)
    bean.grams += amount; bean.count++
    person.grams += amount; person.count++
    bean.people.set(person.id, person); beans.set(id, bean)
  }
  const rows = [...beans.values()].map(bean => ({ ...bean, grams: bean.grams / 1_000_000,
    people: [...bean.people.values()].map(person => ({ ...person, grams: person.grams / 1_000_000 })).sort((a, b) => b.grams - a.grams || a.name.localeCompare(b.name, 'de')),
  })).sort((a, b) => b.grams - a.grams || a.id.localeCompare(b.id))
  return { beans: rows, grams: rows.reduce((sum, row) => sum + Math.round(row.grams * 1_000_000), 0) / 1_000_000, missingDose }
}
