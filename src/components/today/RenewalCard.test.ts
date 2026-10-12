import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dueRenewals } from '../../core/resources'
import { dataFixture, resourceFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import RenewalCard from './RenewalCard.vue'

const plus = resourceFixture('Coursera Plus', { company: 'Coursera', type: 'membership', billing: 'month', price: 49, renewsOn: '2026-10-15' })
const covered = ['InfoVis', 'Python', 'SQL'].map((t) => resourceFixture(t, { company: 'Coursera' }))

function setup(today: Date, resources = [plus, ...covered]) {
  vi.setSystemTime(today)
  setActivePinia(createPinia())
  const ember = useEmberStore()
  ember.replaceData(dataFixture({ resources }))
  const due = dueRenewals(ember.resources, ember.today)[0]
  return { w: mount(RenewalCard, { props: { due } }), ember }
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('RenewalCard', () => {
  it('names the day, the amount in red, and what the membership covers', () => {
    const { w } = setup(new Date(2026, 9, 12, 10))
    expect(w.find('.rc-title').text()).toBe('Coursera Plus renews Thursday')
    expect(w.find('.rc-amount').text()).toBe('£49 in 3 days')
    expect(w.find('.rc-amount').classes()).toContain('text-accent')
    expect(w.find('.rc-sub').text()).toBe('£49 in 3 days · Covers InfoVis, Python +1')
    expect(w.find('.rc-open').attributes()).toMatchObject({ href: plus.url, target: '_blank' })
    expect(w.find('.rc-open').text()).toBe('Open Coursera')
  })

  it('says today or tomorrow, and leaves out Covers for a plain subscription', () => {
    expect(setup(new Date(2026, 9, 15, 10)).w.find('.rc-title').text()).toBe('Coursera Plus renews today')
    const sub = { ...plus, type: 'tool' as const }
    const { w } = setup(new Date(2026, 9, 14, 10), [sub, ...covered])
    expect(w.find('.rc-title').text()).toBe('Coursera Plus renews tomorrow')
    expect(w.find('.rc-sub').text()).toBe('£49 tomorrow')
  })

  it('Keep it and I’ve cancelled it update the resource', async () => {
    const { w, ember } = setup(new Date(2026, 9, 12, 10))
    await w.find('.rc-keep').trigger('click')
    expect(ember.resources[0].keptFor).toBe('2026-10-15')
    await w.find('.rc-cancelled').trigger('click')
    expect(ember.resources[0].status).toBe('dropped')
  })
})
