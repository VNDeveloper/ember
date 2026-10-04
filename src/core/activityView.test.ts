import { describe, expect, it } from 'vitest'
import { doneByDay } from './activity'
import { activityLog, doneWall, focusByDay, focusLevel, heatMap } from './activityView'
import type { FocusLog } from './model'
import { goalFixture, logFixture, stepRef, taskFixture } from './test-fixtures'

const TODAY = '2026-09-23'
const goals = [goalFixture('D3', [['M', [['A', '2026-09-22'], ['B', '2026-09-10'], ['C', null]]]])]
const tasks = [
  taskFixture('t1', { doneOn: TODAY }),
  taskFixture('t2', { goalId: 'D3', tag: '', doneOn: '2026-09-21' }),
  taskFixture('t3'),
]
const A = stepRef('D3', 'M', 'A')
const logs: FocusLog[] = [
  logFixture(TODAY, A, 50),
  logFixture('2026-09-22', A, 100),
  logFixture('2026-01-05', null, 25),
]
const focus = focusByDay(logs)
const counts = doneByDay(goals, tasks)

describe('focusByDay and levels', () => {
  it('sums focus minutes per day', () => {
    expect(focus.get(TODAY)).toBe(50)
    expect(focus.get('2026-09-22')).toBe(100)
    expect(focus.size).toBe(3)
  })

  it('buckets minutes 0, ≤50, ≤100, ≤150, more', () => {
    expect([0, 25, 50, 75, 100, 125, 150, 175].map(focusLevel)).toEqual([0, 1, 1, 2, 2, 3, 3, 4])
  })
})

describe('heatMap', () => {
  it('lays out the year Sunday-first with leading blanks and month columns', () => {
    const hm = heatMap('focus', focus, counts, TODAY)
    expect(hm.year).toBe(2026)
    expect(hm.columns).toBe(53)
    expect(hm.cells).toHaveLength(4 + 365)
    expect(hm.cells.slice(0, 4).every((c) => c.date === null)).toBe(true)
    expect(hm.cells[4].date).toBe('2026-01-01')
    expect(hm.months[0]).toEqual({ label: 'Jan', col: 2 })
    expect(hm.months[1]).toEqual({ label: 'Feb', col: 7 })
    expect(hm.months[8]).toEqual({ label: 'Sep', col: 37 })
  })

  it('colours focus minutes, rings today and leaves future days empty', () => {
    const hm = heatMap('focus', focus, counts, TODAY)
    const at = (d: string) => hm.cells.find((c) => c.date === d)!
    expect(at(TODAY)).toEqual({ date: TODAY, color: 'var(--color-accent-200)', isToday: true, future: false, tip: 'Sep 23: 50m' })
    expect(at('2026-09-22').color).toBe('var(--color-accent-400)')
    expect(at('2026-09-20')).toMatchObject({ color: 'var(--color-neutral-300)', isToday: false })
    expect(at('2026-09-24')).toEqual({ date: '2026-09-24', color: 'transparent', isToday: false, future: true, tip: '' })
  })

  it('titles and stats for focus time', () => {
    const hm = heatMap('focus', focus, counts, TODAY)
    expect(hm.kicker).toBe('Focus time · all goals and tasks')
    expect(hm.title).toBe('3 hours focused in 2026')
    expect(hm.legendMore).toBe('More focus time')
    expect(hm.stats.map((s) => [s.label, s.value])).toEqual([
      ['September', '2h 30m'], ['Best day', '1h 40m'], ['Focus streak', '2d'], ['Daily average', '0m'],
    ])
  })

  it('titles and stats for things done', () => {
    const hm = heatMap('done', focus, counts, TODAY)
    expect(hm.kicker).toBe('Things done · tasks and goal steps')
    expect(hm.title).toBe('4 things done in 2026')
    expect(hm.legendMore).toBe('More done')
    expect(hm.cells.find((c) => c.date === TODAY)).toMatchObject({ color: 'var(--color-accent-200)', tip: 'Sep 23: 1 done' })
    expect(hm.stats.map((s) => [s.label, s.value])).toEqual([
      ['September', '4'], ['Best day', '1'], ['Streak', '3d'], ['Active days', '4'],
    ])
  })

  it('lays out a leap year starting on Saturday', () => {
    const hm = heatMap('done', new Map(), new Map(), '2028-06-01')
    expect(hm.columns).toBe(54)
    expect(hm.cells).toHaveLength(6 + 366)
    expect(hm.cells.filter((c) => c.date).length).toBe(366)
  })

  it('starts a new year empty but keeps the streak', () => {
    const f = new Map([['2026-12-31', 50], ['2026-12-30', 25]])
    const hm = heatMap('focus', f, new Map(), '2027-01-01')
    expect(hm.title).toBe('0 hours focused in 2027')
    expect(hm.stats.map((s) => s.value)).toEqual(['0m', '0m', '2d', '0m'])
    expect(hm.stats[0].label).toBe('January')
  })
})

describe('doneWall', () => {
  it('stacks finished steps and tasks into weekly columns, oldest left', () => {
    const wall = doneWall(goals, tasks, TODAY, 4)
    expect(wall.weeks).toBe(4)
    expect(wall.columns.map((c) => [c.monday, c.label, c.current, c.bricks.length])).toEqual([
      ['2026-08-31', 'Aug 31', false, 0],
      ['2026-09-07', 'Sep 7', false, 1],
      ['2026-09-14', 'Sep 14', false, 0],
      ['2026-09-21', 'Sep 21', true, 3],
    ])
    expect(wall.columns[3].bricks).toEqual([
      { kind: 'task', color: 'var(--color-accent)', tip: 'Task: t2', date: '2026-09-21' },
      { kind: 'step', color: 'var(--color-accent)', tip: 'D3: A', date: '2026-09-22' },
      { kind: 'task', color: 'var(--color-text)', tip: 'Task: t1', date: TODAY },
    ])
  })

  it('sizes the chart and fills in the headline, legend and stats', () => {
    const wall = doneWall(goals, tasks, TODAY, 4)
    expect(wall.height).toBe(147)
    expect(wall.headline).toBe('4 things finished')
    expect(wall.legend).toEqual([{ name: 'D3', color: 'var(--color-accent)' }])
    expect(wall.stats).toEqual([
      { label: 'This week', value: '3', accent: true },
      { label: 'Best week', value: '3', accent: false },
      { label: 'Weeks in a row', value: '1', accent: false },
      { label: 'Milestones done', value: '0', accent: false },
    ])
  })

  it('clamps the number of weeks and thins labels on long walls', () => {
    expect(doneWall(goals, tasks, TODAY, 30).columns).toHaveLength(26)
    expect(doneWall(goals, tasks, TODAY, 2).columns).toHaveLength(4)
    expect(doneWall(goals, tasks, TODAY, Number.NaN).columns).toHaveLength(12)
    const long = doneWall(goals, tasks, TODAY, 16)
    expect(long.columns[0].label).toBe('')
    expect(long.columns[1].label).toBe('Jun 15')
  })
})

describe('activityLog', () => {
  it("orders the log: today's completions, then newest first with focus before completions", () => {
    const at = (d: string, h: number) => new Date(`${d}T${String(h).padStart(2, '0')}:00:00`).getTime()
    const entries = activityLog(goals, tasks, [
      { id: 'l1', at: at(TODAY, 10), date: TODAY, min: 25, target: A },
      { id: 'l2', at: at('2026-09-22', 9), date: '2026-09-22', min: 25, target: { kind: 'task', taskId: 't1' } },
      { id: 'l3', at: at('2026-09-22', 11), date: '2026-09-22', min: 25, target: null },
      { id: 'l4', at: at('2026-09-22', 8), date: '2026-09-22', min: 50, target: { kind: 'task', taskId: 'gone' } },
    ], TODAY)
    expect(entries.map((e) => [e.kind, e.text, e.src, e.when])).toEqual([
      ['done', 'Completed task “t1”', 'Task · Work', 'Today'],
      ['focus', 'Focused 25m on “A”', 'D3', 'Today'],
      ['focus', 'Focused 25m on “Unassigned”', 'No step picked', 'Yesterday'],
      ['focus', 'Focused 25m on “t1”', 'Task · Work', 'Yesterday'],
      ['focus', 'Focused 50m on “Unassigned”', 'No step picked', 'Yesterday'],
      ['done', 'Completed “A”', 'D3', 'Yesterday'],
      ['done', 'Completed task “t2”', 'D3', 'Sep 21'],
      ['done', 'Completed “B”', 'D3', 'Sep 10'],
    ])
    expect(entries.every((e) => /^[0-9a-f]{7}$/.test(e.hash))).toBe(true)
    expect(new Set(entries.map((e) => e.key)).size).toBe(entries.length)
  })
})

describe('activity log and wall details', () => {
  it('resolves sources from the target, even for a task called "Unassigned"', () => {
    const odd = [taskFixture('Unassigned', { tag: 'Work' })]
    const [e] = activityLog([], odd, [{ id: 'l', at: 0, date: TODAY, min: 25, target: { kind: 'task', taskId: 'Unassigned' } }], TODAY)
    expect(e).toMatchObject({ text: 'Focused 25m on “Unassigned”', src: 'Task · Work' })
  })

  it('adds the year to dates from another year, and says "Task" for an empty tag', () => {
    const [e] = activityLog([], [taskFixture('Old', { tag: '', doneOn: '2025-10-05' })], [], TODAY)
    expect(e).toMatchObject({ src: 'Task', when: 'Oct 5, 2025' })
  })

  it('counts weeks in a row from last week while this week is still empty', () => {
    const lastTwoWeeks = [taskFixture('a', { doneOn: '2026-09-15' }), taskFixture('b', { doneOn: '2026-09-08' })]
    const wall = doneWall([], lastTwoWeeks, '2026-09-21', 4)
    expect(wall.stats.find((s) => s.label === 'Weeks in a row')?.value).toBe('2')
    expect(wall.stats.find((s) => s.label === 'This week')?.value).toBe('0')
  })
})
