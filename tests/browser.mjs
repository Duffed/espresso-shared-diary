import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { once } from 'node:events'
import { chromium, devices } from 'playwright'

const output = await mkdtemp(join(tmpdir(), 'espresso-pwa-'))
const room = { id: '00000000-0000-0000-0000-000000000001', name: 'Testküche', gaggimate: true }
const grinder = {
  id: '00000000-0000-0000-0000-000000000002', brand: 'Eureka', model: 'Mignon',
  minimum: 0, maximum: 15, step: 0.1, archived: false, room_id: room.id,
}
const basket = { id: '00000000-0000-0000-0000-000000000003', name: 'Eigenes Sieb', room_id: room.id }
const accounts = {
  'alex@example.test': { id: '00000000-0000-0000-0000-000000000004', name: 'Alex' },
  'sam@example.test': { id: '00000000-0000-0000-0000-000000000005', name: 'Sam' },
}
const members = Object.values(accounts).map((account, index) => ({
  room_id: room.id, user_id: account.id, name: account.name, admin: index === 0,
}))
const shots = []
let lostAcknowledgement = false
let writeAttempts = 0

function reply(response, value, status = 200) {
  response.writeHead(status, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(value))
}

async function body(request) {
  let data = ''
  for await (const chunk of request) data += chunk
  return JSON.parse(data || '{}')
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function userId(request) {
  const claims = request.headers.authorization?.split('.')[1]
  return claims && JSON.parse(Buffer.from(claims, 'base64url').toString()).sub
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost')
    const path = url.pathname
    if (path === '/auth/v1/otp') return reply(response, {})
    if (path === '/auth/v1/verify') {
      const { email } = await body(request)
      const account = accounts[email]
      const exp = Math.floor(Date.now() / 1000) + 3600
      const token = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ sub: account.id, exp }) + '.test'
      return reply(response, {
        access_token: token, refresh_token: 'test', token_type: 'bearer', expires_in: 3600, expires_at: exp,
        user: { id: account.id, email, aud: 'authenticated', role: 'authenticated' },
      })
    }
    if (path.startsWith('/rest/v1/')) {
      const user = userId(request)
      if (!members.some(member => member.user_id === user)) return reply(response, [], 401)
      const single = request.headers.accept?.includes('object+json')
      if (path.endsWith('/rooms')) return reply(response, single ? room : [room])
      if (path.endsWith('/members')) return reply(response, members)
      if (path.endsWith('/grinders')) return reply(response, [grinder])
      if (path.endsWith('/baskets')) return reply(response, [basket])
      if (path.endsWith('/shots')) {
        if (request.method === 'POST') {
          const shot = await body(request)
          writeAttempts++
          if (shots.some(item => item.id === shot.id)) {
            return reply(response, { code: '23505', message: 'duplicate key' }, 409)
          }
          const member = members.find(member => member.user_id === user)
          shots.push({ ...shot, author_id: user, author_name: member.name, version: 1 })
          if (!lostAcknowledgement) {
            lostAcknowledgement = true
            return reply(response, { message: 'Lost acknowledgement' }, 503)
          }
          return reply(response, null, 201)
        }
        const id = url.searchParams.get('id')?.replace(/^eq\./, '')
        const found = id ? shots.filter(shot => shot.id === id) : shots
        return reply(response, single ? found[0] ?? null : found)
      }
      return reply(response, [])
    }
    if (path.startsWith('/realtime/')) return reply(response, {}, 404)
    const file = path === '/' ? 'index.html' : path.slice(1)
    if (file.includes('..') || file.includes('\\')) return reply(response, {}, 400)
    const contentTypes = {
      '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css',
      '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2',
    }
    const content = await readFile(join(output, file))
    response.writeHead(200, { 'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream' })
    response.end(content)
  } catch (error) {
    reply(response, {}, error.code === 'ENOENT' ? 404 : 500)
  }
})
server.listen(0, '127.0.0.1')
await once(server, 'listening')
const origin = 'http://127.0.0.1:' + server.address().port
let browser

async function login(page, email) {
  await page.goto(origin)
  await page.getByLabel('E-Mail-Adresse').fill(email)
  await page.getByRole('button', { name: 'Code senden' }).click()
  await page.getByLabel('Code aus der E-Mail').fill('123456')
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await page.getByRole('heading', { name: 'Testküche' }).waitFor()
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
}

try {
  const build = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', output, '--emptyOutDir'], {
    stdio: 'inherit',
    env: { ...process.env, VITE_SUPABASE_URL: origin, VITE_SUPABASE_PUBLISHABLE_KEY: 'test-key' },
  })
  assert.equal(build.status, 0)
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined })
  const mobile = await browser.newContext(devices['iPhone 13'])
  const desktop = await browser.newContext()
  const first = await mobile.newPage()
  const second = await desktop.newPage()
  await Promise.all([login(first, 'alex@example.test'), login(second, 'sam@example.test')])

  await mobile.setOffline(true)
  await first.reload()
  await first.getByRole('heading', { name: 'Testküche' }).waitFor()
  await first.getByRole('button', { name: /Neuer Bezug/ }).click()
  await first.getByRole('button', { name: 'Eureka Mignon' }).click()
  await first.getByRole('button', { name: 'Mahlgrad erhöhen' }).click()
  await first.getByRole('button', { name: 'Mahlgrad erhöhen' }).click()
  await first.getByRole('button', { name: 'Eigenes Sieb' }).click()
  assert.equal(await first.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await first.getByLabel('Dosis (g)').fill('18,2')
  await first.getByLabel('Output (g)').fill('36,4')
  await first.getByRole('button', { name: 'Bezug speichern' }).click()
  await first.getByText('Wartet auf Synchronisierung').waitFor()
  await first.reload()
  await first.getByText('Wartet auf Synchronisierung').waitFor()
  assert.equal(shots.length, 0)

  await mobile.setOffline(false)
  await second.getByText('36,4').waitFor({ timeout: 25000 })
  await first.getByText('Wartet auf Synchronisierung').waitFor()
  await mobile.setOffline(true)
  await mobile.setOffline(false)
  await first.getByText('Wartet auf Synchronisierung').waitFor({ state: 'hidden' })
  assert.equal(writeAttempts, 2)
  assert.equal(shots.length, 1)
  assert.equal(shots[0].grind, 0.1)
  assert.equal(shots[0].basket_id, basket.id)
  assert.equal(shots[0].author_name, 'Alex')
  console.log('PWA offline reload, queued shot, two-account visibility and duplicate retry passed.')
} finally {
  await browser?.close()
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  await rm(output, { recursive: true, force: true })
}
