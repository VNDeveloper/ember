import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeBackup } from '../core/backup'
import { makeSyncFile, readSyncFile, sharedPart } from '../core/sync'
import { dataFixture, goalFixture, taskFixture } from '../core/test-fixtures'
import { useEmberStore } from '../stores/ember'
import { provideSyncBackend, useSyncStore } from '../stores/sync'
import { useUiStore } from '../stores/ui'
import { FakeBackend } from '../sync/test-backend'
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
  provideSyncBackend(undefined)
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

  it('hides sync when no Google client is configured', async () => {
    const { w } = setup()
    await w.find('.dm-toggle').trigger('click')
    expect(w.find('.sync-block').exists()).toBe(false)
    w.unmount()
  })

  it('marks the Data button when sync needs attention', async () => {
    provideSyncBackend(new FakeBackend())
    const { w } = setup()
    const sync = useSyncStore()
    expect(w.find('.dm-attn').exists()).toBe(false)
    expect(w.find('.dm-toggle').attributes('aria-label')).toBeUndefined()
    sync.status = 'needs-reconnect'
    await flushPromises()
    expect(w.find('.dm-attn').exists()).toBe(true)
    expect(w.find('.dm-toggle').attributes('aria-label')).toBe('Data, sync needs attention')
    w.unmount()
  })

  it('warns that a restore replaces other devices too, and starts a new generation', async () => {
    localStorage.setItem('ember:sync', JSON.stringify({ connected: true, generation: 'g1', lastSyncedAt: null }))
    const backend = new FakeBackend()
    provideSyncBackend(backend)
    const { w } = setup()
    await w.find('.dm-toggle').trigger('click')
    await pickFile(w, makeBackup(dataFixture({ tasks: [taskFixture('From backup')] }), NOW))
    expect(w.find('.dm-confirm p').text()).toContain('This also replaces the data on your other devices.')
    await w.find('.dm-replace').trigger('click')
    await flushPromises()
    expect(backend.file).toContain('From backup')
    expect(backend.file).not.toContain('"generation":"g1"')
    w.unmount()
  })

  it('cancels a pending first-connection choice when the menu closes', async () => {
    const backend = new FakeBackend()
    backend.file = '{"app":"ember","version":1,"generation":"g1","data":{"goals":[],"tasks":[],"logs":[],"settings":{}}}'
    provideSyncBackend(backend)
    const { w, ui } = setup()
    const sync = useSyncStore()
    await w.find('.dm-toggle').trigger('click')
    await sync.connect()
    expect(sync.status).toBe('choose')
    ui.dataMenuOpen = false
    await flushPromises()
    expect(sync).toMatchObject({ status: 'signed-out', connected: false })
    w.unmount()
  })

  describe('delete data', () => {
    const openDelete = async (w: ReturnType<typeof mount>) => {
      await w.find('.dm-toggle').trigger('click')
      await w.find('.dm-delete').trigger('click')
    }

    it('asks first, offers a backup, and deletes everything but settings', async () => {
      const { w, ember, ui } = setup()
      ember.updateSettings({ wallWeeks: 20 })
      await openDelete(w)
      expect(w.find('.dm-delete-confirm p').text()).toBe('Delete all tasks, goals and focus history? Your settings stay. Back up first if you might want them back.')
      expect(w.find('.dm-delete-confirm .dm-backup').exists()).toBe(true)
      expect(w.findAll('.dm-delete-confirm .dm-actions button').map((b) => b.text())).toEqual(['Delete', 'Cancel'])
      expect([ember.goals.length, ember.tasks.length]).toEqual([1, 1])
      await w.find('.dm-erase').trigger('click')
      expect([ember.goals, ember.tasks, ember.logs]).toEqual([[], [], []])
      expect(ember.settings.wallWeeks).toBe(20)
      expect(ui.dataMenuOpen).toBe(false)
      w.unmount()
    })

    it('cancel keeps everything and goes back to the menu', async () => {
      const { w, ember } = setup()
      await openDelete(w)
      await w.find('.dm-cancel-delete').trigger('click')
      expect(w.find('.dm-delete-confirm').exists()).toBe(false)
      expect(w.find('.dm-delete').exists()).toBe(true)
      expect(ember.tasks).toHaveLength(1)
      w.unmount()
    })

    it('when synced, offers deleting everywhere or on this device only', async () => {
      localStorage.setItem('ember:sync', JSON.stringify({ connected: true, generation: 'g1', lastSyncedAt: null }))
      const backend = new FakeBackend()
      backend.file = makeSyncFile(sharedPart(dataFixture({ tasks: [taskFixture('On Drive')] })), 'g1', NOW)
      provideSyncBackend(backend)
      const { w, ember } = setup()
      await openDelete(w)
      expect(w.findAll('.dm-delete-confirm .dm-actions button').map((b) => b.text())).toEqual(['Delete everywhere', 'Delete on this device only', 'Cancel'])
      await w.find('.dm-erase-all').trigger('click')
      await flushPromises()
      expect(ember.tasks).toEqual([])
      const f = readSyncFile(backend.file!)
      expect(f.ok && f.generation).not.toBe('g1')
      expect(f.ok && f.data.tasks).toEqual([])
      w.unmount()
    })

    it('deleting on this device only stops syncing here', async () => {
      localStorage.setItem('ember:sync', JSON.stringify({ connected: true, generation: 'g1', lastSyncedAt: null }))
      const backend = new FakeBackend()
      provideSyncBackend(backend)
      const { w, ember } = setup()
      const sync = useSyncStore()
      await openDelete(w)
      await w.find('.dm-erase-here').trigger('click')
      await flushPromises()
      expect(ember.tasks).toEqual([])
      expect(sync.connected).toBe(false)
      expect(backend.pushes).toHaveLength(0)
      w.unmount()
    })
  })
})
