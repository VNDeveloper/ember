import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EmberData } from '../core/model'
import { STORAGE_KEY } from '../core/persist'
import { makeSyncFile, readSyncFile, sharedPart } from '../core/sync'
import { dataFixture, goalFixture, taskFixture } from '../core/test-fixtures'
import { SyncAuthError, SyncOfflineError } from '../sync/backend'
import { FakeBackend } from '../sync/test-backend'
import { useEmberStore } from './ember'
import { provideSyncBackend, useSyncStore } from './sync'

const NOW = new Date(2026, 9, 5, 10, 0).getTime()
const local = () => dataFixture({ tasks: [taskFixture('Here', { updatedAt: 1 })] })
const driveFile = (generation: string, patch: Partial<EmberData> = {}) =>
  makeSyncFile(sharedPart(dataFixture({ goals: [goalFixture('D3', [])], tasks: [taskFixture('There', { updatedAt: 1 })], ...patch })), generation, NOW - 86_400_000)
const fileOf = (b: FakeBackend) => {
  const r = readSyncFile(b.file!)
  if (!r.ok) throw new Error('bad file')
  return r
}

function setup(opts: { backend?: FakeBackend | null; saved?: object; data?: EmberData } = {}) {
  if (opts.saved) localStorage.setItem('ember:sync', JSON.stringify(opts.saved))
  const backend = opts.backend === undefined ? new FakeBackend() : opts.backend
  provideSyncBackend(backend)
  setActivePinia(createPinia())
  const ember = useEmberStore()
  ember.replaceData(opts.data ?? local())
  const sync = useSyncStore()
  return { ember, sync, backend: backend as FakeBackend }
}
const connectedTo = (generation: string) => ({ connected: true, generation, lastSyncedAt: NOW - 60_000, newGeneration: false })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  localStorage.clear()
})
afterEach(() => {
  provideSyncBackend(undefined)
  vi.useRealTimers()
})

describe('sync controller', () => {
  it('is unconfigured without a backend, and signed out with one', () => {
    expect(setup({ backend: null }).sync.status).toBe('unconfigured')
    expect(setup().sync).toMatchObject({ status: 'signed-out', configured: true, connected: false })
  })

  it('first connection with an empty Drive uploads this device as a new generation', async () => {
    const { sync, backend } = setup()
    await sync.connect()
    expect(sync.status).toBe('synced')
    expect(fileOf(backend).data.tasks.map((t) => t.id)).toEqual(['Here'])
    const saved = JSON.parse(localStorage.getItem('ember:sync')!)
    expect(saved).toMatchObject({ connected: true, generation: fileOf(backend).generation, lastSyncedAt: NOW })
  })

  it('first connection with data in Drive asks which to keep', async () => {
    const { sync, backend } = setup()
    backend.file = driveFile('g1')
    await sync.connect()
    expect(sync.status).toBe('choose')
    expect(sync.choice).toEqual({ summary: '1 goal · 1 task · 0 focus sessions', from: 'Oct 4' })
    expect(backend.pushes).toHaveLength(0)
  })

  it("uses Drive's data here with a safety copy, keeping this device's timer", async () => {
    const { sync, ember, backend } = setup()
    backend.file = driveFile('g1')
    ember.startPause()
    await sync.connect()
    sync.useDriveData()
    expect(ember.tasks.map((t) => t.id)).toEqual(['There'])
    expect(ember.timer.running).toBe(true)
    expect(localStorage.getItem(`${STORAGE_KEY}:before-restore`)).toContain('Here')
    expect(sync).toMatchObject({ status: 'synced', choice: null })
    expect(backend.pushes).toHaveLength(0)
  })

  it("replaces Drive with this device's data as a new generation", async () => {
    const { sync, backend } = setup()
    backend.file = driveFile('g1')
    await sync.connect()
    await sync.replaceDrive()
    const f = fileOf(backend)
    expect(f.generation).not.toBe('g1')
    expect(f.data.tasks.map((t) => t.id)).toEqual(['Here'])
    expect(sync.status).toBe('synced')
  })

  it('cancelling the choice signs out and changes nothing', async () => {
    const { sync, ember, backend } = setup()
    backend.file = driveFile('g1')
    await sync.connect()
    await sync.cancelChoice()
    expect(sync).toMatchObject({ status: 'signed-out', connected: false })
    expect(ember.tasks.map((t) => t.id)).toEqual(['Here'])
  })

  it('stays signed out when sign-in is refused', async () => {
    const { sync, backend } = setup()
    backend.connectResult = 'denied'
    await sync.connect()
    expect(sync).toMatchObject({ status: 'signed-out', connected: false })
  })

  it('merges, and uploads only when something changed', async () => {
    const { sync, ember, backend } = setup({ saved: connectedTo('g1') })
    backend.file = driveFile('g1')
    await sync.syncNow()
    expect(ember.tasks.map((t) => t.id).sort()).toEqual(['Here', 'There'])
    expect(fileOf(backend).data.tasks.map((t) => t.id).sort()).toEqual(['Here', 'There'])
    expect(backend.pushes).toHaveLength(1)
    await sync.syncNow()
    expect(backend.pushes).toHaveLength(1)
    expect(sync.status).toBe('synced')
  })

  it('replaces local data, with a safety copy, when Drive starts a new generation', async () => {
    const { sync, ember, backend } = setup({ saved: connectedTo('g1') })
    backend.file = driveFile('g2')
    await sync.syncNow()
    expect(ember.tasks.map((t) => t.id)).toEqual(['There'])
    expect(localStorage.getItem(`${STORAGE_KEY}:before-restore`)).toContain('Here')
    expect(backend.pushes).toHaveLength(0)
    expect(JSON.parse(localStorage.getItem('ember:sync')!).generation).toBe('g2')
  })

  it('never overwrites an unreadable Drive file, unless asked', async () => {
    const { sync, backend } = setup({ saved: connectedTo('g1') })
    backend.file = 'garbage'
    await sync.syncNow()
    expect(sync.status).toBe('unreadable')
    expect(backend.pushes).toHaveLength(0)
    await sync.replaceDrive()
    expect(fileOf(backend).data.tasks.map((t) => t.id)).toEqual(['Here'])
  })

  it('asks to reconnect when the pass expires mid-sync, keeping local data, then uploads after reconnecting', async () => {
    const { sync, ember, backend } = setup({ saved: connectedTo('g1') })
    backend.file = driveFile('g1')
    backend.onPush = () => { backend.onPush = null; backend.failNext = new SyncAuthError('401') }
    await sync.syncNow()
    expect(sync.status).toBe('needs-reconnect')
    expect(sync.needsAttention).toBe(true)
    expect(ember.tasks.map((t) => t.id).sort()).toEqual(['Here', 'There'])
    await sync.reconnect()
    expect(sync.status).toBe('synced')
    expect(fileOf(backend).data.tasks.map((t) => t.id).sort()).toEqual(['Here', 'There'])
  })

  it('goes offline without retrying, and retries other errors after 1, 5 and 15 minutes', async () => {
    const { sync, backend } = setup({ saved: connectedTo('g1') })
    backend.file = driveFile('g1')
    backend.failNext = new SyncOfflineError('net')
    await sync.syncNow()
    expect(sync.status).toBe('offline')
    expect(vi.getTimerCount()).toBe(0)

    const pullsAt = () => backend.pulls
    backend.failNext = new Error('Drive 500')
    await sync.syncNow()
    expect(sync.status).toBe('error')
    const p = pullsAt()
    backend.failNext = new Error('Drive 500')
    await vi.advanceTimersByTimeAsync(59_000)
    expect(backend.pulls).toBe(p)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(backend.pulls).toBe(p + 1)
    backend.failNext = new Error('Drive 500')
    await vi.advanceTimersByTimeAsync(300_000)
    expect(backend.pulls).toBe(p + 2)
    await vi.advanceTimersByTimeAsync(900_000)
    expect(backend.pulls).toBe(p + 3)
    expect(sync.status).toBe('synced')
  })

  it('after a restore, starts a new generation, and pushes it even if that upload first fails', async () => {
    const { sync, backend } = setup({ saved: connectedTo('g1') })
    backend.file = driveFile('g1')
    backend.failNext = new Error('Drive 500')
    await sync.afterRestore()
    expect(sync.status).toBe('error')
    await sync.syncNow()
    const f = fileOf(backend)
    expect(f.generation).not.toBe('g1')
    expect(f.data.tasks.map((t) => t.id)).toEqual(['Here'])
  })

  it('disconnects, keeping local data and the Drive file', async () => {
    const { sync, ember, backend } = setup({ saved: connectedTo('g1') })
    backend.file = driveFile('g1')
    await sync.disconnect()
    expect(sync).toMatchObject({ status: 'signed-out', connected: false })
    expect(JSON.parse(localStorage.getItem('ember:sync')!)).toMatchObject({ connected: false, generation: null })
    expect(backend.file).not.toBeNull()
    expect(ember.tasks.map((t) => t.id)).toEqual(['Here'])
  })
})
