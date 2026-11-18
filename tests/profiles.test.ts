import test from 'node:test'
import assert from 'node:assert/strict'
import { profileOptions, type Profile, type Shot } from '../src/model.ts'

test('profile choices follow personal recency, retain unused order and preserve an edited archived profile', () => {
  const profiles = ['Standard', 'Turbo', 'Neu', 'Alt'].map((name, i) => ({ id: String(i), name, archived: name === 'Alt' })) as Profile[]
  const shots = [
    { author_id: 'a', profile: 'Turbo', brewed_at: '2026-11-12T10:00:00Z' },
    { author_id: 'a', profile: 'Standard', brewed_at: '2026-11-11T10:00:00Z' },
    { author_id: 'b', profile: 'Standard', brewed_at: '2026-11-13T10:00:00Z' },
    { author_id: 'a', profile: 'Turbo', brewed_at: '2026-11-10T10:00:00Z' },
  ] as Shot[]
  assert.deepEqual(profileOptions(profiles, shots, 'a', ''), ['Turbo', 'Standard', 'Neu', ''])
  assert.deepEqual(profileOptions(profiles, shots, 'a', 'Alt'), ['Turbo', 'Standard', 'Neu', 'Alt', ''])
  assert.deepEqual(profileOptions(profiles, [], 'a', 'Turbo'), ['Standard', 'Turbo', 'Neu', ''])
})
