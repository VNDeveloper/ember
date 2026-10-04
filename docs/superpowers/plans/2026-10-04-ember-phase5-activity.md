# Ember Phase 5 — Activity View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Activity tab: the switchable year heat map (focus time / things done) with its stats row, the done wall, and the paged activity log — replacing the last placeholder.

**Architecture:** A pure `src/core/activityView.ts` derives everything — per-day focus minutes, heat-map cells/month labels/title/stats, done-wall columns and stats, and the activity log entries — reusing `doneByDay`, `streakLength`, `doneLevel` and `LEVEL_COLORS` from `activity.ts`. Components in `src/components/activity/` render it. The heat-map mode and log page size live in the non-persisted UI store; `showFuture` and `wallWeeks` come from persisted settings.

**Tech Stack:** Vue 3.5 `<script setup>`, Pinia 4, lucide-vue-next, Vitest 5 + jsdom + @vue/test-utils.

**Spec:** `docs/design/handoff.md` §View 3 — Activity; prototype `docs/design/reference/Ember.dc.html` markup lines 230–285, logic lines 616–630 and 676–716.

## Global Constraints

- Zero border radius; 2px rules between major sections, 1px between list rows; button labels flush left; red accent sparingly (paragraph-size accent text = accent-700); no gradients, no emoji, no shadows except the picker dialog.
- Shared classes from `src/styles/`: `.btn*`, `.seg`, `.kicker`, `.label`, `.tabular`, `.muted`, `.view`.
- Copy is exact: "Focus time · all goals and tasks", "{h} hours focused in {year}", "Things done · tasks and goal steps", "{n} things done in {year}", "Focus time | Things done", "Mon / Wed / Fri", month abbreviations, "Less", "More focus time", "More done", "{Month}", "Best day", "Focus streak", "Daily average", "Streak", "Active days", "{n}d", "Done wall · last {n} weeks", "{n} things finished", "Tasks", "This week", "Best week", "Weeks in a row", "Milestones done", "Activity log", "Completed “…”", "Completed task “…”", "Focused 25m on “…”", "Today", "Yesterday", "Sep 16", "No step picked", "Unassigned", "Show earlier".
- Heat-map levels — focus minutes: 0, ≤50, ≤100, ≤150, more; things done: 0, 1–2, 3–4, 5–6, 7+; colours `LEVEL_COLORS` (neutral-300, accent-200, accent-400, accent, accent-800).
- The heat map fits the width and never scrolls; max-width 1100px.
- Reflows to ~360px with no horizontal page scroll.
- `src/core/` must not import `vue` or `pinia`.

## Decisions taken in this plan (tell the user)

1. **Real data everywhere.** The prototype's heat map used fake history arrays; here focus minutes come from focus logs and "things done" from `doneOn`. The seeded year therefore looks like the prototype's.
2. **The done wall shows every finished task**, not only tasks finished today (the prototype only had today's tasks as data). With the seeded history the wall is taller than the prototype's; its height still follows the spec formula.
3. **"{n} things finished" counts what's on the wall** (the last N weeks), matching the kicker "Done wall · last 12 weeks".
4. **Activity log order:** today's completions first, then everything else newest first by day, with focus sessions before completions on the same day (the prototype listed *all* focus sessions before older completions, which with real history would bury every completion).
5. **Log hashes are stable per entry** (derived from the entry's id), not from its list position.
6. **Year view:** the heat map and its totals cover the current calendar year; streaks still count back across New Year.
7. **Narrow screens (≤860px):** done wall and log stack; ≤560px the stats rows go 2×2 and heat-map gaps shrink to 1px.
8. **The today-cell pop and brick drop animations are left to Phase 7.**

## Review Focus

1. **A year that needs 54 columns** (2028: starts on a Saturday and is a leap year): the grid gets 54 columns and every day appears once. Pinned in Task 1 (`lays out a leap year starting on Saturday`).
2. **New Year's Day:** the heat map shows the new year with zero totals ("0 hours focused in 2027", "0m" best day) and the streak still counts back into December. Pinned in Task 1 (`starts a new year empty but keeps the streak`).
3. **Focus logged to nothing, or to an item that no longer exists:** the log says “Unassigned” / "No step picked" instead of crashing. Pinned in Task 1 (`orders the log…`).
4. **A hand-edited `wallWeeks` outside 4–26** (or not a number): the wall clamps to 4–26 weeks (default 12). Pinned in Task 1 (`clamps the number of weeks`).
5. **Hundreds of history entries:** the log renders 10 at a time and "Show earlier" disappears once everything is shown. Pinned in Task 4 (`pages the log…`).

---

## File structure

```
src/
  core/
    activityView.ts / activityView.test.ts   focusByDay, focusLevel, heatMap, doneWall, activityLog
  stores/
    ui.ts                                    + heatMode, feedSize (ui.test.ts extended)
  components/
    activity/
      HeatMap.vue / HeatMap.test.ts
      DoneWall.vue / DoneWall.test.ts
      ActivityLog.vue / ActivityLog.test.ts
      ActivityView.vue
  App.vue                                    renders ActivityView; placeholder removed
  App.test.ts                                Activity tab test
```

---

### Task 1: Activity derivations (core)

**Files:**
- Create: `src/core/activityView.ts`
- Test: `src/core/activityView.test.ts`

**Interfaces:**
- Consumes: `addDays`, `dayLabel`, `dayOfYear`, `daysInYear`, `diffDays`, `fromISO`, `mondayOf`, `monthName`, `startOfYear`, `yearOf`, `ISODate` (dates.ts); `fmtInt`, `fmtM`, `hash7`, `pad2` (format.ts); `LEVEL_COLORS`, `doneLevel`, `streakLength` (activity.ts); `goalColor`, `goalStats` (goals.ts); `targetTitle` (selection.ts); model types.
- Produces: `type HeatMode = 'focus' | 'done'`; `focusByDay(logs): Map<ISODate, number>`; `focusLevel(min): 0|1|2|3|4`; `interface HeatCell { date: ISODate | null; color: string; isToday: boolean; future: boolean; tip: string }`; `interface Stat { label: string; value: string; accent: boolean }`; `interface HeatMapModel { year; columns; cells: HeatCell[]; months: { label: string; col: number }[]; kicker; title; legendMore; stats: Stat[] }`; `heatMap(mode, focus, counts, today): HeatMapModel` (cells: leading blanks with `date: null`, then every day of the year; `col` is the 1-based CSS grid line, day labels occupy line 1); `interface Brick { kind: 'step' | 'task'; color; tip; date }`; `interface WallColumn { monday; label; current: boolean; bricks: Brick[] }` (bricks oldest first); `interface DoneWallModel { weeks; columns: WallColumn[] (oldest left); height: number (px); headline; legend: { name; color }[]; stats: Stat[] }`; `doneWall(goals, tasks, today, wallWeeks): DoneWallModel`; `interface LogEntry { key; kind: 'done' | 'focus'; text; src; when; hash }`; `activityLog(goals, tasks, logs, today): LogEntry[]`.

- [ ] **Step 1: Write the failing test**

`src/core/activityView.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { doneByDay } from './activity'
import { activityLog, doneWall, focusByDay, focusLevel, heatMap } from './activityView'
import type { FocusLog } from './model'
import { goalFixture, logFixture, stepRef, taskFixture } from './test-fixtures'

const TODAY = '2026-09-23'
const goals = [goalFixture('D3', [['M', [['A', '2026-09-22'], ['B', '2026-09-10'], ['C', null]]]])]
const tasks = [
  taskFixture('t1', { doneOn: TODAY }),
  taskFixture('t2', { goalId: 'D3', tag: '', doneOn: '2026-09-21' }),
  taskFixture('t3'),
]
const A = stepRef('D3', 'M', 'A')
const logs: FocusLog[] = [
  logFixture(TODAY, A, 50),
  logFixture('2026-09-22', A, 100),
  logFixture('2026-01-05', null, 25),
]
const focus = focusByDay(logs)
const counts = doneByDay(goals, tasks)

describe('focusByDay and levels', () => {
  it('sums focus minutes per day', () => {
    expect(focus.get(TODAY)).toBe(50)
    expect(focus.get('2026-09-22')).toBe(100)
    expect(focus.size).toBe(3)
  })

  it('buckets minutes 0, ≤50, ≤100, ≤150, more', () => {
    expect([0, 25, 50, 75, 100, 125, 150, 175].map(focusLevel)).toEqual([0, 1, 1, 2, 2, 3, 3, 4])
  })
})

describe('heatMap', () => {
  it('lays out the year Sunday-first with leading blanks and month columns', () => {
    const hm = heatMap('focus', focus, counts, TODAY)
    expect(hm.year).toBe(2026)
    expect(hm.columns).toBe(53)
    expect(hm.cells).toHaveLength(4 + 365)
    expect(hm.cells.slice(0, 4).every((c) => c.date === null)).toBe(true)
    expect(hm.cells[4].date).toBe('2026-01-01')
    expect(hm.months[0]).toEqual({ label: 'Jan', col: 2 })
    expect(hm.months[1]).toEqual({ label: 'Feb', col: 7 })
    expect(hm.months[8]).toEqual({ label: 'Sep', col: 37 })
  })

  it('colours focus minutes, rings today and leaves future days empty', () => {
    const hm = heatMap('focus', focus, counts, TODAY)
    const at = (d: string) => hm.cells.find((c) => c.date === d)!
    expect(at(TODAY)).toEqual({ date: TODAY, color: 'var(--color-accent-200)', isToday: true, future: false, tip: 'Sep 23: 50m' })
    expect(at('2026-09-22').color).toBe('var(--color-accent-400)')
    expect(at('2026-09-20')).toMatchObject({ color: 'var(--color-neutral-300)', isToday: false })
    expect(at('2026-09-24')).toEqual({ date: '2026-09-24', color: 'transparent', isToday: false, future: true, tip: '' })
  })

  it('titles and stats for focus time', () => {
    const hm = heatMap('focus', focus, counts, TODAY)
    expect(hm.kicker).toBe('Focus time · all goals and tasks')
    expect(hm.title).toBe('3 hours focused in 2026')
    expect(hm.legendMore).toBe('More focus time')
    expect(hm.stats.map((s) => [s.label, s.value])).toEqual([
      ['September', '2h 30m'], ['Best day', '1h 40m'], ['Focus streak', '2d'], ['Daily average', '0m'],
    ])
  })

  it('titles and stats for things done', () => {
    const hm = heatMap('done', focus, counts, TODAY)
    expect(hm.kicker).toBe('Things done · tasks and goal steps')
    expect(hm.title).toBe('4 things done in 2026')
    expect(hm.legendMore).toBe('More done')
    expect(hm.cells.find((c) => c.date === TODAY)).toMatchObject({ color: 'var(--color-accent-200)', tip: 'Sep 23: 1 done' })
    expect(hm.stats.map((s) => [s.label, s.value])).toEqual([
      ['September', '4'], ['Best day', '1'], ['Streak', '3d'], ['Active days', '4'],
    ])
  })

  it('lays out a leap year starting on Saturday', () => {
    const hm = heatMap('done', new Map(), new Map(), '2028-06-01')
    expect(hm.columns).toBe(54)
    expect(hm.cells).toHaveLength(6 + 366)
    expect(hm.cells.filter((c) => c.date).length).toBe(366)
  })

  it('starts a new year empty but keeps the streak', () => {
    const f = new Map([['2026-12-31', 50], ['2026-12-30', 25]])
    const hm = heatMap('focus', f, new Map(), '2027-01-01')
    expect(hm.title).toBe('0 hours focused in 2027')
    expect(hm.stats.map((s) => s.value)).toEqual(['0m', '0m', '2d', '0m'])
    expect(hm.stats[0].label).toBe('January')
  })
})

describe('doneWall', () => {
  it('stacks finished steps and tasks into weekly columns, oldest left', () => {
    const wall = doneWall(goals, tasks, TODAY, 4)
    expect(wall.weeks).toBe(4)
    expect(wall.columns.map((c) => [c.monday, c.label, c.current, c.bricks.length])).toEqual([
      ['2026-08-31', 'Aug 31', false, 0],
      ['2026-09-07', 'Sep 7', false, 1],
      ['2026-09-14', 'Sep 14', false, 0],
      ['2026-09-21', 'Sep 21', true, 3],
    ])
    expect(wall.columns[3].bricks).toEqual([
      { kind: 'task', color: 'var(--color-accent)', tip: 'Task: t2', date: '2026-09-21' },
      { kind: 'step', color: 'var(--color-accent)', tip: 'D3: A', date: '2026-09-22' },
      { kind: 'task', color: 'var(--color-text)', tip: 'Task: t1', date: TODAY },
    ])
  })

  it('sizes the chart and fills in the headline, legend and stats', () => {
    const wall = doneWall(goals, tasks, TODAY, 4)
    expect(wall.height).toBe(147)
    expect(wall.headline).toBe('4 things finished')
    expect(wall.legend).toEqual([{ name: 'D3', color: 'var(--color-accent)' }])
    expect(wall.stats).toEqual([
      { label: 'This week', value: '3', accent: true },
      { label: 'Best week', value: '3', accent: false },
      { label: 'Weeks in a row', value: '1', accent: false },
      { label: 'Milestones done', value: '0', accent: false },
    ])
  })

  it('clamps the number of weeks and thins labels on long walls', () => {
    expect(doneWall(goals, tasks, TODAY, 30).columns).toHaveLength(26)
    expect(doneWall(goals, tasks, TODAY, 2).columns).toHaveLength(4)
    expect(doneWall(goals, tasks, TODAY, Number.NaN).columns).toHaveLength(12)
    const long = doneWall(goals, tasks, TODAY, 16)
    expect(long.columns[0].label).toBe('')
    expect(long.columns[1].label).toBe('Jun 15')
  })
})

describe('activityLog', () => {
  it("orders the log: today's completions, then newest first with focus before completions", () => {
    const at = (d: string, h: number) => new Date(`${d}T${String(h).padStart(2, '0')}:00:00`).getTime()
    const entries = activityLog(goals, tasks, [
      { id: 'l1', at: at(TODAY, 10), date: TODAY, min: 25, target: A },
      { id: 'l2', at: at('2026-09-22', 9), date: '2026-09-22', min: 25, target: { kind: 'task', taskId: 't1' } },
      { id: 'l3', at: at('2026-09-22', 11), date: '2026-09-22', min: 25, target: null },
      { id: 'l4', at: at('2026-09-22', 8), date: '2026-09-22', min: 50, target: { kind: 'task', taskId: 'gone' } },
    ], TODAY)
    expect(entries.map((e) => [e.kind, e.text, e.src, e.when])).toEqual([
      ['done', 'Completed task “t1”', 'Task · Work', 'Today'],
      ['focus', 'Focused 25m on “A”', 'D3', 'Today'],
      ['focus', 'Focused 25m on “Unassigned”', 'No step picked', 'Yesterday'],
      ['focus', 'Focused 25m on “t1”', 'Task · Work', 'Yesterday'],
      ['focus', 'Focused 50m on “Unassigned”', 'No step picked', 'Yesterday'],
      ['done', 'Completed “A”', 'D3', 'Yesterday'],
      ['done', 'Completed task “t2”', 'D3', 'Sep 21'],
      ['done', 'Completed “B”', 'D3', 'Sep 10'],
    ])
    expect(entries.every((e) => /^[0-9a-f]{7}$/.test(e.hash))).toBe(true)
    expect(new Set(entries.map((e) => e.key)).size).toBe(entries.length)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/core/activityView.test.ts`
Expected: FAIL — cannot resolve `./activityView`.

- [ ] **Step 3: Write `src/core/activityView.ts`**

```ts
import { LEVEL_COLORS, doneLevel, streakLength } from './activity'
import {
  addDays, dayLabel, dayOfYear, daysInYear, diffDays, fromISO, mondayOf, monthName, startOfYear, yearOf, type ISODate,
} from './dates'
import { fmtInt, fmtM, hash7, pad2 } from './format'
import { goalColor, goalStats } from './goals'
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
  let inARow = 0
  while (inARow < weeks && sizes[inARow] > 0) inARow++

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
  const when = (d: ISODate) => (d === today ? 'Today' : d === yesterday ? 'Yesterday' : dayLabel(d))
  const taskSource = (t: Task) => {
    const g = t.goalId ? goals.find((x) => x.id === t.goalId) : undefined
    return g ? g.title : `Task · ${t.tag}`
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
    if (title !== 'Unassigned' && l.target) {
      if (l.target.kind === 'step') {
        const goalId = l.target.goalId
        src = goals.find((g) => g.id === goalId)?.title ?? src
      } else {
        const taskId = l.target.taskId
        const t = tasks.find((x) => x.id === taskId)
        if (t) src = taskSource(t)
      }
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): derive heat map, done wall and activity log"
```

---

### Task 2: UI state for the Activity tab

**Files:**
- Modify: `src/stores/ui.ts`, `src/stores/ui.test.ts`

**Interfaces:**
- Consumes: `HeatMode` (activityView.ts).
- Produces on `useUiStore()`: `heatMode` (ref `HeatMode`, default `'focus'`), `feedSize` (ref number, default `10`).

- [ ] **Step 1: Write the failing test** — append inside `describe('ui store', …)` in `src/stores/ui.test.ts`:

```ts
  it('holds Activity-tab state', () => {
    const ui = useUiStore()
    expect(ui.heatMode).toBe('focus')
    expect(ui.feedSize).toBe(10)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/stores/ui.test.ts`
Expected: FAIL — `heatMode` is undefined.

- [ ] **Step 3: Extend `src/stores/ui.ts`**

Add `import type { HeatMode } from '../core/activityView'`, then after `goalTasksAll`:
```ts
  /** Activity: heat map shows focus time or things done. */
  const heatMode = ref<HeatMode>('focus')
  /** Activity: how many log entries are shown ("Show earlier" adds 10). */
  const feedSize = ref(10)
```
and add `heatMode, feedSize,` to the returned object.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(store): add Activity-tab UI state"
```

---

### Task 3: Heat map

**Files:**
- Create: `src/components/activity/HeatMap.vue`
- Test: `src/components/activity/HeatMap.test.ts`

**Interfaces:**
- Consumes: `heatMap`, `focusByDay` (activityView.ts); `doneByDay`, `LEVEL_COLORS` (activity.ts); store `goals`, `tasks`, `logs`, `today`, `settings.showFuture`; `ui.heatMode`.
- Produces: `<HeatMap />`. CSS hooks: `.hm-kicker`, `.hm-title`, `.seg-opt input` (Focus time, Things done), `.hm-months span`, `.hm-day`, `.hm-cell`, `.is-today`, `.is-future`, `.hm-legend`, `.hm-stat`, `.hm-stat-value`.

- [ ] **Step 1: Write the failing test**

`src/components/activity/HeatMap.test.ts`:
```ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../core/model'
import { dataFixture, goalFixture, logFixture, stepRef, taskFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import HeatMap from './HeatMap.vue'

const TODAY = '2026-09-23'

function setup(showFuture = true) {
  setActivePinia(createPinia())
  useEmberStore().replaceData(dataFixture({
    goals: [goalFixture('D3', [['M', [['A', '2026-09-22']]]])],
    tasks: [taskFixture('t1', { doneOn: TODAY })],
    logs: [logFixture(TODAY, stepRef('D3', 'M', 'A'), 50), logFixture('2026-09-22', null, 100)],
    settings: { ...DEFAULT_SETTINGS, showFuture },
  }))
  return mount(HeatMap)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('HeatMap', () => {
  it('shows focus time by default', () => {
    const w = setup()
    expect(w.find('.hm-kicker').text()).toBe('Focus time · all goals and tasks')
    expect(w.find('.hm-title').text()).toBe('3 hours focused in 2026')
    expect(w.find('.hm-legend').text()).toBe('LessMore focus time')
    expect(w.findAll('.hm-stat').map((s) => s.text())).toEqual(['September2h 30m', 'Best day1h 40m', 'Focus streak2d', 'Daily average0m'])
  })

  it('draws every day of the year with day and month labels', () => {
    const w = setup()
    expect(w.findAll('.hm-cell')).toHaveLength(4 + 365)
    expect(w.findAll('.hm-day').map((d) => d.text())).toEqual(['Mon', 'Wed', 'Fri'])
    expect(w.findAll('.hm-months span')).toHaveLength(12)
    expect(w.find('.hm-months span').attributes('style')).toContain('grid-column: 2 / span 4')
    const today = w.find('.hm-cell.is-today')
    expect(today.attributes('title')).toBe('Sep 23: 50m')
    expect(today.attributes('style')).toContain('var(--color-accent-200)')
  })

  it('outlines future days only when the setting is on', () => {
    expect(setup(true).findAll('.hm-cell.is-future')).toHaveLength(365 - 266)
    expect(setup(false).findAll('.hm-cell.is-future')).toHaveLength(0)
  })

  it('switches to things done', async () => {
    const w = setup()
    await w.findAll('.seg-opt input')[1].setValue(true)
    expect(w.find('.hm-kicker').text()).toBe('Things done · tasks and goal steps')
    expect(w.find('.hm-title').text()).toBe('2 things done in 2026')
    expect(w.find('.hm-legend').text()).toBe('LessMore done')
    expect(w.findAll('.hm-stat').map((s) => s.text())).toEqual(['September2', 'Best day1', 'Streak2d', 'Active days2'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/activity/HeatMap.test.ts`
Expected: FAIL — cannot resolve `./HeatMap.vue`.

- [ ] **Step 3: Write `src/components/activity/HeatMap.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { LEVEL_COLORS, doneByDay } from '../../core/activity'
import { focusByDay, heatMap } from '../../core/activityView'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'

const ember = useEmberStore()
const ui = useUiStore()

const focus = computed(() => focusByDay(ember.logs))
const counts = computed(() => doneByDay(ember.goals, ember.tasks))
const hm = computed(() => heatMap(ui.heatMode, focus.value, counts.value, ember.today))
const columns = computed(() => ({ gridTemplateColumns: `28px repeat(${hm.value.columns}, minmax(0, 1fr))` }))
</script>

<template>
  <section class="heat">
    <div class="hm-head">
      <div>
        <span class="kicker hm-kicker">{{ hm.kicker }}</span>
        <h2 class="hm-title">{{ hm.title }}</h2>
      </div>
      <div class="seg" role="radiogroup" aria-label="Heat map shows">
        <label class="seg-opt"><input v-model="ui.heatMode" type="radio" name="ember-heat" value="focus" />Focus time</label>
        <label class="seg-opt"><input v-model="ui.heatMode" type="radio" name="ember-heat" value="done" />Things done</label>
      </div>
    </div>

    <div class="hm-wrap">
      <div class="hm-months" :style="columns" aria-hidden="true">
        <span v-for="m in hm.months" :key="m.label" :style="{ gridColumn: `${m.col} / span 4` }">{{ m.label }}</span>
      </div>
      <div class="hm-grid" :style="columns">
        <span></span><span class="hm-day">Mon</span><span></span><span class="hm-day">Wed</span><span></span><span class="hm-day">Fri</span><span></span>
        <div
          v-for="(c, i) in hm.cells"
          :key="c.date ?? `blank-${i}`"
          class="hm-cell"
          :class="{ 'is-today': c.isToday, 'is-future': c.future && ember.settings.showFuture }"
          :style="{ background: c.color }"
          :title="c.tip || undefined"
        ></div>
      </div>
      <div class="hm-legend">Less<i v-for="c in LEVEL_COLORS" :key="c" :style="{ background: c }"></i>{{ hm.legendMore }}</div>
    </div>

    <div class="hm-stats">
      <div v-for="s in hm.stats" :key="s.label" class="hm-stat">
        <div class="label">{{ s.label }}</div>
        <div class="hm-stat-value">{{ s.value }}</div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.heat { display: flex; flex-direction: column; gap: var(--space-4); }
.hm-head { display: flex; justify-content: space-between; align-items: flex-end; gap: var(--space-4); flex-wrap: wrap; }
.hm-title { margin-top: 4px; }
.hm-wrap { max-width: 1100px; display: flex; flex-direction: column; gap: 6px; }
.hm-months { display: grid; gap: 3px; height: 12px; }
.hm-months span {
  grid-row: 1; overflow: hidden; white-space: nowrap;
  font-size: 10px; line-height: 12px; letter-spacing: .06em; text-transform: uppercase; color: var(--color-neutral-700);
}
.hm-grid { display: grid; grid-template-rows: repeat(7, auto); grid-auto-flow: column; gap: 3px; }
.hm-day { align-self: center; font-size: 9px; line-height: 1; color: var(--color-neutral-700); }
.hm-cell { aspect-ratio: 1; }
.hm-cell.is-today { box-shadow: 0 0 0 2px var(--color-text); }
.hm-cell.is-future { box-shadow: inset 0 0 0 1px var(--color-neutral-300); }
.hm-legend { display: flex; align-items: center; gap: 4px; margin-left: 31px; font-size: 11px; color: var(--color-neutral-700); }
.hm-legend i { width: 12px; height: 12px; }
.hm-legend i:first-of-type { margin-left: 4px; }
.hm-legend i:last-of-type { margin-right: 4px; }
.hm-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-top: 2px solid var(--color-divider); }
.hm-stat { padding: var(--space-3) var(--space-3) 0; border-left: 2px solid var(--color-divider); }
.hm-stat:first-child { padding-left: 0; border-left: 0; }
.hm-stat-value { font: 800 32px/1.1 var(--font-heading); }
@media (max-width: 560px) {
  .hm-months, .hm-grid { gap: 1px; }
  .hm-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .hm-stat:nth-child(3) { padding-left: 0; border-left: 0; }
  .hm-stat:nth-child(n + 3) { margin-top: var(--space-3); border-top: 2px solid var(--color-divider); }
}
</style>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add the year heat map"
```

---

### Task 4: Done wall and activity log

**Files:**
- Create: `src/components/activity/DoneWall.vue`, `src/components/activity/ActivityLog.vue`
- Test: `src/components/activity/DoneWall.test.ts`, `src/components/activity/ActivityLog.test.ts`

**Interfaces:**
- Consumes: `doneWall`, `activityLog` (activityView.ts); store `goals`, `tasks`, `logs`, `today`, `settings.wallWeeks`; `ui.feedSize`.
- Produces: `<DoneWall />`, `<ActivityLog />`. CSS hooks: `.dw-kicker`, `.dw-title`, `.dw-legend span`, `.dw-chart`, `.dw-col`, `.is-current`, `.dw-brick`, `.is-step|.is-task`, `.dw-labels span`, `.dw-stat`, `.dw-stat-value`, `.is-accent`; `.al-entry`, `.al-icon`, `.is-done`, `.al-text`, `.al-meta`, `.al-hash`, `.al-more`.

- [ ] **Step 1: Write the failing tests**

`src/components/activity/DoneWall.test.ts`:
```ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../core/model'
import { dataFixture, goalFixture, taskFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import DoneWall from './DoneWall.vue'

const TODAY = '2026-09-23'

function setup(wallWeeks = 4) {
  setActivePinia(createPinia())
  useEmberStore().replaceData(dataFixture({
    goals: [goalFixture('D3', [['M', [['A', '2026-09-22'], ['B', '2026-09-10']]]])],
    tasks: [taskFixture('t1', { doneOn: TODAY }), taskFixture('t2', { goalId: 'D3', tag: '', doneOn: '2026-09-21' })],
    settings: { ...DEFAULT_SETTINGS, wallWeeks },
  }))
  return mount(DoneWall)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('DoneWall', () => {
  it('shows the kicker, headline and legend', () => {
    const w = setup()
    expect(w.find('.dw-kicker').text()).toBe('Done wall · last 4 weeks')
    expect(w.find('.dw-title').text()).toBe('4 things finished')
    expect(w.findAll('.dw-legend span').map((s) => s.text())).toEqual(['D3', 'Tasks'])
  })

  it('draws one column per week with bricks stacked oldest first', () => {
    const w = setup()
    const cols = w.findAll('.dw-col')
    expect(cols).toHaveLength(4)
    expect(cols[3].classes()).toContain('is-current')
    expect(cols.map((c) => c.findAll('.dw-brick').length)).toEqual([0, 1, 0, 3])
    const [t2, a, t1] = cols[3].findAll('.dw-brick')
    expect(t2.classes()).toContain('is-task')
    expect(t2.attributes('style')).toContain('inset 0 0 0 2px var(--color-accent)')
    expect(a.classes()).toContain('is-step')
    expect(a.attributes('style')).toContain('background: var(--color-accent)')
    expect(a.attributes('title')).toBe('D3: A')
    expect(t1.attributes('style')).toContain('var(--color-text)')
    expect(w.find('.dw-chart').attributes('style')).toContain('height: 147px')
    expect(w.findAll('.dw-labels span').map((l) => l.text())).toEqual(['Aug 31', 'Sep 7', 'Sep 14', 'Sep 21'])
  })

  it('shows the weekly stats', () => {
    const w = setup()
    expect(w.findAll('.dw-stat').map((s) => s.text())).toEqual(['This week3', 'Best week3', 'Weeks in a row1', 'Milestones done1'])
    expect(w.findAll('.dw-stat-value')[0].classes()).toContain('is-accent')
  })

  it('follows the wall-weeks setting', () => {
    expect(setup(12).findAll('.dw-col')).toHaveLength(12)
  })
})
```

`src/components/activity/ActivityLog.test.ts`:
```ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FocusLog } from '../../core/model'
import { dataFixture, goalFixture, taskFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import ActivityLog from './ActivityLog.vue'

const TODAY = '2026-09-23'

function setup(logCount: number) {
  setActivePinia(createPinia())
  const logs: FocusLog[] = Array.from({ length: logCount }, (_, i) => ({
    id: `l${i}`, at: new Date(2026, 8, 22, 8, i).getTime(), date: '2026-09-22', min: 25, target: { kind: 'task', taskId: 'Review PR' },
  }))
  useEmberStore().replaceData(dataFixture({
    goals: [goalFixture('D3', [])],
    tasks: [taskFixture('Review PR', { doneOn: TODAY })],
    logs,
  }))
  return mount(ActivityLog)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('ActivityLog', () => {
  it('shows entries with icon, text, hash, source and day', () => {
    const w = setup(2)
    const [done, focus] = w.findAll('.al-entry')
    expect(done.find('.al-icon').classes()).toContain('is-done')
    expect(done.find('.al-text').text()).toBe('Completed task “Review PR”')
    expect(done.find('.al-hash').text()).toMatch(/^[0-9a-f]{7}$/)
    expect(done.find('.al-meta').text()).toContain('Task · Work')
    expect(done.find('.al-meta').text()).toContain('Today')
    expect(focus.find('.al-icon').classes()).not.toContain('is-done')
    expect(focus.find('.al-text').text()).toBe('Focused 25m on “Review PR”')
    expect(focus.find('.al-meta').text()).toContain('Yesterday')
    expect(w.find('.al-more').exists()).toBe(false)
  })

  it('pages the log ten at a time and hides "Show earlier" at the end', async () => {
    const w = setup(14)
    expect(w.findAll('.al-entry')).toHaveLength(10)
    await w.find('.al-more').trigger('click')
    expect(w.findAll('.al-entry')).toHaveLength(15)
    expect(w.find('.al-more').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/components/activity`
Expected: DoneWall and ActivityLog FAIL — cannot resolve the `.vue` files (HeatMap passes).

- [ ] **Step 3: Write `src/components/activity/DoneWall.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { doneWall, type Brick } from '../../core/activityView'
import { useEmberStore } from '../../stores/ember'

const ember = useEmberStore()
const wall = computed(() => doneWall(ember.goals, ember.tasks, ember.today, ember.settings.wallWeeks))
const brickStyle = (b: Brick) => (b.kind === 'step' ? { background: b.color } : { boxShadow: `inset 0 0 0 2px ${b.color}` })
</script>

<template>
  <section class="wall">
    <div>
      <span class="kicker dw-kicker">Done wall · last {{ wall.weeks }} weeks</span>
      <h3 class="dw-title">{{ wall.headline }}</h3>
    </div>
    <div class="dw-legend">
      <span v-for="l in wall.legend" :key="l.name"><i :style="{ background: l.color }"></i>{{ l.name }}</span>
      <span><i class="is-task"></i>Tasks</span>
    </div>
    <div class="dw-chart" :style="{ height: `${wall.height}px` }">
      <div v-for="c in wall.columns" :key="c.monday" class="dw-col" :class="{ 'is-current': c.current }">
        <div
          v-for="(b, i) in c.bricks"
          :key="i"
          class="dw-brick"
          :class="`is-${b.kind}`"
          :style="brickStyle(b)"
          :title="b.tip"
        ></div>
      </div>
    </div>
    <div class="dw-labels">
      <span v-for="c in wall.columns" :key="c.monday" :class="{ 'is-current': c.current }">{{ c.label }}</span>
    </div>
    <div class="dw-stats">
      <div v-for="s in wall.stats" :key="s.label" class="dw-stat">
        <div class="label">{{ s.label }}</div>
        <div class="dw-stat-value" :class="{ 'is-accent': s.accent }">{{ s.value }}</div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.wall { min-width: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.dw-title { margin-top: 4px; }
.dw-legend { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-4); margin-top: var(--space-2); font-size: 12px; color: var(--color-neutral-700); }
.dw-legend span { display: flex; align-items: center; gap: 6px; }
.dw-legend i { width: 12px; height: 12px; }
.dw-legend i.is-task { box-shadow: inset 0 0 0 2px var(--color-text); }
.dw-chart {
  display: flex; align-items: flex-end; gap: 6px; margin-top: var(--space-3);
  border-bottom: 2px solid var(--color-text);
}
.dw-col { flex: 1 1 0; min-width: 0; height: 100%; display: flex; flex-direction: column-reverse; gap: 3px; }
.dw-col.is-current { background: var(--color-accent-100); }
.dw-brick { flex: none; height: 18px; }
.dw-labels { display: flex; gap: 6px; }
.dw-labels span { flex: 1 1 0; min-width: 0; overflow: hidden; white-space: nowrap; font-size: 11px; color: var(--color-neutral-700); }
.dw-labels span.is-current { color: var(--color-accent-700); }
.dw-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin-top: var(--space-3); border-top: 2px solid var(--color-divider); }
.dw-stat { padding: var(--space-3) var(--space-3) 0; border-left: 2px solid var(--color-divider); }
.dw-stat:first-child { padding-left: 0; border-left: 0; }
.dw-stat-value { font: 800 32px/1.1 var(--font-heading); }
.dw-stat-value.is-accent { color: var(--color-accent-700); }
@media (max-width: 560px) {
  .dw-chart, .dw-labels { gap: 2px; }
  .dw-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dw-stat:nth-child(3) { padding-left: 0; border-left: 0; }
  .dw-stat:nth-child(n + 3) { margin-top: var(--space-3); border-top: 2px solid var(--color-divider); }
}
</style>
```

- [ ] **Step 4: Write `src/components/activity/ActivityLog.vue`**

```vue
<script setup lang="ts">
import { Check, Timer } from 'lucide-vue-next'
import { computed } from 'vue'
import { activityLog } from '../../core/activityView'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'

const ember = useEmberStore()
const ui = useUiStore()
const entries = computed(() => activityLog(ember.goals, ember.tasks, ember.logs, ember.today))
const shown = computed(() => entries.value.slice(0, ui.feedSize))
</script>

<template>
  <section class="log">
    <span class="kicker al-kicker">Activity log</span>
    <div class="al-list">
      <div v-for="e in shown" :key="e.key" class="al-entry">
        <Check v-if="e.kind === 'done'" class="al-icon is-done" :size="16" :stroke-width="3" />
        <Timer v-else class="al-icon" :size="16" :stroke-width="2.25" />
        <div class="al-body">
          <div class="al-text">{{ e.text }}</div>
          <div class="al-meta">
            <span class="al-hash tabular">{{ e.hash }}</span><span>{{ e.src }}</span><span>{{ e.when }}</span>
          </div>
        </div>
      </div>
    </div>
    <button v-if="entries.length > ui.feedSize" class="btn btn-ghost al-more" @click="ui.feedSize += 10">Show earlier</button>
  </section>
</template>

<style scoped>
.log { min-width: 0; display: flex; flex-direction: column; }
.al-kicker { margin-bottom: var(--space-2); }
.al-list { display: flex; flex-direction: column; border-top: 2px solid var(--color-divider); }
.al-entry {
  display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: var(--space-2);
  padding: var(--space-2) 0; border-bottom: 1px solid var(--color-divider);
}
.al-icon { margin-top: 2px; }
.al-icon.is-done { color: var(--color-accent); }
.al-text { font-size: 13px; line-height: 1.35; overflow-wrap: anywhere; }
.al-meta { display: flex; flex-wrap: wrap; gap: 0 8px; margin-top: 2px; font-size: 11px; color: var(--color-neutral-700); }
.al-hash { font-weight: 700; }
.al-more { align-self: flex-start; padding-left: 0; }
</style>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add the done wall and activity log"
```

---

### Task 5: Activity view and App wiring

**Files:**
- Create: `src/components/activity/ActivityView.vue`
- Modify: `src/App.vue`, `src/App.test.ts`

**Interfaces:**
- Consumes: `HeatMap`, `DoneWall`, `ActivityLog`.
- Produces: `<ActivityView />` (root `<main class="view activity-view">`). App renders it for the Activity tab; the placeholder and `VIEW_NAMES` are removed.

- [ ] **Step 1: Write the failing test**

In `src/App.test.ts`, replace the test `'switches between the Today view, the Goals view and the Activity placeholder'` with:
```ts
  it('switches between the Today, Goals and Activity views', async () => {
    const w = mountApp()
    expect(w.find('.today-view').exists()).toBe(true)
    await w.findAll('.tab')[1].trigger('click')
    expect(w.find('.goals-view').exists()).toBe(true)
    await w.findAll('.tab')[2].trigger('click')
    expect(w.find('.activity-view').exists()).toBe(true)
    expect(w.find('.hm-title').text()).toMatch(/hours focused in 2026$/)
    expect(w.findAll('.al-entry')).toHaveLength(10)
    expect(w.text()).not.toContain('This view arrives in a later phase.')
    w.unmount()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/App.test.ts`
Expected: FAIL — no `.activity-view`.

- [ ] **Step 3: Write `src/components/activity/ActivityView.vue`**

```vue
<script setup lang="ts">
import ActivityLog from './ActivityLog.vue'
import DoneWall from './DoneWall.vue'
import HeatMap from './HeatMap.vue'
</script>

<template>
  <main class="view activity-view">
    <HeatMap />
    <div class="av-columns">
      <DoneWall />
      <ActivityLog />
    </div>
  </main>
</template>

<style scoped>
.activity-view { gap: var(--space-8); }
.av-columns {
  display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(280px, 1fr); gap: var(--space-8); align-items: start;
  padding-top: var(--space-6); border-top: 2px solid var(--color-divider);
}
@media (max-width: 860px) { .av-columns { grid-template-columns: minmax(0, 1fr); } }
</style>
```

- [ ] **Step 4: Render ActivityView in `src/App.vue`**

- Add `import ActivityView from './components/activity/ActivityView.vue'`.
- Replace the placeholder comment and `<main v-else class="view">…</main>` block with `<ActivityView v-else />`.
- Delete `const VIEW_NAMES …` and change `import { useUiStore, type View } from './stores/ui'` to `import { useUiStore } from './stores/ui'`.

- [ ] **Step 5: Run the full check**

Run: `npm test && npm run build`
Expected: all tests pass; vue-tsc clean; build succeeds.

- [ ] **Step 6: Check the running app**

Run `npm run dev` (background). In the Playwright browser at `http://localhost:5173/` (clear localStorage first so the seed loads), open Activity:
1. 1280px: kicker "FOCUS TIME · ALL GOALS AND TASKS", "{n} hours focused in 2026"; the year grid fills the width with month labels and Mon/Wed/Fri, cells darker later in the year, today ringed, future days outlined; legend; stats (September, Best day, Focus streak, Daily average). Switch to Things done → title/kicker/stats/legend change. Done wall: 12 columns, current week tinted, step bricks in goal colours, outlined task bricks, labels, stats. Activity log: 10 entries starting with today's completions, "Show earlier" adds 10. Screenshot.
2. On Today, tick a task → back on Activity, "Things done" today count and the log's first entry update.
3. Resize to 360px: no horizontal scroll (`scrollWidth <= clientWidth`); heat map shrinks to fit; wall and log stack; stats 2×2. Screenshot.
4. Console: no errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add the Activity view"
```
