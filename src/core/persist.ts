import { repairGoal } from './goals'
import type { EmberData } from './model'
import { repairSettings } from './settings'
import { idleTimer } from './timer'

export const STORAGE_KEY = 'ember:v1'
/** Version of the saved data shape (also used in backup files). */
export const DATA_VERSION = 1
const VERSION = DATA_VERSION

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

const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0

/** Fill fields added since the data was saved, and repair hand-edited values that would break the timer. */
function normalize(d: EmberData): EmberData {
  const settings = repairSettings(d.settings ?? {})
  const base = idleTimer(settings.session, d.timer.phase === 'break' ? 'break' : 'focus')
  const t = { ...base, ...d.timer }
  const valid = positive(t.lengthSec) && positive(t.speed) && typeof t.leftSec === 'number' && Number.isFinite(t.leftSec)
  return { ...d, goals: d.goals.map(repairGoal), settings, timer: valid ? t : base }
}

/** Parse a stored JSON string; null when it isn't readable data of this version. */
export function parseStored(raw: string): EmberData | null {
  try {
    const parsed = JSON.parse(raw) as Stored
    if (parsed?.version !== VERSION || !isData(parsed.data)) return null
    return normalize(parsed.data)
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

/** localStorage, or undefined where touching it throws (blocked storage, sandboxed frames). */
export function defaultStorage(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

export function readData(storage: Storage | undefined = defaultStorage()): ReadResult {
  let raw: string | null = null
  try {
    raw = storage?.getItem(STORAGE_KEY) ?? null
  } catch {
    return { status: 'empty' }
  }
  if (!storage || !raw) return { status: 'empty' }
  const data = parseStored(raw)
  return data ? { status: 'ok', data } : { status: 'unreadable', backedUp: backup(storage, raw) }
}

export function loadData(storage: Storage | undefined = defaultStorage()): EmberData | null {
  const r = readData(storage)
  return r.status === 'ok' ? r.data : null
}

export function saveData(data: EmberData, storage: Storage | undefined = defaultStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, data } satisfies Stored))
  } catch {
    // Quota exceeded, private mode or blocked storage: keep running in memory.
  }
}

/** Keep the current data aside before a restore replaces it, in case the wrong file was picked. */
export function saveBeforeRestore(data: EmberData, storage: Storage | undefined = defaultStorage()): void {
  try {
    storage?.setItem(`${STORAGE_KEY}:before-restore`, JSON.stringify({ version: VERSION, data } satisfies Stored))
  } catch {
    // Storage full or blocked: the restore still goes ahead.
  }
}
