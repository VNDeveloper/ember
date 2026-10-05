import { dayLabel, todayISO } from './dates'
import { pad2, plural } from './format'
import { DEFAULT_SETTINGS, type EmberData, type FocusLog, type Goal, type SessionLength, type Settings, type Task } from './model'
import { DATA_VERSION } from './persist'

/** What never leaves this device. Moving timer/selection to shared later = removing them here (+ a merge rule). */
export const DEVICE_ONLY = {
  data: ['timer', 'selection', 'deviceUpdatedAt'],
  settings: ['muted', 'demo'],
} as const

type DeviceSettingKey = (typeof DEVICE_ONLY.settings)[number]
export type SharedSettings = Omit<Settings, DeviceSettingKey>
export interface SharedData { goals: Goal[]; tasks: Task[]; logs: FocusLog[]; settings: SharedSettings }

const without = (x: object, keys: readonly string[]): Record<string, unknown> =>
  Object.fromEntries(Object.entries(x).filter(([k]) => !keys.includes(k)))

export function sharedSettings(s: Settings | SharedSettings): SharedSettings {
  return without(s, DEVICE_ONLY.settings) as SharedSettings
}

export function sharedPart(d: EmberData): SharedData {
  return { goals: d.goals, tasks: d.tasks, logs: d.logs, settings: sharedSettings(d.settings) }
}

/** Shared data plus this device's own timer, selection, sound and demo speed. */
export function withDeviceState(shared: SharedData, local: EmberData): EmberData {
  const settings = { ...shared.settings } as Settings
  for (const k of DEVICE_ONLY.settings) (settings as unknown as Record<string, unknown>)[k] = local.settings[k]
  const out = { goals: shared.goals, tasks: shared.tasks, logs: shared.logs, settings } as EmberData
  for (const k of DEVICE_ONLY.data) (out as unknown as Record<string, unknown>)[k] = local[k]
  return out
}

/** JSON with object keys sorted (and undefined dropped), so equal content gives equal strings. */
export function canonical(x: unknown): string {
  return JSON.stringify(x, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  )
}

/** An item's own content: without its stamp and without its child list. */
const own = (x: object, child?: string): string => canonical(without(x, child ? ['updatedAt', child] : ['updatedAt']))
const changed = (prev: object | undefined, next: object, child?: string): boolean => !prev || own(prev, child) !== own(next, child)

/**
 * Sets updatedAt = now on every task, goal, milestone, step and shared-settings object in `after`
 * whose own content differs from `before` (new items included). Stamps deviceUpdatedAt when the
 * timer or selection changed. Mutates `after`; returns how many shared records were stamped.
 */
export function stampChanges(before: EmberData, after: EmberData, now: number): number {
  let n = 0
  const tasks = new Map(before.tasks.map((t) => [t.id, t]))
  for (const t of after.tasks) {
    if (changed(tasks.get(t.id), t)) { t.updatedAt = now; n++ }
  }
  const goals = new Map(before.goals.map((g) => [g.id, g]))
  for (const g of after.goals) {
    const pg = goals.get(g.id)
    if (changed(pg, g, 'milestones')) { g.updatedAt = now; n++ }
    const mss = new Map((pg?.milestones ?? []).map((m) => [m.id, m]))
    for (const m of g.milestones) {
      const pm = mss.get(m.id)
      if (changed(pm, m, 'steps')) { m.updatedAt = now; n++ }
      const steps = new Map((pm?.steps ?? []).map((s) => [s.id, s]))
      for (const s of m.steps) {
        if (changed(steps.get(s.id), s)) { s.updatedAt = now; n++ }
      }
    }
  }
  if (own(sharedSettings(before.settings)) !== own(sharedSettings(after.settings))) { after.settings.updatedAt = now; n++ }
  if (canonical([before.timer, before.selection]) !== canonical([after.timer, after.selection])) after.deviceUpdatedAt = now
  return n
}

type Stamped = { updatedAt?: number }
const stampOf = (x: Stamped): number => x.updatedAt ?? 0

/** Newer wins; equal stamps fall back to content, so every device picks the same copy. */
function newer<T extends Stamped>(a: T, b: T): T {
  if (stampOf(a) !== stampOf(b)) return stampOf(a) > stampOf(b) ? a : b
  return canonical(a) >= canonical(b) ? a : b
}

/** Drive's order first (the file is the hub, so devices converge on it), then items only this device has. */
function unionById<T extends { id: string }>(local: T[], remote: T[], pick: (l: T, r: T) => T): T[] {
  const mine = new Map(local.map((x) => [x.id, x]))
  const seen = new Set<string>()
  const out: T[] = []
  for (const r of remote) {
    const l = mine.get(r.id)
    out.push(l ? pick(l, r) : r)
    seen.add(r.id)
  }
  for (const l of local) if (!seen.has(l.id)) out.push(l)
  return out
}

/** An item's own fields from the newer copy; its children merged one by one. */
function mergeWithChildren<T extends Stamped, K extends keyof T>(l: T, r: T, child: K, mergeChildren: (a: T[K], b: T[K]) => T[K]): T {
  const strip = (x: T) => without(x, [child as string]) as T
  return { ...newer(strip(l), strip(r)), [child]: mergeChildren(l[child], r[child]) } as T
}

const mergeMilestone = (l: Goal['milestones'][number], r: Goal['milestones'][number]) =>
  mergeWithChildren(l, r, 'steps', (a, b) => unionById(a, b, newer))

const mergeGoal = (l: Goal, r: Goal): Goal =>
  mergeWithChildren(l, r, 'milestones', (a, b) => unionById(a, b, mergeMilestone))

/** Merge this device's shared data with Drive's: union by id at every level, newer updatedAt wins. */
export function mergeData(local: SharedData, remote: SharedData): SharedData {
  const logs = unionById(local.logs, remote.logs, (l) => l)
    .sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return {
    goals: unionById(local.goals, remote.goals, mergeGoal),
    tasks: unionById(local.tasks, remote.tasks, newer),
    logs,
    settings: newer(local.settings, remote.settings),
  }
}

/** The Drive file: the backup format, shared data only, plus the generation it belongs to. */
export function makeSyncFile(shared: SharedData, generation: string, now: number): string {
  return JSON.stringify({ app: 'ember', version: DATA_VERSION, exportedAt: new Date(now).toISOString(), generation, data: shared })
}

export type SyncFileResult = { ok: true; generation: string; exportedAt: string | null; data: SharedData } | { ok: false }

const SESSIONS: SessionLength[] = ['25/5', '50/10']

export function readSyncFile(text: string): SyncFileResult {
  try {
    const f = JSON.parse(text) as { app?: unknown; version?: unknown; generation?: unknown; exportedAt?: unknown; data?: Partial<SharedData> }
    const d = f?.data
    if (f?.app !== 'ember' || f.version !== DATA_VERSION || typeof f.generation !== 'string' || !f.generation) return { ok: false }
    if (!d || !Array.isArray(d.goals) || !Array.isArray(d.tasks) || !Array.isArray(d.logs)) return { ok: false }
    const settings = sharedSettings({ ...DEFAULT_SETTINGS, ...(d.settings ?? {}) } as Settings)
    if (!SESSIONS.includes(settings.session)) settings.session = DEFAULT_SETTINGS.session
    return {
      ok: true,
      generation: f.generation,
      exportedAt: typeof f.exportedAt === 'string' ? f.exportedAt : null,
      data: { goals: d.goals, tasks: d.tasks, logs: d.logs, settings },
    }
  } catch {
    return { ok: false }
  }
}

export const syncSummary = (s: SharedData): string =>
  `${plural(s.goals.filter((g) => !g.deletedOn).length, 'goal')} · ${plural(s.tasks.filter((t) => !t.deletedOn).length, 'task')} · ${plural(s.logs.length, 'focus session')}`

/** "just now", "3 min ago", "at 14:05" (earlier today) or "on Sep 16". */
export function syncedAgo(last: number, now: number): string {
  const min = Math.floor((now - last) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  if (todayISO(last) === todayISO(now)) {
    const d = new Date(last)
    return `at ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  }
  return `on ${dayLabel(todayISO(last))}`
}
