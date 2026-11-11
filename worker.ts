interface Env {
  SUPABASE_URL: string
  SUPABASE_PUBLISHABLE_KEY: string
  BRAVE_SEARCH_KEY?: string
}

interface BraveImage {
  title?: string
  url?: string
  thumbnail?: { src?: string }
}

const json = (body: object, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store' },
})

function httpsUrl(value: unknown, host?: string) {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    if (url.protocol === 'https:' && !url.username && !url.password && (!host || url.hostname === host)) {
      return url.href
    }
  } catch { /* Ignore unusable search results. */ }
  return null
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)
    if (url.pathname !== '/api/images' || request.method !== 'GET') return json({ error: 'Nicht gefunden.' }, 404)
    const auth = request.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) return json({ error: 'Bitte melde dich an.' }, 401)
    const room = url.searchParams.get('room') ?? ''
    const query = url.searchParams.get('q')?.trim() ?? ''
    if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(room) || query.length < 2 || query.length > 201) {
      return json({ error: 'Gib Hersteller und Modell ein.' }, 400)
    }
    if (!env.BRAVE_SEARCH_KEY || !env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
      return json({ error: 'Die Bildsuche ist noch nicht eingerichtet.' }, 503)
    }
    try {
      const access = await fetch(new URL('/rest/v1/rpc/in_room', env.SUPABASE_URL), {
        method: 'POST',
        headers: { Authorization: auth, apikey: env.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: room, admins_only: true }),
        signal: AbortSignal.timeout(8000),
      })
      if (!access.ok || await access.json() !== true) return json({ error: 'Kein Zugriff auf die Bildsuche.' }, 403)
      const search = new URL('https://api.search.brave.com/res/v1/images/search')
      search.search = new URLSearchParams({ q: query + ' Kaffeemühle', count: '8', safesearch: 'strict' }).toString()
      const response = await fetch(search, {
        headers: { 'X-Subscription-Token': env.BRAVE_SEARCH_KEY, Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      })
      if (!response.ok) return json({ error: 'Die Bildsuche ist gerade nicht verfügbar.' }, 502)
      const data = await response.json() as { results?: BraveImage[] }
      const results = (data.results ?? []).flatMap(item => {
        const image_url = httpsUrl(item.thumbnail?.src, 'imgs.search.brave.com')
        const source_url = httpsUrl(item.url)
        return image_url && source_url ? [{ image_url, source_url, title: item.title ?? '' }] : []
      })
      return json({ results })
    } catch {
      return json({ error: 'Die Bildsuche ist gerade nicht verfügbar.' }, 502)
    }
  },
}
