import {
  addDays, dayOfYear, daysInYear, fromISO, isWeekend, startOfYear, todayISO, yearOf, type ISODate,
} from './dates'
import { hashStr } from './format'
import { nextOpenStep, stepTarget } from './goals'
import { uid } from './ids'
import type { EmberData, FocusLog, Goal, Settings, Target, Task } from './model'
import { DEFAULT_SETTINGS } from './model'
import { idleTimer } from './timer'

/** The prototype's Park–Miller generator, so history matches its HIST / FOCUS shapes. */
const rng = (seed: number) => {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

// [title, tag, done today, day offset (null = Someday), deadline, goal index]
type TaskSeed = [string, string, boolean, number | null, boolean, number | null]
const TASKS: TaskSeed[] = [
  ['Send Q3 invoice to Halden & Co.', 'Work', true, 0, true, null],
  ['Water the plants', 'Home', true, 0, false, null],
  ['Book dentist appointment', 'Health', false, -2, false, null],
  ['Renew car insurance', 'Personal', false, 0, true, null],
  ['Book Spanish tutor for October', '', false, 0, false, 1],
  ['Review pull request #482', 'Work', false, 0, false, null],
  ['30-minute run', 'Health', false, 0, false, null],
  ['Call the landlord about the boiler', 'Home', false, 1, false, null],
  ['Submit September expenses', 'Work', false, 2, true, null],
  ['Order cold-press paper', '', false, 3, false, 2],
  ['Plan Q4 roadmap review', 'Work', false, 5, false, null],
  ['Pay council tax', 'Personal', false, 6, true, null],
  ['Buy Mum’s birthday present', 'Personal', false, 9, true, null],
  ['Car service', 'Home', false, 16, false, null],
  ['Try a sourdough starter', 'Home', false, null, false, null],
  ['Read “Visual Display of Quantitative Information”', '', false, null, false, 0],
  ['Sort out old phone photos', 'Personal', false, null, false, null],
]

// [step title, weeks ago it was done (omitted = open)]
type StepSeed = [string, number?]
type GoalSeed = [string, string, [string, StepSeed[]][]]
const GOALS: GoalSeed[] = [
  ['Learn D3.js', 'Build and publish an interactive, animated chart of a real dataset — starting from a blank file, no tutorial open.', [
    ['Foundations', [['SVG shapes & paths', 11], ['Selections & data joins', 10], ['Scales & axes', 9]]],
    ['First charts', [['Bar chart from a CSV', 7], ['Line chart with tooltips', 5], ['Scatter plot with zoom', 2], ['Reusable chart function']]],
    ['Motion & interaction', [['Transitions & easing'], ['Keyed enter / update / exit'], ['Brushing & linked views']]],
    ['Capstone', [['Choose a dataset'], ['Sketch the chart on paper'], ['Build it'], ['Publish & write it up']]],
  ]],
  ['Speak Spanish at B1', 'Hold a 20-minute conversation with a native speaker on everyday topics without switching to English.', [
    ['Basics', [['Present tense', 11], ['500 core words', 10], ['Pronunciation drills', 8]]],
    ['Past tenses', [['Preterite', 6], ['Imperfect', 4], ['Preterite vs imperfect', 3]]],
    ['Conversation', [['8 tutor sessions', 1], ['A series with Spanish subtitles', 0], ['30-day journal']]],
    ['Exam', [['Mock DELE B1 paper'], ['Book the exam']]],
  ]],
  ['Learn watercolour', 'Paint a finished landscape from one of my own photos — good enough to frame.', [
    ['Control', [['Flat & graded washes', 9], ['Wet-on-wet', 6], ['Colour mixing chart', 2]]],
    ['Studies', [['Ten skies'], ['Trees & foliage'], ['Water reflections']]],
    ['Final piece', [['Pick the photo'], ['Value sketch'], ['Paint it']]],
  ]],
]

const HISTORY_TITLES = [
  'Inbox zero', 'Weekly review', 'Groceries', 'Reply to emails', 'Laundry', 'Pay bills', 'Gym session',
  'Tidy the desk', 'Call home', 'Meal prep', 'Read 20 pages', 'Update the budget', 'Back up the laptop',
  'Plan the week', 'Clean the kitchen',
]
const HISTORY_TAGS = ['Work', 'Home', 'Health', 'Personal']

const SESSION = 25
const MIN = 60_000

/** Week 0 means yesterday, as in the prototype's L_W. */
const weeksAgo = (today: ISODate, w: number): ISODate => addDays(today, -(w * 7 + (w === 0 ? 1 : 0)))

export function buildSeed(now: number = Date.now()): EmberData {
  const today = todayISO(now)
  const logs: FocusLog[] = []
  const addLog = (date: ISODate, slot: number, target: Target | null, at?: number) =>
    logs.push({ id: uid(), at: at ?? fromISO(date).getTime() + (9 * 60 + slot * 30) * MIN, date, min: SESSION, target })

  const goals: Goal[] = GOALS.map(([title, outcome, milestones]) => ({
    id: uid(),
    title,
    outcome,
    createdAt: addDays(today, -120),
    milestones: milestones.map(([mt, steps]) => ({
      id: uid(),
      title: mt,
      steps: steps.map(([st, w]) => ({
        id: uid(),
        title: st,
        estMin: SESSION * (2 + (hashStr(st) % 4)),
        doneOn: w == null ? null : weeksAgo(today, w),
      })),
    })),
  }))

  // Done steps took their estimate ± 25 minutes, one session a day leading up to completion.
  for (const g of goals) for (const m of g.milestones) for (const s of m.steps) {
    if (s.doneOn == null) continue
    const spent = Math.max(SESSION, s.estMin + SESSION * (((hashStr(s.title) >>> 3) % 3) - 1))
    for (let k = 0; k < spent / SESSION; k++) addLog(addDays(s.doneOn, -k), 0, stepTarget(g, m, s))
  }

  // Each goal's next open step has 50m; D3's is selected with both sessions today.
  let selection: Target | null = null
  goals.forEach((g, gi) => {
    const next = nextOpenStep(g)
    if (!next) return
    const target = stepTarget(g, next.milestone, next.step)
    if (gi === 0) {
      selection = target
      addLog(today, 0, target, now - 55 * MIN)
      addLog(today, 0, target, now - 25 * MIN)
    } else {
      addLog(addDays(today, -1), 1, target)
      addLog(addDays(today, -2), 1, target)
    }
  })

  const tasks: Task[] = TASKS.map(([title, tag, done, offset, deadline, goal]) => ({
    id: uid(),
    title,
    tag,
    goalId: goal == null ? null : goals[goal].id,
    date: offset == null ? null : addDays(today, offset),
    deadline,
    doneOn: done ? today : null,
  }))

  // Year-to-date history using the prototype's HIST (things done) and FOCUS (minutes) formulas.
  const stepsDone = new Map<ISODate, number>()
  for (const g of goals) for (const m of g.milestones) for (const s of m.steps) {
    if (s.doneOn) stepsDone.set(s.doneOn, (stepsDone.get(s.doneOn) ?? 0) + 1)
  }
  const placed = new Map<ISODate, number>()
  for (const l of logs) placed.set(l.date, (placed.get(l.date) ?? 0) + l.min)

  const year0 = startOfYear(today)
  const todayIdx = dayOfYear(today)
  const yearLen = daysInYear(yearOf(today))
  const doneR = rng(11)
  const focusR = rng(7)
  const pickR = rng(3)
  const history: Task[] = []

  for (let i = 0; i < todayIdx; i++) {
    const date = addDays(year0, i)
    const weekend = isWeekend(date)
    const trend = i / yearLen

    const skipDone = i < todayIdx - 18 && doneR() < (weekend ? 0.35 : 0.1)
    const done = skipDone ? 0 : Math.max(1, Math.round((weekend ? 2 : 4.5) * (0.55 + trend * 0.7) * (0.5 + doneR())))
    const dayTasks: Task[] = []
    for (let k = 0; k < done - (stepsDone.get(date) ?? 0); k++) {
      dayTasks.push({
        id: uid(),
        title: HISTORY_TITLES[Math.floor(pickR() * HISTORY_TITLES.length)],
        tag: HISTORY_TAGS[Math.floor(pickR() * HISTORY_TAGS.length)],
        goalId: null,
        date,
        deadline: false,
        doneOn: date,
      })
    }
    history.push(...dayTasks)

    const skipFocus = i < todayIdx - 12 && focusR() < (weekend ? 0.55 : 0.18)
    const focus = skipFocus ? 0 : SESSION * Math.max(1, Math.round((weekend ? 1.5 : 3) * (0.6 + trend * 0.8) * (0.4 + focusR())))
    const sessions = Math.max(0, Math.round((focus - (placed.get(date) ?? 0)) / SESSION))
    for (let k = 0; k < sessions; k++) {
      const t = dayTasks[k % Math.max(1, dayTasks.length)]
      addLog(date, k + 2, t ? { kind: 'task', taskId: t.id } : null)
    }
  }

  return {
    goals,
    tasks: [...history, ...tasks],
    logs: logs.sort((a, b) => a.at - b.at),
    selection,
    timer: idleTimer('25/5'),
    settings: { ...DEFAULT_SETTINGS },
  }
}

/** Nothing tracked yet: what "Delete data" leaves behind. Settings are preferences, so they stay. */
export const emptyData = (settings: Settings): EmberData => ({
  goals: [], tasks: [], logs: [], selection: null, timer: idleTimer(settings.session), settings,
})
