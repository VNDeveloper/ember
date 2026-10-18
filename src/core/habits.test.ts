import { describe, expect, it } from 'vitest'
import { clampHabit, goalMinutesByDay, habitStreak, habitView, habitWeeks, liveHabit, newHabit, repairHabit, targetText, withTarget } from './habits'
import type { Habit } from './model'
import { goalFixture, logFixture, taskFixture } from './test-fixtures'

const S = { kind: 'step', goalId: 'G', msId: 'G/M', stepId: 'G/M/S' } as const
const habit = (patch: Partial<Habit> = {}): Habit => ({ targets: [{ minutes: 25, daysPerWeek: 3, from: '2026-09-28' }], pauses: [], ...patch })

describe('repairHabit', () => {
  it('returns a valid habit unchanged', () => {
    const h = habit({ pauses: [{ from: '2026-10-01', to: '2026-10-03' }, { from: '2026-10-10', to: null }] })
    expect(repairHabit(h)).toBe(h)
  })
  it('drops bad targets and pauses, sorts targets, and gives up when no target is left', () => {
    const h = repairHabit({
      targets: [{ minutes: 30, daysPerWeek: 4, from: '2026-10-05' }, { minutes: 3, daysPerWeek: 4, from: '2026-10-12' }, { minutes: 25, daysPerWeek: 9, from: '2026-10-12' }, { minutes: 25, daysPerWeek: 3, from: '2026-09-28' }],
      pauses: [{ from: 'soon', to: null }, { from: '2026-10-01', to: '2026-10-02' }],
    })!
    expect(h.targets.map((t) => t.from)).toEqual(['2026-09-28', '2026-10-05'])
    expect(h.pauses).toEqual([{ from: '2026-10-01', to: '2026-10-02' }])
    expect(repairHabit({ targets: [{ minutes: 0, daysPerWeek: 3, from: '2026-10-05' }], pauses: [] })).toBeNull()
    expect(repairHabit('habit')).toBeNull()
    expect(repairHabit({ targets: [{ minutes: 25, daysPerWeek: 3, from: '2026-10-05' }] })).toEqual({ targets: [{ minutes: 25, daysPerWeek: 3, from: '2026-10-05' }], pauses: [] })
  })
  it('only counts a habit that is not removed', () => {
    expect(liveHabit({ ...goalFixture('G', []), habit: habit() })).not.toBeNull()
    expect(liveHabit({ ...goalFixture('G', []), habit: { ...habit(), deletedOn: '2026-10-01' } })).toBeNull()
    expect(liveHabit(goalFixture('G', []))).toBeNull()
  })
})

describe('goalMinutesByDay', () => {
  it("adds up the goal's steps and linked tasks per day, deleted ones included", () => {
    const goal = goalFixture('G', [['M', [['S', null]]]])
    const tasks = [taskFixture('Linked', { goalId: 'G' }), taskFixture('Other'), taskFixture('Gone', { goalId: 'G', deletedOn: '2026-10-01' })]
    const logs = [
      logFixture('2026-10-12', S, 20),
      logFixture('2026-10-12', { kind: 'task', taskId: 'Linked' }, 10),
      logFixture('2026-10-12', { kind: 'task', taskId: 'Other' }, 15),
      logFixture('2026-10-12', null, 25),
      logFixture('2026-10-13', { kind: 'task', taskId: 'Gone' }, 5),
      logFixture('2026-10-13', { kind: 'step', goalId: 'X', msId: 'X/M', stepId: 'X/M/S' }, 25),
    ]
    expect([...goalMinutesByDay(goal, tasks, logs)]).toEqual([['2026-10-12', 30], ['2026-10-13', 5]])
  })
})

const TODAY = '2026-10-14' // Wednesday; this week starts 2026-10-12
const days = (dates: string[], min = 25) => new Map(dates.map((d) => [d, min]))

describe('habitWeeks and habitStreak', () => {
  const h = habit({ targets: [{ minutes: 25, daysPerWeek: 3, from: '2026-09-21' }] })
  const status = (by: Map<string, number>, hh = h) => habitWeeks(hh, by, TODAY).map((w) => w.status)

  it('marks hit and missed weeks, keeps this week open, and counts the streak in weeks', () => {
    const by = days(['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-28', '2026-09-30', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-12'])
    const weeks = habitWeeks(h, by, TODAY)
    expect(weeks.map((w) => [w.monday, w.status, w.doneDays])).toEqual([
      ['2026-09-21', 'hit', 3], ['2026-09-28', 'hit', 3], ['2026-10-05', 'missed', 2], ['2026-10-12', 'current', 1],
    ])
    expect(habitStreak(weeks)).toEqual({ streak: 0, best: 2 })
  })

  it('counts this week once it is hit', () => {
    const by = days(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-12', '2026-10-13', '2026-10-14'])
    expect(habitStreak(habitWeeks(habit({ targets: [{ minutes: 25, daysPerWeek: 3, from: '2026-10-05' }] }), by, TODAY))).toEqual({ streak: 2, best: 2 })
  })

  it('a day needs the full target minutes', () => {
    expect(status(days(['2026-09-21', '2026-09-22', '2026-09-23'], 20))[0]).toBe('off')
  })

  it("never counts the habit's first week as missed, and skips paused weeks", () => {
    const by = days(['2026-09-28', '2026-09-29', '2026-09-30'])
    expect(status(by)).toEqual(['off', 'hit', 'missed', 'current'])
    const paused = habit({ targets: h.targets, pauses: [{ from: '2026-10-07', to: '2026-10-09' }] })
    expect(status(by, paused)).toEqual(['off', 'hit', 'off', 'current'])
    expect(habitStreak(habitWeeks(paused, by, TODAY))).toEqual({ streak: 1, best: 1 })
    const stillPaused = habit({ targets: h.targets, pauses: [{ from: '2026-10-07', to: null }] })
    expect(status(by, stillPaused)).toEqual(['off', 'hit', 'off', 'current'])
    const sameDay = habit({ targets: h.targets, pauses: [{ from: '2026-10-07', to: '2026-10-07' }] })
    expect(status(by, sameDay)).toEqual(['off', 'hit', 'missed', 'current'])
  })

  it('judges each week by the target it had', () => {
    const changed = habit({ targets: [{ minutes: 25, daysPerWeek: 3, from: '2026-09-21' }, { minutes: 60, daysPerWeek: 3, from: '2026-10-05' }] })
    const by = days(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-05', '2026-10-06', '2026-10-07'])
    expect(status(by, changed)).toEqual(['off', 'hit', 'missed', 'current'])
  })
})

describe('habitView', () => {
  const goal = (hh: Habit | null = habit()) => ({ ...goalFixture('G', [['M', [['S', null]]]]), habit: hh })

  it("shows today's minutes, the week's days and the streak", () => {
    const logs = [logFixture('2026-10-12', S, 30), logFixture('2026-10-14', S, 10)]
    const v = habitView(goal(), [], logs, TODAY)!
    expect(v).toMatchObject({
      minutes: 25, daysPerWeek: 3, todayMin: 10, todayDone: false, doneDays: 1, streak: 0, best: 0,
      todayText: '10 of 25m today', daysText: '1 of 3 days', streakText: '–', targetText: '25m on 3 days a week',
      recent: ['off', 'missed', 'current'],
    })
    expect(v.days.map((d) => `${d.label}:${d.state}`)).toEqual(['M:done', 'T:not', 'W:not', 'T:future', 'F:future', 'S:future', 'S:future'])
  })

  it('is null without a live habit, and words the target', () => {
    expect(habitView(goal(null), [], [], TODAY)).toBeNull()
    expect(habitView(goal({ ...habit(), deletedOn: '2026-10-01' }), [], [], TODAY)).toBeNull()
    expect([targetText(25, 7), targetText(30, 1), targetText(45, 4)]).toEqual(['25m every day', '30m on 1 day a week', '45m on 4 days a week'])
  })

  it('keeps the last 8 weeks', () => {
    const v = habitView(goal(habit({ targets: [{ minutes: 25, daysPerWeek: 3, from: '2026-07-06' }] })), [], [], TODAY)!
    expect(v.recent).toHaveLength(8)
    expect(v.recent.at(-1)).toBe('current')
  })
})

describe('changing a habit', () => {
  it('replaces this week’s target, or starts a new one from this Monday', () => {
    const h1 = withTarget(habit(), 30, 4, TODAY)
    expect(h1.targets).toEqual([{ minutes: 25, daysPerWeek: 3, from: '2026-09-28' }, { minutes: 30, daysPerWeek: 4, from: '2026-10-12' }])
    const h2 = withTarget(h1, 45, 5, '2026-10-15')
    expect(h2.targets).toEqual([{ minutes: 25, daysPerWeek: 3, from: '2026-09-28' }, { minutes: 45, daysPerWeek: 5, from: '2026-10-12' }])
  })
  it('starts a habit this week, with an open pause for a paused goal', () => {
    expect(newHabit(25, 5, TODAY, false)).toEqual({ targets: [{ minutes: 25, daysPerWeek: 5, from: '2026-10-12' }], pauses: [] })
    expect(newHabit(25, 5, TODAY, true).pauses).toEqual([{ from: TODAY, to: null }])
  })
  it('keeps targets in range', () => {
    expect([clampHabit(3, 0), clampHabit(500, 9), clampHabit(27, 3.6), clampHabit(Number.NaN, 5)]).toEqual([
      { minutes: 5, daysPerWeek: 1 }, { minutes: 240, daysPerWeek: 7 }, { minutes: 25, daysPerWeek: 4 }, { minutes: 25, daysPerWeek: 5 },
    ])
  })
})
