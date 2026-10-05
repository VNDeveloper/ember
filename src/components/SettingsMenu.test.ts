import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EmberData } from '../core/model'
import { dataFixture } from '../core/test-fixtures'
import { useEmberStore } from '../stores/ember'
import { useUiStore } from '../stores/ui'
import SettingsMenu from './SettingsMenu.vue'

async function setup(patch: Partial<EmberData> = {}) {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  ember.replaceData(dataFixture(patch))
  const ui = useUiStore()
  const w = mount(SettingsMenu, { attachTo: document.body })
  await w.find('.sm-toggle').trigger('click')
  return { w, ember, ui }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
  window.history.replaceState({}, '', '/')
})
afterEach(() => {
  vi.useRealTimers()
  window.history.replaceState({}, '', '/')
})

describe('SettingsMenu', () => {
  it('opens and closes the panel', async () => {
    const { w, ui } = await setup()
    expect(ui.settingsMenuOpen).toBe(true)
    expect(w.find('.sm-toggle').attributes('aria-expanded')).toBe('true')
    expect(w.find('.sm-panel').attributes()).toMatchObject({ role: 'region', 'aria-label': 'Settings' })
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await flushPromises()
    expect(ui.settingsMenuOpen).toBe(false)
    expect(w.find('.sm-panel').exists()).toBe(false)
    w.unmount()
  })

  it('switches the session length and resets an idle timer to it', async () => {
    const { w, ember } = await setup()
    const opts = w.findAll('.sm-session input')
    expect((opts[0].element as HTMLInputElement).checked).toBe(true)
    await opts[1].setValue(true)
    expect(ember.settings.session).toBe('50/10')
    expect(ember.timer.leftSec).toBe(3000)
    expect(w.find('.sm-session-note').exists()).toBe(false)
    w.unmount()
  })

  it('says a new length applies from the next session while one runs', async () => {
    const endsAt = new Date(2026, 8, 23, 10, 20).getTime()
    const { w, ember } = await setup({ timer: { phase: 'focus', running: true, endsAt, leftSec: 1500, speed: 1, lengthSec: 1500 } })
    await w.findAll('.sm-session input')[1].setValue(true)
    expect(ember.settings.session).toBe('50/10')
    expect(ember.timer).toMatchObject({ running: true, endsAt, lengthSec: 1500 })
    expect(w.find('.sm-session-note').text()).toBe('Applies from the next session')
    w.unmount()
  })

  it('turns demo speed and future days on and off', async () => {
    const { w, ember } = await setup()
    const demo = w.find('.sm-demo')
    expect(demo.attributes('aria-pressed')).toBe('false')
    await demo.trigger('click')
    expect(ember.settings.demo).toBe(true)
    expect(ember.demo).toBe(true)
    expect(demo.attributes('aria-pressed')).toBe('true')
    const future = w.find('.sm-future')
    expect(future.attributes('aria-pressed')).toBe('true')
    await future.trigger('click')
    expect(ember.settings.showFuture).toBe(false)
    expect(future.attributes('aria-pressed')).toBe('false')
    w.unmount()
  })

  it('locks demo speed on when the link turns it on', async () => {
    window.history.replaceState({}, '', '/?demo=1')
    const { w, ember } = await setup()
    const demo = w.find('.sm-demo')
    expect(demo.attributes()).toMatchObject({ 'aria-pressed': 'true', disabled: '' })
    expect(w.find('.sm-demo-note').text()).toBe('On from the link (?demo=1)')
    await demo.trigger('click')
    expect(ember.settings.demo).toBe(false)
    w.unmount()
  })

  it('steps done-wall weeks between 4 and 26', async () => {
    const { w, ember } = await setup({ settings: { ...dataFixture().settings, wallWeeks: 5 } })
    expect(w.find('.sm-weeks').text()).toBe('5 weeks')
    await w.find('.sm-weeks-less').trigger('click')
    expect(ember.settings.wallWeeks).toBe(4)
    expect(w.find('.sm-weeks-less').attributes('disabled')).toBeDefined()
    expect(w.find('.sm-weeks-more').attributes('disabled')).toBeUndefined()
    ember.updateSettings({ wallWeeks: 25 })
    await flushPromises()
    await w.find('.sm-weeks-more').trigger('click')
    expect(ember.settings.wallWeeks).toBe(26)
    expect(w.find('.sm-weeks-more').attributes('disabled')).toBeDefined()
    w.unmount()
  })
})
