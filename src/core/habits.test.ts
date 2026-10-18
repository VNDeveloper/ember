import { describe, expect, it } from 'vitest'
import { goalMinutesByDay, liveHabit, repairHabit } from './habits'
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
