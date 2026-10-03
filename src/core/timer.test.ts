import { describe, expect, it } from 'vitest'
import {
  DEMO_SPEED, canReset, idleTimer, isDue, pauseTimer, phaseLabel, progress, remainingSec, startLabel, startTimer,
} from './timer'

const T0 = new Date(2026, 8, 23, 10, 0, 0).getTime()
const MIN = 60_000

describe('timer engine', () => {
  it('starts idle in a full focus phase', () => {
    const t = idleTimer('25/5')
    expect(t).toEqual({ phase: 'focus', running: false, endsAt: null, leftSec: 1500, speed: 1 })
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
    expect(progress(idleTimer('25/5'), T0, '25/5')).toBe(0)
    expect(progress(t, T0 + 5 * MIN, '25/5')).toBeCloseTo(0.2)
  })

  it('labels the phase and the start button like the prototype', () => {
    const idle = idleTimer('25/5')
    const running = startTimer(idle, T0, 1)
    const paused = pauseTimer(running, T0 + MIN)
    const brk = idleTimer('25/5', 'break')
    expect(phaseLabel(idle, '25/5')).toBe('Next focus session')
    expect(phaseLabel(running, '25/5')).toBe('Focusing on')
    expect(phaseLabel(brk, '25/5')).toBe('Session done — take 5')
    expect(phaseLabel(brk, '50/10')).toBe('Session done — take 10')
    expect(phaseLabel(startTimer(brk, T0, 1), '25/5')).toBe('Break')
    expect(startLabel(idle, '25/5')).toBe('Start focus')
    expect(startLabel(running, '25/5')).toBe('Pause')
    expect(startLabel(paused, '25/5')).toBe('Resume')
    expect(startLabel(brk, '25/5')).toBe('Start break')
  })

  it('offers Reset only in focus once the timer has run', () => {
    const idle = idleTimer('25/5')
    const running = startTimer(idle, T0, 1)
    expect(canReset(idle, '25/5')).toBe(false)
    expect(canReset(running, '25/5')).toBe(true)
    expect(canReset(pauseTimer(running, T0 + MIN), '25/5')).toBe(true)
    expect(canReset(idleTimer('25/5', 'break'), '25/5')).toBe(false)
  })
})
