import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Goal } from '../../core/model'
import { dataFixture, goalFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import GoalsView from './GoalsView.vue'

function setup(goals: Goal[], activeGoalId: string | null = null) {
  setActivePinia(createPinia())
  useEmberStore().replaceData(dataFixture({ goals }))
  useUiStore().activeGoalId = activeGoalId
  return mount(GoalsView)
}
const two = () => [goalFixture('D3', [['M', [['A', null]]]]), goalFixture('Spanish', [['M', [['B', null]]]])]

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('GoalsView', () => {
  it('shows the selected goal', () => {
    const w = setup(two(), 'Spanish')
    expect(w.find('.gs-title').text()).toBe('Spanish')
    expect(w.find('.gl-item.is-active').text()).toContain('Spanish')
  })

  it('falls back to the first goal', () => {
    expect(setup(two()).find('.gs-title').text()).toBe('D3')
    expect(setup(two(), 'deleted').find('.gs-title').text()).toBe('D3')
  })

  it('says so when there are no goals', () => {
    const w = setup([])
    expect(w.find('.gv-empty').text()).toBe('No goals yet. Add one on the left.')
    expect(w.find('.gl-input').exists()).toBe(true)
  })
  it('skips deleted goals', () => {
    const goals = two()
    goals[0].deletedOn = '2026-09-23'
    expect(setup(goals, 'D3').find('.gs-title').text()).toBe('Spanish')
    expect(setup(goals).findAll('.gl-item')).toHaveLength(1)
  })
})
