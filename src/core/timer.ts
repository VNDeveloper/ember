import type { Phase, SessionLength, Timer } from './model'

/** Demo speed: one real second ≈ one timer minute. */
export const DEMO_SPEED = 60

/** Phase lengths in timer-seconds. */
export const LENGTHS: Record<SessionLength, { focus: number; brk: number }> = {
  '25/5': { focus: 1500, brk: 300 },
  '50/10': { focus: 3000, brk: 600 },
}

export const phaseLength = (phase: Phase, session: SessionLength): number =>
  phase === 'focus' ? LENGTHS[session].focus : LENGTHS[session].brk

export const idleTimer = (session: SessionLength, phase: Phase = 'focus'): Timer => ({
  phase, running: false, endsAt: null, leftSec: phaseLength(phase, session), speed: 1,
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

export const progress = (t: Timer, now: number, session: SessionLength): number =>
  1 - remainingSec(t, now) / phaseLength(t.phase, session)

export function phaseLabel(t: Timer, session: SessionLength): string {
  if (t.phase === 'break') return t.running ? 'Break' : `Session done — take ${LENGTHS[session].brk / 60}`
  return t.running ? 'Focusing on' : 'Next focus session'
}

export function startLabel(t: Timer, session: SessionLength): string {
  if (t.running) return 'Pause'
  if (t.phase === 'break') return 'Start break'
  return t.leftSec < phaseLength('focus', session) ? 'Resume' : 'Start focus'
}

export const canReset = (t: Timer, session: SessionLength): boolean =>
  t.phase === 'focus' && (t.running || t.leftSec < phaseLength('focus', session))
