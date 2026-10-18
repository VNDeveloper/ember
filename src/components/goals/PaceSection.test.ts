import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Goal } from '../../core/model'
import { dataFixture, goalFixture, logFixture, stepRef } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import PaceSection from './PaceSection.vue'

const goal = (patch: Partial<Goal> = {}): Goal => ({ ...goalFixture('G', [['M', [['A', null], ['B', null]]]]), ...patch })
function setup(g: Goal, logs = [logFixture('2026-10-12', stepRef('G', 'M', 'A'), 50)]) {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  ember.replaceData(dataFixture({ goals: [g], logs }))
  return { w: mount(PaceSection, { props: { goal: ember.goals[0] }, attachTo: document.body }), ember }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 14, 10, 0))
  localStorage.clear()
})
afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('PaceSection', () => {
  it('forecasts at your pace and shows what is left', () => {
    const { w } = setup(goal())
    expect(w.find('.ps-at').text()).toBe('~Nov 11')
    expect(w.find('.ps-pace').text()).toBe('13m a week · last 4 weeks')
    expect(w.find('.ps-left').text()).toBe('~50m')
    expect(w.find('.ps-habit').exists()).toBe(false)
  })

  it('sets a finish-by date and shows the verdict and what you need', async () => {
    const { w, ember } = setup(goal())
    await w.find('.ps-set').trigger('click')
    await w.find('.ps-date').setValue('2026-11-05')
    await w.find('.ps-save').trigger('click')
    expect(ember.goals[0].finishBy).toBe('2026-11-05')
    expect(w.find('.ps-verdict').text()).toBe('behind')
    expect(w.find('.ps-verdict').classes()).toContain('is-bad')
    expect(w.find('.ps-need').text()).toBe('To make it: 16m a week')
  })

  it('clears the date', async () => {
    const { w, ember } = setup(goal({ finishBy: '2026-11-30' }))
    await w.find('.ps-change').trigger('click')
    await w.find('.ps-clear').trigger('click')
    expect(ember.goals[0]).not.toHaveProperty('finishBy')
  })

  it('says paused, and renders nothing for an achieved goal', () => {
    expect(setup(goal({ status: 'paused' })).w.find('.ps-paused').text()).toBe('Paused — no forecast')
    expect(setup(goal({ status: 'achieved', achievedOn: '2026-10-01' })).w.find('.pace-section').exists()).toBe(false)
  })
})
