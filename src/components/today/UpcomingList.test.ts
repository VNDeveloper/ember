import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Resource, Task } from '../../core/model'
import { dataFixture, resourceFixture, taskFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import UpcomingList from './UpcomingList.vue'

function setup(tasks: Task[], resources: Resource[] = []) {
  setActivePinia(createPinia())
  useEmberStore().replaceData(dataFixture({ tasks, resources }))
  return mount(UpcomingList)
}
const tasks = () => [
  taskFixture('Landlord', { date: '2026-09-24' }),
  taskFixture('Car service', { date: '2026-10-09' }),
  taskFixture('Sourdough', { date: null }),
]

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('UpcomingList', () => {
  it('shows day groups open and Later / Someday collapsed', () => {
    const w = setup(tasks())
    expect(w.findAll('.up-label').map((l) => l.text())).toEqual(['Tomorrow', 'Later', 'Someday'])
    expect(w.findAll('.up-right').map((l) => l.text())).toEqual(['Sep 24', '1 task', '1 task'])
    expect(w.findAll('.tr-title').map((t) => t.text())).toEqual(['Landlord'])
    expect(w.find('.up-summary').text()).toBe('2 planned · 0 deadlines · 1 someday')
  })

  it('expands Later with dates shown', async () => {
    const w = setup(tasks())
    const later = w.findAll('.up-toggle')[0]
    expect(later.attributes('aria-expanded')).toBe('false')
    await later.trigger('click')
    expect(later.attributes('aria-expanded')).toBe('true')
    expect(w.findAll('.tr-title').map((t) => t.text())).toEqual(['Landlord', 'Car service'])
    expect(w.findAll('.tr-note').map((n) => n.text())).toEqual(['Oct 9'])
  })

  it('says when nothing is planned', () => {
    const w = setup([taskFixture('Today only')])
    expect(w.find('.up-empty').text()).toBe('Nothing planned. Pick a date or Someday when you add a task.')
  })

  it('shows a renewal as a row that cannot be ticked', () => {
    const w = setup(tasks(), [resourceFixture('Plus', { type: 'membership', billing: 'month', price: 49, renewsOn: '2026-09-25' })])
    const row = w.find('.up-renewal')
    expect(row.find('.up-ren-title').text()).toBe('Plus renews')
    expect(row.find('.up-ren-meta').text()).toBe('£49 · Membership')
    expect(row.find('.check').exists()).toBe(false)
  })
})
