import { addDays, dayLabel, type ISODate } from './dates'
import { pad2 } from './format'
import { goalColor, isLive, liveSteps, nextOpenStep, stepTarget } from './goals'
import type { Goal, Selection, Target, Task } from './model'
import { sameTarget, targetKey } from './model'

export type PickerTab = 'tasks' | 'goals'

export interface PickerItem {
  key: string
  title: string
  meta: string
  swatch: string
  /** Tasks without a goal get an ink-outlined square instead of a colour. */
  outlined: boolean
  current: boolean
  target: Target
}

export interface PickerSection { label: string; items: PickerItem[] }

export function pickerSections(
  goals: Goal[], tasks: Task[], selection: Selection, tab: PickerTab, query: string, today: ISODate,
): PickerSection[] {
  const item = (title: string, meta: string, swatch: string, outlined: boolean, target: Target): PickerItem =>
    ({ key: targetKey(target), title, meta, swatch, outlined, current: sameTarget(selection, target), target })

  const taskItem = (t: Task, prefix = ''): PickerItem => {
    const gi = t.goalId ? goals.findIndex((g) => g.id === t.goalId) : -1
    const linked = gi >= 0 && isLive(goals[gi])
    const base = linked ? goals[gi].title : t.tag || 'Task'
    return item(t.title, prefix + base, linked ? goalColor(gi) : 'transparent', !linked, { kind: 'task', taskId: t.id })
  }
  const tomorrow = addDays(today, 1)
  const rel = (d: ISODate) => (d === today ? 'Today' : d === tomorrow ? 'Tomorrow' : dayLabel(d))

  let sections: PickerSection[]
  if (tab === 'goals') {
    sections = goals.map((g, gi) => {
      if (!isLive(g)) return { label: g.title, items: [] }
      const next = nextOpenStep(g)
      if (!next) return { label: g.title, items: [] }
      const m = next.milestone
      const items = liveSteps(m)
        .filter((s) => s.doneOn == null)
        .map((s) => item(
          s.title,
          `${pad2(next.mi + 1)} ${m.title}${s.id === next.step.id ? ' · next step' : ''}`,
          goalColor(gi), false, stepTarget(g, m, s),
        ))
      return { label: g.title, items }
    })
  } else {
    const open = tasks.filter((t) => isLive(t) && t.doneOn == null)
    sections = [
      { label: 'Today', items: open.filter((t) => t.date != null && t.date <= today).map((t) => taskItem(t)) },
      {
        label: 'Upcoming',
        items: open
          .filter((t) => t.date != null && t.date > today)
          .sort((a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : 0))
          .map((t) => taskItem(t, `${rel(t.date!)} · `)),
      },
      { label: 'Someday', items: open.filter((t) => t.date == null).map((t) => taskItem(t)) },
    ]
  }

  const q = query.trim().toLowerCase()
  return sections
    .map((s) => ({ ...s, items: q ? s.items.filter((i) => `${i.title} ${i.meta}`.toLowerCase().includes(q)) : s.items }))
    .filter((s) => s.items.length > 0)
}
