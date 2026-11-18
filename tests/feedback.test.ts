import test from 'node:test'
import assert from 'node:assert/strict'
import { beanGrind, latestBeanShot, adviceText, type Shot, type Grinder } from '../src/model.ts'
const grinder = { id: 'm', minimum: 0, maximum: 15, step: .1 } as Grinder
const shot = (id: string, bean: string, grind: number, time: number, author = 'a', advice: Shot['grind_advice'] = null): Shot => ({ id, bean_id: bean, grinder_id: 'm', grind, brewed_at: new Date(time).toISOString(), author_id: author, grind_advice: advice } as Shot)
test('grind follows room-wide bean and grinder history, not the last author or bean', () => {
 const shots = [shot('a', 'A', 3, 1), shot('b', 'B', 5, 2)]
 assert.equal(beanGrind(shots, 'A', grinder), 3)
 assert.equal(beanGrind(shots, 'B', grinder), 5)
 shots.push(shot('c', 'A', 4, 3, 'other'))
 assert.equal(beanGrind(shots, 'A', grinder), 4)
 assert.equal(beanGrind(shots, 'C', grinder), 0)
 assert.equal(beanGrind(shots, 'A', { ...grinder, id: 'other' }), 0)
 assert.equal(beanGrind(shots, '', grinder), 0)
 assert.equal(beanGrind(shots, 'A', { ...grinder, maximum: 2 }), 0)
})
test('only newest shot supplies advice and equal timestamps have deterministic order', () => {
 const shots = [shot('b', 'A', 3, 1, 'a', 'coarser'), shot('a', 'A', 3, 1)]
 assert.equal(latestBeanShot(shots, 'A', 'm')?.id, 'a')
 assert.equal(adviceText(latestBeanShot(shots, 'A', 'm')!), '')
 assert.equal(adviceText({ grind_advice: 'exact', grind_target: 3.2 }), '3,2')
 assert.equal(adviceText({ grind_advice: 'finer' }), 'Feiner')
 assert.equal(adviceText({ grind_advice: 'coarser' }), 'Gröber')
})
