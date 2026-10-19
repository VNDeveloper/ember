/** Plan with your AI: the markdown Ember reads back (a goal or a task list), what it writes out, and the prompts. Pure. */
import { addDays, isRealDate, type ISODate } from './dates'
import { isLive } from './goals'
import { clampHabit } from './habits'
import type { Goal } from './model'

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
