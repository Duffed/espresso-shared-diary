import test from 'node:test'
import assert from 'node:assert/strict'
import { consumption } from '../src/consumption.ts'
import type { Shot } from '../src/model.ts'

test('consumption totals doses per bean and author ID, including unassigned beans', () => {
  const shot = (bean_id: string | null, author_id: string, dose: number | null) => ({ bean_id, author_id, author_name: 'Alex', dose }) as Shot
  const stats = consumption([shot('a', '1', 18.1), shot('a', '1', 18.2), shot('a', '2', 20), shot('b', '1', 16), shot(null, '1', 10), shot('b', '1', null)])
  assert.equal(stats.grams, 82.3)
  assert.equal(stats.missingDose, 1)
  assert.equal(stats.beans[0].grams, 56.3)
  assert.equal(stats.beans[0].count, 3)
  assert.deepEqual(stats.beans[0].people.map(p => [p.id, p.grams, p.count]), [['1', 36.3, 2], ['2', 20, 1]])
  assert.equal(stats.beans[2].id, '')
  assert.equal(consumption([]).grams, 0)
})
