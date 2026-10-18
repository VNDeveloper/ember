import { dayLabel, diffDays, type ISODate } from './dates'
import { fmtM, pad2, plural } from './format'
import { goalColor, goalStats, goalStatus, isLive, isMilestoneDone, liveMilestones, liveSteps, stepTarget } from './goals'
import type { FocusLog, Goal, GoalStatus, Selection, Step, StepTarget, Task } from './model'
import { sameTarget } from './model'
import { correction, leftToGo, milestoneEstimate } from './pace'
import { sessionCount } from './tally'

const SESSION = 25

const stepMin = (spent: Map<string, number>, s: Step): number => spent.get(`step:${s.id}`) ?? 0
const allSteps = (g: Goal): Step[] => liveMilestones(g).flatMap(liveSteps)
const sumEst = (steps: Step[]) => steps.reduce((a, s) => a + s.estMin, 0)
const sumMin = (steps: Step[], spent: Map<string, number>) => steps.reduce((a, s) => a + stepMin(spent, s), 0)

/** Minutes focused on a goal's steps. */
export const goalFocused = (g: Goal, spent: Map<string, number>): number => sumMin(allSteps(g), spent)

export interface GoalListItem { id: string; title: string; swatch: string; pct: number; complete: boolean; meta: string; behind: boolean }

export interface GoalListGroup { status: GoalStatus; label: string; items: GoalListItem[] }
const GROUP_LABEL: Record<GoalStatus, string> = { active: 'Active', paused: 'Paused', achieved: 'Achieved' }

/** Goals grouped active, paused, achieved (empty groups left out). */
/** behind: goals whose pace check says behind or past due (see core/pace). */
export function goalList(goals: Goal[], spent: Map<string, number>, behind: Set<string> = new Set()): GoalListGroup[] {
  const by: Record<GoalStatus, GoalListItem[]> = { active: [], paused: [], achieved: [] }
  // Index over all goals so colours keep their positions; deleted goals are dropped.
  goals.forEach((g, gi) => {
    if (!isLive(g)) return
    const st = goalStats(g)
    const status = goalStatus(g)
    const focused = `${fmtM(goalFocused(g, spent))} focused`
    const meta = status === 'active' ? `${focused} · ${st.done}/${st.total} steps`
      : status === 'paused' ? `Paused · ${focused}`
      : `Achieved ${dayLabel(g.achievedOn ?? g.createdAt)} · ${focused}`
    by[status].push({ id: g.id, title: g.title, swatch: goalColor(gi), pct: st.pct, complete: st.total > 0 && st.pct === 100, meta, behind: behind.has(g.id) })
  })
  return (['active', 'paused', 'achieved'] as const).filter((s) => by[s].length).map((s) => ({ status: s, label: GROUP_LABEL[s], items: by[s] }))
}

export function goalKicker(g: Goal, spent: Map<string, number>): string {
  const st = goalStats(g)
  return `Goal · ${fmtM(goalFocused(g, spent))} focused · ${st.milestonesDone} of ${liveMilestones(g).length} milestones`
}

export interface GoalLedger { focused: string; estimated: string; left: string; estimates: string }

export function goalLedger(g: Goal, spent: Map<string, number>): GoalLedger {
  const steps = allSteps(g)
  const corr = correction(g, spent)
  const left = leftToGo(g, spent, corr)
  return {
    focused: fmtM(sumMin(steps, spent)),
    estimated: fmtM(sumEst(steps)),
    // Corrected for your track record and counting milestones without steps; "~" when either applies.
    left: `${corr.applied || left.unplannedMin ? '~' : ''}${fmtM(left.min)}`,
    estimates: corr.short,
  }
}

const NO_DATE = '9999-12-31'

/** Open tasks linked to the goal plus those finished today, by date with Someday last. */
export function goalTasks(tasks: Task[], goalId: string, today: ISODate): Task[] {
  return tasks
    .filter((t) => isLive(t) && t.goalId === goalId && (t.doneOn == null || t.doneOn === today))
    .sort((a, b) => {
      const x = a.date ?? NO_DATE
      const y = b.date ?? NO_DATE
      return x < y ? -1 : x > y ? 1 : 0
    })
}

export type BlockKind = 'earlier' | 'today' | 'remaining'

/** One block per 25 minutes: max(spent, estimate) blocks; the last `today` minutes of spent time are accent. */
export function sessionBlocks(min: number, est: number, todayMin: number): BlockKind[] {
  const spentBlocks = Math.round(min / SESSION)
  const estBlocks = Math.round(est / SESSION)
  const todayBlocks = Math.min(spentBlocks, Math.round(todayMin / SESSION))
  return Array.from({ length: Math.max(spentBlocks, estBlocks) }, (_, b) =>
    b < spentBlocks ? (b >= spentBlocks - todayBlocks ? 'today' : 'earlier') : 'remaining')
}

export interface StepRow {
  id: string
  title: string
  done: boolean
  selected: boolean
  target: StepTarget
  ledger: string
  note: string
  noteAccent: boolean
  blocks: BlockKind[]
  estMin: number
}

export interface MilestoneRow {
  id: string
  num: string
  title: string
  complete: boolean
  current: boolean
  count: string
  ledger: string
  segments: boolean[]
  steps: StepRow[]
  /** A milestone without steps: its rough estimate (yours, or a guess). */
  estimate: { text: string; guess: boolean } | null
}

export function roadmap(
  g: Goal, spent: Map<string, number>, spentToday: Map<string, number>, selection: Selection,
): MilestoneRow[] {
  const current = goalStats(g).currentIndex
  return liveMilestones(g).map((m, mi) => {
    const live = liveSteps(m)
    const e = milestoneEstimate(g, m)
    const steps: StepRow[] = live.map((s) => {
      const min = stepMin(spent, s)
      const done = s.doneOn != null
      const over = Math.round(min / SESSION) > Math.round(s.estMin / SESSION)
      const target = stepTarget(g, m, s)
      return {
        id: s.id,
        title: s.title,
        done,
        selected: sameTarget(selection, target),
        target,
        ledger: `${fmtM(min)} / ${fmtM(s.estMin)}`,
        note: over ? `+${fmtM(min - s.estMin)} over` : done ? `Done ${dayLabel(s.doneOn!)}` : '',
        noteAccent: over,
        blocks: sessionBlocks(min, s.estMin, stepMin(spentToday, s)),
        estMin: s.estMin,
      }
    })
    return {
      id: m.id,
      num: pad2(mi + 1),
      title: m.title,
      complete: isMilestoneDone(m),
      current: mi === current,
      count: `${live.filter((s) => s.doneOn != null).length} / ${live.length}`,
      ledger: `${fmtM(sumMin(live, spent))} of est. ${fmtM(sumEst(live))}`,
      segments: live.map((s) => s.doneOn != null),
      steps,
      estimate: e ? { text: e.guess ? `~${fmtM(e.min)} guess` : `~${fmtM(e.min)}`, guess: e.guess } : null,
    }
  })
}

export function finishLine(g: Goal): { reached: boolean; title: string; text: string } {
  const milestones = liveMilestones(g)
  const reached = milestones.length > 0 && milestones.every(isMilestoneDone)
  return {
    reached,
    title: reached ? 'Finish line — reached' : 'Finish line',
    text: g.outcome || 'Describe what done looks like above.',
  }
}

export interface AchievedSummary { outcome: string; span: string; focused: string; sessions: number; steps: number; milestones: number }

/** What it took: start to achieved day, and the focus sessions on the goal's live steps. */
export function achievedSummary(g: Goal, logs: FocusLog[]): AchievedSummary {
  const ids = new Set(allSteps(g).map((s) => s.id))
  const mine = logs.filter((l) => l.target?.kind === 'step' && ids.has(l.target.stepId))
  const on = g.achievedOn ?? g.createdAt
  const days = diffDays(on, g.createdAt)
  const st = goalStats(g)
  return {
    outcome: g.outcome,
    span: `${dayLabel(g.createdAt)} → ${dayLabel(on)} · ${days === 0 ? 'same day' : plural(days, 'day')}`,
    focused: fmtM(mine.reduce((a, l) => a + l.min, 0)),
    sessions: sessionCount(mine),
    steps: st.done,
    milestones: st.milestonesDone,
  }
}
