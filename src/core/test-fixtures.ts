import type { ISODate } from './dates'
import type { EmberData, Goal, Task } from './model'
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
