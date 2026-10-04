import type { ISODate } from './dates'
import type { EmberData } from './model'
import { DATA_VERSION, defaultStorage, parseStored } from './persist'

const LAST_BACKUP_KEY = 'ember:lastBackup'

export const backupFileName = (today: ISODate): string => `ember-backup-${today}.json`

/** A downloadable backup: everything Ember saves, tagged as an Ember file with its export time. */
export function makeBackup(data: EmberData, now: number): string {
  return JSON.stringify({ app: 'ember', version: DATA_VERSION, exportedAt: new Date(now).toISOString(), data }, null, 2)
}

export type BackupResult = { ok: true; data: EmberData; exportedAt: string | null } | { ok: false }

/** Checks a backup file's text; older data shapes are normalised the same way as normal loading. */
export function readBackup(text: string): BackupResult {
  try {
    const parsed = JSON.parse(text) as { app?: unknown; exportedAt?: unknown }
    if (parsed?.app !== 'ember') return { ok: false }
    const data = parseStored(text)
    if (!data) return { ok: false }
    return { ok: true, data, exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : null }
  } catch {
    return { ok: false }
  }
}

export function lastBackup(storage: Storage | undefined = defaultStorage()): ISODate | null {
  try {
    return storage?.getItem(LAST_BACKUP_KEY) ?? null
  } catch {
    return null
  }
}

export function rememberBackup(day: ISODate, storage: Storage | undefined = defaultStorage()): void {
  try {
    storage?.setItem(LAST_BACKUP_KEY, day)
  } catch {
    // Not critical: the menu just keeps showing the previous date.
  }
}
