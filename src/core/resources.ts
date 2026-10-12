import { detect, normaliseUrl } from './companies'
import { todayISO, type ISODate } from './dates'
import { BILLINGS, RESOURCE_STATUSES, RESOURCE_TYPES, type Billing, type Resource, type ResourceStatus, type ResourceType } from './model'

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
