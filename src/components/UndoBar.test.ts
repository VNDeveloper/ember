import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dataFixture, taskFixture } from '../core/test-fixtures'
import { useEmberStore } from '../stores/ember'
import { useUiStore } from '../stores/ui'
import UndoBar from './UndoBar.vue'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
  setActivePinia(createPinia())
})
afterEach(() => vi.useRealTimers())

describe('UndoBar', () => {
  it('announces the delete and undoes it', async () => {
    const ember = useEmberStore()
    ember.replaceData(dataFixture({ tasks: [taskFixture('Review PR')] }))
    const ui = useUiStore()
    const w = mount(UndoBar)
    expect(w.find('.undo-bar').exists()).toBe(false)
    expect(w.find('[role="status"]').attributes('aria-live')).toBe('polite')
    ui.showUndo(ember.deleteTask('Review PR'))
    await w.vm.$nextTick()
    expect(w.find('.ub-text').text()).toBe('Deleted “Review PR”')
    await w.find('.ub-undo').trigger('click')
    expect(ember.tasks[0].deletedOn).toBeNull()
    expect(ui.undo).toBeNull()
  })

  it('can be dismissed', async () => {
    const ember = useEmberStore()
    ember.replaceData(dataFixture({ tasks: [taskFixture('Review PR')] }))
    const ui = useUiStore()
    const w = mount(UndoBar)
    ui.showUndo(ember.deleteTask('Review PR'))
    await w.vm.$nextTick()
    await w.find('.ub-close').trigger('click')
    expect(ui.undo).toBeNull()
    expect(ember.tasks[0].deletedOn).toBe('2026-09-23')
  })
})
