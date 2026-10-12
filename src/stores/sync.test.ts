import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EmberData } from '../core/model'
import { STORAGE_KEY } from '../core/persist'
import { makeSyncFile, readSyncFile, sharedPart } from '../core/sync'
import { dataFixture, goalFixture, taskFixture } from '../core/test-fixtures'
import { SyncAuthError, SyncOfflineError } from '../sync/backend'
import { FakeBackend, LiveFakeBackend } from '../sync/test-backend'
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

describe('sync triggers', () => {
  const setVisibility = (v: 'visible' | 'hidden') => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v })
    document.dispatchEvent(new Event('visibilitychange'))
  }
  afterEach(() => setVisibility('visible'))

  it('syncs on start when connected', async () => {
    const { sync, backend } = setup({ saved: connectedTo('g1') })
    backend.file = driveFile('g1')
    sync.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(backend.pulls).toBe(1)
    sync.stop()
  })

  it('asks to reconnect on start when the sign-in pass has expired', async () => {
    const { sync, backend } = setup({ saved: connectedTo('g1') })
    backend.connectResult = 'needs-user'
    sync.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(sync.status).toBe('needs-reconnect')
    expect(backend.pulls).toBe(0)
    sync.stop()
  })

  it('syncs 5 seconds after a local change, not before, and not for data that came from sync', async () => {
    const { sync, ember, backend } = setup({ saved: connectedTo('g1') })
    backend.file = driveFile('g1')
    sync.start()
    await vi.advanceTimersByTimeAsync(10_000)
    const p = backend.pulls
    ember.addTask({ title: 'New', when: 'today', deadline: false, goalId: null })
    await vi.advanceTimersByTimeAsync(4_900)
    expect(backend.pulls).toBe(p)
    await vi.advanceTimersByTimeAsync(200)
    expect(backend.pulls).toBe(p + 1)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(backend.pulls).toBe(p + 1)
    sync.stop()
  })

  it('syncs 5 seconds after adding a resource', async () => {
    const { sync, ember, backend } = setup({ saved: connectedTo('g1') })
    backend.file = driveFile('g1')
    sync.start()
    await vi.advanceTimersByTimeAsync(10_000)
    const p = backend.pulls
    ember.addResource('https://example.com/new')
    await vi.advanceTimersByTimeAsync(5_100)
    expect(backend.pulls).toBe(p + 1)
    sync.stop()
  })

  it('polls every minute while visible, not while hidden, and syncs on becoming visible', async () => {
    const { sync, backend } = setup({ saved: connectedTo('g1') })
    backend.file = driveFile('g1')
    sync.start()
    await vi.advanceTimersByTimeAsync(0)
    const p = backend.pulls
    await vi.advanceTimersByTimeAsync(60_000)
    expect(backend.pulls).toBe(p + 1)
    setVisibility('hidden')
    await vi.advanceTimersByTimeAsync(120_000)
    expect(backend.pulls).toBe(p + 1)
    setVisibility('visible')
    await vi.advanceTimersByTimeAsync(0)
    expect(backend.pulls).toBe(p + 2)
    sync.stop()
  })

  it('syncs when the network comes back', async () => {
    const { sync, backend } = setup({ saved: connectedTo('g1') })
    backend.file = driveFile('g1')
    sync.start()
    await vi.advanceTimersByTimeAsync(0)
    const p = backend.pulls
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
    expect(backend.pulls).toBe(p + 1)
    sync.stop()
  })

  it('uses subscribe instead of polling when the backend offers it', async () => {
    const live = new LiveFakeBackend()
    live.file = driveFile('g1')
    const { sync } = setup({ backend: live, saved: connectedTo('g1') })
    sync.start()
    await vi.advanceTimersByTimeAsync(0)
    const p = live.pulls
    await vi.advanceTimersByTimeAsync(180_000)
    expect(live.pulls).toBe(p)
    live.subscribers.forEach((f) => f())
    await vi.advanceTimersByTimeAsync(0)
    expect(live.pulls).toBe(p + 1)
    sync.stop()
    expect(live.subscribers).toHaveLength(0)
  })

  it('keeps an edit made during an upload and sends it on the next sync', async () => {
    const { sync, ember, backend } = setup({ saved: connectedTo('g1') })
    backend.file = driveFile('g1')
    backend.onPush = () => {
      backend.onPush = null
      ember.addTask({ title: 'Typed during upload', when: 'today', deadline: false, goalId: null })
    }
    sync.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(ember.tasks.some((t) => t.title === 'Typed during upload')).toBe(true)
    await vi.advanceTimersByTimeAsync(6_000)
    expect(fileOf(backend).data.tasks.some((t) => t.title === 'Typed during upload')).toBe(true)
    sync.stop()
  })

  it('stops every trigger on stop', async () => {
    const { sync, backend } = setup({ saved: connectedTo('g1') })
    backend.file = driveFile('g1')
    sync.start()
    await vi.advanceTimersByTimeAsync(0)
    sync.stop()
    const p = backend.pulls
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(300_000)
    expect(backend.pulls).toBe(p)
  })
})

describe('review fixes', () => {
  const tab = (data: EmberData = local()) => {
    setActivePinia(createPinia())
    const ember = useEmberStore()
    ember.replaceData(JSON.parse(JSON.stringify(data)))
    return { ember, sync: useSyncStore() }
  }

  it('a restore made while a sync is downloading wins, and is not undone', async () => {
    const { sync, ember, backend } = setup({ saved: connectedTo('g1') })
    backend.file = driveFile('g1')
    let release!: () => void
    backend.pullGate = new Promise<void>((r) => { release = r })
    const first = sync.syncNow()
    await Promise.resolve()
    ember.restore(dataFixture({ tasks: [taskFixture('Restored')] }))
    const second = sync.afterRestore()
    backend.pullGate = null
    release()
    await first
    await second
    const f = fileOf(backend)
    expect(f.generation).not.toBe('g1')
    expect(f.data.tasks.map((t) => t.id)).toEqual(['Restored'])
    expect(ember.tasks.map((t) => t.id)).toEqual(['Restored'])
  })

  it('a second tab with stale sync state neither re-adopts a generation nor overwrites the safety copy', async () => {
    const backend = new FakeBackend()
    backend.file = driveFile('g2')
    localStorage.setItem('ember:sync', JSON.stringify(connectedTo('g1')))
    provideSyncBackend(backend)
    const one = tab()
    const two = tab()
    await one.sync.syncNow()
    expect(localStorage.getItem(`${STORAGE_KEY}:before-restore`)).toContain('Here')
    two.ember.replaceData(JSON.parse(JSON.stringify(one.ember.snapshot())))
    await two.sync.syncNow()
    expect(localStorage.getItem(`${STORAGE_KEY}:before-restore`)).toContain('Here')
    expect(JSON.parse(localStorage.getItem('ember:sync')!).generation).toBe('g2')
  })

  it("a restore still waiting to upload in another tab goes up as a new generation, not a merge", async () => {
    const backend = new FakeBackend()
    backend.file = driveFile('g1')
    localStorage.setItem('ember:sync', JSON.stringify(connectedTo('g1')))
    provideSyncBackend(backend)
    const one = tab()
    const two = tab()
    one.ember.restore(dataFixture({ tasks: [taskFixture('Restored')] }))
    backend.failNext = new Error('Drive 500')
    await one.sync.afterRestore()
    two.ember.replaceData(JSON.parse(JSON.stringify(one.ember.snapshot())))
    await two.sync.syncNow()
    const f = fileOf(backend)
    expect(f.generation).not.toBe('g1')
    expect(f.data.tasks.map((t) => t.id)).toEqual(['Restored'])
  })

  it('a device whose saved data was unreadable asks first, instead of merging sample data into Drive', async () => {
    localStorage.setItem(STORAGE_KEY, 'garbage')
    localStorage.setItem('ember:sync', JSON.stringify(connectedTo('g1')))
    const backend = new FakeBackend()
    backend.file = driveFile('g1')
    provideSyncBackend(backend)
    setActivePinia(createPinia())
    useEmberStore()
    const sync = useSyncStore()
    await sync.syncNow()
    expect(sync.status).toBe('choose')
    expect(backend.pushes).toHaveLength(0)
  })

  it('leaves the first-connection choice alone while the app polls', async () => {
    const { sync, backend } = setup()
    backend.file = driveFile('g1')
    sync.start()
    await sync.connect()
    expect(sync.status).toBe('choose')
    const p = backend.pulls
    await vi.advanceTimersByTimeAsync(180_000)
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(sync.status).toBe('choose')
    expect(backend.pulls).toBe(p)
    sync.stop()
  })
})

describe('delete data', () => {
  it('everywhere: empties this device and starts a new, empty generation in Drive', async () => {
    const { sync, ember, backend } = setup({ saved: connectedTo('g1') })
    backend.file = driveFile('g1')
    await sync.eraseEverywhere()
    expect(ember.tasks).toEqual([])
    const f = fileOf(backend)
    expect(f.generation).not.toBe('g1')
    expect([f.data.goals, f.data.tasks, f.data.logs]).toEqual([[], [], []])
    expect(sync.status).toBe('synced')
  })

  it("on this device only: empties it and disconnects, leaving Drive's data alone", async () => {
    const { sync, ember, backend } = setup({ saved: connectedTo('g1') })
    backend.file = driveFile('g1')
    const before = backend.file
    await sync.eraseHere()
    expect(ember.tasks).toEqual([])
    expect(sync).toMatchObject({ status: 'signed-out', connected: false })
    const pulls = backend.pulls
    await sync.syncNow()
    expect(ember.tasks).toEqual([])
    expect([backend.pulls, backend.pushes.length]).toEqual([pulls, 0])
    expect(backend.file).toBe(before)
  })

  const gate = () => {
    let open!: () => void
    const p = new Promise<void>((r) => { open = r })
    return { p, open }
  }

  it('"Delete everywhere" clicked while a restore is still uploading wins', async () => {
    const { sync, ember, backend } = setup({ saved: connectedTo('g1') })
    backend.file = driveFile('g1')
    const g = gate()
    backend.pushGate = g.p
    ember.restore(dataFixture({ tasks: [taskFixture('Restored')] }))
    const restoring = sync.afterRestore()
    await Promise.resolve()
    const erasing = sync.eraseEverywhere()
    backend.pushGate = null
    g.open()
    await restoring
    await erasing
    const f = fileOf(backend)
    expect(f.data.tasks).toEqual([])
    expect(ember.tasks).toEqual([])
  })

  it('another tab syncing at the same moment does not undo "Delete everywhere"', async () => {
    const backend = new FakeBackend()
    backend.file = driveFile('g1')
    localStorage.setItem('ember:sync', JSON.stringify(connectedTo('g1')))
    provideSyncBackend(backend)
    const tab = () => {
      setActivePinia(createPinia())
      const ember = useEmberStore()
      ember.replaceData(local())
      return { ember, sync: useSyncStore() }
    }
    const a = tab()
    const b = tab()
    const g = gate()
    backend.pullGate = g.p
    const aSync = a.sync.syncNow()
    await Promise.resolve()
    backend.pullGate = null
    await b.sync.eraseEverywhere()
    a.ember.replaceData(JSON.parse(JSON.stringify(b.ember.snapshot())))
    g.open()
    await aSync
    const f = fileOf(backend)
    expect(f.generation).not.toBe('g1')
    expect([f.data.tasks, a.ember.tasks]).toEqual([[], []])
  })

  it('"Delete on this device only" during a sync ends signed out, not "Synced"', async () => {
    const { sync, ember, backend } = setup({ saved: connectedTo('g1') })
    backend.file = driveFile('g1')
    const g = gate()
    backend.pushGate = g.p
    const syncing = sync.syncNow()
    await vi.advanceTimersByTimeAsync(0)
    await sync.eraseHere()
    backend.pushGate = null
    g.open()
    await syncing
    expect(sync).toMatchObject({ status: 'signed-out', connected: false })
    expect(ember.tasks).toEqual([])
  })
})
