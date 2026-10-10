import { describe, expect, it } from 'vitest'
import { hideFocusUI, videoOnTimer } from './focusMode'

const base = { running: true, idle: true, settingsOpen: false, pickerOpen: false, pointerOut: false }

describe('hideFocusUI', () => {
  it('hides the controls while the timer runs and the user is idle', () => {
    expect(hideFocusUI(base)).toBe(true)
  })

  it.each([
    ['the timer is paused or between sessions', { running: false }],
    ['the user is active', { idle: false }],
    ['the video settings are open', { settingsOpen: true }],
    ['the focus picker is open', { pickerOpen: true }],
  ])('keeps them visible when %s', (_, patch) => {
    expect(hideFocusUI({ ...base, ...patch })).toBe(false)
  })
})

describe('hideFocusUI when the pointer leaves the window', () => {
  it.each([
    ['a session runs', {}],
    ['the timer is paused', { running: false, idle: false }],
    ['the settings are open', { settingsOpen: true, idle: false }],
  ])('hides the controls even while %s', (_, patch) => {
    expect(hideFocusUI({ ...base, ...patch, pointerOut: true })).toBe(true)
  })
})

describe('videoOnTimer', () => {
  const playing = { paused: false, auto: false }
  const focusRun = { phase: 'focus' as const, running: true }
  const breakIdle = { phase: 'break' as const, running: false }
  const breakRun = { phase: 'break' as const, running: true }
  const focusIdle = { phase: 'focus' as const, running: false }

  it('pauses the video when a focus session ends', () => {
    expect(videoOnTimer(focusRun, breakIdle, playing)).toEqual({ paused: true, auto: true })
  })

  it('keeps it paused through the break, and plays it again when the next focus session starts', () => {
    const v = videoOnTimer(focusRun, breakIdle, playing)
    expect(videoOnTimer(breakIdle, breakRun, v)).toEqual(v)
    expect(videoOnTimer(breakRun, focusIdle, v)).toEqual(v)
    expect(videoOnTimer(focusIdle, focusRun, v)).toEqual(playing)
  })

  it('leaves a video the user paused alone', () => {
    const mine = { paused: true, auto: false }
    expect(videoOnTimer(focusRun, breakIdle, mine)).toEqual(mine)
    expect(videoOnTimer(focusIdle, focusRun, mine)).toEqual(mine)
  })

  it('changes nothing on pause, resume or reset within a focus session', () => {
    expect(videoOnTimer(focusRun, focusIdle, playing)).toEqual(playing)
    expect(videoOnTimer(focusIdle, focusRun, playing)).toEqual(playing)
  })
})
