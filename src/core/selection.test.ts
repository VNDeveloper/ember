import { describe, expect, it } from 'vitest'
import type { StepTarget } from './model'
import { EMPTY_SELECTION, describeSelection, nextStepText, targetTitle } from './selection'
import { goalFixture, taskFixture } from './test-fixtures'

const goals = [
  goalFixture('D3', [['First charts', [['Bar', '2026-09-01'], ['Line', null]]]]),
  goalFixture('Spanish', [['Talk', [['Tutor', null]]]]),
]
const tasks = [taskFixture('Review PR'), taskFixture('Paper', { goalId: 'Spanish', tag: '' })]
const LINE: StepTarget = { kind: 'step', goalId: 'D3', msId: 'D3/First charts', stepId: 'D3/First charts/Line' }

describe('describeSelection', () => {
  it('shows the empty state with nothing selected', () => {
    expect(describeSelection(goals, tasks, null, new Map())).toEqual({
      title: 'Pick a task or step to focus on', sub: 'Press the timer icon on any row', empty: true,
    })
  })

  it('describes a step with its goal, milestone and time against estimate', () => {
    const spent = new Map([['step:D3/First charts/Line', 50]])
    expect(describeSelection(goals, tasks, LINE, spent)).toEqual({
      title: 'Line', sub: 'D3 · 01 First charts · 50m of est. 50m', empty: false,
    })
  })

  it('describes a goal task and a plain task, adding focused time when there is some', () => {
    const paper = { kind: 'task', taskId: 'Paper' } as const
    expect(describeSelection(goals, tasks, paper, new Map()).sub).toBe('Spanish · task')
    expect(describeSelection(goals, tasks, paper, new Map([['task:Paper', 25]])).sub).toBe('Spanish · task · 25m focused')
    expect(describeSelection(goals, tasks, { kind: 'task', taskId: 'Review PR' }, new Map()).sub).toBe('Task · Work')
  })

  it('falls back to the empty state for a missing item', () => {
    expect(describeSelection(goals, tasks, { kind: 'task', taskId: 'gone' }, new Map())).toBe(EMPTY_SELECTION)
    expect(describeSelection(goals, tasks, { ...LINE, stepId: 'gone' }, new Map())).toBe(EMPTY_SELECTION)
  })
})

describe('targetTitle', () => {
  it('names a log target, or Unassigned', () => {
    expect(targetTitle(goals, tasks, LINE)).toBe('Line')
    expect(targetTitle(goals, tasks, { kind: 'task', taskId: 'Paper' })).toBe('Paper')
    expect(targetTitle(goals, tasks, null)).toBe('Unassigned')
    expect(targetTitle(goals, tasks, { kind: 'task', taskId: 'gone' })).toBe('Unassigned')
  })
})

describe('nextStepText', () => {
  const roadmap = [goalFixture('D3', [
    ['First charts', [['Bar', '2026-09-01'], ['Line', null], ['Scatter', null]]],
    ['Motion', [['Easing', null]]],
  ])]
  const step = (ms: string, s: string): StepTarget => ({ kind: 'step', goalId: 'D3', msId: `D3/${ms}`, stepId: `D3/${ms}/${s}` })

  it('names the next open step, across milestones', () => {
    expect(nextStepText(roadmap, step('First charts', 'Line'))).toBe('Then: Scatter')
    expect(nextStepText(roadmap, step('First charts', 'Scatter'))).toBe('Then: Easing')
  })

  it('is empty for the last step, a task, nothing, or a missing step', () => {
    expect(nextStepText(roadmap, step('Motion', 'Easing'))).toBe('')
    expect(nextStepText(roadmap, { kind: 'task', taskId: 'x' })).toBe('')
    expect(nextStepText(roadmap, null)).toBe('')
    expect(nextStepText(roadmap, step('Motion', 'gone'))).toBe('')
  })
})
