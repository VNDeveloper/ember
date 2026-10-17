import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EmberData, StepTarget } from '../core/model'
import { dataFixture, goalFixture, resourceFixture } from '../core/test-fixtures'
import { useEmberStore } from '../stores/ember'
import { useUiStore } from '../stores/ui'
import FocusMode from './FocusMode.vue'

const LINE: StepTarget = { kind: 'step', goalId: 'D3', msId: 'D3/First charts', stepId: 'D3/First charts/Line' }
type Fn = ReturnType<typeof vi.fn>
let players: { mute: Fn; unMute: Fn; playVideo: Fn; pauseVideo: Fn; setVolume: Fn; destroy: Fn }[]
let Player: ReturnType<typeof vi.fn>

/** playing: the background video already reports playing (default), so Start runs at once; false = still loading. */
async function setup(patch: Partial<EmberData> = {}, opts: { playing?: boolean } = {}) {
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
  if (opts.playing !== false) Player.mock.calls.at(-1)?.[1].events.onStateChange({ data: 1 })
  await flushPromises()
  return { w, ember, ui }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
  players = []
  Player = vi.fn(function () {
    const p = { mute: vi.fn(), unMute: vi.fn(), playVideo: vi.fn(), pauseVideo: vi.fn(), setVolume: vi.fn(), destroy: vi.fn(), getIframe: vi.fn(() => document.createElement('iframe')) }
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

  it('shows what you are focusing on in large type under the timer, even when the controls hide', async () => {
    const { w } = await setup()
    const task = w.find('.fm-task')
    expect(task.find('.fm-task-title').text()).toBe('Line')
    expect(task.find('.fm-task-sub').text()).toBe('D3 · 01 First charts · 0m of est. 50m')
    expect(task.classes()).not.toContain('fm-chrome')
    expect(w.find('.fm-center .fm-task').exists()).toBe(true)
    w.unmount()
    const none = await setup({ selection: null })
    expect(none.w.find('.fm-task').exists()).toBe(false)
    none.w.unmount()
  })

  it('asks what next in the middle of the screen when the selection is finished early', async () => {
    const { w, ember } = await setup()
    ember.startPause()
    vi.setSystemTime(Date.now() + 10 * 60_000)
    await w.find('.fm-done').trigger('click')
    expect(w.find('.fm-center .done-early').exists()).toBe(true)
    expect(w.find('.fm-center .done-early .de-keep').text()).toBe('Keep going on Scatter')
    w.unmount()
  })

  it('offers Reset once the timer has run, in focus or a break', async () => {
    const fresh = await setup()
    expect(fresh.w.find('.fm-reset').exists()).toBe(false)
    fresh.w.unmount()
    const brk = await setup({ timer: { phase: 'break', running: true, endsAt: Date.now() + 60_000, leftSec: 300, speed: 1, lengthSec: 300 } })
    await brk.w.find('.fm-reset').trigger('click')
    expect(brk.ember.timer).toMatchObject({ phase: 'break', running: false, leftSec: 300 })
    brk.w.unmount()
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
    expect(Player.mock.calls[0][1].videoId).toBe('lTRiuFIWV54')
    w.unmount()
  })

  it('toggles the video settings panel and turns the video off', async () => {
    const { w, ember, ui } = await setup()
    expect(w.find('.fm-settings').exists()).toBe(false)
    expect(w.find('.fm-settings-btn').attributes('aria-expanded')).toBe('false')
    await openSettings(w)
    expect(ui.fmSettingsOpen).toBe(true)
    expect(w.find('.fm-settings-btn').attributes('aria-expanded')).toBe('true')
    expect(w.find('.fm-now').text()).toBe('Now: youtu.be/lTRiuFIWV54')
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

  it('turns sound on with the volume slider and off at zero', async () => {
    const { w, ember } = await setup()
    Player.mock.calls[0][1].events.onReady({ target: players[0] })
    const slider = w.find('.fm-volume')
    expect(slider.attributes('aria-label')).toBe('Volume')
    expect((slider.element as HTMLInputElement).value).toBe('0')
    await slider.setValue('40')
    await flushPromises()
    expect(ember.settings).toMatchObject({ volume: 40, muted: false })
    expect(players[0].setVolume).toHaveBeenLastCalledWith(40)
    expect(players[0].unMute).toHaveBeenCalled()
    await slider.setValue('0')
    expect(ember.settings).toMatchObject({ volume: 0, muted: true })
    await w.find('.fm-sound').trigger('click')
    expect(ember.settings).toMatchObject({ volume: 50, muted: false })
    w.unmount()
  })

  it('pauses and plays the video from its button', async () => {
    const { w, ui } = await setup()
    Player.mock.calls[0][1].events.onReady({ target: players[0] })
    const btn = () => w.find('.fm-video-btn')
    expect(btn().attributes('aria-label')).toBe('Pause video')
    await btn().trigger('click')
    await flushPromises()
    expect(ui.video).toEqual({ paused: true, auto: false })
    expect(players[0].pauseVideo).toHaveBeenCalledTimes(1)
    expect(btn().attributes('aria-label')).toBe('Play video')
    await btn().trigger('click')
    await flushPromises()
    expect(players[0].playVideo).toHaveBeenCalledTimes(2)
    w.unmount()
  })

  it('pauses the video when the focus session ends and plays it when the next one starts', async () => {
    const { w, ember } = await setup({ timer: RUNNING })
    Player.mock.calls[0][1].events.onReady({ target: players[0] })
    ember.tick(new Date(2026, 8, 23, 10, 25).getTime())
    await flushPromises()
    expect(ember.timer.phase).toBe('break')
    expect(players[0].pauseVideo).toHaveBeenCalledTimes(1)
    await w.find('.fm-skip').trigger('click')
    await flushPromises()
    expect(players[0].playVideo).toHaveBeenCalledTimes(1)
    await w.find('.fm-start').trigger('click')
    await flushPromises()
    expect(players[0].playVideo).toHaveBeenCalledTimes(2)
    w.unmount()
  })

  it('has no video controls when the video is off', async () => {
    const { w } = await setup({ settings: { ...dataFixture().settings, focusBg: 'off' } })
    expect(w.find('.fm-video-btn').exists()).toBe(false)
    expect(w.find('.fm-volume').exists()).toBe(false)
    w.unmount()
  })

  it('says when YouTube refuses the video', async () => {
    const { w } = await setup()
    expect(w.find('.fm-video-error').exists()).toBe(false)
    Player.mock.calls[0][1].events.onError({ data: 150 })
    await flushPromises()
    expect(w.find('.fm-video-error').text()).toBe("YouTube won't play this video here. Pick another in Settings.")
    await openSettings(w)
    expect(w.find('.fm-video-error').exists()).toBe(false)
    expect(w.find('.fm-now').text()).toBe("Now: youtu.be/lTRiuFIWV54 · YouTube won't play this one here")
    w.unmount()
  })

  it('changes the timer length and end sounds from the settings panel', async () => {
    const { w, ember } = await setup()
    await openSettings(w)
    await w.find('.ts-focus-more').trigger('click')
    expect(ember.settings.session).toBe('30/5')
    expect(w.find('.fm-time').text()).toBe('30:00')
    await w.find('.ss-focus select').setValue('soft')
    expect(ember.settings.focusEndSound).toBe('soft')
    w.unmount()
  })

  it('plays a pasted link and rejects junk', async () => {
    const { w, ember } = await setup({ settings: { ...dataFixture().settings, focusBg: 'off' } })
    await openSettings(w)
    await w.find('.fm-input').setValue('hello')
    await w.find('.fm-play').trigger('click')
    expect(w.find('.fm-now').text()).toBe("Now: youtu.be/lTRiuFIWV54 · That doesn't look like a YouTube link")
    expect(ember.settings.youtubeUrl).toBe('https://www.youtube.com/watch?v=lTRiuFIWV54')
    await w.find('.fm-input').setValue('https://youtu.be/dQw4w9WgXcQ')
    expect(w.find('.fm-now').text()).toBe('Now: youtu.be/lTRiuFIWV54')
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

  it('hides every control, even while paused, when the mouse leaves the window, keeping the timer', async () => {
    const { w } = await setup()
    await openSettings(w)
    document.documentElement.dispatchEvent(new MouseEvent('mouseleave'))
    await flushPromises()
    expect(hidden(w)).toBe(true)
    expect(w.find('.fm-time').classes()).not.toContain('fm-chrome')
    document.documentElement.dispatchEvent(new MouseEvent('mouseenter'))
    await flushPromises()
    expect(hidden(w)).toBe(false)
    document.documentElement.dispatchEvent(new MouseEvent('mouseleave'))
    await flushPromises()
    document.dispatchEvent(new Event('keydown', { bubbles: true }))
    await flushPromises()
    expect(hidden(w)).toBe(false)
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

  it('moves focus to the panel\'s first control and back to its button on close', async () => {
    const { w, ui } = await setup()
    await openSettings(w)
    expect(document.activeElement).toBe(w.find('.ts-presets input').element)
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

describe('FocusMode — resources', () => {
  it('toggles a panel of the goal’s resources; Esc closes it before Focus mode', async () => {
    const { w, ui } = await setup({ resources: [resourceFixture('InfoVis', { goalId: 'D3', company: 'Coursera', notes: 'Week 3 of 5' })] })
    expect(w.find('#fm-resources').exists()).toBe(false)
    await w.find('.fm-res-btn').trigger('click')
    expect(w.find('.fm-res-btn').attributes('aria-expanded')).toBe('true')
    expect(w.find('.fm-res-head').text()).toBe('D3 · resources')
    expect(w.find('.fm-res-link').attributes()).toMatchObject({ href: 'https://example.com/InfoVis', target: '_blank' })
    expect(w.find('.fm-res-sub').text()).toBe('Coursera · Course · Week 3 of 5')
    expect(ui.escape()).toBe(true)
    await flushPromises()
    expect(w.find('#fm-resources').exists()).toBe(false)
    expect(ui.focusModeOpen).toBe(true)
    w.unmount()
  })

  it('has no resources button when the goal has none', async () => {
    const { w } = await setup()
    expect(w.find('.fm-res-btn').exists()).toBe(false)
    w.unmount()
  })
})

describe('FocusMode — waits for the video', () => {
  const play = () => Player.mock.calls.at(-1)![1].events.onStateChange({ data: 1 })

  it('holds the countdown at Starting… until the video plays', async () => {
    const { w, ember } = await setup({}, { playing: false })
    await w.find('.fm-start').trigger('click')
    expect(ember.timer.running).toBe(false)
    expect(w.find('.fm-phase').text()).toBe('Starting…')
    play()
    await flushPromises()
    expect(ember.timer.running).toBe(true)
    expect(w.find('.fm-phase').text()).toBe('Focusing on')
    w.unmount()
  })

  it('starts anyway after 10 seconds, or at once if the video fails', async () => {
    const slow = await setup({}, { playing: false })
    await slow.w.find('.fm-start').trigger('click')
    await vi.advanceTimersByTimeAsync(9_900)
    expect(slow.ember.timer.running).toBe(false)
    await vi.advanceTimersByTimeAsync(200)
    expect(slow.ember.timer.running).toBe(true)
    slow.w.unmount()
    const broken = await setup({}, { playing: false })
    await broken.w.find('.fm-start').trigger('click')
    Player.mock.calls.at(-1)![1].events.onError({ data: 150 })
    await flushPromises()
    expect(broken.ember.timer.running).toBe(true)
    broken.w.unmount()
  })

  it('pressing Start again while waiting cancels the wait', async () => {
    const { w, ember } = await setup({}, { playing: false })
    await w.find('.fm-start').trigger('click')
    await w.find('.fm-start').trigger('click')
    expect(w.find('.fm-phase').text()).toBe('Next focus session')
    play()
    await flushPromises()
    expect(ember.timer.running).toBe(false)
    w.unmount()
  })

  it('starts at once when the video is already playing, switched off, or paused by you', async () => {
    const on = await setup({}, { playing: false })
    play()
    await on.w.find('.fm-start').trigger('click')
    expect(on.ember.timer.running).toBe(true)
    on.w.unmount()
    const off = await setup({ settings: { ...dataFixture().settings, focusBg: 'off' } }, { playing: false })
    await off.w.find('.fm-start').trigger('click')
    expect(off.ember.timer.running).toBe(true)
    off.w.unmount()
    const paused = await setup({}, { playing: false })
    paused.ui.video = { paused: true, auto: false }
    await paused.w.find('.fm-start').trigger('click')
    expect(paused.ember.timer.running).toBe(true)
    paused.w.unmount()
  })

  it('pauses a running session when Focus mode opens, and carries on once the video plays', async () => {
    const { w, ember } = await setup({ timer: { phase: 'focus', running: true, endsAt: Date.now() + 20 * 60_000, leftSec: 1500, speed: 1, lengthSec: 1500 } }, { playing: false })
    expect(ember.timer.running).toBe(false)
    expect(ember.timer.leftSec).toBe(1200)
    expect(w.find('.fm-phase').text()).toBe('Starting…')
    play()
    await flushPromises()
    expect(ember.timer).toMatchObject({ running: true })
    w.unmount()
  })

  it('plays a video that a finished session paused, so the next session can start', async () => {
    const { w, ui } = await setup({ timer: { phase: 'focus', running: false, endsAt: null, leftSec: 1500, speed: 1, lengthSec: 1500 } }, { playing: false })
    ui.video = { paused: true, auto: true }
    await w.find('.fm-start').trigger('click')
    expect(ui.video.paused).toBe(false)
    w.unmount()
  })
})
