# Ember Phase 7 — Polish, QA and Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Ember: add the spec's retriggerable animations (pop, drop; float exists), fix the deferred issues that a person would actually notice or that make the app fragile, compare every view with the prototype side by side, and write the build report the kickoff brief asks for.

**Architecture:** The store gains one non-persisted signal, `lastDone` (`{ key, n }`, bumped on every completion), alongside the existing `completions` counter for finished focus sessions. Components derive an animation class from these (`anim-pop0/1`, `anim-drop0/1`, alternating by `n % 2` so each event retriggers). Robustness fixes live in `src/core/` (persistence normalisation, labels) and the YouTube composable; interaction fixes are small component edits. QA compares the running app with the prototype served locally. The report is a Markdown file in `docs/design/`.

**Tech Stack:** Vue 3.5, Pinia 4, Vitest 5 + jsdom + @vue/test-utils, Playwright (browser checks).

**Spec:** `docs/design/handoff.md` §Interactions → Animations and States, §Not designed yet; `docs/design/PROMPT.md` (step 9 animations, step 11 side-by-side comparison, final report); prototype `docs/design/reference/Ember.dc.html` (animation wiring: `pop`, `hit`, `dpOn`, `pz` in lines 495–498, 558, 628, 632, 670, 704, 712).

## Global Constraints

- Animations (exact): **pop** .45s `cubic-bezier(.3,1.6,.5,1)`, scale .3 → 1.45 → 1 — checkbox on check; today's heat-map cell; newest session block; streak-strip today. **drop** .55s `cubic-bezier(.2,.9,.3,1.15)` — newest brick in the current week falls from −220px. **float** 1.6s ease-out — the toast (already built). Retrigger by alternating two identical keyframe names.
- `prefers-reduced-motion` already shortens all animations (base.css).
- Zero border radius; flush-left button labels; sparing accent; no gradients/emoji/shadows except the picker.
- Deliberate decisions from earlier phase plans are not "differences" to fix in QA.
- `src/core/` must not import `vue` or `pinia`.

## Decisions taken in this plan (tell the user)

1. **Done wall stays as it is** (spec formula, all finished tasks). Counting only goal steps, or a lighter seed, is a small follow-up if wanted.
2. **Minor issues fixed here** are the ones a person notices or that make the app fragile (listed in Tasks 3–4). Cosmetic or prototype-parity quirks go to the report instead.
3. **Animation signals persist until the next event**, as in the prototype: e.g. after a completion, opening the Activity tab replays the today-cell pop once.
4. **"Weeks in a row" forgives an empty current week** (counts back from last week, like the day streak) instead of showing 0 every Monday.
5. **Log dates from another year show the year** ("Oct 5, 2025").
6. **Clearing the Pick-date field keeps the last valid date** instead of silently filing the task under today; the draft date also moves forward if it falls into the past.

## Review Focus

1. **Undoing a completion** right after making it: no stray pop on the unchecked box, and the next completion pops again. Pinned in Task 2 (`pops the checkbox only when it is checked`).
2. **Two completions in a row** each retrigger the animation (class alternates 0/1). Pinned in Task 2 (`retriggers on the next completion`).
3. **Saved data from an older build** missing new timer fields (e.g. `lengthSec`) or with an unknown session length: loads with sane defaults instead of NaN timers. Pinned in Task 3 (`normalises old or hand-edited timer and settings`).
4. **Storage that throws on access** (blocked storage, sandboxed frames): Ember starts with the seed in memory. Pinned in Task 3 (`survives storage that throws`).
5. **Sound toggled before the video is ready:** no error; the state is applied when ready. Pinned in Task 4 (`ignores sound changes until the player is ready`).

---

## File structure

```
src/
  styles/animations.css            + .anim-pop0/1, .anim-drop0/1
  styles/base.css                  + .sr-only
  components/anim.ts               popClass(n), dropClass(n)
  stores/ember.ts                  + lastDone (ember.test.ts extended)
  components/TaskRow.vue           checkbox pop
  components/goals/Roadmap.vue     checkbox pop, newest-block pop, Esc focus, labels, narrow layout
  components/today/TodayList.vue   streak-strip today pop
  components/activity/HeatMap.vue  today-cell pop
  components/activity/DoneWall.vue newest-brick drop
  core/persist.ts                  normalise loaded data; guard storage access
  core/selection.ts                "Task" for an empty tag
  core/activityView.ts             log source fix, year on old dates, lenient weeks-in-a-row, empty tag
  composables/useYouTubePlayer.ts  ready flag, iframe tabindex/title, API timeout
  components/FocusBar.vue          aria-haspopup, screen-reader announcement of finished sessions
  components/FocusMode.vue         aria-pressed on sound
  components/FocusPicker.vue       ignore Enter during IME composition
  components/today/AddTask.vue     keep last valid date; move stale draft date forward
docs/design/build-report.md        final report
```

---

### Task 1: Animation classes and the completion signal

**Files:**
- Modify: `src/styles/animations.css`, `src/stores/ember.ts`, `src/stores/ember.test.ts`
- Create: `src/components/anim.ts`

**Interfaces:**
- Produces: CSS classes `.anim-pop0`, `.anim-pop1`, `.anim-drop0`, `.anim-drop1`; `popClass(n: number): string`, `dropClass(n: number): string` (alternate by `n % 2`); store `lastDone: { key: string; n: number } | null` — set when a task (`task:<id>`) or step (`step:<stepId>`) is completed (not when un-completed), `n` increments per completion.

- [ ] **Step 1: Write the failing test** — append inside `describe('selection hand-off', …)` in `src/stores/ember.test.ts`:

```ts
  it('signals each completion for animations, but not un-completions', () => {
    const store = storeWith()
    expect(store.lastDone).toBeNull()
    store.toggleTask('Review PR')
    expect(store.lastDone).toEqual({ key: 'task:Review PR', n: 1 })
    store.toggleTask('Review PR')
    expect(store.lastDone).toEqual({ key: 'task:Review PR', n: 1 })
    store.toggleStep(LINE)
    expect(store.lastDone).toEqual({ key: `step:${LINE.stepId}`, n: 2 })
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/stores/ember.test.ts`
Expected: FAIL — `lastDone` is undefined.

- [ ] **Step 3: Implement**

In `src/stores/ember.ts`, after `const completions = ref(0)` add:
```ts
  /** Last completed task or step (pop / drop animations); n increments on every completion. */
  const lastDone = ref<{ key: string; n: number } | null>(null)
  let doneSeq = 0
  const signalDone = (key: string) => { lastDone.value = { key, n: ++doneSeq } }
```
In `toggleTask`, after `t.doneOn = completing ? today.value : null` add `if (completing) signalDone(\`task:${id}\`)`.
In `toggleStep`, after `loc.step.doneOn = completing ? today.value : null` add `if (completing) signalDone(\`step:${t.stepId}\`)`.
Add `lastDone,` to the returned object (next to `completions`).

Append to `src/styles/animations.css`:
```css
/* Alternate 0/1 per event so the same element animates again. */
.anim-pop0 { animation: pop0 .45s var(--ease-pop); }
.anim-pop1 { animation: pop1 .45s var(--ease-pop); }
.anim-drop0 { animation: drop0 .55s var(--ease-drop); }
.anim-drop1 { animation: drop1 .55s var(--ease-drop); }
```

`src/components/anim.ts`:
```ts
/** Retriggerable animation classes: alternate between two identical keyframes per event. */
export const popClass = (n: number): string => `anim-pop${n % 2}`
export const dropClass = (n: number): string => `anim-drop${n % 2}`
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add retriggerable animation classes and a completion signal"
```

---

### Task 2: Wire the pop and drop animations

**Files:**
- Modify: `src/components/TaskRow.vue`, `src/components/goals/Roadmap.vue`, `src/components/today/TodayList.vue`, `src/components/activity/HeatMap.vue`, `src/components/activity/DoneWall.vue`
- Test: `src/components/TaskRow.test.ts`, `src/components/goals/Roadmap.test.ts`, `src/components/today/TodayList.test.ts`, `src/components/activity/HeatMap.test.ts`, `src/components/activity/DoneWall.test.ts`

**Interfaces:**
- Consumes: `popClass`, `dropClass`; store `lastDone`, `completions`, `timer.phase`.
- Produces: animation classes on — the task/step checkbox just checked (`lastDone.key` matches, item done); the streak-strip today square and the done-mode heat-map today cell (`lastDone` set); the focus-mode heat-map today cell and the selected step's newest filled session block (`completions > 0` and phase is break); the last brick of the current done-wall week (`lastDone` set, drop).

- [ ] **Step 1: Write the failing tests**

Append to `src/components/TaskRow.test.ts` inside `describe('TaskRow — today', …)`:
```ts
  it('pops the checkbox only when it is checked', async () => {
    const { w } = setup(taskFixture('Review PR'))
    expect(w.find('.check').classes()).not.toContain('anim-pop1')
    await w.find('.check').trigger('click')
    expect(w.find('.check').classes()).toContain('anim-pop1')
    await w.find('.check').trigger('click')
    expect(w.find('.check').classes().some((c) => c.startsWith('anim-pop'))).toBe(false)
  })
```

Append to `src/components/goals/Roadmap.test.ts` inside `describe('Roadmap', …)`:
```ts
  it('pops the step checkbox and retriggers on the next completion', async () => {
    const { w } = setup()
    const row = (i: number) => w.findAll('.step-row')[i]
    await row(1).find('.check').trigger('click')
    expect(row(1).find('.check').classes()).toContain('anim-pop1')
    await row(2).find('.check').trigger('click')
    expect(row(2).find('.check').classes()).toContain('anim-pop0')
    w.unmount()
  })

  it('pops the newest session block when a session finishes', async () => {
    const { w, ember } = setup()
    ember.select(stepRef('D3', 'First charts', 'Line'))
    ember.startPause()
    ember.tick(new Date(2026, 8, 23, 10, 25).getTime())
    await nextTick()
    const lineBlocks = w.findAll('.step-row')[1].findAll('.blk')
    expect(lineBlocks).toHaveLength(3)
    expect(lineBlocks[2].classes()).toContain('anim-pop1')
    expect(lineBlocks[1].classes().some((c) => c.startsWith('anim-pop'))).toBe(false)
    w.unmount()
  })
```

Append to `src/components/today/TodayList.test.ts` inside `describe('TodayList', …)`:
```ts
  it("pops today's streak square on a completion", async () => {
    const w = setup()
    const today = () => w.findAll('.tl-week span')[6]
    expect(today().classes().some((c) => c.startsWith('anim-pop'))).toBe(false)
    await w.findAll('.task-row')[1].find('.check').trigger('click')
    expect(today().classes()).toContain('anim-pop1')
  })
```

Append to `src/components/activity/HeatMap.test.ts` inside `describe('HeatMap', …)`:
```ts
  it('pops the today cell on a finished session (focus) or a completion (done)', async () => {
    const w = setup()
    const ember = useEmberStore()
    const today = () => w.find('.hm-cell.is-today')
    ember.startPause()
    ember.tick(new Date(2026, 8, 23, 10, 25).getTime())
    await nextTick()
    expect(today().classes()).toContain('anim-pop1')
    await w.findAll('.seg-opt input')[1].setValue(true)
    expect(today().classes().some((c) => c.startsWith('anim-pop'))).toBe(false)
    ember.addTask({ title: 'x', when: 'today', deadline: false, goalId: null })
    ember.toggleTask(ember.tasks.at(-1)!.id)
    await nextTick()
    expect(today().classes()).toContain('anim-pop1')
  })
```
and add `import { nextTick } from 'vue'` to that file's imports.

Append to `src/components/activity/DoneWall.test.ts` inside `describe('DoneWall', …)`:
```ts
  it("drops the newest brick into this week's column on a completion", async () => {
    const w = setup()
    const ember = useEmberStore()
    ember.addTask({ title: 'New', when: 'today', deadline: false, goalId: null })
    ember.toggleTask(ember.tasks.at(-1)!.id)
    await nextTick()
    const bricks = w.findAll('.dw-col')[3].findAll('.dw-brick')
    expect(bricks).toHaveLength(4)
    expect(bricks[3].classes()).toContain('anim-drop1')
    expect(bricks[2].classes().some((c) => c.startsWith('anim-drop'))).toBe(false)
  })
```
and add `import { nextTick } from 'vue'` to that file's imports.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/components`
Expected: the five new tests FAIL (no `anim-*` classes).

- [ ] **Step 3: Implement**

`src/components/TaskRow.vue`:
- Add `import { popClass } from './anim'`.
- Add `const justDone = computed(() => done.value && ember.lastDone?.key === \`task:${props.task.id}\`)`.
- On the `.check` button, change `:class` to `[{ 'check-sm': variant === 'upcoming', 'is-done': done }, justDone ? popClass(ember.lastDone!.n) : '']`.

`src/components/goals/Roadmap.vue`:
- Add `import { popClass } from '../anim'`.
- Add:
```ts
const justDone = (stepId: string) => ember.lastDone?.key === `step:${stepId}`
/** The selected step's newest filled block pops when a focus session has just finished. */
const sessionJustEnded = computed(() => ember.completions > 0 && ember.timer.phase === 'break')
const newestBlock = (blocks: string[]) => blocks.reduce((last, b, i) => (b === 'remaining' ? last : i), -1)
```
- On the step `.check` button, change `:class` to `[{ 'is-done': s.done }, s.done && justDone(s.id) ? popClass(ember.lastDone!.n) : '']`.
- On the block `<i>`, change `:class` to ``[`is-${b}`, sessionJustEnded && s.selected && i === newestBlock(s.blocks) ? popClass(ember.completions) : '']``.

`src/components/today/TodayList.vue`:
- Add `import { popClass } from '../anim'`.
- On the strip `<span v-for="d in week">`, change `:class` to `[{ 'is-today': d.isToday }, d.isToday && ember.lastDone ? popClass(ember.lastDone.n) : '']`.

`src/components/activity/HeatMap.vue`:
- Add `import { popClass } from '../anim'`.
- Add:
```ts
/** Today pops on a finished session (focus view) or a completion (done view). */
const todayPop = computed(() => {
  if (ui.heatMode === 'focus') return ember.completions > 0 && ember.timer.phase === 'break' ? popClass(ember.completions) : ''
  return ember.lastDone ? popClass(ember.lastDone.n) : ''
})
```
- On `.hm-cell`, change `:class` to `[{ 'is-today': c.isToday, 'is-future': c.future && ember.settings.showFuture }, c.isToday ? todayPop : '']`.

`src/components/activity/DoneWall.vue`:
- Add `import { dropClass } from '../anim'`.
- On `.dw-brick`, change `:class` to ``[`is-${b.kind}`, c.current && ember.lastDone && i === c.bricks.length - 1 ? dropClass(ember.lastDone.n) : '']``.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add pop and drop animations"
```

---

### Task 3: Robustness and label fixes (core)

**Files:**
- Modify: `src/core/persist.ts`, `src/core/persist.test.ts`, `src/core/selection.ts`, `src/core/selection.test.ts`, `src/core/activityView.ts`, `src/core/activityView.test.ts`

**Interfaces:**
- Produces: `parseStored` normalises timer (fills missing/invalid fields from `idleTimer`) and settings (unknown `session` → `'25/5'`); `readData`/`loadData`/`saveData` never throw when storage access throws; `describeSelection` says `Task` (not `Task · `) for a goal-less task with an empty tag, and `activityLog` does the same; `activityLog` resolves focus-log sources from the target, not by comparing titles; log dates in another year read `Oct 5, 2025`; `doneWall` "Weeks in a row" counts back from last week when this week is still empty.

- [ ] **Step 1: Write the failing tests**

Append to `src/core/persist.test.ts` inside `describe('persistence', …)`:
```ts
  it('normalises old or hand-edited timer and settings', () => {
    const data = dataFixture()
    const { lengthSec: _l, ...oldTimer } = data.timer
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, data: { ...data, timer: oldTimer, settings: { ...data.settings, session: '30/5' } } }))
    const loaded = loadData()!
    expect(loaded.timer.lengthSec).toBe(1500)
    expect(loaded.settings.session).toBe('25/5')
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, data: { ...data, timer: { ...data.timer, speed: 'fast' } } }))
    expect(loadData()!.timer).toEqual(data.timer)
  })

  it('survives storage that throws', () => {
    const denied = {
      getItem: () => { throw new Error('SecurityError') },
      setItem: () => { throw new Error('SecurityError') },
    } as unknown as Storage
    expect(readData(denied)).toEqual({ status: 'empty' })
    expect(() => saveData(dataFixture(), denied)).not.toThrow()
  })
```
and change that file's import to `import { STORAGE_KEY, loadData, readData, saveData } from './persist'`.

Append to `src/core/selection.test.ts` inside `describe('describeSelection', …)`:
```ts
  it('says just "Task" for a task with no goal and no tag', () => {
    const bare = [taskFixture('Bare', { tag: '' })]
    expect(describeSelection(goals, bare, { kind: 'task', taskId: 'Bare' }, new Map()).sub).toBe('Task')
  })
```

Append to `src/core/activityView.test.ts`:
```ts
describe('activity log and wall details', () => {
  it('resolves sources from the target, even for a task called "Unassigned"', () => {
    const odd = [taskFixture('Unassigned', { tag: 'Work' })]
    const [e] = activityLog([], odd, [{ id: 'l', at: 0, date: TODAY, min: 25, target: { kind: 'task', taskId: 'Unassigned' } }], TODAY)
    expect(e).toMatchObject({ text: 'Focused 25m on “Unassigned”', src: 'Task · Work' })
  })

  it('adds the year to dates from another year, and says "Task" for an empty tag', () => {
    const [e] = activityLog([], [taskFixture('Old', { tag: '', doneOn: '2025-10-05' })], [], TODAY)
    expect(e).toMatchObject({ src: 'Task', when: 'Oct 5, 2025' })
  })

  it('counts weeks in a row from last week while this week is still empty', () => {
    const lastTwoWeeks = [taskFixture('a', { doneOn: '2026-09-15' }), taskFixture('b', { doneOn: '2026-09-08' })]
    const wall = doneWall([], lastTwoWeeks, '2026-09-21', 4)
    expect(wall.stats.find((s) => s.label === 'Weeks in a row')?.value).toBe('2')
    expect(wall.stats.find((s) => s.label === 'This week')?.value).toBe('0')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/core`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement**

`src/core/persist.ts`:
- Add imports: `import type { EmberData, SessionLength } from './model'` (replacing the `EmberData`-only type import) and `import { idleTimer } from './timer'`.
- Add above `parseStored`:
```ts
const SESSIONS: SessionLength[] = ['25/5', '50/10']
const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0

/** Fill fields added since the data was saved, and repair hand-edited values that would break the timer. */
function normalize(d: EmberData): EmberData {
  const settings = { ...DEFAULT_SETTINGS, ...d.settings }
  if (!SESSIONS.includes(settings.session)) settings.session = DEFAULT_SETTINGS.session
  const base = idleTimer(settings.session, d.timer.phase === 'break' ? 'break' : 'focus')
  const t = { ...base, ...d.timer }
  const valid = positive(t.lengthSec) && positive(t.speed) && typeof t.leftSec === 'number' && Number.isFinite(t.leftSec)
  return { ...d, settings, timer: valid ? t : base }
}
```
- In `parseStored`, replace `return { ...parsed.data, settings: { ...DEFAULT_SETTINGS, ...parsed.data.settings } }` with `return normalize(parsed.data)`.
- Replace `readData`, `loadData`, `saveData` with:
```ts
/** localStorage, or undefined where touching it throws (blocked storage, sandboxed frames). */
function defaultStorage(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

export function readData(storage: Storage | undefined = defaultStorage()): ReadResult {
  let raw: string | null = null
  try {
    raw = storage?.getItem(STORAGE_KEY) ?? null
  } catch {
    return { status: 'empty' }
  }
  if (!storage || !raw) return { status: 'empty' }
  const data = parseStored(raw)
  return data ? { status: 'ok', data } : { status: 'unreadable', backedUp: backup(storage, raw) }
}

export function loadData(storage: Storage | undefined = defaultStorage()): EmberData | null {
  const r = readData(storage)
  return r.status === 'ok' ? r.data : null
}

export function saveData(data: EmberData, storage: Storage | undefined = defaultStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, data } satisfies Stored))
  } catch {
    // Quota exceeded, private mode or blocked storage: keep running in memory.
  }
}
```

`src/core/selection.ts`: replace ``const head = goal ? `${goal.title} · task` : `Task · ${task.tag}` `` with ``const head = goal ? `${goal.title} · task` : task.tag ? `Task · ${task.tag}` : 'Task'``.

`src/core/activityView.ts`:
- Add `findStep` to the goals import (`import { findStep, goalColor, goalStats } from './goals'`) and `yearOf` is already imported.
- Replace the `when` helper with:
```ts
  const when = (d: ISODate) => {
    if (d === today) return 'Today'
    if (d === yesterday) return 'Yesterday'
    return yearOf(d) === yearOf(today) ? dayLabel(d) : `${dayLabel(d)}, ${yearOf(d)}`
  }
```
- In `taskSource`, replace ``return g ? g.title : `Task · ${t.tag}` `` with ``return g ? g.title : t.tag ? `Task · ${t.tag}` : 'Task'``.
- Replace the body of the `logs.map` callback's source resolution (from `let src = 'No step picked'` through the closing brace of the `if`) with:
```ts
    let src = 'No step picked'
    if (l.target?.kind === 'step') {
      const loc = findStep(goals, l.target)
      if (loc) src = loc.goal.title
    } else if (l.target?.kind === 'task') {
      const taskId = l.target.taskId
      const t = tasks.find((x) => x.id === taskId)
      if (t) src = taskSource(t)
    }
```
- Replace
```ts
  let inARow = 0
  while (inARow < weeks && sizes[inARow] > 0) inARow++
```
with
```ts
  // Like the day streak: an empty current week doesn't break the run yet.
  let inARow = 0
  for (let w = sizes[0] > 0 ? 0 : 1; w < weeks && sizes[w] > 0; w++) inARow++
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix(core): normalise saved data, guard storage, and tidy log and wall labels"
```

---

### Task 4: Interaction and accessibility fixes (UI)

**Files:**
- Modify: `src/composables/useYouTubePlayer.ts`, `src/composables/useYouTubePlayer.test.ts`, `src/components/FocusBar.vue`, `src/components/FocusBar.test.ts`, `src/components/FocusMode.vue`, `src/components/FocusMode.test.ts`, `src/components/FocusPicker.vue`, `src/components/FocusPicker.test.ts`, `src/components/today/AddTask.vue`, `src/components/today/AddTask.test.ts`, `src/components/goals/Roadmap.vue`, `src/components/goals/Roadmap.test.ts`, `src/styles/base.css`

**Interfaces:**
- Produces: YouTube player ignores sound changes until ready, marks its iframe `tabindex="-1"` + `title="Background video"` when ready, and the API loader gives up after 15s (allowing a retry); `.sr-only` utility; focus bar title has `aria-haspopup="dialog"` and a polite live region `.fb-live` announcing a finished session; Focus-mode sound button has `aria-pressed` (true when sound is on); picker Enter ignores IME composition; add-task date keeps the last valid value and moves forward when stale; Roadmap Esc returns focus to the add button, checkbox labels include the milestone, step rows switch to the stacked layout at ≤720px, and milestone titles take their own line at ≤560px.

- [ ] **Step 1: Write the failing tests**

`src/composables/useYouTubePlayer.test.ts`:
- Give the fake player a `getIframe` that returns a real iframe: in `beforeEach`, change the player factory to
```ts
    const p = { mute: vi.fn(), unMute: vi.fn(), playVideo: vi.fn(), destroy: vi.fn(), getIframe: vi.fn(() => frame) }
```
with `const frame = document.createElement('iframe')` created just above it, and add `getIframe` to the `FakePlayer` interface.
- Replace the test `'mutes and unmutes without recreating the player'` with:
```ts
  it('ignores sound changes until the player is ready, then mutes and unmutes without recreating it', async () => {
    const muted = ref(true)
    mount(host(ref('jfKfPfyJRdk'), muted))
    await flushPromises()
    muted.value = false
    await flushPromises()
    expect(players[0].unMute).not.toHaveBeenCalled()
    Player.mock.calls[0][1].events.onReady({ target: players[0] })
    expect(players[0].unMute).toHaveBeenCalledTimes(1)
    muted.value = true
    await flushPromises()
    expect(players[0].mute).toHaveBeenCalledTimes(1)
    expect(Player).toHaveBeenCalledTimes(1)
  })

  it('keeps the iframe out of the tab order once ready', async () => {
    mount(host(ref('jfKfPfyJRdk'), ref(true)))
    await flushPromises()
    Player.mock.calls[0][1].events.onReady({ target: players[0] })
    const frame = players[0].getIframe()
    expect(frame.getAttribute('tabindex')).toBe('-1')
    expect(frame.getAttribute('title')).toBe('Background video')
  })
```
- Append inside `describe('loadYouTubeApi', …)`:
```ts
  it('gives up after 15 seconds so a later call can retry', async () => {
    vi.useFakeTimers()
    delete (window as unknown as { YT?: unknown }).YT
    vi.resetModules()
    const { loadYouTubeApi } = await import('./useYouTubePlayer')
    const first = loadYouTubeApi()
    vi.advanceTimersByTime(15_000)
    await expect(first).rejects.toThrow('timed out')
    loadYouTubeApi().catch(() => {})
    const scripts = [...document.querySelectorAll('script')].filter((s) => s.src === 'https://www.youtube.com/iframe_api')
    expect(scripts).toHaveLength(1)
    scripts.forEach((s) => s.remove())
    vi.useRealTimers()
  })
```

`src/components/FocusBar.test.ts` — append inside `describe('FocusBar', …)`:
```ts
  it('announces a finished session to screen readers and marks the title as opening a dialog', async () => {
    const { w, ember } = setup()
    expect(w.find('.fb-title').attributes('aria-haspopup')).toBe('dialog')
    expect(w.find('.fb-live').attributes('aria-live')).toBe('polite')
    expect(w.find('.fb-live').text()).toBe('')
    await w.find('.fb-start').trigger('click')
    ember.tick(NOW + 25 * 60_000)
    await nextTick()
    expect(w.find('.fb-live').text()).toBe('Session done: +25m · Line')
  })
```

`src/components/FocusMode.test.ts` — inside the test `'toggles sound without reloading the video'`: give the stub a ready player first — after `const { w, ember } = await setup()` add `Player.mock.calls[0][1].events.onReady({ target: players[0] })`, and append before `w.unmount()`:
```ts
    expect(w.find('.fm-sound').attributes('aria-pressed')).toBe('true')
```
(and add `getIframe: vi.fn(() => document.createElement('iframe'))` to the fake player object in this file's `beforeEach`).

`src/components/FocusPicker.test.ts` — append inside `describe('FocusPicker', …)`:
```ts
  it('ignores Enter while an input method is composing', async () => {
    const { w, ember, ui } = setup()
    await w.find('.picker-input').setValue('land')
    await w.find('.picker-input').trigger('keydown', { key: 'Enter', isComposing: true })
    expect(ember.selection).toEqual({ kind: 'task', taskId: 'Review PR' })
    expect(ui.pickerOpen).toBe(true)
  })
```

`src/components/today/AddTask.test.ts` — append inside `describe('AddTask', …)`:
```ts
  it('keeps the last valid date when the field is cleared, and moves a stale date forward', async () => {
    const { w, ember } = setup()
    await when(w, 2)
    const date = w.find('.at-date')
    ;(date.element as HTMLInputElement).value = ''
    await date.trigger('change')
    expect(useUiStore().taskDraft.date).toBe('2026-09-25')
    ember.tick(new Date(2026, 8, 26, 9, 0).getTime())
    await nextTick()
    expect(useUiStore().taskDraft.date).toBe('2026-09-28')
  })
```
and add `import { nextTick } from 'vue'` and `import { useUiStore } from '../../stores/ui'` to that file.

`src/components/goals/Roadmap.test.ts` — append inside `describe('Roadmap', …)`:
```ts
  it('returns focus to the Add step button on Esc, and labels checkboxes with their milestone', async () => {
    const { w } = setup()
    const add = w.find('.rm-add-step')
    await add.trigger('click')
    await w.find('.rm-step-input').trigger('keydown', { key: 'Escape' })
    await nextTick()
    expect(document.activeElement).toBe(w.find('.rm-add-step').element)
    expect(w.findAll('.step-row')[1].find('.check').attributes('aria-label')).toBe('Line, First charts')
    w.unmount()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: the new/changed tests FAIL.

- [ ] **Step 3: Implement**

`src/composables/useYouTubePlayer.ts`:
- Add `getIframe?(): HTMLIFrameElement` to `interface YTPlayer`.
- In `loadYouTubeApi`, inside the promise: start `const timeout = setTimeout(() => { apiPromise = null; script.remove(); reject(new Error('YouTube API timed out')) }, 15_000)` right after creating `script` (declare `script` before the ready callback); in the ready callback call `clearTimeout(timeout)` before resolving; in `script.onerror` call `clearTimeout(timeout)` and `script.remove()` before rejecting.
- In `useYouTubePlayer`: add `let ready = false`; in `destroy()` set `ready = false`; in `onReady` set `ready = true` first and then:
```ts
          const frame = target.getIframe?.()
          frame?.setAttribute('tabindex', '-1')
          frame?.setAttribute('title', 'Background video')
```
- In the `muted` watcher change `if (!player) return` to `if (!player || !ready) return`.

`src/styles/base.css` — append:
```css
/* Visually hidden, still read by screen readers. */
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}
```

`src/components/FocusBar.vue`:
- Add `aria-haspopup="dialog"` to the `.fb-title` button.
- After the toast `<div v-if="showToast" …>`, add:
```vue
    <span class="sr-only fb-live" role="status" aria-live="polite">{{ showToast ? `Session done: ${toastText}` : '' }}</span>
```

`src/components/FocusMode.vue`: add `:aria-pressed="!muted"` to the `.fm-sound` button.

`src/components/FocusPicker.vue`: replace `@keydown.enter.prevent="pickFirst"` with `@keydown.enter.prevent="onEnter"` and add:
```ts
function onEnter(e: KeyboardEvent) {
  if (!e.isComposing) pickFirst()
}
```

`src/components/today/AddTask.vue`:
- Change the vue import to `import { onMounted, watch } from 'vue'`.
- After the `onMounted` block add:
```ts
/** A picked date that has slipped into the past moves forward again. */
watch(() => ember.today, (t) => {
  if (draft.date && draft.date < t) draft.date = addDays(t, 2)
})

/** Clearing the field keeps the last valid date instead of silently filing the task under today. */
function onDate(e: Event) {
  const v = (e.target as HTMLInputElement).value
  if (v) draft.date = v
}
```
- On the date input replace `v-model="draft.date"` with `:value="draft.date" @change="onDate"`.

`src/components/goals/Roadmap.vue`:
- Change the vue import to `import { computed, nextTick, ref, type Directive } from 'vue'`.
- Add `const root = ref<HTMLElement | null>(null)` and:
```ts
/** Esc closes the input and puts focus back on the button that opened it. */
function onEsc() {
  const was = ui.adding
  cancel()
  void nextTick(() => {
    const selector = was?.kind === 'step' ? `[data-add-step="${was.msId}"]` : '.rm-add-ms'
    root.value?.querySelector<HTMLElement>(selector)?.focus()
  })
}
```
- Add `ref="root"` to `<section class="roadmap">`.
- Replace both `@keydown.esc="cancel"` with `@keydown.esc="onEsc"`.
- Add `:data-add-step="r.id"` to the `.rm-add-step` button.
- Change the step checkbox's `:aria-label="s.title"` to ``:aria-label="`${s.title}, ${r.title}`"``.
- Change `@media (max-width: 560px) {` to `@media (max-width: 720px) {` and add after that block:
```css
@media (max-width: 560px) {
  .rm-title { flex-basis: 100%; }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix: polish keyboard, screen-reader and player edge cases"
```

---

### Task 5: Side-by-side comparison with the prototype

**Files:**
- Modify: whichever component a difference lives in (CSS/copy only)

**Interfaces:** none.

- [ ] **Step 1: Serve both**

```bash
npx vite --port 5173 --strictPort &           # Ember
npx vite docs/design/reference --port 5174 --strictPort &   # prototype (open /Ember.dc.html)
```

- [ ] **Step 2: Compare at 1280×900 in the Playwright browser**

For each pair, screenshot both and compare — nav + focus bar (idle, focusing, break with toast), Today, Goals (D3), Activity (focus and done), picker, Focus mode. Check per element: font size/weight, spacing (8/12/16/24/32), 2px vs 1px rules, colours from tokens, copy, icon size/stroke, alignment, flush-left labels. Ignore: the date (prototype pins 23 Sep 2026), data volume (real/seeded history vs fake arrays), and every deliberate decision listed in the phase plans (seg checked = ink, real-data done wall, log order, narrow layouts).

- [ ] **Step 3: Fix each difference**

For each visual difference: change the owning component's CSS or copy, add one ledger line `Task 5: Ruling: <difference> — <fix>`, and re-check. Behaviour differences that aren't covered by a phase decision go to the report instead of being changed.

- [ ] **Step 4: Verify**

Run: `npm test && npm run build`
Expected: all pass. Re-screenshot the fixed views; console clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "style: match the prototype more closely"
```

---

### Task 6: Build report

**Files:**
- Create: `docs/design/build-report.md`

- [ ] **Step 1: Write the report** with these sections, filled from the phase plans' "Decisions" sections, the phase-final messages, this phase's ledger and the Task 5 findings:

1. **What was built** — one paragraph per tab plus shell and Focus mode; stack (Vue 3 + Pinia instead of the brief's React/Zustand, by request); test count.
2. **Couldn't match / known differences** — default Focus-mode video (live stream) may show "Video unavailable"; YouTube's title shows faintly through the scrim (`controls=0` no longer hides it); seg checked = ink (README) vs accent (prototype CSS); done wall taller with real history; anything else Task 5 found.
3. **"Not designed yet" — calls made** — editing/deleting tasks, steps, milestones and goals: not built; reordering: not built; editing a step's estimate: not built (new steps default to 50m); custom focus/break lengths beyond 25/5 and 50/10: not built, `settings.session` supports the two; deeper task↔goal integration: tasks link to a goal (colour + name, shown on the goal's tasks list), task time doesn't count toward goal time.
4. **Other decisions** — every bullet from the phase plans' "Decisions taken" sections, grouped by area (data/seed, Today, Goals, Activity, Focus mode, layout on phones).
5. **Deferred minor issues** — every remaining `minor (deferred)` item from all phases that Tasks 3–4 didn't fix.
6. **Suggested next steps** — settings UI (session length, show future days, wall weeks, demo), edit/delete, data export/import, PWA install.

- [ ] **Step 2: Commit**

```bash
git add docs/design/build-report.md
git commit -m "docs: add the Ember build report"
```
