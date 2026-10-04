import { LEVEL_COLORS, doneLevel, streakLength } from './activity'
import {
  addDays, dayLabel, dayOfYear, daysInYear, diffDays, fromISO, mondayOf, monthName, startOfYear, yearOf, type ISODate,
} from './dates'
import { fmtInt, fmtM, hash7, pad2 } from './format'
import { findStep, goalColor, goalStats } from './goals'
import type { FocusLog, Goal, Task } from './model'
import { targetTitle } from './selection'

export type HeatMode = 'focus' | 'done'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function focusByDay(logs: FocusLog[]): Map<ISODate, number> {
  const out = new Map<ISODate, number>()
  for (const l of logs) out.set(l.date, (out.get(l.date) ?? 0) + l.min)
  return out
}

export const focusLevel = (min: number): 0 | 1 | 2 | 3 | 4 =>
  min === 0 ? 0 : min <= 50 ? 1 : min <= 100 ? 2 : min <= 150 ? 3 : 4

export interface HeatCell { date: ISODate | null; color: string; isToday: boolean; future: boolean; tip: string }
export interface Stat { label: string; value: string; accent: boolean }
export interface HeatMapModel {
  year: number
  columns: number
  cells: HeatCell[]
  /** `col` is the 1-based grid line; line 1 holds the day labels. */
  months: { label: string; col: number }[]
  kicker: string
  title: string
  legendMore: string
  stats: Stat[]
}

const stat = (label: string, value: string, accent = false): Stat => ({ label, value, accent })

/** GitHub-style year grid: 7 rows (Sunday first), one column per week, leading blanks before 1 Jan. */
export function heatMap(mode: HeatMode, focus: Map<ISODate, number>, counts: Map<ISODate, number>, today: ISODate): HeatMapModel {
  const year = yearOf(today)
  const year0 = startOfYear(today)
  const days = daysInYear(year)
  const lead = fromISO(year0).getDay()
  const todayIdx = dayOfYear(today)
  const byFocus = mode === 'focus'
  const source = byFocus ? focus : counts

  const cells: HeatCell[] = Array.from({ length: lead }, () => ({ date: null, color: 'transparent', isToday: false, future: false, tip: '' }))
  const past: { date: ISODate; value: number }[] = []
  for (let i = 0; i < days; i++) {
    const date = addDays(year0, i)
    if (i > todayIdx) {
      cells.push({ date, color: 'transparent', isToday: false, future: true, tip: '' })
      continue
    }
    const value = source.get(date) ?? 0
    past.push({ date, value })
    cells.push({
      date,
      color: LEVEL_COLORS[byFocus ? focusLevel(value) : doneLevel(value)],
      isToday: i === todayIdx,
      future: false,
      tip: byFocus ? `${dayLabel(date)}: ${fmtM(value)}` : `${dayLabel(date)}: ${value} done`,
    })
  }

  const months = MONTHS.map((label, mi) => ({ label, col: 2 + Math.floor((dayOfYear(`${year}-${pad2(mi + 1)}-01`) + lead) / 7) }))
  const total = past.reduce((a, d) => a + d.value, 0)
  const month = today.slice(0, 7)
  const monthTotal = past.filter((d) => d.date.startsWith(month)).reduce((a, d) => a + d.value, 0)
  const best = past.reduce((a, d) => Math.max(a, d.value), 0)
  const streak = streakLength(source, today)

  return {
    year,
    columns: Math.ceil((lead + days) / 7),
    cells,
    months,
    kicker: byFocus ? 'Focus time · all goals and tasks' : 'Things done · tasks and goal steps',
    title: byFocus ? `${fmtInt(Math.round(total / 60))} hours focused in ${year}` : `${fmtInt(total)} things done in ${year}`,
    legendMore: byFocus ? 'More focus time' : 'More done',
    stats: byFocus
      ? [
          stat(monthName(today), fmtM(monthTotal)),
          stat('Best day', fmtM(best)),
          stat('Focus streak', `${streak}d`),
          stat('Daily average', fmtM(Math.round(total / (todayIdx + 1) / 5) * 5)),
        ]
      : [
          stat(monthName(today), fmtInt(monthTotal)),
          stat('Best day', fmtInt(best)),
          stat('Streak', `${streak}d`),
          stat('Active days', fmtInt(past.filter((d) => d.value > 0).length)),
        ],
  }
}

export interface Brick { kind: 'step' | 'task'; color: string; tip: string; date: ISODate }
export interface WallColumn { monday: ISODate; label: string; current: boolean; bricks: Brick[] }
export interface DoneWallModel {
  weeks: number
  columns: WallColumn[]
  height: number
  headline: string
  legend: { name: string; color: string }[]
  stats: Stat[]
}

const BRICK_ROW = 21

/** One column per week (Monday start, oldest left); finished steps are filled bricks, tasks outlined. */
export function doneWall(goals: Goal[], tasks: Task[], today: ISODate, wallWeeks: number): DoneWallModel {
  const weeks = Math.max(4, Math.min(26, Math.round(wallWeeks) || 12))
  const mon0 = mondayOf(today)
  const buckets: Brick[][] = Array.from({ length: weeks }, () => [])
  const place = (b: Brick) => {
    if (b.date > today) return
    const w = b.date >= mon0 ? 0 : Math.ceil(diffDays(mon0, b.date) / 7)
    if (w < weeks) buckets[w].push(b)
  }

  goals.forEach((g, gi) => g.milestones.forEach((m) => m.steps.forEach((s) => {
    if (s.doneOn) place({ kind: 'step', color: goalColor(gi), tip: `${g.title}: ${s.title}`, date: s.doneOn })
  })))
  for (const t of tasks) {
    if (!t.doneOn) continue
    const gi = t.goalId ? goals.findIndex((g) => g.id === t.goalId) : -1
    place({ kind: 'task', color: gi >= 0 ? goalColor(gi) : 'var(--color-text)', tip: `Task: ${t.title}`, date: t.doneOn })
  }
  for (const b of buckets) b.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0))

  const sizes = buckets.map((b) => b.length)
  // Like the day streak: an empty current week doesn't break the run yet.
  let inARow = 0
  for (let w = sizes[0] > 0 ? 0 : 1; w < weeks && sizes[w] > 0; w++) inARow++

  return {
    weeks,
    columns: buckets.map((_, i) => {
      const w = weeks - 1 - i
      const monday = addDays(mon0, -7 * w)
      return { monday, label: weeks <= 14 || w % 2 === 0 ? dayLabel(monday) : '', current: w === 0, bricks: buckets[w] }
    }),
    height: (Math.max(6, ...sizes) + 1) * BRICK_ROW,
    headline: `${fmtInt(sizes.reduce((a, n) => a + n, 0))} things finished`,
    legend: goals.map((g, gi) => ({ name: g.title, color: goalColor(gi) })),
    stats: [
      stat('This week', String(sizes[0]), true),
      stat('Best week', String(Math.max(...sizes))),
      stat('Weeks in a row', String(inARow)),
      stat('Milestones done', String(goals.reduce((a, g) => a + goalStats(g).milestonesDone, 0))),
    ],
  }
}

export interface LogEntry { key: string; kind: 'done' | 'focus'; text: string; src: string; when: string; hash: string }

interface RawEntry { key: string; kind: 'done' | 'focus'; date: ISODate; at: number; text: string; src: string }

/** Today's completions first, then newest day first; on the same day focus sessions (latest first) precede completions. */
export function activityLog(goals: Goal[], tasks: Task[], logs: FocusLog[], today: ISODate): LogEntry[] {
  const yesterday = addDays(today, -1)
  const when = (d: ISODate) => {
    if (d === today) return 'Today'
    if (d === yesterday) return 'Yesterday'
    return yearOf(d) === yearOf(today) ? dayLabel(d) : `${dayLabel(d)}, ${yearOf(d)}`
  }
  const taskSource = (t: Task) => {
    const g = t.goalId ? goals.find((x) => x.id === t.goalId) : undefined
    return g ? g.title : t.tag ? `Task · ${t.tag}` : 'Task'
  }

  const done: RawEntry[] = []
  for (const g of goals) for (const m of g.milestones) for (const s of m.steps) {
    if (s.doneOn) done.push({ key: `step:${s.id}`, kind: 'done', date: s.doneOn, at: 0, text: `Completed “${s.title}”`, src: g.title })
  }
  for (const t of tasks) {
    if (t.doneOn) done.push({ key: `task:${t.id}`, kind: 'done', date: t.doneOn, at: 0, text: `Completed task “${t.title}”`, src: taskSource(t) })
  }

  const focus: RawEntry[] = logs.map((l) => {
    const title = targetTitle(goals, tasks, l.target)
    let src = 'No step picked'
    if (l.target?.kind === 'step') {
      const loc = findStep(goals, l.target)
      if (loc) src = loc.goal.title
    } else if (l.target?.kind === 'task') {
      const taskId = l.target.taskId
      const t = tasks.find((x) => x.id === taskId)
      if (t) src = taskSource(t)
    }
    return { key: `log:${l.id}`, kind: 'focus', date: l.date, at: l.at, text: `Focused ${fmtM(l.min)} on “${title}”`, src }
  })

  const rest = [...done.filter((d) => d.date !== today), ...focus].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    if (a.kind !== b.kind) return a.kind === 'focus' ? -1 : 1
    return b.at - a.at
  })

  return [...done.filter((d) => d.date === today), ...rest].map((r) => ({
    key: r.key, kind: r.kind, text: r.text, src: r.src, when: when(r.date), hash: hash7(r.key),
  }))
}
