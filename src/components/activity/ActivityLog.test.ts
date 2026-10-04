import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FocusLog } from '../../core/model'
import { dataFixture, goalFixture, taskFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import ActivityLog from './ActivityLog.vue'

const TODAY = '2026-09-23'

function setup(logCount: number) {
  setActivePinia(createPinia())
  const logs: FocusLog[] = Array.from({ length: logCount }, (_, i) => ({
    id: `l${i}`, at: new Date(2026, 8, 22, 8, i).getTime(), date: '2026-09-22', min: 25, target: { kind: 'task', taskId: 'Review PR' },
  }))
  useEmberStore().replaceData(dataFixture({
    goals: [goalFixture('D3', [])],
    tasks: [taskFixture('Review PR', { doneOn: TODAY })],
    logs,
  }))
  return mount(ActivityLog)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('ActivityLog', () => {
  it('shows entries with icon, text, hash, source and day', () => {
    const w = setup(2)
    const [done, focus] = w.findAll('.al-entry')
    expect(done.find('.al-icon').classes()).toContain('is-done')
    expect(done.find('.al-text').text()).toBe('Completed task “Review PR”')
    expect(done.find('.al-hash').text()).toMatch(/^[0-9a-f]{7}$/)
    expect(done.find('.al-meta').text()).toContain('Task · Work')
    expect(done.find('.al-meta').text()).toContain('Today')
    expect(focus.find('.al-icon').classes()).not.toContain('is-done')
    expect(focus.find('.al-text').text()).toBe('Focused 25m on “Review PR”')
    expect(focus.find('.al-meta').text()).toContain('Yesterday')
    expect(w.find('.al-more').exists()).toBe(false)
  })

  it('pages the log ten at a time and hides "Show earlier" at the end', async () => {
    const w = setup(14)
    expect(w.findAll('.al-entry')).toHaveLength(10)
    await w.find('.al-more').trigger('click')
    expect(w.findAll('.al-entry')).toHaveLength(15)
    expect(w.find('.al-more').exists()).toBe(false)
  })
})
