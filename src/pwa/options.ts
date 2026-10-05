import type { VitePWAOptions } from 'vite-plugin-pwa'

/** Installable Ember: own window, ink launch screen, red title bar; offline app shell; fonts cached after first use. */
export const pwaOptions: Partial<VitePWAOptions> = {
  registerType: 'prompt',
  includeAssets: ['icon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
  manifest: {
    name: 'Ember',
    short_name: 'Ember',
    description: 'Tasks, learning goals and a focus timer.',
    display: 'standalone',
    start_url: '.',
    scope: '.',
    background_color: '#201e1d',
    theme_color: '#ec3013',
    icons: [
      { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
      { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
    runtimeCaching: [
      {
        urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
        handler: 'StaleWhileRevalidate',
        options: { cacheName: 'google-fonts-css' },
      },
      {
        urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
        handler: 'CacheFirst',
        options: { cacheName: 'google-fonts', expiration: { maxEntries: 20, maxAgeSeconds: 31_536_000 }, cacheableResponse: { statuses: [0, 200] } },
      },
    ],
  },
}
