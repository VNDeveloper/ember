/** Done-wall length, as in the prototype's Tweaks (4–26 weeks, default 12). */
export const WALL_WEEKS_MIN = 4
export const WALL_WEEKS_MAX = 26
const WALL_WEEKS_DEFAULT = 12

export const clampWallWeeks = (n: number): number =>
  Math.max(WALL_WEEKS_MIN, Math.min(WALL_WEEKS_MAX, Math.round(n) || WALL_WEEKS_DEFAULT))

export const stepWallWeeks = (n: number, delta: number): number => clampWallWeeks(clampWallWeeks(n) + delta)
