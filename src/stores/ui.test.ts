import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useUiStore } from './ui'

beforeEach(() => setActivePinia(createPinia()))

describe('ui store', () => {
  it('starts on Today with nothing open', () => {
    const ui = useUiStore()
    expect(ui.view).toBe('today')
    expect(ui.pickerOpen).toBe(false)
    expect(ui.focusModeOpen).toBe(false)
  })

  it('opens the picker on Goals for a step selection, otherwise on Tasks, with an empty query', () => {
    const ui = useUiStore()
    ui.pickerQuery = 'old'
    ui.openPicker({ kind: 'step', goalId: 'g', msId: 'm', stepId: 's' })
    expect(ui).toMatchObject({ pickerOpen: true, pickerTab: 'goals', pickerQuery: '' })
    ui.closePicker()
    ui.openPicker({ kind: 'task', taskId: 't' })
    expect(ui.pickerTab).toBe('tasks')
    ui.closePicker()
    ui.openPicker(null)
    expect(ui.pickerTab).toBe('tasks')
  })

  it('Esc closes the picker before Focus mode', () => {
    const ui = useUiStore()
    ui.openFocusMode()
    ui.openPicker(null)
    expect(ui.escape()).toBe(true)
    expect(ui.pickerOpen).toBe(false)
    expect(ui.focusModeOpen).toBe(true)
    expect(ui.escape()).toBe(true)
    expect(ui.focusModeOpen).toBe(false)
    expect(ui.escape()).toBe(false)
  })

  it('opens a goal on the Goals tab', () => {
    const ui = useUiStore()
    ui.openGoal('D3')
    expect(ui.view).toBe('goals')
    expect(ui.activeGoalId).toBe('D3')
  })
})
