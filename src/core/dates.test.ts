import { describe, expect, it } from 'vitest'
import {
  addDays, dayLabel, dayOfYear, daysInYear, diffDays, fromISO, isWeekend, mondayOf,
  monthName, navDate, startOfYear, toISO, todayISO, weekdayLong, yearOf,
} from './dates'

describe('dates', () => {
  it('round-trips ISO dates in local time', () => {
    expect(toISO(fromISO('2026-09-23'))).toBe('2026-09-23')
    expect(todayISO(new Date(2026, 8, 23, 23, 59).getTime())).toBe('2026-09-23')
    expect(todayISO(new Date(2026, 8, 24, 0, 1).getTime())).toBe('2026-09-24')
  })

  it('adds days across month and year ends', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2026-09-23', 0)).toBe('2026-09-23')
  })

  it('counts whole days, including across a DST change', () => {
    expect(diffDays('2026-09-25', '2026-09-23')).toBe(2)
    expect(diffDays('2026-09-21', '2026-09-23')).toBe(-2)
    expect(diffDays('2026-11-02', '2026-10-24')).toBe(9)
    expect(diffDays('2026-04-02', '2026-03-24')).toBe(9)
  })

  it('formats labels', () => {
    expect(dayLabel('2026-09-21')).toBe('Sep 21')
    expect(weekdayLong('2026-09-23')).toBe('Wednesday')
    expect(navDate('2026-09-23')).toBe('Wed 23 Sep 2026')
    expect(monthName('2026-09-23')).toBe('September')
  })

  it('knows weekends', () => {
    expect(isWeekend('2026-09-26')).toBe(true)
    expect(isWeekend('2026-09-27')).toBe(true)
    expect(isWeekend('2026-09-23')).toBe(false)
  })

  it('locates a day in its year', () => {
    expect(yearOf('2026-09-23')).toBe(2026)
    expect(startOfYear('2026-09-23')).toBe('2026-01-01')
    expect(dayOfYear('2026-01-01')).toBe(0)
    expect(dayOfYear('2026-09-23')).toBe(265)
    expect(daysInYear(2026)).toBe(365)
    expect(daysInYear(2028)).toBe(366)
    expect(daysInYear(2100)).toBe(365)
    expect(fromISO('2026-01-01').getDay()).toBe(4)
  })

  it('finds the Monday of a week', () => {
    expect(mondayOf('2026-09-23')).toBe('2026-09-21')
    expect(mondayOf('2026-09-21')).toBe('2026-09-21')
    expect(mondayOf('2026-09-27')).toBe('2026-09-21')
  })
})
