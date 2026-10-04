import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeBackup } from '../core/backup'
import { dataFixture, goalFixture, taskFixture } from '../core/test-fixtures'
import { useEmberStore } from '../stores/ember'
import { useUiStore } from '../stores/ui'
import DataMenu from './DataMenu.vue'

const NOW = new Date(2026, 8, 23, 10, 0).getTime()

function setup() {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  ember.replaceData(dataFixture({ goals: [goalFixture('D3', [])], tasks: [taskFixture('Review PR')] }))
  const w = mount(DataMenu, { attachTo: document.body })
  return { w, ember, ui: useUiStore() }
}

async function pickFile(w: ReturnType<typeof mount>, text: string) {
  const input = w.find('.dm-file')
  Object.defineProperty(input.element, 'files', { value: [new File([text], 'backup.json', { type: 'application/json' })], configurable: true })
  await input.trigger('change')
  await flushPromises()
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  localStorage.clear()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('DataMenu', () => {
  it('opens and closes the panel', async () => {
    const { w, ui } = setup()
    expect(w.find('.dm-panel').exists()).toBe(false)
    await w.find('.dm-toggle').trigger('click')
    expect(ui.dataMenuOpen).toBe(true)
    expect(w.find('.dm-toggle').attributes('aria-expanded')).toBe('true')
    expect(w.find('.dm-last').text()).toBe('Last backup: Never')
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await flushPromises()
    expect(ui.dataMenuOpen).toBe(false)
    w.unmount()
  })

  it('downloads a dated backup and remembers when', async () => {
    const { w } = setup()
    const createObjectURL = vi.fn(() => 'blob:ember')
    const revokeObjectURL = vi.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    let downloaded = ''
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloaded = this.download })
    await w.find('.dm-toggle').trigger('click')
    await w.find('.dm-backup').trigger('click')
    expect(downloaded).toBe('ember-backup-2026-09-23.json')
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:ember')
    expect(w.find('.dm-last').text()).toBe('Last backup: Sep 23')
    w.unmount()
  })

  it('asks before replacing everything with a valid backup', async () => {
    const { w, ember, ui } = setup()
    await w.find('.dm-toggle').trigger('click')
    const backup = dataFixture({ goals: [goalFixture('Spanish', []), goalFixture('Art', [])], tasks: [taskFixture('a'), taskFixture('b'), taskFixture('c')] })
    await pickFile(w, makeBackup(backup, new Date(2026, 9, 2, 9, 0).getTime()))
    expect(w.find('.dm-confirm').text()).toBe("Replace everything with the backup from Oct 2? (2 goals · 3 tasks · 0 focus sessions) This can't be undone.ReplaceCancel")
    expect(ember.goals.map((g) => g.title)).toEqual(['D3'])
    await w.find('.dm-replace').trigger('click')
    expect(ember.goals.map((g) => g.title)).toEqual(['Spanish', 'Art'])
    expect(ui.dataMenuOpen).toBe(false)
    w.unmount()
  })

  it('changes nothing on Cancel', async () => {
    const { w, ember } = setup()
    await w.find('.dm-toggle').trigger('click')
    await pickFile(w, makeBackup(dataFixture({ goals: [goalFixture('Spanish', [])] }), NOW))
    await w.find('.dm-cancel').trigger('click')
    expect(w.find('.dm-confirm').exists()).toBe(false)
    expect(ember.goals.map((g) => g.title)).toEqual(['D3'])
    w.unmount()
  })

  it("says so when the file isn't an Ember backup", async () => {
    const { w, ember } = setup()
    await w.find('.dm-toggle').trigger('click')
    await pickFile(w, '{"hello": "world"}')
    expect(w.find('.dm-error').text()).toBe("That file isn't an Ember backup.")
    expect(w.find('.dm-confirm').exists()).toBe(false)
    expect(ember.goals.map((g) => g.title)).toEqual(['D3'])
    w.unmount()
  })
})
