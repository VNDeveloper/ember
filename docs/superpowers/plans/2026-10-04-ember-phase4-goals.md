# Ember Phase 4 — Goals View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Goals tab: the goal list with "New goal", the goal header with the editable readme, the four ledger stats, the goal's tasks, and the roadmap (milestones with rail and markers, step rows with 25-minute session blocks, add step / add milestone, finish line).

**Architecture:** All numbers and labels come from a pure `src/core/goalView.ts` (goal list items, kicker, ledger stats, goal tasks, roadmap rows with session blocks, finish line), unit-tested against one shared fixture. Components in `src/components/goals/` render it; `TaskRow` gains a `goal` variant. Which goal is open, which milestones are expanded, what is being added and the "show all" toggles live in the non-persisted UI store.

**Tech Stack:** Vue 3.5 `<script setup>`, Pinia 4, lucide-vue-next, Vitest 5 + jsdom + @vue/test-utils.

**Spec:** `docs/design/handoff.md` §View 2 — Goals; prototype `docs/design/reference/Ember.dc.html` markup lines 128–228, logic lines 634–674 (and `gStats`/`msDone`/`nextOpen` at 419–426).

## Global Constraints

- Zero border radius; 2px rules between major sections, 1px between list rows; button labels flush left; red accent sparingly (paragraph-size accent text = accent-700); no gradients, no emoji, no shadows except the picker dialog.
- Shared classes from `src/styles/`: `.btn*`, `.input`, `.check`, `.is-done`, `.icon-btn`, `.is-on`, `.is-hidden`, `.swatch`, `.kicker`, `.label`, `.section-label`, `.stat-value`, `.tag-accent`, `.tabular`, `.muted`, `.view`.
- Copy is exact: "Goals", "New goal", "e.g. Learn Three.js", "{h} focused · {done}/{total} steps", "Goal · {h} focused · {n} of {m} milestones", "Readme · what done looks like", "Click to edit", "Describe the finish line — what will you be able to do?", "Focused", "Estimated", "Left to go", "Accuracy", "—", "Tasks for this goal", "Show all {n}", "Show fewer", "Earlier sessions", "Today", "Estimate remaining", "1 block = 25 min", "You are here", "{spent} of est. {est}", "{done} / {total}", "{spent} / {est}", "+25m over", "Done Sep 16", "Add step", "New step (estimated 2 sessions), Enter to add", "Add milestone", "Milestone name, Enter to add", "Finish line", "Finish line — reached", "Describe what done looks like above.", "Focus on this step", "Getting started".
- Goal colours in order: accent, ink, accent-300, neutral-500 (`goalColor`).
- A goal's focused time counts its steps' focus logs only (as the prototype's `sumG`); task time is shown on the task rows.
- Reflows to ~360px with no horizontal page scroll.
- `src/core/` must not import `vue` or `pinia`.

## Decisions taken in this plan (tell the user)

1. **Narrow screens (≤860px):** the goal list stacks above the goal; ≤560px the ledger stats become 2×2 and each step row puts its session blocks and ledger under the title. The prototype has no narrow layout.
2. **No goals at all** shows "No goals yet. Add one on the left." — not designed.
3. **The add-step / add-milestone input stays open after Enter** for the next entry (prototype behaviour); Esc or leaving the field closes it.
4. **Selecting a goal in the list closes any open add-step input.**
5. **Accuracy shows "—"** when no step is done, and also when done steps have neither estimate nor time (avoids dividing by zero).
6. **Session-block pop animation is left to Phase 7.**
7. **Editing/deleting goals, milestones, steps and estimates** is still out of scope (README "Not designed yet") — collected for the end-of-project report.

## Review Focus

1. **A step with more time than its estimate:** blocks extend past the estimate and the ledger says "+25m over" in accent; a done step that isn't over says "Done Jul 1". Pinned in Task 1 (`builds roadmap rows…`).
2. **A brand-new goal:** "Getting started" is the current milestone, expanded, with the add-step input already open; no Working-on card until it has a step; accuracy "—". Pinned in Task 4 (`adds a goal and opens its first add-step input`) and Task 1 (`handles an empty goal`).
3. **`ui.activeGoalId` points at nothing** (initial load, or a stale id): the first goal is shown. Pinned in Task 6 (`falls back to the first goal`).
4. **Typing in the readme:** the outcome saves on every keystroke and the finish-line text follows. Pinned in Task 4 (`edits the outcome`) and Task 5 (`shows the outcome on the finish line`).
5. **Empty title for a goal, milestone or step:** nothing is added and the input stays. Pinned in Task 4 (`ignores an empty goal name`) and Task 5 (`ignores empty step names`).

---

## File structure

```
src/
  core/
    goalView.ts / goalView.test.ts   goalList, goalKicker, goalLedger, goalTasks, sessionBlocks, roadmap, finishLine
    test-fixtures.ts                 + logFixture, stepRef, d3Fixture
  stores/
    ui.ts                            + expanded, adding, draft, goalDraft, goalTasksAll, selectGoal (ui.test.ts extended)
  components/
    TaskRow.vue                      + 'goal' variant (TaskRow.test.ts extended)
    goals/
      GoalList.vue / GoalList.test.ts
      GoalSummary.vue / GoalSummary.test.ts
      GoalTasks.vue / GoalTasks.test.ts
      Roadmap.vue / Roadmap.test.ts
      GoalsView.vue / GoalsView.test.ts
  App.vue                            renders GoalsView for the Goals tab
  App.test.ts                        placeholder test now uses the Activity tab
```

---

### Task 1: Goal view derivations (core)

**Files:**
- Create: `src/core/goalView.ts`
- Modify: `src/core/test-fixtures.ts`
- Test: `src/core/goalView.test.ts`

**Interfaces:**
- Consumes: `dayLabel`, `fromISO`, `ISODate` (dates.ts); `fmtM`, `pad2` (format.ts); `goalColor`, `goalStats`, `isMilestoneDone`, `stepTarget` (goals.ts); `sameTarget`, model types.
- Produces:
  - `test-fixtures.ts`: `logFixture(date, target, min = 25): FocusLog`; `stepRef(goal, ms, step): StepTarget`; `d3Fixture(): { goal: Goal; logs: FocusLog[] }` — D3 with Foundations ✓ (SVG done Jul 1, no time), First charts (Bar done Sep 1 with 75m; Line open with 25m yesterday + 25m today; Scatter open), Motion (Easing open).
  - `goalView.ts`: `goalFocused(g, spent): number`; `interface GoalListItem { id; title; swatch; pct; complete: boolean; meta }`; `goalList(goals, spent): GoalListItem[]`; `goalKicker(g, spent): string`; `interface GoalLedger { focused; estimated; left; accuracy }` (strings); `goalLedger(g, spent): GoalLedger`; `goalTasks(tasks, goalId, today): Task[]`; `type BlockKind = 'earlier' | 'today' | 'remaining'`; `sessionBlocks(min, est, todayMin): BlockKind[]`; `interface StepRow { id; title; done; selected; target: StepTarget; ledger; note; noteAccent: boolean; blocks: BlockKind[] }`; `interface MilestoneRow { id; num; title; complete; current; count; ledger; segments: boolean[]; steps: StepRow[] }`; `roadmap(g, spent, spentToday, selection): MilestoneRow[]`; `finishLine(g): { reached: boolean; title: string; text: string }`.

- [ ] **Step 1: Add fixtures to `src/core/test-fixtures.ts`**

Change the imports at the top to:
```ts
import { fromISO, type ISODate } from './dates'
import type { EmberData, FocusLog, Goal, StepTarget, Target, Task } from './model'
```
and append:
```ts
export const logFixture = (date: ISODate, target: Target | null, min = 25): FocusLog =>
  ({ id: `${date}-${Math.random()}`, at: fromISO(date).getTime(), date, min, target })

export const stepRef = (goal: string, ms: string, step: string): StepTarget =>
  ({ kind: 'step', goalId: goal, msId: `${goal}/${ms}`, stepId: `${goal}/${ms}/${step}` })

/**
 * Goals-view fixture (today = 2026-09-23): Foundations done (SVG, no time), First charts current
 * (Bar done with 75m, Line open with 25m yesterday + 25m today, Scatter open), Motion future (Easing).
 * 2h 5m focused, 4h 10m estimated.
 */
export function d3Fixture(): { goal: Goal; logs: FocusLog[] } {
  const goal = goalFixture('D3', [
    ['Foundations', [['SVG', '2026-07-01']]],
    ['First charts', [['Bar', '2026-09-01'], ['Line', null], ['Scatter', null]]],
    ['Motion', [['Easing', null]]],
  ])
  const bar = stepRef('D3', 'First charts', 'Bar')
  const line = stepRef('D3', 'First charts', 'Line')
  return {
    goal,
    logs: [
      logFixture('2026-08-30', bar), logFixture('2026-08-31', bar), logFixture('2026-09-01', bar),
      logFixture('2026-09-22', line), logFixture('2026-09-23', line),
    ],
  }
}
```

- [ ] **Step 2: Write the failing test**

`src/core/goalView.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { finishLine, goalKicker, goalLedger, goalList, goalTasks, roadmap, sessionBlocks } from './goalView'
import { tallyLogs } from './tally'
import { d3Fixture, goalFixture, stepRef, taskFixture } from './test-fixtures'

const TODAY = '2026-09-23'
const { goal, logs } = d3Fixture()
const { spent, spentToday } = tallyLogs(logs, TODAY)

describe('goal list, kicker and ledger', () => {
  it('summarises each goal for the list', () => {
    const spanish = goalFixture('Spanish', [['All', [['A', '2026-09-01'], ['B', '2026-09-02']]]])
    expect(goalList([goal, spanish], spent)).toEqual([
      { id: 'D3', title: 'D3', swatch: 'var(--color-accent)', pct: 40, complete: false, meta: '2h 5m focused · 2/5 steps' },
      { id: 'Spanish', title: 'Spanish', swatch: 'var(--color-text)', pct: 100, complete: true, meta: '0m focused · 2/2 steps' },
    ])
  })

  it('builds the header kicker', () => {
    expect(goalKicker(goal, spent)).toBe('Goal · 2h 5m focused · 1 of 3 milestones')
  })

  it('computes focused, estimated, left to go and accuracy', () => {
    expect(goalLedger(goal, spent)).toEqual({ focused: '2h 5m', estimated: '4h 10m', left: '1h 40m', accuracy: '75%' })
  })

  it('handles an empty goal', () => {
    const fresh = goalFixture('New', [['Getting started', []]])
    expect(goalLedger(fresh, spent)).toEqual({ focused: '0m', estimated: '0m', left: '0m', accuracy: '—' })
    expect(goalKicker(fresh, spent)).toBe('Goal · 0m focused · 0 of 1 milestones')
    expect(roadmap(fresh, spent, spentToday, null)[0]).toMatchObject({ current: true, complete: false, count: '0 / 0', steps: [] })
  })
})

describe('goalTasks', () => {
  it("lists the goal's open tasks and today's finished ones by date, Someday last", () => {
    const tasks = [
      taskFixture('t1', { goalId: 'D3', date: null }),
      taskFixture('t2', { goalId: 'D3', date: '2026-09-25' }),
      taskFixture('t3', { goalId: 'D3', date: TODAY }),
      taskFixture('t4', { goalId: 'D3', date: '2026-09-22', doneOn: '2026-09-22' }),
      taskFixture('t5', { goalId: 'D3', date: '2026-09-20', doneOn: TODAY }),
      taskFixture('t6', { goalId: 'Other' }),
    ]
    expect(goalTasks(tasks, 'D3', TODAY).map((t) => t.title)).toEqual(['t5', 't3', 't2', 't1'])
  })
})

describe('sessionBlocks', () => {
  it('draws earlier time in ink, today in accent, and the rest of the estimate outlined', () => {
    expect(sessionBlocks(50, 75, 25)).toEqual(['earlier', 'today', 'remaining'])
    expect(sessionBlocks(75, 50, 0)).toEqual(['earlier', 'earlier', 'earlier'])
    expect(sessionBlocks(0, 50, 0)).toEqual(['remaining', 'remaining'])
    expect(sessionBlocks(25, 50, 50)).toEqual(['today', 'remaining'])
  })
})

describe('roadmap', () => {
  const rows = roadmap(goal, spent, spentToday, stepRef('D3', 'First charts', 'Line'))

  it('builds milestone rows with state, ledger and segments', () => {
    expect(rows.map((r) => [r.num, r.title, r.complete, r.current, r.count, r.ledger, r.segments])).toEqual([
      ['01', 'Foundations', true, false, '1 / 1', '0m of est. 50m', [true]],
      ['02', 'First charts', false, true, '1 / 3', '2h 5m of est. 2h 30m', [true, false, false]],
      ['03', 'Motion', false, false, '0 / 1', '0m of est. 50m', [false]],
    ])
  })

  it('builds roadmap rows for steps with blocks, ledger and notes', () => {
    const [svg] = rows[0].steps
    const [bar, line, scatter] = rows[1].steps
    expect(svg).toMatchObject({ title: 'SVG', done: true, ledger: '0m / 50m', note: 'Done Jul 1', noteAccent: false, blocks: ['remaining', 'remaining'] })
    expect(bar).toMatchObject({ done: true, ledger: '1h 15m / 50m', note: '+25m over', noteAccent: true, blocks: ['earlier', 'earlier', 'earlier'] })
    expect(line).toMatchObject({ done: false, selected: true, ledger: '50m / 50m', note: '', blocks: ['earlier', 'today'] })
    expect(line.target).toEqual(stepRef('D3', 'First charts', 'Line'))
    expect(scatter).toMatchObject({ selected: false, blocks: ['remaining', 'remaining'] })
  })
})

describe('finishLine', () => {
  it('shows the outcome, or a prompt, and whether it is reached', () => {
    expect(finishLine(goal)).toEqual({ reached: false, title: 'Finish line', text: 'Describe what done looks like above.' })
    const done = { ...goalFixture('Done', [['M', [['A', '2026-09-01']]]]), outcome: 'Ship it' }
    expect(finishLine(done)).toEqual({ reached: true, title: 'Finish line — reached', text: 'Ship it' })
    expect(finishLine(goalFixture('Empty', [])).reached).toBe(false)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- src/core/goalView.test.ts`
Expected: FAIL — cannot resolve `./goalView`.

- [ ] **Step 4: Write `src/core/goalView.ts`**

```ts
import { dayLabel, type ISODate } from './dates'
import { fmtM, pad2 } from './format'
import { goalColor, goalStats, isMilestoneDone, stepTarget } from './goals'
import type { Goal, Selection, Step, StepTarget, Task } from './model'
import { sameTarget } from './model'

const SESSION = 25

const stepMin = (spent: Map<string, number>, s: Step): number => spent.get(`step:${s.id}`) ?? 0
const allSteps = (g: Goal): Step[] => g.milestones.flatMap((m) => m.steps)
const sumEst = (steps: Step[]) => steps.reduce((a, s) => a + s.estMin, 0)
const sumMin = (steps: Step[], spent: Map<string, number>) => steps.reduce((a, s) => a + stepMin(spent, s), 0)

/** Minutes focused on a goal's steps. */
export const goalFocused = (g: Goal, spent: Map<string, number>): number => sumMin(allSteps(g), spent)

export interface GoalListItem { id: string; title: string; swatch: string; pct: number; complete: boolean; meta: string }

export function goalList(goals: Goal[], spent: Map<string, number>): GoalListItem[] {
  return goals.map((g, gi) => {
    const st = goalStats(g)
    return {
      id: g.id,
      title: g.title,
      swatch: goalColor(gi),
      pct: st.pct,
      complete: st.total > 0 && st.pct === 100,
      meta: `${fmtM(goalFocused(g, spent))} focused · ${st.done}/${st.total} steps`,
    }
  })
}

export function goalKicker(g: Goal, spent: Map<string, number>): string {
  const st = goalStats(g)
  return `Goal · ${fmtM(goalFocused(g, spent))} focused · ${st.milestonesDone} of ${g.milestones.length} milestones`
}

export interface GoalLedger { focused: string; estimated: string; left: string; accuracy: string }

export function goalLedger(g: Goal, spent: Map<string, number>): GoalLedger {
  const steps = allSteps(g)
  const open = steps.filter((s) => s.doneOn == null)
  const done = steps.filter((s) => s.doneOn != null)
  const doneEst = sumEst(done)
  const doneMin = sumMin(done, spent)
  const hi = Math.max(doneEst, doneMin)
  return {
    focused: fmtM(sumMin(steps, spent)),
    estimated: fmtM(sumEst(steps)),
    left: fmtM(open.reduce((a, s) => a + Math.max(0, s.estMin - stepMin(spent, s)), 0)),
    accuracy: done.length && hi > 0 ? `${Math.round((Math.min(doneEst, doneMin) / hi) * 100)}%` : '—',
  }
}

const NO_DATE = '9999-12-31'

/** Open tasks linked to the goal plus those finished today, by date with Someday last. */
export function goalTasks(tasks: Task[], goalId: string, today: ISODate): Task[] {
  return tasks
    .filter((t) => t.goalId === goalId && (t.doneOn == null || t.doneOn === today))
    .sort((a, b) => {
      const x = a.date ?? NO_DATE
      const y = b.date ?? NO_DATE
      return x < y ? -1 : x > y ? 1 : 0
    })
}

export type BlockKind = 'earlier' | 'today' | 'remaining'

/** One block per 25 minutes: max(spent, estimate) blocks; the last `today` minutes of spent time are accent. */
export function sessionBlocks(min: number, est: number, todayMin: number): BlockKind[] {
  const spentBlocks = Math.round(min / SESSION)
  const estBlocks = Math.round(est / SESSION)
  const todayBlocks = Math.min(spentBlocks, Math.round(todayMin / SESSION))
  return Array.from({ length: Math.max(spentBlocks, estBlocks) }, (_, b) =>
    b < spentBlocks ? (b >= spentBlocks - todayBlocks ? 'today' : 'earlier') : 'remaining')
}

export interface StepRow {
  id: string
  title: string
  done: boolean
  selected: boolean
  target: StepTarget
  ledger: string
  note: string
  noteAccent: boolean
  blocks: BlockKind[]
}

export interface MilestoneRow {
  id: string
  num: string
  title: string
  complete: boolean
  current: boolean
  count: string
  ledger: string
  segments: boolean[]
  steps: StepRow[]
}

export function roadmap(
  g: Goal, spent: Map<string, number>, spentToday: Map<string, number>, selection: Selection,
): MilestoneRow[] {
  const current = goalStats(g).currentIndex
  return g.milestones.map((m, mi) => {
    const steps: StepRow[] = m.steps.map((s) => {
      const min = stepMin(spent, s)
      const done = s.doneOn != null
      const over = Math.round(min / SESSION) > Math.round(s.estMin / SESSION)
      const target = stepTarget(g, m, s)
      return {
        id: s.id,
        title: s.title,
        done,
        selected: sameTarget(selection, target),
        target,
        ledger: `${fmtM(min)} / ${fmtM(s.estMin)}`,
        note: over ? `+${fmtM(min - s.estMin)} over` : done ? `Done ${dayLabel(s.doneOn!)}` : '',
        noteAccent: over,
        blocks: sessionBlocks(min, s.estMin, stepMin(spentToday, s)),
      }
    })
    return {
      id: m.id,
      num: pad2(mi + 1),
      title: m.title,
      complete: isMilestoneDone(m),
      current: mi === current,
      count: `${m.steps.filter((s) => s.doneOn != null).length} / ${m.steps.length}`,
      ledger: `${fmtM(sumMin(m.steps, spent))} of est. ${fmtM(sumEst(m.steps))}`,
      segments: m.steps.map((s) => s.doneOn != null),
      steps,
    }
  })
}

export function finishLine(g: Goal): { reached: boolean; title: string; text: string } {
  const reached = g.milestones.length > 0 && g.milestones.every(isMilestoneDone)
  return {
    reached,
    title: reached ? 'Finish line — reached' : 'Finish line',
    text: g.outcome || 'Describe what done looks like above.',
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS; no type errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(core): derive goal list, ledger, goal tasks and roadmap rows"
```

---

### Task 2: UI state for the Goals tab

**Files:**
- Modify: `src/stores/ui.ts`, `src/stores/ui.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces on `useUiStore()`: `expanded` (reactive `Record<msId, boolean>`), `adding` (ref `{ kind: 'step'; msId: string } | { kind: 'milestone' } | null`), `draft` (ref string), `goalDraft` (ref string), `goalTasksAll` (reactive `Record<goalId, boolean>`), `selectGoal(id: string)` (sets `activeGoalId`, clears `adding` and `draft`).

- [ ] **Step 1: Write the failing test** — append inside `describe('ui store', …)` in `src/stores/ui.test.ts`:

```ts
  it('holds Goals-tab state and closes any add input when another goal is selected', () => {
    const ui = useUiStore()
    expect(ui.expanded).toEqual({})
    expect(ui.adding).toBeNull()
    expect(ui.draft).toBe('')
    expect(ui.goalDraft).toBe('')
    expect(ui.goalTasksAll).toEqual({})
    ui.adding = { kind: 'step', msId: 'm' }
    ui.draft = 'half typed'
    ui.selectGoal('Spanish')
    expect(ui.activeGoalId).toBe('Spanish')
    expect(ui.adding).toBeNull()
    expect(ui.draft).toBe('')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/stores/ui.test.ts`
Expected: FAIL — `expanded` is undefined.

- [ ] **Step 3: Extend `src/stores/ui.ts`** — add after `openGroups`:

```ts
  /** Goals: milestone expanded state the user chose (the current milestone defaults to open). */
  const expanded = reactive<Record<string, boolean>>({})
  /** Goals: the add-step or add-milestone input that is open, if any. */
  const adding = ref<{ kind: 'step'; msId: string } | { kind: 'milestone' } | null>(null)
  /** Goals: text in the open add-step / add-milestone input. */
  const draft = ref('')
  /** Goals: the "New goal" input. */
  const goalDraft = ref('')
  /** Goals: "Show all" tasks, per goal. */
  const goalTasksAll = reactive<Record<string, boolean>>({})

  function selectGoal(id: string) {
    activeGoalId.value = id
    adding.value = null
    draft.value = ''
  }
```

and add `expanded, adding, draft, goalDraft, goalTasksAll,` to the returned state and `selectGoal,` to the returned actions.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(store): add Goals-tab UI state"
```

---

### Task 3: Goal variant of the task row, and goal tasks

**Files:**
- Modify: `src/components/TaskRow.vue`, `src/components/TaskRow.test.ts`
- Create: `src/components/goals/GoalTasks.vue`
- Test: `src/components/goals/GoalTasks.test.ts`

**Interfaces:**
- Consumes: `goalTasks` (goalView.ts); `ui.goalTasksAll`; `TaskRow`.
- Produces: `TaskRow` `variant` accepts `'goal'` — grid `22px | 1fr | auto | 28px` (checkbox, body, focused time, focus button; no move button), highlighted when selected. `<GoalTasks :goal="Goal" />` — renders nothing when the goal has no tasks. CSS hooks: `.goal-tasks`, `.gt-more`.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/TaskRow.test.ts`:
```ts
describe('TaskRow — goal', () => {
  it('shows time and a focus button but no move button, with the date shown', async () => {
    const { w, ember } = setup(taskFixture('Paper', { goalId: 'D3', tag: '', date: '2026-09-26' }), 'goal', true)
    expect(w.find('.task-row').classes()).toContain('is-goal')
    expect(w.find('.tr-defer').exists()).toBe(false)
    expect(w.find('.tr-pull').exists()).toBe(false)
    expect(w.find('.tr-spent').exists()).toBe(true)
    expect(w.find('.tr-note').text()).toBe('Sep 26')
    await w.find('.tr-focus').trigger('click')
    expect(ember.selection).toEqual({ kind: 'task', taskId: 'Paper' })
    expect(w.find('.task-row').classes()).toContain('is-selected')
  })
})
```
Also change that file's `setup` signature type from `variant: 'today' | 'upcoming' = 'today'` to `variant: 'today' | 'upcoming' | 'goal' = 'today'`.

`src/components/goals/GoalTasks.test.ts`:
```ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../../core/model'
import { dataFixture, goalFixture, taskFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import GoalTasks from './GoalTasks.vue'

function setup(tasks: Task[]) {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  ember.replaceData(dataFixture({ goals: [goalFixture('D3', [])], tasks }))
  return mount(GoalTasks, { props: { goal: ember.goals[0] } })
}
const seven = () => Array.from({ length: 7 }, (_, i) => taskFixture(`T${i + 1}`, { goalId: 'D3', date: `2026-09-2${i + 3}` }))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('GoalTasks', () => {
  it('renders nothing when the goal has no tasks', () => {
    expect(setup([taskFixture('Other')]).find('.goal-tasks').exists()).toBe(false)
  })

  it('shows the first five, then all, then fewer', async () => {
    const w = setup(seven())
    expect(w.text()).toContain('Tasks for this goal')
    expect(w.findAll('.task-row')).toHaveLength(5)
    expect(w.find('.gt-more').text()).toBe('Show all 7')
    await w.find('.gt-more').trigger('click')
    expect(w.findAll('.task-row')).toHaveLength(7)
    expect(w.find('.gt-more').text()).toBe('Show fewer')
  })

  it('shows dates on the rows', () => {
    const w = setup([taskFixture('Read', { goalId: 'D3', date: null })])
    expect(w.find('.tr-note').text()).toBe('Someday')
    expect(w.find('.gt-more').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/components/TaskRow.test.ts src/components/goals`
Expected: FAIL — TaskRow goal test fails (no `.tr-spent` / `.tr-focus` for `goal`); GoalTasks cannot resolve `./GoalTasks.vue`.

- [ ] **Step 3: Add the `goal` variant to `src/components/TaskRow.vue`**

- Props type: `variant: 'today' | 'upcoming' | 'goal'`.
- Root class binding: `{ 'is-done': done, 'is-selected': selected && variant !== 'upcoming' }`.
- Replace `<template v-if="variant === 'today'">` with `<template v-if="variant !== 'upcoming'">`, and give the move-to-tomorrow button `v-if="variant === 'today'"`.
- Add to `<style scoped>`:
```css
.task-row.is-goal { grid-template-columns: 22px minmax(0, 1fr) auto 28px; gap: var(--space-3); padding: 6px var(--space-2); }
```

- [ ] **Step 4: Write `src/components/goals/GoalTasks.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { goalTasks } from '../../core/goalView'
import type { Goal } from '../../core/model'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import TaskRow from '../TaskRow.vue'

const props = defineProps<{ goal: Goal }>()
const ember = useEmberStore()
const ui = useUiStore()

const all = computed(() => goalTasks(ember.tasks, props.goal.id, ember.today))
const showAll = computed(() => !!ui.goalTasksAll[props.goal.id])
const shown = computed(() => (showAll.value ? all.value : all.value.slice(0, 5)))
const toggle = () => { ui.goalTasksAll[props.goal.id] = !showAll.value }
</script>

<template>
  <section v-if="all.length" class="goal-tasks">
    <span class="kicker">Tasks for this goal</span>
    <div class="gt-rows">
      <TaskRow v-for="t in shown" :key="t.id" :task="t" variant="goal" show-date />
    </div>
    <button v-if="all.length > 5" class="btn btn-ghost gt-more" @click="toggle">
      {{ showAll ? 'Show fewer' : `Show all ${all.length}` }}
    </button>
  </section>
</template>

<style scoped>
.goal-tasks { display: flex; flex-direction: column; gap: var(--space-2); }
.gt-rows { display: flex; flex-direction: column; border-top: 2px solid var(--color-divider); }
.gt-more { align-self: flex-start; padding-left: 0; }
</style>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add goal tasks with a goal variant of the task row"
```

---

### Task 4: Goal list and goal summary

**Files:**
- Create: `src/components/goals/GoalList.vue`, `src/components/goals/GoalSummary.vue`
- Test: `src/components/goals/GoalList.test.ts`, `src/components/goals/GoalSummary.test.ts`

**Interfaces:**
- Consumes: `goalList`, `goalKicker`, `goalLedger` (goalView.ts); `goalStats`; store `goals`, `tally`, `addGoal`, `setOutcome`; `ui.goalDraft`, `ui.selectGoal`, `ui.adding`.
- Produces: `<GoalList :active-id="string | null" />`, `<GoalSummary :goal="Goal" />`. CSS hooks: `.gl-item`, `.is-active`, `.gl-name`, `.gl-pct`, `.gl-bar span`, `.is-complete`, `.gl-meta`, `.gl-input`, `.gl-add`; `.gs-kicker`, `.gs-title`, `.gs-pct`, `.gs-outcome`, `.gs-stat`, `.gs-stat-value`.

- [ ] **Step 1: Write the failing tests**

`src/components/goals/GoalList.test.ts`:
```ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { d3Fixture, dataFixture, goalFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import GoalList from './GoalList.vue'

function setup() {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  const { goal, logs } = d3Fixture()
  ember.replaceData(dataFixture({ goals: [goal, goalFixture('Spanish', [['All', [['A', '2026-09-01']]]])], logs }))
  return { w: mount(GoalList, { props: { activeId: 'D3' } }), ember, ui: useUiStore() }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('GoalList', () => {
  it('lists goals with progress and focused time, marking the open one', () => {
    const { w } = setup()
    const items = w.findAll('.gl-item')
    expect(items.map((i) => i.find('.gl-name').text())).toEqual(['D3', 'Spanish'])
    expect(items[0].find('.gl-pct').text()).toBe('40%')
    expect(items[0].find('.gl-meta').text()).toBe('2h 5m focused · 2/5 steps')
    expect(items[0].find('.gl-bar span').attributes('style')).toContain('width: 40%')
    expect(items[0].classes()).toContain('is-active')
    expect(items[1].find('.gl-bar span').classes()).toContain('is-complete')
  })

  it('selects a goal', async () => {
    const { w, ui } = setup()
    await w.findAll('.gl-item')[1].trigger('click')
    expect(ui.activeGoalId).toBe('Spanish')
  })

  it('adds a goal and opens its first add-step input', async () => {
    const { w, ember, ui } = setup()
    await w.find('.gl-input').setValue('Learn Three.js')
    await w.find('.gl-input').trigger('keydown', { key: 'Enter' })
    const added = ember.goals[2]
    expect(added).toMatchObject({ title: 'Learn Three.js' })
    expect(ui.activeGoalId).toBe(added.id)
    expect(ui.adding).toEqual({ kind: 'step', msId: added.milestones[0].id })
    expect(ui.goalDraft).toBe('')
  })

  it('ignores an empty goal name', async () => {
    const { w, ember } = setup()
    await w.find('.gl-add').trigger('click')
    expect(ember.goals).toHaveLength(2)
  })
})
```

`src/components/goals/GoalSummary.test.ts`:
```ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { d3Fixture, dataFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import GoalSummary from './GoalSummary.vue'

function setup() {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  const { goal, logs } = d3Fixture()
  ember.replaceData(dataFixture({ goals: [goal], logs }))
  return { w: mount(GoalSummary, { props: { goal: ember.goals[0] } }), ember }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('GoalSummary', () => {
  it('shows the kicker, title and percentage', () => {
    const { w } = setup()
    expect(w.find('.gs-kicker').text()).toBe('Goal · 2h 5m focused · 1 of 3 milestones')
    expect(w.find('.gs-title').text()).toBe('D3')
    expect(w.find('.gs-pct').text()).toBe('40%')
  })

  it('shows the ledger stats', () => {
    const { w } = setup()
    expect(w.findAll('.gs-stat').map((s) => s.text())).toEqual([
      'Focused2h 5m', 'Estimated4h 10m', 'Left to go1h 40m', 'Accuracy75%',
    ])
    expect(w.findAll('.gs-stat-value')[0].classes()).toContain('is-accent')
  })

  it('edits the outcome', async () => {
    const { w, ember } = setup()
    await w.find('.gs-outcome').setValue('Ship a chart')
    expect(ember.goals[0].outcome).toBe('Ship a chart')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/components/goals`
Expected: GoalList and GoalSummary FAIL — cannot resolve the `.vue` files.

- [ ] **Step 3: Write `src/components/goals/GoalList.vue`**

```vue
<script setup lang="ts">
import { Plus } from 'lucide-vue-next'
import { computed } from 'vue'
import { goalList } from '../../core/goalView'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'

defineProps<{ activeId: string | null }>()
const ember = useEmberStore()
const ui = useUiStore()
const items = computed(() => goalList(ember.goals, ember.tally.spent))

function add() {
  const goal = ember.addGoal(ui.goalDraft)
  if (!goal) return
  ui.goalDraft = ''
  ui.selectGoal(goal.id)
  ui.adding = { kind: 'step', msId: goal.milestones[0].id }
}

function onEnter(e: KeyboardEvent) {
  if (!e.isComposing) add()
}
</script>

<template>
  <aside class="goal-list">
    <span class="kicker">Goals</span>
    <div class="gl-items">
      <button
        v-for="g in items"
        :key="g.id"
        class="gl-item"
        :class="{ 'is-active': g.id === activeId }"
        :aria-current="g.id === activeId ? 'true' : undefined"
        @click="ui.selectGoal(g.id)"
      >
        <span class="gl-top">
          <span class="gl-name"><span class="swatch" :style="{ background: g.swatch }"></span>{{ g.title }}</span>
          <span class="gl-pct">{{ g.pct }}%</span>
        </span>
        <span class="gl-bar"><span :class="{ 'is-complete': g.complete }" :style="{ width: `${g.pct}%` }"></span></span>
        <span class="gl-meta">{{ g.meta }}</span>
      </button>
    </div>
    <div class="gl-new">
      <label class="gl-new-label" for="ember-new-goal">New goal</label>
      <div class="gl-new-row">
        <input id="ember-new-goal" v-model="ui.goalDraft" class="input gl-input" placeholder="e.g. Learn Three.js" @keydown.enter="onEnter" />
        <button class="btn btn-primary btn-icon gl-add" aria-label="Add goal" @click="add"><Plus :size="16" :stroke-width="2.5" /></button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.goal-list {
  display: flex; flex-direction: column; gap: var(--space-4);
  padding: var(--space-6); border-right: 2px solid var(--color-divider);
}
.gl-items { display: flex; flex-direction: column; border-top: 2px solid var(--color-divider); }
.gl-item {
  display: flex; flex-direction: column; align-items: stretch; gap: 8px; padding: var(--space-3);
  border: 0; border-bottom: 1px solid var(--color-divider); background: transparent; color: var(--color-text); text-align: left;
}
.gl-item:hover, .gl-item.is-active { background: var(--color-accent-100); }
.gl-top { display: flex; justify-content: space-between; gap: 8px; }
.gl-name { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 14px; font-weight: 700; }
.gl-pct { font-size: 13px; font-weight: 700; }
.gl-bar { display: block; height: 4px; background: var(--color-neutral-300); }
.gl-bar span { display: block; height: 100%; background: var(--color-text); }
.gl-bar span.is-complete { background: var(--color-accent); }
.gl-meta { font-size: 12px; color: var(--color-neutral-700); }
.gl-new { display: flex; flex-direction: column; gap: var(--space-2); margin-top: auto; }
.gl-new-label { font-size: 12px; font-weight: 700; }
.gl-new-row { display: flex; gap: var(--space-2); }
@media (max-width: 860px) {
  .goal-list { padding: var(--space-4); border-right: 0; border-bottom: 2px solid var(--color-divider); }
}
</style>
```

- [ ] **Step 4: Write `src/components/goals/GoalSummary.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { goalKicker, goalLedger } from '../../core/goalView'
import { goalStats } from '../../core/goals'
import type { Goal } from '../../core/model'
import { useEmberStore } from '../../stores/ember'

const props = defineProps<{ goal: Goal }>()
const ember = useEmberStore()

const kicker = computed(() => goalKicker(props.goal, ember.tally.spent))
const pct = computed(() => goalStats(props.goal).pct)
const ledger = computed(() => goalLedger(props.goal, ember.tally.spent))
const stats = computed(() => [
  { label: 'Focused', value: ledger.value.focused, accent: true },
  { label: 'Estimated', value: ledger.value.estimated, accent: false },
  { label: 'Left to go', value: ledger.value.left, accent: false },
  { label: 'Accuracy', value: ledger.value.accuracy, accent: false },
])

const onOutcome = (e: Event) => ember.setOutcome(props.goal.id, (e.target as HTMLTextAreaElement).value)
</script>

<template>
  <div class="goal-summary">
    <div class="gs-head">
      <div>
        <span class="kicker gs-kicker">{{ kicker }}</span>
        <h2 class="gs-title">{{ goal.title }}</h2>
      </div>
      <div class="gs-pct">{{ pct }}%</div>
    </div>
    <div class="gs-readme">
      <div class="gs-readme-bar section-label">
        <span>Readme · what done looks like</span><span class="gs-hint">Click to edit</span>
      </div>
      <textarea
        class="gs-outcome"
        rows="2"
        :value="goal.outcome"
        placeholder="Describe the finish line — what will you be able to do?"
        aria-label="What done looks like"
        @input="onOutcome"
      ></textarea>
    </div>
    <div class="gs-stats">
      <div v-for="s in stats" :key="s.label" class="gs-stat">
        <div class="label">{{ s.label }}</div>
        <div class="stat-value gs-stat-value" :class="{ 'is-accent': s.accent }">{{ s.value }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.goal-summary { display: flex; flex-direction: column; gap: var(--space-6); }
.gs-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--space-6); align-items: end; }
.gs-title { margin-top: 4px; overflow-wrap: anywhere; }
.gs-pct { font: 800 64px/.9 var(--font-heading); letter-spacing: -.03em; }
.gs-readme { border: 2px solid var(--color-divider); }
.gs-readme-bar {
  display: flex; justify-content: space-between; gap: var(--space-2);
  padding: var(--space-2) var(--space-3); border-bottom: 2px solid var(--color-divider);
}
.gs-hint { font-weight: 400; color: var(--color-neutral-700); }
.gs-outcome {
  display: block; width: 100%; resize: none; border: 0; padding: var(--space-3);
  background: transparent; font-size: 15px; line-height: 1.45; color: var(--color-text);
}
.gs-outcome:focus { outline: 2px solid var(--color-accent); outline-offset: -2px; }
.gs-stats {
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
  border-top: 2px solid var(--color-divider); border-bottom: 2px solid var(--color-divider);
}
.gs-stat { padding: var(--space-3); border-left: 2px solid var(--color-divider); }
.gs-stat:first-child { padding-left: 0; border-left: 0; }
.gs-stat-value.is-accent { color: var(--color-accent-700); }
@media (max-width: 560px) {
  .gs-pct { font-size: 44px; }
  .gs-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .gs-stat:nth-child(3) { padding-left: 0; border-left: 0; }
  .gs-stat:nth-child(n + 3) { border-top: 2px solid var(--color-divider); }
}
</style>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add goal list and goal summary"
```

---

### Task 5: Roadmap

**Files:**
- Create: `src/components/goals/Roadmap.vue`
- Test: `src/components/goals/Roadmap.test.ts`

**Interfaces:**
- Consumes: `roadmap`, `finishLine`, `MilestoneRow` (goalView.ts); store `tally`, `selection`, `toggleStep`, `select`, `addStep`, `addMilestone`; `ui.expanded`, `ui.adding`, `ui.draft`.
- Produces: `<Roadmap :goal="Goal" />`. CSS hooks: `.rm-legend`, `.rm-ms`, `.rm-marker`, `.is-complete`, `.is-current`, `.rm-head`, `.rm-title`, `.rm-ledger`, `.rm-count`, `.rm-segs span`, `.step-row`, `.is-selected`, `.sr-title`, `.sr-blocks .blk`, `.is-earlier|is-today|is-remaining`, `.sr-ledger`, `.sr-note`, `.sr-focus`, `.rm-add-step`, `.rm-step-input`, `.rm-add-ms`, `.rm-ms-input`, `.rm-flag`, `.is-reached`, `.rm-finish-title`, `.rm-finish-outcome`.

- [ ] **Step 1: Write the failing test**

`src/components/goals/Roadmap.test.ts`:
```ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { Goal } from '../../core/model'
import { d3Fixture, dataFixture, goalFixture, stepRef } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import Roadmap from './Roadmap.vue'

function setup(goal?: Goal) {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  const d3 = d3Fixture()
  ember.replaceData(dataFixture({ goals: [goal ?? d3.goal], logs: d3.logs }))
  return { w: mount(Roadmap, { props: { goal: ember.goals[0] }, attachTo: document.body }), ember, ui: useUiStore() }
}
const blocks = (row: ReturnType<ReturnType<typeof mount>['find']>) =>
  row.findAll('.blk').map((b) => b.classes().find((c) => c.startsWith('is-')))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('Roadmap', () => {
  it('shows the legend and milestone markers by state', () => {
    const { w } = setup()
    expect(w.find('.rm-legend').text()).toBe('Earlier sessionsTodayEstimate remaining1 block = 25 min')
    const markers = w.findAll('.rm-marker')
    expect(markers[0].classes()).toContain('is-complete')
    expect(markers[0].find('svg').exists()).toBe(true)
    expect(markers[1].classes()).toContain('is-current')
    expect(markers[1].text()).toBe('02')
    expect(markers[2].classes()).not.toContain('is-current')
    expect(markers[2].text()).toBe('03')
    w.unmount()
  })

  it('shows milestone headers with "You are here", ledger and count', () => {
    const { w } = setup()
    const heads = w.findAll('.rm-head')
    expect(heads.map((h) => h.find('.rm-title').text())).toEqual(['Foundations', 'First charts', 'Motion'])
    expect(heads[1].text()).toContain('You are here')
    expect(heads[1].find('.rm-ledger').text()).toBe('2h 5m of est. 2h 30m')
    expect(heads[1].find('.rm-count').text()).toBe('1 / 3')
    expect(w.findAll('.rm-ms')[1].findAll('.rm-segs span').map((s) => s.classes().includes('is-done'))).toEqual([true, false, false])
    w.unmount()
  })

  it('expands only the current milestone by default and remembers toggles', async () => {
    const { w } = setup()
    expect(w.findAll('.sr-title').map((t) => t.text())).toEqual(['Bar', 'Line', 'Scatter'])
    const heads = w.findAll('.rm-head')
    expect(heads[1].attributes('aria-expanded')).toBe('true')
    await heads[1].trigger('click')
    expect(w.findAll('.sr-title')).toHaveLength(0)
    await heads[0].trigger('click')
    expect(w.findAll('.sr-title').map((t) => t.text())).toEqual(['SVG'])
    w.unmount()
  })

  it('draws session blocks, ledgers and notes on step rows', () => {
    const { w } = setup()
    const [bar, line, scatter] = w.findAll('.step-row')
    expect(blocks(bar)).toEqual(['is-earlier', 'is-earlier', 'is-earlier'])
    expect(bar.find('.sr-ledger').text()).toBe('1h 15m / 50m+25m over')
    expect(bar.find('.sr-note').classes()).toContain('is-accent')
    expect(blocks(line)).toEqual(['is-earlier', 'is-today'])
    expect(blocks(scatter)).toEqual(['is-remaining', 'is-remaining'])
    expect(bar.classes()).toContain('is-done')
    expect(bar.find('.sr-focus').classes()).toContain('is-hidden')
    w.unmount()
  })

  it('completes and selects steps', async () => {
    const { w, ember } = setup()
    const line = () => w.findAll('.step-row')[1]
    await line().find('.sr-focus').trigger('click')
    expect(ember.selection).toEqual(stepRef('D3', 'First charts', 'Line'))
    expect(line().classes()).toContain('is-selected')
    await line().find('.check').trigger('click')
    expect(ember.goals[0].milestones[1].steps[1].doneOn).toBe('2026-09-23')
    expect(ember.selection).toEqual(stepRef('D3', 'First charts', 'Scatter'))
    w.unmount()
  })

  it('adds steps with Enter, keeps the input open, and closes it with Esc', async () => {
    const { w, ember } = setup()
    await w.find('.rm-add-step').trigger('click')
    const input = w.find('.rm-step-input')
    expect(document.activeElement).toBe(input.element)
    await input.setValue('Small multiples')
    await input.trigger('keydown', { key: 'Enter' })
    expect(ember.goals[0].milestones[1].steps.at(-1)).toMatchObject({ title: 'Small multiples', estMin: 50, doneOn: null })
    expect((w.find('.rm-step-input').element as HTMLInputElement).value).toBe('')
    await w.find('.rm-step-input').trigger('keydown', { key: 'Escape' })
    expect(w.find('.rm-step-input').exists()).toBe(false)
    w.unmount()
  })

  it('ignores empty step names', async () => {
    const { w, ember } = setup()
    await w.find('.rm-add-step').trigger('click')
    await w.find('.rm-step-input').trigger('keydown', { key: 'Enter' })
    expect(ember.goals[0].milestones[1].steps).toHaveLength(3)
    expect(w.find('.rm-step-input').exists()).toBe(true)
    w.unmount()
  })

  it('adds a milestone', async () => {
    const { w, ember } = setup()
    await w.find('.rm-add-ms').trigger('click')
    await w.find('.rm-ms-input').setValue('Capstone')
    await w.find('.rm-ms-input').trigger('keydown', { key: 'Enter' })
    expect(ember.goals[0].milestones.at(-1)?.title).toBe('Capstone')
    w.unmount()
  })

  it('shows the outcome on the finish line, and marks it reached when every milestone is done', async () => {
    const { w, ember } = setup()
    expect(w.find('.rm-finish-title').text()).toBe('Finish line')
    expect(w.find('.rm-finish-outcome').text()).toBe('Describe what done looks like above.')
    ember.setOutcome('D3', 'Publish a chart')
    await nextTick()
    expect(w.find('.rm-finish-outcome').text()).toBe('Publish a chart')
    w.unmount()

    const done = setup(goalFixture('Done', [['M', [['A', '2026-09-01']]]]))
    expect(done.w.find('.rm-flag').classes()).toContain('is-reached')
    expect(done.w.find('.rm-finish-title').text()).toBe('Finish line — reached')
    done.w.unmount()
  })

  it('opens the add-step input of a brand-new goal straight away', async () => {
    const fresh = goalFixture('New', [['Getting started', []]])
    setActivePinia(createPinia())
    const ember = useEmberStore()
    ember.replaceData(dataFixture({ goals: [fresh] }))
    useUiStore().adding = { kind: 'step', msId: 'New/Getting started' }
    const w = mount(Roadmap, { props: { goal: ember.goals[0] }, attachTo: document.body })
    expect(w.find('.rm-head').text()).toContain('You are here')
    expect(document.activeElement).toBe(w.find('.rm-step-input').element)
    w.unmount()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/goals/Roadmap.test.ts`
Expected: FAIL — cannot resolve `./Roadmap.vue`.

- [ ] **Step 3: Write `src/components/goals/Roadmap.vue`**

```vue
<script setup lang="ts">
import { Check, ChevronDown, Flag, Plus, Timer } from 'lucide-vue-next'
import { computed, type Directive } from 'vue'
import { finishLine, roadmap, type MilestoneRow } from '../../core/goalView'
import type { Goal } from '../../core/model'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'

const props = defineProps<{ goal: Goal }>()
const ember = useEmberStore()
const ui = useUiStore()

const rows = computed(() => roadmap(props.goal, ember.tally.spent, ember.tally.spentToday, ember.selection))
const finish = computed(() => finishLine(props.goal))

const vFocus: Directive<HTMLElement> = { mounted: (el) => el.focus() }

const isExpanded = (r: MilestoneRow) => ui.expanded[r.id] ?? r.current
const toggle = (r: MilestoneRow) => { ui.expanded[r.id] = !isExpanded(r) }
const addingStepTo = (msId: string) => ui.adding?.kind === 'step' && ui.adding.msId === msId

function startStep(msId: string) {
  ui.adding = { kind: 'step', msId }
  ui.draft = ''
}
function startMilestone() {
  ui.adding = { kind: 'milestone' }
  ui.draft = ''
}
function cancel() {
  ui.adding = null
}
function commit(e: KeyboardEvent) {
  if (e.isComposing) return
  const a = ui.adding
  if (!a) return
  const added = a.kind === 'step'
    ? ember.addStep(props.goal.id, a.msId, ui.draft)
    : ember.addMilestone(props.goal.id, ui.draft)
  if (added) ui.draft = ''
}
</script>

<template>
  <section class="roadmap">
    <div class="rm-legend">
      <span><i class="blk is-earlier"></i>Earlier sessions</span>
      <span><i class="blk is-today"></i>Today</span>
      <span><i class="blk is-remaining"></i>Estimate remaining</span>
      <span>1 block = 25 min</span>
    </div>

    <div class="rm-list">
      <div v-for="r in rows" :key="r.id" class="rm-ms">
        <div class="rm-rail">
          <div class="rm-line" :class="{ 'is-complete': r.complete }"></div>
          <div class="rm-marker" :class="{ 'is-complete': r.complete, 'is-current': r.current && !r.complete }">
            <Check v-if="r.complete" :size="16" :stroke-width="3.5" />
            <span v-else>{{ r.num }}</span>
          </div>
        </div>
        <div class="rm-body">
          <button class="rm-head" :aria-expanded="isExpanded(r)" @click="toggle(r)">
            <span class="rm-title">{{ r.title }}</span>
            <span v-if="r.current" class="tag tag-accent">You are here</span>
            <span class="rm-ledger">{{ r.ledger }}</span>
            <span class="rm-count">{{ r.count }}</span>
            <ChevronDown :size="18" :stroke-width="2.5" class="rm-chev" :class="{ 'is-open': isExpanded(r) }" />
          </button>
          <div class="rm-segs"><span v-for="(isDone, i) in r.segments" :key="i" :class="{ 'is-done': isDone }"></span></div>
          <div v-if="isExpanded(r)" class="rm-steps">
            <div v-for="s in r.steps" :key="s.id" class="step-row" :class="{ 'is-done': s.done, 'is-selected': s.selected }">
              <button
                class="check"
                :class="{ 'is-done': s.done }"
                role="checkbox"
                :aria-checked="s.done"
                :aria-label="s.title"
                @click="ember.toggleStep(s.target)"
              >
                <Check v-if="s.done" :size="14" :stroke-width="3.5" />
              </button>
              <span class="sr-title">{{ s.title }}</span>
              <div class="sr-blocks" aria-hidden="true">
                <i v-for="(b, i) in s.blocks" :key="i" class="blk" :class="`is-${b}`"></i>
              </div>
              <div class="sr-ledger tabular">
                <span>{{ s.ledger }}</span>
                <span class="sr-note" :class="{ 'is-accent': s.noteAccent }">{{ s.note }}</span>
              </div>
              <button
                class="icon-btn sr-focus"
                :class="{ 'is-on': s.selected, 'is-hidden': s.done }"
                aria-label="Focus on this step"
                title="Focus on this step"
                @click="ember.select(s.target)"
              >
                <Timer :size="16" :stroke-width="2.25" />
              </button>
            </div>
            <div v-if="addingStepTo(r.id)" class="rm-add-input">
              <input
                v-model="ui.draft"
                v-focus
                class="input rm-step-input"
                placeholder="New step (estimated 2 sessions), Enter to add"
                aria-label="New step"
                @keydown.enter="commit"
                @keydown.esc="cancel"
                @blur="cancel"
              />
            </div>
            <button v-else class="btn btn-ghost rm-add-step" @click="startStep(r.id)">
              <Plus :size="14" :stroke-width="2.5" />Add step
            </button>
          </div>
        </div>
      </div>

      <div class="rm-ms">
        <div class="rm-rail"><div class="rm-line rm-line-stub"></div></div>
        <div class="rm-body rm-body-stub">
          <input
            v-if="ui.adding?.kind === 'milestone'"
            v-model="ui.draft"
            v-focus
            class="input rm-ms-input"
            placeholder="Milestone name, Enter to add"
            aria-label="New milestone"
            @keydown.enter="commit"
            @keydown.esc="cancel"
            @blur="cancel"
          />
          <button v-else class="btn btn-secondary rm-add-ms" @click="startMilestone">
            <Plus :size="16" :stroke-width="2.5" />Add milestone
          </button>
        </div>
      </div>

      <div class="rm-finish">
        <div class="rm-flag" :class="{ 'is-reached': finish.reached }"><Flag :size="16" :stroke-width="2.5" /></div>
        <div class="rm-finish-text">
          <span class="rm-finish-title">{{ finish.title }}</span>
          <span class="rm-finish-outcome">{{ finish.text }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.roadmap { display: flex; flex-direction: column; gap: var(--space-6); }
.rm-legend { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-4); font-size: 12px; color: var(--color-neutral-700); }
.rm-legend span { display: flex; align-items: center; gap: 6px; }
.rm-legend .blk { width: 12px; height: 12px; }
.blk { display: block; flex: none; width: 14px; height: 14px; }
.blk.is-earlier { background: var(--color-text); }
.blk.is-today { background: var(--color-accent); }
.blk.is-remaining { box-shadow: inset 0 0 0 2px var(--color-neutral-400); }

.rm-list { display: flex; flex-direction: column; }
.rm-ms { display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: var(--space-4); }
.rm-rail { position: relative; }
.rm-line { position: absolute; top: 0; bottom: 0; left: 15px; width: 2px; background: var(--color-neutral-300); }
.rm-line.is-complete { background: var(--color-accent); }
.rm-line-stub { bottom: auto; height: 16px; }
.rm-marker {
  position: relative; width: 32px; height: 32px; display: grid; place-items: center;
  background: var(--color-bg); color: var(--color-neutral-700); box-shadow: inset 0 0 0 2px var(--color-neutral-400);
  font: 800 13px/1 var(--font-heading);
}
.rm-marker.is-current { background: var(--color-text); color: var(--color-bg); box-shadow: inset 0 0 0 2px var(--color-text); }
.rm-marker.is-complete { background: var(--color-accent); color: var(--color-bg); box-shadow: inset 0 0 0 2px var(--color-accent); }

.rm-body { min-width: 0; display: flex; flex-direction: column; gap: var(--space-3); padding: 4px 0 var(--space-6); }
.rm-head {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3);
  padding: 0; border: 0; background: none; color: var(--color-text); text-align: left;
}
.rm-title { font: 800 20px/1.2 var(--font-heading); }
.rm-ledger { margin-left: auto; font-size: 12px; color: var(--color-neutral-700); white-space: nowrap; }
.rm-count { font-size: 13px; font-weight: 700; white-space: nowrap; }
.rm-chev { flex: none; transition: transform .2s; }
.rm-chev.is-open { transform: rotate(180deg); }
.rm-segs { display: flex; gap: 3px; }
.rm-segs span { flex: 1; height: 8px; background: var(--color-neutral-300); }
.rm-segs span.is-done { background: var(--color-accent); }

.rm-steps { display: flex; flex-direction: column; border-top: 1px solid var(--color-divider); }
.step-row {
  display: grid; grid-template-columns: 22px minmax(0, 1fr) minmax(0, auto) 104px 28px; gap: var(--space-3);
  align-items: center; padding: 6px var(--space-2); border-bottom: 1px solid var(--color-divider);
}
.step-row.is-selected { background: var(--color-accent-100); }
.sr-title { font-size: 14px; overflow-wrap: anywhere; }
.step-row.is-done .sr-title { text-decoration: line-through; color: var(--color-neutral-700); }
.sr-blocks { display: flex; flex-wrap: wrap; gap: 3px; max-width: 220px; }
.sr-ledger { display: flex; flex-direction: column; font-size: 12px; }
.sr-note { color: var(--color-neutral-700); }
.sr-note.is-accent { color: var(--color-accent-700); font-weight: 700; }
.rm-add-input { padding-top: var(--space-2); }
.rm-add-step { align-self: flex-start; padding-left: 0; }
.rm-body-stub { padding: 0 0 var(--space-6); }
.rm-ms-input { max-width: 320px; }
.rm-add-ms { align-self: flex-start; }

.rm-finish { display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: var(--space-4); align-items: start; }
.rm-flag {
  width: 32px; height: 32px; display: grid; place-items: center;
  background: var(--color-bg); color: var(--color-text); box-shadow: inset 0 0 0 2px var(--color-text);
}
.rm-flag.is-reached { background: var(--color-accent); color: var(--color-bg); box-shadow: inset 0 0 0 2px var(--color-accent); }
.rm-finish-text { display: flex; flex-direction: column; gap: 4px; padding-top: 2px; }
.rm-finish-title { font: 800 20px/1.2 var(--font-heading); }
.rm-finish-outcome { font-size: 14px; color: var(--color-neutral-800); text-wrap: pretty; }

@media (max-width: 560px) {
  .step-row { grid-template-columns: 22px minmax(0, 1fr) 28px; row-gap: var(--space-2); }
  .sr-blocks { grid-column: 2; grid-row: 2; }
  .sr-ledger { grid-column: 2; grid-row: 3; }
  .sr-focus { grid-column: 3; grid-row: 1; }
}
</style>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add goal roadmap with session blocks"
```

---

### Task 6: Goals view and App wiring

**Files:**
- Create: `src/components/goals/GoalsView.vue`
- Modify: `src/App.vue`, `src/App.test.ts`
- Test: `src/components/goals/GoalsView.test.ts`

**Interfaces:**
- Consumes: `GoalList`, `GoalSummary`, `GoalTasks`, `Roadmap`; store `goals`; `ui.activeGoalId`.
- Produces: `<GoalsView />` (root `<div class="view goals-view">`). App renders it for the Goals tab.

- [ ] **Step 1: Write the failing tests**

`src/components/goals/GoalsView.test.ts`:
```ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Goal } from '../../core/model'
import { dataFixture, goalFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import GoalsView from './GoalsView.vue'

function setup(goals: Goal[], activeGoalId: string | null = null) {
  setActivePinia(createPinia())
  useEmberStore().replaceData(dataFixture({ goals }))
  useUiStore().activeGoalId = activeGoalId
  return mount(GoalsView)
}
const two = () => [goalFixture('D3', [['M', [['A', null]]]]), goalFixture('Spanish', [['M', [['B', null]]]])]

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('GoalsView', () => {
  it('shows the selected goal', () => {
    const w = setup(two(), 'Spanish')
    expect(w.find('.gs-title').text()).toBe('Spanish')
    expect(w.find('.gl-item.is-active').text()).toContain('Spanish')
  })

  it('falls back to the first goal', () => {
    expect(setup(two()).find('.gs-title').text()).toBe('D3')
    expect(setup(two(), 'deleted').find('.gs-title').text()).toBe('D3')
  })

  it('says so when there are no goals', () => {
    const w = setup([])
    expect(w.find('.gv-empty').text()).toBe('No goals yet. Add one on the left.')
    expect(w.find('.gl-input').exists()).toBe(true)
  })
})
```

In `src/App.test.ts`, replace the test `'shows the Today view and a placeholder on other tabs'` with:
```ts
  it('switches between the Today view, the Goals view and the Activity placeholder', async () => {
    const w = mountApp()
    expect(w.find('.today-view').exists()).toBe(true)
    await w.findAll('.tab')[1].trigger('click')
    expect(w.find('.goals-view').exists()).toBe(true)
    await w.findAll('.tab')[2].trigger('click')
    expect(w.find('.view').text()).toContain('This view arrives in a later phase.')
    w.unmount()
  })

  it('opens the goal from a Working-on card', async () => {
    const w = mountApp()
    await w.findAll('.wo-goal')[1].trigger('click')
    expect(w.find('.gs-title').text()).toBe('Speak Spanish at B1')
    w.unmount()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/components/goals/GoalsView.test.ts src/App.test.ts`
Expected: FAIL — cannot resolve `./GoalsView.vue`; App tests find no `.goals-view` / `.gs-title`.

- [ ] **Step 3: Write `src/components/goals/GoalsView.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import GoalList from './GoalList.vue'
import GoalSummary from './GoalSummary.vue'
import GoalTasks from './GoalTasks.vue'
import Roadmap from './Roadmap.vue'

const ember = useEmberStore()
const ui = useUiStore()
const goal = computed(() => ember.goals.find((g) => g.id === ui.activeGoalId) ?? ember.goals[0] ?? null)
</script>

<template>
  <div class="view goals-view">
    <GoalList :active-id="goal?.id ?? null" />
    <main v-if="goal" class="gv-main">
      <GoalSummary :goal="goal" />
      <GoalTasks :goal="goal" />
      <Roadmap :goal="goal" />
    </main>
    <main v-else class="gv-main gv-empty"><p class="muted">No goals yet. Add one on the left.</p></main>
  </div>
</template>

<style scoped>
.goals-view { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 0; padding: 0; }
.gv-main { min-width: 0; display: flex; flex-direction: column; gap: var(--space-6); padding: var(--space-6); }
@media (max-width: 860px) {
  .goals-view { grid-template-columns: minmax(0, 1fr); }
  .gv-main { padding: var(--space-4); }
}
</style>
```

- [ ] **Step 4: Render GoalsView in `src/App.vue`**

Add `import GoalsView from './components/goals/GoalsView.vue'`, and after `<TodayView v-if="ui.view === 'today'" />` add `<GoalsView v-else-if="ui.view === 'goals'" />`. Update the placeholder comment to `<!-- Phase 5 replaces this placeholder with ActivityView. -->`.

- [ ] **Step 5: Run the full check**

Run: `npm test && npm run build`
Expected: all tests pass; vue-tsc clean; build succeeds.

- [ ] **Step 6: Check the running app**

Run `npm run dev` (background). In the Playwright browser at `http://localhost:5173/` (clear localStorage first so the seed loads), open the Goals tab:
1. 1280px: aside lists Learn D3.js / Speak Spanish at B1 / Learn watercolour with bars and "… focused · n/m steps"; D3 is active. Header kicker "GOAL · … FOCUSED · 1 OF 4 MILESTONES", h2, big %. Readme box with the outcome. Four stats. "Tasks for this goal" shows "Read “Visual Display…”" with "Someday". Legend. Roadmap: Foundations ✓ (accent rail), First charts current (ink "02", "You are here", expanded) with blocks — "Reusable chart function" shows two accent blocks (today) — Motion & Capstone collapsed; "+ Add milestone"; finish line with the outcome. Screenshot.
2. Click "Reusable chart function"'s focus button → focus bar shows it. Tick it → selection moves to "Transitions & easing", First charts becomes ✓, Motion becomes current. Add a step "Small multiples" in Motion; add milestone "Extras". Edit the readme → finish-line text updates. Add goal "Learn Three.js" → selected, "Getting started" with the add-step input focused.
3. From Today, click the Spanish Working-on goal name → Goals tab shows Spanish.
4. Resize to 360px: no horizontal scroll (`document.documentElement.scrollWidth <= document.documentElement.clientWidth`); aside stacks on top; stats 2×2; step blocks under titles. Screenshot.
5. Console: no errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add the Goals view"
```
