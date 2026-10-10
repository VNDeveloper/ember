import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'

const swNeedRefresh = ref(false)
const updateServiceWorker = vi.fn(async () => {})
let onNeedRefresh: (() => void) | undefined
vi.mock('virtual:pwa-register/vue', () => ({
  useRegisterSW: (opts: { onNeedRefresh?: () => void } = {}) => {
    onNeedRefresh = opts.onNeedRefresh
    return { needRefresh: swNeedRefresh, updateServiceWorker }
  },
}))

import { useAppUpdate } from './register'

let api: ReturnType<typeof useAppUpdate>
const Host = defineComponent({ setup() { api = useAppUpdate(); return () => h('div') } })

/** The service worker found a new version: it sets needRefresh, then calls back. */
function newVersionWaiting() {
  swNeedRefresh.value = true
  onNeedRefresh?.()
}

beforeEach(() => {
  swNeedRefresh.value = false
  updateServiceWorker.mockClear()
})
afterEach(() => { onNeedRefresh = undefined })

describe('useAppUpdate', () => {
  it('switches to a new version at once when nobody has used the page yet (a refresh)', () => {
    const w = mount(Host)
    newVersionWaiting()
    expect(updateServiceWorker).toHaveBeenCalledWith(true)
    expect(api.needRefresh.value).toBe(false)
    w.unmount()
  })

  it.each([['pointerdown'], ['keydown']])('asks first once the page has been used (%s)', (type) => {
    const w = mount(Host)
    document.dispatchEvent(new Event(type))
    newVersionWaiting()
    expect(updateServiceWorker).not.toHaveBeenCalled()
    expect(api.needRefresh.value).toBe(true)
    api.update()
    expect(updateServiceWorker).toHaveBeenCalledWith(true)
    w.unmount()
  })

  it('hides the prompt on dismiss', () => {
    const w = mount(Host)
    document.dispatchEvent(new Event('pointerdown'))
    newVersionWaiting()
    api.dismiss()
    expect(api.needRefresh.value).toBe(false)
    w.unmount()
  })
})
