export const pad2 = (n: number): string => String(n).padStart(2, '0')

/** 25 → "25m", 60 → "1h", 75 → "1h 15m". */
export function fmtM(min: number): string {
  const m = Math.round(min)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? `${h}h ${rest}m` : `${h}h`
}

export const fmtInt = (n: number): string => n.toLocaleString('en-US')

/** Seconds left → "MM:SS", rounding up so 0.2s still reads 00:01. */
export function clock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec))
  return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`
}

/** The prototype's hsh(): stable 32-bit string hash. */
export function hashStr(s: string): number {
  let h = 7
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}

/** 7-character hex id shown in the activity log. */
export const hash7 = (s: string): string => hashStr(s).toString(16).padStart(8, '0').slice(0, 7)

export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`
