import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../core/model'
import { dataFixture, goalFixture, taskFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import DoneWall from './DoneWall.vue'

const TODAY = '2026-09-23'

function setup(wallWeeks = 4) {
  setActivePinia(createPinia())
  useEmberStore().replaceData(dataFixture({
    goals: [goalFixture('D3', [['M', [['A', '2026-09-22'], ['B', '2026-09-10']]]])],
    tasks: [taskFixture('t1', { doneOn: TODAY }), taskFixture('t2', { goalId: 'D3', tag: '', doneOn: '2026-09-21' })],
    settings: { ...DEFAULT_SETTINGS, wallWeeks },
  }))
  return mount(DoneWall)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('DoneWall', () => {
  it('shows the kicker, headline and legend', () => {
    const w = setup()
    expect(w.find('.dw-kicker').text()).toBe('Done wall · last 4 weeks')
    expect(w.find('.dw-title').text()).toBe('4 things finished')
    expect(w.findAll('.dw-legend span').map((s) => s.text())).toEqual(['D3', 'Tasks'])
  })

  it('draws one column per week with bricks stacked oldest first', () => {
    const w = setup()
    const cols = w.findAll('.dw-col')
    expect(cols).toHaveLength(4)
    expect(cols[3].classes()).toContain('is-current')
    expect(cols.map((c) => c.findAll('.dw-brick').length)).toEqual([0, 1, 0, 3])
    const [t2, a, t1] = cols[3].findAll('.dw-brick')
    expect(t2.classes()).toContain('is-task')
    expect(t2.attributes('style')).toContain('inset 0 0 0 2px var(--color-accent)')
    expect(a.classes()).toContain('is-step')
    expect(a.attributes('style')).toContain('background: var(--color-accent)')
    expect(a.attributes('title')).toBe('D3: A')
    expect(t1.attributes('style')).toContain('var(--color-text)')
    expect(w.find('.dw-chart').attributes('style')).toContain('height: 147px')
    expect(w.findAll('.dw-labels span').map((l) => l.text())).toEqual(['Aug 31', 'Sep 7', 'Sep 14', 'Sep 21'])
  })

  it('shows the weekly stats', () => {
    const w = setup()
    expect(w.findAll('.dw-stat').map((s) => s.text())).toEqual(['This week3', 'Best week3', 'Weeks in a row1', 'Milestones done1'])
    expect(w.findAll('.dw-stat-value')[0].classes()).toContain('is-accent')
  })

  it('follows the wall-weeks setting', () => {
    expect(setup(12).findAll('.dw-col')).toHaveLength(12)
  })
})
