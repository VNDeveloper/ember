import type { EmberData, FocusLog, Goal, Settings, Task } from './model'

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
