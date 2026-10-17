import { describe, expect, it } from 'vitest'
import {
  BREAK_RANGE, DEMO_SPEED, FOCUS_RANGE, canReset, idleTimer, isDue, isSession, makeSession, parseSession, pauseTimer,
  phaseLabel, progress, remainingSec, startLabel, startTimer, stepSession,
} from './timer'

const T0 = new Date(2026, 8, 23, 10, 0, 0).getTime()
const MIN = 60_000

describe('timer engine', () => {
  it('starts idle in a full focus phase', () => {
    const t = idleTimer('25/5')
    expect(t).toEqual({ phase: 'focus', running: false, endsAt: null, leftSec: 1500, speed: 1, lengthSec: 1500 })
    expect(idleTimer('50/10').leftSec).toBe(3000)
    expect(idleTimer('25/5', 'break').leftSec).toBe(300)
    expect(idleTimer('50/10', 'break').leftSec).toBe(600)
  })

  it('counts down from the wall clock, not from ticks', () => {
    const t = startTimer(idleTimer('25/5'), T0, 1)
    expect(t.endsAt).toBe(T0 + 25 * MIN)
    expect(remainingSec(t, T0 + 10 * MIN)).toBe(900)
    expect(isDue(t, T0 + 25 * MIN - 1)).toBe(false)
    expect(isDue(t, T0 + 25 * MIN)).toBe(true)
    expect(remainingSec(t, T0 + 99 * MIN)).toBe(0)
  })

  it('pauses and resumes without losing time', () => {
    let t = startTimer(idleTimer('25/5'), T0, 1)
    t = pauseTimer(t, T0 + 5 * MIN)
    expect(t).toMatchObject({ running: false, endsAt: null, leftSec: 1200 })
    expect(remainingSec(t, T0 + 60 * MIN)).toBe(1200)
    t = startTimer(t, T0 + 60 * MIN, 1)
    expect(t.endsAt).toBe(T0 + 80 * MIN)
  })

  it('runs 25 minutes in 25 seconds at demo speed', () => {
    const t = startTimer(idleTimer('25/5'), T0, DEMO_SPEED)
    expect(t.speed).toBe(60)
    expect(t.endsAt).toBe(T0 + 25_000)
    expect(remainingSec(t, T0 + 10_000)).toBe(900)
  })

  it('ignores start when running and pause when paused', () => {
    const running = startTimer(idleTimer('25/5'), T0, 1)
    expect(startTimer(running, T0 + MIN, 1)).toBe(running)
    const idle = idleTimer('25/5')
    expect(pauseTimer(idle, T0)).toBe(idle)
  })

  it('reports progress through the phase', () => {
    const t = startTimer(idleTimer('25/5'), T0, 1)
    expect(progress(idleTimer('25/5'), T0)).toBe(0)
    expect(progress(t, T0 + 5 * MIN)).toBeCloseTo(0.2)
  })

  it('labels the phase and the start button like the prototype', () => {
    const idle = idleTimer('25/5')
    const running = startTimer(idle, T0, 1)
    const paused = pauseTimer(running, T0 + MIN)
    const brk = idleTimer('25/5', 'break')
    expect(phaseLabel(idle)).toBe('Next focus session')
    expect(phaseLabel(running)).toBe('Focusing on')
    expect(phaseLabel(brk)).toBe('Session done — take 5')
    expect(phaseLabel(idleTimer('50/10', 'break'))).toBe('Session done — take 10')
    expect(phaseLabel(startTimer(brk, T0, 1))).toBe('Break')
    expect(startLabel(idle)).toBe('Start focus')
    expect(startLabel(running)).toBe('Pause')
    expect(startLabel(paused)).toBe('Resume')
    expect(startLabel(brk)).toBe('Start break')
  })

  it('offers Reset in focus or a break once the timer has run', () => {
    const idle = idleTimer('25/5')
    const running = startTimer(idle, T0, 1)
    expect(canReset(idle)).toBe(false)
    expect(canReset(running)).toBe(true)
    expect(canReset(pauseTimer(running, T0 + MIN))).toBe(true)
    const brk = idleTimer('25/5', 'break')
    expect(canReset(brk)).toBe(false)
    expect(canReset(startTimer(brk, T0, 1))).toBe(true)
    expect(canReset(pauseTimer(startTimer(brk, T0, 1), T0 + MIN))).toBe(true)
  })

  it("labels follow the timer's own length, not a session setting changed mid-run", () => {
    const long = pauseTimer(startTimer(idleTimer('50/10'), T0, 1), T0 + 5 * MIN)
    expect(long.leftSec).toBe(2700)
    expect(startLabel(long)).toBe('Resume')
    expect(canReset(long)).toBe(true)
    expect(phaseLabel(idleTimer('25/5', 'break'))).toBe('Session done — take 5')
  })
})

describe('session lengths', () => {
  it('reads focus/break minutes, presets and custom alike', () => {
    expect(parseSession('25/5')).toEqual({ focus: 25, brk: 5 })
    expect(parseSession('40/8')).toEqual({ focus: 40, brk: 8 })
  })

  it.each([['abc'], ['0/5'], ['25/0'], ['125/5'], ['25/61'], ['25.5/5'], ['25/5/1'], [''], [42], [null]])('rejects %j', (s) => {
    expect(parseSession(s)).toBeNull()
    expect(isSession(s)).toBe(false)
  })

  it('allows 5 to 120 focus minutes and 1 to 60 break minutes', () => {
    expect(FOCUS_RANGE).toMatchObject({ min: 5, max: 120 })
    expect(BREAK_RANGE).toMatchObject({ min: 1, max: 60 })
    expect(isSession('5/1')).toBe(true)
    expect(isSession('120/60')).toBe(true)
  })

  it('builds a session, clamping out-of-range minutes', () => {
    expect(makeSession(40, 8)).toBe('40/8')
    expect(makeSession(500, 0)).toBe('120/1')
  })

  it('steps focus by 5 minutes and break by 1, stopping at the ends', () => {
    expect(stepSession('25/5', 'focus', 1)).toBe('30/5')
    expect(stepSession('25/5', 'brk', -1)).toBe('25/4')
    expect(stepSession('5/1', 'focus', -1)).toBe('5/1')
    expect(stepSession('120/60', 'brk', 1)).toBe('120/60')
  })

  it('times custom phases', () => {
    expect(idleTimer('40/8').leftSec).toBe(2400)
    expect(idleTimer('40/8', 'break').lengthSec).toBe(480)
    expect(phaseLabel(idleTimer('40/8', 'break'))).toBe('Session done — take 8')
  })
})
