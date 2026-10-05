import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { dayLabel, todayISO } from '../core/dates'
import { uid } from '../core/ids'
import { defaultStorage } from '../core/persist'
import { canonical, makeSyncFile, mergeData, readSyncFile, sharedPart, syncSummary, type SharedData } from '../core/sync'
import { SyncAuthError, SyncOfflineError, type SyncBackend } from '../sync/backend'
import { createDriveBackend } from '../sync/drive'
import { useEmberStore } from './ember'

export type SyncStatus = 'unconfigured' | 'signed-out' | 'choose' | 'syncing' | 'synced' | 'offline' | 'needs-reconnect' | 'error' | 'unreadable'

const STATE_KEY = 'ember:sync'
const RETRY_MS = [60_000, 300_000, 900_000]

interface SavedState { connected: boolean; generation: string | null; lastSyncedAt: number | null; newGeneration: boolean }
const EMPTY: SavedState = { connected: false, generation: null, lastSyncedAt: null, newGeneration: false }

function readState(): SavedState {
  try {
    const raw = defaultStorage()?.getItem(STATE_KEY)
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<SavedState>) } : { ...EMPTY }
  } catch {
    return { ...EMPTY }
  }
}
function writeState(s: SavedState) {
  try { defaultStorage()?.setItem(STATE_KEY, JSON.stringify(s)) } catch { /* not critical */ }
}

let backendOverride: SyncBackend | null | undefined
/** Tests and future backends supply the backend; undefined = Google Drive when a client ID is configured. */
export function provideSyncBackend(b: SyncBackend | null | undefined): void { backendOverride = b }
function makeBackend(): SyncBackend | null {
  if (backendOverride !== undefined) return backendOverride
  const id = import.meta.env.VITE_GOOGLE_CLIENT_ID
  return id ? createDriveBackend(id) : null
}

export const useSyncStore = defineStore('sync', () => {
  const ember = useEmberStore()
  const backend = makeBackend()
  const saved = readState()

  const connected = ref(!!backend && saved.connected)
  const generation = ref(saved.generation)
  const newGeneration = ref(saved.newGeneration)
  const lastSyncedAt = ref(saved.lastSyncedAt)
  const status = ref<SyncStatus>(!backend ? 'unconfigured' : connected.value ? 'synced' : 'signed-out')
  const pendingFile = ref<{ generation: string; data: SharedData } | null>(null)
  const choice = ref<{ summary: string; from: string | null } | null>(null)
  const configured = computed(() => !!backend)
  const needsAttention = computed(() => ['needs-reconnect', 'error', 'unreadable'].includes(status.value))

  let failures = 0
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let running: Promise<void> | null = null
  let again = false
  /** Shared data as last agreed with Drive; local edits make the current data differ from it. */
  let syncedSig = ''

  const save = () => writeState({ connected: connected.value, generation: generation.value, lastSyncedAt: lastSyncedAt.value, newGeneration: newGeneration.value })
  const localShared = () => sharedPart(ember.snapshot())
  const hasLocalChanges = () => canonical(localShared()) !== syncedSig

  function synced(sig: string) {
    syncedSig = sig
    lastSyncedAt.value = Date.now()
    failures = 0
    status.value = 'synced'
    save()
  }

  async function pushShared(shared: SharedData) {
    await backend!.push(makeSyncFile(shared, generation.value!, Date.now()))
  }

  /** One round: pull, then upload a pending new generation, adopt Drive's, or merge. */
  async function once() {
    if (newGeneration.value) {
      const shared = localShared()
      await pushShared(shared)
      newGeneration.value = false
      synced(canonical(shared))
      return
    }
    const pulled = await backend!.pull()
    if (!pulled) {
      // Drive is empty: this device's data starts the first generation.
      generation.value = uid()
      const shared = localShared()
      await pushShared(shared)
      synced(canonical(shared))
      return
    }
    const file = readSyncFile(pulled.text)
    if (!file.ok) {
      status.value = 'unreadable'
      return
    }
    if (generation.value === null) {
      pendingFile.value = { generation: file.generation, data: file.data }
      choice.value = { summary: syncSummary(file.data), from: file.exportedAt ? dayLabel(todayISO(Date.parse(file.exportedAt))) : null }
      status.value = 'choose'
      return
    }
    if (file.generation !== generation.value) {
      // Someone restored or replaced Drive on purpose: adopt it rather than merge.
      ember.applyShared(file.data, { safetyCopy: true })
      generation.value = file.generation
      synced(canonical(file.data))
      return
    }
    // Merge and apply in one synchronous step, so an edit made during the upload stays local (and unsynced).
    const merged = mergeData(localShared(), file.data)
    const sig = canonical(merged)
    if (sig !== canonical(localShared())) ember.applyShared(merged)
    if (sig !== canonical(file.data)) await pushShared(merged)
    synced(sig)
  }

  function fail(e: unknown) {
    if (e instanceof SyncAuthError) {
      status.value = 'needs-reconnect'
      return
    }
    if (e instanceof SyncOfflineError || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      status.value = 'offline'
      return
    }
    status.value = 'error'
    const delay = RETRY_MS[Math.min(failures, RETRY_MS.length - 1)]
    failures++
    clearTimeout(retryTimer)
    retryTimer = setTimeout(() => { void syncNow() }, delay)
  }

  /** Runs one sync at a time; a call during a run queues exactly one more. */
  async function syncNow(): Promise<void> {
    if (!backend || !connected.value) return
    if (running) {
      again = true
      return running
    }
    running = (async () => {
      do {
        again = false
        clearTimeout(retryTimer)
        status.value = 'syncing'
        try {
          await once()
        } catch (e) {
          fail(e)
          again = false
        }
      } while (again)
    })()
    try {
      await running
    } finally {
      running = null
    }
  }

  /** From a click: may open Google's sign-in. */
  async function connect() {
    if (!backend) return
    const r = await backend.connect(true)
    if (r !== 'ok') {
      status.value = connected.value ? 'needs-reconnect' : 'signed-out'
      return
    }
    connected.value = true
    save()
    await syncNow()
  }

  function useDriveData() {
    const f = pendingFile.value
    if (!f) return
    ember.applyShared(f.data, { safetyCopy: true })
    generation.value = f.generation
    pendingFile.value = null
    choice.value = null
    synced(canonical(f.data))
  }

  /** Start a new generation from this device's data (restore, or "Replace Drive"). */
  async function startNewGeneration() {
    if (!backend || !connected.value) return
    pendingFile.value = null
    choice.value = null
    generation.value = uid()
    newGeneration.value = true
    save()
    await syncNow()
  }

  async function disconnect() {
    clearTimeout(retryTimer)
    await backend?.disconnect()
    connected.value = false
    generation.value = null
    newGeneration.value = false
    pendingFile.value = null
    choice.value = null
    status.value = backend ? 'signed-out' : 'unconfigured'
    save()
  }

  return {
    status, lastSyncedAt, choice, connected, configured, needsAttention,
    connect, reconnect: connect, syncNow, useDriveData, replaceDrive: startNewGeneration, cancelChoice: disconnect,
    disconnect, afterRestore: startNewGeneration,
    // Used by the triggers (Task 7).
    hasLocalChanges,
  }
})
