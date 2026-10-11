import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Goal, StepTarget } from '../../core/model'
import { dataFixture, goalFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import WorkingOn from './WorkingOn.vue'

const LINE: StepTarget = { kind: 'step', goalId: 'D3', msId: 'D3/First charts', stepId: 'D3/First charts/Line' }
const GOALS = () => [
  goalFixture('D3', [['First charts', [['Bar', '2026-09-01'], ['Line', null]]], ['Motion', [['Easing', null]]]]),
  goalFixture('Spanish', [['Talk', [['Tutor', null]]]]),
]

function setup(goals: Goal[] = GOALS()) {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  ember.replaceData(dataFixture({ goals }))
  return { w: mount(WorkingOn), ember, ui: useUiStore() }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('WorkingOn', () => {
  it('shows one card per goal with its milestone, progress and next step', () => {
    const { w } = setup()
    const cards = w.findAll('.wo-card')
    expect(cards).toHaveLength(2)
    expect(cards[0].find('.wo-goal-title').text()).toBe('D3')
    expect(cards[0].find('.wo-pct').text()).toBe('33%')
    expect(cards[0].text()).toContain('Milestone 01 of 02')
    expect(cards[0].find('.wo-ms-title').text()).toBe('First charts')
    expect(cards[0].findAll('.wo-segs span').map((s) => s.classes().includes('is-done'))).toEqual([true, false])
    expect(cards[0].find('.wo-next-title').text()).toBe('Line')
  })

  it('selects the step from the timer button or the card itself', async () => {
    const { w, ember } = setup()
    await w.findAll('.wo-focus')[0].trigger('click')
    expect(ember.selection).toEqual(LINE)
    expect(w.findAll('.wo-card')[0].classes()).toContain('is-selected')
    await w.findAll('.wo-card')[1].trigger('click')
    expect(ember.selection).toMatchObject({ kind: 'step', goalId: 'Spanish' })
  })

  it('opens the goal from its name without selecting', async () => {
    const { w, ember, ui } = setup()
    await w.findAll('.wo-goal')[1].trigger('click')
    expect(ui.view).toBe('goals')
    expect(ui.activeGoalId).toBe('Spanish')
    expect(ember.selection).toBeNull()
  })

  it('links to all goals', async () => {
    const { w, ui } = setup()
    await w.find('.wo-all').trigger('click')
    expect(ui.view).toBe('goals')
  })

  it('says so when no goal has an open step', () => {
    const { w } = setup([goalFixture('Done', [['M', [['A', '2026-09-01']]]])])
    expect(w.find('.wo-card').exists()).toBe(false)
    expect(w.find('.wo-empty').text()).toBe('No goal has an open step. Add steps on the Goals tab.')
  })

  it('says there are no goals yet when there are none', () => {
    const { w } = setup([])
    expect(w.find('.wo-empty').text()).toBe('No goals yet. Add one on the Goals tab.')
  })

  it('says when every goal is paused or achieved', () => {
    const { w } = setup([{ ...goalFixture('D3', [['M', [['A', null]]]]), status: 'paused' }])
    expect(w.findAll('.wo-card')).toHaveLength(0)
    expect(w.find('.wo-empty').text()).toBe('No active goals. Resume one on the Goals tab.')
  })
})
