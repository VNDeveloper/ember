import type { Goal, Milestone, Step, StepTarget } from './model'

export const isMilestoneDone = (m: Milestone): boolean => m.steps.length > 0 && m.steps.every((s) => s.doneOn != null)

export interface GoalStats { done: number; total: number; pct: number; milestonesDone: number; currentIndex: number }

export function goalStats(g: Goal): GoalStats {
  const all = g.milestones.flatMap((m) => m.steps)
  const done = all.filter((s) => s.doneOn != null).length
  return {
    done,
    total: all.length,
    pct: all.length ? Math.round((done / all.length) * 100) : 0,
    milestonesDone: g.milestones.filter(isMilestoneDone).length,
    /** First milestone with an open step (or no steps); -1 when all are done. */
    currentIndex: g.milestones.findIndex((m) => !isMilestoneDone(m)),
  }
}

export interface OpenStep { milestone: Milestone; mi: number; step: Step; si: number }

/** First open step of the goal, in roadmap order. */
export function nextOpenStep(g: Goal): OpenStep | null {
  for (let mi = 0; mi < g.milestones.length; mi++) {
    const milestone = g.milestones[mi]
    const si = milestone.steps.findIndex((s) => s.doneOn == null)
    if (si >= 0) return { milestone, mi, step: milestone.steps[si], si }
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

/** The next open step after `stepId` in roadmap order — Focus mode's "Then:" line. */
export function stepAfter(g: Goal, stepId: string): Step | null {
  let past = false
  for (const m of g.milestones) {
    for (const s of m.steps) {
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
