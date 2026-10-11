import { addDays, dayLabel, weekdayLong, type ISODate } from './dates'
import { pad2, plural } from './format'
import { goalColor, goalStats, isActiveGoal, isLive, liveMilestones, liveSteps, nextOpenStep, stepTarget } from './goals'
import type { Goal, Selection, StepTarget, Task } from './model'
import { sameTarget } from './model'

export interface TaskNote { text: string; accent: boolean }

const relDay = (d: ISODate, today: ISODate): string =>
  d === today ? 'Today' : d === addDays(today, 1) ? 'Tomorrow' : dayLabel(d)

/** The note after a task's tag: deadlines, quiet roll-over, or the date where dates are shown. */
export function taskNote(t: Task, today: ISODate, showDate = false): TaskNote | null {
  if (t.date == null) return showDate ? { text: 'Someday', accent: false } : null
  if (t.doneOn == null && t.date < today) {
    return t.deadline
      ? { text: `Deadline passed · ${dayLabel(t.date)}`, accent: true }
      : { text: `From ${dayLabel(t.date)}`, accent: false }
  }
  if (t.deadline) return { text: t.date === today ? 'Due today' : `Due ${relDay(t.date, today)}`, accent: true }
  if (showDate) return { text: relDay(t.date, today), accent: false }
  return null
}

export const isLate = (t: Task, today: ISODate): boolean =>
  t.deadline && t.date != null && t.date < today && t.doneOn == null

export interface TodayLists { open: Task[]; done: Task[] }

/** Open tasks dated today or earlier (missed deadlines first), plus tasks finished today. */
export function todayList(tasks: Task[], today: ISODate): TodayLists {
  const list = tasks.filter(isLive).filter((t) => t.date != null && t.date <= today && (t.doneOn == null || t.doneOn === today))
  const open = list.filter((t) => t.doneOn == null)
  return {
    open: [...open.filter((t) => isLate(t, today)), ...open.filter((t) => !isLate(t, today))],
    done: list.filter((t) => t.doneOn != null),
  }
}

export interface UpcomingItem { task: Task; showDate: boolean }
export interface UpcomingGroup { key: string; label: string; right: string; collapsible: boolean; items: UpcomingItem[] }

const byDate = (a: Task, b: Task) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : 0)
/** Finished tasks stay visible only on the day they were finished. */
const visibleToday = (t: Task, today: ISODate) => t.doneOn == null || t.doneOn === today

export function upcomingGroups(tasks: Task[], today: ISODate): UpcomingGroup[] {
  const tomorrow = addDays(today, 1)
  const horizon = addDays(today, 6)
  const groups: UpcomingGroup[] = []
  const live = tasks.filter(isLive)
  const future = live.filter((t) => t.date != null && t.date > today && visibleToday(t, today)).sort(byDate)
  for (const t of future) {
    const date = t.date!
    const later = date > horizon
    const key = later ? 'later' : date
    let g = groups.find((x) => x.key === key)
    if (!g) {
      g = {
        key,
        label: later ? 'Later' : date === tomorrow ? 'Tomorrow' : weekdayLong(date),
        right: later ? '' : dayLabel(date),
        collapsible: later,
        items: [],
      }
      groups.push(g)
    }
    g.items.push({ task: t, showDate: later })
  }
  const someday = live.filter((t) => t.date == null && visibleToday(t, today))
  if (someday.length) {
    groups.push({ key: 'someday', label: 'Someday', right: '', collapsible: true, items: someday.map((task) => ({ task, showDate: false })) })
  }
  for (const g of groups) if (g.collapsible) g.right = plural(g.items.length, 'task')
  return groups
}

export function upcomingSummary(tasks: Task[], today: ISODate): string {
  const open = tasks.filter((t) => isLive(t) && t.doneOn == null)
  const planned = open.filter((t) => t.date != null && t.date > today)
  const deadlines = planned.filter((t) => t.deadline).length
  const someday = open.filter((t) => t.date == null).length
  return `${planned.length} planned · ${plural(deadlines, 'deadline')}${someday ? ` · ${someday} someday` : ''}`
}

export interface WorkingOnCard {
  goalId: string
  title: string
  swatch: string
  pct: number
  milestoneLabel: string
  milestoneTitle: string
  /** One entry per step in the current milestone: done or not. */
  segments: boolean[]
  nextTitle: string
  target: StepTarget
  selected: boolean
}

export function workingOn(goals: Goal[], selection: Selection): WorkingOnCard[] {
  return goals.flatMap((g, gi) => {
    if (!isActiveGoal(g)) return []
    const next = nextOpenStep(g)
    if (!next) return []
    const target = stepTarget(g, next.milestone, next.step)
    return [{
      goalId: g.id,
      title: g.title,
      swatch: goalColor(gi),
      pct: goalStats(g).pct,
      milestoneLabel: `Milestone ${pad2(next.mi + 1)} of ${pad2(liveMilestones(g).length)}`,
      milestoneTitle: next.milestone.title,
      segments: liveSteps(next.milestone).map((s) => s.doneOn != null),
      nextTitle: next.step.title,
      target,
      selected: sameTarget(selection, target),
    }]
  })
}
