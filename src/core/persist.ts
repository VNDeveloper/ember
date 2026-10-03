import type { EmberData } from './model'
import { DEFAULT_SETTINGS } from './model'

export const STORAGE_KEY = 'ember:v1'
const VERSION = 1

interface Stored { version: number; data: EmberData }

function isData(d: unknown): d is EmberData {
  if (!d || typeof d !== 'object') return false
  const x = d as Record<string, unknown>
  return Array.isArray(x.goals) && Array.isArray(x.tasks) && Array.isArray(x.logs) && !!x.timer && typeof x.timer === 'object'
}

/** Keep a copy of anything we can't read, so falling back to seed data never destroys it. */
function backup(storage: Storage, raw: string) {
  try {
    storage.setItem(`${STORAGE_KEY}:corrupt:${Date.now()}`, raw)
  } catch {
    // Storage full: nothing more we can do.
  }
}

export function loadData(storage: Storage | undefined = globalThis.localStorage): EmberData | null {
  if (!storage) return null
  const raw = storage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Stored
    if (parsed?.version !== VERSION || !isData(parsed.data)) {
      backup(storage, raw)
      return null
    }
    return { ...parsed.data, settings: { ...DEFAULT_SETTINGS, ...parsed.data.settings } }
  } catch {
    backup(storage, raw)
    return null
  }
}

export function saveData(data: EmberData, storage: Storage | undefined = globalThis.localStorage): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, data } satisfies Stored))
  } catch {
    // Quota exceeded or private mode: keep running in memory.
  }
}
