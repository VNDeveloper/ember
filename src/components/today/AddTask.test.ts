import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dataFixture, goalFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import AddTask from './AddTask.vue'

function setup() {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  ember.replaceData(dataFixture({ goals: [goalFixture('D3', [])] }))
  return { w: mount(AddTask), ember }
}
const when = (w: ReturnType<typeof mount>, i: number) => w.findAll('.seg-opt input')[i].setValue(true)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('AddTask', () => {
  it('adds an Inbox task for today on Enter and clears the title', async () => {
    const { w, ember } = setup()
    await w.find('.at-title').setValue('Call the landlord')
    await w.find('.at-title').trigger('keydown', { key: 'Enter' })
    expect(ember.tasks).toHaveLength(1)
    expect(ember.tasks[0]).toMatchObject({ title: 'Call the landlord', tag: 'Inbox', date: '2026-09-23', deadline: false, goalId: null })
    expect((w.find('.at-title').element as HTMLInputElement).value).toBe('')
  })

  it('adds for tomorrow with the Add button', async () => {
    const { w, ember } = setup()
    await when(w, 1)
    await w.find('.at-title').setValue('Pay rent')
    await w.find('.at-add').trigger('click')
    expect(ember.tasks[0].date).toBe('2026-09-24')
  })

  it('shows a date picker for Pick date, starting two days out and never before today', async () => {
    const { w, ember } = setup()
    expect(w.find('.at-date').exists()).toBe(false)
    await when(w, 2)
    const date = w.find('.at-date')
    expect(date.attributes('min')).toBe('2026-09-23')
    expect((date.element as HTMLInputElement).value).toBe('2026-09-25')
    await w.find('.at-title').setValue('Plan trip')
    await w.find('.at-add').trigger('click')
    expect(ember.tasks[0].date).toBe('2026-09-25')
  })

  it('toggles Deadline, resets it after adding, and hides it for Someday', async () => {
    const { w, ember } = setup()
    await w.find('.at-deadline').trigger('click')
    expect(w.find('.at-deadline').attributes('aria-pressed')).toBe('true')
    await w.find('.at-title').setValue('Renew insurance')
    await w.find('.at-add').trigger('click')
    expect(ember.tasks[0].deadline).toBe(true)
    expect(w.find('.at-deadline').attributes('aria-pressed')).toBe('false')
    await when(w, 3)
    expect(w.find('.at-deadline').exists()).toBe(false)
  })

  it('links the task to a goal', async () => {
    const { w, ember } = setup()
    await w.find('.at-goal').setValue('D3')
    await w.find('.at-title').setValue('Read Tufte')
    await w.find('.at-add').trigger('click')
    expect(ember.tasks[0].goalId).toBe('D3')
  })

  it('ignores an empty title', async () => {
    const { w, ember } = setup()
    await w.find('.at-add').trigger('click')
    expect(ember.tasks).toHaveLength(0)
  })
})
