# Ember — Edit and Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Edit and delete tasks, goal steps, milestones and goals (plus step estimates) through a "⋯" row menu and inline edit panels, with soft delete, an 8-second undo bar, and history that never shrinks.

**Architecture:** Items gain optional `deletedOn`. The goal helpers in `core/goals.ts` become deletion-aware (live milestones/steps), so every live calculation built on them (goal %, current milestone, next step, roadmap, picker, Working-on, "Then:") follows automatically; task filters are added where tasks are listed; history functions keep all items and mark deleted sources. The store gains update/delete/undo actions; the UI store holds the open menu, the open edit panel and the undo bar. New components: `RowMenu`, `TaskEditPanel`, `StepEditPanel`, `TitleEditPanel`, `UndoBar`.

**Tech Stack:** Vue 3.5, Pinia 4, lucide-vue-next, Vitest 5 + jsdom + @vue/test-utils.

**Spec:** `docs/superpowers/specs/2026-10-04-ember-edit-delete-design.md`.

## Global Constraints

- Modernist rules: zero radius; 2px/1px rules; flush-left button labels; sparing accent (accent text at paragraph size = accent-700); no shadows except the picker.
- Soft delete only — nothing is removed from storage; `deletedOn` is optional so old data and backups load unchanged.
- Goal colours come from the index among **all** goals.
- History (heat map, streaks, 7-day strip, done wall bricks, activity log, today's totals) keeps deleted items.
- Estimates: 25-minute units, 25m–10h.
- `src/core/` must not import `vue` or `pinia`.

## Decisions taken in this plan

1. **Milestone menu sits at the end of the milestone header row** (after the chevron), not before the count: the header is a toggle button and can't contain another button.
2. **Undo restores the selection only if it is still empty** (so a selection made in the meantime isn't overwritten).
3. **The done-wall legend lists live goals only**; bricks of deleted goals keep their colour.

## Review Focus

1. Deleting the selected step while a session runs: the focus bar clears and the finished session logs as Unassigned. Pinned in Task 2.
2. Deleting a goal: its tasks stay (label falls back to tag), other goals keep their colours, history counts don't change. Pinned in Task 1.
3. Undo after a cascade delete restores the whole goal/milestone. Pinned in Task 2.
4. Editing a task's date to Someday clears its deadline; editing never un-ticks a finished task. Pinned in Task 2.
5. Keyboard: menu → Edit focuses the title; Esc closes menu, then panel; focus returns to "⋯"; after Delete focus moves to the next row. Pinned in Tasks 3–4.

---

### Task 1: Deletion-aware core

**Files:** Modify `src/core/model.ts`, `src/core/goals.ts`, `src/core/today.ts`, `src/core/picker.ts`, `src/core/goalView.ts`, `src/core/selection.ts`, `src/core/activityView.ts`. Test: `src/core/deleted.test.ts`.

**Produces:** `deletedOn?: ISODate | null` on Task, Step, Milestone, Goal; `isLive(x)`, `liveMilestones(g)`, `liveSteps(m)`, `isStepLive(goals, target)` in `goals.ts`; `isMilestoneDone`, `goalStats`, `nextOpenStep` (indices are positions among live items), `stepAfter` all ignore deleted items; `StepRow.estMin`.

- [ ] **Step 1: Write the failing test** — `src/core/deleted.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { doneByDay } from './activity'
import { activityLog, doneWall } from './activityView'
import { goalStats, isStepLive, nextOpenStep, stepAfter } from './goals'
import { goalList, goalTasks, roadmap } from './goalView'
import type { Goal } from './model'
import { pickerSections } from './picker'
import { describeSelection, nextStepText } from './selection'
import { tallyLogs } from './tally'
import { goalFixture, logFixture, stepRef, taskFixture } from './test-fixtures'
import { todayList, upcomingGroups, upcomingSummary, workingOn } from './today'

const TODAY = '2026-09-23'
const d3 = (): Goal => goalFixture('D3', [
  ['First charts', [['Bar', '2026-09-01'], ['Line', null], ['Scatter', null]]],
  ['Motion', [['Easing', null]]],
])
const LINE = stepRef('D3', 'First charts', 'Line')
const SCATTER = stepRef('D3', 'First charts', 'Scatter')

describe('deleted steps and milestones', () => {
  it('drop out of progress, next step and "Then:"', () => {
    const g = d3()
    g.milestones[0].steps[1].deletedOn = TODAY
    expect(goalStats(g)).toMatchObject({ done: 1, total: 3, pct: 33 })
    expect(nextOpenStep(g)?.step.title).toBe('Scatter')
    expect(nextOpenStep(g)?.si).toBe(1)
    expect(stepAfter(g, 'D3/First charts/Bar')?.title).toBe('Scatter')
    expect(isStepLive([g], LINE)).toBe(false)
    expect(isStepLive([g], SCATTER)).toBe(true)
    expect(nextStepText([g], SCATTER)).toBe('Then: Easing')
  })

  it('a deleted milestone hides its steps and renumbers the roadmap', () => {
    const g = d3()
    g.milestones[0].deletedOn = TODAY
    expect(isStepLive([g], SCATTER)).toBe(false)
    expect(goalStats(g)).toMatchObject({ total: 1, currentIndex: 0 })
    const rows = roadmap(g, new Map(), new Map(), null)
    expect(rows.map((r) => [r.num, r.title])).toEqual([['01', 'Motion']])
    expect(rows[0].steps[0].estMin).toBe(50)
  })

  it('roadmap rows skip deleted steps', () => {
    const g = d3()
    g.milestones[0].steps[2].deletedOn = TODAY
    const [first] = roadmap(g, new Map(), new Map(), null)
    expect(first.steps.map((s) => s.title)).toEqual(['Bar', 'Line'])
    expect(first.count).toBe('1 / 2')
    expect(first.segments).toEqual([true, false])
  })
})

describe('deleted goals', () => {
  const goals = () => {
    const a = d3()
    const b = goalFixture('Spanish', [['Talk', [['Tutor', null]]]])
    const c = goalFixture('Art', [['Paint', [['Skies', null]]]])
    a.deletedOn = TODAY
    return [a, b, c]
  }

  it('drop out of lists, Working-on and the picker, keeping other colours', () => {
    const gs = goals()
    expect(goalList(gs, new Map()).map((g) => [g.title, g.swatch])).toEqual([
      ['Spanish', 'var(--color-text)'], ['Art', 'var(--color-accent-300)'],
    ])
    expect(workingOn(gs, null).map((c) => [c.title, c.swatch])).toEqual([
      ['Spanish', 'var(--color-text)'], ['Art', 'var(--color-accent-300)'],
    ])
    expect(pickerSections(gs, [], null, 'goals', '', TODAY).map((s) => s.label)).toEqual(['Spanish', 'Art'])
    expect(describeSelection(gs, [], LINE, new Map()).empty).toBe(true)
  })

  it("keep their tasks, which fall back to the tag", () => {
    const gs = goals()
    const tasks = [taskFixture('Paper', { goalId: 'D3', tag: 'Home' })]
    const [item] = pickerSections(gs, tasks, null, 'tasks', '', TODAY)[0].items
    expect(item).toMatchObject({ title: 'Paper', meta: 'Home', outlined: true })
    expect(describeSelection(gs, tasks, { kind: 'task', taskId: 'Paper' }, new Map()).sub).toBe('Task · Home')
  })
})

describe('deleted tasks', () => {
  const tasks = () => [
    taskFixture('A'),
    taskFixture('B', { deletedOn: TODAY }),
    taskFixture('C', { date: '2026-09-25', deletedOn: TODAY }),
    taskFixture('D', { date: null, deletedOn: TODAY }),
    taskFixture('E', { goalId: 'D3', deletedOn: TODAY }),
  ]

  it('drop out of every task list', () => {
    expect(todayList(tasks(), TODAY).open.map((t) => t.title)).toEqual(['A'])
    expect(upcomingGroups(tasks(), TODAY)).toEqual([])
    expect(upcomingSummary(tasks(), TODAY)).toBe('0 planned · 0 deadlines')
    expect(goalTasks(tasks(), 'D3', TODAY)).toEqual([])
    expect(pickerSections([d3()], tasks(), null, 'tasks', '', TODAY).flatMap((s) => s.items.map((i) => i.title))).toEqual(['A'])
    expect(describeSelection([], tasks(), { kind: 'task', taskId: 'B' }, new Map()).empty).toBe(true)
  })
})

describe('history keeps deleted items', () => {
  it('counts them and marks their source', () => {
    const g = d3()
    g.deletedOn = TODAY
    const tasks = [taskFixture('Done task', { doneOn: '2026-09-22', deletedOn: TODAY })]
    const logs = [logFixture(TODAY, LINE), logFixture(TODAY, { kind: 'task', taskId: 'Done task' })]
    expect(doneByDay([g], tasks).get('2026-09-22')).toBe(1)
    expect(doneByDay([g], tasks).get('2026-09-01')).toBe(1)
    expect(tallyLogs(logs, TODAY).minutesToday).toBe(50)
    const entries = activityLog([g], tasks, logs, TODAY)
    expect(entries.map((e) => [e.text, e.src])).toEqual([
      ['Focused 25m on “Line”', 'D3 (deleted)'],
      ['Focused 25m on “Done task”', 'Task · Work (deleted)'],
      ['Completed task “Done task”', 'Task · Work (deleted)'],
      ['Completed “Bar”', 'D3 (deleted)'],
    ])
    const wall = doneWall([g], tasks, TODAY, 4)
    expect(wall.headline).toBe('2 things finished')
    expect(wall.legend).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npm test -- src/core/deleted.test.ts` → FAIL (deleted items still counted; `isStepLive` missing).

- [ ] **Step 3: Implement**

`src/core/model.ts`: add `deletedOn?: ISODate | null` (with doc comment "Soft delete: hidden from live views, kept for history.") to `Step`, `Milestone`, `Goal` and `Task`.

`src/core/goals.ts`: add at the top (after the import, changing it to `import type { ISODate } from './dates'` plus the model types):
```ts
/** Soft-deleted items keep their data for history but drop out of every live view. */
export const isLive = (x: { deletedOn?: ISODate | null }): boolean => !x.deletedOn
export const liveMilestones = (g: Goal): Milestone[] => g.milestones.filter(isLive)
export const liveSteps = (m: Milestone): Step[] => m.steps.filter(isLive)
```
Rewrite:
```ts
export const isMilestoneDone = (m: Milestone): boolean => {
  const steps = liveSteps(m)
  return steps.length > 0 && steps.every((s) => s.doneOn != null)
}

export function goalStats(g: Goal): GoalStats {
  const milestones = liveMilestones(g)
  const all = milestones.flatMap(liveSteps)
  const done = all.filter((s) => s.doneOn != null).length
  return {
    done,
    total: all.length,
    pct: all.length ? Math.round((done / all.length) * 100) : 0,
    milestonesDone: milestones.filter(isMilestoneDone).length,
    /** First live milestone with an open step (or no steps); -1 when all are done. */
    currentIndex: milestones.findIndex((m) => !isMilestoneDone(m)),
  }
}

/** First open step of the goal, in roadmap order; mi / si are positions among live items. */
export function nextOpenStep(g: Goal): OpenStep | null {
  const milestones = liveMilestones(g)
  for (let mi = 0; mi < milestones.length; mi++) {
    const milestone = milestones[mi]
    const steps = liveSteps(milestone)
    const si = steps.findIndex((s) => s.doneOn == null)
    if (si >= 0) return { milestone, mi, step: steps[si], si }
  }
  return null
}

/** The step and its milestone and goal all exist and none is deleted. */
export function isStepLive(goals: Goal[], t: StepTarget): boolean {
  const loc = findStep(goals, t)
  return !!loc && isLive(loc.goal) && isLive(loc.milestone) && isLive(loc.step)
}
```
and in `stepAfter` iterate `for (const m of liveMilestones(g)) for (const s of liveSteps(m))` (same body). `findStep` stays raw (history needs titles of deleted steps).

`src/core/today.ts`: import `isLive, liveMilestones, liveSteps`. In `todayList`, `upcomingGroups` and `upcomingSummary`, start with `const live = tasks.filter(isLive)` and use `live` instead of `tasks`. In `workingOn`: return `[]` for `!isLive(g)`; `milestoneLabel` uses `liveMilestones(g).length`; `segments` uses `liveSteps(next.milestone)`.

`src/core/picker.ts`: import `isLive, liveSteps`. Goals tab: `if (!isLive(g)) return { label: g.title, items: [] }`; build items from `liveSteps(m).filter((s) => s.doneOn == null)` and mark next step with `s.id === next.step.id`. Tasks tab: `const open = tasks.filter((t) => isLive(t) && t.doneOn == null)`; in `taskItem`, treat the goal as present only when `gi >= 0 && isLive(goals[gi])` (compute `const linked = gi >= 0 && isLive(goals[gi])` and use it for `base`, swatch and outlined).

`src/core/goalView.ts`: import `isLive, liveMilestones, liveSteps`. `allSteps = (g) => liveMilestones(g).flatMap(liveSteps)`. `goalList`: `goals.flatMap((g, gi) => (isLive(g) ? [ …existing object… ] : []))`. `goalTasks`: add `isLive(t) &&` to the filter. Add `estMin: number` to `StepRow` and set `estMin: s.estMin`. `roadmap`: map over `liveMilestones(g)`, and inside use `const steps = liveSteps(m)` for the step rows, `count`, `ledger` and `segments`. `finishLine`: `const ms = liveMilestones(g)` and `reached = ms.length > 0 && ms.every(isMilestoneDone)`.

`src/core/selection.ts`: import `isLive, isStepLive, liveMilestones`. Step branch: `if (!loc || !isStepLive(goals, sel)) return EMPTY_SELECTION` and use `pad2(liveMilestones(loc.goal).indexOf(loc.milestone) + 1)`. Task branch: `if (!task || !isLive(task)) return EMPTY_SELECTION`; `const goal = task.goalId ? goals.find((g) => g.id === task.goalId && isLive(g)) : undefined`. `nextStepText`: `if (!loc || !isStepLive(goals, sel)) return ''`.

`src/core/activityView.ts`: import `isLive, isStepLive`.
- Step completions: `src: isLive(g) && isLive(m) && isLive(s) ? g.title : \`${g.title} (deleted)\``.
- `taskSource`:
```ts
  const taskSource = (t: Task) => {
    const g = t.goalId ? goals.find((x) => x.id === t.goalId) : undefined
    const base = g ? g.title : t.tag ? `Task · ${t.tag}` : 'Task'
    return isLive(t) && (!g || isLive(g)) ? base : `${base} (deleted)`
  }
```
- Focus logs to steps: `if (loc) src = isStepLive(goals, l.target) ? loc.goal.title : \`${loc.goal.title} (deleted)\``.
- `doneWall` legend: `goals.flatMap((g, gi) => (isLive(g) ? [{ name: g.title, color: goalColor(gi) }] : []))`; "Milestones done" sums `goalStats(g).milestonesDone` over live goals only.

- [ ] **Step 4: Run** — `npm test && npm run typecheck` → PASS (all existing tests still pass).
- [ ] **Step 5: Commit** — `git commit -am "feat(core): make goal, task and picker logic deletion-aware"`.

---

### Task 2: Store actions and UI state

**Files:** Modify `src/stores/ember.ts`, `src/stores/ui.ts`, `src/components/today/AddTask.vue`, `src/components/goals/GoalsView.vue`, `src/components/TaskRow.vue` (goal resolution only). Test: `src/stores/ember.test.ts`, `src/stores/ui.test.ts`, `src/components/goals/GoalsView.test.ts`.

**Produces (store):** `type DeleteKey = { kind: 'task'; id: string } | { kind: 'step'; goalId: string; msId: string; stepId: string } | { kind: 'milestone'; goalId: string; msId: string } | { kind: 'goal'; goalId: string }`; `interface UndoRecord { label: string; key: DeleteKey; selection: Selection }`; `updateTask(id, patch)`, `updateStep(target, patch)`, `renameMilestone(goalId, msId, title)`, `renameGoal(goalId, title)`, `deleteTask(id)`, `deleteStep(target)`, `deleteMilestone(goalId, msId)`, `deleteGoal(goalId)` (each `UndoRecord | null`), `undoDelete(record)`. `targetExists` is now live-aware.
**Produces (ui):** `menuFor: string | null`, `editing: string | null` (keys `task:<id>`, `step:<stepId>`, `ms:<msId>`, `goal:<goalId>`), `undo: { record: UndoRecord } | null`, `startEdit(key)`, `showUndo(record | null)` (8 s), `dismissUndo()`; `escape()` order: data menu, row menu, edit panel, picker, Focus mode.

- [ ] **Step 1: Write the failing tests** — append to `src/stores/ember.test.ts` (before `describe('storage key'`):

```ts
describe('edit', () => {
  it('updates a task, trimming text, clearing the deadline for Someday, never un-ticking', () => {
    const store = storeWith()
    store.toggleTask('Review PR')
    store.updateTask('Review PR', { title: '  PR #482 ', tag: ' Work ', date: '2026-09-25', deadline: true, goalId: 'D3' })
    expect(store.tasks[0]).toMatchObject({ title: 'PR #482', tag: 'Work', date: '2026-09-25', deadline: true, goalId: 'D3', doneOn: '2026-09-23' })
    store.updateTask('Review PR', { title: '   ', date: null })
    expect(store.tasks[0]).toMatchObject({ title: 'PR #482', date: null, deadline: false })
  })

  it('updates a step, clamping the estimate to 25-minute units between 25m and 10h', () => {
    const store = storeWith()
    store.updateStep(LINE, { title: 'Line chart', estMin: 80 })
    expect(store.goals[0].milestones[0].steps[1]).toMatchObject({ title: 'Line chart', estMin: 75 })
    store.updateStep(LINE, { estMin: 5 })
    expect(store.goals[0].milestones[0].steps[1].estMin).toBe(25)
    store.updateStep(LINE, { estMin: 9999 })
    expect(store.goals[0].milestones[0].steps[1].estMin).toBe(600)
  })

  it('renames milestones and goals, ignoring empty names', () => {
    const store = storeWith()
    store.renameMilestone('D3', 'D3/Motion', ' Animation ')
    store.renameGoal('D3', 'D3 charts')
    store.renameGoal('D3', ' ')
    expect(store.goals[0].milestones[1].title).toBe('Animation')
    expect(store.goals[0].title).toBe('D3 charts')
  })
})

describe('delete and undo', () => {
  it('soft-deletes a task and undoes it', () => {
    const store = storeWith({ selection: { kind: 'task', taskId: 'Review PR' } })
    const rec = store.deleteTask('Review PR')!
    expect(rec.label).toBe('Deleted “Review PR”')
    expect(store.tasks[0].deletedOn).toBe('2026-09-23')
    expect(store.selection).toBeNull()
    store.undoDelete(rec)
    expect(store.tasks[0].deletedOn).toBeNull()
    expect(store.selection).toEqual({ kind: 'task', taskId: 'Review PR' })
  })

  it('logs a running session as Unassigned when its step is deleted', () => {
    const store = storeWith({ selection: LINE })
    store.startPause()
    store.deleteStep(LINE)
    expect(store.selection).toBeNull()
    store.tick(NOW + 25 * MIN)
    expect(store.logs[0].target).toBeNull()
  })

  it('labels milestone and goal deletes, and undo brings the whole branch back', () => {
    const store = storeWith({ selection: SCATTER })
    const ms = store.deleteMilestone('D3', 'D3/First charts')!
    expect(ms.label).toBe('Deleted milestone “First charts” and 3 steps')
    expect(store.selection).toBeNull()
    store.undoDelete(ms)
    expect(store.goals[0].milestones[0].deletedOn).toBeNull()
    expect(store.selection).toEqual(SCATTER)
    const goal = store.deleteGoal('D3')!
    expect(goal.label).toBe('Deleted goal “D3”')
    expect(store.goals[0].deletedOn).toBe('2026-09-23')
    store.undoDelete(goal)
    expect(store.goals[0].deletedOn).toBeNull()
  })

  it('returns null for unknown or already deleted items', () => {
    const store = storeWith()
    expect(store.deleteTask('nope')).toBeNull()
    store.deleteTask('Review PR')
    expect(store.deleteTask('Review PR')).toBeNull()
  })
})
```

Append inside `describe('ui store', …)` in `src/stores/ui.test.ts` (and add `vi` to the vitest import and `afterEach(() => vi.useRealTimers())`):
```ts
  it('tracks the open row menu and edit panel, closing them on Esc in order', () => {
    const ui = useUiStore()
    ui.menuFor = 'task:a'
    ui.startEdit('task:b')
    expect(ui.menuFor).toBeNull()
    expect(ui.editing).toBe('task:b')
    ui.menuFor = 'task:c'
    expect(ui.escape()).toBe(true)
    expect(ui.menuFor).toBeNull()
    expect(ui.editing).toBe('task:b')
    expect(ui.escape()).toBe(true)
    expect(ui.editing).toBeNull()
  })

  it('shows the undo bar for 8 seconds', () => {
    vi.useFakeTimers()
    const ui = useUiStore()
    const record = { label: 'Deleted “x”', key: { kind: 'task' as const, id: 'x' }, selection: null }
    ui.showUndo(record)
    expect(ui.undo?.record).toEqual(record)
    vi.advanceTimersByTime(7999)
    expect(ui.undo).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(ui.undo).toBeNull()
    ui.showUndo(null)
    expect(ui.undo).toBeNull()
  })
```

Append inside `describe('GoalsView', …)` in `src/components/goals/GoalsView.test.ts`:
```ts
  it('skips deleted goals', () => {
    const goals = two()
    goals[0].deletedOn = '2026-09-23'
    expect(setup(goals, 'D3').find('.gs-title').text()).toBe('Spanish')
    expect(setup(goals).findAll('.gl-item')).toHaveLength(1)
  })
```

- [ ] **Step 2: Run to verify they fail** — `npm test -- src/stores src/components/goals/GoalsView.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`src/stores/ember.ts`:
- Imports: add `isLive, isStepLive, liveSteps` to the goals import, and `plural` from `../core/format`.
- Export types above the store:
```ts
export type DeleteKey =
  | { kind: 'task'; id: string }
  | { kind: 'step'; goalId: string; msId: string; stepId: string }
  | { kind: 'milestone'; goalId: string; msId: string }
  | { kind: 'goal'; goalId: string }
export interface UndoRecord { label: string; key: DeleteKey; selection: Selection }
export type TaskPatch = Partial<Pick<Task, 'title' | 'date' | 'deadline' | 'goalId' | 'tag'>>
```
- Replace `targetExists` with:
```ts
  const targetExists = (t: Target): boolean => {
    if (t.kind === 'task') {
      const task = taskById(t.taskId)
      return !!task && isLive(task)
    }
    return isStepLive(goals.value, t)
  }
```
- Add after `completeSelected`:
```ts
  // — edit —
  function updateTask(id: string, patch: TaskPatch) {
    const t = taskById(id)
    if (!t) return
    if (patch.title !== undefined && patch.title.trim()) t.title = patch.title.trim()
    if (patch.tag !== undefined) t.tag = patch.tag.trim()
    if (patch.goalId !== undefined) t.goalId = patch.goalId
    if (patch.date !== undefined) t.date = patch.date
    if (patch.deadline !== undefined) t.deadline = patch.deadline
    if (t.date == null) t.deadline = false
  }

  function updateStep(target: StepTarget, patch: { title?: string; estMin?: number }) {
    const loc = findStep(goals.value, target)
    if (!loc) return
    if (patch.title !== undefined && patch.title.trim()) loc.step.title = patch.title.trim()
    if (patch.estMin !== undefined && Number.isFinite(patch.estMin)) {
      loc.step.estMin = Math.min(600, Math.max(25, Math.round(patch.estMin / 25) * 25))
    }
  }

  function renameMilestone(goalId: string, msId: string, title: string) {
    const m = goalById(goalId)?.milestones.find((x) => x.id === msId)
    if (m && title.trim()) m.title = title.trim()
  }

  function renameGoal(goalId: string, title: string) {
    const g = goalById(goalId)
    if (g && title.trim()) g.title = title.trim()
  }

  // — delete (soft) and undo —
  function itemFor(key: DeleteKey): { deletedOn?: ISODate | null } | null {
    if (key.kind === 'task') return taskById(key.id)
    const g = goalById(key.goalId)
    if (!g || key.kind === 'goal') return g
    const m = g.milestones.find((x) => x.id === key.msId) ?? null
    if (!m || key.kind === 'milestone') return m
    return m.steps.find((x) => x.id === key.stepId) ?? null
  }

  function softDelete(key: DeleteKey, label: string): UndoRecord | null {
    const item = itemFor(key)
    if (!item || !isLive(item)) return null
    const before = selection.value
    item.deletedOn = today.value
    if (selection.value && !targetExists(selection.value)) selection.value = null
    return { label, key, selection: before }
  }

  const deleteTask = (id: string) =>
    softDelete({ kind: 'task', id }, `Deleted “${taskById(id)?.title ?? ''}”`)

  const deleteStep = (t: StepTarget) =>
    softDelete({ kind: 'step', goalId: t.goalId, msId: t.msId, stepId: t.stepId }, `Deleted “${findStep(goals.value, t)?.step.title ?? ''}”`)

  function deleteMilestone(goalId: string, msId: string) {
    const m = goalById(goalId)?.milestones.find((x) => x.id === msId)
    const n = m ? liveSteps(m).length : 0
    const label = `Deleted milestone “${m?.title ?? ''}”${n ? ` and ${plural(n, 'step')}` : ''}`
    return softDelete({ kind: 'milestone', goalId, msId }, label)
  }

  const deleteGoal = (goalId: string) =>
    softDelete({ kind: 'goal', goalId }, `Deleted goal “${goalById(goalId)?.title ?? ''}”`)

  /** Clears the flag set by that delete; restores the selection if nothing has been selected since. */
  function undoDelete(record: UndoRecord) {
    const item = itemFor(record.key)
    if (item) item.deletedOn = null
    if (!selection.value && record.selection && targetExists(record.selection)) selection.value = record.selection
  }
```
- Add the new functions to the returned object: `updateTask, updateStep, renameMilestone, renameGoal, deleteTask, deleteStep, deleteMilestone, deleteGoal, undoDelete,`.

`src/stores/ui.ts`: add `import type { UndoRecord } from './ember'` (extend the existing type import), then after `dataMenuOpen`:
```ts
  /** Row "⋯" menu that is open (one at a time). */
  const menuFor = ref<string | null>(null)
  /** Inline edit panel that is open: task:<id> | step:<stepId> | ms:<msId> | goal:<goalId>. */
  const editing = ref<string | null>(null)
  /** Undo bar for the latest delete. */
  const undo = ref<{ record: UndoRecord } | null>(null)
  let undoTimer: ReturnType<typeof setTimeout> | undefined

  function startEdit(key: string) {
    menuFor.value = null
    editing.value = key
  }

  function showUndo(record: UndoRecord | null) {
    if (!record) return
    clearTimeout(undoTimer)
    undo.value = { record }
    undoTimer = setTimeout(() => { undo.value = null }, 8000)
  }

  function dismissUndo() {
    clearTimeout(undoTimer)
    undo.value = null
  }
```
In `escape()`, after the data-menu block add:
```ts
    if (menuFor.value) {
      menuFor.value = null
      return true
    }
    if (editing.value) {
      editing.value = null
      return true
    }
```
Update its doc comment to "data menu, row menu, edit panel, picker, Focus mode" and return `menuFor, editing, undo, startEdit, showUndo, dismissUndo`.

`src/components/goals/GoalsView.vue`: import `isLive` and use
`ember.goals.find((g) => g.id === ui.activeGoalId && isLive(g)) ?? ember.goals.find(isLive) ?? null`.

`src/components/today/AddTask.vue`: import `isLive` from `../../core/goals`; `v-for="g in ember.goals.filter(isLive)"`.

`src/components/TaskRow.vue`: import `isLive`; `goal` computed becomes `goalIndex.value >= 0 && isLive(ember.goals[goalIndex.value]) ? ember.goals[goalIndex.value] : null`; label fallback `{{ goal ? goal.title : task.tag || 'Task' }}`.

- [ ] **Step 4: Run** — `npm test && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(store): add edit, soft delete and undo"`.

---

### Task 3: Row menu, undo bar, shared panel styles

**Files:** Create `src/components/RowMenu.vue`, `src/components/UndoBar.vue`. Modify `src/components/focusRescue.ts`, `src/styles/components.css`, `src/App.vue`. Test: `src/components/RowMenu.test.ts`, `src/components/UndoBar.test.ts`.

**Produces:** `<RowMenu :menu-key :label @delete="(e) => …" />` — Edit calls `ui.startEdit(menuKey)`; Delete closes the menu and emits `delete` with the click event. `<UndoBar />`. `withFocusRescue` also recognises `.step-row` and wrappers containing a `.task-row`/`.step-row`. Global classes `.edit-panel`, `.ep-row`, `.ep-actions`, `.ep-delete`, `.flag-toggle`.

- [ ] **Step 1: Write the failing tests**

`src/components/RowMenu.test.ts`:
```ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { useUiStore } from '../stores/ui'
import RowMenu from './RowMenu.vue'

beforeEach(() => setActivePinia(createPinia()))
const mountMenu = () => mount(RowMenu, { props: { menuKey: 'task:a', label: 'Review PR' }, attachTo: document.body })

describe('RowMenu', () => {
  it('opens a menu with Edit and Delete, focusing Edit', async () => {
    const w = mountMenu()
    const trigger = w.find('.rmn-trigger')
    expect(trigger.attributes('aria-label')).toBe('More actions for “Review PR”')
    expect(trigger.attributes('aria-haspopup')).toBe('menu')
    await trigger.trigger('click')
    expect(trigger.attributes('aria-expanded')).toBe('true')
    await nextTick()
    expect(document.activeElement).toBe(w.find('.rmn-edit').element)
    expect(w.find('.rmn-delete').attributes('aria-label')).toBe('Delete “Review PR”')
    w.unmount()
  })

  it('Edit opens the panel; Delete emits and closes', async () => {
    const w = mountMenu()
    const ui = useUiStore()
    await w.find('.rmn-trigger').trigger('click')
    await w.find('.rmn-edit').trigger('click')
    expect(ui.editing).toBe('task:a')
    expect(ui.menuFor).toBeNull()
    await w.find('.rmn-trigger').trigger('click')
    await w.find('.rmn-delete').trigger('click')
    expect(w.emitted('delete')).toHaveLength(1)
    expect(ui.menuFor).toBeNull()
    w.unmount()
  })

  it('closes on an outside click and gives focus back to the trigger after Esc', async () => {
    const w = mountMenu()
    const ui = useUiStore()
    await w.find('.rmn-trigger').trigger('click')
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await nextTick()
    expect(ui.menuFor).toBeNull()
    await w.find('.rmn-trigger').trigger('click')
    await nextTick()
    ui.escape()
    await nextTick()
    await nextTick()
    expect(document.activeElement).toBe(w.find('.rmn-trigger').element)
    w.unmount()
  })
})
```

`src/components/UndoBar.test.ts`:
```ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dataFixture, taskFixture } from '../core/test-fixtures'
import { useEmberStore } from '../stores/ember'
import { useUiStore } from '../stores/ui'
import UndoBar from './UndoBar.vue'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
  setActivePinia(createPinia())
})
afterEach(() => vi.useRealTimers())

describe('UndoBar', () => {
  it('announces the delete and undoes it', async () => {
    const ember = useEmberStore()
    ember.replaceData(dataFixture({ tasks: [taskFixture('Review PR')] }))
    const ui = useUiStore()
    const w = mount(UndoBar)
    expect(w.find('.undo-bar').exists()).toBe(false)
    expect(w.find('[role="status"]').attributes('aria-live')).toBe('polite')
    ui.showUndo(ember.deleteTask('Review PR'))
    await w.vm.$nextTick()
    expect(w.find('.ub-text').text()).toBe('Deleted “Review PR”')
    await w.find('.ub-undo').trigger('click')
    expect(ember.tasks[0].deletedOn).toBeNull()
    expect(ui.undo).toBeNull()
  })

  it('can be dismissed', async () => {
    const ember = useEmberStore()
    ember.replaceData(dataFixture({ tasks: [taskFixture('Review PR')] }))
    const ui = useUiStore()
    const w = mount(UndoBar)
    ui.showUndo(ember.deleteTask('Review PR'))
    await w.vm.$nextTick()
    await w.find('.ub-close').trigger('click')
    expect(ui.undo).toBeNull()
    expect(ember.tasks[0].deletedOn).toBe('2026-09-23')
  })
})
```

- [ ] **Step 2: Run to verify they fail** — `npm test -- src/components/RowMenu.test.ts src/components/UndoBar.test.ts` → FAIL (files missing).

- [ ] **Step 3: Implement**

`src/components/RowMenu.vue`:
```vue
<script setup lang="ts">
import { Ellipsis } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useUiStore } from '../stores/ui'

const props = defineProps<{ menuKey: string; label: string }>()
const emit = defineEmits<{ delete: [e: Event] }>()
const ui = useUiStore()

const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const first = ref<HTMLButtonElement | null>(null)
const open = computed(() => ui.menuFor === props.menuKey)

const toggle = () => { ui.menuFor = open.value ? null : props.menuKey }
function onDelete(e: Event) {
  ui.menuFor = null
  emit('delete', e)
}

function onPointerDown(e: PointerEvent | MouseEvent) {
  if (open.value && root.value && e.target instanceof Node && !root.value.contains(e.target)) ui.menuFor = null
}

/** Give focus back to "⋯" when the menu or this row's edit panel closes and focus has nowhere better to be. */
function refocus() {
  void nextTick(() => {
    const active = document.activeElement
    if (trigger.value?.isConnected && (!active || active === document.body || root.value?.contains(active))) trigger.value.focus()
  })
}

watch(open, (isOpen, wasOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', onPointerDown)
    void nextTick(() => first.value?.focus())
  } else {
    document.removeEventListener('pointerdown', onPointerDown)
    if (wasOpen) refocus()
  }
})
watch(() => ui.editing === props.menuKey, (now, was) => { if (was && !now) refocus() })
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown))
</script>

<template>
  <div ref="root" class="row-menu">
    <button
      ref="trigger"
      class="icon-btn rmn-trigger"
      :class="{ 'is-on': open }"
      :aria-label="`More actions for “${label}”`"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="toggle"
    >
      <Ellipsis :size="16" :stroke-width="2.25" />
    </button>
    <div v-if="open" class="rmn-menu" role="menu">
      <button ref="first" role="menuitem" class="rmn-item rmn-edit" @click="ui.startEdit(menuKey)">Edit</button>
      <button role="menuitem" class="rmn-item rmn-delete" :aria-label="`Delete “${label}”`" @click="onDelete">Delete</button>
    </div>
  </div>
</template>

<style scoped>
.row-menu { position: relative; }
.rmn-menu {
  position: absolute; top: calc(100% + 4px); right: 0; z-index: 40; min-width: 140px;
  display: flex; flex-direction: column; background: var(--color-surface); border: 2px solid var(--color-text);
}
.rmn-item { padding: var(--space-2) var(--space-3); border: 0; background: transparent; font-size: 14px; color: var(--color-text); text-align: left; }
.rmn-item + .rmn-item { border-top: 1px solid var(--color-divider); }
.rmn-item:hover, .rmn-item:focus-visible { background: var(--color-accent-100); }
.rmn-delete { color: var(--color-accent-700); }
</style>
```

`src/components/UndoBar.vue`:
```vue
<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { useEmberStore } from '../stores/ember'
import { useUiStore } from '../stores/ui'

const ember = useEmberStore()
const ui = useUiStore()

function undo() {
  if (ui.undo) ember.undoDelete(ui.undo.record)
  ui.dismissUndo()
}
</script>

<template>
  <div role="status" aria-live="polite" class="undo-region">
    <div v-if="ui.undo" class="undo-bar">
      <span class="ub-text">{{ ui.undo.record.label }}</span>
      <button class="btn btn-ghost ub-undo" @click="undo">Undo</button>
      <button class="icon-btn ub-close" aria-label="Dismiss" @click="ui.dismissUndo()"><X :size="16" :stroke-width="2.25" /></button>
    </div>
  </div>
</template>

<style scoped>
.undo-region { position: fixed; left: var(--space-6); bottom: var(--space-6); z-index: 90; max-width: calc(100% - 2 * var(--space-6)); }
.undo-bar {
  display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
  background: var(--color-text); color: var(--color-bg); font-size: 14px;
}
.ub-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ub-undo { color: var(--color-accent-400); }
.ub-close { color: inherit; }
.ub-close:hover { background: color-mix(in srgb, var(--color-bg) 15%, transparent); }
@media (max-width: 520px) {
  .undo-region { left: var(--space-4); right: var(--space-4); bottom: var(--space-4); max-width: none; }
}
</style>
```

`src/components/focusRescue.ts`: replace the first line of the loop body with
```ts
    const row = el.matches('.task-row, .step-row') ? el : el.querySelector(':scope > .task-row, :scope > .step-row')
    if (row) return row.querySelector<HTMLElement>('.check')
```
(update the doc comment: "a task or step row's checkbox (or a wrapper's), or a button").

`src/styles/components.css` — append:
```css
/* — inline edit panels (row menu → Edit) — */
.edit-panel {
  display: flex; flex-direction: column; gap: var(--space-2);
  margin: var(--space-2) var(--space-2) var(--space-3); padding: var(--space-3);
  background: var(--color-surface); border: 2px solid var(--color-text);
}
.ep-row { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
.ep-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-1); }
.ep-delete { margin-left: auto; color: var(--color-accent-700); }
.flag-toggle {
  display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; font-size: 13px;
  border: 1px solid var(--color-divider); background: transparent; color: var(--color-text);
}
.flag-toggle:hover { border-color: var(--color-accent); }
.flag-toggle.is-on { background: var(--color-accent-100); border-color: var(--color-accent); color: var(--color-accent-800); }
```

`src/App.vue`: import `UndoBar` and render `<UndoBar />` directly before `<FocusMode v-if="ui.focusModeOpen" />`.

- [ ] **Step 4: Run** — `npm test && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat: add row menu, undo bar and edit-panel styles"` (after `git add -A`).

---

### Task 4: Edit and delete tasks

**Files:** Create `src/components/TaskEditPanel.vue`. Modify `src/components/TaskRow.vue`. Test: `src/components/TaskEditPanel.test.ts`, `src/components/TaskRow.test.ts`.

**Produces:** `<TaskEditPanel :task @delete />`; TaskRow root becomes `<div class="task-item">` wrapping `.task-row` (with a `RowMenu` as the last grid cell) and the panel.

- [ ] **Step 1: Write the failing tests**

`src/components/TaskEditPanel.test.ts`:
```ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../core/model'
import { dataFixture, goalFixture, taskFixture } from '../core/test-fixtures'
import { useEmberStore } from '../stores/ember'
import { useUiStore } from '../stores/ui'
import TaskEditPanel from './TaskEditPanel.vue'

function setup(task: Task) {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  const gone = goalFixture('Gone', [])
  gone.deletedOn = '2026-09-20'
  ember.replaceData(dataFixture({ goals: [goalFixture('D3', []), gone], tasks: [task] }))
  const ui = useUiStore()
  ui.startEdit(`task:${task.id}`)
  const w = mount(TaskEditPanel, { props: { task: ember.tasks[0] }, attachTo: document.body })
  return { w, ember, ui }
}
const when = (w: ReturnType<typeof mount>, i: number) => w.findAll('.ep-when input')[i].setValue(true)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('TaskEditPanel', () => {
  it('starts from the task and focuses the title', () => {
    const { w } = setup(taskFixture('Review PR', { date: '2026-09-24', deadline: true, tag: 'Work' }))
    expect((w.find('.ep-title').element as HTMLInputElement).value).toBe('Review PR')
    expect(document.activeElement).toBe(w.find('.ep-title').element)
    expect((w.findAll('.ep-when input')[1].element as HTMLInputElement).checked).toBe(true)
    expect(w.find('.flag-toggle').attributes('aria-pressed')).toBe('true')
    expect(w.findAll('.ep-goal option').map((o) => o.text())).toEqual(['No goal', 'D3'])
    w.unmount()
  })

  it('saves title, date, deadline, goal and tag, then closes', async () => {
    const { w, ember, ui } = setup(taskFixture('Review PR'))
    await w.find('.ep-title').setValue('PR #482')
    await when(w, 2)
    const date = w.find('.ep-date')
    ;(date.element as HTMLInputElement).value = '2026-10-01'
    await date.trigger('change')
    await w.find('.flag-toggle').trigger('click')
    await w.find('.ep-goal').setValue('D3')
    await w.find('.ep-tag').setValue('Code')
    await w.find('.ep-save').trigger('click')
    expect(ember.tasks[0]).toMatchObject({ title: 'PR #482', date: '2026-10-01', deadline: true, goalId: 'D3', tag: 'Code' })
    expect(ui.editing).toBeNull()
    w.unmount()
  })

  it('keeps a past date unless changed, hides Deadline for Someday, and disables Save without a title', async () => {
    const { w, ember } = setup(taskFixture('Dentist', { date: '2026-09-21', deadline: true }))
    expect((w.findAll('.ep-when input')[2].element as HTMLInputElement).checked).toBe(true)
    expect(w.find('.ep-date').attributes('min')).toBe('2026-09-21')
    await w.find('.ep-title').setValue('   ')
    expect(w.find('.ep-save').attributes('disabled')).toBeDefined()
    await w.find('.ep-title').setValue('Dentist')
    await when(w, 3)
    expect(w.find('.flag-toggle').exists()).toBe(false)
    await w.find('.ep-title').trigger('keydown', { key: 'Enter' })
    expect(ember.tasks[0]).toMatchObject({ date: null, deadline: false })
    w.unmount()
  })

  it('Cancel closes without saving; Delete is passed up', async () => {
    const { w, ember, ui } = setup(taskFixture('Review PR'))
    await w.find('.ep-title').setValue('Changed')
    await w.find('.ep-delete').trigger('click')
    expect(w.emitted('delete')).toHaveLength(1)
    await w.find('.ep-cancel').trigger('click')
    expect(ember.tasks[0].title).toBe('Review PR')
    expect(ui.editing).toBeNull()
    w.unmount()
  })
})
```

Append to `src/components/TaskRow.test.ts` inside `describe('TaskRow — today', …)` (and add `import { useUiStore } from '../stores/ui'` plus `import { nextTick } from 'vue'`):
```ts
  it('edits through the row menu', async () => {
    const { w, ember } = setup(taskFixture('Review PR'))
    await w.find('.rmn-trigger').trigger('click')
    await w.find('.rmn-edit').trigger('click')
    await nextTick()
    await w.find('.ep-title').setValue('PR #482')
    await w.find('.ep-save').trigger('click')
    expect(ember.tasks[0].title).toBe('PR #482')
    expect(w.find('.edit-panel').exists()).toBe(false)
  })

  it('deletes through the row menu and offers undo', async () => {
    const { w, ember } = setup(taskFixture('Review PR'))
    await w.find('.rmn-trigger').trigger('click')
    await w.find('.rmn-delete').trigger('click')
    expect(ember.tasks[0].deletedOn).toBe('2026-09-23')
    expect(useUiStore().undo?.record.label).toBe('Deleted “Review PR”')
  })
```

- [ ] **Step 2: Run to verify they fail** — `npm test -- src/components/TaskEditPanel.test.ts src/components/TaskRow.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`src/components/TaskEditPanel.vue`:
```vue
<script setup lang="ts">
import { Flag } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { addDays, type ISODate } from '../core/dates'
import { isLive } from '../core/goals'
import type { Task } from '../core/model'
import { useEmberStore, type When } from '../stores/ember'
import { useUiStore } from '../stores/ui'

const props = defineProps<{ task: Task }>()
const emit = defineEmits<{ delete: [e: Event] }>()
const ember = useEmberStore()
const ui = useUiStore()

const today = ember.today
const tomorrow = addDays(today, 1)
const original = props.task.date
const startWhen: When = original == null ? 'someday' : original === today ? 'today' : original === tomorrow ? 'tomorrow' : 'date'
const WHEN: [When, string][] = [['today', 'Today'], ['tomorrow', 'Tomorrow'], ['date', 'Pick date'], ['someday', 'Someday']]

const title = ref(props.task.title)
const when = ref<When>(startWhen)
const date = ref<ISODate>(original ?? addDays(today, 2))
const deadline = ref(props.task.deadline)
const liveGoals = computed(() => ember.goals.filter(isLive))
const goalId = ref(props.task.goalId && liveGoals.value.some((g) => g.id === props.task.goalId) ? props.task.goalId : '')
const tag = ref(props.task.tag)
/** A task that is already late keeps its date selectable. */
const minDate = original && original < today ? original : today
const titleInput = ref<HTMLInputElement | null>(null)

onMounted(() => titleInput.value?.focus())

function onDate(e: Event) {
  const v = (e.target as HTMLInputElement).value
  if (v) date.value = v
}

function save() {
  if (!title.value.trim()) return
  const d = when.value === 'someday' ? null : when.value === 'today' ? today : when.value === 'tomorrow' ? tomorrow : date.value
  ember.updateTask(props.task.id, { title: title.value, date: d, deadline: d != null && deadline.value, goalId: goalId.value || null, tag: tag.value })
  ui.editing = null
}

function onEnter(e: KeyboardEvent) {
  if (!e.isComposing) save()
}
</script>

<template>
  <div class="edit-panel" role="group" :aria-label="`Edit “${task.title}”`">
    <input ref="titleInput" v-model="title" class="input ep-title" aria-label="Title" @keydown.enter="onEnter" />
    <div class="ep-row">
      <div class="seg ep-when" role="radiogroup" aria-label="When">
        <label v-for="[value, label] in WHEN" :key="value" class="seg-opt">
          <input v-model="when" type="radio" name="ember-edit-when" :value="value" />{{ label }}
        </label>
      </div>
      <input v-if="when === 'date'" type="date" class="input input-sm ep-date" aria-label="Date" :min="minDate" :value="date" @change="onDate" />
      <button v-if="when !== 'someday'" class="flag-toggle" :class="{ 'is-on': deadline }" :aria-pressed="deadline" @click="deadline = !deadline">
        <Flag :size="14" :stroke-width="2.5" />Deadline
      </button>
      <select v-model="goalId" class="input input-sm ep-goal" aria-label="Goal">
        <option value="">No goal</option>
        <option v-for="g in liveGoals" :key="g.id" :value="g.id">{{ g.title }}</option>
      </select>
      <input v-model="tag" class="input input-sm ep-tag" placeholder="Tag" aria-label="Tag" @keydown.enter="onEnter" />
    </div>
    <div class="ep-actions">
      <button class="btn btn-primary ep-save" :disabled="!title.trim()" @click="save">Save</button>
      <button class="btn btn-ghost ep-cancel" @click="ui.editing = null">Cancel</button>
      <button class="btn btn-ghost ep-delete" @click="emit('delete', $event)">Delete</button>
    </div>
  </div>
</template>

<style scoped>
.ep-tag { width: 120px; }
</style>
```

`src/components/TaskRow.vue`:
- Imports: `RowMenu`, `TaskEditPanel`, `useUiStore`.
- Add `const ui = useUiStore()`, `const menuKey = computed(() => \`task:${props.task.id}\`)`, `const editingThis = computed(() => ui.editing === menuKey.value)`, and
```ts
function onDelete(e: Event) {
  void act(e, () => {
    ui.editing = null
    ui.showUndo(ember.deleteTask(props.task.id))
  })
}
```
- Template: wrap everything in `<div ref="root" class="task-item">` (move `ref="root"` from `.task-row` to the wrapper); inside, the existing `.task-row` (without `ref`), then `<TaskEditPanel v-if="editingThis" :task="task" @delete="onDelete" />`. Add `<RowMenu :menu-key="menuKey" :label="task.title" @delete="onDelete" />` as the last child of `.task-row`.
- CSS grid columns gain a trailing `28px`: today `22px minmax(0, 1fr) auto 28px 28px 28px`, upcoming `18px minmax(0, 1fr) 28px 28px`, goal `22px minmax(0, 1fr) auto 28px 28px`. Move `border-bottom` from `.task-row` to `.task-item`.

- [ ] **Step 4: Run** — `npm test && npm run typecheck` → PASS (existing TaskRow/TodayList/Upcoming focus-rescue tests still pass with the wrapper).
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: edit and delete tasks"`.

---

### Task 5: Edit and delete steps, milestones and goals

**Files:** Create `src/components/goals/StepEditPanel.vue`, `src/components/TitleEditPanel.vue`. Modify `src/components/goals/Roadmap.vue`, `src/components/goals/GoalSummary.vue`. Test: `src/components/goals/StepEditPanel.test.ts`, `src/components/TitleEditPanel.test.ts`, `src/components/goals/Roadmap.test.ts`, `src/components/goals/GoalSummary.test.ts`.

**Produces:** `<StepEditPanel :target :title :est-min @delete />`; `<TitleEditPanel :what :title @save @delete />`; roadmap step rows and milestone headers, and the goal header, gain row menus and panels.

- [ ] **Step 1: Write the failing tests**

`src/components/goals/StepEditPanel.test.ts`:
```ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { dataFixture, goalFixture, stepRef } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import StepEditPanel from './StepEditPanel.vue'

const LINE = stepRef('D3', 'M', 'Line')

function setup(estMin = 50) {
  setActivePinia(createPinia())
  localStorage.clear()
  const ember = useEmberStore()
  ember.replaceData(dataFixture({ goals: [goalFixture('D3', [['M', [['Line', null]]]])] }))
  ember.updateStep(LINE, { estMin })
  const ui = useUiStore()
  ui.startEdit(`step:${LINE.stepId}`)
  const w = mount(StepEditPanel, { props: { target: LINE, title: 'Line', estMin }, attachTo: document.body })
  return { w, ember, ui }
}

describe('StepEditPanel', () => {
  it('steps the estimate in 25-minute units within 25m–10h and saves', async () => {
    const { w, ember, ui } = setup()
    expect(w.find('.ep-est').text()).toBe('50m')
    await w.find('.ep-more').trigger('click')
    await w.find('.ep-more').trigger('click')
    expect(w.find('.ep-est').text()).toBe('1h 40m')
    await w.find('.ep-title').setValue('Line chart')
    await w.find('.ep-save').trigger('click')
    expect(ember.goals[0].milestones[0].steps[0]).toMatchObject({ title: 'Line chart', estMin: 100 })
    expect(ui.editing).toBeNull()
    w.unmount()
  })

  it('disables the stepper at the ends', async () => {
    const low = setup(25)
    expect(low.w.find('.ep-less').attributes('disabled')).toBeDefined()
    low.w.unmount()
    const high = setup(600)
    expect(high.w.find('.ep-more').attributes('disabled')).toBeDefined()
    high.w.unmount()
  })
})
```

`src/components/TitleEditPanel.test.ts`:
```ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useUiStore } from '../stores/ui'
import TitleEditPanel from './TitleEditPanel.vue'

beforeEach(() => setActivePinia(createPinia()))

describe('TitleEditPanel', () => {
  it('saves a trimmed title on Enter, refuses empty, and passes Delete up', async () => {
    const w = mount(TitleEditPanel, { props: { what: 'milestone', title: 'Capstone' }, attachTo: document.body })
    expect(w.find('.edit-panel').attributes('aria-label')).toBe('Edit milestone “Capstone”')
    expect(document.activeElement).toBe(w.find('.ep-title').element)
    await w.find('.ep-title').setValue('  ')
    expect(w.find('.ep-save').attributes('disabled')).toBeDefined()
    await w.find('.ep-title').setValue(' Final project ')
    await w.find('.ep-title').trigger('keydown', { key: 'Enter' })
    expect(w.emitted('save')?.[0]).toEqual(['Final project'])
    await w.find('.ep-delete').trigger('click')
    expect(w.emitted('delete')).toHaveLength(1)
    useUiStore().editing = 'ms:x'
    await w.find('.ep-cancel').trigger('click')
    expect(useUiStore().editing).toBeNull()
    w.unmount()
  })
})
```

Append inside `describe('Roadmap', …)` in `src/components/goals/Roadmap.test.ts` (add `import { useUiStore } from '../../stores/ui'` if missing — it is already imported):
```ts
  it('edits a step estimate and the blocks follow', async () => {
    const { w, ember } = setup()
    const row = () => w.findAll('.step-item')[2]
    await row().find('.rmn-trigger').trigger('click')
    await row().find('.rmn-edit').trigger('click')
    await nextTick()
    await w.find('.ep-more').trigger('click')
    await w.find('.ep-save').trigger('click')
    expect(ember.goals[0].milestones[1].steps[2].estMin).toBe(75)
    expect(row().findAll('.blk')).toHaveLength(3)
    w.unmount()
  })

  it('deletes a step and a milestone with undo labels', async () => {
    const { w, ember, ui } = setup()
    await w.findAll('.step-item')[2].find('.rmn-trigger').trigger('click')
    await w.findAll('.step-item')[2].find('.rmn-delete').trigger('click')
    expect(ui.undo?.record.label).toBe('Deleted “Scatter”')
    expect(w.findAll('.sr-title').map((t) => t.text())).toEqual(['Bar', 'Line'])
    const head = w.findAll('.rm-head-row')[2]
    await head.find('.rmn-trigger').trigger('click')
    await head.find('.rmn-delete').trigger('click')
    expect(ui.undo?.record.label).toBe('Deleted milestone “Motion” and 1 step')
    expect(w.findAll('.rm-title').map((t) => t.text())).toEqual(['Foundations', 'First charts'])
    ember.undoDelete(ui.undo!.record)
    await nextTick()
    expect(w.findAll('.rm-title')).toHaveLength(3)
    w.unmount()
  })

  it('renames a milestone', async () => {
    const { w, ember } = setup()
    const head = w.findAll('.rm-head-row')[0]
    await head.find('.rmn-trigger').trigger('click')
    await head.find('.rmn-edit').trigger('click')
    await nextTick()
    await w.find('.ep-title').setValue('Basics')
    await w.find('.ep-save').trigger('click')
    expect(ember.goals[0].milestones[0].title).toBe('Basics')
    w.unmount()
  })
```

Append inside `describe('GoalSummary', …)` in `src/components/goals/GoalSummary.test.ts` (add `import { nextTick } from 'vue'` and `import { useUiStore } from '../../stores/ui'`):
```ts
  it('renames and deletes the goal from its menu', async () => {
    const { w, ember } = setup()
    await w.find('.rmn-trigger').trigger('click')
    await w.find('.rmn-edit').trigger('click')
    await nextTick()
    await w.find('.ep-title').setValue('D3 charts')
    await w.find('.ep-save').trigger('click')
    expect(ember.goals[0].title).toBe('D3 charts')
    await w.find('.rmn-trigger').trigger('click')
    await w.find('.rmn-delete').trigger('click')
    expect(ember.goals[0].deletedOn).toBe('2026-09-23')
    expect(useUiStore().undo?.record.label).toBe('Deleted goal “D3 charts”')
  })
```

- [ ] **Step 2: Run to verify they fail** — `npm test -- src/components` → the new tests FAIL.

- [ ] **Step 3: Implement**

`src/components/goals/StepEditPanel.vue`:
```vue
<script setup lang="ts">
import { Minus, Plus } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { fmtM } from '../../core/format'
import type { StepTarget } from '../../core/model'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'

const props = defineProps<{ target: StepTarget; title: string; estMin: number }>()
const emit = defineEmits<{ delete: [e: Event] }>()
const ember = useEmberStore()
const ui = useUiStore()

const MIN = 25
const MAX = 600
const title = ref(props.title)
const est = ref(props.estMin)
const titleInput = ref<HTMLInputElement | null>(null)
onMounted(() => titleInput.value?.focus())

function save() {
  if (!title.value.trim()) return
  ember.updateStep(props.target, { title: title.value, estMin: est.value })
  ui.editing = null
}
function onEnter(e: KeyboardEvent) {
  if (!e.isComposing) save()
}
</script>

<template>
  <div class="edit-panel" role="group" :aria-label="`Edit step “${props.title}”`">
    <input ref="titleInput" v-model="title" class="input ep-title" aria-label="Title" @keydown.enter="onEnter" />
    <div class="ep-row">
      <span class="label">Estimate</span>
      <div class="ep-stepper">
        <button class="btn btn-secondary btn-icon ep-less" aria-label="25 minutes less" :disabled="est <= MIN" @click="est -= 25"><Minus :size="16" :stroke-width="2.5" /></button>
        <span class="ep-est tabular" aria-live="polite">{{ fmtM(est) }}</span>
        <button class="btn btn-secondary btn-icon ep-more" aria-label="25 minutes more" :disabled="est >= MAX" @click="est += 25"><Plus :size="16" :stroke-width="2.5" /></button>
      </div>
    </div>
    <div class="ep-actions">
      <button class="btn btn-primary ep-save" :disabled="!title.trim()" @click="save">Save</button>
      <button class="btn btn-ghost ep-cancel" @click="ui.editing = null">Cancel</button>
      <button class="btn btn-ghost ep-delete" @click="emit('delete', $event)">Delete</button>
    </div>
  </div>
</template>

<style scoped>
.ep-stepper { display: flex; align-items: center; gap: var(--space-2); }
.ep-est { min-width: 64px; font-weight: 700; text-align: center; }
</style>
```

`src/components/TitleEditPanel.vue`:
```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useUiStore } from '../stores/ui'

const props = defineProps<{ what: 'milestone' | 'goal'; title: string }>()
const emit = defineEmits<{ save: [title: string]; delete: [e: Event] }>()
const ui = useUiStore()

const title = ref(props.title)
const titleInput = ref<HTMLInputElement | null>(null)
onMounted(() => titleInput.value?.focus())

function save() {
  const v = title.value.trim()
  if (v) emit('save', v)
}
function onEnter(e: KeyboardEvent) {
  if (!e.isComposing) save()
}
</script>

<template>
  <div class="edit-panel" role="group" :aria-label="`Edit ${what} “${props.title}”`">
    <input ref="titleInput" v-model="title" class="input ep-title" aria-label="Title" @keydown.enter="onEnter" />
    <div class="ep-actions">
      <button class="btn btn-primary ep-save" :disabled="!title.trim()" @click="save">Save</button>
      <button class="btn btn-ghost ep-cancel" @click="ui.editing = null">Cancel</button>
      <button class="btn btn-ghost ep-delete" @click="emit('delete', $event)">Delete</button>
    </div>
  </div>
</template>
```

`src/components/goals/Roadmap.vue`:
- Imports: `RowMenu` (`../RowMenu.vue`), `TitleEditPanel` (`../TitleEditPanel.vue`), `StepEditPanel` (`./StepEditPanel.vue`), `withFocusRescue` (`../focusRescue`), type `StepRow`.
- Add:
```ts
function deleteStep(e: Event, s: StepRow) {
  const row = (e.target as HTMLElement | null)?.closest<HTMLElement>('.step-item') ?? null
  void withFocusRescue(row, e, () => {
    ui.editing = null
    ui.showUndo(ember.deleteStep(s.target))
  })
}
function deleteMilestone(msId: string) {
  ui.editing = null
  ui.showUndo(ember.deleteMilestone(props.goal.id, msId))
}
function renameMilestone(msId: string, title: string) {
  ember.renameMilestone(props.goal.id, msId, title)
  ui.editing = null
}
```
- Milestone header: wrap the `.rm-head` button in `<div class="rm-head-row">…</div>` and, inside it after the button, add `<RowMenu :menu-key="\`ms:${r.id}\`" :label="r.title" @delete="deleteMilestone(r.id)" />`. After `.rm-head-row` add `<TitleEditPanel v-if="ui.editing === \`ms:${r.id}\`" what="milestone" :title="r.title" @save="(t) => renameMilestone(r.id, t)" @delete="deleteMilestone(r.id)" />`.
- Step rows: wrap each `.step-row` in `<div class="step-item">` (move `v-for` and `:key` to the wrapper); add `<RowMenu :menu-key="\`step:${s.id}\`" :label="s.title" @delete="(e) => deleteStep(e, s)" />` as the last child of `.step-row`; after `.step-row` add `<StepEditPanel v-if="ui.editing === \`step:${s.id}\`" :target="s.target" :title="s.title" :est-min="s.estMin" @delete="(e) => deleteStep(e, s)" />`.
- CSS: `.rm-head-row { display: flex; align-items: center; gap: var(--space-2); }`, `.rm-head-row .rm-head { flex: 1; min-width: 0; }`; step-row grid `22px minmax(0, 1fr) minmax(0, auto) 104px 28px 28px`; move the step row `border-bottom` to `.step-item`; in the ≤720px block add `.row-menu { grid-column: 3; grid-row: 2; }` beside the focus button rule (`.sr-focus { grid-column: 3; grid-row: 1 }` stays).

`src/components/goals/GoalSummary.vue`:
- Imports: `RowMenu`, `TitleEditPanel`, `useUiStore`.
- Add `const ui = useUiStore()` and
```ts
function rename(title: string) {
  ember.renameGoal(props.goal.id, title)
  ui.editing = null
}
function remove() {
  ui.editing = null
  ui.showUndo(ember.deleteGoal(props.goal.id))
}
```
- In `.gs-head`, wrap `<div class="gs-pct">` in `<div class="gs-side">` together with `<RowMenu :menu-key="\`goal:${goal.id}\`" :label="goal.title" @delete="remove" />`; after `.gs-head` add `<TitleEditPanel v-if="ui.editing === \`goal:${goal.id}\`" what="goal" :title="goal.title" @save="rename" @delete="remove" />`.
- CSS: `.gs-side { display: flex; align-items: flex-end; gap: var(--space-2); }`.

- [ ] **Step 4: Run** — `npm test && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: edit and delete steps, milestones and goals"`.

---

### Task 6: Browser check and report

- [ ] **Step 1:** `npm test && npm run build` → all pass.
- [ ] **Step 2:** `npm run dev`; in the Playwright browser (fresh seed) at 1280px: edit a Today task's date to Tomorrow and goal to Spanish → it moves to Upcoming with the goal colour; Goals → "Reusable chart function" → Edit → estimate +25 → blocks grow, Left to go updates; delete "Scatter plot with zoom" → undo bar → Undo restores it; delete goal "Learn watercolour" → it vanishes from Goals/Working-on/picker, its "Order cold-press paper" task stays with tag fallback, Activity totals unchanged; the undo bar disappears after ~8 s. Keyboard: Tab to a "⋯", Enter, Edit, Esc twice returns focus to "⋯". 360px: menu and panels fit, no horizontal scroll. Console clean.
- [ ] **Step 3:** In `docs/design/build-report.md`, replace the "Editing or deleting…" and "Editing a step's estimate" rows of the "Not designed yet" table with: "Built after the handoff: row ⋯ menu → inline edit panel; soft delete with an 8-second undo bar; history keeps deleted items (marked “(deleted)” in the log)." and "Built: estimate stepper in 25-minute units, 25m–10h." Remove "Edit and delete…" from Suggested next steps (renumber).
- [ ] **Step 4:** `git add -A && git commit -m "docs: report edit and delete"`.
