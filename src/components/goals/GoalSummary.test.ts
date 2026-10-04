import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { d3Fixture, dataFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import GoalSummary from './GoalSummary.vue'

function setup() {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  const { goal, logs } = d3Fixture()
  ember.replaceData(dataFixture({ goals: [goal], logs }))
  return { w: mount(GoalSummary, { props: { goal: ember.goals[0] } }), ember }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('GoalSummary', () => {
  it('shows the kicker, title and percentage', () => {
    const { w } = setup()
    expect(w.find('.gs-kicker').text()).toBe('Goal · 2h 5m focused · 1 of 3 milestones')
    expect(w.find('.gs-title').text()).toBe('D3')
    expect(w.find('.gs-pct').text()).toBe('40%')
  })

  it('shows the ledger stats', () => {
    const { w } = setup()
    expect(w.findAll('.gs-stat').map((s) => s.text())).toEqual([
      'Focused2h 5m', 'Estimated4h 10m', 'Left to go1h 40m', 'Accuracy75%',
    ])
    expect(w.findAll('.gs-stat-value')[0].classes()).toContain('is-accent')
  })

  it('edits the outcome', async () => {
    const { w, ember } = setup()
    await w.find('.gs-outcome').setValue('Ship a chart')
    expect(ember.goals[0].outcome).toBe('Ship a chart')
  })
})
