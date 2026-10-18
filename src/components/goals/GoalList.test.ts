import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { d3Fixture, dataFixture, goalFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import GoalList from './GoalList.vue'

function setup() {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  const { goal, logs } = d3Fixture()
  ember.replaceData(dataFixture({ goals: [goal, goalFixture('Spanish', [['All', [['A', '2026-09-01']]]])], logs }))
  return { w: mount(GoalList, { props: { activeId: 'D3' } }), ember, ui: useUiStore() }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('GoalList', () => {
  it('lists goals with progress and focused time, marking the open one', () => {
    const { w } = setup()
    const items = w.findAll('.gl-item')
    expect(items.map((i) => i.find('.gl-name').text())).toEqual(['D3', 'Spanish'])
    expect(items[0].find('.gl-pct').text()).toBe('40%')
    expect(items[0].find('.gl-meta').text()).toBe('2h 5m focused · 2/5 steps')
    expect(items[0].find('.gl-bar span').attributes('style')).toContain('width: 40%')
    expect(items[0].classes()).toContain('is-active')
    expect(items[1].find('.gl-bar span').classes()).toContain('is-complete')
  })

  it('selects a goal', async () => {
    const { w, ui } = setup()
    await w.findAll('.gl-item')[1].trigger('click')
    expect(ui.activeGoalId).toBe('Spanish')
  })

  it('adds a goal and opens its first add-step input', async () => {
    const { w, ember, ui } = setup()
    await w.find('.gl-input').setValue('Learn Three.js')
    await w.find('.gl-input').trigger('keydown', { key: 'Enter' })
    const added = ember.goals[2]
    expect(added).toMatchObject({ title: 'Learn Three.js' })
    expect(ui.activeGoalId).toBe(added.id)
    expect(ui.adding).toEqual({ kind: 'step', msId: added.milestones[0].id })
    expect(ui.goalDraft).toBe('')
  })

  it('ignores an empty goal name', async () => {
    const { w, ember } = setup()
    await w.find('.gl-add').trigger('click')
    expect(ember.goals).toHaveLength(2)
  })

  describe('paused and achieved groups', () => {
    function grouped(activeId: string | null = 'D3') {
      setActivePinia(createPinia())
      const ember = useEmberStore()
      ember.replaceData(dataFixture({ goals: [
        goalFixture('D3', []),
        { ...goalFixture('Art', []), status: 'paused' },
        { ...goalFixture('Run', []), status: 'achieved', achievedOn: '2026-09-20' },
      ] }))
      return { w: mount(GoalList, { props: { activeId } }), ui: useUiStore() }
    }
    const names = (w: ReturnType<typeof mount>) => w.findAll('.gl-item .gl-name').map((n) => n.text())

    it('lists paused goals under their own heading', () => {
      const { w } = grouped()
      expect(w.find('.gl-group[data-status="paused"] .gl-head').text()).toBe('Paused')
      expect(w.find('.gl-group[data-status="paused"] .gl-meta').text()).toBe('Paused · 0m focused')
      expect(w.find('.gl-group[data-status="active"] .gl-head').exists()).toBe(false)
    })

    it('keeps achieved goals collapsed behind a count, and toggles them', async () => {
      const { w, ui } = grouped()
      const toggle = w.find('.gl-group[data-status="achieved"] .gl-toggle')
      expect(toggle.text()).toBe('Achieved · 1')
      expect(toggle.attributes('aria-expanded')).toBe('false')
      expect(names(w)).toEqual(['D3', 'Art'])
      await toggle.trigger('click')
      expect(toggle.attributes('aria-expanded')).toBe('true')
      expect(names(w)).toEqual(['D3', 'Art', 'Run'])
      expect(ui.openGroups['goals:achieved']).toBe(true)
    })

    it('opens the achieved group when it holds the open goal, unless closed on purpose', async () => {
      const { w, ui } = grouped('Run')
      expect(names(w)).toEqual(['D3', 'Art', 'Run'])
      await w.find('.gl-toggle').trigger('click')
      expect(ui.openGroups['goals:achieved']).toBe(false)
      expect(names(w)).toEqual(['D3', 'Art'])
    })
  })

  it('notes goals that are behind their finish-by date', async () => {
    const { w, ember } = setup()
    expect(w.find('.gl-behind').exists()).toBe(false)
    ember.setFinishBy('D3', '2026-09-01')
    await w.vm.$nextTick()
    expect(w.find('.gl-behind').text()).toBe('· behind')
  })
})

