import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EmberData, Task } from '../core/model'
import { dataFixture, goalFixture, taskFixture } from '../core/test-fixtures'
import { useEmberStore } from '../stores/ember'
import TaskRow from './TaskRow.vue'

function setup(task: Task, variant: 'today' | 'upcoming' | 'goal' = 'today', showDate = false, extra: Partial<EmberData> = {}) {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  ember.replaceData(dataFixture({ goals: [goalFixture('D3', [['M', [['S', null]]]])], tasks: [task], ...extra }))
  const w = mount(TaskRow, { props: { task: ember.tasks[0], variant, showDate } })
  return { w, ember }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('TaskRow — today', () => {
  it('shows the title, tag and focused time', () => {
    const { w } = setup(taskFixture('Review PR'), 'today', false, {
      logs: [{ id: 'l', at: 0, date: '2026-09-20', min: 25, target: { kind: 'task', taskId: 'Review PR' } }],
    })
    expect(w.find('.tr-title').text()).toBe('Review PR')
    expect(w.find('.tr-label').text()).toBe('Work')
    expect(w.find('.tr-note').exists()).toBe(false)
    expect(w.find('.tr-spent').text()).toBe('25m')
  })

  it('shows the goal name with its colour', () => {
    const { w } = setup(taskFixture('Paper', { goalId: 'D3', tag: '' }))
    expect(w.find('.tr-label').text()).toBe('D3')
    expect(w.find('.tr-label .swatch').attributes('style')).toContain('var(--color-accent)')
  })

  it('falls back to the tag when the goal is gone', () => {
    const { w } = setup(taskFixture('Orphan', { goalId: 'deleted', tag: 'Home' }))
    expect(w.find('.tr-label').text()).toBe('Home')
    expect(w.find('.tr-label .swatch').exists()).toBe(false)
  })

  it('completes and un-completes, hiding the row actions while done', async () => {
    const { w, ember } = setup(taskFixture('Review PR'))
    await w.find('.check').trigger('click')
    expect(ember.tasks[0].doneOn).toBe('2026-09-23')
    expect(w.find('.task-row').classes()).toContain('is-done')
    expect(w.find('.check').attributes('aria-checked')).toBe('true')
    expect(w.find('.tr-focus').classes()).toContain('is-hidden')
    expect(w.find('.tr-defer').classes()).toContain('is-hidden')
    await w.find('.check').trigger('click')
    expect(ember.tasks[0].doneOn).toBeNull()
  })

  it('moves to tomorrow', async () => {
    const { w, ember } = setup(taskFixture('Review PR'))
    await w.find('.tr-defer').trigger('click')
    expect(ember.tasks[0].date).toBe('2026-09-24')
  })

  it('selects the task for focus', async () => {
    const { w, ember } = setup(taskFixture('Review PR'))
    await w.find('.tr-focus').trigger('click')
    expect(ember.selection).toEqual({ kind: 'task', taskId: 'Review PR' })
    expect(w.find('.task-row').classes()).toContain('is-selected')
    expect(w.find('.tr-focus').classes()).toContain('is-on')
  })

  it('flags deadlines in accent', () => {
    const { w } = setup(taskFixture('Insurance', { deadline: true }))
    expect(w.find('.tr-note').text()).toBe('Due today')
    expect(w.find('.tr-note').classes()).toContain('is-accent')
    expect(w.find('.tr-note svg').exists()).toBe(true)
  })

  it('rolls over quietly', () => {
    const { w } = setup(taskFixture('Dentist', { date: '2026-09-21' }))
    expect(w.find('.tr-note').text()).toBe('From Sep 21')
    expect(w.find('.tr-note').classes()).not.toContain('is-accent')
    expect(w.find('.tr-note svg').exists()).toBe(false)
  })
})

describe('TaskRow — upcoming', () => {
  it('moves a Someday task to today and has no focus button or time', async () => {
    const { w, ember } = setup(taskFixture('Sourdough', { date: null }), 'upcoming')
    expect(w.find('.check').classes()).toContain('check-sm')
    expect(w.find('.tr-focus').exists()).toBe(false)
    expect(w.find('.tr-spent').exists()).toBe(false)
    expect(w.find('.tr-pull').classes()).not.toContain('is-hidden')
    await w.find('.tr-pull').trigger('click')
    expect(ember.tasks[0].date).toBe('2026-09-23')
  })

  it('shows the date where asked', () => {
    const { w } = setup(taskFixture('Car service', { date: '2026-10-09' }), 'upcoming', true)
    expect(w.find('.tr-note').text()).toBe('Oct 9')
  })
})

describe('TaskRow — goal', () => {
  it('shows time and a focus button but no move button, with the date shown', async () => {
    const { w, ember } = setup(taskFixture('Paper', { goalId: 'D3', tag: '', date: '2026-09-26' }), 'goal', true)
    expect(w.find('.task-row').classes()).toContain('is-goal')
    expect(w.find('.tr-defer').exists()).toBe(false)
    expect(w.find('.tr-pull').exists()).toBe(false)
    expect(w.find('.tr-spent').exists()).toBe(true)
    expect(w.find('.tr-note').text()).toBe('Sep 26')
    await w.find('.tr-focus').trigger('click')
    expect(ember.selection).toEqual({ kind: 'task', taskId: 'Paper' })
    expect(w.find('.task-row').classes()).toContain('is-selected')
  })
})
