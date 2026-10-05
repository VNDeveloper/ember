import { describe, expect, it } from 'vitest'
import { clampWallWeeks, stepWallWeeks, WALL_WEEKS_MAX, WALL_WEEKS_MIN } from './settings'

describe('done-wall weeks', () => {
  it('keeps the prototype range of 4 to 26 weeks', () => {
    expect([WALL_WEEKS_MIN, WALL_WEEKS_MAX]).toEqual([4, 26])
  })

  it.each([[12, 12], [3, 4], [40, 26], [7.6, 8], [Number.NaN, 12], [0, 12]])('clamps %s to %s', (n, out) => {
    expect(clampWallWeeks(n)).toBe(out)
  })

  it('steps by whole weeks and stops at the ends', () => {
    expect(stepWallWeeks(12, 1)).toBe(13)
    expect(stepWallWeeks(12, -1)).toBe(11)
    expect(stepWallWeeks(4, -1)).toBe(4)
    expect(stepWallWeeks(26, 1)).toBe(26)
    expect(stepWallWeeks(99, -1)).toBe(25)
  })
})
