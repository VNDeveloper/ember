import type { Phase, SessionLength, Timer } from './model'

export const LENGTHS: Record<SessionLength, { focus: number; brk: number }> = {
  '25/5': { focus: 1500, brk: 300 },
  '50/10': { focus: 3000, brk: 600 },
}

export const phaseLength = (phase: Phase, session: SessionLength): number =>
  phase === 'focus' ? LENGTHS[session].focus : LENGTHS[session].brk

export const idleTimer = (session: SessionLength, phase: Phase = 'focus'): Timer => ({
  phase, running: false, endsAt: null, leftSec: phaseLength(phase, session), speed: 1,
})
