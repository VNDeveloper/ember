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

  it('returns focus to the focus-bar title when the picker closes', async () => {
    const w = mountApp()
    const title = w.find('.fb-title')
    ;(title.element as HTMLElement).focus()
    await title.trigger('click')
    expect(document.activeElement?.classList.contains('picker-input')).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(document.activeElement).toBe(title.element)
    w.unmount()
  })

  it('keeps Tab inside the picker', async () => {
    const w = mountApp()
    await w.find('.fb-title').trigger('click')
    const input = w.find('.picker-input').element as HTMLElement
    const rows = w.findAll('.picker-row')
    const last = rows[rows.length - 1].element as HTMLElement
    last.focus()
    await w.find('.picker').trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(input)
    await w.find('.picker').trigger('keydown', { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
    w.unmount()
  })

  it('switches between the Today, Goals and Activity views', async () => {
    const w = mountApp()
    expect(w.find('.today-view').exists()).toBe(true)
    await w.findAll('.tab')[1].trigger('click')
    expect(w.find('.goals-view').exists()).toBe(true)
    await w.findAll('.tab')[2].trigger('click')
    expect(w.find('.activity-view').exists()).toBe(true)
    expect(w.find('.hm-title').text()).toMatch(/hours focused in 2026$/)
    expect(w.findAll('.al-entry')).toHaveLength(10)
    expect(w.text()).not.toContain('This view arrives in a later phase.')
    w.unmount()
  })

  it('opens the goal from a Working-on card', async () => {
    const w = mountApp()
    await w.findAll('.wo-goal')[1].trigger('click')
    expect(w.find('.gs-title').text()).toBe('Speak Spanish at B1')
    w.unmount()
  })

  it('opens Focus mode from the focus bar and closes it with Esc', async () => {
    ;(window as unknown as { YT: unknown }).YT = { Player: vi.fn(function () { return { mute() {}, unMute() {}, playVideo() {}, destroy() {} } }) }
    const w = mountApp()
    const scan = w.find('[aria-label="Focus mode"]')
    ;(scan.element as HTMLElement).focus()
    await scan.trigger('click')
    expect(w.find('.focus-mode').exists()).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(w.find('.focus-mode').exists()).toBe(false)
    expect(document.activeElement).toBe(scan.element)
    w.unmount()
    delete (window as unknown as { YT?: unknown }).YT
  })

  it('closes the picker before Focus mode', async () => {
    ;(window as unknown as { YT: unknown }).YT = { Player: vi.fn(function () { return { mute() {}, unMute() {}, playVideo() {}, destroy() {} } }) }
    const w = mountApp()
    await w.find('[aria-label="Focus mode"]').trigger('click')
    const title = w.find('.fm-title')
    ;(title.element as HTMLElement).focus()
    await title.trigger('click')
    expect(w.find('.picker-backdrop').exists()).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(w.find('.picker-backdrop').exists()).toBe(false)
    expect(w.find('.focus-mode').exists()).toBe(true)
    expect(document.activeElement).toBe(w.find('.fm-title').element)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(w.find('.focus-mode').exists()).toBe(false)
    w.unmount()
    delete (window as unknown as { YT?: unknown }).YT
  })
})
