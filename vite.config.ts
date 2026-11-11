import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [VitePWA({
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
        src: '/icon-' + size + '.png',
        sizes: size + 'x' + size,
        type: 'image/png',
      })),
    },
    workbox: { navigateFallbackDenylist: [/^\/api\//], globPatterns: ['**/*.{js,css,html,png,woff2}'] },
  })],
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
})
