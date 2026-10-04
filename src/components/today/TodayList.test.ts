import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dataFixture, taskFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import TodayList from './TodayList.vue'

const TODAY = '2026-09-23'

function setup() {
  setActivePinia(createPinia())
  useEmberStore().replaceData(dataFixture({
    tasks: [
      taskFixture('A'),
      taskFixture('B', { doneOn: TODAY }),
      taskFixture('C', { date: '2026-09-21', deadline: true }),
      taskFixture('D', { date: '2026-09-25' }),
    ],
  }))
  return mount(TodayList)
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
})
