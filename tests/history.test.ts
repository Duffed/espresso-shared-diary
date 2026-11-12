import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyHistoryFilter, filterHistory } from '../src/historyQuery.ts'
import type { Bean, Shot } from '../src/model.ts'

test('history combines filters, includes the whole final local day and searches accents', () => {
  const beans = [{ id: 'b', name: 'Café', roaster: 'Rösterei' }] as Bean[]
  const shots = [
    { id: '1', bean_id: 'b', author_id: 'a', author_name: 'Alex', profile: 'Turbo', brewed_at: new Date(2026, 10, 12, 23, 59).toISOString() },
    { id: '2', bean_id: null, author_id: 's', author_name: 'Sam', profile: null, brewed_at: new Date(2026, 10, 13).toISOString() },
  ] as Shot[]
  const select = (filter: Partial<typeof emptyHistoryFilter>) => filterHistory(shots, beans, { ...emptyHistoryFilter, ...filter }).map(shot => shot.id)
  assert.deepEqual(select({}), ['1', '2'])
  assert.deepEqual(select({ search: 'cafe alex', bean: 'b', author: 'a', profile: 'profile:Turbo', from: '2026-11-12', to: '2026-11-12' }), ['1'])
  assert.deepEqual(select({ profile: 'none', bean: 'none' }), ['2'])
  assert.deepEqual(select({ author: 's', bean: 'b' }), [])
  assert.deepEqual(select({ from: '2026-11-13', to: '2026-11-12' }), [])
})
