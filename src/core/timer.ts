import type { Phase, SessionLength, Timer } from './model'

/** Demo speed: one real second ≈ one timer minute. */
export const DEMO_SPEED = 60

/** Allowed minutes per phase; the steppers move focus by 5 and break by 1. */
export const FOCUS_RANGE = { min: 5, max: 120, step: 5 }
export const BREAK_RANGE = { min: 1, max: 60, step: 1 }
export const PRESETS: SessionLength[] = ['25/5', '50/10']

const inRange = (n: number, r: { min: number; max: number }) => Number.isInteger(n) && n >= r.min && n <= r.max
const clamp = (n: number, r: { min: number; max: number }) => Math.max(r.min, Math.min(r.max, Math.round(n) || r.min))

/** Focus and break minutes from "focus/break", or null when it isn't a valid session. */
export function parseSession(s: unknown): { focus: number; brk: number } | null {
  const m = typeof s === 'string' ? s.match(/^(\d+)\/(\d+)$/) : null
  if (!m) return null
  const focus = Number(m[1])
  const brk = Number(m[2])
  return inRange(focus, FOCUS_RANGE) && inRange(brk, BREAK_RANGE) ? { focus, brk } : null
}

export const isSession = (s: unknown): s is SessionLength => parseSession(s) !== null

export const makeSession = (focus: number, brk: number): SessionLength =>
  `${clamp(focus, FOCUS_RANGE)}/${clamp(brk, BREAK_RANGE)}`

export function stepSession(s: SessionLength, part: 'focus' | 'brk', dir: 1 | -1): SessionLength {
  const { focus, brk } = parseSession(s) ?? { focus: 25, brk: 5 }
  return part === 'focus'
    ? makeSession(focus + dir * FOCUS_RANGE.step, brk)
    : makeSession(focus, brk + dir * BREAK_RANGE.step)
}

/** Phase length in timer-seconds. */
export function phaseLength(phase: Phase, session: SessionLength): number {
  const { focus, brk } = parseSession(session) ?? { focus: 25, brk: 5 }
  return (phase === 'focus' ? focus : brk) * 60
}

export const idleTimer = (session: SessionLength, phase: Phase = 'focus'): Timer => ({
  phase, running: false, endsAt: null, leftSec: phaseLength(phase, session), speed: 1, lengthSec: phaseLength(phase, session),
})

/** Timer-seconds left, derived from the wall clock while running. */
export function remainingSec(t: Timer, now: number): number {
  if (!t.running || t.endsAt == null) return t.leftSec
  return Math.max(0, ((t.endsAt - now) / 1000) * t.speed)
}

export function startTimer(t: Timer, now: number, speed: number): Timer {
  if (t.running) return t
  return { ...t, running: true, speed, endsAt: now + (t.leftSec * 1000) / speed }
}

export function pauseTimer(t: Timer, now: number): Timer {
  if (!t.running) return t
  return { ...t, running: false, endsAt: null, leftSec: remainingSec(t, now) }
}

export const isDue = (t: Timer, now: number): boolean => t.running && t.endsAt != null && now >= t.endsAt

export const progress = (t: Timer, now: number): number => 1 - remainingSec(t, now) / t.lengthSec

/** Labels read the timer's own length, so a session-length change mid-run can't mislabel it. */
export function phaseLabel(t: Timer): string {
  if (t.phase === 'break') return t.running ? 'Break' : `Session done — take ${t.lengthSec / 60}`
  return t.running ? 'Focusing on' : 'Next focus session'
}

/** Paused partway through a phase. */
export const hasProgress = (t: Timer): boolean => !t.running && t.leftSec < t.lengthSec

export function startLabel(t: Timer): string {
  if (t.running) return 'Pause'
  if (t.phase === 'break') return 'Start break'
  return hasProgress(t) ? 'Resume' : 'Start focus'
}

/** Reset is offered once the current phase (focus or break) has started. */
export const canReset = (t: Timer): boolean => t.running || hasProgress(t)
