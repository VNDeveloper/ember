import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'
import { pwaOptions } from './src/pwa/options'

export default defineConfig({
  // GitHub Pages serves from /<repo>/ (set by the deploy workflow); everything else from /.
  base: process.env.BASE_PATH ?? '/',
  plugins: [vue(), VitePWA(pwaOptions)],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    env: { VITE_GOOGLE_CLIENT_ID: '' },
  },
})
