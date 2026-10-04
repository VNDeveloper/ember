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
    const p = { mute: vi.fn(), unMute: vi.fn(), playVideo: vi.fn(), destroy: vi.fn() }
    players.push(p)
    return p
  })
  ;(window as unknown as { YT: unknown }).YT = { Player }
})
afterEach(() => {
  vi.useRealTimers()
  delete (window as unknown as { YT?: unknown }).YT
})

describe('FocusMode', () => {
  it('shows the timer, the selection and what comes next', async () => {
    const { w } = await setup()
    expect(w.find('.fm-phase').text()).toBe('Next focus session')
    expect(w.find('.fm-time').text()).toBe('25:00')
    expect(w.find('.fm-title').text()).toBe('Line')
    expect(w.find('.fm-sub').text()).toBe('D3 · 01 First charts · 0m of est. 50m')
    expect(w.find('.fm-then').text()).toBe('Then: Scatter')
    expect(w.find('.fm-start').text()).toBe('Start focus')
    w.unmount()
  })

  it('starts and pauses the shared timer', async () => {
    const { w, ember } = await setup()
    await w.find('.fm-start').trigger('click')
    expect(ember.timer.running).toBe(true)
    expect(w.find('.fm-start').text()).toBe('Pause')
    expect(w.find('.fm-phase').text()).toBe('Focusing on')
    ember.tick(new Date(2026, 8, 23, 10, 5).getTime())
    await flushPromises()
    expect(w.find('.fm-progress-fill').attributes('style')).toContain('width: 20%')
    w.unmount()
  })

  it('marks the selection done and hands off to the next step', async () => {
    const { w, ember } = await setup()
    await w.find('.fm-done').trigger('click')
    expect(ember.goals[0].milestones[0].steps[1].doneOn).toBe('2026-09-23')
    expect(w.find('.fm-title').text()).toBe('Scatter')
    expect(w.find('.fm-then').exists()).toBe(false)
    w.unmount()
  })

  it('hides Mark done without a selection or during a break, and offers Skip break', async () => {
    const none = await setup({ selection: null })
    expect(none.w.find('.fm-done').exists()).toBe(false)
    none.w.unmount()
    const brk = await setup({ timer: { phase: 'break', running: false, endsAt: null, leftSec: 300, speed: 1, lengthSec: 300 } })
    expect(brk.w.find('.fm-done').exists()).toBe(false)
    await brk.w.find('.fm-skip').trigger('click')
    expect(brk.ember.timer.phase).toBe('focus')
    brk.w.unmount()
  })

  it('exits, and opens the picker from the title', async () => {
    const { w, ui } = await setup()
    await w.find('.fm-title').trigger('click')
    expect(ui.pickerOpen).toBe(true)
    expect(ui.pickerTab).toBe('goals')
    await w.find('.fm-exit').trigger('click')
    expect(ui.focusModeOpen).toBe(false)
    w.unmount()
  })

  it('plays the saved video, and turns the video off', async () => {
    const { w, ember } = await setup()
    expect(w.find('.fm-video').exists()).toBe(true)
    expect(Player).toHaveBeenCalledTimes(1)
    expect(Player.mock.calls[0][1].videoId).toBe('jfKfPfyJRdk')
    expect(w.find('.fm-now').text()).toBe('Now: youtu.be/jfKfPfyJRdk')
    await w.findAll('.fm-bg input')[1].setValue(true)
    expect(ember.settings.focusBg).toBe('off')
    expect(w.find('.fm-video').exists()).toBe(false)
    expect(players[0].destroy).toHaveBeenCalled()
    w.unmount()
  })

  it('toggles sound without reloading the video', async () => {
    const { w, ember } = await setup()
    expect(w.find('.fm-sound').text()).toBe('Sound off')
    await w.find('.fm-sound').trigger('click')
    await flushPromises()
    expect(ember.settings.muted).toBe(false)
    expect(w.find('.fm-sound').text()).toBe('Sound on')
    expect(players[0].unMute).toHaveBeenCalledTimes(1)
    expect(Player).toHaveBeenCalledTimes(1)
    w.unmount()
  })

  it('plays a pasted link and rejects junk', async () => {
    const { w, ember } = await setup({ settings: { ...dataFixture().settings, focusBg: 'off' } })
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
})
