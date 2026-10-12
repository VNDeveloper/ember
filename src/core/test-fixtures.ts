import { fromISO, type ISODate } from './dates'
import type { EmberData, FocusLog, Goal, Resource, StepTarget, Target, Task } from './model'
import { DEFAULT_SETTINGS } from './model'
import { idleTimer } from './timer'

type StepSpec = [title: string, doneOn: ISODate | null]
type MilestoneSpec = [title: string, steps: StepSpec[]]

/** Readable ids: goal = title, milestone = "goal/ms", step = "goal/ms/step". Every step is estimated at 50m. */
export function goalFixture(title: string, milestones: MilestoneSpec[]): Goal {
  return {
    id: title,
    title,
    outcome: '',
    createdAt: '2026-01-01',
    milestones: milestones.map(([mt, steps]) => ({
      id: `${title}/${mt}`,
      title: mt,
      steps: steps.map(([st, doneOn]) => ({ id: `${title}/${mt}/${st}`, title: st, doneOn, estMin: 50 })),
    })),
  }
}

export function taskFixture(title: string, patch: Partial<Task> = {}): Task {
  return { id: title, title, tag: 'Work', goalId: null, date: '2026-09-23', deadline: false, doneOn: null, ...patch }
}

/** id = title; a free, in-use course at example.com with no goal. */
export function resourceFixture(title: string, patch: Partial<Resource> = {}): Resource {
  return {
    id: title, title, url: `https://example.com/${encodeURIComponent(title)}`, company: 'Example', type: 'course',
    status: 'using', goalId: null, billing: 'free', price: null, renewsOn: null, notes: '', createdAt: '2026-09-01',
    ...patch,
  }
}

export function dataFixture(patch: Partial<EmberData> = {}): EmberData {
  return {
    goals: [],
    tasks: [],
    logs: [],
    selection: null,
    timer: idleTimer('25/5'),
    settings: { ...DEFAULT_SETTINGS },
    ...patch,
  }
}

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
