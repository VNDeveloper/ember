import { addDays, mondayOf, type ISODate } from './dates'
import { plural } from './format'
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
  const unchanged = Array.isArray(h.pauses) && pauses.length === rawPauses.length && (h.deletedOn == null || isDate(h.deletedOn))
    && targets.length === rawTargets.length && targets.every((t, i) => t === rawTargets[i])
  if (unchanged) return x as Habit
  const out: Habit = { targets, pauses }
  if (isDate(h.deletedOn)) out.deletedOn = h.deletedOn
  else if (h.deletedOn === null) out.deletedOn = null
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

export type WeekStatus = 'hit' | 'missed' | 'off' | 'current'
export interface HabitWeek { monday: ISODate; status: WeekStatus; doneDays: number; target: HabitTarget }

/** The target a week is judged by: the latest one starting on or before its Monday. */
const targetFor = (h: Habit, monday: ISODate): HabitTarget =>
  [...h.targets].reverse().find((t) => mondayOf(t.from) <= monday) ?? h.targets[0]

/** A pause [from, to) touches some day of the week (an open pause runs on; an empty one touches nothing). */
const pausedIn = (h: Habit, monday: ISODate): boolean => {
  const sunday = addDays(monday, 6)
  return h.pauses.some((p) => p.from <= sunday && (p.to === null || (p.to > monday && p.to > p.from)))
}

/** Every week from the habit's first Monday to this week, oldest first. */
export function habitWeeks(h: Habit, byDay: Map<ISODate, number>, today: ISODate): HabitWeek[] {
  const first = mondayOf(h.targets[0].from)
  const current = mondayOf(today)
  const weeks: HabitWeek[] = []
  for (let monday = first; monday <= current; monday = addDays(monday, 7)) {
    const target = targetFor(h, monday)
    let doneDays = 0
    for (let i = 0; i < 7; i++) {
      const d = addDays(monday, i)
      if (d > today) break
      if ((byDay.get(d) ?? 0) >= target.minutes) doneDays++
    }
    const hit = doneDays >= target.daysPerWeek
    // The first week is a fair start and a paused week costs nothing: neither counts nor breaks the streak.
    const status: WeekStatus = hit ? 'hit' : monday === current ? 'current' : monday === first || pausedIn(h, monday) ? 'off' : 'missed'
    weeks.push({ monday, status, doneDays, target })
  }
  return weeks
}

/** Weeks hit in a row up to now (off weeks and the open week are skipped), and the best such run. */
export function habitStreak(weeks: HabitWeek[]): { streak: number; best: number } {
  let best = 0
  let run = 0
  for (const w of weeks) {
    if (w.status === 'hit') best = Math.max(best, ++run)
    else if (w.status === 'missed') run = 0
  }
  let streak = 0
  for (let i = weeks.length - 1; i >= 0; i--) {
    const st = weeks[i].status
    if (st === 'hit') streak++
    else if (st === 'missed') break
  }
  return { streak, best }
}

export interface HabitDay { date: ISODate; label: string; state: 'done' | 'not' | 'future' }
export interface HabitView {
  minutes: number
  daysPerWeek: number
  todayMin: number
  todayDone: boolean
  days: HabitDay[]
  doneDays: number
  streak: number
  best: number
  recent: WeekStatus[]
  todayText: string
  daysText: string
  streakText: string
  targetText: string
}

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export const targetText = (minutes: number, daysPerWeek: number): string =>
  daysPerWeek === 7 ? `${minutes}m every day` : `${minutes}m on ${plural(daysPerWeek, 'day')} a week`

/** Everything the habit line and row show, or null when the goal has no live habit. */
export function habitView(goal: Goal, tasks: Task[], logs: FocusLog[], today: ISODate): HabitView | null {
  const h = liveHabit(goal)
  if (!h) return null
  const byDay = goalMinutesByDay(goal, tasks, logs)
  const weeks = habitWeeks(h, byDay, today)
  const { streak, best } = habitStreak(weeks)
  const monday = mondayOf(today)
  const { minutes, daysPerWeek } = targetFor(h, monday)
  const days = DAY_LABELS.map((label, i): HabitDay => {
    const date = addDays(monday, i)
    const state = date > today ? 'future' : (byDay.get(date) ?? 0) >= minutes ? 'done' : 'not'
    return { date, label, state }
  })
  const todayMin = Math.round(byDay.get(today) ?? 0)
  const doneDays = days.filter((d) => d.state === 'done').length
  return {
    minutes, daysPerWeek, todayMin, todayDone: todayMin >= minutes, days, doneDays, streak, best,
    recent: weeks.slice(-8).map((w) => w.status),
    todayText: `${todayMin} of ${minutes}m today`,
    daysText: `${doneDays} of ${plural(daysPerWeek, 'day')}`,
    streakText: streak ? plural(streak, 'week') : '–',
    targetText: targetText(minutes, daysPerWeek),
  }
}

/** A new target from this Monday; a second change in the same week replaces the first. */
export function withTarget(h: Habit, minutes: number, daysPerWeek: number, today: ISODate): Habit {
  const monday = mondayOf(today)
  const last = h.targets[h.targets.length - 1]
  // Saving the same target again changes nothing (no history entry, no sync write).
  if (last.minutes === minutes && last.daysPerWeek === daysPerWeek) return h
  const keep = mondayOf(last.from) === monday ? h.targets.slice(0, -1) : h.targets
  return { ...h, targets: [...keep, { minutes, daysPerWeek, from: monday }] }
}

export function newHabit(minutes: number, daysPerWeek: number, today: ISODate, paused: boolean): Habit {
  return { targets: [{ minutes, daysPerWeek, from: mondayOf(today) }], pauses: paused ? [{ from: today, to: null }] : [] }
}

/** Minutes 5–240 in steps of 5 (25 when not a number); days 1–7 (5 when not a number). */
export function clampHabit(minutes: number, daysPerWeek: number): { minutes: number; daysPerWeek: number } {
  const m = Number.isFinite(minutes) ? Math.round(minutes / 5) * 5 : 25
  const d = Number.isFinite(daysPerWeek) ? Math.round(daysPerWeek) : 5
  return { minutes: Math.min(240, Math.max(5, m)), daysPerWeek: Math.min(7, Math.max(1, d)) }
}
