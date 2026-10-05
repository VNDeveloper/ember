import { describe, expect, it } from 'vitest'
import { pwaOptions } from './options'

type Rule = { urlPattern: (o: { url: URL }) => boolean; handler: string }
const rules = () => (pwaOptions.workbox?.runtimeCaching ?? []) as unknown as Rule[]
const handlerFor = (href: string) => rules().find((r) => r.urlPattern({ url: new URL(href) }))?.handler ?? null

describe('PWA options', () => {
  it('describes Ember as a standalone app in its colours', () => {
    expect(pwaOptions.registerType).toBe('prompt')
    expect(pwaOptions.manifest).toMatchObject({ name: 'Ember', short_name: 'Ember', display: 'standalone', background_color: '#201e1d', theme_color: '#ec3013', start_url: '.', scope: '.' })
  })

  it('lists the install icons, including a maskable one', () => {
    const icons = (pwaOptions.manifest && pwaOptions.manifest.icons) || []
    expect(icons.map((i) => `${i.sizes}${i.purpose ? ` ${i.purpose}` : ''}`)).toEqual(['64x64', '192x192', '512x512', '512x512 maskable'])
  })

  it('caches Google Fonts for offline use, but never sign-in or Drive', () => {
    expect(handlerFor('https://fonts.googleapis.com/css2?family=Archivo')).toBe('StaleWhileRevalidate')
    expect(handlerFor('https://fonts.gstatic.com/s/archivo/v1/a.woff2')).toBe('CacheFirst')
    expect(handlerFor('https://accounts.google.com/gsi/client')).toBeNull()
    expect(handlerFor('https://www.googleapis.com/drive/v3/files')).toBeNull()
    expect(handlerFor('https://www.youtube.com/iframe_api')).toBeNull()
  })
})
