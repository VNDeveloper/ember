# Plan With Your AI (Markdown Import) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ember copies a ready prompt for any AI chat and reads the markdown reply back, turning it into a new goal, new steps on an existing goal, or a task list. It previews the result first and offers one Undo afterwards.

**Architecture:**
- **One new pure module, `src/core/importPlan.ts`:**
  - parsers (goal, tasks, estimate, habit, kind);
  - paste-back matching and the preview's tick logic;
  - the copy-out writer and the three prompts.
- **The store** gets `importGoal`, `importIntoGoal` and `importTasks`, plus an `'import'` undo kind whose Undo soft-deletes everything the import added.
- **The UI:**
  - `ImportPanel` (copy prompt, paste box, preview, create), `ImportPreview` and `CopyBox` (the clipboard fallback);
  - a small `clipboard.ts` helper;
  - three entry points (Goals sidebar, Roadmap, Today) and a "Copy as markdown" item in the goal menu.
- **No data model change.**

**Tech Stack:** Vue 3 `<script setup>` + TypeScript + Pinia, plain CSS tokens, Vitest + jsdom + @vue/test-utils.

**Spec:** `docs/superpowers/specs/2026-10-19-ember-ai-import-design.md`

## Global Constraints

- **No AI in Ember:** no network calls, no API keys, no chat UI. Ember only copies to the clipboard and parses pasted text locally.
- **Purity:** `src/core/importPlan.ts` imports no `vue` or `pinia`. It may import `./dates`, `./format`, `./goals`, `./habits` and `./model`.
- **Limits:** 50 000 characters, 30 milestones, 300 steps, 100 tasks, titles 200 characters, tags 24 characters.
- **Estimates:**
  - steps round to 5 minutes, clamped 5–480, and default to 50;
  - milestones' own estimates are clamped 30–6000 and used only when the milestone has no steps.
- **Habit:** minutes 5–240, days 1–7, through `clampHabit`.
- **Paste-back only adds:** it matches by `normTitle`; nothing is renamed or removed; a field is filled only when the goal has none.
- **Copy (exact strings):**
  - buttons and labels: `'Copy prompt'`, `'Copied'`, `'Paste the AI's reply'`, `'Create goal'`, `'Add ‹n› steps'`, `'Add ‹n› steps and ‹m› milestones'`, `'Add ‹n› tasks'`, `'Cancel'`;
  - entry points: `'Import a goal'`, `'Add from AI'`, `'Paste tasks'`, `'Copy as markdown'`;
  - undo labels: `'Imported “‹goal›”'`, `'Added ‹…› to “‹goal›”'`, `'Updated “‹goal›”'`, `'Added ‹n› tasks'`;
  - skip reasons as in Task 1 and Task 2.
- **Visual rules:** zero radius; 1px rules between preview rows; red only on the existing primary button; no emoji, gradients or shadows; button labels flush left.
- **Commands:** `npx vitest run <file>`, `npm test`, `npm run typecheck`, `npm run build`. Never use port 5199; use 5299 for the browser check.

## Review Focus

1. **A real AI reply with chatter, code fences, bold labels (`**Outcome:**`) and numbered milestones (`Milestone 1:`, `Phase 2 —`):** everything is read, and none of the chatter becomes a step (Task 1 sample test).
2. **Pasting a goal's own markdown straight back:** nothing is new and every step shows "already there", so nothing is duplicated (Task 3 round-trip test).
3. **Undo after an import into an existing goal:** only the added steps and milestones go, and the goal's own outcome stays (Task 4 test).
4. **A paste of the wrong kind** (a task list in the goal panel, or the reverse): it's refused with a pointer to the right place, never half-imported (Task 5 test).
5. **A blocked clipboard:** the prompt or markdown appears selected in a text box instead of failing silently (Tasks 5 and 6 tests).

---

### Task 1: Core: estimates, habits, titles, kind and the goal parser

**Files:**
- Create: `src/core/importPlan.ts`
- Test: `src/core/importPlan.test.ts`

**Interfaces — produces:**
- **Types:** `ImportKind = 'goal' | 'next' | 'tasks'`, `Skipped { line; text; reason }`, `PlanStep { title; estMin; done; line }`, `PlanMilestone { title; estMin: number | null; steps; line }`, `GoalPlan { title; outcome; finishBy; habit; milestones; skipped }`.
- **Constants:** `LIMITS`, `DEFAULT_STEP_MIN = 50`, `START_MILESTONE = 'Getting started'`.
- **Functions:**
  - `parseEstimate(s): number | null`;
  - `parseHabit(s): { minutes; daysPerWeek } | null`;
  - `stripMarks(s)`, `normTitle(s)`;
  - `detectKind(text): 'goal' | 'tasks' | null`;
  - `parseGoal(text): GoalPlan | null`.
- **Internals** used by Task 2: `splitLines`, `FENCE`, `RULE`, `HEADING`, `BULLET`, `CHECK`, `indentOf`, `cutTitle`, `nested(kind)`.

- [ ] **Step 1: Write the failing tests** in `src/core/importPlan.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { detectKind, normTitle, parseEstimate, parseGoal, parseHabit } from './importPlan'

export const SAMPLE = [
  'Sure! Here is your plan:',
  '',
  '```markdown',
  '# Goal: Speak conversational Spanish',
  '**Outcome:** Hold a 15-minute conversation with a native speaker',
  'Finish by: 2027-01-31',
  'Habit: 25m on 5 days a week',
  '',
  '## Milestone 1: Sounds and greetings',
  '- [x] Learn the alphabet and vowel sounds (45m)',
  '- [ ] Practise 20 greetings out loud (1h)',
  '* Shadow a short dialogue — 30 min',
  '',
  '## Phase 2 — Everyday conversation',
  '1. **Learn** the 100 most common verbs (2h 30m)',
  '2. Order food in a role-play',
  '',
  '## Real conversations (6h)',
  '```',
  '',
  'Good luck — you can do it!',
].join('\n')

describe('parseEstimate', () => {
  it.each([
    ['45m', 45], ['1h', 60], ['1h 30m', 90], ['90 min', 90], ['1.5h', 90], ['~2 hours', 120],
    ['45 minutes', 45], ['1 hour 15 minutes', 75], ['about 20 mins', 20], ['2h30m', 150],
  ])('%s → %i', (s, n) => expect(parseEstimate(s)).toBe(n))
  it.each(['', 'soon', '3', 'optional', '0m'])('%s → null', (s) => expect(parseEstimate(s)).toBeNull())
})

describe('parseHabit', () => {
  it.each([
    ['25m on 5 days a week', 25, 5], ['30 min on 3 days per week', 30, 3], ['20 minutes a day', 20, 7],
    ['15m daily', 15, 7], ['25m every day', 25, 7], ['45m on 1 day a week', 45, 1], ['22m on 4 days a week', 20, 4],
  ])('%s', (s, minutes, daysPerWeek) => expect(parseHabit(s)).toEqual({ minutes, daysPerWeek }))
  it.each(['often', '2m daily', '300m daily', '25m on 9 days a week', '5 days a week'])('%s → null', (s) =>
    expect(parseHabit(s)).toBeNull())
})

describe('normTitle', () => {
  it('ignores case, markers, spacing and trailing punctuation', () => {
    expect(normTitle('  **Learn**   the  Alphabet. ')).toBe('learn the alphabet')
    expect(normTitle('`Verbs`:')).toBe('verbs')
  })
})

describe('detectKind', () => {
  it('tells a goal from a task list by the first heading', () => {
    expect(detectKind('Sure!\n# Tasks\n- a')).toBe('tasks')
    expect(detectKind('## Task list\n- a')).toBe('tasks')
    expect(detectKind('# Goal: Spanish\n## Basics')).toBe('goal')
    expect(detectKind('## Task 1: set up\n- a')).toBe('goal')
    expect(detectKind('- a\n- b')).toBeNull()
  })
})

describe('parseGoal', () => {
  it('reads the title, fields, milestones, steps, estimates and done marks, ignoring the chatter', () => {
    const p = parseGoal(SAMPLE)!
    expect(p.title).toBe('Speak conversational Spanish')
    expect(p.outcome).toBe('Hold a 15-minute conversation with a native speaker')
    expect(p.finishBy).toBe('2027-01-31')
    expect(p.habit).toEqual({ minutes: 25, daysPerWeek: 5 })
    expect(p.milestones.map((m) => [m.title, m.estMin])).toEqual([
      ['Sounds and greetings', null], ['Everyday conversation', null], ['Real conversations', 360],
    ])
    expect(p.milestones[0].steps.map((s) => [s.title, s.estMin, s.done])).toEqual([
      ['Learn the alphabet and vowel sounds', 45, true],
      ['Practise 20 greetings out loud', 60, false],
      ['Shadow a short dialogue', 30, false],
    ])
    expect(p.milestones[1].steps.map((s) => [s.title, s.estMin])).toEqual([
      ['Learn the 100 most common verbs', 150], ['Order food in a role-play', 50],
    ])
    expect(p.skipped).toEqual([])
  })

  it("skips what it can't read and says why", () => {
    const p = parseGoal([
      '# Learn piano', 'Finish by: next spring', 'Habit: often', '## Basics (2h)',
      '- Scales (20m)', '  - C major', '- Scales', `- ${'x'.repeat(250)}`,
    ].join('\n'))!
    expect(p.title).toBe('Learn piano')
    expect(p.finishBy).toBeNull()
    expect(p.habit).toBeNull()
    expect(p.milestones[0].estMin).toBeNull()
    expect(p.milestones[0].steps.map((s) => s.title.length)).toEqual([6, 200])
    expect(p.skipped.map((s) => [s.line, s.reason])).toEqual([
      [2, 'not a date — use YYYY-MM-DD'],
      [3, "couldn't read the habit — use ‘25m on 5 days a week’"],
      [4, 'milestone estimate ignored — it has steps'],
      [6, "sub-points aren't imported — make them steps"],
      [7, 'duplicate step'],
      [8, 'title cut to 200 characters'],
    ])
  })

  it('puts bullets before the first milestone into "Getting started" and clamps estimates', () => {
    const p = parseGoal('# Goal: Draw\n- Buy a sketchbook (2m)\n- Draw every object in the kitchen (12h)\n')!
    expect(p.milestones.map((m) => m.title)).toEqual(['Getting started'])
    expect(p.milestones[0].steps.map((s) => s.estMin)).toEqual([5, 480])
  })

  it('needs a heading; without a # line the title is empty', () => {
    expect(parseGoal('Here are some ideas:\n- one\n- two')).toBeNull()
    const p = parseGoal('## Next phase\n- Read chapter 4 (1h)')!
    expect(p.title).toBe('')
    expect(p.milestones[0].steps[0]).toMatchObject({ title: 'Read chapter 4', estMin: 60 })
  })

  it('stops at the limits', () => {
    const many = parseGoal(['# G', ...Array.from({ length: 32 }, (_, i) => `## M${i}`)].join('\n'))!
    expect(many.milestones).toHaveLength(30)
    expect(many.skipped.map((s) => s.reason)).toEqual(['more than 30 milestones', 'more than 30 milestones'])
    const steps = parseGoal(['# G', '## M', ...Array.from({ length: 301 }, (_, i) => `- s${i}`)].join('\n'))!
    expect(steps.milestones[0].steps).toHaveLength(300)
    expect(steps.skipped.map((s) => s.reason)).toEqual(['more than 300 steps'])
    const long = parseGoal(`# G\n${'x'.repeat(60_000)}`)!
    expect(long.skipped.at(-1)!.reason).toBe('paste cut at 50 000 characters')
  })
})
```

- [ ] **Step 2: Run** `npx vitest run src/core/importPlan.test.ts`.
  Expected: FAIL, because `./importPlan` doesn't exist.

- [ ] **Step 3: Implement** `src/core/importPlan.ts`:

```ts
/** Plan with your AI: the markdown Ember reads back (a goal or a task list), what it writes out, and the prompts. Pure. */
import { isRealDate, type ISODate } from './dates'
import { clampHabit } from './habits'

export type ImportKind = 'goal' | 'next' | 'tasks'
export const LIMITS = { chars: 50_000, milestones: 30, steps: 300, tasks: 100, title: 200, tag: 24 } as const
export const DEFAULT_STEP_MIN = 50
export const START_MILESTONE = 'Getting started'

export interface Skipped { line: number; text: string; reason: string }
export interface PlanStep { title: string; estMin: number; done: boolean; line: number }
export interface PlanMilestone { title: string; estMin: number | null; steps: PlanStep[]; line: number }
export interface GoalPlan {
  title: string
  outcome: string | null
  finishBy: ISODate | null
  habit: { minutes: number; daysPerWeek: number } | null
  milestones: PlanMilestone[]
  skipped: Skipped[]
}

export const FENCE = /^\s*(```|~~~)/
export const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/
export const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/
export const BULLET = /^(\s*)(?:[-*+]|\d{1,3}[.)])\s+(.*)$/
export const CHECK = /^\[([ xX])\]\s*/
const FIELD = /^(?:[-*+]\s+)?(outcome|finish[ -]by|habit)\s*:\s*(.*)$/i
const EST = /^(?:about\s+|~\s*)?(?:(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|hours?))?\s*(?:(\d+)\s*(?:m|min|mins|minutes?))?$/i
const TASKS_HEADING = /^(?:tasks|task list|to-?do list|to-?dos)\b/i

export const indentOf = (s: string): number => s.replace(/\t/g, '    ').length
export const nested = (what: 'steps' | 'tasks'): string => `sub-points aren't imported — make them ${what}`

/** Bold, italic and code markers off. */
export function stripMarks(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*(\S(?:.*?\S)?)\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .trim()
}

/** How titles are compared: case, markers, spacing and trailing . : ; don't count. */
export const normTitle = (s: string): string =>
  stripMarks(s).toLowerCase().replace(/\s+/g, ' ').replace(/[.:;\s]+$/, '').trim()

/** "45m", "1h 30m", "90 min", "1.5h", "~2 hours" → minutes; null when it isn't a duration. */
export function parseEstimate(s: string): number | null {
  const m = EST.exec(s.trim())
  if (!m || (m[1] === undefined && m[2] === undefined)) return null
  const min = (m[1] ? Number(m[1].replace(',', '.')) * 60 : 0) + (m[2] ? Number(m[2]) : 0)
  return min > 0 ? Math.round(min) : null
}

/** "25m on 5 days a week", "20 minutes a day", "15m daily" → a habit target in range, else null. */
export function parseHabit(s: string): { minutes: number; daysPerWeek: number } | null {
  const m = /^(\d+)\s*(?:m|min|mins|minutes?)\b\s*(.*)$/i.exec(stripMarks(s))
  if (!m) return null
  const minutes = Number(m[1])
  const rest = m[2].trim().toLowerCase().replace(/\.$/, '')
  let days: number | null = null
  if (/^(?:a day|daily|every day|each day|per day)$/.test(rest)) days = 7
  else {
    const d = /^(?:on\s+)?(\d)\s*(?:days?|times|x)\s+(?:a|per|each)\s+week$/.exec(rest)
    if (d) days = Number(d[1])
  }
  if (days === null || minutes < 5 || minutes > 240 || days < 1 || days > 7) return null
  return clampHabit(minutes, days)
}

const clampStep = (min: number): number => Math.min(480, Math.max(5, Math.round(min / 5) * 5))
const clampMilestone = (min: number): number => Math.min(6000, Math.max(30, Math.round(min / 5) * 5))

/** A trailing "(45m)" or " — 45m" is the estimate; any other bracket stays in the title. */
function splitEstimate(text: string): { title: string; est: number | null } {
  const br = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(text)
  if (br) {
    const est = parseEstimate(br[2])
    if (est !== null) return { title: br[1].trim(), est }
  }
  const dash = /^(.*\S)\s+[—–-]\s+([^—–-]+)$/.exec(text)
  if (dash) {
    const est = parseEstimate(dash[2])
    if (est !== null) return { title: dash[1].trim(), est }
  }
  return { title: text.trim(), est: null }
}

/** "Milestone 2: Basics", "Phase 1 — Basics", "1. Basics" → "Basics". */
function cleanMilestone(s: string): string {
  const out = s.replace(/^(?:(?:milestone|phase|stage|part|week)\s*\d*\s*[:.—–-]\s*|\d{1,3}[.):]\s+)/i, '').trim()
  return out || s.trim()
}

export function splitLines(input: string): { lines: string[]; cut: Skipped | null } {
  const over = input.length > LIMITS.chars
  const lines = (over ? input.slice(0, LIMITS.chars) : input).split(/\r?\n/)
  return { lines, cut: over ? { line: lines.length, text: '', reason: 'paste cut at 50 000 characters' } : null }
}

export function cutTitle(title: string, line: number, raw: string, skipped: Skipped[]): string {
  if (title.length <= LIMITS.title) return title
  skipped.push({ line, text: raw.trim(), reason: `title cut to ${LIMITS.title} characters` })
  return title.slice(0, LIMITS.title).trimEnd()
}

export function detectKind(input: string): 'goal' | 'tasks' | null {
  for (const raw of splitLines(input).lines) {
    const h = HEADING.exec(raw)
    if (h) return TASKS_HEADING.test(stripMarks(h[2])) ? 'tasks' : 'goal'
  }
  return null
}

/** A goal (or the next part of one). Null when there's no heading, milestone or step at all. */
export function parseGoal(input: string): GoalPlan | null {
  const skipped: Skipped[] = []
  const skip = (line: number, raw: string, reason: string) => skipped.push({ line, text: raw.trim(), reason })
  const { lines, cut } = splitLines(input)
  let title: string | null = null
  let outcome: string | null = null
  let finishBy: ISODate | null = null
  let habit: GoalPlan['habit'] = null
  const milestones: PlanMilestone[] = []
  let cur: PlanMilestone | null = null
  let started = false
  let dropping = false
  let baseIndent = -1
  let stepCount = 0

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const line = i + 1
    if (!raw.trim() || FENCE.test(raw) || RULE.test(raw)) continue
    const h = HEADING.exec(raw)
    if (h) {
      started = true
      const text = stripMarks(h[2])
      const named = /^goal\s*[:—–-]\s*(.+)$/i.exec(text)
      if (title === null && milestones.length === 0 && (h[1].length === 1 || named)) {
        title = cutTitle((named ? named[1] : text).trim(), line, raw, skipped)
        continue
      }
      if (milestones.length >= LIMITS.milestones) {
        skip(line, raw, `more than ${LIMITS.milestones} milestones`)
        dropping = true
        continue
      }
      dropping = false
      const { title: name, est } = splitEstimate(cleanMilestone(text))
      if (!name) continue
      cur = { title: cutTitle(name, line, raw, skipped), estMin: est === null ? null : clampMilestone(est), steps: [], line }
      milestones.push(cur)
      baseIndent = -1
      continue
    }
    if (!started) continue
    if (milestones.length === 0) {
      const f = FIELD.exec(stripMarks(raw))
      if (f) {
        const key = f[1].toLowerCase().replace('-', ' ')
        const value = f[2].trim()
        if (!value) continue
        if (key === 'outcome') outcome = value
        else if (key === 'finish by') {
          const d = /^\d{4}-\d{2}-\d{2}/.exec(value)?.[0]
          if (d && isRealDate(d)) finishBy = d
          else skip(line, raw, 'not a date — use YYYY-MM-DD')
        } else {
          const hb = parseHabit(value)
          if (hb) habit = hb
          else skip(line, raw, "couldn't read the habit — use ‘25m on 5 days a week’")
        }
        continue
      }
    }
    const b = BULLET.exec(raw)
    if (!b) continue // the AI's notes
    const indent = indentOf(b[1])
    if (baseIndent >= 0 && indent > baseIndent + 1) {
      skip(line, raw, nested('steps'))
      continue
    }
    let body = b[2]
    let done = false
    const c = CHECK.exec(body)
    if (c) {
      done = c[1] !== ' '
      body = body.slice(c[0].length)
    }
    const { title: name, est } = splitEstimate(stripMarks(body))
    if (!name) continue
    if (dropping) {
      skip(line, raw, `more than ${LIMITS.milestones} milestones`)
      continue
    }
    if (stepCount >= LIMITS.steps) {
      skip(line, raw, `more than ${LIMITS.steps} steps`)
      continue
    }
    if (!cur) {
      cur = { title: START_MILESTONE, estMin: null, steps: [], line }
      milestones.push(cur)
    }
    if (baseIndent < 0) baseIndent = indent
    const stepTitle = cutTitle(name, line, raw, skipped)
    if (cur.steps.some((s) => normTitle(s.title) === normTitle(stepTitle))) {
      skip(line, raw, 'duplicate step')
      continue
    }
    cur.steps.push({ title: stepTitle, estMin: est === null ? DEFAULT_STEP_MIN : clampStep(est), done, line })
    stepCount++
  }

  for (const m of milestones) {
    if (m.estMin !== null && m.steps.length) {
      skip(m.line, `## ${m.title}`, 'milestone estimate ignored — it has steps')
      m.estMin = null
    }
  }
  if (cut) skipped.push(cut)
  if (title === null && milestones.length === 0) return null
  skipped.sort((a, b) => a.line - b.line)
  return { title: title ?? '', outcome, finishBy, habit, milestones, skipped }
}
```

- [ ] **Step 4: Run** `npx vitest run src/core/importPlan.test.ts`.
  Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/importPlan.ts src/core/importPlan.test.ts
git commit -m "feat: read an AI's goal plan from markdown (milestones, steps, estimates, outcome, finish-by, habit)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Core: the task list parser

**Files:**
- Modify: `src/core/importPlan.ts`
- Test: `src/core/importPlan.test.ts`

**Interfaces:**
- **Consumes** Task 1's internals.
- **Produces:**
  - `TaskPlan { title; date: ISODate | null; deadline; tag; goalId: string | null; line; notes: string[] }`;
  - `parseTasks(text, goals, today): { tasks: TaskPlan[]; skipped: Skipped[] }`.

- [ ] **Step 1: Failing tests.** Add `parseTasks` to the import and `goalFixture` from `./test-fixtures`:

```ts
const TODAY = '2026-09-23'

describe('parseTasks', () => {
  const GOALS = [
    goalFixture('Speak conversational Spanish', [['M', []]]),
    { ...goalFixture('Old', [['M', []]]), deletedOn: '2026-09-01' },
  ]
  const fields = (t: TaskPlan) => ({ title: t.title, date: t.date, deadline: t.deadline, tag: t.tag, goalId: t.goalId, notes: t.notes })

  it('reads each part in any order', () => {
    const { tasks, skipped } = parseTasks([
      '# Tasks',
      '- Book a trial lesson | tomorrow | #Admin | goal: speak conversational spanish',
      '- [ ] Renew passport | deadline | 2026-11-02',
      '- Read about plateaus',
      '- Pay the bill | 2026-09-01 | deadline',
    ].join('\n'), GOALS, TODAY)
    expect(tasks.map(fields)).toEqual([
      { title: 'Book a trial lesson', date: '2026-09-24', deadline: false, tag: 'Admin', goalId: 'Speak conversational Spanish', notes: [] },
      { title: 'Renew passport', date: '2026-11-02', deadline: true, tag: 'Inbox', goalId: null, notes: [] },
      { title: 'Read about plateaus', date: null, deadline: false, tag: 'Inbox', goalId: null, notes: [] },
      { title: 'Pay the bill', date: TODAY, deadline: true, tag: 'Inbox', goalId: null, notes: [] },
    ])
    expect(skipped).toEqual([])
  })

  it('notes what it could not use and skips done and nested items', () => {
    const { tasks, skipped } = parseTasks([
      '- Call mum | someday | deadline',
      '- Water plants | soonish | 2026-02-30',
      '- Plan trip | goal: Old',
      '  - pick dates',
      '- [x] Already sorted',
    ].join('\n'), GOALS, TODAY)
    expect(tasks.map((t) => t.notes)).toEqual([
      ['deadline needs a date'],
      ["didn't understand ‘soonish’", "‘2026-02-30’ isn't a date"],
      ['no goal called ‘Old’ — added without a goal'],
    ])
    expect(tasks[0].deadline).toBe(false)
    expect(skipped.map((s) => [s.line, s.reason])).toEqual([[4, "sub-points aren't imported — make them tasks"], [5, 'already done']])
  })

  it('stops at 100 tasks', () => {
    const { tasks, skipped } = parseTasks(Array.from({ length: 101 }, (_, i) => `- t${i}`).join('\n'), [], TODAY)
    expect(tasks).toHaveLength(100)
    expect(skipped.map((s) => s.reason)).toEqual(['more than 100 tasks'])
  })
})
```

  Also import `type TaskPlan` from `./importPlan`.

- [ ] **Step 2: Run** the file.
  Expected: FAIL, because `parseTasks` isn't exported.

- [ ] **Step 3: Implement.** Add `addDays` to the dates import, `isLive` from `./goals`, and `type Goal` from `./model`. Then:

```ts
export interface TaskPlan {
  title: string; date: ISODate | null; deadline: boolean; tag: string; goalId: string | null; line: number
  notes: string[]
}

/** One task per bullet; the parts after "|" come in any order. A past date becomes today; no date is Someday. */
export function parseTasks(input: string, goals: Goal[], today: ISODate): { tasks: TaskPlan[]; skipped: Skipped[] } {
  const skipped: Skipped[] = []
  const skip = (line: number, raw: string, reason: string) => skipped.push({ line, text: raw.trim(), reason })
  const { lines, cut } = splitLines(input)
  const live = goals.filter(isLive)
  const tasks: TaskPlan[] = []
  let baseIndent = -1
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const line = i + 1
    if (!raw.trim() || FENCE.test(raw) || RULE.test(raw) || HEADING.test(raw)) continue
    const b = BULLET.exec(raw)
    if (!b) continue
    const indent = indentOf(b[1])
    if (baseIndent >= 0 && indent > baseIndent + 1) {
      skip(line, raw, nested('tasks'))
      continue
    }
    if (baseIndent < 0) baseIndent = indent
    let body = b[2]
    const c = CHECK.exec(body)
    if (c) {
      if (c[1] !== ' ') {
        skip(line, raw, 'already done')
        continue
      }
      body = body.slice(c[0].length)
    }
    const [head, ...parts] = body.split('|')
    const name = stripMarks(head)
    if (!name) continue
    if (tasks.length >= LIMITS.tasks) {
      skip(line, raw, `more than ${LIMITS.tasks} tasks`)
      continue
    }
    const task: TaskPlan = { title: cutTitle(name, line, raw, skipped), date: null, deadline: false, tag: 'Inbox', goalId: null, line, notes: [] }
    for (const part of parts.map(stripMarks)) {
      if (!part) continue
      const low = part.toLowerCase()
      if (low === 'today') task.date = today
      else if (low === 'tomorrow') task.date = addDays(today, 1)
      else if (low === 'someday') task.date = null
      else if (/^\d{4}-\d{2}-\d{2}$/.test(part)) {
        if (isRealDate(part)) task.date = part < today ? today : part
        else task.notes.push(`‘${part}’ isn't a date`)
      } else if (low === 'deadline') task.deadline = true
      else if (part.startsWith('#') && part.length > 1) task.tag = part.slice(1).trim().slice(0, LIMITS.tag)
      else if (/^goal\s*:/i.test(part)) {
        const wanted = part.replace(/^goal\s*:\s*/i, '')
        const g = live.find((x) => normTitle(x.title) === normTitle(wanted))
        if (g) task.goalId = g.id
        else task.notes.push(`no goal called ‘${wanted}’ — added without a goal`)
      } else task.notes.push(`didn't understand ‘${part}’`)
    }
    if (task.deadline && task.date === null) {
      task.deadline = false
      task.notes.push('deadline needs a date')
    }
    tasks.push(task)
  }
  if (cut) skipped.push(cut)
  return { tasks, skipped }
}
```

- [ ] **Step 4: Run** the file.
  Expected: PASS.

- [ ] **Step 5: Commit** "feat: read an AI's task list from markdown (date, deadline, tag, goal link)", with the co-author line.

### Task 3: Core: paste-back matching, picks, copy-out and prompts

**Files:**
- Modify: `src/core/importPlan.ts`
- Test: `src/core/importPlan.test.ts`

**Interfaces — produces:**
- **Types:** `FieldMatch = 'fill' | 'kept' | 'none'`, `MilestoneMatch { msId: string | null; steps: ('new' | 'there')[] }`, `PlanMatch { milestones; outcome; finishBy; habit }`, `PickSummary { milestones; steps; minutes; there }`.
- **Matching:** `matchPlan(goal, plan): PlanMatch`.
- **Pick keys:** `msKey(mi)`, `stepKey(mi, si)`, `taskKey(ti)`.
- **Picks:**
  - `defaultPicks(plan, match | null): Set<string>`;
  - `togglePick(picks, key, plan | null, match | null): Set<string>`;
  - `pickSummary(plan, picks, match | null): PickSummary`.
- **Text:** `summaryText(summary, next: boolean): string`, `addedText(steps, milestones): string`.
- **Copy-out and prompts:** `goalMarkdown(goal): string`, `goalPrompt(today)`, `nextStepsPrompt(goal, today)`, `tasksPrompt(goals, today)`.

- [ ] **Step 1: Failing tests.** Add the new names to the import, plus `newHabit` from `./habits`:

```ts
describe('paste-back', () => {
  const spanish = () => ({
    ...goalFixture('Spanish', [['Sounds and greetings', [['Learn the alphabet and vowel sounds', '2026-09-01']]]]),
    outcome: 'Chat for 15 minutes',
  })

  it('matches milestones and steps by title and fills only what the goal lacks', () => {
    const m = matchPlan(spanish(), parseGoal(SAMPLE)!)
    expect(m.milestones.map((x) => x.msId)).toEqual(['Spanish/Sounds and greetings', null, null])
    expect(m.milestones[0].steps).toEqual(['there', 'new', 'new'])
    expect(m.milestones[1].steps).toEqual(['new', 'new'])
    expect([m.outcome, m.finishBy, m.habit]).toEqual(['kept', 'fill', 'fill'])
    expect(matchPlan(spanish(), parseGoal('## Sounds and greetings\n- New one')!).finishBy).toBe('none')
  })

  it('ticks everything new; ticking follows the milestone; "already there" never ticks', () => {
    const plan = parseGoal(SAMPLE)!
    const m = matchPlan(spanish(), plan)
    let picks = defaultPicks(plan, m)
    expect(picks.has(stepKey(0, 0))).toBe(false)
    expect(pickSummary(plan, picks, m)).toEqual({ milestones: 2, steps: 4, minutes: 650, there: 1 })
    expect(summaryText(pickSummary(plan, picks, m), true)).toBe('4 new steps · 2 new milestones · 1 already there')
    picks = togglePick(picks, msKey(1), plan, m)
    expect([...picks].filter((k) => k.startsWith('m1'))).toEqual([])
    picks = togglePick(picks, stepKey(1, 0), plan, m)
    expect(picks.has(msKey(1))).toBe(true)
    expect(picks.has(stepKey(1, 1))).toBe(false)
    expect(togglePick(picks, stepKey(0, 0), plan, m).has(stepKey(0, 0))).toBe(false)
    expect(togglePick(new Set([taskKey(0)]), taskKey(0), null, null).size).toBe(0)
  })

  it('sums a new goal and words what an import adds', () => {
    const plan = parseGoal(SAMPLE)!
    expect(summaryText(pickSummary(plan, defaultPicks(plan, null), null), false)).toBe('3 milestones · 5 steps · ~11h 35m')
    expect(addedText(5, 1)).toBe('5 steps and 1 milestone')
    expect(addedText(1, 0)).toBe('1 step')
    expect(addedText(0, 2)).toBe('2 milestones')
  })
})

describe('copy out and prompts', () => {
  it('writes a goal out and reads back the same, so pasting it back adds nothing', () => {
    const g = goalFixture('Spanish', [['Basics', [['Alphabet', '2026-09-01'], ['Greetings', null], ['Gone', null]]], ['Later', []], ['Dropped', []]])
    g.outcome = 'Chat\nfor 15 minutes'
    g.finishBy = '2027-01-31'
    g.milestones[0].steps[1].estMin = 75
    g.milestones[0].steps[2].deletedOn = TODAY
    g.milestones[1].estMin = 240
    g.milestones[2].deletedOn = TODAY
    g.habit = newHabit(25, 7, TODAY, false)
    const md = goalMarkdown(g)
    expect(md).toBe([
      '# Goal: Spanish', 'Outcome: Chat for 15 minutes', 'Finish by: 2027-01-31', 'Habit: 25m every day',
      '', '## Basics', '- [x] Alphabet (50m)', '- [ ] Greetings (1h 15m)', '', '## Later (~4h)', '',
    ].join('\n'))
    const back = parseGoal(md)!
    expect(back.title).toBe('Spanish')
    expect(back.habit).toEqual({ minutes: 25, daysPerWeek: 7 })
    expect(back.milestones.map((m) => [m.title, m.estMin, m.steps.map((s) => [s.title, s.estMin, s.done])])).toEqual([
      ['Basics', null, [['Alphabet', 50, true], ['Greetings', 75, false]]], ['Later', 240, []],
    ])
    const match = matchPlan(g, back)
    expect(match.milestones.every((x) => x.msId !== null && x.steps.every((s) => s === 'there'))).toBe(true)
    expect(pickSummary(back, defaultPicks(back, match), match)).toMatchObject({ milestones: 0, steps: 0 })
  })

  it('builds prompts with the fill-in line, the rules and today', () => {
    const p = goalPrompt(TODAY)
    expect(p.split('\n')[0]).toBe('My goal: [describe it — what, by when, how much time a week]')
    expect(p).toContain('# Goal: ')
    expect(p).toContain('Today is 2026-09-23.')
    expect(parseGoal(p)!.milestones.length).toBeGreaterThan(0)
    const g = goalFixture('Spanish', [['Basics', [['Alphabet', null]]]])
    const n = nextStepsPrompt(g, TODAY)
    expect(n.split('\n')[0]).toBe('What I want next: [e.g. plan the next phase, or break down milestones without steps]')
    expect(n).toContain(goalMarkdown(g))
    expect(n).toContain('Keep my existing milestones and steps exactly as written')
    const done = { ...goalFixture('Done', []), status: 'achieved' as const }
    const t = tasksPrompt([g, done, { ...goalFixture('Gone', []), deletedOn: TODAY }], TODAY)
    expect(t.split('\n')[0]).toBe('What I need to do: [list or describe it]')
    expect(t).toContain('- Spanish')
    expect(t).not.toContain('Gone')
    expect(t).not.toContain('- Done')
    expect(tasksPrompt([], TODAY)).toContain('leave out "goal:"')
  })
})
```

  The new-goal minutes are 45 + 60 + 30 + 150 + 50 for the steps, plus 360 for the unplanned "Real conversations": 695, which is 11h 35m. In the paste-back case the minutes are 60 + 30 + 150 + 50 + 360 = 650.

- [ ] **Step 2: Run** the file.
  Expected: FAIL (missing exports).

- [ ] **Step 3: Implement.**
  - **Imports:** `fmtM` and `plural` from `./format`; `goalStatus`, `liveMilestones` and `liveSteps` from `./goals`; `liveHabit` and `targetText` from `./habits`.
  - Then:

```ts
// — paste-back —
export type FieldMatch = 'fill' | 'kept' | 'none'
export interface MilestoneMatch { msId: string | null; steps: ('new' | 'there')[] }
export interface PlanMatch { milestones: MilestoneMatch[]; outcome: FieldMatch; finishBy: FieldMatch; habit: FieldMatch }

/** Which plan milestones and steps the goal already has (by title), and which of its fields the paste would fill. */
export function matchPlan(goal: Goal, plan: GoalPlan): PlanMatch {
  const live = liveMilestones(goal)
  const field = (inPaste: boolean, has: boolean): FieldMatch => (!inPaste ? 'none' : has ? 'kept' : 'fill')
  return {
    milestones: plan.milestones.map((pm) => {
      const m = live.find((x) => normTitle(x.title) === normTitle(pm.title)) ?? null
      const have = new Set(m ? liveSteps(m).map((s) => normTitle(s.title)) : [])
      return { msId: m?.id ?? null, steps: pm.steps.map((s) => (have.has(normTitle(s.title)) ? 'there' : 'new')) }
    }),
    outcome: field(!!plan.outcome, goal.outcome.trim() !== ''),
    finishBy: field(!!plan.finishBy, !!goal.finishBy),
    habit: field(!!plan.habit, liveHabit(goal) !== null),
  }
}

// — the preview's ticks —
export const msKey = (mi: number): string => `m${mi}`
export const stepKey = (mi: number, si: number): string => `m${mi}s${si}`
export const taskKey = (ti: number): string => `t${ti}`
const isThere = (match: PlanMatch | null, mi: number, si: number): boolean => match?.milestones[mi]?.steps[si] === 'there'

/** Everything new starts ticked. */
export function defaultPicks(plan: GoalPlan, match: PlanMatch | null): Set<string> {
  const picks = new Set<string>()
  plan.milestones.forEach((pm, mi) => {
    picks.add(msKey(mi))
    pm.steps.forEach((_, si) => { if (!isThere(match, mi, si)) picks.add(stepKey(mi, si)) })
  })
  return picks
}

/** Unticking a milestone unticks its steps (ticking re-ticks them); ticking a step ticks its milestone. */
export function togglePick(picks: ReadonlySet<string>, key: string, plan: GoalPlan | null, match: PlanMatch | null): Set<string> {
  const next = new Set(picks)
  const k = /^m(\d+)(?:s(\d+))?$/.exec(key)
  const pm = k && plan ? plan.milestones[Number(k[1])] : undefined
  if (!k || !pm) {
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  }
  const mi = Number(k[1])
  if (k[2] === undefined) {
    const on = !next.has(key)
    if (on) next.add(key)
    else next.delete(key)
    pm.steps.forEach((_, si) => {
      if (isThere(match, mi, si)) return
      if (on) next.add(stepKey(mi, si))
      else next.delete(stepKey(mi, si))
    })
    return next
  }
  const si = Number(k[2])
  if (isThere(match, mi, si)) return next
  if (next.has(key)) next.delete(key)
  else {
    next.add(key)
    next.add(msKey(mi))
  }
  return next
}

export interface PickSummary { milestones: number; steps: number; minutes: number; there: number }

/** What the picks would add: new milestones, steps and their minutes (an unplanned milestone counts its own estimate). */
export function pickSummary(plan: GoalPlan, picks: ReadonlySet<string>, match: PlanMatch | null): PickSummary {
  let milestones = 0
  let steps = 0
  let minutes = 0
  let there = 0
  plan.milestones.forEach((pm, mi) => {
    let picked = 0
    pm.steps.forEach((s, si) => {
      if (isThere(match, mi, si)) there++
      else if (picks.has(stepKey(mi, si))) {
        picked++
        minutes += s.estMin
      }
    })
    steps += picked
    if (!match?.milestones[mi]?.msId && picks.has(msKey(mi))) {
      milestones++
      if (picked === 0 && pm.estMin) minutes += pm.estMin
    }
  })
  return { milestones, steps, minutes, there }
}

export function summaryText(s: PickSummary, next: boolean): string {
  if (!next) return [plural(s.milestones, 'milestone'), plural(s.steps, 'step'), `~${fmtM(s.minutes)}`].join(' · ')
  return [plural(s.steps, 'new step'), s.milestones ? plural(s.milestones, 'new milestone') : '', s.there ? `${s.there} already there` : '']
    .filter(Boolean)
    .join(' · ')
}

/** "5 steps and 1 milestone", "1 step", "2 milestones" (empty when nothing). */
export const addedText = (steps: number, milestones: number): string =>
  [steps ? plural(steps, 'step') : '', milestones ? plural(milestones, 'milestone') : ''].filter(Boolean).join(' and ')

// — copy out —
/** The goal in the import format: live parts only, done steps [x], every step with its estimate. */
export function goalMarkdown(goal: Goal): string {
  const out = [`# Goal: ${goal.title}`]
  const outcome = goal.outcome.replace(/\s+/g, ' ').trim()
  if (outcome) out.push(`Outcome: ${outcome}`)
  if (goal.finishBy) out.push(`Finish by: ${goal.finishBy}`)
  const h = liveHabit(goal)
  const target = h?.targets[h.targets.length - 1]
  if (target) out.push(`Habit: ${targetText(target.minutes, target.daysPerWeek)}`)
  for (const m of liveMilestones(goal)) {
    const steps = liveSteps(m)
    out.push('', `## ${m.title}${!steps.length && m.estMin ? ` (~${fmtM(m.estMin)})` : ''}`)
    for (const s of steps) out.push(`- [${s.doneOn ? 'x' : ' '}] ${s.title} (${fmtM(s.estMin)})`)
  }
  return `${out.join('\n')}\n`
}

// — prompts —
const EXAMPLE_GOAL = [
  '# Goal: Speak conversational Spanish',
  'Outcome: Hold a 15-minute conversation with a native speaker',
  'Finish by: 2027-01-31',
  'Habit: 25m on 5 days a week',
  '',
  '## Sounds and greetings',
  '- Learn the alphabet and vowel sounds (45m)',
  '- Practise 20 greetings out loud (1h)',
  '',
  '## Everyday conversation',
  '- Learn the 100 most common verbs (2h 30m)',
  '',
  '## Real conversations (6h)',
].join('\n')

const STEP_RULES = [
  '- Each milestone is a "## " heading, in the order I\'ll do them.',
  '- Each step is a "- " bullet: one concrete action under 3 hours, with its time in brackets at the end, like (45m) or (1h 30m).',
  '- A milestone too far off to plan in detail can have no steps and a rough time in its heading, like "## Real conversations (6h)".',
  '- No nested bullets, no extra notes.',
]

export function goalPrompt(today: ISODate): string {
  return [
    'My goal: [describe it — what, by when, how much time a week]',
    '',
    'I plan my learning in an app that reads the markdown format below. Turn my goal into a plan and reply with only that markdown, nothing before or after it.',
    '',
    'Format:',
    '',
    EXAMPLE_GOAL,
    '',
    'Rules:',
    '- Start with "# Goal: " and a short name for the goal.',
    '- "Outcome:" is one sentence: what I\'ll be able to do when it\'s done.',
    '- "Finish by:" (a date as YYYY-MM-DD) and "Habit:" (minutes on a number of days a week, like "25m on 5 days a week") are optional.',
    '- 3–7 milestones, with 3–7 steps each.',
    ...STEP_RULES,
    `- Today is ${today}.`,
  ].join('\n')
}

export function nextStepsPrompt(goal: Goal, today: ISODate): string {
  return [
    'What I want next: [e.g. plan the next phase, or break down milestones without steps]',
    '',
    'I plan my learning in an app that reads the markdown format below. Here is my goal as it stands; steps marked [x] are done. Reply with the whole goal in the same format and nothing else. Keep my existing milestones and steps exactly as written; add new steps under them or new milestones after them.',
    '',
    goalMarkdown(goal),
    'Rules:',
    '- 3–7 steps per milestone.',
    ...STEP_RULES,
    `- Today is ${today}.`,
  ].join('\n')
}

export function tasksPrompt(goals: Goal[], today: ISODate): string {
  const names = goals.filter((g) => isLive(g) && goalStatus(g) !== 'achieved').map((g) => `- ${g.title}`)
  return [
    'What I need to do: [list or describe it]',
    '',
    'I keep my to-do list in an app that reads the markdown format below. Turn what I need to do into tasks and reply with only that markdown, nothing before or after it.',
    '',
    'Format:',
    '',
    '# Tasks',
    '- Book a trial lesson | tomorrow | #Admin | goal: Speak conversational Spanish',
    '- Renew passport | 2026-11-02 | deadline',
    '- Read about learning plateaus',
    '',
    'Rules:',
    '- One "- " bullet per task, starting with a short title that begins with a verb.',
    '- After the title, optional parts separated by " | ": when (today, tomorrow, or a date as YYYY-MM-DD; leave it out for someday), "deadline" if that date is a hard deadline, a tag like #Admin, and "goal: " with one of my goals below when the task is for it.',
    '- No nested bullets, no extra notes.',
    `- Today is ${today}.`,
    '',
    ...(names.length ? ['My goals:', ...names] : ['I have no goals in the app yet, so leave out "goal:".']),
  ].join('\n')
}
```

- [ ] **Step 4: Run** the file.
  Expected: PASS.

- [ ] **Step 5: Commit** "feat: match a pasted plan against a goal, tick logic for the preview, copy a goal out as markdown, and the three prompts", with the co-author line.

### Task 4: Store: the three imports and their undo

**Files:**
- Modify: `src/stores/ember.ts`
- Test: `src/stores/ember.test.ts`

**Interfaces:**
- **Consumes** from `core/importPlan`: `GoalPlan`, `PlanMilestone`, `PlanStep`, `TaskPlan`, `matchPlan`, `msKey`, `stepKey`, `addedText`.
- **Produces:**
  - `DeleteKey` gains `{ kind: 'import'; keys: DeleteKey[]; cleared?: { goalId: string; outcome?: boolean; finishBy?: boolean; habit?: boolean } }`;
  - `importGoal(plan, picks: ReadonlySet<string>): { goalId: string; undo: UndoRecord } | null`;
  - `importIntoGoal(goalId, plan, picks): UndoRecord | null`;
  - `importTasks(tasks: TaskPlan[]): UndoRecord | null`;
  - `undoDelete` handles the import kind.

- [ ] **Step 1: Failing tests.** Today is 2026-09-23 (a Wednesday; Monday is 2026-09-21). Import `defaultPicks`, `matchPlan`, `msKey`, `parseGoal`, `parseTasks`, `stepKey` from `../core/importPlan`, and `goalStatus` and `liveSteps` from `../core/goals`:

```ts
describe('import', () => {
  const plan = () => parseGoal([
    '# Goal: Spanish', 'Outcome: Chat', 'Finish by: 2027-01-31', 'Habit: 25m on 5 days a week',
    '## Sounds', '- [x] Alphabet (45m)', '- Greetings (1h)', '## Later (6h)', '## Skip me', '- Nope',
  ].join('\n'))!

  it('creates a new goal from the picked parts, and Undo deletes it', async () => {
    const store = storeWith()
    await nextTick()
    const p = plan()
    const picks = defaultPicks(p, null)
    picks.delete(msKey(2))
    picks.delete(stepKey(2, 0))
    const r = store.importGoal(p, picks)!
    const g = store.goals.find((x) => x.id === r.goalId)!
    expect(g).toMatchObject({ title: 'Spanish', outcome: 'Chat', finishBy: '2027-01-31', createdAt: '2026-09-23' })
    expect(g.habit!.targets).toEqual([{ minutes: 25, daysPerWeek: 5, from: '2026-09-21' }])
    expect(g.milestones.map((m) => [m.title, m.estMin ?? null, m.steps.map((s) => [s.title, s.estMin, s.doneOn])])).toEqual([
      ['Sounds', null, [['Alphabet', 45, '2026-09-23'], ['Greetings', 60, null]]],
      ['Later', 360, []],
    ])
    await nextTick()
    expect(loadData()!.goals.find((x) => x.id === r.goalId)!.updatedAt).toBe(NOW)
    expect(r.undo.label).toBe('Imported “Spanish”')
    store.undoDelete(r.undo)
    expect(g.deletedOn).toBe('2026-09-23')
  })

  it('needs a title; with nothing picked it still gets a first milestone', () => {
    const store = storeWith()
    expect(store.importGoal({ ...plan(), title: ' ' }, new Set())).toBeNull()
    const r = store.importGoal(plan(), new Set())!
    expect(store.goals.find((x) => x.id === r.goalId)!.milestones.map((m) => m.title)).toEqual(['Getting started'])
  })

  it('adds only what is new to a goal, fills only its empty fields, and Undo takes back just that', () => {
    const store = storeWith()
    store.setOutcome('D3', 'Ship charts')
    const p = parseGoal(['# D3', 'Outcome: Other', 'Finish by: 2026-12-01', '## First charts', '- Line', '- Pie (30m)', '## Polish', '- Tooltips (45m)'].join('\n'))!
    const u = store.importIntoGoal('D3', p, defaultPicks(p, matchPlan(store.goals[0], p)))!
    const g = store.goals[0]
    expect(g.milestones.map((x) => x.title)).toEqual(['First charts', 'Motion', 'Polish'])
    expect(g.milestones[0].steps.map((s) => [s.title, s.estMin])).toEqual([['Bar', 50], ['Line', 50], ['Scatter', 50], ['Pie', 30]])
    expect(g.outcome).toBe('Ship charts')
    expect(g.finishBy).toBe('2026-12-01')
    expect(u.label).toBe('Added 2 steps and 1 milestone to “D3”')
    store.undoDelete(u)
    expect(liveSteps(g.milestones[0]).map((s) => s.title)).toEqual(['Bar', 'Line', 'Scatter'])
    expect(g.milestones[2].deletedOn).toBe('2026-09-23')
    expect(g).not.toHaveProperty('finishBy')
    expect(g.outcome).toBe('Ship charts')
  })

  it('reopens an achieved goal, and ignores a missing goal or a paste with nothing new', () => {
    const store = storeWith()
    store.setGoalStatus('D3', 'achieved')
    const p = parseGoal('## Motion\n- Springs (30m)')!
    expect(store.importIntoGoal('nope', p, defaultPicks(p, null))).toBeNull()
    const same = parseGoal('## Motion\n- Easing')!
    expect(store.importIntoGoal('D3', same, defaultPicks(same, matchPlan(store.goals[0], same)))).toBeNull()
    expect(store.importIntoGoal('D3', p, defaultPicks(p, matchPlan(store.goals[0], p)))!.label).toBe('Added 1 step to “D3”')
    expect(goalStatus(store.goals[0])).toBe('active')
  })

  it('fills a missing habit, and Undo clears it', () => {
    const store = storeWith()
    const u = store.importIntoGoal('D3', parseGoal('# D3\nHabit: 20m daily')!, new Set())!
    expect(u.label).toBe('Updated “D3”')
    expect(store.goals[0].habit!.targets[0]).toMatchObject({ minutes: 20, daysPerWeek: 7 })
    store.undoDelete(u)
    expect(store.goals[0].habit).toBeNull()
  })

  it('adds tasks with their own date, deadline, tag and goal, and Undo deletes them', () => {
    const store = storeWith()
    const { tasks } = parseTasks('- Book lesson | tomorrow | #Admin | goal: D3\n- Renew | 2026-11-02 | deadline', store.goals, store.today)
    const u = store.importTasks(tasks)!
    const added = store.tasks.slice(-2)
    expect(added.map(({ title, date, deadline, tag, goalId }) => ({ title, date, deadline, tag, goalId }))).toEqual([
      { title: 'Book lesson', date: '2026-09-24', deadline: false, tag: 'Admin', goalId: 'D3' },
      { title: 'Renew', date: '2026-11-02', deadline: true, tag: 'Inbox', goalId: null },
    ])
    expect(u.label).toBe('Added 2 tasks')
    store.undoDelete(u)
    expect(added.every((t) => t.deletedOn === '2026-09-23')).toBe(true)
    expect(store.importTasks([])).toBeNull()
  })

  it('drops a goal link that is no longer live', () => {
    const store = storeWith()
    const { tasks } = parseTasks('- Book lesson | goal: D3', store.goals, store.today)
    store.deleteGoal('D3')
    store.importTasks(tasks)
    expect(store.tasks.at(-1)!.goalId).toBeNull()
  })
})
```

- [ ] **Step 2: Run** `npx vitest run src/stores/ember.test.ts -t import`.
  Expected: FAIL (`importGoal` is not a function).

- [ ] **Step 3: Implement** in `src/stores/ember.ts`:
  - **Imports:**
    - `import { addedText, matchPlan, msKey, stepKey, type GoalPlan, type PlanMilestone, type PlanStep, type TaskPlan } from '../core/importPlan'`;
    - `Milestone`, `Step` and `Task` types if they aren't already imported.
  - **`DeleteKey`:** add the import member:

```ts
  | { kind: 'import'; keys: DeleteKey[]; cleared?: { goalId: string; outcome?: boolean; finishBy?: boolean; habit?: boolean } }
```

  - **`itemFor`:** make the first line `if (key.kind === 'import') return null`.
  - **`undoDelete`:** start with the import case:

```ts
  function undoDelete(record: UndoRecord) {
    const key = record.key
    if (key.kind === 'import') {
      undoImport(key)
      return
    }
    const item = itemFor(key)
    if (item) item.deletedOn = null
    if (!selection.value && record.selection && targetExists(record.selection)) selection.value = record.selection
  }

  /** Undo of an import: delete what it added, empty the fields it filled. */
  function undoImport(key: Extract<DeleteKey, { kind: 'import' }>) {
    for (const k of key.keys) {
      const item = itemFor(k)
      if (item) item.deletedOn = today.value
    }
    const c = key.cleared
    const g = c ? goalById(c.goalId) : null
    if (c && g) {
      if (c.outcome) g.outcome = ''
      if (c.finishBy) delete g.finishBy
      if (c.habit) g.habit = null
    }
    if (selection.value && !targetExists(selection.value)) selection.value = null
  }
```

  - **After the habits section:**

```ts
  // — import (plan with your AI) —
  const planStep = (s: PlanStep): Step => ({ id: uid(), title: s.title, doneOn: s.done ? today.value : null, estMin: s.estMin })
  function planMilestone(pm: PlanMilestone, mi: number, picks: ReadonlySet<string>): Milestone {
    const m: Milestone = { id: uid(), title: pm.title, steps: pm.steps.filter((_, si) => picks.has(stepKey(mi, si))).map(planStep) }
    if (pm.estMin != null && m.steps.length === 0) m.estMin = pm.estMin
    return m
  }

  /** A new goal from a pasted plan: the picked milestones and steps, plus its outcome, finish-by date and habit. */
  function importGoal(plan: GoalPlan, picks: ReadonlySet<string>): { goalId: string; undo: UndoRecord } | null {
    const title = plan.title.trim()
    if (!title) return null
    const milestones = plan.milestones.flatMap((pm, mi) => (picks.has(msKey(mi)) ? [planMilestone(pm, mi, picks)] : []))
    const goal: Goal = {
      id: uid(), title, outcome: plan.outcome ?? '', createdAt: today.value,
      milestones: milestones.length ? milestones : [{ id: uid(), title: 'Getting started', steps: [] }],
    }
    if (plan.finishBy && isRealDate(plan.finishBy)) goal.finishBy = plan.finishBy
    if (plan.habit) {
      const h = clampHabit(plan.habit.minutes, plan.habit.daysPerWeek)
      goal.habit = newHabit(h.minutes, h.daysPerWeek, today.value, false)
    }
    goals.value.push(goal)
    return {
      goalId: goal.id,
      undo: { label: `Imported “${title}”`, key: { kind: 'import', keys: [{ kind: 'goal', goalId: goal.id }] }, selection: selection.value },
    }
  }

  /** Paste-back: adds only new milestones and steps (matched by title) and fills only the fields the goal lacks. */
  function importIntoGoal(goalId: string, plan: GoalPlan, picks: ReadonlySet<string>): UndoRecord | null {
    const g = goalById(goalId)
    if (!g || !isLive(g)) return null
    const match = matchPlan(g, plan)
    const keys: DeleteKey[] = []
    let steps = 0
    let added = 0
    plan.milestones.forEach((pm, mi) => {
      const mm = match.milestones[mi]
      if (mm.msId === null) {
        if (!picks.has(msKey(mi))) return
        const m = planMilestone(pm, mi, picks)
        g.milestones.push(m)
        keys.push({ kind: 'milestone', goalId, msId: m.id })
        added++
        steps += m.steps.length
        return
      }
      const m = g.milestones.find((x) => x.id === mm.msId)
      if (!m) return
      pm.steps.forEach((ps, si) => {
        if (mm.steps[si] !== 'new' || !picks.has(stepKey(mi, si))) return
        const s = planStep(ps)
        m.steps.push(s)
        keys.push({ kind: 'step', goalId, msId: m.id, stepId: s.id })
        steps++
      })
    })
    if (keys.length) reopenIfAchieved(g)
    const cleared: { goalId: string; outcome?: boolean; finishBy?: boolean; habit?: boolean } = { goalId }
    if (match.outcome === 'fill' && plan.outcome) {
      g.outcome = plan.outcome
      cleared.outcome = true
    }
    if (match.finishBy === 'fill' && plan.finishBy && isRealDate(plan.finishBy)) {
      g.finishBy = plan.finishBy
      cleared.finishBy = true
    }
    if (match.habit === 'fill' && plan.habit) {
      const h = clampHabit(plan.habit.minutes, plan.habit.daysPerWeek)
      g.habit = newHabit(h.minutes, h.daysPerWeek, today.value, goalStatus(g) !== 'active')
      cleared.habit = true
    }
    const filled = !!(cleared.outcome || cleared.finishBy || cleared.habit)
    if (!keys.length && !filled) return null
    const what = addedText(steps, added)
    return {
      label: what ? `Added ${what} to “${g.title}”` : `Updated “${g.title}”`,
      key: { kind: 'import', keys, cleared: filled ? cleared : undefined },
      selection: selection.value,
    }
  }

  /** Pasted tasks, each with its own date (a past one becomes today), deadline, tag and goal (only while that goal is live). */
  function importTasks(plans: TaskPlan[]): UndoRecord | null {
    const keys: DeleteKey[] = []
    for (const p of plans) {
      const title = p.title.trim()
      if (!title) continue
      const linked = p.goalId ? goalById(p.goalId) : null
      const date = p.date && p.date < today.value ? today.value : p.date
      const task: Task = {
        id: uid(), title, tag: p.tag || 'Inbox', goalId: linked && isLive(linked) ? linked.id : null,
        date, deadline: date != null && p.deadline, doneOn: null,
      }
      tasks.value.push(task)
      keys.push({ kind: 'task', id: task.id })
    }
    if (!keys.length) return null
    return { label: `Added ${plural(keys.length, 'task')}`, key: { kind: 'import', keys }, selection: selection.value }
  }
```

  - **Return:** add `importGoal`, `importIntoGoal` and `importTasks` to the store's return object.

- [ ] **Step 4: Run** `npx vitest run src/stores/ember.test.ts`, then `npm run typecheck`.
  Expected: PASS and no errors. Other code that switches on `DeleteKey` must still typecheck; `itemFor` returns null for the import kind.

- [ ] **Step 5: Commit** "feat: store imports a pasted goal, steps for a goal, or tasks, with one undo for the whole import", with the co-author line.

### Task 5: The import panel, preview and clipboard fallback

**Files:**
- Create: `src/components/clipboard.ts`, `src/components/CopyBox.vue`, `src/components/ImportPreview.vue`, `src/components/ImportPanel.vue`
- Test: `src/components/ImportPanel.test.ts`

**Interfaces:**
- **Consumes:** Tasks 1–4.
- **Produces:**
  - `copyText(text): Promise<boolean>`;
  - `<CopyBox :text @close>`;
  - `<ImportPanel :kind :goal? @close>`.

- [ ] **Step 1: Failing tests** in `src/components/ImportPanel.test.ts`:

```ts
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { ImportKind } from '../core/importPlan'
import { dataFixture, goalFixture } from '../core/test-fixtures'
import { useEmberStore } from '../stores/ember'
import { useUiStore } from '../stores/ui'
import ImportPanel from './ImportPanel.vue'

let writeText: ReturnType<typeof vi.fn>

function setup(kind: ImportKind) {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  ember.replaceData(dataFixture({ goals: [goalFixture('D3', [['First charts', [['Bar', null]]]])] }))
  const w = mount(ImportPanel, { props: { kind, goal: kind === 'next' ? ember.goals[0] : null }, attachTo: document.body })
  return { w, ember, ui: useUiStore() }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
  writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})
afterEach(() => vi.useRealTimers())

describe('ImportPanel', () => {
  it('copies the prompt and says so for a moment', async () => {
    const { w } = setup('goal')
    await w.find('.ip-copy').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^My goal: /))
    expect(w.find('.ip-copy').text()).toBe('Copied')
    vi.advanceTimersByTime(2000)
    await nextTick()
    expect(w.find('.ip-copy').text()).toBe('Copy prompt')
  })

  it('shows the prompt to copy by hand when the clipboard refuses', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    const { w } = setup('tasks')
    await w.find('.ip-copy').trigger('click')
    await flushPromises()
    const box = w.find<HTMLTextAreaElement>('.copy-box textarea')
    expect(box.element.value).toMatch(/^What I need to do: /)
    expect(document.activeElement).toBe(box.element)
  })

  it('previews a pasted goal, lets you untick a step, and creates it', async () => {
    const { w, ember, ui } = setup('goal')
    await w.find('.ip-paste').setValue('Sure!\n# Goal: Spanish\n## Basics\n- Alphabet (45m)\n- Greetings')
    expect(w.find('.ipv-summary').text()).toBe('1 milestone · 2 steps · ~1h 35m')
    await w.findAll('.ipv-step input')[1].setValue(false)
    expect(w.find('.ipv-summary').text()).toBe('1 milestone · 1 step · ~45m')
    await w.find('.ip-create').trigger('click')
    const g = ember.goals.find((x) => x.title === 'Spanish')!
    expect(g.milestones[0].steps.map((s) => s.title)).toEqual(['Alphabet'])
    expect(ui.activeGoalId).toBe(g.id)
    expect(ui.undo?.record.label).toBe('Imported “Spanish”')
    expect(w.emitted('close')).toHaveLength(1)
  })

  it('refuses a paste of the other kind, an unreadable one, and a goal without a title', async () => {
    const { w } = setup('tasks')
    await w.find('.ip-paste').setValue('# Goal: Spanish\n## Basics')
    expect(w.find('.ipv-empty').text()).toBe('This looks like a goal — use Import a goal on the Goals page.')
    expect(w.find('.ip-create').attributes('disabled')).toBeDefined()
    await w.find('.ip-paste').setValue('hello')
    expect(w.find('.ipv-empty').text()).toBe('Nothing Ember can read yet — check it has ‘- ’ bullets.')
    const g = setup('goal').w
    await g.find('.ip-paste').setValue('# Tasks\n- a')
    expect(g.find('.ipv-empty').text()).toBe('This looks like a task list — use Paste tasks on Today.')
    await g.find('.ip-paste').setValue('## Basics\n- a')
    expect(g.find('.ipv-empty').text()).toBe('Add a ‘# Goal:’ line with the goal’s name.')
  })

  it('adds only the new steps to a goal, showing what is already there', async () => {
    const { w, ember } = setup('next')
    await w.find('.ip-paste').setValue('## First charts\n- Bar\n- Line (30m)')
    expect(w.find('.ipv-step.is-there').text()).toContain('Bar')
    expect(w.find('.ipv-step.is-there').text()).toContain('already there')
    expect(w.find('.ipv-step.is-there input').exists()).toBe(false)
    expect(w.find('.ip-create').text()).toBe('Add 1 step')
    await w.find('.ip-create').trigger('click')
    expect(ember.goals[0].milestones[0].steps.map((s) => s.title)).toEqual(['Bar', 'Line'])
  })

  it('adds the ticked tasks and lists what it skipped', async () => {
    const { w, ember, ui } = setup('tasks')
    await w.find('.ip-paste').setValue('- Book lesson | tomorrow | goal: D3\n- Skip this\n- [x] Done already')
    expect(w.findAll('.ipv-task').map((r) => r.find('.ipv-task-title').text())).toEqual(['Book lesson', 'Skip this'])
    expect(w.find('.ipv-task').text()).toContain('Tomorrow')
    expect(w.find('.ipv-skipped').text()).toContain('already done')
    await w.findAll('.ipv-task input')[1].setValue(false)
    expect(w.find('.ip-create').text()).toBe('Add 1 task')
    await w.find('.ip-create').trigger('click')
    expect(ember.tasks.at(-1)).toMatchObject({ title: 'Book lesson', date: '2026-09-24', goalId: 'D3' })
    expect(ui.undo?.record.label).toBe('Added 1 task')
  })

  it('cancel closes without saving', async () => {
    const { w, ember } = setup('goal')
    await w.find('.ip-paste').setValue('# Goal: Spanish\n- a')
    await w.find('.ip-cancel').trigger('click')
    expect(w.emitted('close')).toHaveLength(1)
    expect(ember.goals).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run** `npx vitest run src/components/ImportPanel.test.ts`.
  Expected: FAIL (the component is missing).

- [ ] **Step 3: Implement.**

`src/components/clipboard.ts`:

```ts
/** Copies text; false when the browser has no clipboard or refuses (the caller then shows the text to copy by hand). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
```

`src/components/CopyBox.vue`:

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'

defineProps<{ text: string }>()
const emit = defineEmits<{ close: [] }>()
const box = ref<HTMLTextAreaElement | null>(null)
onMounted(() => {
  box.value?.focus()
  box.value?.select()
})
</script>

<template>
  <div class="copy-box">
    <span class="section-label">Copy it from here</span>
    <textarea ref="box" class="input cb-text" rows="6" readonly :value="text" aria-label="Copy it from here"></textarea>
    <button class="btn btn-ghost cb-close" @click="emit('close')">Done</button>
  </div>
</template>

<style scoped>
.copy-box { display: flex; flex-direction: column; gap: var(--space-2); align-items: flex-start; }
.cb-text { width: 100%; font-family: var(--font-mono, monospace); font-size: 12px; resize: vertical; }
</style>
```

`src/components/ImportPreview.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { addDays, dayLabel, yearOf } from '../core/dates'
import { fmtM } from '../core/format'
import { goalColor, isLive } from '../core/goals'
import { targetText } from '../core/habits'
import {
  msKey, normTitle, stepKey, summaryText, taskKey,
  type GoalPlan, type ImportKind, type PickSummary, type PlanMatch, type Skipped, type TaskPlan,
} from '../core/importPlan'
import { useEmberStore } from '../stores/ember'

const props = defineProps<{
  kind: ImportKind; plan: GoalPlan | null; match: PlanMatch | null; tasks: TaskPlan[] | null
  skipped: Skipped[]; picks: Set<string>; summary: PickSummary | null
}>()
const emit = defineEmits<{ toggle: [key: string] }>()
const ember = useEmberStore()

const there = (mi: number, si: number) => props.match?.milestones[mi]?.steps[si] === 'there'
const matched = (mi: number) => !!props.match?.milestones[mi]?.msId
const sameName = computed(() =>
  props.kind === 'goal' && !!props.plan?.title && ember.goals.some((g) => isLive(g) && normTitle(g.title) === normTitle(props.plan!.title)))
const fields = computed(() => {
  const p = props.plan
  if (!p) return []
  const m = props.match
  return [
    p.outcome ? { label: 'Outcome', text: p.outcome, kept: m?.outcome === 'kept' } : null,
    p.finishBy ? { label: 'Finish by', text: `${dayLabel(p.finishBy)}, ${yearOf(p.finishBy)}`, kept: m?.finishBy === 'kept' } : null,
    p.habit ? { label: 'Habit', text: targetText(p.habit.minutes, p.habit.daysPerWeek), kept: m?.habit === 'kept' } : null,
  ].filter((f): f is { label: string; text: string; kept: boolean } => f !== null)
})
const when = (d: string | null) =>
  d === null ? 'Someday' : d === ember.today ? 'Today' : d === addDays(ember.today, 1) ? 'Tomorrow' : dayLabel(d)
function goalOf(id: string | null) {
  const gi = ember.goals.findIndex((g) => g.id === id)
  return gi < 0 ? null : { title: ember.goals[gi].title, color: goalColor(gi) }
}
const short = (s: string) => (s.length > 60 ? `${s.slice(0, 59)}…` : s)
</script>

<template>
  <div class="import-preview">
    <template v-if="plan">
      <p class="ipv-summary">{{ summary ? summaryText(summary, kind === 'next') : '' }}</p>
      <p v-if="sameName" class="muted ipv-note">You already have a goal called ‘{{ plan.title }}’ — Add from AI on its page adds to it instead.</p>
      <h5 v-if="kind === 'goal'" class="ipv-title">{{ plan.title }}</h5>
      <ul class="ipv-list">
        <li v-for="(m, mi) in plan.milestones" :key="mi" class="ipv-ms">
          <label class="ipv-row ipv-ms-row">
            <input type="checkbox" :checked="picks.has(msKey(mi))" @change="emit('toggle', msKey(mi))" />
            <span class="ipv-ms-title">{{ m.title }}</span>
            <span v-if="matched(mi)" class="ipv-meta">adding to it</span>
            <span v-else-if="!m.steps.length && m.estMin" class="ipv-meta">~{{ fmtM(m.estMin) }}</span>
          </label>
          <ul class="ipv-steps">
            <li v-for="(s, si) in m.steps" :key="si" class="ipv-step" :class="{ 'is-there': there(mi, si) }">
              <label class="ipv-row">
                <input v-if="!there(mi, si)" type="checkbox" :checked="picks.has(stepKey(mi, si))" @change="emit('toggle', stepKey(mi, si))" />
                <span class="ipv-step-title" :class="{ 'is-done': s.done }">{{ s.title }}</span>
                <span class="ipv-meta">{{ there(mi, si) ? 'already there' : fmtM(s.estMin) }}</span>
              </label>
            </li>
          </ul>
        </li>
      </ul>
      <dl v-if="fields.length" class="ipv-fields">
        <div v-for="f in fields" :key="f.label" class="ipv-field">
          <dt>{{ f.label }}</dt>
          <dd>{{ f.text }}<span v-if="f.kept" class="ipv-meta"> · kept yours</span></dd>
        </div>
      </dl>
    </template>
    <ul v-else-if="tasks" class="ipv-list">
      <li v-for="(t, ti) in tasks" :key="ti" class="ipv-task">
        <label class="ipv-row">
          <input type="checkbox" :checked="picks.has(taskKey(ti))" @change="emit('toggle', taskKey(ti))" />
          <span class="ipv-task-title">{{ t.title }}</span>
          <span class="ipv-meta">{{ when(t.date) }}<template v-if="t.deadline"> · deadline</template> · #{{ t.tag }}</span>
          <span v-if="goalOf(t.goalId)" class="ipv-goal"><span class="swatch swatch-sm" :style="{ background: goalOf(t.goalId)!.color }"></span>{{ goalOf(t.goalId)!.title }}</span>
        </label>
        <p v-for="n in t.notes" :key="n" class="muted ipv-task-note">{{ n }}</p>
      </li>
    </ul>
    <div v-if="skipped.length" class="ipv-skipped">
      <span class="section-label">Skipped</span>
      <ul>
        <li v-for="s in skipped" :key="`${s.line}-${s.reason}`" class="muted"><b>Line {{ s.line }}</b> {{ short(s.text) }} — {{ s.reason }}</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.import-preview { display: flex; flex-direction: column; gap: var(--space-2); }
.ipv-summary { font-weight: 700; }
.ipv-title { font-size: 16px; }
.ipv-list, .ipv-steps, .ipv-skipped ul { list-style: none; margin: 0; padding: 0; }
.ipv-ms + .ipv-ms, .ipv-task + .ipv-task { border-top: 1px solid var(--color-divider); }
.ipv-steps { padding-left: var(--space-5); }
.ipv-row { display: flex; align-items: baseline; gap: var(--space-2); padding: 6px 0; cursor: pointer; }
.ipv-ms-title { font-weight: 700; }
.ipv-meta { margin-left: auto; font-size: 12px; color: var(--color-neutral-700); white-space: nowrap; }
.ipv-step.is-there { color: var(--color-neutral-700); }
.ipv-step.is-there .ipv-row { cursor: default; padding-left: 22px; }
.ipv-step-title.is-done { text-decoration: line-through; }
.ipv-goal { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }
.ipv-task-note { margin: 0 0 6px 22px; font-size: 12px; }
.ipv-fields { display: grid; gap: 4px; margin: 0; }
.ipv-field { display: flex; gap: var(--space-2); }
.ipv-field dt { font-weight: 700; min-width: 72px; }
.ipv-field dd { margin: 0; }
.ipv-skipped { font-size: 12px; border-top: 1px solid var(--color-divider); padding-top: var(--space-2); }
</style>
```

`src/components/ImportPanel.vue`:

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { plural } from '../core/format'
import {
  addedText, defaultPicks, detectKind, goalPrompt, matchPlan, nextStepsPrompt, parseGoal, parseTasks,
  pickSummary, taskKey, tasksPrompt, togglePick, type ImportKind,
} from '../core/importPlan'
import type { Goal } from '../core/model'
import { useEmberStore } from '../stores/ember'
import { useUiStore } from '../stores/ui'
import { copyText } from './clipboard'
import CopyBox from './CopyBox.vue'
import ImportPreview from './ImportPreview.vue'

const props = defineProps<{ kind: ImportKind; goal?: Goal | null }>()
const emit = defineEmits<{ close: [] }>()
const ember = useEmberStore()
const ui = useUiStore()

const TITLE: Record<ImportKind, string> = { goal: 'Import a goal', next: 'Add from AI', tasks: 'Paste tasks' }

const prompt = computed(() =>
  props.kind === 'goal' ? goalPrompt(ember.today)
  : props.kind === 'next' && props.goal ? nextStepsPrompt(props.goal, ember.today)
  : tasksPrompt(ember.goals, ember.today))
const copied = ref(false)
const showPrompt = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined
async function copy() {
  if (await copyText(prompt.value)) {
    copied.value = true
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => { copied.value = false }, 2000)
  } else showPrompt.value = true
}
onBeforeUnmount(() => clearTimeout(copiedTimer))

const text = ref('')
const pasted = computed(() => text.value.trim() !== '')
const wrongKind = computed(() => {
  const k = detectKind(text.value)
  return k && k !== (props.kind === 'tasks' ? 'tasks' : 'goal') ? k : null
})
const plan = computed(() => (props.kind !== 'tasks' && pasted.value && !wrongKind.value ? parseGoal(text.value) : null))
const match = computed(() => (props.kind === 'next' && props.goal && plan.value ? matchPlan(props.goal, plan.value) : null))
const taskResult = computed(() =>
  props.kind === 'tasks' && pasted.value && !wrongKind.value ? parseTasks(text.value, ember.goals, ember.today) : null)

const picks = ref<Set<string>>(new Set())
watch([plan, match, taskResult], () => {
  picks.value = plan.value ? defaultPicks(plan.value, match.value) : new Set(taskResult.value?.tasks.map((_, i) => taskKey(i)) ?? [])
}, { immediate: true })
const toggle = (key: string) => { picks.value = togglePick(picks.value, key, plan.value, match.value) }

const message = computed(() => {
  if (!pasted.value) return ''
  if (wrongKind.value === 'goal') return 'This looks like a goal — use Import a goal on the Goals page.'
  if (wrongKind.value === 'tasks') return 'This looks like a task list — use Paste tasks on Today.'
  if (props.kind === 'tasks') return taskResult.value?.tasks.length ? '' : 'Nothing Ember can read yet — check it has ‘- ’ bullets.'
  if (!plan.value) {
    return props.kind === 'goal'
      ? 'Nothing Ember can read yet — check it starts with ‘# Goal:’.'
      : 'Nothing Ember can read yet — check it has ‘## ’ milestones.'
  }
  if (props.kind === 'goal' && !plan.value.title) return 'Add a ‘# Goal:’ line with the goal’s name.'
  return ''
})

const summary = computed(() => (plan.value ? pickSummary(plan.value, picks.value, match.value) : null))
const fills = computed(() => !!match.value && [match.value.outcome, match.value.finishBy, match.value.habit].includes('fill'))
const pickedTasks = computed(() => taskResult.value?.tasks.filter((_, i) => picks.value.has(taskKey(i))) ?? [])
const action = computed(() => {
  if (props.kind === 'goal') return 'Create goal'
  if (props.kind === 'tasks') return `Add ${plural(pickedTasks.value.length, 'task')}`
  const what = summary.value ? addedText(summary.value.steps, summary.value.milestones) : ''
  return what ? `Add ${what}` : 'Add details'
})
const canCreate = computed(() => {
  if (!pasted.value || message.value) return false
  if (props.kind === 'tasks') return pickedTasks.value.length > 0
  const p = plan.value
  const s = summary.value
  if (!p || !s) return false
  if (props.kind === 'goal') return p.milestones.length === 0 || s.milestones > 0
  return s.steps + s.milestones > 0 || fills.value
})

function create() {
  if (!canCreate.value) return
  if (props.kind === 'goal' && plan.value) {
    const r = ember.importGoal(plan.value, picks.value)
    if (r) {
      ui.selectGoal(r.goalId)
      ui.showUndo(r.undo)
    }
  } else if (props.kind === 'next' && props.goal && plan.value) {
    ui.showUndo(ember.importIntoGoal(props.goal.id, plan.value, picks.value))
  } else if (props.kind === 'tasks') {
    ui.showUndo(ember.importTasks(pickedTasks.value))
  }
  emit('close')
}
</script>

<template>
  <section class="edit-panel import-panel" :aria-label="TITLE[kind]">
    <span class="kicker">{{ TITLE[kind] }}</span>
    <div class="ip-copy-row">
      <p class="ip-help">Paste this into your AI chat, fill in the first line, then paste its reply below.</p>
      <button class="btn btn-secondary ip-copy" @click="copy">{{ copied ? 'Copied' : 'Copy prompt' }}</button>
    </div>
    <CopyBox v-if="showPrompt" :text="prompt" @close="showPrompt = false" />
    <label class="section-label" :for="`ip-paste-${kind}`">Paste the AI's reply</label>
    <textarea :id="`ip-paste-${kind}`" v-model="text" class="input ip-paste" rows="8" spellcheck="false"></textarea>
    <p v-if="message" class="muted ipv-empty">{{ message }}</p>
    <ImportPreview
      v-else-if="pasted"
      :kind="kind" :plan="plan" :match="match" :tasks="taskResult?.tasks ?? null"
      :skipped="plan?.skipped ?? taskResult?.skipped ?? []" :picks="picks" :summary="summary"
      @toggle="toggle"
    />
    <div class="ep-actions">
      <button class="btn btn-primary ip-create" :disabled="!canCreate" @click="create">{{ action }}</button>
      <button class="btn btn-ghost ip-cancel" @click="emit('close')">Cancel</button>
    </div>
  </section>
</template>

<style scoped>
.import-panel { margin: 0; gap: var(--space-3); }
.ip-copy-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); }
.ip-help { margin: 0; flex: 1 1 240px; }
.ip-paste { width: 100%; resize: vertical; font-family: var(--font-mono, monospace); font-size: 12px; }
</style>
```

- [ ] **Step 4: Run** `npx vitest run src/components/ImportPanel.test.ts`, then `npm run typecheck`.
  Expected: PASS and no errors.

- [ ] **Step 5: Commit** "feat: import panel: copy the prompt, paste the reply, preview with ticks, create; clipboard fallback", with the co-author line.

### Task 6: Entry points and Copy as markdown

**Files:**
- **Modify:** `src/components/goals/GoalList.vue`, `src/components/goals/GoalsView.vue`, `src/components/goals/Roadmap.vue`, `src/components/today/TodayList.vue`, `src/components/goals/GoalSummary.vue`
- **Tests:** `GoalList.test.ts`, `GoalsView.test.ts`, `Roadmap.test.ts`, `today/TodayList.test.ts`, `GoalSummary.test.ts`, each using its file's own `setup`/mount helper.

**Interfaces:**
- **Consumes:** `ImportPanel` and `CopyBox` (Task 5), `copyText`, `goalMarkdown`.
- **`ui.editing` keys:** `'import:goal'`, `` `import:next:${goalId}` ``, `'import:tasks'`.

- [ ] **Step 1: Failing tests.**
  - **`GoalList.test.ts`:**

```ts
  it('opens the goal import', async () => {
    const { w, ui } = setup()
    await w.find('.gl-import').trigger('click')
    expect(ui.editing).toBe('import:goal')
  })
```

  - **`GoalsView.test.ts`** (with the file's `setup`, which mounts `GoalsView`; set the UI store before mounting or await `nextTick` after):

```ts
  it('shows the goal import in the main column, even with no goals', async () => {
    const w = setup([])
    useUiStore().editing = 'import:goal'
    await nextTick()
    expect(w.find('.import-panel').exists()).toBe(true)
    await w.find('.ip-cancel').trigger('click')
    expect(useUiStore().editing).toBeNull()
  })
```

  - **`Roadmap.test.ts`:**

```ts
  it('opens Add from AI for this goal', async () => {
    const { w, ui } = setup()
    await w.find('.rm-import').trigger('click')
    expect(ui.editing).toBe('import:next:D3')
    expect(w.find('.import-panel').exists()).toBe(true)
  })
```

  - **`TodayList.test.ts`:**

```ts
  it('opens Paste tasks', async () => {
    const w = setup()
    await w.find('.tl-import').trigger('click')
    expect(useUiStore().editing).toBe('import:tasks')
    expect(w.find('.import-panel').exists()).toBe(true)
    w.unmount()
  })
```

  - **`GoalSummary.test.ts`:**
    - Update the three menu expectations: `['Edit', 'Pause', 'Mark achieved', 'Copy as markdown', 'Delete']`, `['Edit', 'Resume', 'Mark achieved', 'Copy as markdown', 'Delete']` and `['Edit', 'Reopen', 'Copy as markdown', 'Delete']`.
    - Add (stubbing `navigator.clipboard` as in Task 5):

```ts
  it('copies the goal as markdown, or shows it to copy by hand', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const { w, ember } = setup()
    await w.find('.rmn-trigger').trigger('click')
    await w.find('.rmn-copy').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(goalMarkdown(ember.goals[0]))
    expect(w.find('.gs-copied').text()).toBe('Copied')
    writeText.mockRejectedValue(new Error('denied'))
    await w.find('.rmn-trigger').trigger('click')
    await w.find('.rmn-copy').trigger('click')
    await flushPromises()
    expect(w.find<HTMLTextAreaElement>('.copy-box textarea').element.value).toBe(goalMarkdown(ember.goals[0]))
  })
```

- [ ] **Step 2: Run** those five files.
  Expected: the new tests FAIL.

- [ ] **Step 3: Implement.**
  - **`GoalList.vue`:**
    - Import `ClipboardPaste` from lucide.
    - After `.gl-new-row`, inside `.gl-new`: `<button class="btn btn-ghost gl-import" @click="ui.startEdit('import:goal')"><ClipboardPaste :size="16" :stroke-width="2.25" />Import a goal</button>`.
    - Style: `.gl-import { align-self: flex-start; }`.
  - **`GoalsView.vue`:** one `<main>`, with the panel first:

```vue
    <main class="gv-main" :class="{ 'gv-empty': !goal }">
      <ImportPanel v-if="ui.editing === 'import:goal'" kind="goal" @close="ui.editing = null" />
      <template v-if="goal">
        <GoalSummary :goal="goal" />
        <GoalTasks :goal="goal" />
        <Roadmap :goal="goal" />
      </template>
      <p v-else class="muted">No goals yet. Add one on the left.</p>
    </main>
```

    Import `ImportPanel from '../ImportPanel.vue'`. Keep any existing `.gv-empty` styling working for the paragraph.
  - **`Roadmap.vue`:**
    - Add a last child of `.rm-legend`: `<button class="btn btn-ghost rm-import" @click="ui.startEdit(`import:next:${goal.id}`)">Add from AI</button>`, with style `.rm-import { margin-left: auto; }`.
    - Right after `.rm-legend`: `<ImportPanel v-if="ui.editing === `import:next:${goal.id}`" kind="next" :goal="goal" @close="ui.editing = null" />`.
  - **`TodayList.vue`:**
    - After `<AddTask />`: `<button class="btn btn-ghost tl-import" @click="ui.startEdit('import:tasks')">Paste tasks</button>`, then `<ImportPanel v-if="ui.editing === 'import:tasks'" kind="tasks" @close="ui.editing = null" />`.
    - Style: `.tl-import { align-self: flex-start; }`. If `.today-list` isn't a flex column, use `display: block; margin: var(--space-2) 0` instead, so the label stays flush left.
    - Make sure `ui` is in scope.
  - **`GoalSummary.vue`:**
    - Import `goalMarkdown` from `../../core/importPlan`, `copyText` from `../clipboard`, `CopyBox from '../CopyBox.vue'`, and `onBeforeUnmount`.
    - Add:

```ts
const menuItems = computed(() => [...MENU[status.value], { key: 'copy', label: 'Copy as markdown' }])
const copied = ref(false)
const copyFallback = ref<string | null>(null)
let copiedTimer: ReturnType<typeof setTimeout> | undefined
async function copyGoal() {
  const md = goalMarkdown(props.goal)
  if (await copyText(md)) {
    copyFallback.value = null
    copied.value = true
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => { copied.value = false }, 2000)
  } else copyFallback.value = md
}
onBeforeUnmount(() => clearTimeout(copiedTimer))
const onSelect = (key: string) => (key === 'copy' ? copyGoal() : ember.setGoalStatus(props.goal.id, NEXT[key]))
```

    - Replace the old `onSelect`.
    - Use `:extra="menuItems"` on the `RowMenu`.
    - In `.gs-side` before `.gs-pct`: `<span v-if="copied" class="gs-copied" role="status">Copied</span>`.
    - After the `TitleEditPanel`: `<CopyBox v-if="copyFallback" :text="copyFallback" @close="copyFallback = null" />`.
    - Style: `.gs-copied { font-size: 12px; color: var(--color-neutral-700); }`.

- [ ] **Step 4: Run** the five files, then `npm test`.
  Expected: all PASS.

- [ ] **Step 5: Commit** "feat: Import a goal, Add from AI and Paste tasks entry points; Copy as markdown in the goal menu", with the co-author line.

### Task 7: Whole-app check

- [ ] **Step 1:** Run `npm test`, `npm run typecheck` and `npm run build`. All must pass.
- [ ] **Step 2: `CLAUDE.md` Architecture.** Add: "- Import: `src/core/importPlan.ts` — the markdown Ember reads from an AI chat (goal / next steps / tasks), paste-back matching (adds only, by title), copy-out and prompts. Ember never calls an AI: it copies a prompt and parses the paste locally. Undo of an import uses the `'import'` DeleteKey."
- [ ] **Step 3: Browser check** on port 5299 (`npx vite --port 5299`), with demo data:
  - **Import a goal:** Copy prompt works; paste a realistic AI reply with chatter and fences; the preview reads it; Create opens the new goal; Undo removes it.
  - **On a goal, Add from AI:** paste the goal's own Copy as markdown output and see "already there" everywhere with nothing to add; add a new step and milestone; Undo.
  - **Today, Paste tasks:** a list with dates, a deadline, a tag and a goal link creates the tasks; Undo.
  - **Narrow width (390px):** the panel fits with no horizontal scroll.
  - Stop the server afterwards.
- [ ] **Step 4: Commit** "docs: import in the architecture notes", with the co-author line.
