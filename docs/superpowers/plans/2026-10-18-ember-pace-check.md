# Pace Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each goal forecasts when you'll finish at your pace (and at your habit), says whether you're on track for an optional finish-by date, counts milestones without steps, and corrects for how your estimates usually turn out.

**Architecture:** Two optional fields (`Goal.finishBy`, `Milestone.estMin`), repaired on load and synced as their records' own fields. All maths is in a new pure `src/core/pace.ts`. `goalLedger`, `roadmap` and `goalList` in `core/goalView.ts` use it. The store gets two setters. The UI adds a `PaceSection` on the goal page, milestone estimates in the roadmap, and a "behind" note in the goal list.

**Tech Stack:** Vue 3 `<script setup>` + TypeScript + Pinia, plain CSS tokens, Vitest + jsdom + @vue/test-utils.

**Spec:** `docs/superpowers/specs/2026-10-18-ember-pace-check-design.md`

## Global Constraints

- `src/core/` imports no `vue`/`pinia`. `core/pace.ts` may import `./dates`, `./format`, `./goals`, `./habits` and `./model`, but not `./goalView` (goalView imports pace).
- **Correction:** 3 or more finished steps with focus time; ratio clamped to 0.5–2; ±5% counts as "on target".
- **Pace window:** today − 27 … today, divided by 4.
- **Guess:** the average planned milestone size, rounded to 5 minutes, or 240.
- **Milestone estimate:** 30–6000 minutes, entered in hours with step 0.5.
- **Copy:**
  - `'You usually take 30% longer'`, `'You usually take 20% less time'`, `'Your estimates are about right'`;
  - `'+30%'`, `'−20%'` (a real minus sign), `'on target'`, `'—'`;
  - `'50m a week · last 4 weeks'`, `'No focus on its steps in the last 4 weeks'`;
  - `'~Dec 19'`, `'~Jan 15, 2027'`, `'incl. ~6h 56m unplanned'`, `'36m a week'`;
  - verdicts `'ahead' | 'on track' | 'behind' | 'past due'`;
  - `'~4h guess'`, `'~2h'`;
  - `'Paused — no forecast'`.
- **Visual rules:** red (accent-700) only for "behind" and "past due"; zero radius; 2px/1px rules.
- **Commands:** `npx vitest run <file>`, `npm test`, `npm run typecheck`, `npm run build`.

## Review Focus

1. **A goal with no recent step focus:** no date, never `Infinity` or "Invalid Date". A finish-by date then shows only what you'd need (Task 2 test).
2. **A brand-new goal whose only milestone has no steps:** it shows a guess (`~4h`), not 0 (Task 2 ledger test).
3. **Focus logged on tasks linked to the goal:** it doesn't speed up the forecast (Task 2 pace test).
4. **A finish-by date today or in the past:** today with work left is not past due, the day after is, and there's no need figure when past due (Task 2 verdict test).
5. **Clearing a milestone estimate or the finish-by date:** the field is removed, not stored as 0 or an empty string (Task 3 test).

---

### Task 1: Data and repair

**Files:** modify `src/core/model.ts`, `src/core/goals.ts`; test `src/core/goals.test.ts`.

**Interfaces — produces:** `Goal.finishBy?: ISODate | null`, `Milestone.estMin?: number | null`. `repairGoal` drops an invalid `finishBy` and an invalid milestone `estMin`, and returns the same object when the goal is valid.

- [ ] **Step 1: Failing test** in `goals.test.ts` (goal status describe):

```ts
  it('drops an invalid finish-by date and invalid milestone estimates, keeping valid goals as they are', () => {
    const ok = { ...goalFixture('G', [['M', []]]), finishBy: '2026-12-01' }
    ok.milestones[0].estMin = 120
    expect(repairGoal(ok)).toBe(ok)
    const bad = { ...goalFixture('G', [['M', []], ['N', []]]), finishBy: 'soon' }
    bad.milestones[0].estMin = 7
    bad.milestones[1].estMin = 90
    const r = repairGoal(bad)
    expect(r).not.toHaveProperty('finishBy')
    expect(r.milestones[0]).not.toHaveProperty('estMin')
    expect(r.milestones[1].estMin).toBe(90)
  })
```

- [ ] **Step 2: Run** `npx vitest run src/core/goals.test.ts`. Expect FAIL (`finishBy` is kept).

- [ ] **Step 3: Implement.**
  - **`model.ts`:** `Milestone` gets `/** Rough estimate in minutes, used only while it has no steps. */ estMin?: number | null`. `Goal` gets `/** Optional finish-by date (pace check). */ finishBy?: ISODate | null`.
  - **`goals.ts`:** add the function below, and call it in `repairGoal` as `const s = repairPlan(repairStatus(g))` before the habit step.

```ts
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const okEst = (n: unknown): boolean => n == null || (Number.isInteger(n) && (n as number) >= 30 && (n as number) <= 6000)

/** Drops an invalid finish-by date and invalid milestone estimates; a valid goal comes back as the same object. */
function repairPlan(g: Goal): Goal {
  const badFinish = g.finishBy != null && !(typeof g.finishBy === 'string' && ISO_DATE.test(g.finishBy))
  const badMs = g.milestones.some((m) => !okEst(m.estMin))
  if (!badFinish && !badMs) return g
  const milestones = badMs ? g.milestones.map((m) => {
    if (okEst(m.estMin)) return m
    const { estMin: _e, ...rest } = m
    return rest
  }) : g.milestones
  const { finishBy: _f, ...rest } = g
  return badFinish ? { ...rest, milestones } : { ...g, milestones }
}
```

- [ ] **Step 4: Run** `npx vitest run src/core/goals.test.ts` and `npm run typecheck`. Expect PASS.
- [ ] **Step 5: Commit** "feat: finish-by date on goals and rough estimates on milestones, repaired on load".

### Task 2: Pace maths and the ledger, roadmap and list models

**Files:**
- Create `src/core/pace.ts`, `src/core/pace.test.ts`.
- Modify `src/core/goalView.ts`, `src/core/goalView.test.ts`.

**Interfaces:**
- **Produces in `pace.ts`:**
  - `interface Correction { ratio: number; applied: boolean; short: string; text: string }` and `correction(g: Goal, spent: Map<string, number>): Correction`
  - `milestoneEstimate(g: Goal, m: Milestone): { min: number; guess: boolean } | null`
  - `leftToGo(g: Goal, spent: Map<string, number>): { min: number; unplannedMin: number }`
  - `stepPacePerWeek(g: Goal, logs: FocusLog[], today: ISODate): number`
  - `forecastDate(leftMin: number, perWeek: number, today: ISODate): ISODate | null`
  - `type Verdict = 'ahead' | 'on track' | 'behind' | 'past due'`, `verdict(forecast: ISODate | null, finishBy: ISODate, leftMin: number, today: ISODate): Verdict | null` and `needPerWeek(leftMin: number, finishBy: ISODate, today: ISODate): number | null`
  - `interface PaceView { paused: boolean; left: string; unplanned: string; correction: string; pace: string; atPace: string | null; atHabit: string | null; finishBy: { date: ISODate; text: string; verdict: Verdict | null; need: string } | null; behind: boolean }` and `paceView(g: Goal, logs: FocusLog[], spent: Map<string, number>, today: ISODate): PaceView | null`
- **Changes in `goalView.ts`:**
  - `GoalLedger` becomes `{ focused; estimated; left; estimates }`, replacing `accuracy`.
  - `MilestoneRow` gains `estimate: { text: string; guess: boolean } | null`.
  - `GoalListItem` gains `behind: boolean`, and `goalList(goals, spent, behind: Set<string> = new Set())`.

- [ ] **Step 1: Failing tests.** Create `src/core/pace.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { correction, forecastDate, leftToGo, milestoneEstimate, needPerWeek, paceView, stepPacePerWeek, verdict } from './pace'
import type { Goal } from './model'
import { goalFixture, logFixture, stepRef } from './test-fixtures'

const TODAY = '2026-10-14'
function plan(): Goal {
  const g = goalFixture('P', [['M1', [['A', '2026-10-01'], ['B', '2026-10-02'], ['C', '2026-10-03'], ['D', null]]], ['M2', []], ['M3', []]])
  g.milestones[2].estMin = 120
  return g
}
const spent = new Map([['step:P/M1/A', 65], ['step:P/M1/B', 65], ['step:P/M1/C', 65], ['step:P/M1/D', 10]])
const logs = [
  logFixture('2026-09-17', stepRef('P', 'M1', 'A'), 60),
  logFixture('2026-10-01', stepRef('P', 'M1', 'B'), 100),
  logFixture('2026-10-14', stepRef('P', 'M1', 'D'), 40),
  logFixture('2026-09-16', stepRef('P', 'M1', 'A'), 500),
  logFixture('2026-10-10', { kind: 'task', taskId: 'Linked' }, 200),
]

describe('correction', () => {
  const three = (min: number) => new Map([['step:P/M1/A', min], ['step:P/M1/B', min], ['step:P/M1/C', min]])
  it('needs three finished steps with focus time', () => {
    expect(correction(plan(), new Map([['step:P/M1/A', 65], ['step:P/M1/B', 65]]))).toEqual({ ratio: 1, applied: false, short: '—', text: '' })
  })
  it('says which way your estimates go, within limits', () => {
    expect(correction(plan(), spent)).toEqual({ ratio: 1.3, applied: true, short: '+30%', text: 'You usually take 30% longer' })
    expect(correction(plan(), three(40))).toMatchObject({ ratio: 0.8, short: '−20%', text: 'You usually take 20% less time' })
    expect(correction(plan(), three(52))).toMatchObject({ short: 'on target', text: 'Your estimates are about right' })
    expect(correction(plan(), three(200)).ratio).toBe(2)
    expect(correction(plan(), three(10)).ratio).toBe(0.5)
  })
})

describe('what is left', () => {
  it('guesses unplanned milestones from planned ones, or uses your estimate', () => {
    const g = plan()
    expect(milestoneEstimate(g, g.milestones[0])).toBeNull()
    expect(milestoneEstimate(g, g.milestones[1])).toEqual({ min: 200, guess: true })
    expect(milestoneEstimate(g, g.milestones[2])).toEqual({ min: 120, guess: false })
    const fresh = goalFixture('N', [['Getting started', []]])
    expect(milestoneEstimate(fresh, fresh.milestones[0])).toEqual({ min: 240, guess: true })
  })
  it('scales open steps and unplanned milestones by your correction', () => {
    expect(leftToGo(plan(), spent)).toEqual({ min: 471, unplannedMin: 416 })
  })
})

describe('pace and forecast', () => {
  it('averages step focus over the last 4 weeks, ignoring linked tasks', () => {
    expect(stepPacePerWeek(plan(), logs, TODAY)).toBe(50)
  })
  it('forecasts a date, or none without pace', () => {
    expect(forecastDate(471, 50, TODAY)).toBe('2026-12-19')
    expect(forecastDate(0, 0, TODAY)).toBe(TODAY)
    expect(forecastDate(471, 0, TODAY)).toBeNull()
  })
  it('judges a finish-by date', () => {
    expect(verdict('2026-12-19', '2027-01-15', 471, TODAY)).toBe('ahead')
    expect(verdict('2026-12-19', '2026-12-25', 471, TODAY)).toBe('on track')
    expect(verdict('2026-12-19', '2026-12-01', 471, TODAY)).toBe('behind')
    expect(verdict(null, '2026-12-01', 471, TODAY)).toBeNull()
    expect(verdict('2026-12-19', TODAY, 471, TODAY)).toBe('behind')
    expect(verdict('2026-12-19', '2026-10-13', 471, TODAY)).toBe('past due')
    expect(needPerWeek(471, '2027-01-15', TODAY)).toBe(36)
    expect(needPerWeek(471, '2026-12-01', TODAY)).toBe(69)
    expect(needPerWeek(471, TODAY, TODAY)).toBeNull()
  })
})

describe('paceView', () => {
  it('puts it all in words', () => {
    const g = { ...plan(), finishBy: '2027-01-15', habit: { targets: [{ minutes: 25, daysPerWeek: 3, from: '2026-09-28' }], pauses: [] } }
    expect(paceView(g, logs, spent, TODAY)).toEqual({
      paused: false, left: '~7h 51m', unplanned: 'incl. ~6h 56m unplanned', correction: 'You usually take 30% longer',
      pace: '50m a week · last 4 weeks', atPace: '~Dec 19', atHabit: '~Nov 27',
      finishBy: { date: '2027-01-15', text: 'Jan 15, 2027', verdict: 'ahead', need: '36m a week' }, behind: false,
    })
  })
  it('marks behind and past due, and has no date without recent focus', () => {
    expect(paceView({ ...plan(), finishBy: '2026-12-01' }, logs, spent, TODAY)).toMatchObject({ behind: true, finishBy: { verdict: 'behind', need: '1h 9m a week' } })
    expect(paceView({ ...plan(), finishBy: '2026-10-01' }, logs, spent, TODAY)).toMatchObject({ behind: true, finishBy: { verdict: 'past due', need: '' } })
    const quiet = paceView({ ...plan(), finishBy: '2027-01-15' }, [], spent, TODAY)!
    expect(quiet).toMatchObject({ atPace: null, pace: 'No focus on its steps in the last 4 weeks', behind: false, finishBy: { verdict: null, need: '36m a week' } })
  })
  it('is paused for a paused goal and absent for an achieved one', () => {
    expect(paceView({ ...plan(), status: 'paused' }, logs, spent, TODAY)!.paused).toBe(true)
    expect(paceView({ ...plan(), status: 'achieved', achievedOn: TODAY }, logs, spent, TODAY)).toBeNull()
  })
})
```

In `goalView.test.ts`:
- Change the ledger expectations to:
  - `expect(goalLedger(goal, spent)).toEqual({ focused: '2h 5m', estimated: '4h 10m', left: '1h 40m', estimates: '—' })`
  - for the empty goal: `{ focused: '0m', estimated: '0m', left: '~4h', estimates: '—' }`
- Add:

```ts
  it('shows unplanned milestone estimates in the roadmap and flags behind goals in the list', () => {
    const g = goalFixture('G', [['Planned', [['A', null]]], ['Later', []]])
    const rows = roadmap(g, spent, spentToday, null)
    expect(rows[0].estimate).toBeNull()
    expect(rows[1].estimate).toEqual({ text: '~50m guess', guess: true })
    g.milestones[1].estMin = 120
    expect(roadmap(g, spent, spentToday, null)[1].estimate).toEqual({ text: '~2h', guess: false })
    const items = goalList([g, goalFixture('H', [])], spent, new Set(['G']))[0].items
    expect(items.map((i) => i.behind)).toEqual([true, false])
  })
```

- [ ] **Step 2: Run** `npx vitest run src/core/pace.test.ts src/core/goalView.test.ts`. Expect FAIL.

- [ ] **Step 3: Implement** `src/core/pace.ts`:

```ts
import { addDays, dayLabel, diffDays, yearOf, type ISODate } from './dates'
import { fmtM } from './format'
import { goalStatus, liveMilestones, liveSteps } from './goals'
import { liveHabit } from './habits'
import type { FocusLog, Goal, Milestone, Step } from './model'

const stepMin = (spent: Map<string, number>, s: Step): number => spent.get(`step:${s.id}`) ?? 0
const allSteps = (g: Goal): Step[] => liveMilestones(g).flatMap(liveSteps)

export interface Correction { ratio: number; applied: boolean; short: string; text: string }

/** How your finished steps compared with their estimates (3+ steps with focus time; 0.5×–2×). */
export function correction(g: Goal, spent: Map<string, number>): Correction {
  const done = allSteps(g).filter((s) => s.doneOn != null && stepMin(spent, s) > 0)
  if (done.length < 3) return { ratio: 1, applied: false, short: '—', text: '' }
  const est = done.reduce((a, s) => a + s.estMin, 0)
  const actual = done.reduce((a, s) => a + stepMin(spent, s), 0)
  const ratio = Math.round(Math.min(2, Math.max(0.5, actual / est)) * 100) / 100
  const pct = Math.round((ratio - 1) * 100)
  if (Math.abs(pct) <= 5) return { ratio, applied: true, short: 'on target', text: 'Your estimates are about right' }
  return pct > 0
    ? { ratio, applied: true, short: `+${pct}%`, text: `You usually take ${pct}% longer` }
    : { ratio, applied: true, short: `−${-pct}%`, text: `You usually take ${-pct}% less time` }
}

const DEFAULT_MILESTONE = 240

/** A milestone without steps: your rough estimate, else the average planned milestone here, else 4h. Null once it has steps. */
export function milestoneEstimate(g: Goal, m: Milestone): { min: number; guess: boolean } | null {
  if (liveSteps(m).length) return null
  if (m.estMin != null) return { min: m.estMin, guess: false }
  const planned = liveMilestones(g).filter((x) => liveSteps(x).length)
  if (!planned.length) return { min: DEFAULT_MILESTONE, guess: true }
  const avg = planned.reduce((a, x) => a + liveSteps(x).reduce((b, s) => b + s.estMin, 0), 0) / planned.length
  return { min: Math.round(avg / 5) * 5, guess: true }
}

/** Minutes still to go, corrected; unplannedMin is the part from milestones without steps. */
export function leftToGo(g: Goal, spent: Map<string, number>): { min: number; unplannedMin: number } {
  const { ratio } = correction(g, spent)
  let min = 0
  let unplanned = 0
  for (const m of liveMilestones(g)) {
    const e = milestoneEstimate(g, m)
    if (e) {
      unplanned += e.min * ratio
      continue
    }
    for (const s of liveSteps(m)) if (s.doneOn == null) min += Math.max(0, s.estMin * ratio - stepMin(spent, s))
  }
  return { min: Math.round(min + unplanned), unplannedMin: Math.round(unplanned) }
}

/** Focus minutes a week on the goal's steps, over the last 28 days (linked tasks don't count). */
export function stepPacePerWeek(g: Goal, logs: FocusLog[], today: ISODate): number {
  const from = addDays(today, -27)
  let sum = 0
  for (const l of logs) {
    if (l.target?.kind === 'step' && l.target.goalId === g.id && l.date >= from && l.date <= today) sum += l.min
  }
  return sum / 4
}

export function forecastDate(leftMin: number, perWeek: number, today: ISODate): ISODate | null {
  if (leftMin <= 0) return today
  if (!(perWeek > 0)) return null
  return addDays(today, Math.ceil(leftMin / (perWeek / 7)))
}

export type Verdict = 'ahead' | 'on track' | 'behind' | 'past due'

export function verdict(forecast: ISODate | null, finishBy: ISODate, leftMin: number, today: ISODate): Verdict | null {
  if (leftMin > 0 && today > finishBy) return 'past due'
  if (!forecast) return null
  if (forecast <= addDays(finishBy, -14)) return 'ahead'
  return forecast <= finishBy ? 'on track' : 'behind'
}

/** Minutes a week needed to finish by the date; null when there's no time left or nothing left to do. */
export function needPerWeek(leftMin: number, finishBy: ISODate, today: ISODate): number | null {
  const days = diffDays(finishBy, today)
  if (days <= 0 || leftMin <= 0) return null
  return Math.ceil(leftMin / (days / 7))
}

export interface PaceView {
  paused: boolean
  left: string
  unplanned: string
  correction: string
  pace: string
  atPace: string | null
  atHabit: string | null
  finishBy: { date: ISODate; text: string; verdict: Verdict | null; need: string } | null
  behind: boolean
}

const when = (d: ISODate, today: ISODate): string => (yearOf(d) === yearOf(today) ? dayLabel(d) : `${dayLabel(d)}, ${yearOf(d)}`)

/** The goal page's Pace section in words; null for achieved goals. */
export function paceView(g: Goal, logs: FocusLog[], spent: Map<string, number>, today: ISODate): PaceView | null {
  const status = goalStatus(g)
  if (status === 'achieved') return null
  const left = leftToGo(g, spent)
  const perWeek = stepPacePerWeek(g, logs, today)
  const at = forecastDate(left.min, perWeek, today)
  const h = liveHabit(g)
  const target = h?.targets[h.targets.length - 1]
  const atH = target ? forecastDate(left.min, target.minutes * target.daysPerWeek, today) : null
  let finishBy: PaceView['finishBy'] = null
  if (g.finishBy) {
    const v = verdict(at, g.finishBy, left.min, today)
    const need = v === 'past due' ? null : needPerWeek(left.min, g.finishBy, today)
    finishBy = { date: g.finishBy, text: when(g.finishBy, today), verdict: v, need: need ? `${fmtM(need)} a week` : '' }
  }
  return {
    paused: status === 'paused',
    left: `~${fmtM(left.min)}`,
    unplanned: left.unplannedMin ? `incl. ~${fmtM(left.unplannedMin)} unplanned` : '',
    correction: correction(g, spent).text,
    pace: perWeek > 0 ? `${fmtM(perWeek)} a week · last 4 weeks` : 'No focus on its steps in the last 4 weeks',
    atPace: at ? `~${when(at, today)}` : null,
    atHabit: atH ? `~${when(atH, today)}` : null,
    finishBy,
    behind: finishBy?.verdict === 'behind' || finishBy?.verdict === 'past due',
  }
}
```

**Note on the verdict:** `verdict('2026-12-19', TODAY, 471, TODAY)` is `'behind'`, because a finish-by date of today is not yet past due. `verdict(…, '2026-10-13', …)` is `'past due'`.

In `goalView.ts` (import `correction, leftToGo, milestoneEstimate` from `./pace`):
- **`GoalLedger`:** becomes `{ focused: string; estimated: string; left: string; estimates: string }`. In `goalLedger`:

```ts
  const left = leftToGo(g, spent)
  const corr = correction(g, spent)
  return {
    focused: fmtM(sumMin(steps, spent)),
    estimated: fmtM(sumEst(steps)),
    left: `${corr.applied || left.unplannedMin ? '~' : ''}${fmtM(left.min)}`,
    estimates: corr.short,
  }
```

  Then remove the now-unused `open`, `done`, `doneEst`, `doneMin` and `hi` locals.
- **`MilestoneRow`:** add `estimate: { text: string; guess: boolean } | null`. In `roadmap`, compute `const e = milestoneEstimate(g, m)` and set `estimate: e ? { text: e.guess ? \`~${fmtM(e.min)} guess\` : \`~${fmtM(e.min)}\`, guess: e.guess } : null`.
- **`goalList`:** add a parameter `behind: Set<string> = new Set()`. `GoalListItem` gains `behind: boolean`, set to `behind.has(g.id)`.

- [ ] **Step 4: Run** `npx vitest run src/core/pace.test.ts src/core/goalView.test.ts` and `npm run typecheck`. Expect PASS. Fix any component that reads `ledger.accuracy` (GoalSummary, Task 4).
- [ ] **Step 5: Commit** "feat: pace maths: estimate correction, unplanned milestones, pace, forecast and verdicts".

### Task 3: Store setters

**Files:** modify `src/stores/ember.ts`; test `src/stores/ember.test.ts`.

**Interfaces — produces:** `setFinishBy(goalId: string, date: ISODate | null): void` and `setMilestoneEstimate(goalId: string, msId: string, hours: number | null): void`.

- [ ] **Step 1: Failing tests** (today is 2026-09-23):

```ts
describe('pace settings', () => {
  it('sets and clears a finish-by date, ignoring junk', () => {
    const store = storeWith()
    store.setFinishBy('D3', '2026-12-01')
    expect(store.goals[0].finishBy).toBe('2026-12-01')
    store.setFinishBy('D3', 'soon')
    expect(store.goals[0].finishBy).toBe('2026-12-01')
    store.setFinishBy('D3', null)
    expect(store.goals[0]).not.toHaveProperty('finishBy')
  })
  it('sets a milestone estimate in hours, in range, and clears it', () => {
    const store = storeWith()
    const ms = () => store.goals[0].milestones[1]
    store.setMilestoneEstimate('D3', 'D3/Motion', 1.5)
    expect(ms().estMin).toBe(90)
    store.setMilestoneEstimate('D3', 'D3/Motion', 0.1)
    expect(ms().estMin).toBe(30)
    store.setMilestoneEstimate('D3', 'D3/Motion', 200)
    expect(ms().estMin).toBe(6000)
    store.setMilestoneEstimate('D3', 'D3/Motion', null)
    expect(ms()).not.toHaveProperty('estMin')
  })
})
```

- [ ] **Step 2: Run.** Expect FAIL.
- [ ] **Step 3: Implement** after `setOutcome`:

```ts
  // — pace —
  function setFinishBy(goalId: string, date: ISODate | null) {
    const g = goalById(goalId)
    if (!g || !isLive(g)) return
    if (date === null) delete g.finishBy
    else if (/^\d{4}-\d{2}-\d{2}$/.test(date)) g.finishBy = date
  }

  /** Rough hours for a milestone without steps: stored as minutes (multiples of 5, 30–6000); null clears it. */
  function setMilestoneEstimate(goalId: string, msId: string, hours: number | null) {
    const m = goalById(goalId)?.milestones.find((x) => x.id === msId)
    if (!m) return
    if (hours === null || !Number.isFinite(hours)) delete m.estMin
    else m.estMin = Math.min(6000, Math.max(30, Math.round((hours * 60) / 5) * 5))
  }
```

  Return both functions from the store.
- [ ] **Step 4: Run.** Expect PASS.
- [ ] **Step 5: Commit** "feat: set or clear a goal's finish-by date and a milestone's rough estimate".

### Task 4: Goal page: stats strip and Pace section

**Files:**
- Create `src/components/goals/PaceSection.vue`, `src/components/goals/PaceSection.test.ts`.
- Modify `src/components/goals/GoalSummary.vue` and `GoalSummary.test.ts`.

**Interfaces — consumes:** `paceView`, `PaceView` (Task 2); `ember.setFinishBy` (Task 3).

- [ ] **Step 1: Failing tests.**
  - **`GoalSummary.test.ts`:** change the stats expectation to `'Left to go1h 40m', 'Estimates—'`.
  - **`PaceSection.test.ts`:**

```ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Goal } from '../../core/model'
import { dataFixture, goalFixture, logFixture, stepRef } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import PaceSection from './PaceSection.vue'

const goal = (patch: Partial<Goal> = {}): Goal => ({ ...goalFixture('G', [['M', [['A', null], ['B', null]]]]), ...patch })
function setup(g: Goal, logs = [logFixture('2026-10-12', stepRef('G', 'M', 'A'), 50)]) {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  ember.replaceData(dataFixture({ goals: [g], logs }))
  return { w: mount(PaceSection, { props: { goal: ember.goals[0] }, attachTo: document.body }), ember }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 14, 10, 0))
  localStorage.clear()
})
afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('PaceSection', () => {
  it('forecasts at your pace and shows what is left', () => {
    const { w } = setup(goal())
    expect(w.find('.ps-at').text()).toBe('~Dec 9')
    expect(w.find('.ps-pace').text()).toBe('13m a week · last 4 weeks')
    expect(w.find('.ps-left').text()).toBe('~1h 40m')
    expect(w.find('.ps-habit').exists()).toBe(false)
  })

  it('sets a finish-by date and shows the verdict and what you need', async () => {
    const { w, ember } = setup(goal())
    await w.find('.ps-set').trigger('click')
    await w.find('.ps-date').setValue('2026-11-30')
    await w.find('.ps-save').trigger('click')
    expect(ember.goals[0].finishBy).toBe('2026-11-30')
    expect(w.find('.ps-verdict').text()).toBe('behind')
    expect(w.find('.ps-verdict').classes()).toContain('is-bad')
    expect(w.find('.ps-need').text()).toBe('To make it: 15m a week')
  })

  it('clears the date', async () => {
    const { w, ember } = setup(goal({ finishBy: '2026-11-30' }))
    await w.find('.ps-change').trigger('click')
    await w.find('.ps-clear').trigger('click')
    expect(ember.goals[0]).not.toHaveProperty('finishBy')
  })

  it('says paused, and renders nothing for an achieved goal', () => {
    expect(setup(goal({ status: 'paused' })).w.find('.ps-paused').text()).toBe('Paused — no forecast')
    expect(setup(goal({ status: 'achieved', achievedOn: '2026-10-01' })).w.find('.pace-section').exists()).toBe(false)
  })
})
```

  The numbers: A has its 50m spent and B is open, so 100m is left. The pace is 50 ÷ 4 = 12.5, which `fmtM` shows as '13m'. The forecast is `ceil(100 ÷ (12.5 ÷ 7)) = 56` days → Dec 9. Finishing by Nov 30 (47 days away) is behind, and needs `ceil(100 ÷ (47 ÷ 7)) = 15` minutes a week.

- [ ] **Step 2: Run** `npx vitest run src/components/goals/PaceSection.test.ts src/components/goals/GoalSummary.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement** `PaceSection.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Goal } from '../../core/model'
import { paceView } from '../../core/pace'
import { useEmberStore } from '../../stores/ember'

const props = defineProps<{ goal: Goal }>()
const ember = useEmberStore()
const view = computed(() => paceView(props.goal, ember.logs, ember.tally.spent, ember.today))
const editing = ref(false)
const date = ref('')

function open() {
  date.value = props.goal.finishBy ?? ''
  editing.value = true
}
function save() {
  if (date.value) ember.setFinishBy(props.goal.id, date.value)
  editing.value = false
}
function clear() {
  ember.setFinishBy(props.goal.id, null)
  editing.value = false
}
</script>

<template>
  <section v-if="view" class="pace-section" aria-label="Pace">
    <span class="kicker">Pace</span>
    <p v-if="view.paused" class="ps-paused muted">Paused — no forecast</p>
    <dl v-else class="ps-rows">
      <div class="ps-row"><dt>At your pace</dt><dd><b class="ps-at">{{ view.atPace ?? '—' }}</b> <span class="ps-pace">{{ view.pace }}</span></dd></div>
      <div v-if="view.atHabit" class="ps-row ps-habit"><dt>At your habit</dt><dd><b>{{ view.atHabit }}</b></dd></div>
      <div class="ps-row"><dt>Left to go</dt><dd><b class="ps-left">{{ view.left }}</b> <span v-if="view.unplanned" class="ps-sub">{{ view.unplanned }}</span> <span v-if="view.correction" class="ps-sub ps-corr">{{ view.correction }}</span></dd></div>
      <div class="ps-row">
        <dt>Finish by</dt>
        <dd v-if="view.finishBy && !editing">
          <b>{{ view.finishBy.text }}</b>
          <span v-if="view.finishBy.verdict" class="tag ps-verdict" :class="view.behind ? 'is-bad' : 'tag-neutral'">{{ view.finishBy.verdict }}</span>
          <span v-if="view.finishBy.need" class="ps-need">To make it: {{ view.finishBy.need }}</span>
          <button class="btn btn-ghost ps-change" @click="open">Change</button>
        </dd>
        <dd v-else-if="!editing"><button class="btn btn-ghost ps-set" @click="open">Set a finish date</button></dd>
        <dd v-else class="ps-edit">
          <input v-model="date" class="input input-sm ps-date" type="date" aria-label="Finish by" :min="ember.today" />
          <button class="btn btn-primary ps-save" :disabled="!date" @click="save">Save</button>
          <button v-if="goal.finishBy" class="btn btn-ghost ps-clear" @click="clear">Clear</button>
          <button class="btn btn-ghost ps-cancel" @click="editing = false">Cancel</button>
        </dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.pace-section { display: flex; flex-direction: column; gap: var(--space-2); }
.ps-rows { margin: 0; display: flex; flex-direction: column; border-top: 1px solid var(--color-divider); }
.ps-row { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: var(--space-3); align-items: baseline; padding: 6px 0; border-bottom: 1px solid var(--color-divider); font-size: 14px; }
.ps-row dt { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--color-neutral-700); }
.ps-row dd { margin: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px var(--space-3); }
.ps-pace, .ps-sub, .ps-need { font-size: 12px; color: var(--color-neutral-700); }
.ps-verdict.is-bad { background: var(--color-accent-100); color: var(--color-accent-700); font-weight: 700; }
.ps-change, .ps-set { padding-inline: 0; font-size: 13px; }
.ps-edit { gap: var(--space-2); }
@media (max-width: 520px) { .ps-row { grid-template-columns: minmax(0, 1fr); gap: 2px; } }
</style>
```

  In `GoalSummary.vue`: change the stat to `{ label: 'Estimates', value: ledger.value.estimates, accent: false }`, import `PaceSection`, and add `<PaceSection :goal="goal" />` after `<HabitRow :goal="goal" />`.
- [ ] **Step 4: Run** `npx vitest run src/components/goals/`. Expect PASS.
- [ ] **Step 5: Commit** "feat: goal page Pace section: forecast, habit forecast, what's left, finish-by verdict; Estimates replaces Accuracy".

### Task 5: Milestone estimates in the roadmap

**Files:** modify `src/components/goals/Roadmap.vue`; test `src/components/goals/Roadmap.test.ts`.

**Interfaces — consumes:** `MilestoneRow.estimate` (Task 2); `ember.setMilestoneEstimate` (Task 3).

- [ ] **Step 1: Failing test** (use the file's existing mount helper; the goal needs a milestone without steps):

```ts
  it('shows and sets a rough estimate on a milestone without steps', async () => {
    const g = goalFixture('D3', [['Planned', [['A', null]]], ['Later', []]])
    const { w, ember } = mountRoadmap(g)
    const later = w.findAll('.rm-ms')[1]
    expect(later.find('.rm-ledger').text()).toBe('~50m guess')
    await later.find('.rm-est-set').trigger('click')
    await later.find('.rm-est-input').setValue('2')
    await later.find('.rm-est-save').trigger('click')
    expect(ember.goals[0].milestones[1].estMin).toBe(120)
    expect(w.findAll('.rm-ms')[1].find('.rm-ledger').text()).toBe('~2h')
  })
```

  If `Roadmap.test.ts` names its helper differently, use that helper with this goal.
- [ ] **Step 2: Run.** Expect FAIL.
- [ ] **Step 3: Implement** in `Roadmap.vue`:
  - Add `const estimating = ref<string | null>(null)` and `const estHours = ref<string | number>('')`.
  - Add `function openEst(r: MilestoneRow) { estHours.value = r.estimate ? String(...) : '' }`, using the minutes from the goal's milestone ÷ 60.
  - Add `saveEst(r)`, which calls `ember.setMilestoneEstimate(props.goal.id, r.id, Number(estHours.value))`, and `clearEst(r)`, which passes `null`.
  - **Template:** replace `<span class="rm-ledger">{{ r.ledger }}</span>` with `<span class="rm-ledger">{{ r.estimate ? r.estimate.text : r.ledger }}</span>`.
  - **Under the head row,** when `r.estimate` is set: either a `Set estimate` ghost button (`.rm-est-set`), or an inline row with a number input (`.rm-est-input`, step 0.5, min 0.5, max 100, aria-label "Rough hours") and the buttons Save (`.rm-est-save`), Clear (`.rm-est-clear`, shown when the estimate isn't a guess) and Cancel.
  - The head button sits inside the row header, so the Set estimate button goes outside it to avoid nesting buttons.
- [ ] **Step 4: Run** `npx vitest run src/components/goals/Roadmap.test.ts`. Expect PASS.
- [ ] **Step 5: Commit** "feat: rough estimates for milestones without steps, shown and set in the roadmap".

### Task 6: "Behind" in the goal list

**Files:** modify `src/components/goals/GoalList.vue`; test `src/components/goals/GoalList.test.ts`.

- [ ] **Step 1: Failing test:**

```ts
  it('notes goals that are behind their finish-by date', () => {
    // A goal with a past finish-by date and open steps is past due, so it's behind.
    const w = mountList([{ ...goalFixture('D3', [['M', [['A', null]]]]), finishBy: '2026-09-01' }])
    expect(w.find('.gl-behind').text()).toBe('· behind')
  })
```

  Use the file's own mount helper and data.
- [ ] **Step 2: Run.** Expect FAIL.
- [ ] **Step 3: Implement** in `GoalList.vue`:
  - Import `paceView` and add:

```ts
const behind = computed(() => new Set(ember.goals.filter((g) => paceView(g, ember.logs, ember.tally.spent, ember.today)?.behind).map((g) => g.id)))
const groups = computed(() => goalList(ember.goals, ember.tally.spent, behind.value))
```

  - **Template:** `<span class="gl-meta">{{ g.meta }}<span v-if="g.behind" class="gl-behind"> · behind</span></span>`. The test reads `'· behind'` after trimming.
  - **Style:** `.gl-behind { color: var(--color-accent-700); font-weight: 700; }`.
- [ ] **Step 4: Run.** Expect PASS.
- [ ] **Step 5: Commit** "feat: goal list notes goals behind their finish-by date".

### Task 7: Whole-app check

- [ ] **Step 1:** Run `npm test`, `npm run typecheck` and `npm run build`. All must pass.
- [ ] **Step 2: `CLAUDE.md` Architecture.** Add: "- Pace: `src/core/pace.ts` — estimate correction (3+ finished steps, 0.5–2×), unplanned-milestone guesses, 4-week step pace, forecast and finish-by verdicts; `Goal.finishBy`, `Milestone.estMin` are the only stored fields."
- [ ] **Step 3: Browser check** on port 5299 with demo data:
  - the D3 goal page shows Pace and Estimates;
  - set a finish-by date and see the verdict;
  - set an estimate on an unplanned milestone;
  - the goal list shows "behind" when relevant.
- [ ] **Step 4: Commit** "docs: pace in the architecture notes".
