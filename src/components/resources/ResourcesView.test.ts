import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Resource } from '../../core/model'
import { dataFixture, resourceFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import ResourcesView from './ResourcesView.vue'

function setup(resources: Resource[]) {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  ember.replaceData(dataFixture({ resources }))
  return { w: mount(ResourcesView), ember }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('ResourcesView', () => {
  it('shows the empty state with no resources', () => {
    const { w } = setup([])
    expect(w.find('.kicker').text()).toBe('Library')
    expect(w.find('.rv-pitch').text()).toContain('Keep the courses, videos, docs and models you learn from in one place')
    expect(w.findAll('.rv-how li')).toHaveLength(3)
    expect(w.find('.rv-money').exists()).toBe(false)
  })

  it('shows the kicker and the money line, red only for a renewal within a week', () => {
    const { w } = setup([
      resourceFixture('Coursera Plus', { company: 'Coursera', billing: 'month', price: 49, renewsOn: '2026-10-15' }),
      resourceFixture('InfoVis', { company: 'Coursera' }),
    ])
    expect(w.find('.kicker').text()).toBe('Library · 2 resources from 1 company')
    expect(w.find('.rv-money').text()).toBe('£49 a month on 1 subscription · Coursera Plus renews in 3 days')
    expect(w.find('.rv-renewal').classes()).toContain('text-accent')
    expect(w.find('.rv-pitch').exists()).toBe(false)
  })
})
