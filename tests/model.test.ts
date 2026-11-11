import test from 'node:test'
import assert from 'node:assert/strict'
import { decimal, onScale, parseGaggiMate, stepGrind } from '../src/model.ts'

test('validates decimal input and snaps to the configured grinder scale', () => {
  assert.equal(decimal(' 1,35 '), 1.35)
  assert.equal(decimal('Infinity'), null)
  assert.equal(decimal('1e3'), null)
  assert.equal(decimal(''), null)
  assert.equal(onScale(0.3, 0.1, 0.9, 0.2), true)
  assert.equal(onScale(0.2, 0.1, 0.9, 0.2), false)
  assert.equal(onScale(1.1, 0.1, 0.9, 0.2), false)
  const scale = { minimum: 0.1, maximum: 0.9, step: 0.2 }
  assert.equal(stepGrind(0.3, scale, 1), 0.5)
  assert.equal(stepGrind(0.45, scale, -1), 0.3)
  assert.equal(stepGrind(0.9, scale, 1), 0.9)
  assert.equal(stepGrind(null, scale, -1), 0.1)
  assert.equal(stepGrind(14, { minimum: 0, maximum: 15, step: 2 }, 1), 14)
})

const shot = {
  id: '0012', version: 8, timestamp: 1791121751, profile: 'Espresso', profileId: 'p1',
  duration: 29400, volume: 35.1, notes: { doseIn: '18,1', doseOut: '36,2' },
  samples: [null, { tt: 0 }, { tt: 93 }, { tt: 94 }],
}

test('imports measurements and deduplicates variants of the same shot export', async () => {
  const imported = await parseGaggiMate(JSON.stringify(shot))
  assert.deepEqual(imported.fields, {
    brewed_at: new Date(shot.timestamp * 1000).toISOString(),
    duration: 29.4, temperature: 93, output: 36.2, dose: 18.1, profile: 'Espresso',
  })
  const other = await parseGaggiMate(JSON.stringify({ ...shot, id: '12', notes: null }))
  assert.equal(other.importKey, imported.importKey)
  assert.equal(other.fields.output, 35.1)
  assert.equal(other.fields.dose, null)
})

test('rejects invalid exports and marks incomplete shots', async () => {
  await assert.rejects(parseGaggiMate('{'), /gültiges JSON/)
  await assert.rejects(parseGaggiMate('null'), /Bezugsexport/)
  await assert.rejects(parseGaggiMate(JSON.stringify({ ...shot, timestamp: 'bad' })), /Bezugsexport/)
  const result = await parseGaggiMate(JSON.stringify({ ...shot, duration: 0, volume: null, notes: null, samples: [] }))
  assert.equal(result.incomplete, true)
  assert.equal(result.fields.duration, null)
  assert.equal(result.fields.temperature, null)
  assert.equal(result.fields.output, null)
})
