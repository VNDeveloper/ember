import { pad2 } from './format'

/** 'YYYY-MM-DD' in local time. */
export type ISODate = string

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const toISO = (d: Date): ISODate => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

/** Local midnight of the given day. */
export function fromISO(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const todayISO = (now: number = Date.now()): ISODate => toISO(new Date(now))

/** 'YYYY-MM-DD' that is a real calendar day (not 2026-02-30 or 2026-99-99). */
export const isRealDate = (s: unknown): s is ISODate =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && toISO(fromISO(s)) === s

export function addDays(s: ISODate, n: number): ISODate {
  const d = fromISO(s)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

/** Whole days from b to a (a − b). Rounding absorbs DST hours. */
export const diffDays = (a: ISODate, b: ISODate): number =>
  Math.round((fromISO(a).getTime() - fromISO(b).getTime()) / 864e5)

export function dayLabel(s: ISODate): string {
  const d = fromISO(s)
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

export const weekdayLong = (s: ISODate): string => WEEKDAYS_LONG[fromISO(s).getDay()]

export function navDate(s: ISODate): string {
  const d = fromISO(s)
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export const monthName = (s: ISODate): string => MONTHS_LONG[fromISO(s).getMonth()]

export function isWeekend(s: ISODate): boolean {
  const day = fromISO(s).getDay()
  return day === 0 || day === 6
}

export const yearOf = (s: ISODate): number => Number(s.slice(0, 4))
export const startOfYear = (s: ISODate): ISODate => `${s.slice(0, 4)}-01-01`
/** 0-based: 1 Jan → 0. */
export const dayOfYear = (s: ISODate): number => diffDays(s, startOfYear(s))
export const daysInYear = (y: number): number => ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365)

export const mondayOf = (s: ISODate): ISODate => addDays(s, -((fromISO(s).getDay() + 6) % 7))
