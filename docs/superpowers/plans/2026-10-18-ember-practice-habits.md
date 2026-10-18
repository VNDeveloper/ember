# Practice Habits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A goal can carry a practice habit ("25m on 5 days a week"), tracked automatically from focus time and shown on the goal's Working on card and goal page, with week-based streaks.

**Architecture:** An optional `habit` field on `Goal` (targets with a start Monday, pause periods, soft delete). All rules are pure functions in a new `src/core/habits.ts`. The store gains `setHabit`/`removeHabit` and records pauses in `setGoalStatus`. Two components render it: `HabitLine` (shared) and `HabitRow` (goal page). Sync and backup need no changes, because the habit is one of the goal's own fields.

**Tech Stack:** Vue 3 `<script setup>` + TypeScript + Pinia, plain CSS tokens, lucide-vue-next, Vitest + jsdom + @vue/test-utils.

**Spec:** `docs/superpowers/specs/2026-10-18-ember-practice-habits-design.md`

## Global Constraints

- `src/core/` imports no `vue`/`pinia`. `core/habits.ts` imports only `./dates`, `./format` and `./model`, so there's no import cycle with `core/goals.ts`.
- Target minutes 5–240 in steps of 5; days a week 1–7.
- Weeks run Monday to Sunday (`mondayOf`). Week status is one of `'hit' | 'missed' | 'off' | 'current'`.
- **`off`** is a past week that wasn't hit and either overlaps a pause or is the habit's first week. It neither counts nor breaks the streak.
- Visual rules: zero radius, 2px/1px rules, flush-left button labels, red only for today's progress fill (and an active-tab-style accent edge on the current week square), no gradients, emoji or shadows.
- Copy:
  - `"10 of 25m today"`, `"3 of 5 days"`;
  - `"6 weeks"`, `"1 week"`, `"–"` at 0;
  - `"25m on 5 days a week"`, `"25m every day"` (7 days), `"25m on 1 day a week"`;
  - `"Removed the habit on “‹goal›”"`.
- Commands: `npx vitest run <file>`, `npm test`, `npm run typecheck`, `npm run build`.

## Review Focus

1. **A habit started midweek:** its first week must not count as missed. It's `off` unless hit (Task 2 test).
2. **Pausing and resuming within one week, or a pause spanning weeks:** those weeks are `off`, and the streak continues across them (Task 2 and Task 3 tests).
3. **Changing the target midweek:** this week uses the new target and earlier weeks keep the old one, so the streak isn't rewritten (Task 2 test).
4. **Removing a habit and undoing the removal:** the same habit comes back. Adding a habit after removing one starts fresh (Task 3 test).
5. **Time on a task linked to the goal, and on a step deleted later,** still counts toward the day (Task 1 test).

---

### Task 1: Habit data, repair and minutes per day

**Files:**
- Modify: `src/core/model.ts`
- Create: `src/core/habits.ts`, `src/core/habits.test.ts`
- Modify: `src/core/goals.ts` (`repairGoal`), `src/core/goals.test.ts`

**Interfaces:**
- Produces (model): `interface HabitTarget { minutes: number; daysPerWeek: number; from: ISODate }`, `interface Habit { targets: HabitTarget[]; pauses: { from: ISODate; to: ISODate | null }[]; deletedOn?: ISODate | null }`, and `Goal.habit?: Habit | null`.
- Produces (habits.ts): `repairHabit(x: unknown): Habit | null` (returns the same object when nothing needs repair), `liveHabit(g: Goal): Habit | null`, `goalMinutesByDay(goal: Goal, tasks: Task[], logs: FocusLog[]): Map<ISODate, number>`.

- [ ] **Step 1: Write failing tests** in `src/core/habits.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { goalMinutesByDay, liveHabit, repairHabit } from './habits'
import type { Habit } from './model'
import { goalFixture, logFixture, taskFixture } from './test-fixtures'

const S = { kind: 'step', goalId: 'G', msId: 'G/M', stepId: 'G/M/S' } as const
const habit = (patch: Partial<Habit> = {}): Habit => ({ targets: [{ minutes: 25, daysPerWeek: 3, from: '2026-09-28' }], pauses: [], ...patch })

describe('repairHabit', () => {
  it('returns a valid habit unchanged', () => {
    const h = habit({ pauses: [{ from: '2026-10-01', to: '2026-10-03' }, { from: '2026-10-10', to: null }] })
    expect(repairHabit(h)).toBe(h)
  })
  it('drops bad targets and pauses, sorts targets, and gives up when no target is left', () => {
    const h = repairHabit({
      targets: [{ minutes: 30, daysPerWeek: 4, from: '2026-10-05' }, { minutes: 3, daysPerWeek: 4, from: '2026-10-12' }, { minutes: 25, daysPerWeek: 9, from: '2026-10-12' }, { minutes: 25, daysPerWeek: 3, from: '2026-09-28' }],
      pauses: [{ from: 'soon', to: null }, { from: '2026-10-01', to: '2026-10-02' }],
    })!
    expect(h.targets.map((t) => t.from)).toEqual(['2026-09-28', '2026-10-05'])
    expect(h.pauses).toEqual([{ from: '2026-10-01', to: '2026-10-02' }])
    expect(repairHabit({ targets: [{ minutes: 0, daysPerWeek: 3, from: '2026-10-05' }], pauses: [] })).toBeNull()
    expect(repairHabit('habit')).toBeNull()
    expect(repairHabit({ targets: [{ minutes: 25, daysPerWeek: 3, from: '2026-10-05' }] })).toEqual({ targets: [{ minutes: 25, daysPerWeek: 3, from: '2026-10-05' }], pauses: [] })
  })
  it('only counts a habit that is not removed', () => {
    expect(liveHabit({ ...goalFixture('G', []), habit: habit() })).not.toBeNull()
    expect(liveHabit({ ...goalFixture('G', []), habit: { ...habit(), deletedOn: '2026-10-01' } })).toBeNull()
    expect(liveHabit(goalFixture('G', []))).toBeNull()
  })
})

describe('goalMinutesByDay', () => {
  it("adds up the goal's steps and linked tasks per day, deleted ones included", () => {
    const goal = goalFixture('G', [['M', [['S', null]]]])
    const tasks = [taskFixture('Linked', { goalId: 'G' }), taskFixture('Other'), taskFixture('Gone', { goalId: 'G', deletedOn: '2026-10-01' })]
    const logs = [
      logFixture('2026-10-12', S, 20),
      logFixture('2026-10-12', { kind: 'task', taskId: 'Linked' }, 10),
      logFixture('2026-10-12', { kind: 'task', taskId: 'Other' }, 15),
      logFixture('2026-10-12', null, 25),
      logFixture('2026-10-13', { kind: 'task', taskId: 'Gone' }, 5),
      logFixture('2026-10-13', { kind: 'step', goalId: 'X', msId: 'X/M', stepId: 'X/M/S' }, 25),
    ]
    expect([...goalMinutesByDay(goal, tasks, logs)]).toEqual([['2026-10-12', 30], ['2026-10-13', 5]])
  })
})
```

Add to `src/core/goals.test.ts` (inside the goal status describe; `goalFixture` is already imported):

```ts
  it('repairs a goal’s habit, and drops one that cannot be repaired', () => {
    const ok = { ...goalFixture('G', []), habit: { targets: [{ minutes: 25, daysPerWeek: 3, from: '2026-09-28' }], pauses: [] } }
    expect(repairGoal(ok)).toBe(ok)
    expect(repairGoal({ ...goalFixture('G', []), habit: { targets: [], pauses: [] } })).not.toHaveProperty('habit')
  })
```

- [ ] **Step 2: Run** `npx vitest run src/core/habits.test.ts src/core/goals.test.ts`. Expect failures (no `./habits`).

- [ ] **Step 3: Implement.**

`src/core/model.ts`, before `Goal`:

```ts
export interface HabitTarget {
  /** Minutes of focus on the goal that make a day count (5–240). */
  minutes: number
  /** Days a week that must count for the week to be hit (1–7). */
  daysPerWeek: number
  /** The Monday this target applies from. */
  from: ISODate
}
/** A practice habit on a goal, measured from focus time (see core/habits). */
export interface Habit {
  /** Oldest first; the last is the current target. Never empty. */
  targets: HabitTarget[]
  /** Periods the goal was paused: [from, to); to is null while still paused. */
  pauses: { from: ISODate; to: ISODate | null }[]
  /** Soft delete (Remove habit), so the undo bar can bring it back. */
  deletedOn?: ISODate | null
}
```

In `Goal`, after `achievedOn`: `habit?: Habit | null`.

`src/core/habits.ts`:

```ts
import type { ISODate } from './dates'
import type { FocusLog, Goal, Habit, HabitTarget, Task } from './model'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const isDate = (x: unknown): x is ISODate => typeof x === 'string' && ISO.test(x)
const okTarget = (t: unknown): t is HabitTarget => {
  if (!t || typeof t !== 'object') return false
  const x = t as Record<string, unknown>
  return Number.isInteger(x.minutes) && (x.minutes as number) >= 5 && (x.minutes as number) <= 240
    && Number.isInteger(x.daysPerWeek) && (x.daysPerWeek as number) >= 1 && (x.daysPerWeek as number) <= 7
    && isDate(x.from)
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
  const rawTargets = Array.isArray(h.targets) ? h.targets : []
  const rawPauses = Array.isArray(h.pauses) ? h.pauses : []
  const targets = rawTargets.filter(okTarget).sort((a, b) => a.from.localeCompare(b.from))
  if (!targets.length) return null
  const pauses = rawPauses.filter(okPause)
  const sorted = targets.every((t, i) => t === rawTargets[i])
  if (sorted && targets.length === rawTargets.length && pauses.length === rawPauses.length && Array.isArray(h.pauses)) return x as Habit
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
```

`src/core/goals.ts`: import `repairHabit` from `./habits`. Rename the existing `repairGoal` body to `function repairStatus(g: Goal): Goal`, and add:

```ts
/** Repairs a goal's status and habit; a valid goal comes back as the same object. */
export function repairGoal(g: Goal): Goal {
  const s = repairStatus(g)
  if (s.habit === undefined || s.habit === null) return s
  const habit = repairHabit(s.habit)
  if (habit === s.habit) return s
  const { habit: _h, ...rest } = s
  return habit ? { ...rest, habit } : rest
}
```

- [ ] **Step 4: Run** `npx vitest run src/core/habits.test.ts src/core/goals.test.ts` and `npm run typecheck`. Expect PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core
git commit -m "feat: practice habit data on goals, repaired on load, and focus minutes per goal per day"
```

### Task 2: Weeks, streaks, today's view and target changes

**Files:**
- Modify: `src/core/habits.ts`, `src/core/habits.test.ts`

**Interfaces:**
- Consumes: `liveHabit`, `goalMinutesByDay` (Task 1); `addDays`, `mondayOf` (`core/dates`); `plural` (`core/format`).
- Produces:
  - `type WeekStatus = 'hit' | 'missed' | 'off' | 'current'`
  - `interface HabitWeek { monday: ISODate; status: WeekStatus; doneDays: number; target: HabitTarget }`
  - `habitWeeks(habit: Habit, byDay: Map<ISODate, number>, today: ISODate): HabitWeek[]` (oldest first)
  - `habitStreak(weeks: HabitWeek[]): { streak: number; best: number }`
  - `interface HabitDay { date: ISODate; label: string; state: 'done' | 'not' | 'future' }`
  - `interface HabitView { minutes: number; daysPerWeek: number; todayMin: number; todayDone: boolean; days: HabitDay[]; doneDays: number; streak: number; best: number; recent: WeekStatus[]; todayText: string; daysText: string; streakText: string; targetText: string }`
  - `habitView(goal: Goal, tasks: Task[], logs: FocusLog[], today: ISODate): HabitView | null`
  - `targetText(minutes: number, daysPerWeek: number): string`
  - `withTarget(habit: Habit, minutes: number, daysPerWeek: number, today: ISODate): Habit`
  - `newHabit(minutes: number, daysPerWeek: number, today: ISODate, paused: boolean): Habit`
  - `clampHabit(minutes: number, daysPerWeek: number): { minutes: number; daysPerWeek: number }`

- [ ] **Step 1: Write failing tests**, appended to `src/core/habits.test.ts` (extend the import from `./habits`):

```ts
const TODAY = '2026-10-14' // Wednesday; this week starts 2026-10-12
const days = (dates: string[], min = 25) => new Map(dates.map((d) => [d, min]))

describe('habitWeeks and habitStreak', () => {
  const h = habit({ targets: [{ minutes: 25, daysPerWeek: 3, from: '2026-09-21' }] })
  const status = (by: Map<string, number>, hh = h) => habitWeeks(hh, by, TODAY).map((w) => w.status)

  it('marks hit and missed weeks, keeps this week open, and counts the streak in weeks', () => {
    const by = days(['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-28', '2026-09-30', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-12'])
    const weeks = habitWeeks(h, by, TODAY)
    expect(weeks.map((w) => [w.monday, w.status, w.doneDays])).toEqual([
      ['2026-09-21', 'hit', 3], ['2026-09-28', 'hit', 3], ['2026-10-05', 'missed', 2], ['2026-10-12', 'current', 1],
    ])
    expect(habitStreak(weeks)).toEqual({ streak: 0, best: 2 })
  })

  it('counts this week once it is hit', () => {
    const by = days(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-12', '2026-10-13', '2026-10-14'])
    expect(habitStreak(habitWeeks(habit({ targets: [{ minutes: 25, daysPerWeek: 3, from: '2026-10-05' }] }), by, TODAY))).toEqual({ streak: 2, best: 2 })
  })

  it('a day needs the full target minutes', () => {
    expect(status(days(['2026-09-21', '2026-09-22', '2026-09-23'], 20))[0]).toBe('off')
  })

  it("never counts the habit's first week as missed, and skips paused weeks", () => {
    const by = days(['2026-09-28', '2026-09-29', '2026-09-30'])
    expect(status(by)).toEqual(['off', 'hit', 'missed', 'current'])
    const paused = habit({ targets: h.targets, pauses: [{ from: '2026-10-07', to: '2026-10-09' }] })
    expect(status(by, paused)).toEqual(['off', 'hit', 'off', 'current'])
    expect(habitStreak(habitWeeks(paused, by, TODAY))).toEqual({ streak: 1, best: 1 })
    const stillPaused = habit({ targets: h.targets, pauses: [{ from: '2026-10-07', to: null }] })
    expect(status(by, stillPaused)).toEqual(['off', 'hit', 'off', 'current'])
    const sameDay = habit({ targets: h.targets, pauses: [{ from: '2026-10-07', to: '2026-10-07' }] })
    expect(status(by, sameDay)).toEqual(['off', 'hit', 'missed', 'current'])
  })

  it('judges each week by the target it had', () => {
    const changed = habit({ targets: [{ minutes: 25, daysPerWeek: 3, from: '2026-09-21' }, { minutes: 60, daysPerWeek: 3, from: '2026-10-05' }] })
    const by = days(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-05', '2026-10-06', '2026-10-07'])
    expect(status(by, changed)).toEqual(['off', 'hit', 'missed', 'current'])
  })
})

describe('habitView', () => {
  const goal = (hh: Habit | null = habit()) => ({ ...goalFixture('G', [['M', [['S', null]]]]), habit: hh })

  it("shows today's minutes, the week's days and the streak", () => {
    const logs = [logFixture('2026-10-12', S, 30), logFixture('2026-10-14', S, 10)]
    const v = habitView(goal(), [], logs, TODAY)!
    expect(v).toMatchObject({
      minutes: 25, daysPerWeek: 3, todayMin: 10, todayDone: false, doneDays: 1, streak: 0, best: 0,
      todayText: '10 of 25m today', daysText: '1 of 3 days', streakText: '–', targetText: '25m on 3 days a week',
      recent: ['off', 'missed', 'current'],
    })
    expect(v.days.map((d) => `${d.label}:${d.state}`)).toEqual(['M:done', 'T:not', 'W:not', 'T:future', 'F:future', 'S:future', 'S:future'])
  })

  it('is null without a live habit, and words the target', () => {
    expect(habitView(goal(null), [], [], TODAY)).toBeNull()
    expect(habitView(goal({ ...habit(), deletedOn: '2026-10-01' }), [], [], TODAY)).toBeNull()
    expect([targetText(25, 7), targetText(30, 1), targetText(45, 4)]).toEqual(['25m every day', '30m on 1 day a week', '45m on 4 days a week'])
  })

  it('keeps the last 8 weeks', () => {
    const v = habitView(goal(habit({ targets: [{ minutes: 25, daysPerWeek: 3, from: '2026-07-06' }] })), [], [], TODAY)!
    expect(v.recent).toHaveLength(8)
    expect(v.recent.at(-1)).toBe('current')
  })
})

describe('changing a habit', () => {
  it('replaces this week’s target, or starts a new one from this Monday', () => {
    const h1 = withTarget(habit(), 30, 4, TODAY)
    expect(h1.targets).toEqual([{ minutes: 25, daysPerWeek: 3, from: '2026-09-28' }, { minutes: 30, daysPerWeek: 4, from: '2026-10-12' }])
    const h2 = withTarget(h1, 45, 5, '2026-10-15')
    expect(h2.targets).toEqual([{ minutes: 25, daysPerWeek: 3, from: '2026-09-28' }, { minutes: 45, daysPerWeek: 5, from: '2026-10-12' }])
  })
  it('starts a habit this week, with an open pause for a paused goal', () => {
    expect(newHabit(25, 5, TODAY, false)).toEqual({ targets: [{ minutes: 25, daysPerWeek: 5, from: '2026-10-12' }], pauses: [] })
    expect(newHabit(25, 5, TODAY, true).pauses).toEqual([{ from: TODAY, to: null }])
  })
  it('keeps targets in range', () => {
    expect([clampHabit(3, 0), clampHabit(500, 9), clampHabit(27, 3.6), clampHabit(Number.NaN, 5)]).toEqual([
      { minutes: 5, daysPerWeek: 1 }, { minutes: 240, daysPerWeek: 7 }, { minutes: 25, daysPerWeek: 4 }, { minutes: 25, daysPerWeek: 5 },
    ])
  })
})
```

- [ ] **Step 2: Run** `npx vitest run src/core/habits.test.ts`. Expect failures (functions not exported).

- [ ] **Step 3: Implement**, appended to `src/core/habits.ts` (add `import { addDays, mondayOf } from './dates'` and `import { plural } from './format'`):

```ts
export type WeekStatus = 'hit' | 'missed' | 'off' | 'current'
export interface HabitWeek { monday: ISODate; status: WeekStatus; doneDays: number; target: HabitTarget }

/** The target a week is judged by: the latest one starting on or before its Monday. */
const targetFor = (h: Habit, monday: ISODate): HabitTarget =>
  [...h.targets].reverse().find((t) => mondayOf(t.from) <= monday) ?? h.targets[0]

/** A pause [from, to) touches any day of the week (an open pause runs on). */
const pausedIn = (h: Habit, monday: ISODate): boolean => {
  const sunday = addDays(monday, 6)
  return h.pauses.some((p) => p.from <= sunday && (p.to === null || p.to > monday) && (p.to === null || p.to > p.from))
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
    const s = weeks[i].status
    if (s === 'hit') streak++
    else if (s === 'missed') break
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
  const keep = mondayOf(last.from) === monday ? h.targets.slice(0, -1) : h.targets
  return { ...h, targets: [...keep, { minutes, daysPerWeek, from: monday }] }
}

export function newHabit(minutes: number, daysPerWeek: number, today: ISODate, paused: boolean): Habit {
  return { targets: [{ minutes, daysPerWeek, from: mondayOf(today) }], pauses: paused ? [{ from: today, to: null }] : [] }
}

/** Minutes 5–240 in steps of 5 (25 when not a number); days 1–7. */
export function clampHabit(minutes: number, daysPerWeek: number): { minutes: number; daysPerWeek: number } {
  const m = Number.isFinite(minutes) ? Math.round(minutes / 5) * 5 : 25
  const d = Number.isFinite(daysPerWeek) ? Math.round(daysPerWeek) : 5
  return { minutes: Math.min(240, Math.max(5, m)), daysPerWeek: Math.min(7, Math.max(1, d)) }
}
```

- [ ] **Step 4: Run** `npx vitest run src/core/habits.test.ts`. Expect PASS. If an expectation disagrees with the spec, fix the code. If an expectation disagrees with this plan's own arithmetic, re-derive it by hand and record a ruling.

- [ ] **Step 5: Commit**

```bash
git add src/core/habits.ts src/core/habits.test.ts
git commit -m "feat: habit weeks, streaks (rest days and paused weeks free), today's view and target changes"
```

### Task 3: Store actions, pause bookkeeping and demo habit

**Files:**
- Modify: `src/stores/ember.ts`, `src/stores/ember.test.ts`, `src/core/seed.ts`, `src/core/seed.test.ts`

**Interfaces:**
- Consumes: `liveHabit`, `withTarget`, `newHabit`, `clampHabit` (Tasks 1–2).
- Produces (store): `setHabit(goalId: string, input: { minutes: number; daysPerWeek: number }): void`; `removeHabit(goalId: string): UndoRecord | null`; `DeleteKey` gains `{ kind: 'habit'; goalId: string }`.

- [ ] **Step 1: Write failing tests**, appended to `src/stores/ember.test.ts` (today in this file is Wed 2026-09-23, so this Monday is 2026-09-21):

```ts
describe('habits', () => {
  it('sets a habit from this Monday, in range, and changes it within the week', () => {
    const store = storeWith()
    store.setHabit('D3', { minutes: 27, daysPerWeek: 9 })
    expect(store.goals[0].habit).toEqual({ targets: [{ minutes: 25, daysPerWeek: 7, from: '2026-09-21' }], pauses: [] })
    store.setHabit('D3', { minutes: 50, daysPerWeek: 3 })
    expect(store.goals[0].habit!.targets).toEqual([{ minutes: 50, daysPerWeek: 3, from: '2026-09-21' }])
    store.setHabit('missing', { minutes: 25, daysPerWeek: 3 })
  })

  it('removes a habit with undo, and starts fresh when added again', () => {
    const store = storeWith()
    store.setHabit('D3', { minutes: 25, daysPerWeek: 3 })
    const rec = store.removeHabit('D3')!
    expect(rec.label).toBe('Removed the habit on “D3”')
    expect(store.goals[0].habit!.deletedOn).toBe('2026-09-23')
    store.undoDelete(rec)
    expect(store.goals[0].habit!.deletedOn).toBeNull()
    store.removeHabit('D3')
    store.setHabit('D3', { minutes: 40, daysPerWeek: 2 })
    expect(store.goals[0].habit).toEqual({ targets: [{ minutes: 40, daysPerWeek: 2, from: '2026-09-21' }], pauses: [] })
    expect(store.removeHabit('missing')).toBeNull()
  })

  it('records pauses while the goal is paused', () => {
    const store = storeWith()
    store.setHabit('D3', { minutes: 25, daysPerWeek: 3 })
    store.setGoalStatus('D3', 'paused')
    expect(store.goals[0].habit!.pauses).toEqual([{ from: '2026-09-23', to: null }])
    vi.setSystemTime(new Date(2026, 8, 30, 10, 0))
    store.tick()
    store.setGoalStatus('D3', 'active')
    expect(store.goals[0].habit!.pauses).toEqual([{ from: '2026-09-23', to: '2026-09-30' }])
  })

  it('a habit set on a paused goal starts paused', () => {
    const store = storeWith()
    store.setGoalStatus('D3', 'paused')
    store.setHabit('D3', { minutes: 25, daysPerWeek: 3 })
    expect(store.goals[0].habit!.pauses).toEqual([{ from: '2026-09-23', to: null }])
  })
})
```

Add to `src/core/seed.test.ts` (inside `describe('buildSeed')`):

```ts
  it('gives the Spanish goal a demo habit that started 8 weeks ago', () => {
    const spanish = seed.goals.find((g) => g.title === 'Speak Spanish at B1')!
    expect(spanish.habit).toEqual({ targets: [{ minutes: 25, daysPerWeek: 3, from: '2026-07-27' }], pauses: [] })
  })
```

(The seed's today is Wed 2026-09-23, this Monday is 2026-09-21, and 8 weeks earlier is 2026-07-27.)

- [ ] **Step 2: Run** `npx vitest run src/stores/ember.test.ts src/core/seed.test.ts`. Expect failures.

- [ ] **Step 3: Implement.**

`src/stores/ember.ts`:
- Import `clampHabit, liveHabit, newHabit, withTarget` from `../core/habits`.
- `DeleteKey` gains `| { kind: 'habit'; goalId: string }`.
- In `itemFor`, as the first line: `if (key.kind === 'habit') return goalById(key.goalId)?.habit ?? null`.
- In `setGoalStatus`, record pauses. The function today returns early on a missing goal or an unchanged status, so add the bookkeeping right after that early return:

```ts
    const h = liveHabit(g)
    if (h && status === 'paused') h.pauses.push({ from: today.value, to: null })
    else if (h) {
      const open = h.pauses.find((p) => p.to === null)
      if (open) open.to = today.value
    }
```

- Actions, after `setOutcome`:

```ts
  // — habits —
  /** Start a habit, or change its target from this week on. */
  function setHabit(goalId: string, input: { minutes: number; daysPerWeek: number }) {
    const g = goalById(goalId)
    if (!g || !isLive(g)) return
    const { minutes, daysPerWeek } = clampHabit(input.minutes, input.daysPerWeek)
    const h = liveHabit(g)
    g.habit = h ? withTarget(h, minutes, daysPerWeek, today.value) : newHabit(minutes, daysPerWeek, today.value, goalStatus(g) === 'paused')
  }

  const removeHabit = (goalId: string) =>
    softDelete({ kind: 'habit', goalId }, `Removed the habit on “${goalById(goalId)?.title ?? ''}”`)
```

- Return `setHabit, removeHabit`.

`src/core/seed.ts`: import `mondayOf` from `./dates`. After building `goals`, add:

```ts
  // Spanish has a demo practice habit: 25 minutes on 3 days a week, for the last 8 weeks.
  goals[1].habit = { targets: [{ minutes: 25, daysPerWeek: 3, from: addDays(mondayOf(today), -56) }], pauses: [] }
```

- [ ] **Step 4: Run** `npx vitest run src/stores/ember.test.ts src/core/seed.test.ts`, `npm test` and `npm run typecheck`. Expect PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores src/core/seed.ts src/core/seed.test.ts
git commit -m "feat: set, change and remove a goal's habit (with undo); pauses recorded; demo habit"
```

### Task 4: The habit line

**Files:**
- Create: `src/components/goals/HabitLine.vue`, `src/components/goals/HabitLine.test.ts`

**Interfaces:**
- Consumes: `HabitView` (Task 2), `popClass` (`components/anim`).
- Produces: `HabitLine.vue` with props `{ view: HabitView; compact?: boolean }`.

- [ ] **Step 1: Write failing tests** in `src/components/goals/HabitLine.test.ts`:

```ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { HabitView } from '../../core/habits'
import HabitLine from './HabitLine.vue'

const view = (patch: Partial<HabitView> = {}): HabitView => ({
  minutes: 25, daysPerWeek: 3, todayMin: 10, todayDone: false, doneDays: 1, streak: 6, best: 9,
  days: ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, i) => ({ date: `2026-10-${12 + i}`, label, state: i === 0 ? 'done' : i < 3 ? 'not' : 'future' })),
  recent: ['hit', 'current'], todayText: '10 of 25m today', daysText: '1 of 3 days', streakText: '6 weeks', targetText: '25m on 3 days a week',
  ...patch,
})

describe('HabitLine', () => {
  it("shows today's progress, the week's days and the streak", () => {
    const w = mount(HabitLine, { props: { view: view() } })
    expect(w.find('.hl-today').text()).toBe('10 of 25m today')
    expect(w.find('.hl-fill').attributes('style')).toContain('width: 40%')
    expect(w.findAll('.hl-day').map((d) => d.classes().find((c) => c.startsWith('is-')))).toEqual(['is-done', 'is-not', 'is-not', 'is-future', 'is-future', 'is-future', 'is-future'])
    expect(w.findAll('.hl-day')[0].attributes('aria-label')).toBe('Monday: counted')
    expect(w.findAll('.hl-day')[3].attributes('aria-label')).toBe('Thursday: still to come')
    expect(w.find('.hl-week').text()).toBe('1 of 3 days · 6 weeks')
  })

  it('marks today done and pops when the target is reached while watching', async () => {
    const w = mount(HabitLine, { props: { view: view() } })
    expect(w.find('.hl-check').exists()).toBe(false)
    await w.setProps({ view: view({ todayMin: 25, todayDone: true, todayText: '25 of 25m today' }) })
    expect(w.find('.hl-check').exists()).toBe(true)
    expect(w.find('.habit-line').classes()).toContain('is-done')
    expect(w.find('.hl-check').classes().some((c) => c.startsWith('anim-pop'))).toBe(true)
    expect(w.find('.hl-fill').attributes('style')).toContain('width: 100%')
  })
})
```

- [ ] **Step 2: Run** `npx vitest run src/components/goals/HabitLine.test.ts`. Expect failure (no component).

- [ ] **Step 3: Implement** `src/components/goals/HabitLine.vue`:

```vue
<script setup lang="ts">
import { Check } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import type { HabitView } from '../../core/habits'
import { popClass } from '../anim'

const props = withDefaults(defineProps<{ view: HabitView; compact?: boolean }>(), { compact: false })
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const STATE_WORDS = { done: 'counted', not: 'not yet', future: 'still to come' } as const

const pct = computed(() => `${Math.min(100, Math.round((props.view.todayMin / props.view.minutes) * 100))}%`)
/** The check pops when today's target is reached while you're looking, not when the page opens on a done day. */
const pops = ref(0)
watch(() => props.view.todayDone, (now, was) => { if (now && !was) pops.value++ })
</script>

<template>
  <div class="habit-line" :class="{ 'is-done': view.todayDone, 'is-compact': compact }">
    <div class="hl-progress">
      <span class="hl-today">{{ view.todayText }}</span>
      <Check v-if="view.todayDone" class="hl-check" :class="pops ? popClass(pops) : ''" :size="14" :stroke-width="3" aria-hidden="true" />
      <span class="hl-bar" aria-hidden="true"><span class="hl-fill" :style="{ width: pct }"></span></span>
    </div>
    <div class="hl-days" role="list" aria-label="This week">
      <span
        v-for="(d, i) in view.days"
        :key="d.date"
        role="listitem"
        class="hl-day"
        :class="`is-${d.state}`"
        :aria-label="`${DAY_NAMES[i]}: ${STATE_WORDS[d.state]}`"
        :title="`${DAY_NAMES[i]}: ${STATE_WORDS[d.state]}`"
      >{{ d.label }}</span>
    </div>
    <span class="hl-week">{{ view.daysText }} · {{ view.streakText }}</span>
  </div>
</template>

<style scoped>
.habit-line { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-4); font-size: 12px; }
.hl-progress { display: grid; grid-template-columns: auto auto; align-items: center; gap: 3px 6px; min-width: 120px; }
.hl-today { font-weight: 700; }
.hl-check { color: var(--color-text); }
.hl-bar { grid-column: 1 / -1; display: block; height: 3px; background: var(--color-neutral-300); }
.hl-fill { display: block; height: 100%; background: var(--color-accent); }
.is-done .hl-fill { background: var(--color-text); }
.hl-days { display: flex; gap: 3px; }
.hl-day {
  width: 16px; height: 16px; display: grid; place-items: center;
  font-size: 9px; font-weight: 700; line-height: 1; border: 1px solid var(--color-text);
}
.hl-day.is-done { background: var(--color-text); color: var(--color-bg); }
.hl-day.is-not { color: var(--color-neutral-700); }
.hl-day.is-future { border-style: dotted; border-color: var(--color-neutral-500); color: var(--color-neutral-500); }
.hl-week { color: var(--color-neutral-700); }
.is-compact .hl-progress { min-width: 0; }
</style>
```

- [ ] **Step 4: Run** `npx vitest run src/components/goals/HabitLine.test.ts`. Expect PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/goals/HabitLine.vue src/components/goals/HabitLine.test.ts
git commit -m "feat: habit line (today's minutes, the week's days, the streak)"
```

### Task 5: Habit on the Working on card

**Files:**
- Modify: `src/components/today/WorkingOn.vue`, `src/components/today/WorkingOn.test.ts`

**Interfaces:**
- Consumes: `habitView` (Task 2), `HabitLine` (Task 4).

- [ ] **Step 1: Write failing test**, appended inside `describe('WorkingOn', …)`:

```ts
  it('shows a habit line on cards whose goal has a habit', () => {
    const goals = GOALS()
    goals[1] = { ...goals[1], habit: { targets: [{ minutes: 25, daysPerWeek: 3, from: '2026-09-21' }], pauses: [] } }
    const { w } = setup(goals)
    const cards = w.findAll('.wo-card')
    expect(cards[0].find('.wo-habit').exists()).toBe(false)
    expect(cards[1].find('.wo-habit .habit-line .hl-today').text()).toBe('0 of 25m today')
  })
```

- [ ] **Step 2: Run** `npx vitest run src/components/today/WorkingOn.test.ts`. Expect failure.

- [ ] **Step 3: Implement** in `WorkingOn.vue`:
- Import `habitView` from `../../core/habits`, `type HabitView` too, and `HabitLine` from `../goals/HabitLine.vue`.
- Add:

```ts
/** Each card's habit, from the same focus log the rest of Today uses. */
const habits = computed(() => {
  const out = new Map<string, HabitView>()
  for (const g of ember.goals) {
    const v = habitView(g, ember.tasks, ember.logs, ember.today)
    if (v) out.set(g.id, v)
  }
  return out
})
```

- In the card template, after the `.wo-next` block, still inside `.wo-card`:

```vue
        <div v-if="habits.get(c.goalId)" class="wo-habit">
          <HabitLine :view="habits.get(c.goalId)!" compact />
        </div>
```

- Style:

```css
.wo-habit { padding-top: var(--space-2); border-top: 1px solid var(--color-divider); }
```

- [ ] **Step 4: Run** `npx vitest run src/components/today/`. Expect PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/today
git commit -m "feat: Working on cards show the goal's habit"
```

### Task 6: Habit row and editor on the goal page

**Files:**
- Create: `src/components/goals/HabitRow.vue`, `src/components/goals/HabitRow.test.ts`
- Modify: `src/components/goals/GoalSummary.vue`

**Interfaces:**
- Consumes: `habitView`, `liveHabit`, `targetText`, `HABIT` ranges via `clampHabit` (Task 2); `ember.setHabit`, `ember.removeHabit` (Task 3); `HabitLine` (Task 4); `goalStatus` (core/goals); `ui.showUndo`.
- Produces: `HabitRow.vue` with prop `{ goal: Goal }`.

- [ ] **Step 1: Write failing tests** in `src/components/goals/HabitRow.test.ts`:

```ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Goal } from '../../core/model'
import { dataFixture, goalFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import HabitRow from './HabitRow.vue'

function setup(goal: Goal) {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  ember.replaceData(dataFixture({ goals: [goal] }))
  return { w: mount(HabitRow, { props: { goal: ember.goals[0] }, attachTo: document.body }), ember, ui: useUiStore() }
}
const G = () => goalFixture('D3', [['M', [['S', null]]]])
const withHabit = (): Goal => ({ ...G(), habit: { targets: [{ minutes: 25, daysPerWeek: 3, from: '2026-08-31' }], pauses: [] } })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
})
afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('HabitRow', () => {
  it('offers to add a habit, pre-filled with 25 minutes on 5 days', async () => {
    const { w, ember } = setup(G())
    expect(w.find('.hr-line').exists()).toBe(false)
    await w.find('.hr-add').trigger('click')
    expect((w.find('.hr-minutes').element as HTMLInputElement).value).toBe('25')
    expect((w.find('.hr-days input:checked').element as HTMLInputElement).value).toBe('5')
    await w.find('.hr-save').trigger('click')
    expect(ember.goals[0].habit!.targets).toEqual([{ minutes: 25, daysPerWeek: 5, from: '2026-09-21' }])
    expect(w.find('.hr-panel').exists()).toBe(false)
  })

  it('shows the target, the line, the last weeks and the best streak', () => {
    const { w } = setup(withHabit())
    expect(w.find('.hr-kicker').text()).toBe('Habit · 25m on 3 days a week')
    expect(w.find('.hr-line .habit-line').exists()).toBe(true)
    expect(w.findAll('.hr-week')).toHaveLength(4)
    expect(w.findAll('.hr-week').at(-1)!.classes()).toContain('is-current')
    expect(w.find('.hr-best').text()).toBe('Best: –')
  })

  it('edits the target', async () => {
    const { w, ember } = setup(withHabit())
    await w.find('.hr-edit').trigger('click')
    await w.find('.hr-minutes').setValue('50')
    await w.find('.hr-days input[value="7"]').setValue()
    await w.find('.hr-save').trigger('click')
    expect(ember.goals[0].habit!.targets.at(-1)).toEqual({ minutes: 50, daysPerWeek: 7, from: '2026-09-21' })
  })

  it('removes the habit with the undo bar', async () => {
    const { w, ember, ui } = setup(withHabit())
    await w.find('.hr-edit').trigger('click')
    await w.find('.hr-remove').trigger('click')
    expect(ember.goals[0].habit!.deletedOn).toBe('2026-09-23')
    expect(ui.undo?.record.label).toBe('Removed the habit on “D3”')
    expect(w.find('.hr-add').exists()).toBe(true)
  })

  it('shows only the best streak on an achieved goal', () => {
    const { w } = setup({ ...withHabit(), status: 'achieved', achievedOn: '2026-09-20' })
    expect(w.find('.hr-kicker').text()).toBe('Habit · best streak –')
    expect(w.find('.hr-edit').exists()).toBe(false)
    expect(w.find('.hr-line').exists()).toBe(false)
  })
})
```

Add to `src/components/goals/GoalsView.test.ts`:

```ts
  it('shows the habit row on the goal page', () => {
    const w = setup(two())
    expect(w.find('.gs-stats + .habit-row').exists()).toBe(true)
  })
```

- [ ] **Step 2: Run** `npx vitest run src/components/goals/HabitRow.test.ts src/components/goals/GoalsView.test.ts`. Expect failures.

- [ ] **Step 3: Implement** `src/components/goals/HabitRow.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { goalStatus } from '../../core/goals'
import { clampHabit, habitStreak, habitView, habitWeeks, goalMinutesByDay, liveHabit } from '../../core/habits'
import type { Goal } from '../../core/model'
import { plural } from '../../core/format'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import HabitLine from './HabitLine.vue'

const props = defineProps<{ goal: Goal }>()
const ember = useEmberStore()
const ui = useUiStore()

const view = computed(() => habitView(props.goal, ember.tasks, ember.logs, ember.today))
const achieved = computed(() => goalStatus(props.goal) === 'achieved')
/** On an achieved goal, the best run the habit reached. */
const bestEver = computed(() => {
  const h = liveHabit(props.goal)
  if (!h) return 0
  return habitStreak(habitWeeks(h, goalMinutesByDay(props.goal, ember.tasks, ember.logs), ember.today)).best
})
const weeksText = (n: number) => (n ? plural(n, 'week') : '–')

const editing = ref(false)
const minutes = ref('25')
const days = ref(5)
const DAYS = [1, 2, 3, 4, 5, 6, 7]

function open() {
  minutes.value = String(view.value?.minutes ?? 25)
  days.value = view.value?.daysPerWeek ?? 5
  editing.value = true
}
function save() {
  const c = clampHabit(Number(minutes.value), days.value)
  ember.setHabit(props.goal.id, c)
  editing.value = false
}
function remove() {
  editing.value = false
  ui.showUndo(ember.removeHabit(props.goal.id))
}
</script>

<template>
  <section class="habit-row" aria-label="Habit">
    <template v-if="achieved">
      <span v-if="liveHabit(goal)" class="kicker hr-kicker">Habit · best streak {{ weeksText(bestEver) }}</span>
    </template>
    <template v-else-if="view">
      <div class="hr-head">
        <span class="kicker hr-kicker">Habit · {{ view.targetText }}</span>
        <button v-if="!editing" class="btn btn-ghost hr-edit" @click="open">Edit</button>
      </div>
      <div class="hr-line"><HabitLine :view="view" /></div>
      <div class="hr-history">
        <span class="hr-weeks" role="list" aria-label="Recent weeks">
          <span v-for="(s, i) in view.recent" :key="i" role="listitem" class="hr-week" :class="`is-${s}`" :title="s"></span>
        </span>
        <span class="hr-best">Best: {{ weeksText(view.best) }}</span>
      </div>
    </template>
    <button v-else-if="!editing" class="btn btn-ghost hr-add" @click="open">Add a habit</button>

    <div v-if="editing && !achieved" class="edit-panel hr-panel" role="group" aria-label="Habit">
      <div class="ep-row">
        <label class="hr-field">Minutes a day
          <input v-model="minutes" class="input input-sm hr-minutes" type="number" min="5" max="240" step="5" />
        </label>
        <div class="seg hr-days" role="radiogroup" aria-label="Days a week">
          <label v-for="d in DAYS" :key="d" class="seg-opt">
            <input v-model="days" type="radio" :name="`hr-days-${goal.id}`" :value="d" />{{ d }}
          </label>
        </div>
        <span class="hr-unit">days a week</span>
      </div>
      <div class="ep-actions">
        <button class="btn btn-primary hr-save" @click="save">Save</button>
        <button class="btn btn-ghost hr-cancel" @click="editing = false">Cancel</button>
        <button v-if="view" class="btn btn-ghost ep-delete hr-remove" @click="remove">Remove habit</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.habit-row { display: flex; flex-direction: column; gap: var(--space-2); }
.hr-head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-3); }
.hr-edit, .hr-add { align-self: flex-start; padding-inline: 0; font-size: 13px; }
.hr-history { display: flex; align-items: center; gap: var(--space-3); font-size: 12px; color: var(--color-neutral-700); }
.hr-weeks { display: flex; gap: 3px; }
.hr-week { width: 12px; height: 12px; border: 1px solid var(--color-text); }
.hr-week.is-hit { background: var(--color-text); }
.hr-week.is-off { border-style: dotted; border-color: var(--color-neutral-500); }
.hr-week.is-current { border-color: var(--color-accent); }
.hr-field { display: inline-flex; align-items: center; gap: var(--space-2); font-size: 13px; }
.hr-minutes { width: 72px; }
.hr-unit { font-size: 13px; color: var(--color-neutral-700); }
</style>
```

In `GoalSummary.vue`, import `HabitRow` and add `<HabitRow :goal="goal" />` directly after the `.gs-stats` div.

- [ ] **Step 4: Run** `npx vitest run src/components/goals/` and `npm run typecheck`. Expect PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/goals
git commit -m "feat: goal page habit row: target, week history, best streak, and an editor to add, change or remove"
```

### Task 7: Whole-app check

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1:** Run `npm test`, `npm run typecheck` and `npm run build`. All must pass.

- [ ] **Step 2:** In `CLAUDE.md` Architecture, add after the Resources line:

```markdown
- Habits: `src/core/habits.ts` — a goal's optional practice habit (minutes on N days a week), measured from focus logs; weeks Mon–Sun, streak in weeks (`off` weeks: paused or the first week). No new collection: it syncs as part of the goal.
```

- [ ] **Step 3: Browser check** on a spare port (5299; 5199 is the user's), using the demo data (fresh storage):
  - Today's Spanish card shows the habit line.
  - The Speak Spanish goal page shows the habit row with up to 8 week squares.
  - Edit changes the target.
  - Remove shows the undo bar, and Undo brings the habit back.
  - Add a habit to D3, focus on a D3 step with `?demo=1` until 25 minutes are logged, and see today's check pop on the card.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: habits in the architecture notes"
```
