import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import App from './App.vue'
import { useEmberStore } from './stores/ember'
import { useUiStore } from './stores/ui'

const NOW = new Date(2026, 8, 23, 10, 0).getTime()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  localStorage.clear()
  setActivePinia(createPinia())
})
afterEach(() => vi.useRealTimers())

const mountApp = () => mount(App, { attachTo: document.body, global: { stubs: { teleport: true } } })

describe('App shell', () => {
  it('renders the nav, the focus bar and the current view', () => {
    const w = mountApp()
    expect(w.find('nav').exists()).toBe(true)
    expect(w.find('.focus-bar').exists()).toBe(true)
    expect(w.find('.view').text()).toContain('Today')
    w.unmount()
  })

  it('ticks the clock while mounted', () => {
    const w = mountApp()
    const ember = useEmberStore()
    vi.setSystemTime(NOW + 1000)
    vi.advanceTimersByTime(250)
    expect(ember.now).toBeGreaterThanOrEqual(NOW + 1000)
    w.unmount()
  })

  it('opens the picker and closes it with Esc', async () => {
    const w = mountApp()
    const ui = useUiStore()
    await w.find('.fb-title').trigger('click')
    expect(w.find('.picker-backdrop').exists()).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(ui.pickerOpen).toBe(false)
    expect(w.find('.picker-backdrop').exists()).toBe(false)
    w.unmount()
  })
})
