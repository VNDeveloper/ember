import { describe, expect, it } from 'vitest'
import { doneByDay } from './activity'
import { activityLog, doneWall } from './activityView'
import { goalStats, isStepLive, nextOpenStep, stepAfter } from './goals'
import { goalKicker, goalList, goalTasks, roadmap } from './goalView'
import type { Goal } from './model'
import { pickerSections } from './picker'
import { describeSelection, nextStepText } from './selection'
import { tallyLogs } from './tally'
import { goalFixture, logFixture, stepRef, taskFixture } from './test-fixtures'
import { todayList, upcomingGroups, upcomingSummary, workingOn } from './today'

const TODAY = '2026-09-23'
const d3 = (): Goal => goalFixture('D3', [
  ['First charts', [['Bar', '2026-09-01'], ['Line', null], ['Scatter', null]]],
  ['Motion', [['Easing', null]]],
])
const LINE = stepRef('D3', 'First charts', 'Line')
const SCATTER = stepRef('D3', 'First charts', 'Scatter')

describe('deleted steps and milestones', () => {
  it('drop out of progress, next step and "Then:"', () => {
    const g = d3()
    g.milestones[0].steps[1].deletedOn = TODAY
    expect(goalStats(g)).toMatchObject({ done: 1, total: 3, pct: 33 })
    expect(nextOpenStep(g)?.step.title).toBe('Scatter')
    expect(nextOpenStep(g)?.si).toBe(1)
    expect(stepAfter(g, 'D3/First charts/Bar')?.title).toBe('Scatter')
    expect(isStepLive([g], LINE)).toBe(false)
    expect(isStepLive([g], SCATTER)).toBe(true)
    expect(nextStepText([g], SCATTER)).toBe('Then: Easing')
  })

  it('a deleted milestone hides its steps and renumbers the roadmap', () => {
    const g = d3()
    g.milestones[0].deletedOn = TODAY
    expect(isStepLive([g], SCATTER)).toBe(false)
    expect(goalStats(g)).toMatchObject({ total: 1, currentIndex: 0 })
    const rows = roadmap(g, new Map(), new Map(), null)
    expect(rows.map((r) => [r.num, r.title])).toEqual([['01', 'Motion']])
    expect(rows[0].steps[0].estMin).toBe(50)
  })

  it('the goal header counts live milestones only', () => {
    const g = d3()
    g.milestones[1].deletedOn = TODAY
    expect(goalKicker(g, new Map())).toBe('Goal · 0m focused · 0 of 1 milestones')
  })

  it('roadmap rows skip deleted steps', () => {
    const g = d3()
    g.milestones[0].steps[2].deletedOn = TODAY
    const [first] = roadmap(g, new Map(), new Map(), null)
    expect(first.steps.map((s) => s.title)).toEqual(['Bar', 'Line'])
    expect(first.count).toBe('1 / 2')
    expect(first.segments).toEqual([true, false])
  })
})

describe('deleted goals', () => {
  const goals = () => {
    const a = d3()
    const b = goalFixture('Spanish', [['Talk', [['Tutor', null]]]])
    const c = goalFixture('Art', [['Paint', [['Skies', null]]]])
    a.deletedOn = TODAY
    return [a, b, c]
  }

  it('drop out of lists, Working-on and the picker, keeping other colours', () => {
    const gs = goals()
    expect(goalList(gs, new Map()).map((g) => [g.title, g.swatch])).toEqual([
      ['Spanish', 'var(--color-text)'], ['Art', 'var(--color-accent-300)'],
    ])
    expect(workingOn(gs, null).map((c) => [c.title, c.swatch])).toEqual([
      ['Spanish', 'var(--color-text)'], ['Art', 'var(--color-accent-300)'],
    ])
    expect(pickerSections(gs, [], null, 'goals', '', TODAY).map((s) => s.label)).toEqual(['Spanish', 'Art'])
    expect(describeSelection(gs, [], LINE, new Map()).empty).toBe(true)
  })

  it("keep their tasks, which fall back to the tag", () => {
    const gs = goals()
    const tasks = [taskFixture('Paper', { goalId: 'D3', tag: 'Home' })]
    const [item] = pickerSections(gs, tasks, null, 'tasks', '', TODAY)[0].items
    expect(item).toMatchObject({ title: 'Paper', meta: 'Home', outlined: true })
    expect(describeSelection(gs, tasks, { kind: 'task', taskId: 'Paper' }, new Map()).sub).toBe('Task · Home')
  })
})

describe('deleted tasks', () => {
  const tasks = () => [
    taskFixture('A'),
    taskFixture('B', { deletedOn: TODAY }),
    taskFixture('C', { date: '2026-09-25', deletedOn: TODAY }),
    taskFixture('D', { date: null, deletedOn: TODAY }),
    taskFixture('E', { goalId: 'D3', deletedOn: TODAY }),
  ]

  it('drop out of every task list', () => {
    expect(todayList(tasks(), TODAY).open.map((t) => t.title)).toEqual(['A'])
    expect(upcomingGroups(tasks(), TODAY)).toEqual([])
    expect(upcomingSummary(tasks(), TODAY)).toBe('0 planned · 0 deadlines')
    expect(goalTasks(tasks(), 'D3', TODAY)).toEqual([])
    expect(pickerSections([d3()], tasks(), null, 'tasks', '', TODAY).flatMap((s) => s.items.map((i) => i.title))).toEqual(['A'])
    expect(describeSelection([], tasks(), { kind: 'task', taskId: 'B' }, new Map()).empty).toBe(true)
  })
})

describe('history keeps deleted items', () => {
  it('counts them and marks their source', () => {
    const g = d3()
    g.deletedOn = TODAY
    const tasks = [taskFixture('Done task', { doneOn: '2026-09-22', deletedOn: TODAY })]
    const logs = [logFixture(TODAY, LINE), logFixture(TODAY, { kind: 'task', taskId: 'Done task' })]
    expect(doneByDay([g], tasks).get('2026-09-22')).toBe(1)
    expect(doneByDay([g], tasks).get('2026-09-01')).toBe(1)
    expect(tallyLogs(logs, TODAY).minutesToday).toBe(50)
    const entries = activityLog([g], tasks, logs, TODAY)
    expect(entries.map((e) => [e.text, e.src])).toEqual([
      ['Focused 25m on “Line”', 'D3 (deleted)'],
      ['Focused 25m on “Done task”', 'Task · Work (deleted)'],
      ['Completed task “Done task”', 'Task · Work (deleted)'],
      ['Completed “Bar”', 'D3 (deleted)'],
    ])
    const wall = doneWall([g], tasks, TODAY, 4)
    expect(wall.headline).toBe('2 things finished')
    expect(wall.legend).toEqual([])
  })
})
