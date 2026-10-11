# Goal Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Goals can be Active, Paused or Achieved: paused and achieved goals leave Today and the focus picker, the Goals list groups them, finishing the last step asks before closing a goal, and an achieved goal shows a summary of the effort.

**Architecture:** A `status` (+ `achievedOn`) field on `Goal`, missing = active. Pure helpers in `src/core/goals.ts` (status, repair, which goals to offer) and `src/core/goalView.ts` (grouped list, achieved summary); one store action `setGoalStatus`; views read the helpers. Sync and backup carry the fields unchanged (they are a goal's own fields).

**Tech Stack:** Vue 3 `<script setup>` + TypeScript + Pinia, plain CSS, lucide-vue-next, Vitest + jsdom + @vue/test-utils.

**Spec:** `docs/superpowers/specs/2026-10-11-ember-goal-status-design.md`

## Global Constraints

- `src/core/` imports no `vue`/`pinia`.
- Visual rules: zero radius, 2px rules between major sections / 1px between rows, button labels flush left, red accent sparingly, no gradients/emoji/shadows (except the picker dialog).
- Active is stored as a *missing* `status` (never `'active'`), so existing data and the Drive file are unchanged for active goals.
- Goal colours come from the index among all goals (`goalColor(gi)` over the full array) — never re-index after filtering.
- Dates shown with `dayLabel` ("Oct 12").
- Commands: `npx vitest run <file>` for one file, `npm test` for all, `npm run typecheck`, `npm run build`.

## Review Focus

1. A goal achieved and then deleted, or deleted while paused: undo must restore it with its status; status actions on a deleted goal are no-ops (Task 2 test).
2. The timer's current selection is a step of a goal that gets paused: selection and timer stay untouched (Task 2 test).
3. Editing a task linked to an achieved goal must keep the link in the dropdown (Task 3 test).
4. The selected goal is achieved while the Achieved group is collapsed: the group opens to show it unless the user collapsed it on purpose (Task 4 test).
5. Saved or synced data with `status: 'done'` or `achievedOn` on a non-achieved goal loads as a clean active/paused goal (Task 1 test).

---

### Task 1: Status data and repair

**Files:**
- Modify: `src/core/model.ts` (Goal interface)
- Modify: `src/core/goals.ts`
- Modify: `src/core/persist.ts` (`normalize`)
- Modify: `src/core/sync.ts` (`readSyncFile`)
- Test: `src/core/goals.test.ts`, `src/core/persist.test.ts`, `src/core/sync.test.ts`

**Interfaces:**
- Produces: `type GoalStatus = 'active' | 'paused' | 'achieved'` (model.ts); `goalStatus(g: Goal): GoalStatus`, `isActiveGoal(g: Goal): boolean`, `repairGoal(g: Goal): Goal`, `goalOptions(goals: Goal[], currentId?: string | null): Goal[]` (goals.ts).

- [ ] **Step 1: Write failing tests** in `src/core/goals.test.ts`:

```ts
describe('goal status', () => {
  const g = goalFixture('G', [['M', [['A', null]]]])
  it('reads a missing or unknown status as active', () => {
    expect(goalStatus(g)).toBe('active')
    expect(goalStatus({ ...g, status: 'done' as never })).toBe('active')
    expect(goalStatus({ ...g, status: 'paused' })).toBe('paused')
  })
  it('offers only live, active goals for focus', () => {
    expect(isActiveGoal(g)).toBe(true)
    expect(isActiveGoal({ ...g, status: 'paused' })).toBe(false)
    expect(isActiveGoal({ ...g, status: 'achieved' })).toBe(false)
    expect(isActiveGoal({ ...g, deletedOn: '2026-09-01' })).toBe(false)
  })
  it('repairs an unknown status and a stray achievedOn, leaving valid goals untouched', () => {
    expect(repairGoal(g)).toBe(g)
    const ok = { ...g, status: 'achieved' as const, achievedOn: '2026-10-11' }
    expect(repairGoal(ok)).toBe(ok)
    expect(repairGoal({ ...g, status: 'done' as never })).not.toHaveProperty('status')
    expect(repairGoal({ ...g, status: 'paused', achievedOn: '2026-10-11' })).not.toHaveProperty('achievedOn')
  })
  it('lets tasks link to active and paused goals, and keeps an achieved one already linked', () => {
    const p = { ...goalFixture('P', []), status: 'paused' as const }
    const a = { ...goalFixture('A', []), status: 'achieved' as const, achievedOn: '2026-10-01' }
    const d = { ...goalFixture('D', []), deletedOn: '2026-09-01' }
    expect(goalOptions([g, p, a, d]).map((x) => x.id)).toEqual(['G', 'P'])
    expect(goalOptions([g, p, a, d], 'A').map((x) => x.id)).toEqual(['G', 'P', 'A'])
  })
})
```

Add to `src/core/persist.test.ts` (inside its describe):

```ts
  it('repairs goal statuses on load', () => {
    const goal = { ...goalFixture('G', []), status: 'done', achievedOn: '2026-10-01' }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, data: { ...dataFixture(), goals: [goal] } }))
    const loaded = loadData()!.goals[0]
    expect(loaded).not.toHaveProperty('status')
    expect(loaded).not.toHaveProperty('achievedOn')
  })
```

Add to `src/core/sync.test.ts` (in the `readSyncFile` describe):

```ts
  it('repairs goal statuses from the file', () => {
    const goals = [{ ...goalFixture('G', []), status: 'paused', achievedOn: '2026-10-01' }]
    const r = readSyncFile(JSON.stringify({ app: 'ember', version: 1, generation: 'g', data: { goals, tasks: [], logs: [] } }))
    expect(r.ok && r.data.goals[0]).toMatchObject({ status: 'paused' })
    expect(r.ok && r.data.goals[0]).not.toHaveProperty('achievedOn')
  })
```

(Import `goalFixture` where missing.)

- [ ] **Step 2: Run** `npx vitest run src/core/goals.test.ts src/core/persist.test.ts src/core/sync.test.ts` — expect failures (`goalStatus` not exported).

- [ ] **Step 3: Implement.**

`src/core/model.ts`:

```ts
export type GoalStatus = 'active' | 'paused' | 'achieved'
export interface Goal {
  id: string; title: string; outcome: string; milestones: Milestone[]; createdAt: ISODate
  /** Missing = active (active is never stored). */
  status?: GoalStatus
  /** Set only while achieved: the day the user confirmed it. */
  achievedOn?: ISODate | null
  deletedOn?: ISODate | null; updatedAt?: number
}
```

`src/core/goals.ts` (after `isLive`):

```ts
const STATUSES: GoalStatus[] = ['active', 'paused', 'achieved']
export const goalStatus = (g: Goal): GoalStatus => (STATUSES.includes(g.status as GoalStatus) ? (g.status as GoalStatus) : 'active')
/** Live and active: the goals offered for focus (Working on, the picker). */
export const isActiveGoal = (g: Goal): boolean => isLive(g) && goalStatus(g) === 'active'

/** Saved or synced goals: an unknown status becomes active; achievedOn stays only on achieved goals. Valid goals come back as is. */
export function repairGoal(g: Goal): Goal {
  const status = goalStatus(g)
  const badStatus = g.status !== undefined && (g.status !== status || status === 'active')
  const strayDate = 'achievedOn' in g && status !== 'achieved'
  if (!badStatus && !strayDate) return g
  const { status: _s, achievedOn: _a, ...rest } = g
  return status === 'active' ? rest : status === 'paused' ? { ...rest, status } : { ...rest, status, achievedOn: g.achievedOn ?? null }
}

/** Goals a task can link to: active and paused, plus its current goal if achieved (so editing never unlinks it). */
export const goalOptions = (goals: Goal[], currentId: string | null = null): Goal[] =>
  goals.filter((g) => isLive(g) && (goalStatus(g) !== 'achieved' || g.id === currentId))
```

`src/core/persist.ts` `normalize`: return `{ ...d, goals: d.goals.map(repairGoal), settings, timer: ... }` (import `repairGoal` from `./goals`).

`src/core/sync.ts` `readSyncFile`: `data: { goals: d.goals.map(repairGoal), tasks: d.tasks, logs: d.logs, settings }`.

- [ ] **Step 4: Run** the same command — expect PASS; then `npm test`.
- [ ] **Step 5: Commit** `feat: goal status field with repair on load and sync`.

---

### Task 2: Store action and reopening

**Files:**
- Modify: `src/stores/ember.ts`
- Test: `src/stores/ember.test.ts`, `src/core/sync.test.ts`

**Interfaces:**
- Consumes: `goalStatus`, `isLive` (goals.ts), `GoalStatus` (model.ts).
- Produces: store action `setGoalStatus(goalId: string, status: GoalStatus): void`.

- [ ] **Step 1: Failing tests** in `src/stores/ember.test.ts` (new describe, using its `storeWith`/`fixture`, today is 2026-09-23):

```ts
describe('goal status', () => {
  it('pauses, resumes, achieves and reopens, dating only the achievement', () => {
    const store = storeWith()
    store.setGoalStatus('D3', 'paused')
    expect(store.goals[0]).toMatchObject({ status: 'paused' })
    store.setGoalStatus('D3', 'achieved')
    expect(store.goals[0]).toMatchObject({ status: 'achieved', achievedOn: '2026-09-23' })
    store.setGoalStatus('D3', 'active')
    expect(store.goals[0]).not.toHaveProperty('status')
    expect(store.goals[0]).not.toHaveProperty('achievedOn')
  })

  it('keeps the first achieved date when marked again', () => {
    const store = storeWith()
    store.setGoalStatus('D3', 'achieved')
    vi.setSystemTime(NOW + 3 * 864e5)
    store.tick()
    store.setGoalStatus('D3', 'achieved')
    expect(store.goals[0].achievedOn).toBe('2026-09-23')
  })

  it('reopens an achieved goal when a step or milestone is added, not when a step is unticked', () => {
    const store = storeWith()
    store.setGoalStatus('D3', 'achieved')
    store.toggleStep(LINE)
    store.toggleStep(LINE)
    expect(store.goals[0].status).toBe('achieved')
    store.addStep('D3', 'D3/Motion', 'Springs')
    expect(store.goals[0]).not.toHaveProperty('status')
    store.setGoalStatus('D3', 'achieved')
    store.addMilestone('D3', 'Polish')
    expect(store.goals[0]).not.toHaveProperty('status')
  })

  it('ignores missing or deleted goals and keeps the timer selection on pause', () => {
    const store = storeWith({ selection: LINE })
    store.setGoalStatus('nope', 'paused')
    store.setGoalStatus('D3', 'paused')
    expect(store.selection).toEqual(LINE)
    store.deleteGoal('D3')
    store.setGoalStatus('D3', 'achieved')
    expect(store.goals[0].status).toBe('paused')
  })
})
```

In `src/core/sync.test.ts` (mergeData describe):

```ts
  it('merges a status change by the newer edit', () => {
    const base = goalFixture('G', [])
    const local = sharedPart(dataFixture({ goals: [{ ...base, status: 'paused', updatedAt: 5 }] }))
    const remote = sharedPart(dataFixture({ goals: [{ ...base, status: 'achieved', achievedOn: '2026-10-11', updatedAt: 9 }] }))
    expect(mergeData(local, remote).goals[0]).toMatchObject({ status: 'achieved', achievedOn: '2026-10-11' })
  })
```

- [ ] **Step 2: Run** `npx vitest run src/stores/ember.test.ts src/core/sync.test.ts` — expect FAIL (`setGoalStatus` is not a function).

- [ ] **Step 3: Implement** in `src/stores/ember.ts` (goals section):

```ts
  /** Active is stored as no status; achievedOn is kept only while achieved (first date wins). */
  function setGoalStatus(goalId: string, status: GoalStatus) {
    const g = goalById(goalId)
    if (!g || !isLive(g) || goalStatus(g) === status) return
    if (status === 'achieved') {
      g.status = 'achieved'
      g.achievedOn = today.value
      return
    }
    delete g.achievedOn
    if (status === 'paused') g.status = 'paused'
    else delete g.status
  }
  /** Adding work to an achieved goal reopens it: there is more to do. */
  const reopenIfAchieved = (g: Goal) => { if (goalStatus(g) === 'achieved') setGoalStatus(g.id, 'active') }
```

In `addMilestone`, after `g.milestones.push(m)`: `reopenIfAchieved(g)`. In `addStep`, look up the goal first:

```ts
  function addStep(goalId: string, msId: string, title: string): Step | null {
    const g = goalById(goalId)
    const m = g?.milestones.find((x) => x.id === msId)
    const name = title.trim()
    if (!g || !m || !name) return null
    const s: Step = { id: uid(), title: name, doneOn: null, estMin: 50 }
    m.steps.push(s)
    reopenIfAchieved(g)
    return s
  }
```

Import `goalStatus` from `../core/goals` and `GoalStatus` from `../core/model`; add `setGoalStatus` to the returned object.

- [ ] **Step 4: Run** — expect PASS; `npm test`.
- [ ] **Step 5: Commit** `feat: pause, resume, achieve and reopen goals`.

---

### Task 3: Paused and achieved goals leave Today, the picker and new-task dropdowns

**Files:**
- Modify: `src/core/today.ts` (`workingOn`), `src/core/picker.ts` (goals tab)
- Modify: `src/components/today/WorkingOn.vue` (empty message), `src/components/today/AddTask.vue`, `src/components/TaskEditPanel.vue`
- Test: `src/core/today.test.ts`, `src/core/picker.test.ts`, `src/components/TaskEditPanel.test.ts`, `src/components/today/WorkingOn.test.ts`

**Interfaces:**
- Consumes: `isActiveGoal`, `goalOptions` (Task 1).

- [ ] **Step 1: Failing tests.**

`src/core/today.test.ts` (workingOn describe):

```ts
  it('leaves out paused and achieved goals, keeping colours by position', () => {
    const a = goalFixture('A', [['M', [['A1', null]]]])
    const b = { ...goalFixture('B', [['M', [['B1', null]]]]), status: 'paused' as const }
    const c = goalFixture('C', [['M', [['C1', null]]]])
    const cards = workingOn([a, b, c], null)
    expect(cards.map((x) => x.goalId)).toEqual(['A', 'C'])
    expect(cards[1].swatch).toBe(goalColor(2))
  })
```

`src/core/picker.test.ts`:

```ts
  it('offers steps only from active goals', () => {
    const a = goalFixture('A', [['M', [['A1', null]]]])
    const b = { ...goalFixture('B', [['M', [['B1', null]]]]), status: 'achieved' as const, achievedOn: '2026-09-01' }
    expect(pickerSections([a, b], [], null, 'goals', '', '2026-09-23').map((s) => s.label)).toEqual(['A'])
  })
```

`src/components/TaskEditPanel.test.ts`: a task linked to an achieved goal lists it, and an achieved goal it isn't linked to is not listed (mount as the file's existing tests do, with goals `[active 'D3', achieved 'Done']` and the task's `goalId: 'Done'`; assert option texts include 'Done'; with `goalId: null` they don't).

`src/components/today/WorkingOn.test.ts`: with only a paused goal, the empty text is `No active goals. Resume one on the Goals tab.`

- [ ] **Step 2: Run** those four files — expect FAIL.

- [ ] **Step 3: Implement.**
  - `workingOn`: `if (!isActiveGoal(g)) return []` (replacing `!isLive(g)`).
  - `pickerSections` goals tab: `if (!isActiveGoal(g)) return { label: g.title, items: [] }` (empty sections are already filtered out).
  - `AddTask.vue`: `v-for="g in goalOptions(ember.goals)"`.
  - `TaskEditPanel.vue`: `const liveGoals = computed(() => goalOptions(ember.goals, props.task.goalId))`.
  - `WorkingOn.vue` empty text:

```ts
const emptyText = computed(() => {
  if (!ember.goals.some(isLive)) return 'No goals yet. Add one on the Goals tab.'
  if (!ember.goals.some(isActiveGoal)) return 'No active goals. Resume one on the Goals tab.'
  return 'No goal has an open step. Add steps on the Goals tab.'
})
```

- [ ] **Step 4: Run** — PASS; `npm test`.
- [ ] **Step 5: Commit** `feat: paused and achieved goals leave Today, the picker and new-task links`.

---

### Task 4: Grouped Goals list

**Files:**
- Modify: `src/core/goalView.ts` (`goalList`), `src/components/goals/GoalList.vue`, `src/components/goals/GoalsView.vue`
- Test: `src/core/goalView.test.ts`, `src/components/goals/GoalList.test.ts`, `src/components/goals/GoalsView.test.ts`

**Interfaces:**
- Produces: `interface GoalListGroup { status: GoalStatus; label: string; items: GoalListItem[] }`; `goalList(goals, spent): GoalListGroup[]` (non-empty groups in order active, paused, achieved).

- [ ] **Step 1: Failing tests.**

`goalView.test.ts` — replace the list test:

```ts
  it('groups goals into active, paused and achieved with their own meta lines', () => {
    const spanish = goalFixture('Spanish', [['All', [['A', '2026-09-01'], ['B', '2026-09-02']]]])
    const art = { ...goalFixture('Art', []), status: 'paused' as const }
    const run = { ...goalFixture('Run', []), status: 'achieved' as const, achievedOn: '2026-10-12' }
    const groups = goalList([goal, art, spanish, run], spent)
    expect(groups.map((g) => [g.status, g.label, g.items.map((i) => i.id)])).toEqual([
      ['active', 'Active', ['D3', 'Spanish']], ['paused', 'Paused', ['Art']], ['achieved', 'Achieved', ['Run']],
    ])
    expect(groups[0].items[0]).toEqual({ id: 'D3', title: 'D3', swatch: 'var(--color-accent)', pct: 40, complete: false, meta: '2h 5m focused · 2/5 steps' })
    expect(groups[1].items[0].meta).toBe('Paused · 0m focused')
    expect(groups[2].items[0].meta).toBe('Achieved Oct 12 · 0m focused')
    expect(groups[1].items[0].swatch).toBe(goalColor(1))
  })
```

`GoalList.test.ts`: (a) the existing tests read `.gl-group[data-status="active"] .gl-item`; (b) Paused shows a header `Paused` and its items; (c) Achieved header is a button `Achieved · 1`, collapsed by default (`aria-expanded="false"`, no items) unless it holds `activeId`; clicking toggles it and stores `ui.openGroups['goals:achieved']`.

`GoalsView.test.ts`: with `[achieved 'Run', active 'D3']` and no `activeGoalId`, the main view shows D3.

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement** `goalList`:

```ts
export interface GoalListGroup { status: GoalStatus; label: string; items: GoalListItem[] }
const GROUP_LABEL: Record<GoalStatus, string> = { active: 'Active', paused: 'Paused', achieved: 'Achieved' }

export function goalList(goals: Goal[], spent: Map<string, number>): GoalListGroup[] {
  const by: Record<GoalStatus, GoalListItem[]> = { active: [], paused: [], achieved: [] }
  // Index over all goals so colours keep their positions; deleted goals are dropped.
  goals.forEach((g, gi) => {
    if (!isLive(g)) return
    const st = goalStats(g)
    const status = goalStatus(g)
    const focused = `${fmtM(goalFocused(g, spent))} focused`
    const meta = status === 'active' ? `${focused} · ${st.done}/${st.total} steps`
      : status === 'paused' ? `Paused · ${focused}`
      : `Achieved ${dayLabel(g.achievedOn ?? g.createdAt)} · ${focused}`
    by[status].push({ id: g.id, title: g.title, swatch: goalColor(gi), pct: st.pct, complete: st.total > 0 && st.pct === 100, meta })
  })
  return (['active', 'paused', 'achieved'] as const).filter((s) => by[s].length).map((s) => ({ status: s, label: GROUP_LABEL[s], items: by[s] }))
}
```

`GoalList.vue`: `const groups = computed(() => goalList(...))`; achieved open state `ui.openGroups['goals:achieved'] ?? group.items.some((i) => i.id === props.activeId)`; template per group `<div class="gl-group" :data-status="g.status">`, header for paused (`<span class="gl-head section-label">Paused</span>`) and achieved (`<button class="gl-head gl-toggle section-label" :aria-expanded>` with `ChevronRight` rotating like Upcoming), then the existing item buttons. Paused/achieved items get class `is-quiet` (bar `--color-neutral-500`).

`GoalsView.vue`: `ember.goals.find((g) => g.id === ui.activeGoalId && isLive(g)) ?? ember.goals.find(isActiveGoal) ?? ember.goals.find(isLive) ?? null`.

- [ ] **Step 4: Run** — PASS; `npm test`.
- [ ] **Step 5: Commit** `feat: Goals list groups active, paused and achieved`.

---

### Task 5: Status menu and the Achieved summary

**Files:**
- Modify: `src/components/RowMenu.vue` (optional extra items), `src/components/goals/GoalSummary.vue`, `src/core/goalView.ts`
- Test: `src/components/RowMenu.test.ts`, `src/core/goalView.test.ts`, `src/components/goals/GoalSummary.test.ts`

**Interfaces:**
- Produces: RowMenu prop `extra?: { key: string; label: string }[]`, emit `select: [key: string]`; `achievedSummary(g: Goal, logs: FocusLog[]): AchievedSummary` where `AchievedSummary = { outcome: string; span: string; focused: string; sessions: number; steps: number; milestones: number }`.

- [ ] **Step 1: Failing tests.**

`RowMenu.test.ts`:

```ts
  it('shows extra items between Edit and Delete and reports the one picked', async () => {
    const w = mount(RowMenu, { props: { menuKey: 'goal:g', label: 'G', extra: [{ key: 'pause', label: 'Pause' }] }, attachTo: document.body })
    await w.find('.rmn-trigger').trigger('click')
    expect(w.findAll('[role="menuitem"]').map((b) => b.text())).toEqual(['Edit', 'Pause', 'Delete'])
    await w.find('.rmn-pause').trigger('click')
    expect(w.emitted('select')).toEqual([['pause']])
    expect(useUiStore().menuFor).toBeNull()
    w.unmount()
  })
```

`goalView.test.ts`:

```ts
describe('achievedSummary', () => {
  it('sums the effort from start to the achieved day', () => {
    const done = { ...goal, outcome: 'Ship a chart', status: 'achieved' as const, achievedOn: '2026-10-12' }
    expect(achievedSummary(done, logs)).toEqual({
      outcome: 'Ship a chart', span: 'Jan 1 → Oct 12 · 284 days', focused: '2h 5m', sessions: 5, steps: 2, milestones: 1,
    })
  })
  it('says same day when started and achieved together', () => {
    const quick = { ...goalFixture('Q', []), status: 'achieved' as const, achievedOn: '2026-01-01' }
    expect(achievedSummary(quick, []).span).toBe('Jan 1 → Jan 1 · same day')
  })
})
```

`GoalSummary.test.ts`: menu items per status (active: Edit, Pause, Mark achieved, Delete; paused: Edit, Resume, Mark achieved, Delete; achieved: Edit, Reopen, Delete); picking each calls the store; an achieved goal shows `.gs-achieved` with the outcome, span and four stats; marking achieved while mounted adds an `anim-pop` class to `.gs-ach-flag`.

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement.**

RowMenu: add `extra?: { key: string; label: string }[]` to props and `select: [key: string]` to emits;

```ts
function pick(key: string) {
  ui.menuFor = null
  emit('select', key)
}
```

```html
<button v-for="x in extra ?? []" :key="x.key" role="menuitem" class="rmn-item" :class="`rmn-${x.key}`" @click="pick(x.key)">{{ x.label }}</button>
```

(placed between Edit and Delete).

`achievedSummary` in goalView.ts:

```ts
export interface AchievedSummary { outcome: string; span: string; focused: string; sessions: number; steps: number; milestones: number }

export function achievedSummary(g: Goal, logs: FocusLog[]): AchievedSummary {
  const ids = new Set(allSteps(g).map((s) => s.id))
  const mine = logs.filter((l) => l.target?.kind === 'step' && ids.has(l.target.stepId))
  const on = g.achievedOn ?? g.createdAt
  const days = diffDays(on, g.createdAt)
  const st = goalStats(g)
  return {
    outcome: g.outcome,
    span: `${dayLabel(g.createdAt)} → ${dayLabel(on)} · ${days === 0 ? 'same day' : plural(days, 'day')}`,
    focused: fmtM(mine.reduce((a, l) => a + l.min, 0)),
    sessions: mine.length,
    steps: st.done,
    milestones: st.milestonesDone,
  }
}
```

GoalSummary: `status = computed(() => goalStatus(props.goal))`; `menuExtra` by status (`pause`/`resume`/`achieve`/`reopen`); `onSelect(key)` maps to `ember.setGoalStatus(id, key === 'pause' ? 'paused' : key === 'achieve' ? 'achieved' : 'active')`; pass `:extra="menuExtra" @select="onSelect"` to RowMenu. Pop: `const pops = ref(0)`; `watch(() => [props.goal.id, status.value] as const, ([id, s], [pid, ps]) => { if (id === pid && s === 'achieved' && ps !== 'achieved') pops.value++ })`; flag class `pops ? popClass(pops) : ''`. Panel (above the readme, only when achieved):

```html
<div v-if="status === 'achieved'" class="gs-achieved">
  <div class="gs-ach-flag" :class="pops ? popClass(pops) : ''"><Flag :size="18" :stroke-width="2.5" /></div>
  <div class="gs-ach-body">
    <span class="kicker">Achieved</span>
    <p class="gs-ach-outcome">{{ summary.outcome || 'Goal achieved.' }}</p>
    <p class="gs-ach-span">{{ summary.span }}</p>
    <div class="gs-ach-stats">
      <span><b>{{ summary.focused }}</b> focused</span>
      <span><b>{{ summary.sessions }}</b> {{ summary.sessions === 1 ? 'session' : 'sessions' }}</span>
      <span><b>{{ summary.steps }}</b> steps</span>
      <span><b>{{ summary.milestones }}</b> milestones</span>
    </div>
  </div>
</div>
```

Styles: `.gs-achieved` grid `40px 1fr`, 2px `--color-text` border, padding `--space-4`; flag square 40px, `--color-accent` background, `--color-bg` icon.

- [ ] **Step 4: Run** — PASS; `npm test`.
- [ ] **Step 5: Commit** `feat: goal menu pauses, resumes, achieves and reopens; achieved summary`.

---

### Task 6: Finish-line prompt

**Files:**
- Modify: `src/components/goals/Roadmap.vue`
- Test: `src/components/goals/Roadmap.test.ts`

- [ ] **Step 1: Failing test** in `Roadmap.test.ts` (mount as its existing tests do):
  - a goal with every step done and no status shows `.rm-finish-ask` with text `Every step is done. Is the goal achieved?`, `.rm-achieve` (Mark achieved) and `.rm-more` (Add a milestone);
  - clicking `.rm-achieve` sets the goal `status: 'achieved'`;
  - clicking `.rm-more` opens the milestone input (`ui.adding` is `{ kind: 'milestone' }`);
  - an achieved goal, or one with open steps, shows no `.rm-finish-ask`.

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement** in the `.rm-finish-text` block:

```ts
const askAchieved = computed(() => finish.value.reached && goalStatus(props.goal) !== 'achieved')
```

```html
<div v-if="askAchieved" class="rm-finish-ask">
  <span>Every step is done. Is the goal achieved?</span>
  <div class="rm-finish-actions">
    <button class="btn btn-primary rm-achieve" @click="ember.setGoalStatus(goal.id, 'achieved')">Mark achieved</button>
    <button class="btn btn-secondary rm-more" @click="startMilestone">Add a milestone</button>
  </div>
</div>
```

Styles: `.rm-finish-ask { display: flex; flex-direction: column; gap: var(--space-2); margin-top: var(--space-2); font-size: 14px; }` and `.rm-finish-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }`.

- [ ] **Step 4: Run** — PASS; `npm test`, `npm run typecheck`, `npm run build`.
- [ ] **Step 5: Commit** `feat: finishing a goal's last step asks before marking it achieved`.

---

### Task 7: Browser check

- [ ] On `npm run dev` (port 5199), in the Goals tab: pause a goal (moves to Paused, gone from Today's Working on and the picker's Goals tab); finish every step of a goal (prompt appears); Mark achieved (summary panel pops, goal moves to Achieved and the group shows it); Reopen; add a step to an achieved goal (reopens). Check a task linked to an achieved goal still shows its goal in Edit.
- [ ] Screenshot the Goals tab with all three groups at 1280×800 and at 390px wide; fix any layout issue found, with a test where it is behaviour.
