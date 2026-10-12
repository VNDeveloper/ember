import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { Resource, Selection, StepTarget } from '../core/model'
import { dataFixture, goalFixture, resourceFixture, taskFixture } from '../core/test-fixtures'
import { useEmberStore } from '../stores/ember'
import { useUiStore } from '../stores/ui'
import FocusBar from './FocusBar.vue'

const NOW = new Date(2026, 8, 23, 10, 0).getTime()
const LINE: StepTarget = { kind: 'step', goalId: 'D3', msId: 'D3/First charts', stepId: 'D3/First charts/Line' }

function setup(selection: StepTarget | null = LINE) {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  ember.replaceData(dataFixture({
    goals: [goalFixture('D3', [['First charts', [['Bar', '2026-09-01'], ['Line', null]]]])],
    tasks: [taskFixture('Review PR')],
    selection,
  }))
  return { w: mount(FocusBar), ember, ui: useUiStore() }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  localStorage.clear()
  window.history.replaceState({}, '', '/')
})
afterEach(() => vi.useRealTimers())

describe('FocusBar', () => {
  it('shows an idle session for the selected step', () => {
    const { w } = setup()
    expect(w.find('.focus-bar').classes()).toContain('is-idle')
    expect(w.find('.fb-time').text()).toBe('25:00')
    expect(w.find('.fb-phase').text()).toBe('Next focus session')
    expect(w.find('.fb-title').text()).toBe('Line')
    expect(w.find('.fb-sub').text()).toBe('D3 · 01 First charts · 0m of est. 50m')
    expect(w.find('.fb-today').text()).toBe('0 sessions · 0m today')
    expect(w.find('.fb-start').text()).toBe('Start focus')
    expect(w.find('.fb-reset').exists()).toBe(false)
    expect(w.find('.fb-skip').exists()).toBe(false)
    expect(w.find('.fb-demo').exists()).toBe(false)
  })

  it('shows the empty state with nothing selected', () => {
    const { w } = setup(null)
    expect(w.find('.fb-title').text()).toBe('Pick a task or step to focus on')
    expect(w.find('.fb-sub').text()).toBe('Press the timer icon on any row')
  })

  it('runs: ink background, Pause, Reset, progress', async () => {
    const { w, ember } = setup()
    await w.find('.fb-start').trigger('click')
    expect(ember.timer.running).toBe(true)
    expect(w.find('.focus-bar').classes()).toContain('is-focusing')
    expect(w.find('.fb-start').text()).toBe('Pause')
    expect(w.find('.fb-phase').text()).toBe('Focusing on')
    expect(w.find('.fb-reset').exists()).toBe(true)
    ember.tick(NOW + 5 * 60_000)
    await nextTick()
    expect(w.find('.fb-time').text()).toBe('20:00')
    expect(w.find('.fb-progress-fill').attributes('style')).toContain('width: 20%')
  })

  it('finishes a session: break colours, toast, Start break and Skip break', async () => {
    const { w, ember } = setup()
    await w.find('.fb-start').trigger('click')
    ember.tick(NOW + 25 * 60_000)
    await nextTick()
    expect(w.find('.focus-bar').classes()).toContain('is-break')
    expect(w.find('.fb-phase').text()).toBe('Session done — take 5')
    expect(w.find('.fb-start').text()).toBe('Start break')
    expect(w.find('.fb-toast').text()).toBe('+25m · Line')
    expect(w.find('.fb-today').text()).toBe('1 session · 25m today')
    await w.find('.fb-skip').trigger('click')
    expect(ember.timer).toMatchObject({ phase: 'focus', running: false })
  })

  it('resets a running focus session', async () => {
    const { w, ember } = setup()
    await w.find('.fb-start').trigger('click')
    await w.find('.fb-reset').trigger('click')
    expect(ember.timer).toMatchObject({ phase: 'focus', running: false, leftSec: 1500 })
  })

  it('opens the picker from the title and Focus mode from the icon button', async () => {
    const { w, ui } = setup()
    await w.find('.fb-title').trigger('click')
    expect(ui.pickerOpen).toBe(true)
    expect(ui.pickerTab).toBe('goals')
    await w.find('[aria-label="Focus mode"]').trigger('click')
    expect(ui.focusModeOpen).toBe(true)
  })

  it('shows the Demo speed tag with ?demo=1', () => {
    window.history.replaceState({}, '', '/?demo=1')
    const { w } = setup()
    expect(w.find('.fb-demo').text()).toBe('Demo speed')
  })

  it('announces a finished session to screen readers and marks the title as opening a dialog', async () => {
    const { w, ember } = setup()
    expect(w.find('.fb-title').attributes('aria-haspopup')).toBe('dialog')
    expect(w.find('.fb-live').attributes('aria-live')).toBe('polite')
    expect(w.find('.fb-live').text()).toBe('')
    await w.find('.fb-start').trigger('click')
    ember.tick(NOW + 25 * 60_000)
    await nextTick()
    expect(w.find('.fb-live').text()).toBe('Session done: +25m · Line')
  })
})

describe('FocusBar — resources', () => {
  function withResources(resources: Resource[], selection: Selection) {
    setActivePinia(createPinia())
    const ember = useEmberStore()
    ember.replaceData(dataFixture({
      goals: [goalFixture('D3', [['M', [['S', null]]]])],
      tasks: [taskFixture('Loose')],
      resources,
      selection,
    }))
    return { w: mount(FocusBar), ember, ui: useUiStore() }
  }
  const step = { kind: 'step' as const, goalId: 'D3', msId: 'D3/M', stepId: 'D3/M/S' }
  const rs = ['A', 'B', 'C', 'D'].map((t, i) => resourceFixture(t, { goalId: 'D3', createdAt: `2026-09-0${i + 1}` }))

  it("links the selected goal's first three resources, then +N", async () => {
    const { w, ui } = withResources(rs, step)
    expect(w.findAll('.fb-res-link').map((a) => a.text())).toEqual(['A', 'B', 'C'])
    expect(w.find('.fb-res-link').attributes()).toMatchObject({ target: '_blank', rel: 'noopener noreferrer' })
    expect(w.find('.fb-res-count').text()).toBe('4 resources ·')
    await w.find('.fb-res-more').trigger('click')
    expect(ui).toMatchObject({ view: 'resources', resourceGoal: 'D3', resourceStatus: 'using' })
  })

  it('shows nothing without a goal, or when the goal is deleted', async () => {
    expect(withResources(rs, { kind: 'task', taskId: 'Loose' }).w.find('.fb-res').exists()).toBe(false)
    const { w, ember } = withResources(rs, step)
    const rec = ember.deleteGoal('D3')!
    await nextTick()
    expect(w.find('.fb-res').exists()).toBe(false)
    ember.undoDelete(rec)
    await nextTick()
    expect(w.findAll('.fb-res-link')).toHaveLength(3)
  })
})
