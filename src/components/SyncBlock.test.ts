import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeSyncFile, sharedPart } from '../core/sync'
import { dataFixture, taskFixture } from '../core/test-fixtures'
import { useEmberStore } from '../stores/ember'
import { provideSyncBackend, useSyncStore, type SyncStatus } from '../stores/sync'
import { FakeBackend } from '../sync/test-backend'
import SyncBlock from './SyncBlock.vue'

const NOW = new Date(2026, 9, 5, 10, 0).getTime()

function setup(saved?: object) {
  if (saved) localStorage.setItem('ember:sync', JSON.stringify(saved))
  const backend = new FakeBackend()
  provideSyncBackend(backend)
  setActivePinia(createPinia())
  useEmberStore().replaceData(dataFixture({ tasks: [taskFixture('Here')] }))
  const sync = useSyncStore()
  const w = mount(SyncBlock, { attachTo: document.body })
  return { w, sync, backend }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  localStorage.clear()
})
afterEach(() => {
  provideSyncBackend(undefined)
  vi.useRealTimers()
})

describe('SyncBlock', () => {
  it('offers to connect when signed out', async () => {
    const { w, sync, backend } = setup()
    expect(w.find('.sb-note').text()).toBe('Keep Ember in step across your devices using your Google Drive.')
    await w.find('.sb-connect').trigger('click')
    await flushPromises()
    expect(sync.status).toBe('synced')
    expect(backend.pushes).toHaveLength(1)
    expect(w.find('.sb-status').text()).toBe('Synced · just now')
    w.unmount()
  })

  it.each<[SyncStatus, string, string[]]>([
    ['synced', 'Synced · 3 min ago', ['Sync now', 'Disconnect']],
    ['syncing', 'Syncing…', ['Disconnect']],
    ['offline', "Offline · will sync when you're back", ['Disconnect']],
    ['needs-reconnect', 'Sign-in expired', ['Reconnect', 'Disconnect']],
    ['error', "Couldn't sync", ['Try again', 'Disconnect']],
    ['unreadable', "The file in Drive couldn't be read", ["Replace Drive with this device's data", 'Disconnect']],
  ])('shows %s', async (status, text, buttons) => {
    const { w, sync } = setup({ connected: true, generation: 'g1', lastSyncedAt: NOW - 3 * 60_000 })
    sync.status = status
    await flushPromises()
    expect(w.find('.sb-status').text()).toBe(text)
    expect(w.find('.sb-status').attributes('role')).toBe('status')
    expect(w.findAll('.sb-actions button').map((b) => b.text())).toEqual(buttons)
    w.unmount()
  })

  it('asks which data to keep on first connection, focusing the recommended choice', async () => {
    const { w, sync, backend } = setup()
    backend.file = makeSyncFile(sharedPart(dataFixture({ tasks: [taskFixture('There')] })), 'g1', NOW - 86_400_000)
    await w.find('.sb-connect').trigger('click')
    await flushPromises()
    expect(w.find('.sb-choice p').text()).toBe('Your Drive already has Ember data (0 goals · 1 task · 0 focus sessions, last synced Oct 4).')
    expect(w.findAll('.sb-choice button').map((b) => b.text())).toEqual(["Use Drive's data here", "Replace Drive with this device's data", 'Cancel'])
    expect(document.activeElement).toBe(w.find('.sb-use').element)
    await w.find('.sb-use').trigger('click')
    expect(sync.status).toBe('synced')
    w.unmount()
  })
})
