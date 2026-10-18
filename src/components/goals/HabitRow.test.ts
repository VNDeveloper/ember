import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Goal } from '../../core/model'
import { dataFixture, goalFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import HabitRow from './HabitRow.vue'

function setup(goal: Goal) {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  ember.replaceData(dataFixture({ goals: [goal] }))
  return { w: mount(HabitRow, { props: { goal: ember.goals[0] }, attachTo: document.body }), ember, ui: useUiStore() }
}
const G = () => goalFixture('D3', [['M', [['S', null]]]])
const withHabit = (): Goal => ({ ...G(), habit: { targets: [{ minutes: 25, daysPerWeek: 3, from: '2026-08-31' }], pauses: [] } })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
})
afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('HabitRow', () => {
  it('offers to add a habit, pre-filled with 25 minutes on 5 days', async () => {
    const { w, ember } = setup(G())
    expect(w.find('.hr-line').exists()).toBe(false)
    await w.find('.hr-add').trigger('click')
    expect((w.find('.hr-minutes').element as HTMLInputElement).value).toBe('25')
    expect((w.find('.hr-days input:checked').element as HTMLInputElement).value).toBe('5')
    await w.find('.hr-save').trigger('click')
    expect(ember.goals[0].habit!.targets).toEqual([{ minutes: 25, daysPerWeek: 5, from: '2026-09-21' }])
    expect(w.find('.hr-panel').exists()).toBe(false)
  })

  it('shows the target, the line, the last weeks and the best streak', () => {
    const { w } = setup(withHabit())
    expect(w.find('.hr-kicker').text()).toBe('Habit · 25m on 3 days a week')
    expect(w.find('.hr-line .habit-line').exists()).toBe(true)
    expect(w.findAll('.hr-week')).toHaveLength(4)
    expect(w.findAll('.hr-week').at(-1)!.classes()).toContain('is-current')
    expect(w.find('.hr-best').text()).toBe('Best: –')
  })

  it('edits the target', async () => {
    const { w, ember } = setup(withHabit())
    await w.find('.hr-edit').trigger('click')
    await w.find('.hr-minutes').setValue('50')
    await w.find('.hr-days input[value="7"]').setValue()
    await w.find('.hr-save').trigger('click')
    expect(ember.goals[0].habit!.targets.at(-1)).toEqual({ minutes: 50, daysPerWeek: 7, from: '2026-09-21' })
  })

  it('removes the habit with the undo bar', async () => {
    const { w, ember, ui } = setup(withHabit())
    await w.find('.hr-edit').trigger('click')
    await w.find('.hr-remove').trigger('click')
    expect(ember.goals[0].habit!.deletedOn).toBe('2026-09-23')
    expect(ui.undo?.record.label).toBe('Removed the habit on “D3”')
    expect(w.find('.hr-add').exists()).toBe(true)
  })

  it('shows only the best streak on an achieved goal', () => {
    const { w } = setup({ ...withHabit(), status: 'achieved', achievedOn: '2026-09-20' })
    expect(w.find('.hr-kicker').text()).toBe('Habit · best streak –')
    expect(w.find('.hr-edit').exists()).toBe(false)
    expect(w.find('.hr-line').exists()).toBe(false)
  })
})
