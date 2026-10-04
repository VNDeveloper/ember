# Ember Phase 3 — Today View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Today tab: the "Working on" strip, the Today list (roll-over, deadlines, done collapse, 7-day streak), the add-task row, and the Upcoming list (day groups, Later, Someday).

**Architecture:** All rules live in pure `src/core/` modules — `today.ts` (row notes, Today list, Upcoming groups and summary, Working-on cards) and `activity.ts` (things done per day, streak, level colours; reused by Phase 5). Components in `src/components/` render them: a shared `TaskRow.vue` (reused by Phase 4's goal tasks) and `today/` components. Draft and collapse state live in the non-persisted `useUiStore` so switching tabs keeps them.

**Tech Stack:** Vue 3.5 `<script setup>`, Pinia 4, lucide-vue-next, Vitest 5 + jsdom + @vue/test-utils.

**Spec:** `docs/design/handoff.md` §View 1 — Today, §Interactions → Tasks and dates, Selection; prototype `docs/design/reference/Ember.dc.html` markup lines 56–126, logic lines 544–614 and 617–633.

## Global Constraints

- Zero border radius; 2px rules between major sections, 1px between list rows; button labels flush left; red accent sparingly (paragraph-size accent text = accent-700); no gradients, no emoji, no shadows except the picker dialog.
- Shared classes from `src/styles/`: `.btn*`, `.input`, `.input-sm`, `.seg`, `.check`, `.check-sm`, `.is-done`, `.icon-btn`, `.is-on`, `.swatch`, `.swatch-sm`, `.kicker`, `.label`, `.section-label`, `.tabular`, `.muted`.
- Copy is exact: "Working on", "All goals", "Milestone 02 of 04", "Next step", "Today", "{n}-day streak", "{done} of {total} done", "Add a task…", "Add", "Today | Tomorrow | Pick date | Someday", "Deadline", "No goal", "{n} done", "Hide done", "Due today", "Due Tomorrow", "Due Sep 30", "Deadline passed · Sep 21", "From Sep 21", "Upcoming", "{n} planned · {n} deadline(s) · {n} someday", "Tomorrow", weekday names, "Later", "Someday", "{n} task(s)", "Nothing planned. Pick a date or Someday when you add a task.", "Move to tomorrow", "Move to today", "Focus on this task", "Focus on this step".
- A no-deadline task left from an earlier day is never "Overdue" and never red — grey "From {date}".
- Reflows to ~360px with no horizontal page scroll.
- `src/core/` must not import `vue` or `pinia`.

## Decisions taken in this plan (tell the user)

1. **Tasks finished early stay visible only for the day.** A future-dated task completed today shows struck through in Upcoming today and disappears tomorrow (same rule the prototype uses for Someday). The prototype kept every completed future task forever.
2. **Clicking anywhere on a Working-on card selects its step** (README); the goal name inside opens the goal and doesn't select.
3. **Empty Working-on strip** (no goal has an open step) shows "No goal has an open step. Add steps on the Goals tab." — not designed.
4. **Add-task draft, Today's "done" collapse and Upcoming group toggles survive tab switches** (kept in the UI store), but not reloads.
5. **Checkboxes are `role="checkbox"` with the task title as their label** instead of the prototype's generic "Toggle task".
6. **Enter while composing (IME) doesn't add a task.**
7. **Pop / drop animations are left to Phase 7.**

## Review Focus

1. **A no-deadline task from an earlier day:** shows "From Sep 21" in grey, never red or "Overdue"; a missed deadline shows "Deadline passed · Sep 21" in accent and sorts first. Pinned in Task 1 (`rolls over quietly…`, `missed deadlines first`) and Task 3 (`rolls over quietly`).
2. **A future task completed today:** struck through in Upcoming today, not in the Today list, gone tomorrow. Pinned in Task 1 (`keeps tasks finished early visible for the day only`).
3. **Midnight passes:** yesterday's unfinished tasks join Today with "From …"; tasks finished yesterday leave the list. Pinned in Task 1 (`after midnight…`).
4. **A task linked to a goal that no longer exists:** the row falls back to the tag instead of crashing. Pinned in Task 3 (`falls back to the tag when the goal is gone`).
5. **Picked date in the past:** the date input's `min` is today, and the store clamps anyway (Phase 1). Pinned in Task 4 (`shows a date picker…`).

---

## File structure

```
src/
  core/
    today.ts / today.test.ts         taskNote, isLate, todayList, upcomingGroups, upcomingSummary, workingOn
    activity.ts / activity.test.ts   doneByDay, streakLength, doneLevel, LEVEL_COLORS, lastDays
  stores/
    ui.ts                            + taskDraft, doneOpen, openGroups (ui.test.ts extended)
  components/
    TaskRow.vue / TaskRow.test.ts    shared task row (variants 'today' | 'upcoming')
    today/
      AddTask.vue / AddTask.test.ts
      TodayList.vue / TodayList.test.ts
      UpcomingList.vue / UpcomingList.test.ts
      WorkingOn.vue / WorkingOn.test.ts
      TodayView.vue
  styles/base.css                    + .view (moved from App.vue), .is-hidden
  App.vue                            renders TodayView for the Today tab
  App.test.ts                        + placeholder test for other tabs
```

---

### Task 1: Today derivations and daily activity (core)

**Files:**
- Create: `src/core/today.ts`, `src/core/activity.ts`
- Test: `src/core/today.test.ts`, `src/core/activity.test.ts`

**Interfaces:**
- Consumes: `addDays`, `dayLabel`, `weekdayLong`, `ISODate` (dates.ts); `pad2`, `plural` (format.ts); `goalColor`, `goalStats`, `nextOpenStep`, `stepTarget` (goals.ts); `sameTarget`, model types.
- Produces:
  - `today.ts`: `interface TaskNote { text: string; accent: boolean }`; `taskNote(t, today, showDate = false): TaskNote | null`; `isLate(t, today): boolean`; `interface TodayLists { open: Task[]; done: Task[] }`; `todayList(tasks, today): TodayLists`; `interface UpcomingItem { task: Task; showDate: boolean }`; `interface UpcomingGroup { key: string; label: string; right: string; collapsible: boolean; items: UpcomingItem[] }`; `upcomingGroups(tasks, today): UpcomingGroup[]`; `upcomingSummary(tasks, today): string`; `interface WorkingOnCard { goalId; title; swatch; pct: number; milestoneLabel; milestoneTitle; segments: boolean[]; nextTitle; target: StepTarget; selected: boolean }`; `workingOn(goals, selection): WorkingOnCard[]`.
  - `activity.ts`: `doneByDay(goals, tasks): Map<ISODate, number>`; `streakLength(counts, today): number`; `doneLevel(count): 0|1|2|3|4`; `LEVEL_COLORS` (5 CSS colours, neutral-300 → accent-800); `interface DayCell { date; count; color; isToday; tip }`; `lastDays(counts, today, n = 7): DayCell[]` (oldest first).

- [ ] **Step 1: Write the failing tests**

`src/core/today.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { StepTarget, Task } from './model'
import { goalFixture, taskFixture } from './test-fixtures'
import { isLate, taskNote, todayList, upcomingGroups, upcomingSummary, workingOn } from './today'

const TODAY = '2026-09-23'
const titles = (ts: Task[]) => ts.map((t) => t.title)

describe('taskNote', () => {
  it('says Someday only where dates are shown', () => {
    expect(taskNote(taskFixture('a', { date: null }), TODAY)).toBeNull()
    expect(taskNote(taskFixture('a', { date: null }), TODAY, true)).toEqual({ text: 'Someday', accent: false })
  })

  it('rolls over quietly without a deadline, and flags a missed deadline', () => {
    expect(taskNote(taskFixture('a', { date: '2026-09-21' }), TODAY)).toEqual({ text: 'From Sep 21', accent: false })
    expect(taskNote(taskFixture('a', { date: '2026-09-21', deadline: true }), TODAY)).toEqual({ text: 'Deadline passed · Sep 21', accent: true })
    expect(taskNote(taskFixture('a', { date: '2026-09-21', doneOn: TODAY }), TODAY)).toBeNull()
  })

  it('names deadlines', () => {
    expect(taskNote(taskFixture('a', { deadline: true }), TODAY)).toEqual({ text: 'Due today', accent: true })
    expect(taskNote(taskFixture('a', { date: '2026-09-24', deadline: true }), TODAY)).toEqual({ text: 'Due Tomorrow', accent: true })
    expect(taskNote(taskFixture('a', { date: '2026-09-30', deadline: true }), TODAY)).toEqual({ text: 'Due Sep 30', accent: true })
  })

  it('shows plain dates only where asked', () => {
    expect(taskNote(taskFixture('a', { date: '2026-09-24' }), TODAY)).toBeNull()
    expect(taskNote(taskFixture('a', { date: '2026-09-24' }), TODAY, true)).toEqual({ text: 'Tomorrow', accent: false })
    expect(taskNote(taskFixture('a', { date: '2026-10-09' }), TODAY, true)).toEqual({ text: 'Oct 9', accent: false })
  })
})

describe('todayList', () => {
  const tasks = [
    taskFixture('A'),
    taskFixture('B', { date: '2026-09-21' }),
    taskFixture('C', { date: '2026-09-22', deadline: true }),
    taskFixture('D', { doneOn: TODAY }),
    taskFixture('E', { date: '2026-09-22', doneOn: '2026-09-22' }),
    taskFixture('F', { date: '2026-09-24' }),
    taskFixture('G', { date: null }),
    taskFixture('H', { date: '2026-09-20', deadline: true }),
  ]

  it('shows open tasks dated today or earlier, missed deadlines first, plus tasks done today', () => {
    const list = todayList(tasks, TODAY)
    expect(titles(list.open)).toEqual(['C', 'H', 'A', 'B'])
    expect(titles(list.done)).toEqual(['D'])
    expect(isLate(tasks[2], TODAY)).toBe(true)
    expect(isLate(tasks[1], TODAY)).toBe(false)
  })

  it('after midnight, rolls unfinished tasks over and drops what was done yesterday', () => {
    const list = todayList(tasks, '2026-09-24')
    expect(titles(list.open)).toEqual(['C', 'H', 'A', 'B', 'F'])
    expect(titles(list.done)).toEqual([])
    expect(taskNote(tasks[0], '2026-09-24')).toEqual({ text: 'From Sep 23', accent: false })
  })
})

describe('upcomingGroups', () => {
  const tasks = [
    taskFixture('T1', { date: '2026-09-24' }),
    taskFixture('T2', { date: '2026-09-26' }),
    taskFixture('T3', { date: '2026-09-29' }),
    taskFixture('T4', { date: '2026-09-30' }),
    taskFixture('T5', { date: '2026-10-09' }),
    taskFixture('T6', { date: null }),
    taskFixture('T7', { date: null, doneOn: '2026-09-22' }),
    taskFixture('T8', { date: '2026-09-25', doneOn: TODAY }),
    taskFixture('T9', { date: '2026-09-24', deadline: true }),
  ]

  it('groups the next six days by day, then Later, then Someday', () => {
    const groups = upcomingGroups(tasks, TODAY)
    expect(groups.map((g) => [g.key, g.label, g.right, g.collapsible, g.items.map((i) => i.task.title)])).toEqual([
      ['2026-09-24', 'Tomorrow', 'Sep 24', false, ['T1', 'T9']],
      ['2026-09-25', 'Friday', 'Sep 25', false, ['T8']],
      ['2026-09-26', 'Saturday', 'Sep 26', false, ['T2']],
      ['2026-09-29', 'Tuesday', 'Sep 29', false, ['T3']],
      ['later', 'Later', '2 tasks', true, ['T4', 'T5']],
      ['someday', 'Someday', '1 task', true, ['T6']],
    ])
    expect(groups[4].items.every((i) => i.showDate)).toBe(true)
    expect(groups[0].items.every((i) => !i.showDate)).toBe(true)
  })

  it('keeps tasks finished early visible for the day only', () => {
    expect(upcomingGroups(tasks, TODAY).flatMap((g) => g.items.map((i) => i.task.title))).toContain('T8')
    expect(todayList(tasks, TODAY).done.map((t) => t.title)).not.toContain('T8')
    expect(upcomingGroups(tasks, '2026-09-24').flatMap((g) => g.items.map((i) => i.task.title))).not.toContain('T8')
  })

  it('is empty with nothing planned', () => {
    expect(upcomingGroups([taskFixture('A')], TODAY)).toEqual([])
  })

  it('summarises open plans, deadlines and someday tasks', () => {
    expect(upcomingSummary(tasks, TODAY)).toBe('6 planned · 1 deadline · 1 someday')
    expect(upcomingSummary([], TODAY)).toBe('0 planned · 0 deadlines')
  })
})

describe('workingOn', () => {
  const goals = [
    goalFixture('D3', [['First charts', [['Bar', '2026-09-01'], ['Line', null], ['Scatter', null]]], ['Motion', [['Easing', null]]]]),
    goalFixture('Finished', [['Only', [['A', '2026-09-01']]]]),
    goalFixture('Spanish', [['Talk', [['Tutor', null]]]]),
  ]
  const LINE: StepTarget = { kind: 'step', goalId: 'D3', msId: 'D3/First charts', stepId: 'D3/First charts/Line' }

  it('makes one card per goal with an open step', () => {
    const cards = workingOn(goals, LINE)
    expect(cards).toHaveLength(2)
    expect(cards[0]).toEqual({
      goalId: 'D3', title: 'D3', swatch: 'var(--color-accent)', pct: 25,
      milestoneLabel: 'Milestone 01 of 02', milestoneTitle: 'First charts',
      segments: [true, false, false], nextTitle: 'Line', target: LINE, selected: true,
    })
    expect(cards[1]).toMatchObject({ goalId: 'Spanish', swatch: 'var(--color-accent-300)', pct: 0, milestoneLabel: 'Milestone 01 of 01', selected: false })
  })
})
```

`src/core/activity.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { LEVEL_COLORS, doneByDay, doneLevel, lastDays, streakLength } from './activity'
import { goalFixture, taskFixture } from './test-fixtures'

const TODAY = '2026-09-23'

describe('doneByDay', () => {
  it('counts finished tasks and steps per day', () => {
    const goals = [goalFixture('D3', [['M', [['A', '2026-09-22'], ['B', '2026-09-22'], ['C', null]]]])]
    const tasks = [taskFixture('x', { doneOn: '2026-09-22' }), taskFixture('y', { doneOn: TODAY }), taskFixture('z')]
    const counts = doneByDay(goals, tasks)
    expect(counts.get('2026-09-22')).toBe(3)
    expect(counts.get(TODAY)).toBe(1)
    expect(counts.size).toBe(2)
  })
})

describe('streakLength', () => {
  it('counts back from today, or from yesterday while today is still empty', () => {
    const counts = new Map([['2026-09-22', 2], ['2026-09-21', 1], ['2026-09-19', 4]])
    expect(streakLength(counts, TODAY)).toBe(2)
    counts.set(TODAY, 1)
    expect(streakLength(counts, TODAY)).toBe(3)
    expect(streakLength(new Map(), TODAY)).toBe(0)
  })
})

describe('levels', () => {
  it('buckets counts 0, 1–2, 3–4, 5–6, 7+', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 20].map(doneLevel)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4])
    expect(LEVEL_COLORS).toEqual([
      'var(--color-neutral-300)', 'var(--color-accent-200)', 'var(--color-accent-400)', 'var(--color-accent)', 'var(--color-accent-800)',
    ])
  })

  it('lists the last seven days, oldest first, marking today', () => {
    const cells = lastDays(new Map([[TODAY, 1], ['2026-09-17', 5]]), TODAY)
    expect(cells.map((c) => c.date)).toEqual(['2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23'])
    expect(cells[0]).toEqual({ date: '2026-09-17', count: 5, color: 'var(--color-accent)', isToday: false, tip: 'Sep 17: 5 done' })
    expect(cells[6]).toMatchObject({ count: 1, color: 'var(--color-accent-200)', isToday: true, tip: 'Sep 23: 1 done' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/core/today.test.ts src/core/activity.test.ts`
Expected: FAIL — cannot resolve `./today`, `./activity`.

- [ ] **Step 3: Write `src/core/today.ts`**

```ts
import { addDays, dayLabel, weekdayLong, type ISODate } from './dates'
import { pad2, plural } from './format'
import { goalColor, goalStats, nextOpenStep, stepTarget } from './goals'
import type { Goal, Selection, StepTarget, Task } from './model'
import { sameTarget } from './model'

export interface TaskNote { text: string; accent: boolean }

const relDay = (d: ISODate, today: ISODate): string =>
  d === today ? 'Today' : d === addDays(today, 1) ? 'Tomorrow' : dayLabel(d)

/** The note after a task's tag: deadlines, quiet roll-over, or the date where dates are shown. */
export function taskNote(t: Task, today: ISODate, showDate = false): TaskNote | null {
  if (t.date == null) return showDate ? { text: 'Someday', accent: false } : null
  if (t.doneOn == null && t.date < today) {
    return t.deadline
      ? { text: `Deadline passed · ${dayLabel(t.date)}`, accent: true }
      : { text: `From ${dayLabel(t.date)}`, accent: false }
  }
  if (t.deadline) return { text: t.date === today ? 'Due today' : `Due ${relDay(t.date, today)}`, accent: true }
  if (showDate) return { text: relDay(t.date, today), accent: false }
  return null
}

export const isLate = (t: Task, today: ISODate): boolean =>
  t.deadline && t.date != null && t.date < today && t.doneOn == null

export interface TodayLists { open: Task[]; done: Task[] }

/** Open tasks dated today or earlier (missed deadlines first), plus tasks finished today. */
export function todayList(tasks: Task[], today: ISODate): TodayLists {
  const list = tasks.filter((t) => t.date != null && t.date <= today && (t.doneOn == null || t.doneOn === today))
  const open = list.filter((t) => t.doneOn == null)
  return {
    open: [...open.filter((t) => isLate(t, today)), ...open.filter((t) => !isLate(t, today))],
    done: list.filter((t) => t.doneOn != null),
  }
}

export interface UpcomingItem { task: Task; showDate: boolean }
export interface UpcomingGroup { key: string; label: string; right: string; collapsible: boolean; items: UpcomingItem[] }

const byDate = (a: Task, b: Task) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : 0)
/** Finished tasks stay visible only on the day they were finished. */
const visibleToday = (t: Task, today: ISODate) => t.doneOn == null || t.doneOn === today

export function upcomingGroups(tasks: Task[], today: ISODate): UpcomingGroup[] {
  const tomorrow = addDays(today, 1)
  const horizon = addDays(today, 6)
  const groups: UpcomingGroup[] = []
  const future = tasks.filter((t) => t.date != null && t.date > today && visibleToday(t, today)).sort(byDate)
  for (const t of future) {
    const date = t.date!
    const later = date > horizon
    const key = later ? 'later' : date
    let g = groups.find((x) => x.key === key)
    if (!g) {
      g = {
        key,
        label: later ? 'Later' : date === tomorrow ? 'Tomorrow' : weekdayLong(date),
        right: later ? '' : dayLabel(date),
        collapsible: later,
        items: [],
      }
      groups.push(g)
    }
    g.items.push({ task: t, showDate: later })
  }
  const someday = tasks.filter((t) => t.date == null && visibleToday(t, today))
  if (someday.length) {
    groups.push({ key: 'someday', label: 'Someday', right: '', collapsible: true, items: someday.map((task) => ({ task, showDate: false })) })
  }
  for (const g of groups) if (g.collapsible) g.right = plural(g.items.length, 'task')
  return groups
}

export function upcomingSummary(tasks: Task[], today: ISODate): string {
  const open = tasks.filter((t) => t.doneOn == null)
  const planned = open.filter((t) => t.date != null && t.date > today)
  const deadlines = planned.filter((t) => t.deadline).length
  const someday = open.filter((t) => t.date == null).length
  return `${planned.length} planned · ${plural(deadlines, 'deadline')}${someday ? ` · ${someday} someday` : ''}`
}

export interface WorkingOnCard {
  goalId: string
  title: string
  swatch: string
  pct: number
  milestoneLabel: string
  milestoneTitle: string
  /** One entry per step in the current milestone: done or not. */
  segments: boolean[]
  nextTitle: string
  target: StepTarget
  selected: boolean
}

export function workingOn(goals: Goal[], selection: Selection): WorkingOnCard[] {
  return goals.flatMap((g, gi) => {
    const next = nextOpenStep(g)
    if (!next) return []
    const target = stepTarget(g, next.milestone, next.step)
    return [{
      goalId: g.id,
      title: g.title,
      swatch: goalColor(gi),
      pct: goalStats(g).pct,
      milestoneLabel: `Milestone ${pad2(next.mi + 1)} of ${pad2(g.milestones.length)}`,
      milestoneTitle: next.milestone.title,
      segments: next.milestone.steps.map((s) => s.doneOn != null),
      nextTitle: next.step.title,
      target,
      selected: sameTarget(selection, target),
    }]
  })
}
```

- [ ] **Step 4: Write `src/core/activity.ts`**

```ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS; no type errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(core): add Today list, Upcoming groups, Working-on cards and daily activity"
```

---

### Task 2: UI state for the Today tab

**Files:**
- Modify: `src/stores/ui.ts`, `src/stores/ui.test.ts`

**Interfaces:**
- Consumes: `When` type from `src/stores/ember.ts`.
- Produces on `useUiStore()`: `taskDraft` (reactive `{ title: string; when: When; date: ISODate | ''; deadline: boolean; goalId: string }`, defaults `''`, `'today'`, `''`, `false`, `''`), `doneOpen` (ref boolean, default false), `openGroups` (reactive `Record<string, boolean>`, default `{}`).

- [ ] **Step 1: Write the failing test** — append to `src/stores/ui.test.ts` inside the `describe('ui store', …)` block:

```ts
  it('holds the add-task draft and Today collapse state', () => {
    const ui = useUiStore()
    expect(ui.taskDraft).toEqual({ title: '', when: 'today', date: '', deadline: false, goalId: '' })
    expect(ui.doneOpen).toBe(false)
    expect(ui.openGroups).toEqual({})
    ui.openGroups.later = true
    expect(ui.openGroups.later).toBe(true)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/stores/ui.test.ts`
Expected: FAIL — `taskDraft` is undefined.

- [ ] **Step 3: Extend `src/stores/ui.ts`**

Change the vue import to `import { reactive, ref } from 'vue'`, add `import type { ISODate } from '../core/dates'` and `import type { When } from './ember'`, then add inside the store (after `focusModeOpen`):

```ts
  /** Add-task row draft; survives tab switches, not reloads. */
  const taskDraft = reactive<{ title: string; when: When; date: ISODate | ''; deadline: boolean; goalId: string }>({
    title: '', when: 'today', date: '', deadline: false, goalId: '',
  })
  /** Today list: finished rows expanded. */
  const doneOpen = ref(false)
  /** Upcoming: which collapsible groups (later, someday) are open. */
  const openGroups = reactive<Record<string, boolean>>({})
```

and add `taskDraft, doneOpen, openGroups,` to the returned object.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(store): keep add-task draft and Today collapse state in the UI store"
```

---

### Task 3: Shared task row

**Files:**
- Create: `src/components/TaskRow.vue`
- Modify: `src/styles/base.css` (add `.is-hidden`)
- Test: `src/components/TaskRow.test.ts`

**Interfaces:**
- Consumes: `taskNote` (today.ts), `goalColor`, `fmtM`, `sameTarget`; store `today`, `goals`, `tally`, `selection`, `toggleTask`, `moveToTomorrow`, `moveToToday`, `select`.
- Produces: `<TaskRow :task="Task" variant="'today' | 'upcoming'" :show-date="boolean" />`. Pass the task object from the store so changes re-render. CSS hooks: `.task-row`, `.is-today|.is-upcoming`, `.is-done`, `.is-selected`, `.check`, `.tr-title`, `.tr-label`, `.tr-note`, `.is-accent`, `.tr-spent`, `.tr-defer`, `.tr-focus`, `.tr-pull`, `.is-hidden`.

- [ ] **Step 1: Write the failing test**

`src/components/TaskRow.test.ts`:
```ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EmberData, Task } from '../core/model'
import { dataFixture, goalFixture, taskFixture } from '../core/test-fixtures'
import { useEmberStore } from '../stores/ember'
import TaskRow from './TaskRow.vue'

function setup(task: Task, variant: 'today' | 'upcoming' = 'today', showDate = false, extra: Partial<EmberData> = {}) {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  ember.replaceData(dataFixture({ goals: [goalFixture('D3', [['M', [['S', null]]]])], tasks: [task], ...extra }))
  const w = mount(TaskRow, { props: { task: ember.tasks[0], variant, showDate } })
  return { w, ember }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('TaskRow — today', () => {
  it('shows the title, tag and focused time', () => {
    const { w } = setup(taskFixture('Review PR'), 'today', false, {
      logs: [{ id: 'l', at: 0, date: '2026-09-20', min: 25, target: { kind: 'task', taskId: 'Review PR' } }],
    })
    expect(w.find('.tr-title').text()).toBe('Review PR')
    expect(w.find('.tr-label').text()).toBe('Work')
    expect(w.find('.tr-note').exists()).toBe(false)
    expect(w.find('.tr-spent').text()).toBe('25m')
  })

  it('shows the goal name with its colour', () => {
    const { w } = setup(taskFixture('Paper', { goalId: 'D3', tag: '' }))
    expect(w.find('.tr-label').text()).toBe('D3')
    expect(w.find('.tr-label .swatch').attributes('style')).toContain('var(--color-accent)')
  })

  it('falls back to the tag when the goal is gone', () => {
    const { w } = setup(taskFixture('Orphan', { goalId: 'deleted', tag: 'Home' }))
    expect(w.find('.tr-label').text()).toBe('Home')
    expect(w.find('.tr-label .swatch').exists()).toBe(false)
  })

  it('completes and un-completes, hiding the row actions while done', async () => {
    const { w, ember } = setup(taskFixture('Review PR'))
    await w.find('.check').trigger('click')
    expect(ember.tasks[0].doneOn).toBe('2026-09-23')
    expect(w.find('.task-row').classes()).toContain('is-done')
    expect(w.find('.check').attributes('aria-checked')).toBe('true')
    expect(w.find('.tr-focus').classes()).toContain('is-hidden')
    expect(w.find('.tr-defer').classes()).toContain('is-hidden')
    await w.find('.check').trigger('click')
    expect(ember.tasks[0].doneOn).toBeNull()
  })

  it('moves to tomorrow', async () => {
    const { w, ember } = setup(taskFixture('Review PR'))
    await w.find('.tr-defer').trigger('click')
    expect(ember.tasks[0].date).toBe('2026-09-24')
  })

  it('selects the task for focus', async () => {
    const { w, ember } = setup(taskFixture('Review PR'))
    await w.find('.tr-focus').trigger('click')
    expect(ember.selection).toEqual({ kind: 'task', taskId: 'Review PR' })
    expect(w.find('.task-row').classes()).toContain('is-selected')
    expect(w.find('.tr-focus').classes()).toContain('is-on')
  })

  it('flags deadlines in accent', () => {
    const { w } = setup(taskFixture('Insurance', { deadline: true }))
    expect(w.find('.tr-note').text()).toBe('Due today')
    expect(w.find('.tr-note').classes()).toContain('is-accent')
    expect(w.find('.tr-note svg').exists()).toBe(true)
  })

  it('rolls over quietly', () => {
    const { w } = setup(taskFixture('Dentist', { date: '2026-09-21' }))
    expect(w.find('.tr-note').text()).toBe('From Sep 21')
    expect(w.find('.tr-note').classes()).not.toContain('is-accent')
    expect(w.find('.tr-note svg').exists()).toBe(false)
  })
})

describe('TaskRow — upcoming', () => {
  it('moves a Someday task to today and has no focus button or time', async () => {
    const { w, ember } = setup(taskFixture('Sourdough', { date: null }), 'upcoming')
    expect(w.find('.check').classes()).toContain('check-sm')
    expect(w.find('.tr-focus').exists()).toBe(false)
    expect(w.find('.tr-spent').exists()).toBe(false)
    expect(w.find('.tr-pull').classes()).not.toContain('is-hidden')
    await w.find('.tr-pull').trigger('click')
    expect(ember.tasks[0].date).toBe('2026-09-23')
  })

  it('shows the date where asked', () => {
    const { w } = setup(taskFixture('Car service', { date: '2026-10-09' }), 'upcoming', true)
    expect(w.find('.tr-note').text()).toBe('Oct 9')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/TaskRow.test.ts`
Expected: FAIL — cannot resolve `./TaskRow.vue`.

- [ ] **Step 3: Add `.is-hidden` to `src/styles/base.css`** (after `.muted`):

```css
/* Keeps grid columns aligned while hiding a control (also removes it from the tab order). */
.is-hidden { visibility: hidden; }
```

- [ ] **Step 4: Write `src/components/TaskRow.vue`**

```vue
<script setup lang="ts">
import { ArrowLeftToLine, ArrowRightToLine, Check, Flag, Timer } from 'lucide-vue-next'
import { computed } from 'vue'
import { fmtM } from '../core/format'
import { goalColor } from '../core/goals'
import type { Task } from '../core/model'
import { sameTarget } from '../core/model'
import { taskNote } from '../core/today'
import { useEmberStore } from '../stores/ember'

const props = withDefaults(defineProps<{ task: Task; variant: 'today' | 'upcoming'; showDate?: boolean }>(), { showDate: false })
const ember = useEmberStore()

const done = computed(() => props.task.doneOn != null)
const goalIndex = computed(() => (props.task.goalId ? ember.goals.findIndex((g) => g.id === props.task.goalId) : -1))
const goal = computed(() => (goalIndex.value >= 0 ? ember.goals[goalIndex.value] : null))
const note = computed(() => taskNote(props.task, ember.today, props.showDate))
const spent = computed(() => {
  const min = ember.tally.spent.get(`task:${props.task.id}`) ?? 0
  return min ? fmtM(min) : ''
})
const target = computed(() => ({ kind: 'task' as const, taskId: props.task.id }))
const selected = computed(() => sameTarget(ember.selection, target.value))
const canDefer = computed(() => !done.value && props.task.date != null && props.task.date <= ember.today)
const canPull = computed(() => !done.value && (props.task.date == null || props.task.date > ember.today))
</script>

<template>
  <div class="task-row" :class="[`is-${variant}`, { 'is-done': done, 'is-selected': selected && variant === 'today' }]">
    <button
      class="check"
      :class="{ 'check-sm': variant === 'upcoming', 'is-done': done }"
      role="checkbox"
      :aria-checked="done"
      :aria-label="task.title"
      @click="ember.toggleTask(task.id)"
    >
      <Check v-if="done" :size="variant === 'upcoming' ? 12 : 14" :stroke-width="3.5" />
    </button>
    <div class="tr-body">
      <span class="tr-title">{{ task.title }}</span>
      <span class="tr-meta">
        <span class="tr-label">
          <span v-if="goal" class="swatch swatch-sm" :style="{ background: goalColor(goalIndex) }"></span>{{ goal ? goal.title : task.tag }}
        </span>
        <span v-if="note" class="tr-note" :class="{ 'is-accent': note.accent }">
          <Flag v-if="task.deadline" :size="12" :stroke-width="2.5" />{{ note.text }}
        </span>
      </span>
    </div>
    <template v-if="variant === 'today'">
      <span class="tr-spent tabular">{{ spent }}</span>
      <button
        class="icon-btn tr-defer"
        :class="{ 'is-hidden': !canDefer }"
        aria-label="Move to tomorrow"
        title="Move to tomorrow"
        @click="ember.moveToTomorrow(task.id)"
      >
        <ArrowRightToLine :size="16" :stroke-width="2.25" />
      </button>
      <button
        class="icon-btn tr-focus"
        :class="{ 'is-on': selected, 'is-hidden': done }"
        aria-label="Focus on this task"
        title="Focus on this task"
        @click="ember.select(target)"
      >
        <Timer :size="16" :stroke-width="2.25" />
      </button>
    </template>
    <button
      v-else
      class="icon-btn tr-pull"
      :class="{ 'is-hidden': !canPull }"
      aria-label="Move to today"
      title="Move to today"
      @click="ember.moveToToday(task.id)"
    >
      <ArrowLeftToLine :size="16" :stroke-width="2.25" />
    </button>
  </div>
</template>

<style scoped>
.task-row { display: grid; align-items: center; border-bottom: 1px solid var(--color-divider); }
.task-row.is-today { grid-template-columns: 22px minmax(0, 1fr) auto 28px 28px; gap: var(--space-2) var(--space-3); padding: var(--space-2); }
.task-row.is-upcoming { grid-template-columns: 18px minmax(0, 1fr) 28px; gap: var(--space-3); padding: 6px var(--space-2); }
.task-row.is-selected { background: var(--color-accent-100); }
.tr-body { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.tr-title { font-size: 14px; overflow-wrap: anywhere; }
.task-row.is-done .tr-title { text-decoration: line-through; color: var(--color-neutral-700); }
.tr-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 10px; font-size: 11px; color: var(--color-neutral-700); }
.tr-label { display: flex; align-items: center; gap: 5px; }
.tr-note { display: flex; align-items: center; gap: 4px; font-weight: 700; }
.tr-note.is-accent { color: var(--color-accent-700); }
.tr-note svg { flex: none; }
.tr-spent { font-size: 12px; color: var(--color-neutral-700); }
</style>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add shared task row"
```

---

### Task 4: Add-task row

**Files:**
- Create: `src/components/today/AddTask.vue`
- Test: `src/components/today/AddTask.test.ts`

**Interfaces:**
- Consumes: `ui.taskDraft`; store `today`, `goals`, `addTask`; `addDays`.
- Produces: `<AddTask />`. CSS hooks: `.at-title` (input), `.at-add`, `.seg-opt input` (When radios in order Today, Tomorrow, Pick date, Someday), `.at-date`, `.at-deadline`, `.at-goal`.

- [ ] **Step 1: Write the failing test**

`src/components/today/AddTask.test.ts`:
```ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dataFixture, goalFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import AddTask from './AddTask.vue'

function setup() {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  ember.replaceData(dataFixture({ goals: [goalFixture('D3', [])] }))
  return { w: mount(AddTask), ember }
}
const when = (w: ReturnType<typeof mount>, i: number) => w.findAll('.seg-opt input')[i].setValue(true)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('AddTask', () => {
  it('adds an Inbox task for today on Enter and clears the title', async () => {
    const { w, ember } = setup()
    await w.find('.at-title').setValue('Call the landlord')
    await w.find('.at-title').trigger('keydown', { key: 'Enter' })
    expect(ember.tasks).toHaveLength(1)
    expect(ember.tasks[0]).toMatchObject({ title: 'Call the landlord', tag: 'Inbox', date: '2026-09-23', deadline: false, goalId: null })
    expect((w.find('.at-title').element as HTMLInputElement).value).toBe('')
  })

  it('adds for tomorrow with the Add button', async () => {
    const { w, ember } = setup()
    await when(w, 1)
    await w.find('.at-title').setValue('Pay rent')
    await w.find('.at-add').trigger('click')
    expect(ember.tasks[0].date).toBe('2026-09-24')
  })

  it('shows a date picker for Pick date, starting two days out and never before today', async () => {
    const { w, ember } = setup()
    expect(w.find('.at-date').exists()).toBe(false)
    await when(w, 2)
    const date = w.find('.at-date')
    expect(date.attributes('min')).toBe('2026-09-23')
    expect((date.element as HTMLInputElement).value).toBe('2026-09-25')
    await w.find('.at-title').setValue('Plan trip')
    await w.find('.at-add').trigger('click')
    expect(ember.tasks[0].date).toBe('2026-09-25')
  })

  it('toggles Deadline, resets it after adding, and hides it for Someday', async () => {
    const { w, ember } = setup()
    await w.find('.at-deadline').trigger('click')
    expect(w.find('.at-deadline').attributes('aria-pressed')).toBe('true')
    await w.find('.at-title').setValue('Renew insurance')
    await w.find('.at-add').trigger('click')
    expect(ember.tasks[0].deadline).toBe(true)
    expect(w.find('.at-deadline').attributes('aria-pressed')).toBe('false')
    await when(w, 3)
    expect(w.find('.at-deadline').exists()).toBe(false)
  })

  it('links the task to a goal', async () => {
    const { w, ember } = setup()
    await w.find('.at-goal').setValue('D3')
    await w.find('.at-title').setValue('Read Tufte')
    await w.find('.at-add').trigger('click')
    expect(ember.tasks[0].goalId).toBe('D3')
  })

  it('ignores an empty title', async () => {
    const { w, ember } = setup()
    await w.find('.at-add').trigger('click')
    expect(ember.tasks).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/today/AddTask.test.ts`
Expected: FAIL — cannot resolve `./AddTask.vue`.

- [ ] **Step 3: Write `src/components/today/AddTask.vue`**

```vue
<script setup lang="ts">
import { Flag, Plus } from 'lucide-vue-next'
import { onMounted } from 'vue'
import { addDays } from '../../core/dates'
import { useEmberStore, type When } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'

const ember = useEmberStore()
const draft = useUiStore().taskDraft
const WHEN: [When, string][] = [['today', 'Today'], ['tomorrow', 'Tomorrow'], ['date', 'Pick date'], ['someday', 'Someday']]

onMounted(() => {
  if (!draft.date) draft.date = addDays(ember.today, 2)
})

function setWhen(w: When) {
  draft.when = w
  if (w === 'someday') draft.deadline = false
}

function add() {
  const task = ember.addTask({
    title: draft.title, when: draft.when, date: draft.date || undefined, deadline: draft.deadline, goalId: draft.goalId || null,
  })
  if (!task) return
  draft.title = ''
  draft.deadline = false
}

function onEnter(e: KeyboardEvent) {
  if (!e.isComposing) add()
}
</script>

<template>
  <div class="add-task">
    <div class="at-row">
      <input v-model="draft.title" class="input at-title" placeholder="Add a task…" aria-label="New task" @keydown.enter="onEnter" />
      <button class="btn btn-primary at-add" @click="add"><Plus :size="16" :stroke-width="2.5" />Add</button>
    </div>
    <div class="at-options">
      <div class="seg" role="radiogroup" aria-label="When">
        <label v-for="[value, label] in WHEN" :key="value" class="seg-opt">
          <input type="radio" name="ember-when" :value="value" :checked="draft.when === value" @change="setWhen(value)" />{{ label }}
        </label>
      </div>
      <input v-if="draft.when === 'date'" v-model="draft.date" type="date" class="input input-sm at-date" aria-label="Date" :min="ember.today" />
      <button
        v-if="draft.when !== 'someday'"
        class="at-deadline"
        :class="{ 'is-on': draft.deadline }"
        :aria-pressed="draft.deadline"
        title="Mark as a hard deadline"
        @click="draft.deadline = !draft.deadline"
      >
        <Flag :size="14" :stroke-width="2.5" />Deadline
      </button>
      <select v-model="draft.goalId" class="input input-sm at-goal" aria-label="Link to a goal">
        <option value="">No goal</option>
        <option v-for="g in ember.goals" :key="g.id" :value="g.id">{{ g.title }}</option>
      </select>
    </div>
  </div>
</template>

<style scoped>
.add-task { display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-1); }
.at-row { display: flex; gap: var(--space-2); }
.at-options { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
.at-goal { max-width: 100%; }
.at-deadline {
  display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; font-size: 13px;
  border: 1px solid var(--color-divider); background: transparent; color: var(--color-text);
}
.at-deadline:hover { border-color: var(--color-accent); }
.at-deadline.is-on { background: var(--color-accent-100); border-color: var(--color-accent); color: var(--color-accent-800); }
.at-deadline svg { flex: none; }
</style>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add the add-task row"
```

---

### Task 5: Today list and Upcoming list

**Files:**
- Create: `src/components/today/TodayList.vue`, `src/components/today/UpcomingList.vue`
- Test: `src/components/today/TodayList.test.ts`, `src/components/today/UpcomingList.test.ts`

**Interfaces:**
- Consumes: `todayList`, `upcomingGroups`, `upcomingSummary` (today.ts); `doneByDay`, `lastDays`, `streakLength` (activity.ts); `TaskRow`, `AddTask`; `ui.doneOpen`, `ui.openGroups`.
- Produces: `<TodayList />`, `<UpcomingList />`. CSS hooks: `.tl-week span` (7 squares, `.is-today`), `.tl-streak`, `.tl-summary`, `.tl-done-toggle`; `.up-summary`, `.up-group`, `.up-label`, `.up-right`, `.up-toggle`, `.up-empty`.

- [ ] **Step 1: Write the failing tests**

`src/components/today/TodayList.test.ts`:
```ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dataFixture, taskFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import TodayList from './TodayList.vue'

const TODAY = '2026-09-23'

function setup() {
  setActivePinia(createPinia())
  useEmberStore().replaceData(dataFixture({
    tasks: [
      taskFixture('A'),
      taskFixture('B', { doneOn: TODAY }),
      taskFixture('C', { date: '2026-09-21', deadline: true }),
      taskFixture('D', { date: '2026-09-25' }),
    ],
  }))
  return mount(TodayList)
}
const rowTitles = (w: ReturnType<typeof mount>) => w.findAll('.tr-title').map((t) => t.text())

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('TodayList', () => {
  it('lists open tasks, missed deadlines first, with done ones collapsed', () => {
    const w = setup()
    expect(rowTitles(w)).toEqual(['C', 'A'])
    expect(w.find('.tl-done-toggle').text()).toBe('1 done')
    expect(w.find('.tl-summary').text()).toBe('1 of 3 done')
  })

  it('expands and hides finished rows', async () => {
    const w = setup()
    await w.find('.tl-done-toggle').trigger('click')
    expect(rowTitles(w)).toEqual(['C', 'A', 'B'])
    expect(w.find('.tl-done-toggle').text()).toBe('Hide done')
    await w.find('.tl-done-toggle').trigger('click')
    expect(rowTitles(w)).toEqual(['C', 'A'])
  })

  it('shows the 7-day strip and the streak', () => {
    const w = setup()
    const days = w.findAll('.tl-week span')
    expect(days).toHaveLength(7)
    expect(days[6].classes()).toContain('is-today')
    expect(days[6].attributes('title')).toBe('Sep 23: 1 done')
    expect(w.find('.tl-streak').text()).toBe('1-day streak')
  })
})
```

`src/components/today/UpcomingList.test.ts`:
```ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../../core/model'
import { dataFixture, taskFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import UpcomingList from './UpcomingList.vue'

function setup(tasks: Task[]) {
  setActivePinia(createPinia())
  useEmberStore().replaceData(dataFixture({ tasks }))
  return mount(UpcomingList)
}
const tasks = () => [
  taskFixture('Landlord', { date: '2026-09-24' }),
  taskFixture('Car service', { date: '2026-10-09' }),
  taskFixture('Sourdough', { date: null }),
]

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('UpcomingList', () => {
  it('shows day groups open and Later / Someday collapsed', () => {
    const w = setup(tasks())
    expect(w.findAll('.up-label').map((l) => l.text())).toEqual(['Tomorrow', 'Later', 'Someday'])
    expect(w.findAll('.up-right').map((l) => l.text())).toEqual(['Sep 24', '1 task', '1 task'])
    expect(w.findAll('.tr-title').map((t) => t.text())).toEqual(['Landlord'])
    expect(w.find('.up-summary').text()).toBe('2 planned · 0 deadlines · 1 someday')
  })

  it('expands Later with dates shown', async () => {
    const w = setup(tasks())
    const later = w.findAll('.up-toggle')[0]
    expect(later.attributes('aria-expanded')).toBe('false')
    await later.trigger('click')
    expect(later.attributes('aria-expanded')).toBe('true')
    expect(w.findAll('.tr-title').map((t) => t.text())).toEqual(['Landlord', 'Car service'])
    expect(w.findAll('.tr-note').map((n) => n.text())).toEqual(['Oct 9'])
  })

  it('says when nothing is planned', () => {
    const w = setup([taskFixture('Today only')])
    expect(w.find('.up-empty').text()).toBe('Nothing planned. Pick a date or Someday when you add a task.')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/components/today`
Expected: TodayList and UpcomingList suites FAIL — cannot resolve the `.vue` files (AddTask suite still passes).

- [ ] **Step 3: Write `src/components/today/TodayList.vue`**

```vue
<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next'
import { computed } from 'vue'
import { doneByDay, lastDays, streakLength } from '../../core/activity'
import { todayList } from '../../core/today'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import TaskRow from '../TaskRow.vue'
import AddTask from './AddTask.vue'

const ember = useEmberStore()
const ui = useUiStore()

const list = computed(() => todayList(ember.tasks, ember.today))
const total = computed(() => list.value.open.length + list.value.done.length)
const counts = computed(() => doneByDay(ember.goals, ember.tasks))
const week = computed(() => lastDays(counts.value, ember.today, 7))
const streak = computed(() => streakLength(counts.value, ember.today))
</script>

<template>
  <section class="today-list">
    <div class="tl-head">
      <h4>Today</h4>
      <div class="tl-stats">
        <div class="tl-week" title="Last 7 days">
          <span v-for="d in week" :key="d.date" :title="d.tip" :class="{ 'is-today': d.isToday }" :style="{ background: d.color }"></span>
        </div>
        <span class="tl-streak">{{ streak }}-day streak</span>
        <span class="tl-summary">{{ list.done.length }} of {{ total }} done</span>
      </div>
    </div>
    <AddTask />
    <div class="tl-rows">
      <TaskRow v-for="t in list.open" :key="t.id" :task="t" variant="today" />
      <template v-if="ui.doneOpen">
        <TaskRow v-for="t in list.done" :key="t.id" :task="t" variant="today" />
      </template>
      <button v-if="list.done.length" class="tl-done-toggle" :aria-expanded="ui.doneOpen" @click="ui.doneOpen = !ui.doneOpen">
        <ChevronRight :size="14" :stroke-width="2.5" :class="{ 'is-open': ui.doneOpen }" />{{ ui.doneOpen ? 'Hide done' : `${list.done.length} done` }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.today-list { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
.tl-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; }
.tl-stats { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-3); font-size: 13px; color: var(--color-neutral-700); }
.tl-week { display: flex; gap: 3px; }
.tl-week span { width: 10px; height: 10px; }
.tl-week span.is-today { box-shadow: inset 0 0 0 2px var(--color-text); }
.tl-summary { color: var(--color-text); font-weight: 700; }
.tl-rows { display: flex; flex-direction: column; border-top: 2px solid var(--color-divider); }
.tl-done-toggle {
  display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2);
  border: 0; border-bottom: 1px solid var(--color-divider); background: transparent;
  font-size: 13px; color: var(--color-neutral-700); text-align: left;
}
.tl-done-toggle:hover { background: var(--color-accent-100); }
.tl-done-toggle svg { flex: none; transition: transform .15s; }
.tl-done-toggle svg.is-open { transform: rotate(90deg); }
</style>
```

- [ ] **Step 4: Write `src/components/today/UpcomingList.vue`**

```vue
<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next'
import { computed } from 'vue'
import { upcomingGroups, upcomingSummary, type UpcomingGroup } from '../../core/today'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import TaskRow from '../TaskRow.vue'

const ember = useEmberStore()
const ui = useUiStore()

const groups = computed(() => upcomingGroups(ember.tasks, ember.today))
const summary = computed(() => upcomingSummary(ember.tasks, ember.today))
const isOpen = (g: UpcomingGroup) => !g.collapsible || !!ui.openGroups[g.key]
const toggle = (g: UpcomingGroup) => { ui.openGroups[g.key] = !ui.openGroups[g.key] }
</script>

<template>
  <section class="upcoming">
    <div class="up-head">
      <h4>Upcoming</h4>
      <span class="up-summary">{{ summary }}</span>
    </div>
    <div class="up-scroll">
      <template v-for="g in groups" :key="g.key">
        <div v-if="!g.collapsible" class="up-group section-label">
          <span class="up-label">{{ g.label }}</span><span class="up-right">{{ g.right }}</span>
        </div>
        <button v-else class="up-group up-toggle section-label" :aria-expanded="isOpen(g)" @click="toggle(g)">
          <ChevronRight :size="12" :stroke-width="3" :class="{ 'is-open': isOpen(g) }" />
          <span class="up-label">{{ g.label }}</span><span class="up-right">{{ g.right }}</span>
        </button>
        <template v-if="isOpen(g)">
          <TaskRow v-for="it in g.items" :key="it.task.id" :task="it.task" variant="upcoming" :show-date="it.showDate" />
        </template>
      </template>
      <p v-if="!groups.length" class="up-empty">Nothing planned. Pick a date or Someday when you add a task.</p>
    </div>
  </section>
</template>

<style scoped>
.upcoming { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
.up-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; }
.up-summary { font-size: 13px; color: var(--color-neutral-700); }
.up-scroll {
  display: flex; flex-direction: column; border-top: 2px solid var(--color-divider);
  max-height: min(640px, 72vh); overflow-y: auto;
}
.up-group {
  position: sticky; top: 0; z-index: 1; display: flex; align-items: center; justify-content: space-between;
  gap: var(--space-2); padding: var(--space-3) var(--space-2) var(--space-1);
  background: var(--color-bg); border-bottom: 1px solid var(--color-divider);
}
.up-right { font-weight: 400; color: var(--color-neutral-700); }
.up-toggle { width: 100%; justify-content: flex-start; border: 0; border-bottom: 1px solid var(--color-divider); color: var(--color-text); text-align: left; }
.up-toggle:hover { background: var(--color-accent-100); }
.up-toggle .up-right { margin-left: auto; letter-spacing: 0; text-transform: none; }
.up-toggle svg { flex: none; transition: transform .15s; }
.up-toggle svg.is-open { transform: rotate(90deg); }
.up-empty { padding: var(--space-3) 0; font-size: 13px; color: var(--color-neutral-700); }
</style>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Today and Upcoming lists"
```

---

### Task 6: Working-on strip, Today view and App wiring

**Files:**
- Create: `src/components/today/WorkingOn.vue`, `src/components/today/TodayView.vue`
- Modify: `src/App.vue`, `src/styles/base.css`, `src/App.test.ts`
- Test: `src/components/today/WorkingOn.test.ts`

**Interfaces:**
- Consumes: `workingOn` (today.ts); store `goals`, `selection`, `select`; `ui.view`, `ui.openGoal`; `TodayList`, `UpcomingList`.
- Produces: `<WorkingOn />`, `<TodayView />` (root `<main class="view today-view">`). `.view` styles move to `base.css` so every tab view shares them. CSS hooks: `.wo-all`, `.wo-card`, `.is-selected`, `.wo-goal`, `.wo-ms-title`, `.wo-segs span`, `.wo-next-title`, `.wo-focus`, `.wo-empty`.

- [ ] **Step 1: Write the failing tests**

`src/components/today/WorkingOn.test.ts`:
```ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Goal, StepTarget } from '../../core/model'
import { dataFixture, goalFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import WorkingOn from './WorkingOn.vue'

const LINE: StepTarget = { kind: 'step', goalId: 'D3', msId: 'D3/First charts', stepId: 'D3/First charts/Line' }
const GOALS = () => [
  goalFixture('D3', [['First charts', [['Bar', '2026-09-01'], ['Line', null]]], ['Motion', [['Easing', null]]]]),
  goalFixture('Spanish', [['Talk', [['Tutor', null]]]]),
]

function setup(goals: Goal[] = GOALS()) {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  ember.replaceData(dataFixture({ goals }))
  return { w: mount(WorkingOn), ember, ui: useUiStore() }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('WorkingOn', () => {
  it('shows one card per goal with its milestone, progress and next step', () => {
    const { w } = setup()
    const cards = w.findAll('.wo-card')
    expect(cards).toHaveLength(2)
    expect(cards[0].find('.wo-goal-title').text()).toBe('D3')
    expect(cards[0].find('.wo-pct').text()).toBe('33%')
    expect(cards[0].text()).toContain('Milestone 01 of 02')
    expect(cards[0].find('.wo-ms-title').text()).toBe('First charts')
    expect(cards[0].findAll('.wo-segs span').map((s) => s.classes().includes('is-done'))).toEqual([true, false])
    expect(cards[0].find('.wo-next-title').text()).toBe('Line')
  })

  it('selects the step from the timer button or the card itself', async () => {
    const { w, ember } = setup()
    await w.findAll('.wo-focus')[0].trigger('click')
    expect(ember.selection).toEqual(LINE)
    expect(w.findAll('.wo-card')[0].classes()).toContain('is-selected')
    await w.findAll('.wo-card')[1].trigger('click')
    expect(ember.selection).toMatchObject({ kind: 'step', goalId: 'Spanish' })
  })

  it('opens the goal from its name without selecting', async () => {
    const { w, ember, ui } = setup()
    await w.findAll('.wo-goal')[1].trigger('click')
    expect(ui.view).toBe('goals')
    expect(ui.activeGoalId).toBe('Spanish')
    expect(ember.selection).toBeNull()
  })

  it('links to all goals', async () => {
    const { w, ui } = setup()
    await w.find('.wo-all').trigger('click')
    expect(ui.view).toBe('goals')
  })

  it('says so when no goal has an open step', () => {
    const { w } = setup([goalFixture('Done', [['M', [['A', '2026-09-01']]]])])
    expect(w.find('.wo-card').exists()).toBe(false)
    expect(w.find('.wo-empty').text()).toBe('No goal has an open step. Add steps on the Goals tab.')
  })
})
```

Append to `src/App.test.ts` inside `describe('App shell', …)`:
```ts
  it('shows the Today view and a placeholder on other tabs', async () => {
    const w = mountApp()
    expect(w.find('.today-view').exists()).toBe(true)
    await w.findAll('.tab')[1].trigger('click')
    expect(w.find('.today-view').exists()).toBe(false)
    expect(w.find('.view').text()).toContain('This view arrives in a later phase.')
    w.unmount()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/components/today/WorkingOn.test.ts src/App.test.ts`
Expected: FAIL — cannot resolve `./WorkingOn.vue`; App test finds no `.today-view`.

- [ ] **Step 3: Write `src/components/today/WorkingOn.vue`**

```vue
<script setup lang="ts">
import { ArrowRight, Timer } from 'lucide-vue-next'
import { computed } from 'vue'
import { workingOn } from '../../core/today'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'

const ember = useEmberStore()
const ui = useUiStore()
const cards = computed(() => workingOn(ember.goals, ember.selection))
</script>

<template>
  <section class="working-on">
    <div class="wo-head">
      <span class="kicker">Working on</span>
      <button class="btn btn-ghost wo-all" @click="ui.view = 'goals'">All goals<ArrowRight :size="14" :stroke-width="2.5" /></button>
    </div>
    <div v-if="cards.length" class="wo-grid">
      <div v-for="c in cards" :key="c.goalId" class="wo-card" :class="{ 'is-selected': c.selected }" @click="ember.select(c.target)">
        <button class="wo-goal" title="Open goal" @click.stop="ui.openGoal(c.goalId)">
          <span class="swatch" :style="{ background: c.swatch }"></span>
          <span class="wo-goal-title">{{ c.title }}</span>
          <span class="wo-pct">{{ c.pct }}%</span>
        </button>
        <div class="wo-ms">
          <span class="label">{{ c.milestoneLabel }}</span>
          <span class="wo-ms-title">{{ c.milestoneTitle }}</span>
        </div>
        <div class="wo-segs"><span v-for="(isDone, i) in c.segments" :key="i" :class="{ 'is-done': isDone }"></span></div>
        <div class="wo-next">
          <div class="wo-next-text">
            <span class="wo-next-label">Next step</span>
            <span class="wo-next-title">{{ c.nextTitle }}</span>
          </div>
          <button
            class="icon-btn wo-focus"
            :class="{ 'is-on': c.selected }"
            aria-label="Focus on this step"
            title="Focus on this step"
            @click.stop="ember.select(c.target)"
          >
            <Timer :size="16" :stroke-width="2.25" />
          </button>
        </div>
      </div>
    </div>
    <p v-else class="muted wo-empty">No goal has an open step. Add steps on the Goals tab.</p>
  </section>
</template>

<style scoped>
.working-on { display: flex; flex-direction: column; gap: var(--space-3); }
.wo-head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-4); }
.wo-all { padding: 2px 4px; font-size: 13px; }
/* Cards wrap on narrow screens; 2px rules between them are drawn as hard-edged box-shadows and clipped at the edges. */
.wo-grid {
  display: flex; flex-wrap: wrap; overflow: hidden;
  border-top: 2px solid var(--color-text); border-bottom: 2px solid var(--color-divider);
}
.wo-card {
  flex: 1 1 220px; min-width: 0; display: flex; flex-direction: column; gap: var(--space-2);
  padding: var(--space-3) var(--space-4) var(--space-4);
  box-shadow: -2px 0 0 var(--color-divider), 0 -2px 0 var(--color-divider);
  cursor: pointer; transition: background .2s;
}
.wo-card.is-selected { background: var(--color-accent-100); }
.wo-goal {
  display: flex; align-items: flex-start; gap: 8px; padding: 0; border: 0; background: none;
  font-size: 14px; font-weight: 700; line-height: 1.3; color: var(--color-text); text-align: left;
}
.wo-goal:hover { color: var(--color-accent); }
.wo-goal .swatch { margin-top: 4px; }
.wo-goal-title { flex: 1; min-width: 0; }
.wo-pct { font-size: 13px; }
.wo-ms { display: flex; flex-direction: column; gap: 2px; }
.wo-ms-title { font: 800 18px/1.2 var(--font-heading); }
.wo-segs { display: flex; gap: 3px; }
.wo-segs span { flex: 1; height: 6px; background: var(--color-neutral-300); }
.wo-segs span.is-done { background: var(--color-accent); }
.wo-next { display: flex; align-items: center; gap: var(--space-2); margin-top: auto; }
.wo-next-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.wo-next-label { font-size: 11px; color: var(--color-neutral-700); }
.wo-next-title { font-size: 14px; }
</style>
```

- [ ] **Step 4: Write `src/components/today/TodayView.vue`**

```vue
<script setup lang="ts">
import TodayList from './TodayList.vue'
import UpcomingList from './UpcomingList.vue'
import WorkingOn from './WorkingOn.vue'
</script>

<template>
  <main class="view today-view">
    <WorkingOn />
    <div class="tv-columns">
      <TodayList />
      <UpcomingList />
    </div>
  </main>
</template>

<style scoped>
.today-view { gap: var(--space-8); }
.tv-columns {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr));
  gap: var(--space-8); align-items: start;
}
</style>
```

- [ ] **Step 5: Move `.view` into `src/styles/base.css` and render TodayView in `src/App.vue`**

Append to `src/styles/base.css`:
```css
/* A tab's main area, under the focus bar. */
.view {
  flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--space-2);
  padding: var(--space-6); border-top: 2px solid var(--color-divider);
}
@media (max-width: 520px) { .view { padding: var(--space-4); } }
```

In `src/App.vue`: add `import TodayView from './components/today/TodayView.vue'`; replace the placeholder block with

```vue
    <TodayView v-if="ui.view === 'today'" />
    <!-- Phases 4–5 replace this placeholder with GoalsView / ActivityView. -->
    <main v-else class="view">
      <span class="kicker">{{ VIEW_NAMES[ui.view] }}</span>
      <p class="muted">This view arrives in a later phase.</p>
    </main>
```

and delete the `.view { … }` rule and its `@media` block from App.vue's `<style scoped>` (keep `.app`).

- [ ] **Step 6: Run the full check**

Run: `npm test && npm run build`
Expected: all tests pass; vue-tsc clean; build succeeds.

- [ ] **Step 7: Check the running app**

Run `npm run dev` (background). In the Playwright browser at `http://localhost:5173/` (clear localStorage first so the seed loads):
1. 1280px: three Working-on cards (Learn D3.js / Speak Spanish at B1 / Learn watercolour) with milestone labels, segment bars and next steps; D3's card is selected (accent-100). Today column: 7-day strip, streak, "2 of 7 done"; rows start with no missed deadlines, "Book dentist appointment" shows grey "From …", "Renew car insurance" shows red "Due today" with a flag; "2 done" collapse row. Upcoming: Tomorrow / weekday groups, Later "2 tasks", Someday "3 tasks"; summary "7 planned · 3 deadlines · 3 someday". Screenshot.
2. Add "Test task" with Pick date + Deadline → appears in Upcoming with "Due …"; Deadline toggle resets. Tick "30-minute run" → moves to the done group, "3 of 8 done". Move "Review pull request #482" to tomorrow → appears under Tomorrow. Expand Someday, move "Try a sourdough starter" to today → appears in Today. Click a timer on a Today row → focus bar shows it.
3. Click a Working-on goal name → Goals tab (placeholder) opens.
4. Resize to 360px: no horizontal scroll (`document.documentElement.scrollWidth <= 360`); cards stack; columns stack; add-task options wrap. Screenshot.
5. Console: no errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add the Today view with the Working-on strip"
```
