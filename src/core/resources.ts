import { detect, normaliseUrl } from './companies'
import { dayLabel, diffDays, toISO, todayISO, yearOf, type ISODate } from './dates'
import { plural } from './format'
import { goalColor, isLive } from './goals'
import { BILLINGS, RESOURCE_STATUSES, RESOURCE_TYPES, type Billing, type Goal, type Resource, type ResourceStatus, type ResourceType } from './model'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const isDate = (x: unknown): x is ISODate => typeof x === 'string' && ISO.test(x)
const text = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')

/**
 * A resource as saved, synced or restored, made safe to use: null when it has no id or no http(s) link;
 * unknown type/status/billing and a bad price are repaired; a valid resource comes back equal.
 */
export function repairResource(x: unknown, today: ISODate = todayISO()): Resource | null {
  if (!x || typeof x !== 'object') return null
  const r = x as Record<string, unknown>
  if (typeof r.id !== 'string' || !r.id || typeof r.url !== 'string') return null
  const url = normaliseUrl(r.url)
  if (!url) return null
  const priced = typeof r.price === 'number' && Number.isFinite(r.price) && r.price > 0
  const billing: Billing = priced && BILLINGS.includes(r.billing as Billing) ? (r.billing as Billing) : 'free'
  const recurring = billing === 'month' || billing === 'year'
  const out: Resource = {
    id: r.id,
    title: text(r.title) || r.url,
    url: r.url,
    company: text(r.company) || detect(url, []).company || 'Other',
    type: RESOURCE_TYPES.includes(r.type as ResourceType) ? (r.type as ResourceType) : 'other',
    status: RESOURCE_STATUSES.includes(r.status as ResourceStatus) ? (r.status as ResourceStatus) : 'using',
    goalId: typeof r.goalId === 'string' && r.goalId ? r.goalId : null,
    billing,
    price: billing === 'free' ? null : (r.price as number),
    renewsOn: recurring && isDate(r.renewsOn) ? r.renewsOn : null,
    notes: typeof r.notes === 'string' ? r.notes : '',
    createdAt: isDate(r.createdAt) ? r.createdAt : today,
  }
  if (isDate(r.keptFor)) out.keptFor = r.keptFor
  if (isDate(r.deletedOn)) out.deletedOn = r.deletedOn
  else if (r.deletedOn === null) out.deletedOn = null
  if (typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt)) out.updatedAt = r.updatedAt
  return out
}

export function repairResources(xs: unknown, today: ISODate = todayISO()): Resource[] {
  if (!Array.isArray(xs)) return []
  return xs.map((x) => repairResource(x, today)).filter((r): r is Resource => r !== null)
}

export const TYPE_LABEL: Record<ResourceType, string> = {
  course: 'Course', video: 'Video', docs: 'Docs', model: 'Model', article: 'Article', tool: 'Tool', membership: 'Membership', other: 'Other',
}
export const STATUS_LABEL: Record<ResourceStatus, string> = { using: 'Using', later: 'Later', finished: 'Finished', dropped: 'Dropped' }

export const liveResources = (rs: Resource[]): Resource[] => rs.filter(isLive)
export const isRecurring = (r: Resource): boolean => (r.billing === 'month' || r.billing === 'year') && r.price != null

/** £49, £9.99 (rounded to the penny). */
export function money(n: number): string {
  const p = Math.round(n * 100)
  return p % 100 ? `£${(p / 100).toFixed(2)}` : `£${p / 100}`
}

export const inDays = (n: number): string => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`)

/** `anchor` plus whole months, keeping its day where the month has it, else the month's last day. */
export function addMonthsClamped(anchor: ISODate, months: number): ISODate {
  const [y, m, d] = anchor.split('-').map(Number)
  const total = m - 1 + months
  const ny = y + Math.floor(total / 12)
  const nm = ((total % 12) + 12) % 12
  const last = new Date(ny, nm + 1, 0).getDate()
  return toISO(new Date(ny, nm, Math.min(d, last)))
}

/** The first renewal on or after today, stepping from the entered date (never written back). */
export function nextRenewal(r: Resource, today: ISODate): ISODate | null {
  if (!isRecurring(r) || !r.renewsOn) return null
  if (r.renewsOn >= today) return r.renewsOn
  const step = r.billing === 'month' ? 1 : 12
  // Jump straight to about today (a mistyped year can be centuries back), then step to the first date not before it.
  const [y, m] = r.renewsOn.split('-').map(Number)
  const [ty, tm] = today.split('-').map(Number)
  let k = Math.max(1, Math.floor(((ty - y) * 12 + (tm - m)) / step))
  let date = addMonthsClamped(r.renewsOn, k * step)
  while (date < today) date = addMonthsClamped(r.renewsOn, ++k * step)
  return date
}

export function monthlyCost(r: Resource): number {
  if (r.status !== 'using' || !isRecurring(r) || r.price == null) return 0
  return r.billing === 'month' ? r.price : r.price / 12
}

/** The in-use membership of the same company that a free resource comes with. */
export function coveringMembership(r: Resource, rs: Resource[]): Resource | null {
  if (r.billing !== 'free' || r.type === 'membership') return null
  return rs.find((m) => m.id !== r.id && isLive(m) && m.type === 'membership' && m.status === 'using' && m.company === r.company) ?? null
}

/** The live, in-use resources a membership covers. */
export function coveredBy(m: Resource, rs: Resource[]): Resource[] {
  if (m.type !== 'membership') return []
  return rs.filter((r) => isLive(r) && r.status === 'using' && coveringMembership(r, rs)?.id === m.id)
}

export function priceText(r: Resource, rs: Resource[]): string {
  if (r.billing === 'free' || r.price == null) {
    const m = coveringMembership(r, rs)
    return m ? `In ${m.title}` : 'Free'
  }
  if (r.billing === 'once') return `${money(r.price)} once`
  return `${money(r.price)} / ${r.billing === 'month' ? 'month' : 'year'}`
}

const dateText = (d: ISODate, today: ISODate): string => (yearOf(d) === yearOf(today) ? dayLabel(d) : `${dayLabel(d)}, ${yearOf(d)}`)

export function renewalText(r: Resource, today: ISODate): { text: string; soon: boolean } | null {
  const next = nextRenewal(r, today)
  if (!next) return null
  const days = diffDays(next, today)
  const soon = days <= 7
  return { text: soon ? `Renews ${dateText(next, today)} · ${inDays(days)}` : `Renews ${dateText(next, today)}`, soon }
}

export interface DueRenewal { resource: Resource; date: ISODate; days: number }

function renewalsWithin(rs: Resource[], today: ISODate, from: number, to: number): DueRenewal[] {
  const out: DueRenewal[] = []
  for (const r of rs) {
    if (!isLive(r) || r.status !== 'using') continue
    const date = nextRenewal(r, today)
    if (!date) continue
    const days = diffDays(date, today)
    if (days >= from && days <= to) out.push({ resource: r, date, days })
  }
  return out.sort((a, b) => a.days - b.days)
}

/** Today's reminders: due in 0–3 days and not already kept for that date. */
export const dueRenewals = (rs: Resource[], today: ISODate): DueRenewal[] =>
  renewalsWithin(rs, today, 0, 3).filter((d) => d.resource.keptFor !== d.date)

/** Upcoming's rows: renewals tomorrow through six days out (Upcoming's dated range). */
export const upcomingRenewals = (rs: Resource[], today: ISODate): DueRenewal[] => renewalsWithin(rs, today, 1, 6)

export type StatusFilter = ResourceStatus | 'all'
/** 'all', 'none' (no live goal) or a goal id. */
export type GoalFilter = string

const goalIds = (goals: Goal[]): Set<string> => new Set(goals.filter(isLive).map((g) => g.id))

/** 'none' also matches resources whose goal was deleted: they show "no goal" everywhere else too. */
export const matchesGoal = (r: Resource, f: GoalFilter, liveGoals: Set<string>): boolean =>
  f === 'all' ? true : f === 'none' ? !r.goalId || !liveGoals.has(r.goalId) : r.goalId === f

export function statusCounts(rs: Resource[], goal: GoalFilter, goals: Goal[]): Record<StatusFilter, number> {
  const out: Record<StatusFilter, number> = { using: 0, later: 0, finished: 0, dropped: 0, all: 0 }
  const ids = goalIds(goals)
  for (const r of liveResources(rs)) {
    if (!matchesGoal(r, goal, ids)) continue
    out[r.status]++
    out.all++
  }
  return out
}

export interface ResourceRowView {
  resource: Resource
  goal: { title: string; color: string } | null
  price: string
  paid: boolean
  renewal: { text: string; soon: boolean } | null
}
export interface CompanyGroup { company: string; sub: string; rows: ResourceRowView[] }

export function resourceList(rs: Resource[], goals: Goal[], f: { status: StatusFilter; goal: GoalFilter }, today: ISODate): CompanyGroup[] {
  const live = liveResources(rs)
  const ids = goalIds(goals)
  const shown = live.filter((r) => (f.status === 'all' || r.status === f.status) && matchesGoal(r, f.goal, ids))
  const byCompany = new Map<string, Resource[]>()
  for (const r of shown) byCompany.set(r.company, [...(byCompany.get(r.company) ?? []), r])
  const groups: CompanyGroup[] = []
  for (const [company, items] of byCompany) {
    items.sort((a, b) =>
      Number(b.type === 'membership') - Number(a.type === 'membership') || a.createdAt.localeCompare(b.createdAt) || a.title.localeCompare(b.title))
    const monthly = items.reduce((sum, r) => sum + monthlyCost(r), 0)
    const rows = items.map((r): ResourceRowView => {
      const gi = r.goalId ? goals.findIndex((g) => g.id === r.goalId) : -1
      const goal = gi >= 0 && isLive(goals[gi]) ? { title: goals[gi].title, color: goalColor(gi) } : null
      return { resource: r, goal, price: priceText(r, live), paid: r.billing !== 'free' && r.price != null, renewal: renewalText(r, today) }
    })
    groups.push({ company, sub: `${plural(rows.length, 'resource')}${monthly ? ` · ${money(monthly)} a month` : ''}`, rows })
  }
  return groups.sort((a, b) => b.rows.length - a.rows.length || a.company.localeCompare(b.company))
}

export interface MoneyLine { total: string; count: string; renewal: { text: string; soon: boolean } | null }

export function moneyLine(rs: Resource[], today: ISODate): MoneyLine | null {
  const paid = liveResources(rs).filter((r) => monthlyCost(r) > 0)
  if (!paid.length) return null
  const total = paid.reduce((sum, r) => sum + monthlyCost(r), 0)
  const next = paid
    .map((r) => ({ r, date: nextRenewal(r, today) }))
    .filter((x): x is { r: Resource; date: ISODate } => x.date != null)
    .sort((a, b) => a.date.localeCompare(b.date))[0]
  let renewal: MoneyLine['renewal'] = null
  if (next) {
    const days = diffDays(next.date, today)
    renewal = days <= 7
      ? { text: `${next.r.title} renews ${inDays(days)}`, soon: true }
      : { text: `next: ${next.r.title} on ${dateText(next.date, today)}`, soon: false }
  }
  return { total: `${money(total)} a month`, count: `on ${plural(paid.length, 'subscription')}`, renewal }
}

export function libraryKicker(rs: Resource[]): string {
  const live = liveResources(rs)
  const companies = new Set(live.map((r) => r.company)).size
  return `Library · ${plural(live.length, 'resource')} from ${companies} ${companies === 1 ? 'company' : 'companies'}`
}

/** A goal's in-use resources, oldest first (the goal strip, focus bar and Focus mode). */
export const goalResources = (rs: Resource[], goalId: string): Resource[] =>
  liveResources(rs)
    .filter((r) => r.status === 'using' && r.goalId === goalId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.title.localeCompare(b.title))

export function goalFilterOptions(rs: Resource[], goals: Goal[]): { value: GoalFilter; label: string }[] {
  const live = liveResources(rs)
  const used = new Set(live.map((r) => r.goalId))
  const opts: { value: GoalFilter; label: string }[] = [{ value: 'all', label: 'All goals' }]
  for (const g of goals) if (isLive(g) && used.has(g.id)) opts.push({ value: g.id, label: g.title })
  const ids = goalIds(goals)
  if (live.some((r) => !r.goalId || !ids.has(r.goalId))) opts.push({ value: 'none', label: 'No goal' })
  return opts
}
