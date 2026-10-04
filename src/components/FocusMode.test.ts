import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EmberData, StepTarget } from '../core/model'
import { dataFixture, goalFixture } from '../core/test-fixtures'
import { useEmberStore } from '../stores/ember'
import { useUiStore } from '../stores/ui'
import FocusMode from './FocusMode.vue'

const LINE: StepTarget = { kind: 'step', goalId: 'D3', msId: 'D3/First charts', stepId: 'D3/First charts/Line' }
let players: { mute: ReturnType<typeof vi.fn>; unMute: ReturnType<typeof vi.fn>; playVideo: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }[]
let Player: ReturnType<typeof vi.fn>

async function setup(patch: Partial<EmberData> = {}) {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  ember.replaceData(dataFixture({
    goals: [goalFixture('D3', [['First charts', [['Bar', '2026-09-01'], ['Line', null], ['Scatter', null]]]])],
    selection: LINE,
    ...patch,
  }))
  const ui = useUiStore()
  ui.openFocusMode()
  const w = mount(FocusMode, { attachTo: document.body })
  await flushPromises()
  return { w, ember, ui }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
  players = []
  Player = vi.fn(function () {
    const p = { mute: vi.fn(), unMute: vi.fn(), playVideo: vi.fn(), destroy: vi.fn(), getIframe: vi.fn(() => document.createElement('iframe')) }
    players.push(p)
    return p
  })
  ;(window as unknown as { YT: unknown }).YT = { Player }
})
afterEach(() => {
  vi.useRealTimers()
  delete (window as unknown as { YT?: unknown }).YT
})

const RUNNING = { phase: 'focus' as const, running: true, endsAt: new Date(2026, 8, 23, 10, 25).getTime(), leftSec: 1500, speed: 1, lengthSec: 1500 }
const hidden = (w: Awaited<ReturnType<typeof setup>>['w']) => w.find('.focus-mode').classes('ui-hidden')
const openSettings = async (w: Awaited<ReturnType<typeof setup>>['w']) => {
  await w.find('.fm-settings-btn').trigger('click')
  await flushPromises()
}

describe('FocusMode', () => {
  it('shows the time, the phase, the selection and what comes next', async () => {
    const { w } = await setup()
    expect(w.find('.fm-phase').text()).toBe('Next focus session')
    expect(w.find('.fm-time').text()).toBe('25:00')
    expect(w.find('.fm-item-title').text()).toBe('Line')
    expect(w.find('.fm-item-sub').text()).toBe('Then: Scatter')
    expect(w.find('.fm-start').attributes()).toMatchObject({ 'aria-label': 'Start focus', title: 'Start focus' })
    w.unmount()
  })

  it('shows the context line when there is no next step', async () => {
    const { w } = await setup({ selection: { ...LINE, stepId: 'D3/First charts/Scatter' } })
    expect(w.find('.fm-item-sub').text()).toBe('D3 · 01 First charts · 0m of est. 50m')
    w.unmount()
  })

  it('starts and pauses the shared timer', async () => {
    const { w, ember } = await setup()
    await w.find('.fm-start').trigger('click')
    expect(ember.timer.running).toBe(true)
    expect(w.find('.fm-start').attributes('aria-label')).toBe('Pause')
    expect(w.find('.fm-phase').text()).toBe('Focusing on')
    ember.tick(new Date(2026, 8, 23, 10, 5).getTime())
    await flushPromises()
    expect(w.find('.fm-bar-fill').attributes('style')).toContain('width: 20%')
    w.unmount()
  })

  it('marks the selection done and hands off to the next step', async () => {
    const { w, ember } = await setup()
    await w.find('.fm-done').trigger('click')
    expect(ember.goals[0].milestones[0].steps[1].doneOn).toBe('2026-09-23')
    expect(w.find('.fm-item-title').text()).toBe('Scatter')
    w.unmount()
  })

  it('hides Mark done without a selection or during a break, and offers Skip break', async () => {
    const none = await setup({ selection: null })
    expect(none.w.find('.fm-done').exists()).toBe(false)
    expect(none.w.find('.fm-skip').exists()).toBe(false)
    none.w.unmount()
    const brk = await setup({ timer: { phase: 'break', running: false, endsAt: null, leftSec: 300, speed: 1, lengthSec: 300 } })
    expect(brk.w.find('.fm-done').exists()).toBe(false)
    expect(brk.w.find('.fm-skip').attributes('aria-label')).toBe('Skip break')
    await brk.w.find('.fm-skip').trigger('click')
    expect(brk.ember.timer.phase).toBe('focus')
    brk.w.unmount()
  })

  it('exits, and opens the picker from the selected item', async () => {
    const { w, ui } = await setup()
    await w.find('.fm-item').trigger('click')
    expect(ui.pickerOpen).toBe(true)
    expect(ui.pickerTab).toBe('goals')
    expect(w.find('.fm-exit').attributes()).toMatchObject({ 'aria-label': 'Exit Focus mode', title: 'Exit · Esc' })
    await w.find('.fm-exit').trigger('click')
    expect(ui.focusModeOpen).toBe(false)
    w.unmount()
  })

  it('plays the saved video in full colour with only a bottom gradient', async () => {
    const { w } = await setup()
    expect(w.find('.fm-video').exists()).toBe(true)
    expect(w.find('.fm-video').attributes('aria-hidden')).toBe('true')
    expect(w.find('.fm-scrim').exists()).toBe(false)
    expect(w.find('.fm-gradient').exists()).toBe(true)
    expect(Player).toHaveBeenCalledTimes(1)
    expect(Player.mock.calls[0][1].videoId).toBe('jfKfPfyJRdk')
    w.unmount()
  })

  it('toggles the video settings panel and turns the video off', async () => {
    const { w, ember, ui } = await setup()
    expect(w.find('.fm-settings').exists()).toBe(false)
    expect(w.find('.fm-settings-btn').attributes('aria-expanded')).toBe('false')
    await openSettings(w)
    expect(ui.fmSettingsOpen).toBe(true)
    expect(w.find('.fm-settings-btn').attributes('aria-expanded')).toBe('true')
    expect(w.find('.fm-now').text()).toBe('Now: youtu.be/jfKfPfyJRdk')
    await w.findAll('.fm-bg input')[1].setValue(true)
    expect(ember.settings.focusBg).toBe('off')
    expect(w.find('.fm-video').exists()).toBe(false)
    expect(players[0].destroy).toHaveBeenCalled()
    await openSettings(w)
    expect(w.find('.fm-settings').exists()).toBe(false)
    w.unmount()
  })

  it('toggles sound without reloading the video', async () => {
    const { w, ember } = await setup()
    Player.mock.calls[0][1].events.onReady({ target: players[0] })
    const sound = () => w.find('.fm-sound')
    expect(sound().attributes()).toMatchObject({ 'aria-label': 'Sound', 'aria-pressed': 'false' })
    await sound().trigger('click')
    await flushPromises()
    expect(ember.settings.muted).toBe(false)
    expect(sound().attributes('aria-pressed')).toBe('true')
    expect(players[0].unMute).toHaveBeenCalledTimes(1)
    expect(Player).toHaveBeenCalledTimes(1)
    w.unmount()
  })

  it('plays a pasted link and rejects junk', async () => {
    const { w, ember } = await setup({ settings: { ...dataFixture().settings, focusBg: 'off' } })
    await openSettings(w)
    await w.find('.fm-input').setValue('hello')
    await w.find('.fm-play').trigger('click')
    expect(w.find('.fm-now').text()).toBe("Now: youtu.be/jfKfPfyJRdk · That doesn't look like a YouTube link")
    expect(ember.settings.youtubeUrl).toBe('https://www.youtube.com/watch?v=jfKfPfyJRdk')
    await w.find('.fm-input').setValue('https://youtu.be/dQw4w9WgXcQ')
    expect(w.find('.fm-now').text()).toBe('Now: youtu.be/jfKfPfyJRdk')
    await w.find('.fm-input').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(ember.settings).toMatchObject({ youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ', focusBg: 'video' })
    expect(w.find('.fm-now').text()).toBe('Now: youtu.be/dQw4w9WgXcQ')
    expect((w.find('.fm-input').element as HTMLInputElement).value).toBe('')
    expect(Player.mock.calls.at(-1)?.[1].videoId).toBe('dQw4w9WgXcQ')
    w.unmount()
  })

  it('hides the controls and cursor after 3 seconds still while a session runs', async () => {
    const { w } = await setup({ timer: RUNNING })
    expect(hidden(w)).toBe(false)
    vi.advanceTimersByTime(2900)
    await flushPromises()
    expect(hidden(w)).toBe(false)
    vi.advanceTimersByTime(200)
    await flushPromises()
    expect(hidden(w)).toBe(true)
    w.unmount()
  })

  it.each([['mousemove'], ['click'], ['pointerdown'], ['keydown']])('brings the controls back on %s and restarts the 3 seconds', async (type) => {
    const { w } = await setup({ timer: RUNNING })
    vi.advanceTimersByTime(3000)
    await flushPromises()
    expect(hidden(w)).toBe(true)
    document.dispatchEvent(new Event(type, { bubbles: true }))
    await flushPromises()
    expect(hidden(w)).toBe(false)
    vi.advanceTimersByTime(2900)
    await flushPromises()
    expect(hidden(w)).toBe(false)
    vi.advanceTimersByTime(200)
    await flushPromises()
    expect(hidden(w)).toBe(true)
    w.unmount()
  })

  it('never hides while paused, or while the settings or picker are open', async () => {
    const paused = await setup()
    vi.advanceTimersByTime(5000)
    await flushPromises()
    expect(hidden(paused.w)).toBe(false)
    paused.w.unmount()

    const { w, ui } = await setup({ timer: RUNNING })
    await openSettings(w)
    vi.advanceTimersByTime(5000)
    await flushPromises()
    expect(hidden(w)).toBe(false)
    ui.fmSettingsOpen = false
    ui.openPicker(null)
    await flushPromises()
    expect(hidden(w)).toBe(false)
    ui.closePicker()
    await flushPromises()
    expect(hidden(w)).toBe(true)
    w.unmount()
  })

  it('stops the idle timer and activity listeners on close', async () => {
    const { w } = await setup({ timer: RUNNING })
    const open = vi.getTimerCount()
    w.unmount()
    expect(vi.getTimerCount()).toBe(open - 1)
    document.dispatchEvent(new Event('mousemove'))
    expect(vi.getTimerCount()).toBe(open - 1)
  })

  it('locks page scroll and manages focus', async () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const { w } = await setup()
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.activeElement).toBe(w.find('.fm-start').element)
    w.unmount()
    expect(document.body.style.overflow).toBe('')
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it('moves focus into the settings panel and back to its button on close', async () => {
    const { w, ui } = await setup()
    await openSettings(w)
    expect(document.activeElement).toBe(w.find('.fm-input').element)
    ui.escape()
    await flushPromises()
    expect(w.find('.fm-settings').exists()).toBe(false)
    expect(document.activeElement).toBe(w.find('.fm-settings-btn').element)
    w.unmount()
  })

  it('keeps keyboard focus on Play/Pause when Skip break or Mark done disappears', async () => {
    const brk = await setup({ timer: { phase: 'break', running: false, endsAt: null, leftSec: 300, speed: 1, lengthSec: 300 } })
    ;(brk.w.find('.fm-skip').element as HTMLElement).focus()
    await brk.w.find('.fm-skip').trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(brk.w.find('.fm-start').element)
    brk.w.unmount()

    const last = await setup({ selection: { ...LINE, stepId: 'D3/First charts/Scatter' } })
    last.ember.goals[0].milestones[0].steps[1].doneOn = '2026-09-22'
    await flushPromises()
    ;(last.w.find('.fm-done').element as HTMLElement).focus()
    await last.w.find('.fm-done').trigger('click')
    await flushPromises()
    expect(last.w.find('.fm-done').exists()).toBe(false)
    expect(document.activeElement).toBe(last.w.find('.fm-start').element)
    last.w.unmount()
  })

  it('moves focus to Play/Pause when the session ends on Mark done', async () => {
    const { w, ember } = await setup({ timer: RUNNING })
    ;(w.find('.fm-done').element as HTMLElement).focus()
    ember.tick(new Date(2026, 8, 23, 10, 25).getTime())
    await flushPromises()
    expect(ember.timer.phase).toBe('break')
    expect(document.activeElement).toBe(w.find('.fm-start').element)
    w.unmount()
  })

  it.each([['Enter'], [' ']])('only reveals the controls when %j is pressed on a hidden button', async (key) => {
    const { w } = await setup({ timer: RUNNING })
    const exit = w.find('.fm-exit').element as HTMLElement
    exit.focus()
    vi.advanceTimersByTime(3000)
    await flushPromises()
    expect(hidden(w)).toBe(true)
    const hiddenPress = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    exit.dispatchEvent(hiddenPress)
    expect(hiddenPress.defaultPrevented).toBe(true)
    await flushPromises()
    expect(hidden(w)).toBe(false)
    const visiblePress = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    exit.dispatchEvent(visiblePress)
    expect(visiblePress.defaultPrevented).toBe(false)
    w.unmount()
  })

  it('labels every icon button', async () => {
    const { w } = await setup()
    expect(w.find('.focus-mode').attributes()).toMatchObject({ role: 'dialog', 'aria-label': 'Focus mode' })
    for (const b of w.findAll('button')) expect(b.attributes('aria-label') || b.text()).toBeTruthy()
    w.unmount()
  })
})
