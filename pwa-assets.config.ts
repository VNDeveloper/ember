import { defineConfig, minimal2023Preset as preset } from '@vite-pwa/assets-generator/config'

// The icon is a full-bleed tile whose "E" already sits in the maskable safe zone: no extra padding.
export default defineConfig({
  preset: {
    ...preset,
    maskable: { ...preset.maskable, padding: 0 },
    apple: { ...preset.apple, padding: 0 },
  },
  images: ['public/icon.svg'],
})
