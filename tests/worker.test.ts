import assert from 'node:assert/strict'
import test from 'node:test'
import worker from '../worker.ts'

test('the image search requires a room admin and returns approved preview URLs with sources', async t => {
  const base = 'https://diary.example/api/images'
  const room = '00000000-0000-0000-0000-000000000001'
  const request = () => new Request(base + '?room=' + room + '&q=Eureka+Mignon', {
    headers: { Authorization: 'Bearer test-session' },
  })
  const env = {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'public-key',
    BRAVE_SEARCH_KEY: 'server-key',
  }
  let admin = false
  const fetch = t.mock.method(globalThis, 'fetch', async (url: URL, init: RequestInit) => {
    if (url.hostname === 'test.supabase.co') {
      assert.deepEqual(JSON.parse(String(init.body)), { target: room, admins_only: true })
      assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer test-session')
      return Response.json(admin)
    }
    assert.equal(url.hostname, 'api.search.brave.com')
    assert.equal(url.searchParams.get('q'), 'Eureka Mignon Kaffeemühle')
    assert.equal(new Headers(init.headers).get('X-Subscription-Token'), 'server-key')
    return Response.json({ results: [
      { title: 'Mignon', url: 'https://source.example/mignon', thumbnail: { src: 'https://imgs.search.brave.com/photo' } },
      { title: 'Unusable', url: 'https://source.example', thumbnail: { src: 'http://unknown.example/photo' } },
    ] })
  })
  assert.equal((await worker.fetch(new Request(base), env)).status, 401)
  assert.equal(fetch.mock.callCount(), 0)
  assert.equal((await worker.fetch(request(), env)).status, 403)
  assert.equal(fetch.mock.callCount(), 1)
  admin = true
  const response = await worker.fetch(request(), env)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.deepEqual(await response.json(), { results: [{
    title: 'Mignon', image_url: 'https://imgs.search.brave.com/photo', source_url: 'https://source.example/mignon',
  }] })
})
