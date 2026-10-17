import { describe, expect, it } from 'vitest'
import type { FocusLog } from './model'
import { sessionCount, tallyLogs } from './tally'

const log = (date: string, min: number, target: FocusLog['target']): FocusLog => ({ id: `${date}-${Math.random()}`, at: 0, date, min, target })
const step = { kind: 'step', goalId: 'g', msId: 'm', stepId: 's1' } as const
const task = { kind: 'task', taskId: 't1' } as const

describe('tallyLogs', () => {
  it('sums spent minutes per target and today totals', () => {
    const t = tallyLogs([
      log('2026-09-22', 25, step),
      log('2026-09-23', 25, step),
      log('2026-09-23', 25, task),
      log('2026-09-23', 25, null),
    ], '2026-09-23')
    expect(t.spent.get('step:s1')).toBe(50)
    expect(t.spent.get('task:t1')).toBe(25)
    expect(t.spentToday.get('step:s1')).toBe(25)
    expect(t.minutesToday).toBe(75)
    expect(t.sessionsToday).toBe(3)
  })

  it('is empty with no logs', () => {
    const t = tallyLogs([], '2026-09-23')
    expect(t.spent.size).toBe(0)
    expect(t.minutesToday).toBe(0)
    expect(t.sessionsToday).toBe(0)
  })
})

describe('sessions', () => {
  it('counts a session split by finishing early once', () => {
    const a = { ...log('2026-09-23', 10, step), session: 'S1' }
    const b = { ...log('2026-09-23', 15, task), session: 'S1' }
    const c = log('2026-09-23', 25, task)
    expect(sessionCount([a, b, c])).toBe(2)
    expect(tallyLogs([a, b, c], '2026-09-23')).toMatchObject({ sessionsToday: 2, minutesToday: 50 })
  })
})
