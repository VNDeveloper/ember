# Ember Phase 2 — Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the app shell that sits above every tab: the nav bar, the focus bar (timer, selected item, today's totals, controls, progress bar, completion toast), the focus picker dialog, and the 250ms ticker that drives the wall-clock timer.

**Architecture:** Display logic that has rules (what the focus bar says about the selection, which items the picker lists and how search filters them) lives in pure `src/core/` modules with unit tests. A new non-persisted Pinia store `useUiStore` holds view, picker and focus-mode state. Components (`NavBar`, `FocusBar`, `FocusPicker`) read both stores and are tested with `@vue/test-utils`. `App.vue` composes the shell and shows a placeholder for the three tab views, which arrive in Phases 3–5.

**Tech Stack:** Vue 3.5 `<script setup>`, Pinia 4, lucide-vue-next, Vitest 5 + jsdom + @vue/test-utils.

**Spec:** `docs/design/handoff.md` §Global layout, §Nav bar, §Focus bar, §Focus picker, §Interactions → Selection/Timer/Animations (float toast); prototype `docs/design/reference/Ember.dc.html` lines 26–54 (nav + focus bar markup), 287–313 (picker markup), 504–523 and 588–609 (focus bar + picker logic).

## Global Constraints

- Zero border radius; 2px rules between major sections, 1px between list rows; button labels flush left; red accent sparingly; no gradients, no emoji, no shadows except the picker dialog (`--shadow-lg`).
- Use tokens and the shared classes from `src/styles/` (`.btn*`, `.seg`, `.tag*`, `.nav*`, `.dialog*`, `.swatch`, `.section-label`, `.tabular`, `.kicker`, `.muted`).
- Copy is exact (from the README / prototype): "Next focus session" / "Focusing on" / "Session done — take 5" / "Break"; "Pick a task or step to focus on"; "Press the timer icon on any row"; "{n} session(s) · {m} today"; "Start focus" / "Pause" / "Resume" / "Start break"; "Reset"; "Skip break"; "Demo speed"; "Search tasks" / "Search goal steps"; "Current"; "Nothing matches “{q}”."; toast "+25m · {title}".
- Everything reflows down to ~360px wide with no horizontal page scroll.
- `src/core/` must not import `vue` or `pinia`.
- UI state (view, picker open/query/tab, focus mode open) is not persisted.

## Decisions taken in this plan (tell the user)

1. **Focus-mode button is wired but inert until Phase 6.** It sets `ui.focusModeOpen`; the overlay itself is Phase 6. Esc already handles "picker first, then Focus mode".
2. **Toast retriggers by remounting** with `:key="completions"` (README allows "remount with a key").
3. **Narrow screens (≤760px):** the focus bar wraps to two rows — time + selection on the first, totals and buttons spanning the second; the nav wraps the date under the tabs. The prototype has no narrow layout; the README requires reflow to ~360px.
4. **Tab views are placeholders** ("This view arrives in a later phase.") until Phases 3–5.
5. **Favicon:** a 16px accent square, inline SVG, to stop the 404.

## Review Focus

1. **Tab left in the background, timer finishes meanwhile:** returning to the tab completes the session immediately, not up to 250ms (or a throttled interval) later. Pinned in Task 3 (`ticks when the tab becomes visible`) — also fixes the Phase 1 deferred minor.
2. **Selection points at a missing item:** the focus bar shows the empty state instead of crashing. Pinned in Task 1 (`falls back to the empty state for a missing item`).
3. **Search with only whitespace, or no match, then Enter:** whitespace is ignored; no match shows "Nothing matches" and Enter does nothing. Pinned in Task 1 (`ignores surrounding whitespace…`) and Task 5 (`does nothing on Enter when nothing matches`).
4. **Esc with both the picker and Focus mode open:** closes only the picker. Pinned in Task 2 (`Esc closes the picker before Focus mode`).
5. **Very long titles at 360px:** focus-bar title and context ellipsise; nothing scrolls horizontally. Checked in Task 6 browser step at 360px.

---

## File structure

```
src/
  core/
    selection.ts        describeSelection, targetTitle, EMPTY_SELECTION
    selection.test.ts
    picker.ts           pickerSections, PickerTab, PickerItem, PickerSection
    picker.test.ts
  stores/
    ui.ts               useUiStore (view, activeGoalId, picker, focus mode, escape)
    ui.test.ts
  composables/
    useTicker.ts        interval + mount + visibilitychange ticking
    useTicker.test.ts
  components/
    NavBar.vue / NavBar.test.ts
    FocusBar.vue / FocusBar.test.ts
    FocusPicker.vue / FocusPicker.test.ts
  App.vue               shell: nav, focus bar, view placeholder, picker, Esc, ticker
  App.test.ts
  dev/StyleSample.vue   DELETED
index.html              favicon
```

---

### Task 1: Selection description and picker sections (core)

**Files:**
- Create: `src/core/selection.ts`, `src/core/picker.ts`
- Test: `src/core/selection.test.ts`, `src/core/picker.test.ts`

**Interfaces:**
- Consumes: `findStep`, `nextOpenStep`, `stepTarget`, `goalColor` (goals.ts); `fmtM`, `pad2` (format.ts); `addDays`, `dayLabel`, `ISODate` (dates.ts); `targetKey`, `sameTarget`, model types.
- Produces:
  - `selection.ts`: `interface SelectionInfo { title: string; sub: string; empty: boolean }`, `EMPTY_SELECTION`, `describeSelection(goals, tasks, selection, spent: Map<string, number>): SelectionInfo`, `targetTitle(goals, tasks, target: Target | null): string` ("Unassigned" for null/missing).
  - `picker.ts`: `type PickerTab = 'tasks' | 'goals'`, `interface PickerItem { key: string; title: string; meta: string; swatch: string; outlined: boolean; current: boolean; target: Target }`, `interface PickerSection { label: string; items: PickerItem[] }`, `pickerSections(goals, tasks, selection, tab, query, today): PickerSection[]` (empty sections removed).

- [ ] **Step 1: Write the failing tests**

`src/core/selection.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { StepTarget } from './model'
import { EMPTY_SELECTION, describeSelection, targetTitle } from './selection'
import { goalFixture, taskFixture } from './test-fixtures'

const goals = [
  goalFixture('D3', [['First charts', [['Bar', '2026-09-01'], ['Line', null]]]]),
  goalFixture('Spanish', [['Talk', [['Tutor', null]]]]),
]
const tasks = [taskFixture('Review PR'), taskFixture('Paper', { goalId: 'Spanish', tag: '' })]
const LINE: StepTarget = { kind: 'step', goalId: 'D3', msId: 'D3/First charts', stepId: 'D3/First charts/Line' }

describe('describeSelection', () => {
  it('shows the empty state with nothing selected', () => {
    expect(describeSelection(goals, tasks, null, new Map())).toEqual({
      title: 'Pick a task or step to focus on', sub: 'Press the timer icon on any row', empty: true,
    })
  })

  it('describes a step with its goal, milestone and time against estimate', () => {
    const spent = new Map([['step:D3/First charts/Line', 50]])
    expect(describeSelection(goals, tasks, LINE, spent)).toEqual({
      title: 'Line', sub: 'D3 · 01 First charts · 50m of est. 50m', empty: false,
    })
  })

  it('describes a goal task and a plain task, adding focused time when there is some', () => {
    const paper = { kind: 'task', taskId: 'Paper' } as const
    expect(describeSelection(goals, tasks, paper, new Map()).sub).toBe('Spanish · task')
    expect(describeSelection(goals, tasks, paper, new Map([['task:Paper', 25]])).sub).toBe('Spanish · task · 25m focused')
    expect(describeSelection(goals, tasks, { kind: 'task', taskId: 'Review PR' }, new Map()).sub).toBe('Task · Work')
  })

  it('falls back to the empty state for a missing item', () => {
    expect(describeSelection(goals, tasks, { kind: 'task', taskId: 'gone' }, new Map())).toBe(EMPTY_SELECTION)
    expect(describeSelection(goals, tasks, { ...LINE, stepId: 'gone' }, new Map())).toBe(EMPTY_SELECTION)
  })
})

describe('targetTitle', () => {
  it('names a log target, or Unassigned', () => {
    expect(targetTitle(goals, tasks, LINE)).toBe('Line')
    expect(targetTitle(goals, tasks, { kind: 'task', taskId: 'Paper' })).toBe('Paper')
    expect(targetTitle(goals, tasks, null)).toBe('Unassigned')
    expect(targetTitle(goals, tasks, { kind: 'task', taskId: 'gone' })).toBe('Unassigned')
  })
})
```

`src/core/picker.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { StepTarget } from './model'
import { pickerSections } from './picker'
import { goalFixture, taskFixture } from './test-fixtures'

const TODAY = '2026-09-23'
const goals = [
  goalFixture('D3', [
    ['First charts', [['Bar', '2026-09-01'], ['Line', null], ['Scatter', null]]],
    ['Motion', [['Easing', null]]],
  ]),
  goalFixture('Finished', [['Only', [['A', '2026-09-01']]]]),
  goalFixture('Spanish', [['Talk', [['Tutor', null]]]]),
]
const tasks = [
  taskFixture('Review PR'),
  taskFixture('Dentist', { date: '2026-09-21', tag: 'Health' }),
  taskFixture('Council tax', { date: '2026-09-29', tag: 'Personal' }),
  taskFixture('Landlord', { date: '2026-09-24', tag: 'Home' }),
  taskFixture('Paper', { date: '2026-09-26', goalId: 'Spanish', tag: '' }),
  taskFixture('Sourdough', { date: null, tag: 'Home' }),
  taskFixture('Invoice', { doneOn: TODAY }),
  taskFixture('Read Tufte', { date: null, goalId: 'D3', tag: '' }),
]
const LINE: StepTarget = { kind: 'step', goalId: 'D3', msId: 'D3/First charts', stepId: 'D3/First charts/Line' }
const view = (s: ReturnType<typeof pickerSections>) => s.map((x) => [x.label, x.items.map((i) => `${i.title} | ${i.meta}`)])

describe('pickerSections — tasks', () => {
  const sections = pickerSections(goals, tasks, { kind: 'task', taskId: 'Review PR' }, 'tasks', '', TODAY)

  it('groups open tasks into Today, Upcoming (by date) and Someday', () => {
    expect(view(sections)).toEqual([
      ['Today', ['Review PR | Work', 'Dentist | Health']],
      ['Upcoming', ['Landlord | Tomorrow · Home', 'Paper | Sep 26 · Spanish', 'Council tax | Sep 29 · Personal']],
      ['Someday', ['Sourdough | Home', 'Read Tufte | D3']],
    ])
  })

  it('marks the current item and styles swatches by goal', () => {
    const [today, upcoming, someday] = sections
    expect(today.items[0]).toMatchObject({ current: true, outlined: true, swatch: 'transparent', target: { kind: 'task', taskId: 'Review PR' } })
    expect(today.items[1].current).toBe(false)
    expect(upcoming.items[1]).toMatchObject({ outlined: false, swatch: 'var(--color-accent-300)' })
    expect(someday.items[1].swatch).toBe('var(--color-accent)')
  })

  it('searches title and meta, case-insensitively', () => {
    expect(view(pickerSections(goals, tasks, null, 'tasks', 'TOMORROW', TODAY))).toEqual([['Upcoming', ['Landlord | Tomorrow · Home']]])
  })
})

describe('pickerSections — goals', () => {
  it("lists each goal's open steps in its current milestone, marking the next step", () => {
    const sections = pickerSections(goals, tasks, LINE, 'goals', '', TODAY)
    expect(view(sections)).toEqual([
      ['D3', ['Line | 01 First charts · next step', 'Scatter | 01 First charts']],
      ['Spanish', ['Tutor | 01 Talk · next step']],
    ])
    expect(sections[0].items[0]).toMatchObject({ current: true, swatch: 'var(--color-accent)', outlined: false, target: LINE })
    expect(sections[1].items[0].swatch).toBe('var(--color-accent-300)')
  })

  it('ignores surrounding whitespace and returns nothing when nothing matches', () => {
    expect(view(pickerSections(goals, tasks, null, 'goals', '  line ', TODAY))).toEqual([['D3', ['Line | 01 First charts · next step']]])
    expect(pickerSections(goals, tasks, null, 'goals', 'zzz', TODAY)).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/core/selection.test.ts src/core/picker.test.ts`
Expected: FAIL — cannot resolve `./selection`, `./picker`.

- [ ] **Step 3: Write `src/core/selection.ts`**

```ts
import { fmtM, pad2 } from './format'
import { findStep } from './goals'
import type { Goal, Selection, Target, Task } from './model'
import { targetKey } from './model'

export interface SelectionInfo { title: string; sub: string; empty: boolean }

export const EMPTY_SELECTION: SelectionInfo = {
  title: 'Pick a task or step to focus on',
  sub: 'Press the timer icon on any row',
  empty: true,
}

/** Focus-bar title and context line for the selected task or step. */
export function describeSelection(goals: Goal[], tasks: Task[], sel: Selection, spent: Map<string, number>): SelectionInfo {
  if (!sel) return EMPTY_SELECTION
  const min = spent.get(targetKey(sel)) ?? 0
  if (sel.kind === 'step') {
    const loc = findStep(goals, sel)
    if (!loc) return EMPTY_SELECTION
    return {
      title: loc.step.title,
      sub: `${loc.goal.title} · ${pad2(loc.mi + 1)} ${loc.milestone.title} · ${fmtM(min)} of est. ${fmtM(loc.step.estMin)}`,
      empty: false,
    }
  }
  const task = tasks.find((t) => t.id === sel.taskId)
  if (!task) return EMPTY_SELECTION
  const goal = task.goalId ? goals.find((g) => g.id === task.goalId) : undefined
  const head = goal ? `${goal.title} · task` : `Task · ${task.tag}`
  return { title: task.title, sub: `${head}${min ? ` · ${fmtM(min)} focused` : ''}`, empty: false }
}

/** Title of a focus log's target, for the toast and activity log. */
export function targetTitle(goals: Goal[], tasks: Task[], t: Target | null): string {
  if (!t) return 'Unassigned'
  if (t.kind === 'step') return findStep(goals, t)?.step.title ?? 'Unassigned'
  return tasks.find((x) => x.id === t.taskId)?.title ?? 'Unassigned'
}
```

- [ ] **Step 4: Write `src/core/picker.ts`**

```ts
import { addDays, dayLabel, type ISODate } from './dates'
import { pad2 } from './format'
import { goalColor, nextOpenStep, stepTarget } from './goals'
import type { Goal, Selection, Target, Task } from './model'
import { sameTarget, targetKey } from './model'

export type PickerTab = 'tasks' | 'goals'

export interface PickerItem {
  key: string
  title: string
  meta: string
  swatch: string
  /** Tasks without a goal get an ink-outlined square instead of a colour. */
  outlined: boolean
  current: boolean
  target: Target
}

export interface PickerSection { label: string; items: PickerItem[] }

export function pickerSections(
  goals: Goal[], tasks: Task[], selection: Selection, tab: PickerTab, query: string, today: ISODate,
): PickerSection[] {
  const item = (title: string, meta: string, swatch: string, outlined: boolean, target: Target): PickerItem =>
    ({ key: targetKey(target), title, meta, swatch, outlined, current: sameTarget(selection, target), target })

  const taskItem = (t: Task, prefix = ''): PickerItem => {
    const gi = t.goalId ? goals.findIndex((g) => g.id === t.goalId) : -1
    const base = gi >= 0 ? goals[gi].title : t.tag || 'Task'
    return item(t.title, prefix + base, gi >= 0 ? goalColor(gi) : 'transparent', gi < 0, { kind: 'task', taskId: t.id })
  }
  const tomorrow = addDays(today, 1)
  const rel = (d: ISODate) => (d === today ? 'Today' : d === tomorrow ? 'Tomorrow' : dayLabel(d))

  let sections: PickerSection[]
  if (tab === 'goals') {
    sections = goals.map((g, gi) => {
      const next = nextOpenStep(g)
      if (!next) return { label: g.title, items: [] }
      const m = next.milestone
      const items = m.steps
        .map((s, si) => ({ s, si }))
        .filter(({ s }) => s.doneOn == null)
        .map(({ s, si }) => item(
          s.title,
          `${pad2(next.mi + 1)} ${m.title}${si === next.si ? ' · next step' : ''}`,
          goalColor(gi), false, stepTarget(g, m, s),
        ))
      return { label: g.title, items }
    })
  } else {
    const open = tasks.filter((t) => t.doneOn == null)
    sections = [
      { label: 'Today', items: open.filter((t) => t.date != null && t.date <= today).map((t) => taskItem(t)) },
      {
        label: 'Upcoming',
        items: open
          .filter((t) => t.date != null && t.date > today)
          .sort((a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : 0))
          .map((t) => taskItem(t, `${rel(t.date!)} · `)),
      },
      { label: 'Someday', items: open.filter((t) => t.date == null).map((t) => taskItem(t)) },
    ]
  }

  const q = query.trim().toLowerCase()
  return sections
    .map((s) => ({ ...s, items: q ? s.items.filter((i) => `${i.title} ${i.meta}`.toLowerCase().includes(q)) : s.items }))
    .filter((s) => s.items.length > 0)
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS; no type errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(core): describe the selection and build focus-picker sections"
```

---

### Task 2: UI store

**Files:**
- Create: `src/stores/ui.ts`
- Test: `src/stores/ui.test.ts`

**Interfaces:**
- Consumes: `PickerTab` (picker.ts), `Selection` (model.ts).
- Produces: `type View = 'today' | 'goals' | 'activity'`; `useUiStore()` with refs `view`, `activeGoalId: string | null`, `pickerOpen`, `pickerTab: PickerTab`, `pickerQuery`, `focusModeOpen`; actions `openPicker(selection: Selection)`, `closePicker()`, `openFocusMode()`, `closeFocusMode()`, `openGoal(id: string)`, `escape(): boolean` (true when it closed something).

- [ ] **Step 1: Write the failing test**

`src/stores/ui.test.ts`:
```ts
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useUiStore } from './ui'

beforeEach(() => setActivePinia(createPinia()))

describe('ui store', () => {
  it('starts on Today with nothing open', () => {
    const ui = useUiStore()
    expect(ui.view).toBe('today')
    expect(ui.pickerOpen).toBe(false)
    expect(ui.focusModeOpen).toBe(false)
  })

  it('opens the picker on Goals for a step selection, otherwise on Tasks, with an empty query', () => {
    const ui = useUiStore()
    ui.pickerQuery = 'old'
    ui.openPicker({ kind: 'step', goalId: 'g', msId: 'm', stepId: 's' })
    expect(ui).toMatchObject({ pickerOpen: true, pickerTab: 'goals', pickerQuery: '' })
    ui.closePicker()
    ui.openPicker({ kind: 'task', taskId: 't' })
    expect(ui.pickerTab).toBe('tasks')
    ui.closePicker()
    ui.openPicker(null)
    expect(ui.pickerTab).toBe('tasks')
  })

  it('Esc closes the picker before Focus mode', () => {
    const ui = useUiStore()
    ui.openFocusMode()
    ui.openPicker(null)
    expect(ui.escape()).toBe(true)
    expect(ui.pickerOpen).toBe(false)
    expect(ui.focusModeOpen).toBe(true)
    expect(ui.escape()).toBe(true)
    expect(ui.focusModeOpen).toBe(false)
    expect(ui.escape()).toBe(false)
  })

  it('opens a goal on the Goals tab', () => {
    const ui = useUiStore()
    ui.openGoal('D3')
    expect(ui.view).toBe('goals')
    expect(ui.activeGoalId).toBe('D3')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/stores/ui.test.ts`
Expected: FAIL — cannot resolve `./ui`.

- [ ] **Step 3: Write `src/stores/ui.ts`**

```ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Selection } from '../core/model'
import type { PickerTab } from '../core/picker'

export type View = 'today' | 'goals' | 'activity'

/** View state that is not persisted. */
export const useUiStore = defineStore('ui', () => {
  const view = ref<View>('today')
  const activeGoalId = ref<string | null>(null)
  const pickerOpen = ref(false)
  const pickerTab = ref<PickerTab>('tasks')
  const pickerQuery = ref('')
  const focusModeOpen = ref(false)

  function openPicker(selection: Selection) {
    pickerTab.value = selection?.kind === 'step' ? 'goals' : 'tasks'
    pickerQuery.value = ''
    pickerOpen.value = true
  }

  function closePicker() {
    pickerOpen.value = false
    pickerQuery.value = ''
  }

  const openFocusMode = () => { focusModeOpen.value = true }
  const closeFocusMode = () => { focusModeOpen.value = false }

  function openGoal(id: string) {
    activeGoalId.value = id
    view.value = 'goals'
  }

  /** Esc closes the picker first, then Focus mode. Returns whether it closed anything. */
  function escape(): boolean {
    if (pickerOpen.value) {
      closePicker()
      return true
    }
    if (focusModeOpen.value) {
      closeFocusMode()
      return true
    }
    return false
  }

  return {
    view, activeGoalId, pickerOpen, pickerTab, pickerQuery, focusModeOpen,
    openPicker, closePicker, openFocusMode, closeFocusMode, openGoal, escape,
  }
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(store): add UI store for view, picker and focus mode"
```

---

### Task 3: Ticker composable

**Files:**
- Create: `src/composables/useTicker.ts`
- Test: `src/composables/useTicker.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `useTicker(tick: () => void, intervalMs = 250): void` — calls `tick` on mount, every `intervalMs`, and when the document becomes visible; cleans up on unmount.

- [ ] **Step 1: Write the failing test**

`src/composables/useTicker.test.ts`:
```ts
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { useTicker } from './useTicker'

const host = (tick: () => void) => defineComponent({ setup() { useTicker(tick); return () => h('div') } })

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useTicker', () => {
  it('ticks on mount and every 250ms', () => {
    const tick = vi.fn()
    mount(host(tick))
    expect(tick).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(tick).toHaveBeenCalledTimes(5)
  })

  it('ticks when the tab becomes visible', () => {
    const tick = vi.fn()
    mount(host(tick))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(tick).toHaveBeenCalledTimes(2)
  })

  it('stops after unmount', () => {
    const tick = vi.fn()
    const w = mount(host(tick))
    w.unmount()
    vi.advanceTimersByTime(1000)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(tick).toHaveBeenCalledTimes(1)
  })
})
```

(jsdom reports `document.visibilityState === 'visible'`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/composables`
Expected: FAIL — cannot resolve `./useTicker`.

- [ ] **Step 3: Write `src/composables/useTicker.ts`**

```ts
import { onBeforeUnmount, onMounted } from 'vue'

/**
 * Drives the wall clock: ticks on mount, every intervalMs, and as soon as the tab is visible
 * again (background tabs throttle intervals, so a finished session would otherwise show late).
 */
export function useTicker(tick: () => void, intervalMs = 250): void {
  let id: ReturnType<typeof setInterval> | undefined
  const onVisible = () => {
    if (document.visibilityState === 'visible') tick()
  }
  onMounted(() => {
    tick()
    id = setInterval(tick, intervalMs)
    document.addEventListener('visibilitychange', onVisible)
  })
  onBeforeUnmount(() => {
    clearInterval(id)
    document.removeEventListener('visibilitychange', onVisible)
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add ticker that also ticks on mount and on tab visibility"
```

---

### Task 4: Nav bar and focus bar

**Files:**
- Create: `src/components/NavBar.vue`, `src/components/FocusBar.vue`
- Test: `src/components/NavBar.test.ts`, `src/components/FocusBar.test.ts`

**Interfaces:**
- Consumes: `useEmberStore` (goals, tasks, selection, timer, settings, now, remaining, tally, demo, completions, lastLog, today, startPause, resetTimer, skipBreak, tick, replaceData), `useUiStore` (view, openPicker, openFocusMode), `describeSelection`, `targetTitle`, timer labels, `clock`, `fmtM`, `plural`, `navDate`.
- Produces: `<NavBar />`, `<FocusBar />` (no props). CSS hooks used in tests: `.tab`, `.is-active`, `.nav-date`, `.focus-bar.is-idle|is-focusing|is-break`, `.fb-time`, `.fb-phase`, `.fb-title`, `.fb-sub`, `.fb-today`, `.fb-start`, `.fb-reset`, `.fb-skip`, `.fb-toast`, `.fb-demo`, `.fb-progress-fill`.

- [ ] **Step 1: Write the failing tests**

`src/components/NavBar.test.ts`:
```ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUiStore } from '../stores/ui'
import NavBar from './NavBar.vue'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
  setActivePinia(createPinia())
})
afterEach(() => vi.useRealTimers())

describe('NavBar', () => {
  it("shows the brand, three tabs and today's date", () => {
    const w = mount(NavBar)
    expect(w.text()).toContain('Ember')
    expect(w.findAll('.tab').map((t) => t.text())).toEqual(['Today', 'Goals', 'Activity'])
    expect(w.find('.nav-date').text()).toBe('Wed 23 Sep 2026')
  })

  it('switches views and marks the active tab', async () => {
    const w = mount(NavBar)
    const ui = useUiStore()
    await w.findAll('.tab')[1].trigger('click')
    expect(ui.view).toBe('goals')
    expect(w.findAll('.tab')[1].classes()).toContain('is-active')
    expect(w.findAll('.tab')[1].attributes('aria-current')).toBe('page')
    expect(w.findAll('.tab')[0].attributes('aria-current')).toBeUndefined()
  })
})
```

`src/components/FocusBar.test.ts`:
```ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { StepTarget } from '../core/model'
import { dataFixture, goalFixture, taskFixture } from '../core/test-fixtures'
import { useEmberStore } from '../stores/ember'
import { useUiStore } from '../stores/ui'
import FocusBar from './FocusBar.vue'

const NOW = new Date(2026, 8, 23, 10, 0).getTime()
const LINE: StepTarget = { kind: 'step', goalId: 'D3', msId: 'D3/First charts', stepId: 'D3/First charts/Line' }

function setup(selection: StepTarget | null = LINE) {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  ember.replaceData(dataFixture({
    goals: [goalFixture('D3', [['First charts', [['Bar', '2026-09-01'], ['Line', null]]]])],
    tasks: [taskFixture('Review PR')],
    selection,
  }))
  return { w: mount(FocusBar), ember, ui: useUiStore() }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  localStorage.clear()
  window.history.replaceState({}, '', '/')
})
afterEach(() => vi.useRealTimers())

describe('FocusBar', () => {
  it('shows an idle session for the selected step', () => {
    const { w } = setup()
    expect(w.find('.focus-bar').classes()).toContain('is-idle')
    expect(w.find('.fb-time').text()).toBe('25:00')
    expect(w.find('.fb-phase').text()).toBe('Next focus session')
    expect(w.find('.fb-title').text()).toBe('Line')
    expect(w.find('.fb-sub').text()).toBe('D3 · 01 First charts · 0m of est. 50m')
    expect(w.find('.fb-today').text()).toBe('0 sessions · 0m today')
    expect(w.find('.fb-start').text()).toBe('Start focus')
    expect(w.find('.fb-reset').exists()).toBe(false)
    expect(w.find('.fb-skip').exists()).toBe(false)
    expect(w.find('.fb-demo').exists()).toBe(false)
  })

  it('shows the empty state with nothing selected', () => {
    const { w } = setup(null)
    expect(w.find('.fb-title').text()).toBe('Pick a task or step to focus on')
    expect(w.find('.fb-sub').text()).toBe('Press the timer icon on any row')
  })

  it('runs: ink background, Pause, Reset, progress', async () => {
    const { w, ember } = setup()
    await w.find('.fb-start').trigger('click')
    expect(ember.timer.running).toBe(true)
    expect(w.find('.focus-bar').classes()).toContain('is-focusing')
    expect(w.find('.fb-start').text()).toBe('Pause')
    expect(w.find('.fb-phase').text()).toBe('Focusing on')
    expect(w.find('.fb-reset').exists()).toBe(true)
    ember.tick(NOW + 5 * 60_000)
    await nextTick()
    expect(w.find('.fb-time').text()).toBe('20:00')
    expect(w.find('.fb-progress-fill').attributes('style')).toContain('width: 20%')
  })

  it('finishes a session: break colours, toast, Start break and Skip break', async () => {
    const { w, ember } = setup()
    await w.find('.fb-start').trigger('click')
    ember.tick(NOW + 25 * 60_000)
    await nextTick()
    expect(w.find('.focus-bar').classes()).toContain('is-break')
    expect(w.find('.fb-phase').text()).toBe('Session done — take 5')
    expect(w.find('.fb-start').text()).toBe('Start break')
    expect(w.find('.fb-toast').text()).toBe('+25m · Line')
    expect(w.find('.fb-today').text()).toBe('1 session · 25m today')
    await w.find('.fb-skip').trigger('click')
    expect(ember.timer).toMatchObject({ phase: 'focus', running: false })
  })

  it('resets a running focus session', async () => {
    const { w, ember } = setup()
    await w.find('.fb-start').trigger('click')
    await w.find('.fb-reset').trigger('click')
    expect(ember.timer).toMatchObject({ phase: 'focus', running: false, leftSec: 1500 })
  })

  it('opens the picker from the title and Focus mode from the icon button', async () => {
    const { w, ui } = setup()
    await w.find('.fb-title').trigger('click')
    expect(ui.pickerOpen).toBe(true)
    expect(ui.pickerTab).toBe('goals')
    await w.find('[aria-label="Focus mode"]').trigger('click')
    expect(ui.focusModeOpen).toBe(true)
  })

  it('shows the Demo speed tag with ?demo=1', () => {
    window.history.replaceState({}, '', '/?demo=1')
    const { w } = setup()
    expect(w.find('.fb-demo').text()).toBe('Demo speed')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/components`
Expected: FAIL — cannot resolve `./NavBar.vue`, `./FocusBar.vue`.

- [ ] **Step 3: Write `src/components/NavBar.vue`**

```vue
<script setup lang="ts">
import { navDate } from '../core/dates'
import { useEmberStore } from '../stores/ember'
import { useUiStore, type View } from '../stores/ui'

const ember = useEmberStore()
const ui = useUiStore()
const TABS: [View, string][] = [['today', 'Today'], ['goals', 'Goals'], ['activity', 'Activity']]
</script>

<template>
  <nav class="nav">
    <span class="nav-brand">Ember</span>
    <div class="tabs">
      <button
        v-for="[v, label] in TABS"
        :key="v"
        class="tab"
        :class="{ 'is-active': ui.view === v }"
        :aria-current="ui.view === v ? 'page' : undefined"
        @click="ui.view = v"
      >
        {{ label }}
      </button>
    </div>
    <span class="nav-date">{{ navDate(ember.today) }}</span>
  </nav>
</template>

<style scoped>
.nav { flex-wrap: wrap; row-gap: var(--space-2); }
.nav-brand { margin-right: var(--space-2); }
.tabs { display: flex; gap: var(--space-6); margin-right: auto; }
.tab {
  padding: 4px 0; border: 0; border-bottom: 2px solid transparent; background: none;
  font-size: 14px; font-weight: 700; color: var(--color-text);
}
.tab:hover, .tab.is-active { color: var(--color-accent); }
.tab.is-active { border-bottom-color: var(--color-accent); }
.nav-date { font-size: 13px; }
@media (max-width: 520px) {
  .nav { padding: var(--space-3) var(--space-4); column-gap: var(--space-4); }
  .tabs { gap: var(--space-4); }
}
</style>
```

- [ ] **Step 4: Write `src/components/FocusBar.vue`**

```vue
<script setup lang="ts">
import { ChevronDown, Pause, Play, Scan } from 'lucide-vue-next'
import { computed } from 'vue'
import { clock, fmtM, plural } from '../core/format'
import { describeSelection, targetTitle } from '../core/selection'
import { canReset, phaseLabel, progress, startLabel } from '../core/timer'
import { useEmberStore } from '../stores/ember'
import { useUiStore } from '../stores/ui'

const ember = useEmberStore()
const ui = useUiStore()

const session = computed(() => ember.settings.session)
const info = computed(() => describeSelection(ember.goals, ember.tasks, ember.selection, ember.tally.spent))
const state = computed(() => {
  if (ember.timer.phase === 'break') return 'break'
  return ember.timer.running ? 'focusing' : 'idle'
})
const todayText = computed(() => `${plural(ember.tally.sessionsToday, 'session')} · ${fmtM(ember.tally.minutesToday)} today`)
const pct = computed(() => `${Math.min(100, Math.max(0, progress(ember.timer, ember.now) * 100))}%`)
const showToast = computed(() => ember.completions > 0 && ember.timer.phase === 'break')
const toastText = computed(() => {
  const l = ember.lastLog
  return l ? `+${fmtM(l.min)} · ${targetTitle(ember.goals, ember.tasks, l.target)}` : ''
})
</script>

<template>
  <div class="focus-bar" :class="`is-${state}`">
    <div class="fb-row">
      <span class="fb-time tabular">{{ clock(ember.remaining) }}</span>
      <div class="fb-stack">
        <span class="fb-phase">{{ phaseLabel(ember.timer, session) }}</span>
        <button class="fb-title" title="Change what you're focusing on" @click="ui.openPicker(ember.selection)">
          <span>{{ info.title }}</span>
          <ChevronDown :size="16" :stroke-width="2.5" />
        </button>
        <span class="fb-sub">{{ info.sub }}</span>
      </div>
      <div class="fb-meta">
        <span v-if="ember.demo" class="tag tag-accent fb-demo" title="25 minutes run in about 25 seconds.">Demo speed</span>
        <span class="fb-today tabular">{{ todayText }}</span>
      </div>
      <div class="fb-actions">
        <button class="btn btn-primary fb-start" @click="ember.startPause()">
          <Pause v-if="ember.timer.running" :size="16" fill="currentColor" :stroke-width="0" />
          <Play v-else :size="16" fill="currentColor" :stroke-width="0" />
          {{ startLabel(ember.timer, session) }}
        </button>
        <button
          class="btn btn-secondary btn-icon btn-outline-current"
          aria-label="Focus mode"
          title="Focus mode — full screen"
          @click="ui.openFocusMode()"
        >
          <Scan :size="16" :stroke-width="2.25" />
        </button>
        <button v-if="canReset(ember.timer, session)" class="btn btn-ghost fb-ghost fb-reset" @click="ember.resetTimer()">Reset</button>
        <button v-if="ember.timer.phase === 'break'" class="btn btn-ghost fb-ghost fb-skip" @click="ember.skipBreak()">Skip break</button>
      </div>
    </div>
    <div class="fb-progress"><div class="fb-progress-fill" :style="{ width: pct }"></div></div>
    <div v-if="showToast" :key="ember.completions" class="fb-toast">{{ toastText }}</div>
  </div>
</template>

<style scoped>
.focus-bar {
  --fb-sub: var(--color-neutral-700);
  position: relative; display: flex; flex-direction: column;
  background: var(--color-neutral-200); color: var(--color-text); transition: background .3s;
}
.focus-bar.is-focusing { --fb-sub: var(--color-neutral-400); background: var(--color-text); color: var(--color-bg); }
.focus-bar.is-break { background: var(--color-accent-100); }

.fb-row {
  display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; gap: var(--space-6);
  align-items: center; padding: var(--space-3) var(--space-6);
}
.fb-time { font: 800 40px/1 var(--font-heading); letter-spacing: -.02em; }
.fb-stack { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.fb-phase { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--fb-sub); }
.fb-title {
  display: flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; align-self: flex-start;
  padding: 0; border: 0; border-bottom: 2px solid transparent; background: none;
  font-size: 16px; font-weight: 700; color: inherit; text-align: left;
}
.fb-title:hover { border-bottom-color: var(--color-accent); }
.fb-title span { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fb-title svg { flex: none; }
.fb-sub { font-size: 12px; color: var(--fb-sub); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fb-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.fb-today { font-size: 13px; color: var(--fb-sub); white-space: nowrap; }
.fb-actions { display: flex; gap: var(--space-2); }
.fb-ghost { color: inherit; }

.fb-progress { height: 4px; background: var(--color-neutral-300); }
.fb-progress-fill { height: 100%; background: var(--color-accent); transition: width .25s linear; }

.fb-toast {
  position: absolute; left: var(--space-6); bottom: -30px; z-index: 2;
  font: 800 16px/1 var(--font-heading); color: var(--color-accent-700);
  white-space: nowrap; pointer-events: none;
  animation: float0 1.6s ease-out forwards;
}

@media (max-width: 760px) {
  .fb-row { grid-template-columns: auto minmax(0, 1fr); gap: var(--space-3) var(--space-4); padding: var(--space-3) var(--space-4); }
  .fb-time { font-size: 32px; }
  .fb-meta { grid-column: 1 / -1; flex-direction: row; align-items: center; gap: var(--space-2); }
  .fb-actions { grid-column: 1 / -1; flex-wrap: wrap; }
  .fb-toast { left: var(--space-4); }
}
</style>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add nav bar and focus bar"
```

---

### Task 5: Focus picker

**Files:**
- Create: `src/components/FocusPicker.vue`
- Test: `src/components/FocusPicker.test.ts`

**Interfaces:**
- Consumes: `pickerSections`, `PickerItem` (picker.ts); `useEmberStore` (goals, tasks, selection, today, select); `useUiStore` (pickerTab, pickerQuery, closePicker).
- Produces: `<FocusPicker />` (no props; render it with `v-if="ui.pickerOpen"`). Teleports to `body`. CSS hooks: `.picker-backdrop`, `.picker-input`, `.picker-section`, `.picker-row`, `.picker-title`, `.picker-meta`, `.picker-empty`.

- [ ] **Step 1: Write the failing test**

`src/components/FocusPicker.test.ts`:
```ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dataFixture, goalFixture, taskFixture } from '../core/test-fixtures'
import { useEmberStore } from '../stores/ember'
import { useUiStore } from '../stores/ui'
import FocusPicker from './FocusPicker.vue'

function setup() {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  ember.replaceData(dataFixture({
    goals: [goalFixture('D3', [['First charts', [['Line', null], ['Scatter', null]]]])],
    tasks: [taskFixture('Review PR'), taskFixture('Landlord', { date: '2026-09-24', tag: 'Home' }), taskFixture('Sourdough', { date: null })],
    selection: { kind: 'task', taskId: 'Review PR' },
  }))
  const ui = useUiStore()
  ui.openPicker(ember.selection)
  const w = mount(FocusPicker, { global: { stubs: { teleport: true } } })
  return { w, ember, ui }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('FocusPicker', () => {
  it('lists task sections with counts and marks the current item', () => {
    const { w } = setup()
    expect(w.findAll('.picker-section').map((s) => s.text())).toEqual(['Today1', 'Upcoming1', 'Someday1'])
    const first = w.findAll('.picker-row')[0]
    expect(first.text()).toContain('Review PR')
    expect(first.text()).toContain('Current')
    expect(w.find('.picker-input').attributes('placeholder')).toBe('Search tasks')
  })

  it('switches to goal steps', async () => {
    const { w, ui } = setup()
    ui.pickerTab = 'goals'
    await w.vm.$nextTick()
    expect(w.find('.picker-input').attributes('placeholder')).toBe('Search goal steps')
    expect(w.findAll('.picker-title').map((t) => t.text())).toEqual(['Line', 'Scatter'])
    expect(w.findAll('.picker-meta')[0].text()).toBe('01 First charts · next step')
  })

  it('filters as you type and picks the first match on Enter', async () => {
    const { w, ember, ui } = setup()
    await w.find('.picker-input').setValue('land')
    expect(w.findAll('.picker-title').map((t) => t.text())).toEqual(['Landlord'])
    await w.find('.picker-input').trigger('keydown', { key: 'Enter' })
    expect(ember.selection).toEqual({ kind: 'task', taskId: 'Landlord' })
    expect(ui.pickerOpen).toBe(false)
  })

  it('does nothing on Enter when nothing matches', async () => {
    const { w, ember, ui } = setup()
    await w.find('.picker-input').setValue('zzz')
    expect(w.find('.picker-empty').text()).toBe('Nothing matches “zzz”.')
    await w.find('.picker-input').trigger('keydown', { key: 'Enter' })
    expect(ember.selection).toEqual({ kind: 'task', taskId: 'Review PR' })
    expect(ui.pickerOpen).toBe(true)
  })

  it('picks a clicked row', async () => {
    const { w, ember, ui } = setup()
    await w.findAll('.picker-row')[2].trigger('click')
    expect(ember.selection).toEqual({ kind: 'task', taskId: 'Sourdough' })
    expect(ui.pickerOpen).toBe(false)
  })

  it('closes on a backdrop click but not on a click inside the dialog', async () => {
    const { w, ui } = setup()
    await w.find('.picker-head').trigger('click')
    expect(ui.pickerOpen).toBe(true)
    await w.find('.picker-backdrop').trigger('click')
    expect(ui.pickerOpen).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/FocusPicker.test.ts`
Expected: FAIL — cannot resolve `./FocusPicker.vue`.

- [ ] **Step 3: Write `src/components/FocusPicker.vue`**

```vue
<script setup lang="ts">
import { Search } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { pickerSections, type PickerItem } from '../core/picker'
import { useEmberStore } from '../stores/ember'
import { useUiStore } from '../stores/ui'

const ember = useEmberStore()
const ui = useUiStore()
const input = ref<HTMLInputElement | null>(null)

const sections = computed(() =>
  pickerSections(ember.goals, ember.tasks, ember.selection, ui.pickerTab, ui.pickerQuery, ember.today),
)

onMounted(() => input.value?.focus())

function pick(item: PickerItem) {
  ember.select(item.target)
  ui.closePicker()
}

function pickFirst() {
  const first = sections.value[0]?.items[0]
  if (first) pick(first)
}
</script>

<template>
  <Teleport to="body">
    <div class="dialog-backdrop picker-backdrop" @click.self="ui.closePicker()">
      <div class="dialog picker" role="dialog" aria-modal="true" aria-label="Pick what to focus on">
        <div class="picker-head">
          <Search :size="18" :stroke-width="2.25" />
          <input
            ref="input"
            v-model="ui.pickerQuery"
            class="picker-input"
            :placeholder="ui.pickerTab === 'goals' ? 'Search goal steps' : 'Search tasks'"
            aria-label="Search"
            @keydown.enter.prevent="pickFirst"
          />
          <div class="seg">
            <label class="seg-opt"><input v-model="ui.pickerTab" type="radio" name="ember-pick" value="tasks" />Tasks</label>
            <label class="seg-opt"><input v-model="ui.pickerTab" type="radio" name="ember-pick" value="goals" />Goals</label>
          </div>
        </div>
        <div class="picker-body">
          <template v-for="(sec, i) in sections" :key="`${i}-${sec.label}`">
            <div class="picker-section section-label">
              <span>{{ sec.label }}</span><span class="picker-count">{{ sec.items.length }}</span>
            </div>
            <button
              v-for="it in sec.items"
              :key="it.key"
              class="picker-row"
              :class="{ 'is-current': it.current }"
              @click="pick(it)"
            >
              <span class="swatch" :class="{ 'is-outlined': it.outlined }" :style="{ background: it.swatch }"></span>
              <span class="picker-text">
                <span class="picker-title">{{ it.title }}</span>
                <span class="picker-meta">{{ it.meta }}</span>
              </span>
              <span v-if="it.current" class="tag tag-accent">Current</span>
            </button>
          </template>
          <p v-if="!sections.length" class="picker-empty">Nothing matches “{{ ui.pickerQuery }}”.</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.picker-backdrop { z-index: 200; place-items: start center; padding-top: 12vh; }
.picker { width: min(560px, 100%); max-height: 72vh; color: var(--color-text); border: 2px solid var(--color-text); }
.picker-head {
  display: flex; align-items: center; gap: var(--space-3);
  padding: var(--space-3) var(--space-4); border-bottom: 2px solid var(--color-divider);
}
.picker-head > svg { flex: none; }
.picker-input { flex: 1; min-width: 0; border: 0; background: transparent; font-size: 16px; color: var(--color-text); }
.picker-input:focus-visible { outline: none; }
.picker-head .seg { flex: none; }
.picker-body { overflow-y: auto; display: flex; flex-direction: column; padding-bottom: var(--space-2); }
.picker-section {
  position: sticky; top: 0; z-index: 1; display: flex; justify-content: space-between;
  padding: var(--space-3) var(--space-4) var(--space-1);
  background: var(--color-surface); border-bottom: 1px solid var(--color-divider);
}
.picker-count { font-weight: 400; color: var(--color-neutral-700); }
.picker-row {
  display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; gap: var(--space-3); align-items: center;
  padding: var(--space-2) var(--space-4); border: 0; border-bottom: 1px solid var(--color-divider);
  background: transparent; color: var(--color-text); text-align: left;
}
.picker-row:hover, .picker-row.is-current { background: var(--color-accent-100); }
.picker-text { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.picker-title { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.is-current .picker-title { font-weight: 700; }
.picker-meta { font-size: 12px; color: var(--color-neutral-700); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.picker-empty { padding: var(--space-4); font-size: 14px; color: var(--color-neutral-700); }
.is-outlined { box-shadow: inset 0 0 0 2px var(--color-text); }
@media (max-width: 520px) {
  .picker-backdrop { padding: var(--space-4) var(--space-4) 0; }
  .picker-head { flex-wrap: wrap; }
}
</style>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add focus picker dialog"
```

---

### Task 6: Compose the shell in App, wire Esc and the ticker

**Files:**
- Modify: `src/App.vue`, `index.html`
- Delete: `src/dev/StyleSample.vue`
- Test: `src/App.test.ts`

**Interfaces:**
- Consumes: `NavBar`, `FocusBar`, `FocusPicker`, `useTicker`, `useEmberStore().tick`, `useUiStore()` (view, pickerOpen, escape).
- Produces: the running shell. Phases 3–5 replace the placeholder `<main class="view">` with `TodayView`, `GoalsView`, `ActivityView`.

- [ ] **Step 1: Write the failing test**

`src/App.test.ts`:
```ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import App from './App.vue'
import { useEmberStore } from './stores/ember'
import { useUiStore } from './stores/ui'

const NOW = new Date(2026, 8, 23, 10, 0).getTime()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  localStorage.clear()
  setActivePinia(createPinia())
})
afterEach(() => vi.useRealTimers())

const mountApp = () => mount(App, { attachTo: document.body, global: { stubs: { teleport: true } } })

describe('App shell', () => {
  it('renders the nav, the focus bar and the current view', () => {
    const w = mountApp()
    expect(w.find('nav').exists()).toBe(true)
    expect(w.find('.focus-bar').exists()).toBe(true)
    expect(w.find('.view').text()).toContain('Today')
    w.unmount()
  })

  it('ticks the clock while mounted', () => {
    const w = mountApp()
    const ember = useEmberStore()
    vi.setSystemTime(NOW + 1000)
    vi.advanceTimersByTime(250)
    expect(ember.now).toBeGreaterThanOrEqual(NOW + 1000)
    w.unmount()
  })

  it('opens the picker and closes it with Esc', async () => {
    const w = mountApp()
    const ui = useUiStore()
    await w.find('.fb-title').trigger('click')
    expect(w.find('.picker-backdrop').exists()).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(ui.pickerOpen).toBe(false)
    expect(w.find('.picker-backdrop').exists()).toBe(false)
    w.unmount()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/App.test.ts`
Expected: FAIL — no `nav` / `.focus-bar` (App still renders the style sample).

- [ ] **Step 3: Replace `src/App.vue` and delete the style sample**

```bash
rm src/dev/StyleSample.vue && rmdir src/dev
```

`src/App.vue`:
```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import FocusBar from './components/FocusBar.vue'
import FocusPicker from './components/FocusPicker.vue'
import NavBar from './components/NavBar.vue'
import { useTicker } from './composables/useTicker'
import { useEmberStore } from './stores/ember'
import { useUiStore, type View } from './stores/ui'

const ember = useEmberStore()
const ui = useUiStore()

useTicker(() => ember.tick())

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && ui.escape()) e.preventDefault()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

const VIEW_NAMES: Record<View, string> = { today: 'Today', goals: 'Goals', activity: 'Activity' }
</script>

<template>
  <div class="app">
    <NavBar />
    <FocusBar />
    <!-- Phases 3–5 replace this placeholder with TodayView / GoalsView / ActivityView. -->
    <main class="view">
      <span class="kicker">{{ VIEW_NAMES[ui.view] }}</span>
      <p class="muted">This view arrives in a later phase.</p>
    </main>
    <FocusPicker v-if="ui.pickerOpen" />
  </div>
</template>

<style scoped>
.app { min-height: 100vh; display: flex; flex-direction: column; background: var(--color-bg); color: var(--color-text); }
.view {
  flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--space-2);
  padding: var(--space-6); border-top: 2px solid var(--color-divider);
}
@media (max-width: 520px) { .view { padding: var(--space-4); } }
</style>
```

- [ ] **Step 4: Add the favicon to `index.html`**

Add inside `<head>`, after the viewport meta:
```html
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' fill='%23ec3013'/%3E%3C/svg%3E" />
```

- [ ] **Step 5: Run the full check**

Run: `npm test && npm run build`
Expected: all tests pass; vue-tsc clean; build succeeds.

- [ ] **Step 6: Check the running app**

Run `npm run dev` (background). In the Playwright browser at `http://localhost:5173/?demo=1` (clear localStorage first so the seed loads):
1. 1280px wide: nav (Ember · Today/Goals/Activity · date), grey focus bar showing "Reusable chart function", "Learn D3.js · 02 First charts · 50m of est. …", "2 sessions · 50m today", "Demo speed" tag, Start focus. Screenshot.
2. Click Start focus → bar turns ink, time counts down ~1 timer-minute per second, progress grows, Reset appears. After ~25s → accent-100 break, toast "+25m · Reusable chart function" floats up, "3 sessions · 1h 15m today", Start break + Skip break. Screenshot.
3. Click the title → picker opens on Goals; type "brush" → one row; Enter picks it and closes; bar shows "Brushing & linked views". Reopen, press Esc → closes. Click the scan button then Esc → nothing breaks.
4. Resize to 360px: no horizontal scroll (`document.documentElement.scrollWidth <= 360`), focus bar wraps to two rows, long title ellipsises. Screenshot.
5. Console: no errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: compose the app shell with nav, focus bar, picker and ticker"
```
