import type { ISODate } from './dates'
import { repairHabit } from './habits'
import type { Goal, GoalStatus, Milestone, Step, StepTarget } from './model'

/** Soft-deleted items keep their data for history but drop out of every live view. */
export const isLive = (x: { deletedOn?: ISODate | null }): boolean => !x.deletedOn

const STATUSES: GoalStatus[] = ['active', 'paused', 'achieved']
export const goalStatus = (g: Goal): GoalStatus => (STATUSES.includes(g.status as GoalStatus) ? (g.status as GoalStatus) : 'active')
/** Live and active: the goals offered for focus (Working on, the picker). */
export const isActiveGoal = (g: Goal): boolean => isLive(g) && goalStatus(g) === 'active'

/** Saved or synced goals: an unknown status becomes active; achievedOn stays only on achieved goals. Valid goals come back as is. */
function repairStatus(g: Goal): Goal {
  const status = goalStatus(g)
  const badStatus = g.status !== undefined && (g.status !== status || status === 'active')
  const strayDate = 'achievedOn' in g && status !== 'achieved'
  if (!badStatus && !strayDate) return g
  const { status: _s, achievedOn: _a, ...rest } = g
  return status === 'active' ? rest : status === 'paused' ? { ...rest, status } : { ...rest, status, achievedOn: g.achievedOn ?? null }
}

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

/** Repairs a goal's status, plan fields and habit; a valid goal comes back as the same object. */
export function repairGoal(g: Goal): Goal {
  const s = repairPlan(repairStatus(g))
  if (s.habit === undefined || s.habit === null) return s
  const habit = repairHabit(s.habit)
  if (habit === s.habit) return s
  const { habit: _h, ...rest } = s
  return habit ? { ...rest, habit } : rest
}

/** Goals a task can link to: active and paused, plus its current goal if achieved (so editing never unlinks it). */
export const goalOptions = (goals: Goal[], currentId: string | null = null): Goal[] =>
  goals.filter((g) => isLive(g) && (goalStatus(g) !== 'achieved' || g.id === currentId))
export const liveMilestones = (g: Goal): Milestone[] => g.milestones.filter(isLive)
export const liveSteps = (m: Milestone): Step[] => m.steps.filter(isLive)

export const isMilestoneDone = (m: Milestone): boolean => {
  const steps = liveSteps(m)
  return steps.length > 0 && steps.every((s) => s.doneOn != null)
}

export interface GoalStats { done: number; total: number; pct: number; milestonesDone: number; currentIndex: number }

export function goalStats(g: Goal): GoalStats {
  const milestones = liveMilestones(g)
  const all = milestones.flatMap(liveSteps)
  const done = all.filter((s) => s.doneOn != null).length
  return {
    done,
    total: all.length,
    pct: all.length ? Math.round((done / all.length) * 100) : 0,
    milestonesDone: milestones.filter(isMilestoneDone).length,
    /** First live milestone with an open step (or no steps); -1 when all are done. */
    currentIndex: milestones.findIndex((m) => !isMilestoneDone(m)),
  }
}

export interface OpenStep { milestone: Milestone; mi: number; step: Step; si: number }

/** First open step of the goal, in roadmap order; mi / si are positions among live items. */
export function nextOpenStep(g: Goal): OpenStep | null {
  const milestones = liveMilestones(g)
  for (let mi = 0; mi < milestones.length; mi++) {
    const milestone = milestones[mi]
    const steps = liveSteps(milestone)
    const si = steps.findIndex((s) => s.doneOn == null)
    if (si >= 0) return { milestone, mi, step: steps[si], si }
  }
  return null
}

export const stepTarget = (g: Goal, m: Milestone, s: Step): StepTarget =>
  ({ kind: 'step', goalId: g.id, msId: m.id, stepId: s.id })

export interface StepLocation { goal: Goal; gi: number; milestone: Milestone; mi: number; step: Step; si: number }

export function findStep(goals: Goal[], t: StepTarget): StepLocation | null {
  const gi = goals.findIndex((g) => g.id === t.goalId)
  if (gi < 0) return null
  const goal = goals[gi]
  const mi = goal.milestones.findIndex((m) => m.id === t.msId)
  if (mi < 0) return null
  const milestone = goal.milestones[mi]
  const si = milestone.steps.findIndex((s) => s.id === t.stepId)
  if (si < 0) return null
  return { goal, gi, milestone, mi, step: milestone.steps[si], si }
}

/** The step and its milestone and goal all exist and none is deleted. */
export function isStepLive(goals: Goal[], t: StepTarget): boolean {
  const loc = findStep(goals, t)
  return !!loc && isLive(loc.goal) && isLive(loc.milestone) && isLive(loc.step)
}

/** The next open step after `stepId` in roadmap order — Focus mode's "Then:" line. */
export function stepAfter(g: Goal, stepId: string): Step | null {
  let past = false
  for (const m of liveMilestones(g)) {
    for (const s of liveSteps(m)) {
      if (s.id === stepId) past = true
      else if (past && s.doneOn == null) return s
    }
  }
  return null
}

export const GOAL_COLORS = [
  'var(--color-accent)',
  'var(--color-text)',
  'var(--color-accent-300)',
  'var(--color-neutral-500)',
] as const

export const goalColor = (gi: number): string => GOAL_COLORS[gi % GOAL_COLORS.length]
