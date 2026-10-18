import type { ISODate } from './dates'
import type { FocusLog, Goal, Habit, HabitTarget, Task } from './model'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const isDate = (x: unknown): x is ISODate => typeof x === 'string' && ISO.test(x)
const inRange = (n: unknown, min: number, max: number): boolean => Number.isInteger(n) && (n as number) >= min && (n as number) <= max
const okTarget = (t: unknown): t is HabitTarget => {
  if (!t || typeof t !== 'object') return false
  const x = t as Record<string, unknown>
  return inRange(x.minutes, 5, 240) && inRange(x.daysPerWeek, 1, 7) && isDate(x.from)
}
const okPause = (p: unknown): p is Habit['pauses'][number] => {
  if (!p || typeof p !== 'object') return false
  const x = p as Record<string, unknown>
  return isDate(x.from) && (x.to === null || isDate(x.to))
}

/** A habit as saved or synced, made safe: bad targets and pauses dropped, targets oldest first; null if no target is left. */
export function repairHabit(x: unknown): Habit | null {
  if (!x || typeof x !== 'object') return null
  const h = x as Record<string, unknown>
  const rawTargets: unknown[] = Array.isArray(h.targets) ? h.targets : []
  const rawPauses: unknown[] = Array.isArray(h.pauses) ? h.pauses : []
  const targets = rawTargets.filter(okTarget).sort((a, b) => a.from.localeCompare(b.from))
  if (!targets.length) return null
  const pauses = rawPauses.filter(okPause)
  const unchanged = Array.isArray(h.pauses) && pauses.length === rawPauses.length
    && targets.length === rawTargets.length && targets.every((t, i) => t === rawTargets[i])
  if (unchanged) return x as Habit
  const out: Habit = { targets, pauses }
  if (isDate(h.deletedOn)) out.deletedOn = h.deletedOn
  return out
}

/** The goal's habit unless it was removed. */
export const liveHabit = (g: Goal): Habit | null => (g.habit && !g.habit.deletedOn ? g.habit : null)

/** Focus minutes per day on a goal: its steps and the tasks linked to it (deleted ones too: history is history). */
export function goalMinutesByDay(goal: Goal, tasks: Task[], logs: FocusLog[]): Map<ISODate, number> {
  const taskGoal = new Map(tasks.map((t) => [t.id, t.goalId]))
  const out = new Map<ISODate, number>()
  for (const l of logs) {
    const t = l.target
    if (!t) continue
    const mine = t.kind === 'step' ? t.goalId === goal.id : taskGoal.get(t.taskId) === goal.id
    if (mine) out.set(l.date, (out.get(l.date) ?? 0) + l.min)
  }
  return out
}
