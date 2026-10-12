import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Resource } from '../../core/model'
import { dataFixture, goalFixture, resourceFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import GoalResources from './GoalResources.vue'

function setup(resources: Resource[]) {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  ember.replaceData(dataFixture({ goals: [goalFixture('D3', [])], resources }))
  return { w: mount(GoalResources, { props: { goal: ember.goals[0] } }), ember, ui: useUiStore() }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('GoalResources', () => {
  const rs = [
    resourceFixture('InfoVis', { goalId: 'D3', company: 'Coursera', createdAt: '2026-09-01' }),
    resourceFixture('Gallery', { goalId: 'D3', company: 'Observable', createdAt: '2026-09-02' }),
    resourceFixture('Masterclass', { goalId: 'D3', status: 'dropped' }),
    resourceFixture('Other', { goalId: null }),
  ]

  it("lists the goal's in-use resources as links, with All N for every live one", () => {
    const { w } = setup(rs)
    expect(w.findAll('.gr-link').map((a) => a.text())).toEqual(['InfoVis', 'Gallery'])
    expect(w.findAll('.gr-co').map((s) => s.text())).toEqual(['Coursera', 'Observable'])
    expect(w.find('.gr-link').attributes('target')).toBe('_blank')
    expect(w.find('.gr-all').text()).toBe('All 3')
  })

  it('All N opens the Resources tab filtered to the goal', async () => {
    const { w, ui } = setup(rs)
    await w.find('.gr-all').trigger('click')
    expect(ui).toMatchObject({ view: 'resources', resourceGoal: 'D3', resourceStatus: 'all' })
  })

  it('+ opens an inline add box that links to this goal', async () => {
    const { w, ember } = setup([])
    expect(w.find('.gr-none').text()).toBe('No resources yet')
    expect(w.find('.gr-all').exists()).toBe(false)
    await w.find('.gr-add').trigger('click')
    await w.find('.ra-input').setValue('example.com/new')
    await w.find('.ra-form').trigger('submit')
    expect(ember.resources[0].goalId).toBe('D3')
  })
})
