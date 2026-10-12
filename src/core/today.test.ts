import { describe, expect, it } from 'vitest'
import type { StepTarget, Task } from './model'
import { goalColor } from './goals'
import { goalFixture, resourceFixture, taskFixture } from './test-fixtures'
import { isLate, taskNote, todayList, upcomingGroups, upcomingSummary, workingOn } from './today'

const TODAY = '2026-09-23'
const titles = (ts: Task[]) => ts.map((t) => t.title)

describe('taskNote', () => {
  it('says Someday only where dates are shown', () => {
    expect(taskNote(taskFixture('a', { date: null }), TODAY)).toBeNull()
    expect(taskNote(taskFixture('a', { date: null }), TODAY, true)).toEqual({ text: 'Someday', accent: false })
  })

  it('rolls over quietly without a deadline, and flags a missed deadline', () => {
    expect(taskNote(taskFixture('a', { date: '2026-09-21' }), TODAY)).toEqual({ text: 'From Sep 21', accent: false })
    expect(taskNote(taskFixture('a', { date: '2026-09-21', deadline: true }), TODAY)).toEqual({ text: 'Deadline passed · Sep 21', accent: true })
    expect(taskNote(taskFixture('a', { date: '2026-09-21', doneOn: TODAY }), TODAY)).toBeNull()
  })

  it('names deadlines', () => {
    expect(taskNote(taskFixture('a', { deadline: true }), TODAY)).toEqual({ text: 'Due today', accent: true })
    expect(taskNote(taskFixture('a', { date: '2026-09-24', deadline: true }), TODAY)).toEqual({ text: 'Due Tomorrow', accent: true })
    expect(taskNote(taskFixture('a', { date: '2026-09-30', deadline: true }), TODAY)).toEqual({ text: 'Due Sep 30', accent: true })
  })

  it('shows plain dates only where asked', () => {
    expect(taskNote(taskFixture('a', { date: '2026-09-24' }), TODAY)).toBeNull()
    expect(taskNote(taskFixture('a', { date: '2026-09-24' }), TODAY, true)).toEqual({ text: 'Tomorrow', accent: false })
    expect(taskNote(taskFixture('a', { date: '2026-10-09' }), TODAY, true)).toEqual({ text: 'Oct 9', accent: false })
  })
})

describe('todayList', () => {
  const tasks = [
    taskFixture('A'),
    taskFixture('B', { date: '2026-09-21' }),
    taskFixture('C', { date: '2026-09-22', deadline: true }),
    taskFixture('D', { doneOn: TODAY }),
    taskFixture('E', { date: '2026-09-22', doneOn: '2026-09-22' }),
    taskFixture('F', { date: '2026-09-24' }),
    taskFixture('G', { date: null }),
    taskFixture('H', { date: '2026-09-20', deadline: true }),
  ]

  it('shows open tasks dated today or earlier, missed deadlines first, plus tasks done today', () => {
    const list = todayList(tasks, TODAY)
    expect(titles(list.open)).toEqual(['C', 'H', 'A', 'B'])
    expect(titles(list.done)).toEqual(['D'])
    expect(isLate(tasks[2], TODAY)).toBe(true)
    expect(isLate(tasks[1], TODAY)).toBe(false)
  })

  it('after midnight, rolls unfinished tasks over and drops what was done yesterday', () => {
    const list = todayList(tasks, '2026-09-24')
    expect(titles(list.open)).toEqual(['C', 'H', 'A', 'B', 'F'])
    expect(titles(list.done)).toEqual([])
    expect(taskNote(tasks[0], '2026-09-24')).toEqual({ text: 'From Sep 23', accent: false })
  })
})

describe('upcomingGroups', () => {
  const tasks = [
    taskFixture('T1', { date: '2026-09-24' }),
    taskFixture('T2', { date: '2026-09-26' }),
    taskFixture('T3', { date: '2026-09-29' }),
    taskFixture('T4', { date: '2026-09-30' }),
    taskFixture('T5', { date: '2026-10-09' }),
    taskFixture('T6', { date: null }),
    taskFixture('T7', { date: null, doneOn: '2026-09-22' }),
    taskFixture('T8', { date: '2026-09-25', doneOn: TODAY }),
    taskFixture('T9', { date: '2026-09-24', deadline: true }),
  ]

  it('groups the next six days by day, then Later, then Someday', () => {
    const groups = upcomingGroups(tasks, TODAY)
    expect(groups.map((g) => [g.key, g.label, g.right, g.collapsible, g.items.map((i) => i.task.title)])).toEqual([
      ['2026-09-24', 'Tomorrow', 'Sep 24', false, ['T1', 'T9']],
      ['2026-09-25', 'Friday', 'Sep 25', false, ['T8']],
      ['2026-09-26', 'Saturday', 'Sep 26', false, ['T2']],
      ['2026-09-29', 'Tuesday', 'Sep 29', false, ['T3']],
      ['later', 'Later', '2 tasks', true, ['T4', 'T5']],
      ['someday', 'Someday', '1 task', true, ['T6']],
    ])
    expect(groups[4].items.every((i) => i.showDate)).toBe(true)
    expect(groups[0].items.every((i) => !i.showDate)).toBe(true)
  })

  it('keeps tasks finished early visible for the day only', () => {
    expect(upcomingGroups(tasks, TODAY).flatMap((g) => g.items.map((i) => i.task.title))).toContain('T8')
    expect(todayList(tasks, TODAY).done.map((t) => t.title)).not.toContain('T8')
    expect(upcomingGroups(tasks, '2026-09-24').flatMap((g) => g.items.map((i) => i.task.title))).not.toContain('T8')
  })

  it('is empty with nothing planned', () => {
    expect(upcomingGroups([taskFixture('A')], TODAY)).toEqual([])
  })

  it('summarises open plans, deadlines and someday tasks', () => {
    expect(upcomingSummary(tasks, TODAY)).toBe('6 planned · 1 deadline · 1 someday')
    expect(upcomingSummary([], TODAY)).toBe('0 planned · 0 deadlines')
  })
})

describe('workingOn', () => {
  it('leaves out paused and achieved goals, keeping colours by position', () => {
    const a = goalFixture('A', [['M', [['A1', null]]]])
    const b = { ...goalFixture('B', [['M', [['B1', null]]]]), status: 'paused' as const }
    const c = goalFixture('C', [['M', [['C1', null]]]])
    const cards = workingOn([a, b, c], null)
    expect(cards.map((x) => x.goalId)).toEqual(['A', 'C'])
    expect(cards[1].swatch).toBe(goalColor(2))
  })

  const goals = [
    goalFixture('D3', [['First charts', [['Bar', '2026-09-01'], ['Line', null], ['Scatter', null]]], ['Motion', [['Easing', null]]]]),
    goalFixture('Finished', [['Only', [['A', '2026-09-01']]]]),
    goalFixture('Spanish', [['Talk', [['Tutor', null]]]]),
  ]
  const LINE: StepTarget = { kind: 'step', goalId: 'D3', msId: 'D3/First charts', stepId: 'D3/First charts/Line' }

  it('makes one card per goal with an open step', () => {
    const cards = workingOn(goals, LINE)
    expect(cards).toHaveLength(2)
    expect(cards[0]).toEqual({
      goalId: 'D3', title: 'D3', swatch: 'var(--color-accent)', pct: 25,
      milestoneLabel: 'Milestone 01 of 02', milestoneTitle: 'First charts',
      segments: [true, false, false], nextTitle: 'Line', target: LINE, selected: true,
    })
    expect(cards[1]).toMatchObject({ goalId: 'Spanish', swatch: 'var(--color-accent-300)', pct: 0, milestoneLabel: 'Milestone 01 of 01', selected: false })
  })
})

describe('upcomingGroups with renewals', () => {
  it('puts a renewal under its date, creating the day group if no task has it, in date order', () => {
    const today = '2026-09-23'
    const tasks = [taskFixture('Fri', { date: '2026-09-25' }), taskFixture('Later', { date: '2026-10-20' })]
    const plus = resourceFixture('Plus', { billing: 'month', price: 49, renewsOn: '2026-09-24' })
    const groups = upcomingGroups(tasks, today, [{ resource: plus, date: '2026-09-24', days: 1 }])
    expect(groups.map((g) => [g.key, g.items.length, g.renewals.length])).toEqual([
      ['2026-09-24', 0, 1], ['2026-09-25', 1, 0], ['later', 1, 0],
    ])
    expect(groups[0].label).toBe('Tomorrow')
  })
})
