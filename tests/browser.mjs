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
let rejectDeletion = false

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
      if (path.endsWith('/profiles')) {
        if (request.method === 'POST') { profiles.push({ ...await body(request), id: crypto.randomUUID(), archived: false, ever_used: false, sort_order: 2147483647 }); return reply(response, null, 201) }
        if (request.method === 'PATCH') { Object.assign(profiles.find(p => p.id === url.searchParams.get('id')?.replace(/^eq\./, '')), await body(request)); return reply(response, null) }
        return reply(response, [...profiles].sort((a, b) => (a.sort_order ?? 2147483647) - (b.sort_order ?? 2147483647) || a.name.localeCompare(b.name)))
      }
      if (path.endsWith('/rpc/set_profile_order')) {
        const { profile_ids } = await body(request)
        profile_ids.forEach((id, index) => { profiles.find(p => p.id === id).sort_order = index + 1 })
        return reply(response, null)
      }
      if (path.endsWith('/rpc/delete_unused_profile')) {
        const { profile_id } = await body(request)
        const index = profiles.findIndex(p => p.id === profile_id)
        if (profiles[index].ever_used) return reply(response, { message: 'Bereits verwendet' }, 400)
        profiles.splice(index, 1)
        return reply(response, null)
      }
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
          if (fields.deleted_at && rejectDeletion) return reply(response, { message: 'Test deletion failure' }, 503)
          if (!shot) return reply(response, null)
          Object.assign(shot, fields, { version: shot.version + 1 })
          return reply(response, shot)
        }
        const found = id ? shots.filter(shot => shot.id === id) : shots.filter(shot => !shot.deleted_at)
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
  await page.getByRole('link', { name: 'Testküche', exact: true }).waitFor()
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
}

try {
  const build = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', output, '--emptyOutDir'], {
    stdio: 'inherit',
    env: { ...process.env, VITE_SUPABASE_URL: origin, VITE_SUPABASE_PUBLISHABLE_KEY: 'test-key' },
  })
  assert.equal(build.status, 0)
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined })
  const startup = await browser.newContext({ colorScheme: 'dark', serviceWorkers: 'block' })
  const startupPage = await startup.newPage()
  await startupPage.route('**/assets/*.js', route => route.abort())
  await startupPage.goto(origin)
  assert.equal(await startupPage.locator('html').getAttribute('data-theme'), 'dark', 'Theme applies even before React loads')
  assert.equal(await startupPage.locator('meta[name="theme-color"]').getAttribute('content'), '#191714')
  assert.equal(await startupPage.evaluate(() => getComputedStyle(document.documentElement).colorScheme), 'dark')
  await startup.close()
  const mobile = await browser.newContext(devices['iPhone 13'])
  const desktop = await browser.newContext()
  await mobile.grantPermissions(['clipboard-read', 'clipboard-write'])
  const first = await mobile.newPage()
  const second = await desktop.newPage()
  await Promise.all([login(first, 'alex@example.test'), login(second, 'sam@example.test')])
  assert.equal(await first.locator('header .app-brand').textContent(), room.name)
  assert.equal(await first.locator('.page-title').count(), 0)
  await first.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name: 'Bohnen', exact: true }).click()
  await first.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name: 'Verlauf', exact: true }).click()
  await first.goBack()
  await first.getByRole('heading', { name: 'Bohnen', exact: true }).waitFor()
  await first.reload()
  await first.getByRole('heading', { name: 'Bohnen', exact: true }).waitFor()
  await first.goBack()
  await first.locator('.brew-hero').waitFor()
  await first.goForward()
  await first.getByRole('heading', { name: 'Bohnen', exact: true }).waitFor()
  await first.goBack()
  await first.locator('.brew-hero').waitFor()
  await first.locator('.quick-brew').click()
  assert.equal(await first.locator('.step-track button').count(), 4)
  assert.equal(await first.getByRole('button', { name: /Schritt .*: Profil/ }).count(), 0)
  await first.getByRole('button', { name: 'Schritt 2: Mahlgrad', exact: true }).click()
  await first.getByRole('slider', { name: 'Mahlgrad', exact: true }).tap()
  await first.getByRole('heading', { name: 'Kaffeemenge – 3/4', exact: true }).waitFor()
  assert.equal(await first.locator('.basket-picker').count(), 0, 'Single basket selection is hidden')
  await first.getByRole('slider', { name: 'Dosis', exact: true }).tap()
  await first.getByRole('heading', { name: 'Ergebnis – 4/4', exact: true }).waitFor()
  await first.screenshot({ path: 'tests/mobile-results.png', animations: 'disabled' })
  await first.getByRole('button', { name: 'Schritt 3: Kaffeemenge', exact: true }).click()
  await first.getByRole('slider', { name: 'Dosis', exact: true }).focus()
  await first.keyboard.press('ArrowRight')
  const draftDose = await first.getByRole('slider', { name: 'Dosis', exact: true }).getAttribute('aria-valuenow')
  await first.reload()
  await first.getByRole('heading', { name: 'Kaffeemenge – 3/4', exact: true }).waitFor()
  assert.equal(await first.getByRole('slider', { name: 'Dosis', exact: true }).getAttribute('aria-valuenow'), draftDose)
  await first.getByRole('button', { name: 'Weiter →', exact: true }).click()
  assert.equal(await first.locator('#shot-title').textContent(), 'Ergebnis – 4/4')
  await first.goBack()
  await first.getByRole('heading', { name: 'Kaffeemenge – 3/4', exact: true }).waitFor()
  await first.goForward()
  await first.getByRole('heading', { name: 'Ergebnis – 4/4', exact: true }).waitFor()
  await first.getByRole('button', { name: 'Zurück', exact: true }).click()
  await first.getByRole('heading', { name: 'Kaffeemenge – 3/4', exact: true }).waitFor()
  assert.equal(await first.locator('#shot-title').textContent(), 'Kaffeemenge – 3/4')
  await first.locator('.shot-form > .section-heading').getByRole('button', { name: 'Abbrechen', exact: true }).click()
  profiles.push({ id: 'standard-profile', room_id: room.id, name: 'Standard', archived: false, ever_used: true, sort_order: 0 })
  await first.reload()
  await first.locator('.quick-brew').waitFor()
  await first.getByRole('button', { name: 'Menü', exact: true }).click()
  await first.locator('.menu-about > summary').click()
  assert.equal(await first.locator('.menu-about > p').isVisible(), true)
  await Promise.all([
    first.waitForEvent('load'),
    first.getByRole('button', { name: 'Neu laden', exact: true }).click(),
  ])
  await first.getByRole('link', { name: 'Testküche', exact: true }).waitFor()
  await first.emulateMedia({ reducedMotion: 'reduce' })
  await first.locator('.quick-brew').click()
  for (const height of [500, 740, 844, 915]) {
    await first.setViewportSize({ width: 412, height })
    let grindPosition
    for (let stage = 0; stage < 5; stage++) {
      await first.locator('.step-track button').nth(stage).click()
      const layout = await first.evaluate(() => ({
        gap: innerHeight - document.querySelector('.shot-form').getBoundingClientRect().bottom,
        overflow: document.documentElement.scrollHeight - innerHeight,
        actionsBottom: document.querySelector('.wizard-actions').getBoundingClientRect().bottom,
      }))
      assert.ok(layout.gap >= 0 && layout.gap <= 16, `Step ${stage} at ${height}: unused bottom gap ${layout.gap}`)
      assert.ok(layout.overflow <= 1, `Step ${stage} at ${height}: document overflow ${layout.overflow}`)
      assert.ok(layout.actionsBottom <= height, 'Wizard actions stay in view')
      if (stage === 1) {
        grindPosition = await first.getByRole('slider', { name: 'Mahlgrad', exact: true }).boundingBox()
        assert.equal(await first.locator('.wizard-fields select').count(), 0, 'Single grinder needs no selector')
        const positions = await first.locator('.dial-adjuster').evaluate(el => {
          const row = el.getBoundingClientRect(), wheel = el.querySelector('.dial').getBoundingClientRect()
          const buttons = [...el.querySelectorAll(':scope > button')].map(button => button.getBoundingClientRect())
          return { left: buttons[0].x + buttons[0].width / 2, right: buttons[1].x + buttons[1].width / 2, expectedLeft: (row.left + wheel.left) / 2, expectedRight: (row.right + wheel.right) / 2 }
        })
        assert.ok(Math.abs(positions.left - positions.expectedLeft) < 1 && Math.abs(positions.right - positions.expectedRight) < 1, 'Buttons centered in the space beside the wheel')
      }
      if (stage === 2) {
        const dosePosition = await first.getByRole('slider', { name: 'Dosis', exact: true }).boundingBox()
        for (const dimension of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(grindPosition[dimension] - dosePosition[dimension]) <= 1, `Matching wheel ${dimension} at ${height}`)
      }
      if (((stage === 1 || stage === 2) && height >= 740) || stage === 4) {
        const field = await first.locator('.shot-form > form > .wizard-fields').evaluate(el => ({ height: el.clientHeight, scroll: el.scrollHeight, dial: el.querySelector('.dial')?.getBoundingClientRect().height, children: [...el.children].map(child => [child.className, child.getBoundingClientRect().height]) }))
        assert.ok(field.scroll <= field.height + 1, `Dial and controls fit: ${stage}/${height} ${JSON.stringify(field)}`)
      }
    }
  }
  await first.setViewportSize({ width: 390, height: 844 })
  await first.locator('.shot-form > .section-heading').getByRole('button', { name: 'Abbrechen', exact: true }).click()
  for (const pageName of ['Verlauf', 'Bohnen', 'Einstellungen', 'Start']) {
    await first.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name: pageName, exact: true }).click()
    const fixedTitle = first.locator(pageName === 'Start' ? 'header .app-brand' : '.page-title')
    const titleTop = await fixedTitle.evaluate(el => el.getBoundingClientRect().top)
    await first.locator('.room-content').evaluate(el => { el.scrollTop = 10000 })
    if (pageName === 'Bohnen') assert.equal(await first.locator('.room-content').evaluate(el => el.scrollTop), 0, 'Short bean list has no empty scroll area')
    assert.equal(await fixedTitle.evaluate(el => el.getBoundingClientRect().top), titleTop, 'Page title stays fixed')
    assert.equal(await first.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), true, 'No document scroll on ' + pageName)
    if (pageName === 'Verlauf') {
      assert.equal(await first.getByRole('button', { name: /Neuer Bezug/ }).count(), 0)
      continue
    }
    await first.locator('.quick-brew').click()
    await first.locator('.shot-form').waitFor()
    assert.equal(await first.locator('.quick-brew').count(), 0)
    await first.locator('.shot-form > .section-heading').getByRole('button', { name: 'Abbrechen', exact: true }).click()
  }

  await first.getByRole('button', { name: 'Einstellungen', exact: true }).click()
  await first.getByRole('button', { name: 'Dunkel', exact: true }).click()
  assert.equal(await first.locator('html').getAttribute('data-theme'), 'dark')
  assert.equal(await first.locator('meta[name="color-scheme"]').getAttribute('content'), 'dark')
  assert.equal(await first.locator('body').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(25, 23, 20)')
  assert.equal(await first.locator('.bottom-nav').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(25, 23, 20)')
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
  assert.equal(await first.getByLabel('Dosis · pro Umdrehung').inputValue(), '20')
  assert.equal(await first.getByLabel('Output · pro Umdrehung').inputValue(), '20')
  // Keep the existing fine-grained dial regression below at its original scale.
  for (const label of ['Dosis', 'Output', 'Laufzeit', 'Solltemperatur']) await first.getByLabel(label + ' · pro Umdrehung').selectOption('6')
  await first.getByRole('button', { name: 'Start', exact: true }).click()


  await mobile.setOffline(true)
  await first.reload()
  await first.getByRole('link', { name: 'Testküche', exact: true }).waitFor()
  await first.getByRole('button', { name: /Neuer Bezug/ }).first().click()
  await first.getByRole('button', { name: /Casa Blend/ }).click()
  await first.getByRole('heading', { name: 'Mahlgrad – 2/5', exact: true }).waitFor()
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
  await first.locator('.shot-form > .section-heading').getByRole('button', { name: 'Abbrechen', exact: true }).click()
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
  await first.getByRole('heading', { name: 'Mahlgrad – 2/5', exact: true }).waitFor()
  await first.getByRole('button', { name: 'Zurück', exact: true }).click()
  assert.equal(await first.getByRole('button', { name: /India/ }).getAttribute('aria-pressed'), 'true')
  await first.getByRole('button', { name: /Colombia/ }).click()
  await first.getByRole('heading', { name: 'Mahlgrad – 2/5', exact: true }).waitFor()
  await first.getByRole('button', { name: 'Zurück', exact: true }).click()
  assert.equal(await first.getByRole('button', { name: /Colombia/ }).getAttribute('aria-pressed'), 'true')
  assert.ok((await first.locator('.recent-beans .bean-picture').first().boundingBox()).width > 95)
  await first.screenshot({ path: 'tests/mobile-bean-selection.png', fullPage: true, animations: 'disabled' })
  assert.equal(await first.locator('.bean-scroll-list .bean-picture').evaluateAll(elements => elements.every(el => {
    const picture = el.getBoundingClientRect()
    const content = el.firstElementChild.getBoundingClientRect()
    return Math.abs(picture.height - picture.width * 1.25) <= 2 && content.bottom <= picture.bottom + 1
  })), true, 'Bean pictures preserve their ratio and keep placeholders inside their cards')
  const cardLayout = await first.locator('.bean-scroll-list .bean-picture-card').evaluateAll(elements => elements.map(el => {
    const card = el.getBoundingClientRect(), picture = el.querySelector('.bean-picture').getBoundingClientRect()
    return { top: card.top, bottom: card.bottom, pictureBottom: picture.bottom }
  }))
  assert.ok(cardLayout.every((card, index) => card.pictureBottom <= card.bottom && (index < 3 || card.top >= cardLayout[index - 3].bottom)), 'Bean grid rows must not overlap: ' + JSON.stringify(cardLayout))
  await first.emulateMedia({ colorScheme: 'dark' })
  await first.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
  await first.screenshot({ path: 'tests/mobile-dark-beans.png', fullPage: true, animations: 'disabled' })
  await first.emulateMedia({ colorScheme: 'light' })
  assert.equal(await first.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await first.locator('.shot-form > .section-heading').getByRole('button', { name: 'Abbrechen', exact: true }).click()
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
  await first.getByRole('button', { name: 'Schritt 3: Kaffeemenge' }).click()
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
  assert.equal(profiles.at(-1).name, 'Spontaner Espresso')
  await first.locator('.profile-options').getByRole('button', { name: /Spontaner Espresso/ }).click()
  await first.getByRole('heading', { name: 'Ergebnis – 5/5', exact: true }).waitFor()
  await first.getByRole('button', { name: 'Zurück', exact: true }).click()
  await first.getByRole('heading', { name: 'Profil – 4/5', exact: true }).waitFor()
  assert.equal(await first.locator('.profile-options').getByRole('button', { name: /Spontaner Espresso/ }).getAttribute('aria-pressed'), 'true')
  await first.locator('.profile-options').getByRole('button', { name: /Ohne Profil/ }).click()
  assert.equal(await first.locator('.shot-form').getAttribute('data-step'), '4')
  await first.getByRole('button', { name: 'Zurück', exact: true }).click()
  assert.equal(await first.locator('.profile-options').getByRole('button', { name: /Ohne Profil/ }).getAttribute('aria-pressed'), 'true')
  await first.locator('.shot-form > .section-heading').getByRole('button', { name: 'Abbrechen', exact: true }).click()
  await first.getByRole('button', { name: 'Einstellungen', exact: true }).click()
  const profileGroup = first.locator('.settings-group').filter({ has: first.locator('summary strong', { hasText: 'Bezugsprofile' }) })
  await profileGroup.locator(':scope > summary').click()
  assert.equal(await profileGroup.getByRole('button', { name: 'Standard löschen', exact: true }).count(), 0)
  const dragHandle = profileGroup.getByRole('button', { name: 'Spontaner Espresso verschieben', exact: true })
  await dragHandle.scrollIntoViewIfNeeded()
  const dragFrom = await dragHandle.boundingBox()
  const dragTo = await profileGroup.getByRole('button', { name: 'Standard verschieben', exact: true }).boundingBox()
  const profileTouch = await mobile.newCDPSession(first)
  const dragX = dragFrom.x + dragFrom.width / 2
  const dragStartY = dragFrom.y + dragFrom.height / 2
  const dragEndY = dragTo.y + dragTo.height / 2
  await profileTouch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: dragX, y: dragStartY }] })
  for (let step = 1; step <= 8; step++) await profileTouch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: dragX, y: dragStartY + (dragEndY - dragStartY) * step / 8 }] })
  await profileTouch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await first.waitForFunction(() => document.querySelector('.profile-admin-list > li > span')?.textContent === 'Spontaner Espresso')
  await first.reload()
  await first.getByRole('button', { name: 'Einstellungen', exact: true }).click()
  await profileGroup.locator(':scope > summary').click()
  assert.equal(await profileGroup.locator('.profile-admin-list > li > span').first().textContent(), 'Spontaner Espresso')
  const spontaneous = profileGroup.locator('li').filter({ has: first.locator('span', { hasText: /^Spontaner Espresso$/ }) })
  await spontaneous.getByRole('button', { name: 'Archivieren', exact: true }).click()
  await profileGroup.locator('.archived-profiles').waitFor()
  assert.equal(await profileGroup.getByRole('button', { name: 'Aktivieren', exact: true }).isVisible(), false)
  await profileGroup.locator('.archived-profiles > summary').click()
  await profileGroup.getByRole('button', { name: 'Aktivieren', exact: true }).click()
  await profileGroup.getByRole('button', { name: 'Spontaner Espresso löschen', exact: true }).click()
  await profileGroup.getByRole('button', { name: 'Spontaner Espresso löschen', exact: true }).waitFor({ state: 'detached' })
  assert.equal(profiles.some(p => p.name === 'Spontaner Espresso'), false)
  for (const [label, revolution] of [['Dosis', '20'], ['Output', '20'], ['Laufzeit', '60'], ['Solltemperatur', '10']]) {
    await first.getByLabel(label + ' · pro Umdrehung').selectOption(revolution)
  }
  await first.reload()
  await first.getByRole('button', { name: 'Einstellungen', exact: true }).click()
  assert.equal(await first.getByLabel('Dosis · pro Umdrehung').inputValue(), '20')
  await first.screenshot({ path: 'tests/mobile-dial-settings.png', fullPage: true, animations: 'disabled' })
  await first.getByRole('button', { name: /Neuer Bezug/ }).first().click()
  await first.getByRole('button', { name: 'Schritt 3: Kaffeemenge' }).click()
  await first.locator('.precise > summary').click()
  await first.getByLabel('Dosis direkt', { exact: true }).fill('18')
  await first.getByRole('button', { name: 'Dosis erhöhen' }).click()
  assert.equal(await first.getByRole('slider', { name: 'Dosis', exact: true }).getAttribute('aria-valuenow'), '18.1')
  await first.getByLabel('Dosis direkt', { exact: true }).fill('18.2')
  assert.equal(await first.getByRole('slider', { name: 'Dosis', exact: true }).getAttribute('aria-valuenow'), '18.2')
  await first.getByRole('button', { name: 'Schritt 5: Ergebnis' }).click()
  async function turn(label, degrees) {
    const dial = first.getByRole('slider', { name: label, exact: true })
    await dial.scrollIntoViewIfNeeded()
    const box = await dial.boundingBox()
    const x = box.x + box.width / 2, y = box.y + box.height / 2, radius = box.width * .44
    await first.mouse.move(x, y - radius)
    await first.mouse.down()
    for (let step = 1; step <= 60; step++) {
      const angle = (-90 + degrees * step / 60) * Math.PI / 180
      await first.mouse.move(x + radius * Math.cos(angle), y + radius * Math.sin(angle))
    }
    await first.mouse.up()
  }
  for (const [label, initial, expected] of [['Output', '40', '20'], ['Laufzeit', '90', '30']]) {
    const control = first.locator('.dial-control').filter({ has: first.getByRole('slider', { name: label, exact: true }) })
    await control.locator('.precise > summary').click()
    await first.getByLabel(label + ' direkt', { exact: true }).fill(initial)
    await turn(label, -360)
    assert.equal(await first.getByRole('slider', { name: label, exact: true }).getAttribute('aria-valuenow'), expected)
  }
  await first.getByText('Weitere Angaben & Import', { exact: true }).click()
  await turn('Solltemperatur', 360)
  assert.equal(await first.getByRole('slider', { name: 'Solltemperatur' }).getAttribute('aria-valuenow'), '103')
  await first.locator('.shot-form > .section-heading').getByRole('button', { name: 'Abbrechen', exact: true }).click()
  await first.getByRole('button', { name: 'Verlauf', exact: true }).click()
  const entries = first.locator('.history-entry')
  const entryCount = await entries.count()
  await first.getByRole('searchbox', { name: 'Bezüge durchsuchen' }).fill('keine-passende-bohne-xyz')
  assert.equal(await entries.count(), 0)
  await first.getByRole('button', { name: 'Filter zurücksetzen', exact: true }).click()
  assert.equal(await entries.count(), entryCount)
  await first.getByRole('button', { name: 'Filter', exact: true }).click()
  await first.locator('.history-filters').getByLabel('Person', { exact: true }).selectOption(accounts['alex@example.test'].id)
  assert.ok(await entries.count() > 0)
  await first.getByRole('button', { name: 'Filter zurücksetzen', exact: true }).click()
  await first.getByRole('button', { name: 'Filter', exact: true }).click()
  const touch = await mobile.newCDPSession(first)
  async function swipe(distance) {
    const copy = entries.first().locator('.entry-copy')
    await copy.scrollIntoViewIfNeeded()
    const box = await copy.boundingBox()
    const x = box.x + box.width - 5, y = box.y + 5
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    for (let step = 1; step <= 12; step++) {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + distance * step / 12, y }] })
    }
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }
  await swipe(-45)
  assert.equal(await entries.count(), entryCount, 'Short swipe does not delete')
  assert.equal(await entries.first().locator('details').getAttribute('open'), null, 'Swipe does not toggle details')
  await swipe(-120)
  await first.getByRole('button', { name: 'Rückgängig', exact: true }).waitFor()
  assert.equal(await entries.count(), entryCount - 1)
  assert.equal(shots.filter(shot => shot.deleted_at).length, 0, 'Deletion is deferred during undo window')
  await first.getByRole('button', { name: 'Einstellungen', exact: true }).click()
  await first.getByRole('button', { name: 'Rückgängig', exact: true }).click()
  await first.getByRole('button', { name: 'Verlauf', exact: true }).click()
  assert.equal(await entries.count(), entryCount)
  await first.screenshot({ path: 'tests/mobile-swipe-history.png', fullPage: true, animations: 'disabled' })
  assert.equal(await first.locator('.swipe-delete-hint').first().isVisible(), false, 'Delete background stays hidden when not swiping')
  rejectDeletion = true
  await swipe(-120)
  await first.getByText('Der Bezug konnte nicht gelöscht werden. Prüfe den aktuellen Stand und versuche es erneut.', { exact: true }).waitFor({ timeout: 15000 })
  assert.equal(await entries.count(), entryCount, 'Failed deletion restores the entry')
  rejectDeletion = false
  await swipe(-120)
  await first.locator('.undo-deletion').waitFor({ state: 'hidden', timeout: 15000 })
  assert.equal(shots.filter(shot => shot.deleted_at).length, 1)
  await first.reload()
  await first.getByRole('button', { name: 'Verlauf', exact: true }).click()
  assert.equal(await entries.count(), entryCount - 1, 'Deletion persists after reload')
  await second.reload()
  await second.locator('.history-entry').first().waitFor()
  assert.equal(await second.locator('.swipe-entry[data-enabled]').count(), 0, 'Other authors cannot be swiped away')
  console.log('Early dark theme, persistent dial revolutions, swipe cancellation, undo, deletion failure and persistence passed.')
  for (const [width, height] of [[768, 1024], [1024, 768], [1440, 900]]) {
    await first.setViewportSize({ width, height })
    await first.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name: 'Start', exact: true }).click()
    const rail = await first.locator('.bottom-nav').boundingBox()
    assert.ok(rail.x < 1 && rail.width <= 96 && rail.height > 500, 'Expanded layout uses a navigation rail')
    assert.equal(await first.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No horizontal overflow on expanded screens')
    await first.screenshot({ path: `tests/expanded-home-${width}.png`, animations: 'disabled' })
    await first.locator('.quick-brew').click()
    await first.getByRole('button', { name: /Schritt .*: Ergebnis/ }).click()
    const resultLayout = await first.locator('.wizard-fields').evaluate(el => ({ height: el.clientHeight, scroll: el.scrollHeight }))
    assert.ok(resultLayout.scroll <= resultLayout.height + 1, 'Expanded result fits without scrolling')
    const wheels = await first.locator('.result-dials .dial').all()
    const left = await wheels[0].boundingBox(), right = await wheels[1].boundingBox()
    assert.ok(right.x > left.x + left.width && Math.abs(left.y - right.y) < 1, 'Expanded result wheels sit side by side')
    await first.screenshot({ path: `tests/expanded-results-${width}.png`, animations: 'disabled' })
    await first.locator('.shot-form > .section-heading').getByRole('button', { name: 'Abbrechen', exact: true }).click()
  }
  console.log('PWA offline reload, queued shot, two-account visibility and duplicate retry passed.')
} finally {
  await browser?.close()
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  await rm(output, { recursive: true, force: true })
}
