import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUiStore } from './ui'

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => vi.useRealTimers())

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

  it('holds the add-task draft and Today collapse state', () => {
    const ui = useUiStore()
    expect(ui.taskDraft).toEqual({ title: '', when: 'today', date: '', deadline: false, goalId: '' })
    expect(ui.doneOpen).toBe(false)
    expect(ui.openGroups).toEqual({})
    ui.openGroups.later = true
    expect(ui.openGroups.later).toBe(true)
  })

  it('holds Goals-tab state and closes any add input when another goal is selected', () => {
    const ui = useUiStore()
    expect(ui.expanded).toEqual({})
    expect(ui.adding).toBeNull()
    expect(ui.draft).toBe('')
    expect(ui.goalDraft).toBe('')
    expect(ui.goalTasksAll).toEqual({})
    ui.adding = { kind: 'step', msId: 'm' }
    ui.draft = 'half typed'
    ui.selectGoal('Spanish')
    expect(ui.activeGoalId).toBe('Spanish')
    expect(ui.adding).toBeNull()
    expect(ui.draft).toBe('')
  })

  it('holds Activity-tab state', () => {
    const ui = useUiStore()
    expect(ui.heatMode).toBe('focus')
    expect(ui.feedSize).toBe(10)
  })

  it('Esc closes the data menu first', () => {
    const ui = useUiStore()
    ui.openFocusMode()
    ui.dataMenuOpen = true
    expect(ui.escape()).toBe(true)
    expect(ui.dataMenuOpen).toBe(false)
    expect(ui.focusModeOpen).toBe(true)
  })
  it('tracks the open row menu and edit panel, closing them on Esc in order', () => {
    const ui = useUiStore()
    ui.menuFor = 'task:a'
    ui.startEdit('task:b')
    expect(ui.menuFor).toBeNull()
    expect(ui.editing).toBe('task:b')
    ui.menuFor = 'task:c'
    expect(ui.escape()).toBe(true)
    expect(ui.menuFor).toBeNull()
    expect(ui.editing).toBe('task:b')
    expect(ui.escape()).toBe(true)
    expect(ui.editing).toBeNull()
  })

  it('shows the undo bar for 8 seconds', () => {
    vi.useFakeTimers()
    const ui = useUiStore()
    const record = { label: 'Deleted “x”', key: { kind: 'task' as const, id: 'x' }, selection: null }
    ui.showUndo(record)
    expect(ui.undo?.record).toEqual(record)
    vi.advanceTimersByTime(7999)
    expect(ui.undo).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(ui.undo).toBeNull()
    ui.showUndo(null)
    expect(ui.undo).toBeNull()
  })
})
