import type { EmberData } from './model'
import { DEFAULT_SETTINGS } from './model'

export const STORAGE_KEY = 'ember:v1'
const VERSION = 1

interface Stored { version: number; data: EmberData }

export type ReadResult =
  | { status: 'ok'; data: EmberData }
  | { status: 'empty' }
  /** backedUp=false: the original is still in place and must not be overwritten. */
  | { status: 'unreadable'; backedUp: boolean }

function isData(d: unknown): d is EmberData {
  if (!d || typeof d !== 'object') return false
  const x = d as Record<string, unknown>
  return Array.isArray(x.goals) && Array.isArray(x.tasks) && Array.isArray(x.logs) && !!x.timer && typeof x.timer === 'object'
}

/** Parse a stored JSON string; null when it isn't readable data of this version. */
export function parseStored(raw: string): EmberData | null {
  try {
    const parsed = JSON.parse(raw) as Stored
    if (parsed?.version !== VERSION || !isData(parsed.data)) return null
    return { ...parsed.data, settings: { ...DEFAULT_SETTINGS, ...parsed.data.settings } }
  } catch {
    return null
  }
}

/** Keep a copy of anything we can't read, so falling back to seed data never destroys it. */
function backup(storage: Storage, raw: string): boolean {
  try {
    storage.setItem(`${STORAGE_KEY}:corrupt:${Date.now()}`, raw)
    return true
  } catch {
    return false
  }
}

export function readData(storage: Storage | undefined = globalThis.localStorage): ReadResult {
  const raw = storage?.getItem(STORAGE_KEY)
  if (!storage || !raw) return { status: 'empty' }
  const data = parseStored(raw)
  return data ? { status: 'ok', data } : { status: 'unreadable', backedUp: backup(storage, raw) }
}

export function loadData(storage: Storage | undefined = globalThis.localStorage): EmberData | null {
  const r = readData(storage)
  return r.status === 'ok' ? r.data : null
}

export function saveData(data: EmberData, storage: Storage | undefined = globalThis.localStorage): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, data } satisfies Stored))
  } catch {
    // Quota exceeded or private mode: keep running in memory.
  }
}
