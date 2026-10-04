import { describe, expect, it } from 'vitest'
import { LEVEL_COLORS, doneByDay, doneLevel, lastDays, streakLength } from './activity'
import { goalFixture, taskFixture } from './test-fixtures'

const TODAY = '2026-09-23'

describe('doneByDay', () => {
  it('counts finished tasks and steps per day', () => {
    const goals = [goalFixture('D3', [['M', [['A', '2026-09-22'], ['B', '2026-09-22'], ['C', null]]]])]
    const tasks = [taskFixture('x', { doneOn: '2026-09-22' }), taskFixture('y', { doneOn: TODAY }), taskFixture('z')]
    const counts = doneByDay(goals, tasks)
    expect(counts.get('2026-09-22')).toBe(3)
    expect(counts.get(TODAY)).toBe(1)
    expect(counts.size).toBe(2)
  })
})

describe('streakLength', () => {
  it('counts back from today, or from yesterday while today is still empty', () => {
    const counts = new Map([['2026-09-22', 2], ['2026-09-21', 1], ['2026-09-19', 4]])
    expect(streakLength(counts, TODAY)).toBe(2)
    counts.set(TODAY, 1)
    expect(streakLength(counts, TODAY)).toBe(3)
    expect(streakLength(new Map(), TODAY)).toBe(0)
  })
})

describe('levels', () => {
  it('buckets counts 0, 1–2, 3–4, 5–6, 7+', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 20].map(doneLevel)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4])
    expect(LEVEL_COLORS).toEqual([
      'var(--color-neutral-300)', 'var(--color-accent-200)', 'var(--color-accent-400)', 'var(--color-accent)', 'var(--color-accent-800)',
    ])
  })

  it('lists the last seven days, oldest first, marking today', () => {
    const cells = lastDays(new Map([[TODAY, 1], ['2026-09-17', 5]]), TODAY)
    expect(cells.map((c) => c.date)).toEqual(['2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23'])
    expect(cells[0]).toEqual({ date: '2026-09-17', count: 5, color: 'var(--color-accent)', isToday: false, tip: 'Sep 17: 5 done' })
    expect(cells[6]).toMatchObject({ count: 1, color: 'var(--color-accent-200)', isToday: true, tip: 'Sep 23: 1 done' })
  })
})
