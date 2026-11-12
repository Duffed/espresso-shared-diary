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
const baskets = [basket]
const accounts = {
  'alex@example.test': { id: '00000000-0000-0000-0000-000000000004', name: 'Alex' },
  'sam@example.test': { id: '00000000-0000-0000-0000-000000000005', name: 'Sam' },
}
const members = Object.values(accounts).map((account, index) => ({
  room_id: room.id, user_id: account.id, name: account.name, admin: index === 0,
}))
const beans = [{ id: '00000000-0000-0000-0000-000000000006', room_id: room.id, name: 'Casa Blend', roaster: 'Test Rösterei', archived: false }]
const profiles = []
const photos = new Map()
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
    if (path === '/auth/v1/authorize') {
      const account = request.headers.cookie?.match(/(?:^|; )test-account=([^;]+)/)?.[1]
      const redirect = new URL(url.searchParams.get('redirect_to'))
      assert.equal(url.searchParams.get('provider'), 'google')
      assert.ok(url.searchParams.get('code_challenge'))
      redirect.searchParams.set('code', decodeURIComponent(account))
      response.writeHead(302, { Location: redirect.href }).end()
      return
    }
    if (path === '/auth/v1/token' && url.searchParams.get('grant_type') === 'pkce') {
      const { auth_code: email, code_verifier } = await body(request)
      assert.ok(code_verifier)
      const account = accounts[email]
      const exp = Math.floor(Date.now() / 1000) + 3600
      const token = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ sub: account.id, exp }) + '.test'
      return reply(response, {
        access_token: token, refresh_token: 'test', token_type: 'bearer', expires_in: 3600, expires_at: exp,
        user: { id: account.id, email, aud: 'authenticated', role: 'authenticated' },
      })
    }
    if (path.startsWith('/storage/v1/object/')) {
      const key = decodeURIComponent(path.replace('/storage/v1/object/authenticated/', '').replace('/storage/v1/object/', ''))
      if (request.method === 'POST') { for await (const chunk of request) {} photos.set(key, await readFile('public/icon-192.png')); return reply(response, { Key: key }) }
      if (request.method === 'DELETE') { const data = await body(request); for (const name of data.prefixes) photos.delete(key + '/' + name); return reply(response, []) }
      const photo = photos.get(key)
      if (!photo) return reply(response, {}, 404)
      response.writeHead(200, { 'Content-Type': 'image/png' }); response.end(photo); return
    }
    if (path.startsWith('/rest/v1/')) {
      const user = userId(request)
      if (!members.some(member => member.user_id === user)) return reply(response, [], 401)
      const single = request.headers.accept?.includes('object+json')
      if (path.endsWith('/rooms')) return reply(response, single ? room : [room])
      if (path.endsWith('/members')) return reply(response, members)
      if (path.endsWith('/grinders')) return reply(response, [grinder])
      if (path.endsWith('/profiles')) { if (request.method === 'POST') { profiles.push({ ...await body(request), id: 'new-profile', archived: false }); return reply(response, null, 201) } return reply(response, profiles) }
      if (path.endsWith('/beans')) {
        if (request.method === 'POST') { const bean = { ...await body(request), id: '00000000-0000-0000-0000-000000000007', archived: false }; beans.push(bean); return reply(response, single ? bean : [bean], 201) }
        if (request.method === 'PATCH') { const bean = beans.find(b => b.id === url.searchParams.get('id')?.replace(/^eq\./, '')); Object.assign(bean, await body(request)); return reply(response, single ? bean : [bean]) }
        return reply(response, beans)
      }
      if (path.endsWith('/baskets')) return reply(response, baskets)
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
        if (request.method === 'PATCH') {
          const shot = shots.find(item => item.id === id && item.author_id === user && item.version === Number(url.searchParams.get('version')?.replace(/^eq\./, '')))
          const fields = await body(request)
          if (!shot) return reply(response, null)
          Object.assign(shot, fields, { version: shot.version + 1 })
          return reply(response, shot)
        }
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
  await page.context().addCookies([{ name: 'test-account', value: encodeURIComponent(email), url: origin }])
  await page.goto(origin)
  await page.getByRole('button', { name: 'Mit Google anmelden' }).click()
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
  await mobile.grantPermissions(['clipboard-read', 'clipboard-write'])
  const first = await mobile.newPage()
  const second = await desktop.newPage()
  await Promise.all([login(first, 'alex@example.test'), login(second, 'sam@example.test')])
  assert.equal(await first.locator('header .app-brand').textContent(), 'Espresso Diary')
  assert.equal(await first.locator('.page-title').textContent(), 'Testküche')
  for (const pageName of ['Verlauf', 'Bohnen', 'Einstellungen', 'Start']) {
    await first.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name: pageName, exact: true }).click()
    await first.locator('.quick-brew').click()
    await first.locator('.shot-form').waitFor()
    assert.equal(await first.locator('.quick-brew').count(), 0)
    await first.getByRole('button', { name: 'Schließen', exact: true }).click()
  }

  await first.getByRole('button', { name: 'Einstellungen', exact: true }).click()
  await first.getByRole('button', { name: 'Dunkel', exact: true }).click()
  assert.equal(await first.locator('html').getAttribute('data-theme'), 'dark')
  await first.reload()
  assert.equal(await first.locator('html').getAttribute('data-theme'), 'dark')
  await first.getByRole('button', { name: 'Einstellungen', exact: true }).click()
  await first.screenshot({ path: 'tests/mobile-dark-settings.png', fullPage: true, animations: 'disabled' })
  await first.getByRole('button', { name: 'Hell', exact: true }).click()
  await first.emulateMedia({ colorScheme: 'dark' })
  assert.equal(await first.locator('html').getAttribute('data-theme'), 'light')
  await first.getByRole('button', { name: 'Automatisch', exact: true }).click()
  assert.equal(await first.locator('html').getAttribute('data-theme'), 'dark')
  await first.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await first.waitForFunction(() => document.documentElement.dataset.theme === 'light')
  assert.equal(await first.locator('.appearance').evaluate(el => getComputedStyle(el).animationName), 'none')
  await first.emulateMedia({ reducedMotion: 'no-preference' })
  await first.getByRole('button', { name: 'Start', exact: true }).click()


  await mobile.setOffline(true)
  await first.reload()
  await first.getByRole('heading', { name: 'Testküche' }).waitFor()
  await first.getByRole('button', { name: /Neuer Bezug/ }).first().click()
  await first.getByRole('button', { name: /Casa Blend/ }).click()
  await first.getByRole('heading', { name: 'Dein Mahlgrad', exact: true }).waitFor()
  for (const height of [844, 740]) {
    await first.setViewportSize({ width: 390, height })
    assert.equal(await first.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), true, 'Mahlgrad should fit viewport at ' + height)
  }
  const beforeMenu = await first.locator('.shot-form').boundingBox()
  await first.getByRole('button', { name: 'Menü', exact: true }).click()
  await first.getByRole('navigation', { name: 'Konto und Räume' }).waitFor()
  const afterMenu = await first.locator('.shot-form').boundingBox()
  assert.equal(beforeMenu.y, afterMenu.y)
  assert.equal(await first.getByRole('button', { name: 'Abmelden' }).isVisible(), true)
  await first.keyboard.press('Escape')
  assert.equal(await first.getByRole('button', { name: 'Menü', exact: true }).getAttribute('aria-expanded'), 'false')
  await first.getByRole('button', { name: 'Menü', exact: true }).click()
  await first.screenshot({ path: 'tests/mobile-menu.png' })
  await first.locator('main').click({ position: { x: 2, y: 400 } })
  assert.equal(await first.getByRole('button', { name: 'Menü', exact: true }).getAttribute('aria-expanded'), 'false')
  await first.screenshot({ path: 'tests/mobile-grind.png' })
  await first.setViewportSize({ width: 390, height: 844 })
  await first.getByRole('button', { name: 'Mahlgrad erhöhen' }).click()
  await first.getByRole('button', { name: 'Mahlgrad erhöhen' }).click()
  await first.getByRole('button', { name: 'Weiter →' }).click()
  assert.equal(await first.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await first.getByRole('button', { name: 'Dosis erhöhen' }).click({ clickCount: 2 })
  await first.getByRole('button', { name: 'Weiter →' }).click()
  await first.getByRole('button', { name: 'Weiter →' }).click()
  for (let i = 0; i < 4; i++) await first.getByRole('button', { name: 'Output erhöhen' }).click()
  await first.screenshot({ path: 'tests/mobile-wizard.png', fullPage: true, animations: 'disabled' })
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
  assert.equal(shots[0].grind, 0.2)
  assert.equal(shots[0].dose, 18.2)
  assert.equal(shots[0].bean_id, beans[0].id)
  assert.equal(shots[0].basket_id, basket.id)
  assert.equal(shots[0].author_name, 'Alex')
  await first.locator('.entry-author').filter({ hasText: 'Alex' }).waitFor()
  assert.equal(await second.getByRole('button', { name: '5 Sterne', exact: true }).isDisabled(), true)
  await first.getByRole('button', { name: '5 Sterne', exact: true }).click()
  await first.getByText('5 von 5 Sternen', { exact: true }).waitFor()
  assert.equal(shots[0].rating, 5)
  await first.reload()
  await first.getByText('5 von 5 Sternen', { exact: true }).waitFor()
  await first.getByRole('button', { name: '1 Stern', exact: true }).click()
  await first.getByText('1 von 5 Sternen', { exact: true }).waitFor()
  assert.equal(shots[0].rating, 1)
  await first.getByRole('button', { name: '1 Stern', exact: true }).click()
  await first.getByText('Noch nicht bewertet', { exact: true }).waitFor()
  assert.equal(shots[0].rating, null)
  assert.equal(await first.locator('.entry-details').getAttribute('open'), null)
  await first.locator('.entry-copy').first().click()
  assert.notEqual(await first.locator('.entry-details').getAttribute('open'), null)
  await first.getByRole('button', { name: '5 Sterne', exact: true }).click()
  await first.getByText('5 von 5 Sternen', { exact: true }).waitFor()
  assert.notEqual(await first.locator('.entry-details').getAttribute('open'), null)
  await first.locator('.entry-detail-body .meta').first().click()
  assert.equal(await first.locator('.entry-details').getAttribute('open'), null)
  await first.locator('.entry-details > summary').focus()
  await first.keyboard.press('Enter')
  assert.notEqual(await first.locator('.entry-details').getAttribute('open'), null)
  await first.keyboard.press('Space')
  assert.equal(await first.locator('.entry-details').getAttribute('open'), null)
  await first.getByRole('button', { name: /Neuer Bezug/ }).first().click()
  await first.getByRole('button', { name: /Casa Blend/ }).waitFor()
  await first.getByRole('button', { name: 'Weiter →' }).click()
  assert.equal(await first.getByRole('slider', { name: 'Mahlgrad' }).getAttribute('aria-valuenow'), '0.2')
  await first.getByRole('button', { name: 'Weiter →' }).click()
  assert.equal(await first.getByRole('slider', { name: 'Dosis' }).getAttribute('aria-valuenow'), '18.2')
  const dial = first.getByRole('slider', { name: 'Dosis' }); await dial.scrollIntoViewIfNeeded(); const rect = await dial.boundingBox()
  await first.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2)
  await first.mouse.down(); await first.mouse.move(rect.x + rect.width / 2 + 80, rect.y + rect.height / 2); await first.mouse.up()
  assert.equal(await dial.getAttribute('aria-valuenow'), '19.2')
  await dial.focus(); await first.keyboard.press('ArrowLeft')
  assert.equal(await dial.getAttribute('aria-valuenow'), '19.1')
  const ringBox = await dial.boundingBox()
  const cx = ringBox.x + ringBox.width / 2, cy = ringBox.y + ringBox.height / 2, radius = ringBox.width * .44
  await first.mouse.move(cx, cy - radius); await first.mouse.down()
  for (let i = 1; i <= 15; i++) { const angle = (-90 + i * 6) * Math.PI / 180; await first.mouse.move(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)) }
  assert.equal(await dial.getAttribute('aria-valuenow'), '20.6')
  for (let i = 1; i <= 15; i++) { const angle = -i * 6 * Math.PI / 180; await first.mouse.move(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)) }
  await first.mouse.up()
  assert.equal(await dial.getAttribute('aria-valuenow'), '19.1')
  for (const height of [844, 740]) {
    await first.setViewportSize({ width: 390, height })
    assert.equal(await first.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), true, 'Dose should fit viewport at ' + height)
  }
  await first.screenshot({ path: 'tests/mobile-dose-compact.png' })
  await first.setViewportSize({ width: 390, height: 844 })
  await first.getByRole('button', { name: 'Schließen' }).click()
  await first.screenshot({ path: 'tests/mobile-home.png', fullPage: true, animations: 'disabled' })
  await first.getByRole('button', { name: 'Bohnen', exact: true }).click()
  assert.equal(await first.locator('.page-title').textContent(), 'Bohnen')
  await first.getByRole('button', { name: '＋ Bohne', exact: true }).click()
  await first.getByLabel('Kaffeesorte').fill('Neue Bohne')
  await first.getByLabel('Rösterei · optional').fill('Lokale Rösterei')
  await first.evaluate(async () => {
    const image = await (await fetch('/icon-192.png')).blob()
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': image })])
  })
  await first.getByLabel('Kaffeesorte').focus()
  await first.keyboard.press('Control+v')
  await first.getByRole('button', { name: 'Foto ändern' }).waitFor()
  await first.locator('.photo-picker').screenshot({ path: 'tests/photo-picker.png' })
  await first.getByRole('button', { name: 'Bohne speichern' }).click()
  await first.getByText('Neue Bohne', { exact: true }).waitFor()
  assert.equal(beans.length, 2)
  assert.ok(beans[1].photo_path)
  assert.equal(photos.size, 1)
  const card = first.locator('.bean-card').filter({ hasText: 'Neue Bohne' })
  await card.locator('img').waitFor()
  assert.equal(await card.locator('img').evaluate(img => getComputedStyle(img).objectFit), 'cover')
  await first.reload()
  await first.getByRole('button', { name: 'Bohnen', exact: true }).click()
  await card.locator('img').waitFor()
  await card.getByRole('button', { name: 'Bearbeiten' }).click()
  await first.getByRole('button', { name: 'Foto entfernen' }).click()
  await first.getByRole('button', { name: 'Bohne speichern' }).click()
  await card.locator('img').waitFor({ state: 'hidden' })
  assert.equal(beans[1].photo_path, null)
  assert.equal(photos.size, 0)
  for (let i = 0; i < 8; i++) beans.push({ id: 'selection-' + i, room_id: room.id, name: ['Colombia', 'Brasil', 'Ethiopia', 'House Blend', 'Decaf', 'Kenya', 'Guatemala', 'India'][i], roaster: 'Rösterei am Markt', archived: false })
  for (let i = 0; i < 3; i++) shots.push({ ...shots[0], id: 'recent-' + i, bean_id: beans[i + 2].id, brewed_at: new Date(Date.now() + i * 1000).toISOString() })
  await first.reload()
  await first.getByRole('button', { name: /Neuer Bezug/ }).first().click()
  await first.locator('.recent-beans .bean-picture-card').nth(2).waitFor()
  assert.equal(await first.locator('.recent-beans .bean-picture-card').count(), 3)
  assert.equal(await first.getByRole('combobox').count(), 0)
  assert.equal(await first.locator('.recent-beans .bean-picture-card strong').first().textContent(), 'Ethiopia')
  assert.equal(await first.locator('.bean-scroll-list .bean-picture-card').count(), 7)
  assert.equal(await first.getByRole('button', { name: 'Ohne Bohne fortfahren' }).count(), 0)
  for (const height of [844, 740]) { await first.setViewportSize({width:390,height}); assert.equal(await first.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), true, 'Beans fit viewport ' + height) }
  await first.setViewportSize({width:390,height:844})
  assert.equal(await first.locator('.bean-scroll-list').evaluate(el => el.scrollHeight > el.clientHeight), true)
  await first.getByRole('button', { name: /India/ }).click()
  await first.getByRole('heading', { name: 'Dein Mahlgrad', exact: true }).waitFor()
  await first.getByRole('button', { name: 'Zurück', exact: true }).click()
  assert.equal(await first.getByRole('button', { name: /India/ }).getAttribute('aria-pressed'), 'true')
  await first.getByRole('button', { name: /Colombia/ }).click()
  await first.getByRole('heading', { name: 'Dein Mahlgrad', exact: true }).waitFor()
  await first.getByRole('button', { name: 'Zurück', exact: true }).click()
  assert.equal(await first.getByRole('button', { name: /Colombia/ }).getAttribute('aria-pressed'), 'true')
  assert.ok((await first.locator('.recent-beans .bean-picture').first().boundingBox()).width > 95)
  await first.screenshot({ path: 'tests/mobile-bean-selection.png', fullPage: true, animations: 'disabled' })
  await first.emulateMedia({ colorScheme: 'dark' })
  await first.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
  await first.screenshot({ path: 'tests/mobile-dark-beans.png', fullPage: true, animations: 'disabled' })
  await first.emulateMedia({ colorScheme: 'light' })
  assert.equal(await first.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await first.getByRole('button', { name: 'Schließen' }).click()
  await first.getByRole('button', { name: 'Einstellungen', exact: true }).click()
  assert.equal(await first.locator('.page-title').textContent(), 'Einstellungen')
  assert.equal(await first.getByRole('heading', { name: 'Testküche', exact: true }).count(), 0)
  assert.equal(await first.locator('.settings-group').count(), 6)
  assert.equal(await first.locator('.settings-group[open]').count(), 0)
  await first.screenshot({ path: 'tests/mobile-settings.png', fullPage: true, animations: 'disabled' })
  await first.locator('.settings-group > summary').filter({ hasText: 'Mühlen' }).click()
  const grinderSettings = first.locator('.settings-group').filter({ has: first.locator('summary').filter({ hasText: 'Mühlen' }) })
  await grinderSettings.getByRole('button', { name: 'Bearbeiten' }).click()
  await grinderSettings.getByLabel('Hersteller', { exact: true }).waitFor()
  assert.equal(await first.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await grinderSettings.getByLabel('Hersteller', { exact: true }).focus()
  await first.keyboard.press('Control+v')
  await grinderSettings.locator('.photo-edit img').waitFor()
  assert.equal(await grinderSettings.getByLabel('Hersteller', { exact: true }).inputValue(), 'Eureka')
  await first.evaluate(async () => { await navigator.clipboard.writeText('Testmodell') })
  await grinderSettings.getByLabel('Modell', { exact: true }).fill('')
  await first.keyboard.press('Control+v')
  assert.equal(await grinderSettings.getByLabel('Modell', { exact: true }).inputValue(), 'Testmodell')
  await grinderSettings.getByRole('button', { name: 'Abbrechen' }).click()
  await first.locator('.settings-group > summary').filter({ hasText: 'Siebe' }).click()
  const basketSettings = first.locator('.settings-group').filter({ has: first.locator('summary').filter({ hasText: 'Siebe' }) })
  await basketSettings.getByRole('button', { name: 'Bearbeiten' }).click()
  await first.evaluate(async () => { const image = await (await fetch('/icon-192.png')).blob(); await navigator.clipboard.write([new ClipboardItem({ 'image/png': image })]) })
  await basketSettings.getByLabel('Name', { exact: true }).focus()
  await first.keyboard.press('Control+v')
  await basketSettings.locator('.photo-edit img').waitFor()
  assert.equal(await basketSettings.getByLabel('Name', { exact: true }).inputValue(), basket.name)
  await basketSettings.getByRole('button', { name: 'Abbrechen' }).click()
  await first.locator('.settings-group > summary').filter({ hasText: 'Import' }).click()
  assert.equal(await first.getByRole('switch').isChecked(), true)
  for (let i = 0; i < 4; i++) baskets.push({ id: 'basket-' + i, room_id: room.id, name: 'Präzisionssieb ' + (16 + i * 2), capacity: 16 + i * 2, archived: false })
  for (let i = 0; i < 3; i++) shots.push({ ...shots[0], id: 'basket-shot-' + i, basket_id: baskets[i + 1].id, brewed_at: new Date(Date.now() + (i + 10) * 1000).toISOString() })
  await first.reload()
  await first.getByRole('button', { name: /Neuer Bezug/ }).first().click()
  await first.getByRole('button', { name: 'Schritt 3: Wie viel Kaffee?' }).click()
  const recentBaskets = first.getByRole('region', { name: 'Zuletzt verwendete Siebe', exact: true })
  await recentBaskets.getByRole('button').nth(2).waitFor()
  assert.equal(await recentBaskets.getByRole('button').count(), 3)
  assert.equal(await recentBaskets.locator('strong').first().textContent(), 'Präzisionssieb 20')
  assert.equal(await recentBaskets.getByRole('button', { name: /Präzisionssieb 20/ }).getAttribute('aria-pressed'), 'true')
  assert.equal(await first.getByRole('combobox').count(), 0)
  await first.locator('.basket-more > summary').click()
  assert.equal(await first.getByRole('region', { name: 'Siebliste', exact: true }).getByRole('button').count(), 2)
  await first.getByRole('button', { name: /Präzisionssieb 22/ }).click()
  await first.getByRole('button', { name: 'Weiter →' }).click()
  await first.getByRole('button', { name: 'Zurück', exact: true }).click()
  await first.locator('.basket-more > summary').click()
  assert.equal(await first.getByRole('button', { name: /Präzisionssieb 22/ }).getAttribute('aria-pressed'), 'true')
  assert.equal(await first.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await first.locator('.basket-picker').screenshot({ path: 'tests/mobile-basket-selection.png' })
  await first.getByRole('button', { name: 'Weiter →' }).click()
  await first.getByRole('button', { name: '＋ Neues Profil' }).click()
  await first.getByLabel('Profilname', { exact: true }).fill('Spontaner Espresso')
  await first.getByRole('button', { name: 'Profil hinzufügen', exact: true }).click()
  await first.getByRole('button', { name: /Spontaner Espresso/ }).waitFor()
  assert.equal(await first.getByRole('button', { name: /Spontaner Espresso/ }).getAttribute('aria-pressed'), 'true')
  assert.equal(profiles[0].name, 'Spontaner Espresso')
  console.log('PWA offline reload, queued shot, two-account visibility and duplicate retry passed.')
} finally {
  await browser?.close()
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  await rm(output, { recursive: true, force: true })
}
