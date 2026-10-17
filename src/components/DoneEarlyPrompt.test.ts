import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StepTarget } from '../core/model'
import { dataFixture, goalFixture } from '../core/test-fixtures'
import { useEmberStore } from '../stores/ember'
import { useUiStore } from '../stores/ui'
import DoneEarlyPrompt from './DoneEarlyPrompt.vue'

const NOW = new Date(2026, 8, 23, 10, 0).getTime()
const LINE: StepTarget = { kind: 'step', goalId: 'D3', msId: 'D3/M', stepId: 'D3/M/Line' }

function setup() {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  ember.replaceData(dataFixture({ goals: [goalFixture('D3', [['M', [['Line', null], ['Scatter', null]]]])], selection: LINE }))
  ember.startPause()
  vi.setSystemTime(NOW + 10 * 60_000)
  ember.toggleStep(LINE)
  return { w: mount(DoneEarlyPrompt), ember, ui: useUiStore() }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('DoneEarlyPrompt', () => {
  it('says what was finished and offers the next step, something else, or a break', () => {
    const { w } = setup()
    expect(w.find('.de-text').text()).toBe('Line done, with time to spare. What next?')
    expect(w.findAll('.de-actions button').map((b) => b.text())).toEqual(['Keep going on Scatter', 'Pick something else', 'Take a break now'])
  })

  it('Keep going closes the question and leaves the timer running', async () => {
    const { w, ember } = setup()
    await w.find('.de-keep').trigger('click')
    expect(ember.doneEarly).toBeNull()
    expect(ember.timer.running).toBe(true)
    expect(w.find('.done-early').exists()).toBe(false)
  })

  it('Pick something else opens the picker', async () => {
    const { w, ember, ui } = setup()
    await w.find('.de-pick').trigger('click')
    expect(ui.pickerOpen).toBe(true)
    expect(ember.doneEarly).toBeNull()
  })

  it('Take a break now starts the break', async () => {
    const { w, ember } = setup()
    await w.find('.de-break').trigger('click')
    expect(ember.timer).toMatchObject({ phase: 'break', running: true })
  })

  it('has no Keep going without a next step, and can be dismissed', async () => {
    const { w, ember } = setup()
    ember.doneEarly = { title: 'Review PR', next: null, nextTitle: '' }
    await w.vm.$nextTick()
    expect(w.find('.de-keep').exists()).toBe(false)
    await w.find('.de-dismiss').trigger('click')
    expect(ember.doneEarly).toBeNull()
  })
})
