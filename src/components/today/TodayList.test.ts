import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Resource } from '../../core/model'
import { dataFixture, resourceFixture, taskFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import TodayList from './TodayList.vue'

const TODAY = '2026-09-23'

function setup(resources: Resource[] = []) {
  setActivePinia(createPinia())
  useEmberStore().replaceData(dataFixture({
    tasks: [
      taskFixture('A'),
      taskFixture('B', { doneOn: TODAY }),
      taskFixture('C', { date: '2026-09-21', deadline: true }),
      taskFixture('D', { date: '2026-09-25' }),
    ],
    resources,
  }))
  return mount(TodayList, { attachTo: document.body })
}
const rowTitles = (w: ReturnType<typeof mount>) => w.findAll('.tr-title').map((t) => t.text())

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('TodayList', () => {
  it('lists open tasks, missed deadlines first, with done ones collapsed', () => {
    const w = setup()
    expect(rowTitles(w)).toEqual(['C', 'A'])
    expect(w.find('.tl-done-toggle').text()).toBe('1 done')
    expect(w.find('.tl-summary').text()).toBe('1 of 3 done')
  })

  it('expands and hides finished rows', async () => {
    const w = setup()
    await w.find('.tl-done-toggle').trigger('click')
    expect(rowTitles(w)).toEqual(['C', 'A', 'B'])
    expect(w.find('.tl-done-toggle').text()).toBe('Hide done')
    await w.find('.tl-done-toggle').trigger('click')
    expect(rowTitles(w)).toEqual(['C', 'A'])
  })

  it('shows the 7-day strip and the streak', () => {
    const w = setup()
    const days = w.findAll('.tl-week span')
    expect(days).toHaveLength(7)
    expect(days[6].classes()).toContain('is-today')
    expect(days[6].attributes('title')).toBe('Sep 23: 1 done')
    expect(w.find('.tl-streak').text()).toBe('1-day streak')
  })

  it('keeps keyboard focus in the list when a row is completed or moved away', async () => {
    const w = setup()
    const rowCheck = (title: string) => w.findAll('.task-row').find((r) => r.find('.tr-title').text() === title)!.find('.check')

    const c = rowCheck('C')
    ;(c.element as HTMLElement).focus()
    await c.trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(rowCheck('A').element)

    const a = rowCheck('A')
    ;(a.element as HTMLElement).focus()
    const defer = w.findAll('.task-row')[0].find('.tr-defer')
    ;(defer.element as HTMLElement).focus()
    await defer.trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(w.find('.tl-done-toggle').element)
    w.unmount()
  })

  it("pops today's streak square on a completion", async () => {
    const w = setup()
    const today = () => w.findAll('.tl-week span')[6]
    expect(today().classes().some((c) => c.startsWith('anim-pop'))).toBe(false)
    await w.findAll('.task-row')[1].find('.check').trigger('click')
    expect(today().classes()).toContain('anim-pop1')
  })

  it('says so when nothing is planned for today', () => {
    setActivePinia(createPinia())
    useEmberStore().replaceData(dataFixture())
    const w = mount(TodayList, { attachTo: document.body })
    expect(w.find('.tl-empty').text()).toBe('Nothing for today. Add a task above.')
    w.unmount()
  })

  it('shows due renewals above the tasks, without counting them as tasks', () => {
    const plain = setup().find('.tl-summary').text()
    document.body.innerHTML = ''
    const w = setup([resourceFixture('Plus', { billing: 'month', price: 49, renewsOn: '2026-09-25' })])
    expect(w.find('.tl-rows > .renewal-card').exists()).toBe(true)
    expect(w.find('.tl-summary').text()).toBe(plain)
  })

  it('opens Paste tasks', async () => {
    const w = setup()
    await w.find('.tl-import').trigger('click')
    expect(useUiStore().editing).toBe('import:tasks')
    expect(w.find('.import-panel').exists()).toBe(true)
    w.unmount()
  })
})
