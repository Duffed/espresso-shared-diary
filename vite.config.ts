import { readFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import worker from './worker'

function localImageSearch(mode: string): Plugin {
  return {
    name: 'local-image-search',
    configureServer(server) {
      const env = loadEnv(mode, server.config.envDir)
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? '/', 'http://localhost')
        if (url.pathname !== '/api/images') return next()

        try {
          const local = await readFile(new URL('./.dev.vars', import.meta.url), 'utf8').catch(error => {
            if (error.code === 'ENOENT') return ''
            throw error
          })
          const vars = parseEnv(local)
          const result = await worker.fetch(new Request(url, {
            method: request.method,
            headers: { Authorization: request.headers.authorization ?? '' },
          }), {
            SUPABASE_URL: vars.SUPABASE_URL || env.VITE_SUPABASE_URL,
            SUPABASE_PUBLISHABLE_KEY: vars.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY,
            BRAVE_SEARCH_KEY: process.env.BRAVE_SEARCH_KEY || vars.BRAVE_SEARCH_KEY,
          })
          response.writeHead(result.status, Object.fromEntries(result.headers))
          response.end(await result.text())
        } catch (error) {
          next(error)
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [localImageSearch(mode), VitePWA({
    registerType: 'autoUpdate',
    manifest: {
      name: 'Espresso Diary',
      short_name: 'Espresso Diary',
      lang: 'de',
      start_url: '/',
      display: 'standalone',
      theme_color: '#faf5ee',
      background_color: '#faf5ee',
      icons: [192, 512].map(size => ({
        src: '/espresso-diary-' + size + '.png',
        sizes: size + 'x' + size,
        type: 'image/png',
        purpose: 'any maskable',
      })),
    },
    workbox: { navigateFallbackDenylist: [/^\/api\//], globPatterns: ['**/*.{js,css,html,png,woff2}'] },
  })],
  server: { fs: { deny: ['.env', '.env.*', '.dev.vars*', '*.{crt,pem}', '**/.git/**'] } },
}))
