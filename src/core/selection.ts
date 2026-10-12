import { fmtM, pad2 } from './format'
import { findStep, isLive, isStepLive, liveMilestones, stepAfter } from './goals'
import type { Goal, Selection, Target, Task } from './model'
import { targetKey } from './model'

export interface SelectionInfo { title: string; sub: string; empty: boolean }

export const EMPTY_SELECTION: SelectionInfo = {
  title: 'Pick a task or step to focus on',
  sub: 'Press the timer icon on any row',
  empty: true,
}

/** Focus-bar title and context line for the selected task or step. */
export function describeSelection(goals: Goal[], tasks: Task[], sel: Selection, spent: Map<string, number>): SelectionInfo {
  if (!sel) return EMPTY_SELECTION
  const min = spent.get(targetKey(sel)) ?? 0
  if (sel.kind === 'step') {
    const loc = findStep(goals, sel)
    if (!loc || !isStepLive(goals, sel)) return EMPTY_SELECTION
    return {
      title: loc.step.title,
      sub: `${loc.goal.title} · ${pad2(liveMilestones(loc.goal).indexOf(loc.milestone) + 1)} ${loc.milestone.title} · ${fmtM(min)} of est. ${fmtM(loc.step.estMin)}`,
      empty: false,
    }
  }
  const task = tasks.find((t) => t.id === sel.taskId)
  if (!task || !isLive(task)) return EMPTY_SELECTION
  const goal = task.goalId ? goals.find((g) => g.id === task.goalId && isLive(g)) : undefined
  const head = goal ? `${goal.title} · task` : task.tag ? `Task · ${task.tag}` : 'Task'
  return { title: task.title, sub: `${head}${min ? ` · ${fmtM(min)} focused` : ''}`, empty: false }
}

/** Title of a focus log's target, for the toast and activity log. */
export function targetTitle(goals: Goal[], tasks: Task[], t: Target | null): string {
  if (!t) return 'Unassigned'
  if (t.kind === 'step') return findStep(goals, t)?.step.title ?? 'Unassigned'
  return tasks.find((x) => x.id === t.taskId)?.title ?? 'Unassigned'
}

/** Focus mode's "Then: …" line: the next open step after the selected one. */
export function nextStepText(goals: Goal[], sel: Selection): string {
  if (sel?.kind !== 'step') return ''
  const loc = findStep(goals, sel)
  if (!loc || !isStepLive(goals, sel)) return ''
  const next = stepAfter(loc.goal, loc.step.id)
  return next ? `Then: ${next.title}` : ''
}

/** The live goal the current selection belongs to: a step's goal, or a task's linked goal. */
export function selectionGoalId(goals: Goal[], tasks: Task[], sel: Selection): string | null {
  if (!sel) return null
  const id = sel.kind === 'step' ? sel.goalId : tasks.find((t) => t.id === sel.taskId && isLive(t))?.goalId
  return id && goals.some((g) => g.id === id && isLive(g)) ? id : null
}
