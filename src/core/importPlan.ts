/** Plan with your AI: the markdown Ember reads back (a goal or a task list), what it writes out, and the prompts. Pure. */
import { addDays, isRealDate, type ISODate } from './dates'
import { fmtM, plural } from './format'
import { goalLedger } from './goalView'
import { goalStatus, isLive, liveMilestones, liveSteps } from './goals'
import { clampHabit, liveHabit, targetText } from './habits'
import type { FocusLog, Goal } from './model'
import { paceView } from './pace'

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
const TASKS_HEADING = /^(?:tasks|task list|to-?do list|to-?dos?)\s*:?$/i
const GOAL_PREFIX = /^goal\s*(?::|\s[—–-])\s*/i

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
  const out = s.replace(/^(?:(?:milestone|phase|stage|part|week)(?:\s+\d+)?\s*(?::|\.|\s[—–-])|\d{1,3}[.):])\s*/i, '').trim()
  return out || s.trim()
}

export function splitLines(input: string): { lines: string[]; cut: Skipped | null } {
  const over = input.length > LIMITS.chars
  const lines = (over ? input.slice(0, LIMITS.chars) : input).split(/\r?\n/)
  return { lines, cut: over ? { line: lines.length, text: '', reason: 'paste cut at 50 000 characters' } : null }
}

/** When a reply wraps the plan in a code block, only that block counts: the AI's notes and tips around it are ignored. */
function planLines(lines: string[], want: 'goal' | 'tasks'): { lines: string[]; offset: number } {
  for (let i = 0; i < lines.length; i++) {
    if (!FENCE.test(lines[i])) continue
    let end = i + 1
    while (end < lines.length && !FENCE.test(lines[end])) end++
    const body = lines.slice(i + 1, end)
    if (body.some((l) => (want === 'goal' ? HEADING.test(l) : BULLET.test(l)))) return { lines: body, offset: i + 1 }
    i = end
  }
  return { lines, offset: 0 }
}

export function cutTitle(title: string, line: number, raw: string, skipped: Skipped[]): string {
  if (title.length <= LIMITS.title) return title
  skipped.push({ line, text: raw.trim(), reason: `title cut to ${LIMITS.title} characters` })
  return title.slice(0, LIMITS.title).trimEnd()
}

/**
 * By the first heading: "# Tasks" is a task list; a "#" heading or one starting "Goal:" is a goal.
 * Any other "##" heading (a milestone, or a task list grouped by day) is left to the panel.
 */
export function detectKind(input: string): 'goal' | 'tasks' | null {
  for (const raw of planLines(splitLines(input).lines, 'goal').lines) {
    const h = HEADING.exec(raw)
    if (!h) continue
    const text = stripMarks(h[2])
    if (TASKS_HEADING.test(text)) return 'tasks'
    return h[1].length === 1 || GOAL_PREFIX.test(text) ? 'goal' : null
  }
  return null
}

/** A goal (or the next part of one). Null when there's no heading, milestone or step at all. */
export function parseGoal(input: string): GoalPlan | null {
  const skipped: Skipped[] = []
  const skip = (line: number, raw: string, reason: string) => skipped.push({ line, text: raw.trim(), reason })
  const { lines: all, cut } = splitLines(input)
  const { lines, offset } = planLines(all, 'goal')
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
  let fenced = false

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const line = i + 1 + offset
    if (FENCE.test(raw)) {
      // A plan wrapped in a code block ends at its closing fence: what follows is the AI's tips.
      if (started && fenced) break
      if (!started) fenced = true
      continue
    }
    if (!raw.trim() || RULE.test(raw)) continue
    const h = HEADING.exec(raw)
    if (h) {
      started = true
      const text = stripMarks(h[2])
      const named = GOAL_PREFIX.test(text) ? text.replace(GOAL_PREFIX, '').trim() : null
      if (title === null && milestones.length === 0 && (h[1].length === 1 || named)) {
        title = cutTitle(named || text, line, raw, skipped)
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

export interface TaskPlan {
  title: string; date: ISODate | null; deadline: boolean; tag: string; goalId: string | null; line: number
  notes: string[]
}

/** One task per bullet; the parts after "|" come in any order. A past date becomes today; no date is Someday. */
export function parseTasks(input: string, goals: Goal[], today: ISODate): { tasks: TaskPlan[]; skipped: Skipped[] } {
  const skipped: Skipped[] = []
  const skip = (line: number, raw: string, reason: string) => skipped.push({ line, text: raw.trim(), reason })
  const { lines: all, cut } = splitLines(input)
  const { lines, offset } = planLines(all, 'tasks')
  const live = goals.filter(isLive)
  const tasks: TaskPlan[] = []
  let baseIndent = -1
  let fenced = false
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const line = i + 1 + offset
    if (FENCE.test(raw)) {
      if (fenced && tasks.length) break
      if (!tasks.length) fenced = true
      continue
    }
    if (!raw.trim() || RULE.test(raw) || HEADING.test(raw)) continue
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

// — paste-back —
export type FieldMatch = 'fill' | 'kept' | 'none'
export interface MilestoneMatch { msId: string | null; steps: ('new' | 'there')[] }
export interface PlanMatch { milestones: MilestoneMatch[]; outcome: FieldMatch; finishBy: FieldMatch; habit: FieldMatch }

/** Which plan milestones and steps the goal already has (by title), and which of its fields the paste would fill. */
/** A milestone's name without "Milestone 1:"-style prefixes or a trailing estimate, so hand-named milestones match their own copy. */
const milestoneKey = (title: string): string => normTitle(splitEstimate(cleanMilestone(stripMarks(title))).title)

export function matchPlan(goal: Goal, plan: GoalPlan): PlanMatch {
  const live = liveMilestones(goal)
  // One live milestone per plan milestone, in order; an exact title wins, the cleaned name is the fallback.
  const used = new Set<string>()
  const find = (t: string) => {
    const free = live.filter((x) => !used.has(x.id))
    const m = free.find((x) => normTitle(x.title) === normTitle(t)) ?? free.find((x) => milestoneKey(x.title) === milestoneKey(t)) ?? null
    if (m) used.add(m.id)
    return m
  }
  const field = (inPaste: boolean, has: boolean): FieldMatch => (!inPaste ? 'none' : has ? 'kept' : 'fill')
  return {
    milestones: plan.milestones.map((pm) => {
      const m = find(pm.title)
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
  '- Record a 1-minute self-introduction and play it back (30m)',
  '',
  '## Everyday conversation',
  '- Learn the 100 most common verbs (2h 30m)',
  '- Review the verbs with flashcards until 90% stick (30m)',
  '- Order a meal in a role-play with a tutor (1h)',
  '',
  '## Real conversations (6h)',
].join('\n')

const STEP_RULES = [
  '- Each milestone is a "## " heading, in the order I\'ll do them.',
  '- Each step is a "- " bullet: one concrete action under 3 hours, with its time in brackets at the end, like (45m) or (1h 30m).',
  '- A milestone too far off to plan in detail can have no steps and a rough time in its heading, like "## Real conversations (6h)".',
  '- No nested bullets inside the plan.',
]
const STEP_QUALITY = '- Mix learning, practice and review, and make each step\'s title say what "done" looks like.'
const ASK_FIRST = 'If anything important is missing or unclear, ask me up to 3 short questions first and wait for my answers.'

export function goalPrompt(today: ISODate): string {
  return [
    'My goal: [what you want to achieve]',
    'Where I am now: [e.g. complete beginner, or I know the basics]',
    'Time I have: [e.g. about 4h a week, ideally done by March]',
    '',
    'I track my learning in an app that imports a plan in the markdown format below.',
    ASK_FIRST,
    'Then give me the plan in ONE ```markdown code block, in exactly this format, and after the block a few lines on your approach, what to watch out for, and good resources to use.',
    '',
    'Format:',
    '',
    '```markdown',
    EXAMPLE_GOAL,
    '```',
    '',
    'Rules:',
    '- Start with "# Goal: " and a short name for the goal.',
    '- "Outcome:" is one sentence: what I\'ll be able to do when it\'s done.',
    '- "Finish by:" (a date as YYYY-MM-DD) and "Habit:" (minutes on a number of days a week, like "25m on 5 days a week") are optional.',
    '- 3–7 milestones, each building on the last; end each with a step that proves it (a small project, a test, a recording).',
    '- 3–7 steps per milestone.',
    STEP_QUALITY,
    '- Estimates honest for someone at my level.',
    ...STEP_RULES,
    '- Keep notes and suggestions outside the code block.',
    `- Today is ${today}.`,
  ].join('\n')
}

const inMyWords = (s: string): string => s.replace(/^You usually/, 'I usually').replace(/^Your estimates/, 'My estimates')

/** How a goal is going, for the next-steps prompt: focus so far, how estimates turn out, what's left, pace and finish-by. */
export function progressNotes(goal: Goal, logs: FocusLog[], spent: Map<string, number>, today: ISODate): string[] {
  const ledger = goalLedger(goal, spent)
  const notes = [`Focused so far: ${ledger.focused} of an estimated ${ledger.estimated}.`]
  const pv = paceView(goal, logs, spent, today)
  if (!pv) return notes
  if (pv.paused) return [...notes, 'This goal is paused right now.']
  if (pv.correction) notes.push(`How my estimates turn out: ${inMyWords(pv.correction)}.`)
  notes.push(`Left to go: ${pv.left}${pv.unplanned ? ` (${pv.unplanned})` : ''}.`)
  notes.push(`Pace: ${pv.pace}${pv.atPace ? `; at this pace I'd finish ${pv.atPace}` : ''}.`)
  if (pv.atHabit) notes.push(`If I keep my habit I'd finish ${pv.atHabit}.`)
  const fb = pv.finishBy
  if (fb) notes.push(`Finish by: ${fb.text}${fb.verdict ? ` (${fb.verdict})` : ''}${fb.need ? `; to make it I'd need ${fb.need}` : ''}.`)
  return notes
}

export function nextStepsPrompt(goal: Goal, today: ISODate, progress: string[] = []): string {
  return [
    'What I want next: [e.g. plan the next phase, or break down milestones without steps]',
    '',
    'I track my learning in an app that imports a plan in the markdown format below. Here is my goal as it stands; steps marked [x] are done.',
    '',
    ...(progress.length ? ["How it's going:", ...progress.map((n) => `- ${n}`), ''] : []),
    '```markdown',
    goalMarkdown(goal).trimEnd(),
    '```',
    '',
    ASK_FIRST,
    'Then reply with the whole goal in ONE ```markdown code block, in the same format, and after the block a few lines on what you added and why.',
    'The app only adds: keep my existing milestones and steps exactly as written (it matches them by title), and add new steps under them or new milestones after them. If you think an existing step should change, say so in your notes instead.',
    '',
    'Rules:',
    '- 3–7 steps per milestone; end each new milestone with a step that proves it.',
    STEP_QUALITY,
    ...(progress.length ? ["- Size new steps for how I actually work (see how it's going)."] : []),
    ...STEP_RULES,
    `- Today is ${today}.`,
  ].join('\n')
}

export function tasksPrompt(goals: Goal[], today: ISODate): string {
  const names = goals.filter((g) => isLive(g) && goalStatus(g) !== 'achieved').map((g) => `- ${g.title}`)
  return [
    'What I need to do: [list or describe it]',
    '',
    'I keep my to-do list in an app that imports tasks in the markdown format below. Turn what I need to do into tasks.',
    'Give me the list in ONE ```markdown code block, in exactly this format, and after the block anything you\'d suggest (what to do first, what to drop).',
    '',
    'Format:',
    '',
    '```markdown',
    '# Tasks',
    '- Book a trial lesson | tomorrow | #Admin | goal: Speak conversational Spanish',
    '- Renew passport | 2026-11-02 | deadline',
    '- Read about learning plateaus',
    '```',
    '',
    'Rules:',
    '- One "- " bullet per task, starting with a short title that begins with a verb.',
    '- After the title, optional parts separated by " | ": when (today, tomorrow, or a date as YYYY-MM-DD; leave it out for someday), "deadline" if that date is a hard deadline, a tag like #Admin, and "goal: " with one of my goals below when the task is for it.',
    '- Split anything over about 2 hours into smaller tasks, and add any obvious tasks I\'ve missed.',
    '- No nested bullets inside the list.',
    `- Today is ${today}.`,
    '',
    ...(names.length ? ['My goals:', ...names] : ['I have no goals in the app yet, so leave out "goal:".']),
  ].join('\n')
}
