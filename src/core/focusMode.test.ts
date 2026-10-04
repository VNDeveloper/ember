import { describe, expect, it } from 'vitest'
import { hideFocusUI } from './focusMode'

const base = { running: true, idle: true, settingsOpen: false, pickerOpen: false }

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
