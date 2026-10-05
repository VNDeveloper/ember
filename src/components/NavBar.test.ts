import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUiStore } from '../stores/ui'
import NavBar from './NavBar.vue'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
  setActivePinia(createPinia())
})
afterEach(() => vi.useRealTimers())

describe('NavBar', () => {
  it("shows the brand, three tabs and today's date", () => {
    const w = mount(NavBar)
    expect(w.text()).toContain('Ember')
    expect(w.findAll('.tab').map((t) => t.text())).toEqual(['Today', 'Goals', 'Activity'])
    expect(w.find('.nav-date').text()).toBe('Wed 23 Sep 2026')
  })

  it('switches views and marks the active tab', async () => {
    const w = mount(NavBar)
    const ui = useUiStore()
    await w.findAll('.tab')[1].trigger('click')
    expect(ui.view).toBe('goals')
    expect(w.findAll('.tab')[1].classes()).toContain('is-active')
    expect(w.findAll('.tab')[1].attributes('aria-current')).toBe('page')
    expect(w.findAll('.tab')[0].attributes('aria-current')).toBeUndefined()
  })

  it('has the Data menu before the date', () => {
    const w = mount(NavBar)
    const nav = w.find('nav').element
    const toggle = w.find('.dm-toggle').element
    expect(toggle.textContent).toContain('Data')
    expect(toggle.compareDocumentPosition(w.find('.nav-date').element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(nav.contains(toggle)).toBe(true)
  })

  it('has the Settings menu after Data, and opening one closes the other', async () => {
    const w = mount(NavBar, { attachTo: document.body })
    const ui = useUiStore()
    const settings = w.find('.sm-toggle')
    expect(settings.text()).toBe('Settings')
    expect(w.find('.dm-toggle').element.compareDocumentPosition(settings.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await w.find('.dm-toggle').trigger('click')
    await settings.trigger('click')
    expect(ui).toMatchObject({ settingsMenuOpen: true, dataMenuOpen: false })
    expect(w.find('.dm-panel').exists()).toBe(false)
    expect(w.find('.sm-panel').exists()).toBe(true)
    w.unmount()
  })
})
