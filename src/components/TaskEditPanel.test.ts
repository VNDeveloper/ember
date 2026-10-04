import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../core/model'
import { dataFixture, goalFixture, taskFixture } from '../core/test-fixtures'
import { useEmberStore } from '../stores/ember'
import { useUiStore } from '../stores/ui'
import TaskEditPanel from './TaskEditPanel.vue'

function setup(task: Task) {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  const gone = goalFixture('Gone', [])
  gone.deletedOn = '2026-09-20'
  ember.replaceData(dataFixture({ goals: [goalFixture('D3', []), gone], tasks: [task] }))
  const ui = useUiStore()
  ui.startEdit(`task:${task.id}`)
  const w = mount(TaskEditPanel, { props: { task: ember.tasks[0] }, attachTo: document.body })
  return { w, ember, ui }
}
const when = (w: ReturnType<typeof mount>, i: number) => w.findAll('.ep-when input')[i].setValue(true)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('TaskEditPanel', () => {
  it('starts from the task and focuses the title', () => {
    const { w } = setup(taskFixture('Review PR', { date: '2026-09-24', deadline: true, tag: 'Work' }))
    expect((w.find('.ep-title').element as HTMLInputElement).value).toBe('Review PR')
    expect(document.activeElement).toBe(w.find('.ep-title').element)
    expect((w.findAll('.ep-when input')[1].element as HTMLInputElement).checked).toBe(true)
    expect(w.find('.flag-toggle').attributes('aria-pressed')).toBe('true')
    expect(w.findAll('.ep-goal option').map((o) => o.text())).toEqual(['No goal', 'D3'])
    w.unmount()
  })

  it('saves title, date, deadline, goal and tag, then closes', async () => {
    const { w, ember, ui } = setup(taskFixture('Review PR'))
    await w.find('.ep-title').setValue('PR #482')
    await when(w, 2)
    const date = w.find('.ep-date')
    ;(date.element as HTMLInputElement).value = '2026-10-01'
    await date.trigger('change')
    await w.find('.flag-toggle').trigger('click')
    await w.find('.ep-goal').setValue('D3')
    await w.find('.ep-tag').setValue('Code')
    await w.find('.ep-save').trigger('click')
    expect(ember.tasks[0]).toMatchObject({ title: 'PR #482', date: '2026-10-01', deadline: true, goalId: 'D3', tag: 'Code' })
    expect(ui.editing).toBeNull()
    w.unmount()
  })

  it('keeps a past date unless changed, hides Deadline for Someday, and disables Save without a title', async () => {
    const { w, ember } = setup(taskFixture('Dentist', { date: '2026-09-21', deadline: true }))
    expect((w.findAll('.ep-when input')[2].element as HTMLInputElement).checked).toBe(true)
    expect(w.find('.ep-date').attributes('min')).toBe('2026-09-21')
    await w.find('.ep-title').setValue('   ')
    expect(w.find('.ep-save').attributes('disabled')).toBeDefined()
    await w.find('.ep-title').setValue('Dentist')
    await when(w, 3)
    expect(w.find('.flag-toggle').exists()).toBe(false)
    await w.find('.ep-title').trigger('keydown', { key: 'Enter' })
    expect(ember.tasks[0]).toMatchObject({ date: null, deadline: false })
    w.unmount()
  })

  it('Cancel closes without saving; Delete is passed up', async () => {
    const { w, ember, ui } = setup(taskFixture('Review PR'))
    await w.find('.ep-title').setValue('Changed')
    await w.find('.ep-delete').trigger('click')
    expect(w.emitted('delete')).toHaveLength(1)
    await w.find('.ep-cancel').trigger('click')
    expect(ember.tasks[0].title).toBe('Review PR')
    expect(ui.editing).toBeNull()
    w.unmount()
  })

  it("doesn't unlink a task from its deleted goal unless the goal is changed", async () => {
    const { w, ember } = setup(taskFixture('Paper', { goalId: 'Gone', tag: 'Home' }))
    expect((w.find('.ep-goal').element as HTMLSelectElement).value).toBe('')
    await w.find('.ep-title').setValue('Order paper')
    await w.find('.ep-save').trigger('click')
    expect(ember.tasks[0]).toMatchObject({ title: 'Order paper', goalId: 'Gone' })
    w.unmount()
  })
})
