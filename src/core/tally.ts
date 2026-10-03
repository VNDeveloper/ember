import type { ISODate } from './dates'
import type { FocusLog } from './model'
import { targetKey } from './model'

export interface Tally {
  /** Minutes per targetKey, all time. */
  spent: Map<string, number>
  /** Minutes per targetKey, today only (session blocks drawn in accent). */
  spentToday: Map<string, number>
  minutesToday: number
  sessionsToday: number
}

export function tallyLogs(logs: FocusLog[], today: ISODate): Tally {
  const spent = new Map<string, number>()
  const spentToday = new Map<string, number>()
  let minutesToday = 0
  let sessionsToday = 0
  for (const l of logs) {
    const key = l.target ? targetKey(l.target) : null
    if (key) spent.set(key, (spent.get(key) ?? 0) + l.min)
    if (l.date !== today) continue
    minutesToday += l.min
    sessionsToday++
    if (key) spentToday.set(key, (spentToday.get(key) ?? 0) + l.min)
  }
  return { spent, spentToday, minutesToday, sessionsToday }
}
