import { addDays, dayLabel, diffDays, yearOf, type ISODate } from './dates'
import { fmtM } from './format'
import { goalStatus, liveMilestones, liveSteps } from './goals'
import { liveHabit } from './habits'
import type { FocusLog, Goal, Milestone, Step } from './model'

const stepMin = (spent: Map<string, number>, s: Step): number => spent.get(`step:${s.id}`) ?? 0
const allSteps = (g: Goal): Step[] => liveMilestones(g).flatMap(liveSteps)

export interface Correction { ratio: number; applied: boolean; short: string; text: string }

/** How your finished steps compared with their estimates (3+ steps with focus time; 0.5×–2×). */
export function correction(g: Goal, spent: Map<string, number>): Correction {
  const done = allSteps(g).filter((s) => s.doneOn != null && stepMin(spent, s) > 0)
  if (done.length < 3) return { ratio: 1, applied: false, short: '—', text: '' }
  const est = done.reduce((a, s) => a + s.estMin, 0)
  const actual = done.reduce((a, s) => a + stepMin(spent, s), 0)
  const ratio = Math.round(Math.min(2, Math.max(0.5, actual / est)) * 100) / 100
  const pct = Math.round((ratio - 1) * 100)
  if (Math.abs(pct) <= 5) return { ratio, applied: true, short: 'on target', text: 'Your estimates are about right' }
  return pct > 0
    ? { ratio, applied: true, short: `+${pct}%`, text: `You usually take ${pct}% longer` }
    : { ratio, applied: true, short: `−${-pct}%`, text: `You usually take ${-pct}% less time` }
}

const DEFAULT_MILESTONE = 240

/** A milestone without steps: your rough estimate, else the average planned milestone here, else 4h. Null once it has steps. */
export function milestoneEstimate(g: Goal, m: Milestone): { min: number; guess: boolean } | null {
  if (liveSteps(m).length) return null
  if (m.estMin != null) return { min: m.estMin, guess: false }
  const planned = liveMilestones(g).filter((x) => liveSteps(x).length)
  if (!planned.length) return { min: DEFAULT_MILESTONE, guess: true }
  const avg = planned.reduce((a, x) => a + liveSteps(x).reduce((b, s) => b + s.estMin, 0), 0) / planned.length
  return { min: Math.round(avg / 5) * 5, guess: true }
}

/** Minutes still to go, corrected; unplannedMin is the part from milestones without steps. */
export function leftToGo(g: Goal, spent: Map<string, number>): { min: number; unplannedMin: number } {
  const { ratio } = correction(g, spent)
  let min = 0
  let unplanned = 0
  for (const m of liveMilestones(g)) {
    const e = milestoneEstimate(g, m)
    if (e) {
      unplanned += e.min * ratio
      continue
    }
    for (const s of liveSteps(m)) if (s.doneOn == null) min += Math.max(0, s.estMin * ratio - stepMin(spent, s))
  }
  return { min: Math.round(min + unplanned), unplannedMin: Math.round(unplanned) }
}

/** Focus minutes a week on the goal's steps, over the last 28 days (linked tasks don't count). */
export function stepPacePerWeek(g: Goal, logs: FocusLog[], today: ISODate): number {
  const from = addDays(today, -27)
  let sum = 0
  for (const l of logs) {
    if (l.target?.kind === 'step' && l.target.goalId === g.id && l.date >= from && l.date <= today) sum += l.min
  }
  return sum / 4
}

export function forecastDate(leftMin: number, perWeek: number, today: ISODate): ISODate | null {
  if (leftMin <= 0) return today
  if (!(perWeek > 0)) return null
  return addDays(today, Math.ceil(leftMin / (perWeek / 7)))
}

export type Verdict = 'ahead' | 'on track' | 'behind' | 'past due'

/** workLeft: open steps or milestones without steps remain (minutes can round to 0 while a step is still open). */
export function verdict(forecast: ISODate | null, finishBy: ISODate, workLeft: boolean, today: ISODate): Verdict | null {
  if (!workLeft) return 'on track'
  if (today > finishBy) return 'past due'
  if (!forecast) return null
  if (forecast <= addDays(finishBy, -14)) return 'ahead'
  return forecast <= finishBy ? 'on track' : 'behind'
}

/** Minutes a week needed to finish by the date; null when there's no time left or nothing left to do. */
export function needPerWeek(leftMin: number, finishBy: ISODate, today: ISODate): number | null {
  const days = diffDays(finishBy, today)
  if (days <= 0 || leftMin <= 0) return null
  return Math.ceil(leftMin / (days / 7))
}

export interface PaceView {
  paused: boolean
  left: string
  unplanned: string
  correction: string
  pace: string
  atPace: string | null
  atHabit: string | null
  finishBy: { date: ISODate; text: string; verdict: Verdict | null; need: string } | null
  behind: boolean
}

const when = (d: ISODate, today: ISODate): string => (yearOf(d) === yearOf(today) ? dayLabel(d) : `${dayLabel(d)}, ${yearOf(d)}`)

/** The goal page's Pace section in words; null for achieved goals. */
export function paceView(g: Goal, logs: FocusLog[], spent: Map<string, number>, today: ISODate): PaceView | null {
  const status = goalStatus(g)
  if (status === 'achieved') return null
  const left = leftToGo(g, spent)
  const perWeek = stepPacePerWeek(g, logs, today)
  const at = forecastDate(left.min, perWeek, today)
  const h = liveHabit(g)
  const target = h?.targets[h.targets.length - 1]
  const atH = target ? forecastDate(left.min, target.minutes * target.daysPerWeek, today) : null
  const workLeft = liveMilestones(g).some((m) => milestoneEstimate(g, m) != null || liveSteps(m).some((s) => s.doneOn == null))
  let finishBy: PaceView['finishBy'] = null
  if (g.finishBy) {
    const v = verdict(at, g.finishBy, workLeft, today)
    const need = v === 'past due' ? null : needPerWeek(left.min, g.finishBy, today)
    finishBy = { date: g.finishBy, text: when(g.finishBy, today), verdict: v, need: need ? `${fmtM(need)} a week` : '' }
  }
  return {
    paused: status === 'paused',
    left: `~${fmtM(left.min)}`,
    unplanned: left.unplannedMin ? `incl. ~${fmtM(left.unplannedMin)} unplanned` : '',
    correction: correction(g, spent).text,
    pace: perWeek > 0 ? `${fmtM(perWeek)} a week · last 4 weeks` : 'No focus on its steps in the last 4 weeks',
    atPace: at ? `~${when(at, today)}` : null,
    atHabit: atH ? `~${when(atH, today)}` : null,
    finishBy,
    // Only an active goal can be behind: a paused one shows no forecast.
    behind: status === 'active' && (finishBy?.verdict === 'behind' || finishBy?.verdict === 'past due'),
  }
}
