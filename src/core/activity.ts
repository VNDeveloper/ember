import { addDays, dayLabel, type ISODate } from './dates'
import type { Goal, Task } from './model'

/** Things done per day: finished tasks plus finished goal steps. */
export function doneByDay(goals: Goal[], tasks: Task[]): Map<ISODate, number> {
  const counts = new Map<ISODate, number>()
  const bump = (d: ISODate | null) => { if (d) counts.set(d, (counts.get(d) ?? 0) + 1) }
  for (const t of tasks) bump(t.doneOn)
  for (const g of goals) for (const m of g.milestones) for (const s of m.steps) bump(s.doneOn)
  return counts
}

/** Consecutive active days counting back from today, or from yesterday while today is still 0. */
export function streakLength(counts: Map<ISODate, number>, today: ISODate): number {
  let day = (counts.get(today) ?? 0) > 0 ? today : addDays(today, -1)
  let n = 0
  while ((counts.get(day) ?? 0) > 0) {
    n++
    day = addDays(day, -1)
  }
  return n
}

export const doneLevel = (count: number): 0 | 1 | 2 | 3 | 4 =>
  count === 0 ? 0 : count <= 2 ? 1 : count <= 4 ? 2 : count <= 6 ? 3 : 4

export const LEVEL_COLORS = [
  'var(--color-neutral-300)',
  'var(--color-accent-200)',
  'var(--color-accent-400)',
  'var(--color-accent)',
  'var(--color-accent-800)',
] as const

export interface DayCell { date: ISODate; count: number; color: string; isToday: boolean; tip: string }

/** The last n days ending today, oldest first (the 7-day streak strip). */
export function lastDays(counts: Map<ISODate, number>, today: ISODate, n = 7): DayCell[] {
  return Array.from({ length: n }, (_, i) => {
    const date = addDays(today, i - (n - 1))
    const count = counts.get(date) ?? 0
    return { date, count, color: LEVEL_COLORS[doneLevel(count)], isToday: date === today, tip: `${dayLabel(date)}: ${count} done` }
  })
}
