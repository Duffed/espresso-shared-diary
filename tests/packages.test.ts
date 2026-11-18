import test from 'node:test'
import assert from 'node:assert/strict'
import { packageForShot, packageStock } from '../src/packages.ts'
import type { BeanPackage, PackageAdjustment, Shot } from '../src/model.ts'
const pack = { id: 'p', bean_id: 'a', quantity: 500, carried_in: 12, opened_at: '2026-01-01T00:00:00Z', closed_at: '2026-02-01T00:00:00Z' } as BeanPackage
const shot = (id: string, dose: number, package_id = 'p') => ({ id, dose, package_id }) as Shot

test('stock includes room-wide assigned doses and adjustments without mixing packs', () => {
 const result = packageStock(pack, [shot('a',18.1),shot('b',18.2),shot('c',20,'other')], [{ package_id:'p', amount:-2.5 }] as PackageAdjustment[])
 assert.equal(result.remaining,473.2)
 assert.equal(result.consumed,36.3)
 assert.equal(result.total,512)
 assert.equal(result.shotsLeft,26)
 assert.equal(packageStock(pack,[shot('a',600)]).remaining,0)
 assert.equal(packageStock(pack,[]).shotsLeft,null)
 // Editing/removing a shot changes only the pack to which it belongs.
 assert.equal(packageStock(pack,[shot('a',19)]).remaining,493)
 assert.equal(packageStock(pack,[]).remaining,512)
})
test('pack assignment uses half-open date intervals and bean identity', () => {
 const next = {...pack,id:'next',opened_at:pack.closed_at!,closed_at:null}
 assert.equal(packageForShot([pack,next],'a','2026-01-02T00:00:00Z')?.id,'p')
 assert.equal(packageForShot([pack,next],'a','2026-02-01T00:00:00Z')?.id,'next')
 assert.equal(packageForShot([pack,next],'b','2026-02-01T00:00:00Z'),undefined)
 assert.equal(packageForShot([pack,next],'a','2025-12-31T00:00:00Z'),undefined)
})
