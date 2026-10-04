import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../core/model'
import { dataFixture, goalFixture, logFixture, stepRef, taskFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import HeatMap from './HeatMap.vue'

const TODAY = '2026-09-23'

function setup(showFuture = true) {
  setActivePinia(createPinia())
  useEmberStore().replaceData(dataFixture({
    goals: [goalFixture('D3', [['M', [['A', '2026-09-22']]]])],
    tasks: [taskFixture('t1', { doneOn: TODAY })],
    logs: [logFixture(TODAY, stepRef('D3', 'M', 'A'), 50), logFixture('2026-09-22', null, 100)],
    settings: { ...DEFAULT_SETTINGS, showFuture },
  }))
  return mount(HeatMap)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('HeatMap', () => {
  it('shows focus time by default', () => {
    const w = setup()
    expect(w.find('.hm-kicker').text()).toBe('Focus time · all goals and tasks')
    expect(w.find('.hm-title').text()).toBe('3 hours focused in 2026')
    expect(w.find('.hm-legend').text()).toBe('LessMore focus time')
    expect(w.findAll('.hm-stat').map((s) => s.text())).toEqual(['September2h 30m', 'Best day1h 40m', 'Focus streak2d', 'Daily average0m'])
  })

  it('draws every day of the year with day and month labels', () => {
    const w = setup()
    expect(w.findAll('.hm-cell')).toHaveLength(4 + 365)
    expect(w.findAll('.hm-day').map((d) => d.text())).toEqual(['Mon', 'Wed', 'Fri'])
    expect(w.findAll('.hm-months span')).toHaveLength(12)
    expect(w.find('.hm-months span').attributes('style')).toContain('grid-column: 2 / span 4')
    const today = w.find('.hm-cell.is-today')
    expect(today.attributes('title')).toBe('Sep 23: 50m')
    expect(today.attributes('style')).toContain('var(--color-accent-200)')
  })

  it('outlines future days only when the setting is on', () => {
    expect(setup(true).findAll('.hm-cell.is-future')).toHaveLength(365 - 266)
    expect(setup(false).findAll('.hm-cell.is-future')).toHaveLength(0)
  })

  it('switches to things done', async () => {
    const w = setup()
    await w.findAll('.seg-opt input')[1].setValue(true)
    expect(w.find('.hm-kicker').text()).toBe('Things done · tasks and goal steps')
    expect(w.find('.hm-title').text()).toBe('2 things done in 2026')
    expect(w.find('.hm-legend').text()).toBe('LessMore done')
    expect(w.findAll('.hm-stat').map((s) => s.text())).toEqual(['September2', 'Best day1', 'Streak2d', 'Active days2'])
  })

  it('pops the today cell on a finished session (focus) or a completion (done)', async () => {
    const w = setup()
    const ember = useEmberStore()
    const today = () => w.find('.hm-cell.is-today')
    ember.startPause()
    ember.tick(new Date(2026, 8, 23, 10, 25).getTime())
    await nextTick()
    expect(today().classes()).toContain('anim-pop1')
    await w.findAll('.seg-opt input')[1].setValue(true)
    expect(today().classes().some((c) => c.startsWith('anim-pop'))).toBe(false)
    ember.addTask({ title: 'x', when: 'today', deadline: false, goalId: null })
    ember.toggleTask(ember.tasks.at(-1)!.id)
    await nextTick()
    expect(today().classes()).toContain('anim-pop1')
  })
})
