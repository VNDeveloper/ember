import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../../core/model'
import { dataFixture, goalFixture, taskFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import GoalTasks from './GoalTasks.vue'

function setup(tasks: Task[]) {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  ember.replaceData(dataFixture({ goals: [goalFixture('D3', [])], tasks }))
  return mount(GoalTasks, { props: { goal: ember.goals[0] } })
}
const seven = () => Array.from({ length: 7 }, (_, i) => taskFixture(`T${i + 1}`, { goalId: 'D3', date: `2026-09-2${i + 3}` }))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('GoalTasks', () => {
  it('renders nothing when the goal has no tasks', () => {
    expect(setup([taskFixture('Other')]).find('.goal-tasks').exists()).toBe(false)
  })

  it('shows the first five, then all, then fewer', async () => {
    const w = setup(seven())
    expect(w.text()).toContain('Tasks for this goal')
    expect(w.findAll('.task-row')).toHaveLength(5)
    expect(w.find('.gt-more').text()).toBe('Show all 7')
    await w.find('.gt-more').trigger('click')
    expect(w.findAll('.task-row')).toHaveLength(7)
    expect(w.find('.gt-more').text()).toBe('Show fewer')
  })

  it('shows dates on the rows', () => {
    const w = setup([taskFixture('Read', { goalId: 'D3', date: null })])
    expect(w.find('.tr-note').text()).toBe('Someday')
    expect(w.find('.gt-more').exists()).toBe(false)
  })
})
