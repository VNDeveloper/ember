import { DEFAULT_SETTINGS, type Settings } from './model'
import { isEndSound } from './sounds'
import { isSession } from './timer'
import { RETIRED_VIDEO_IDS, ytId } from './youtube'

/** Done-wall length, as in the prototype's Tweaks (4–26 weeks, default 12). */
export const WALL_WEEKS_MIN = 4
export const WALL_WEEKS_MAX = 26
const WALL_WEEKS_DEFAULT = 12

export const clampWallWeeks = (n: number): number =>
  Math.max(WALL_WEEKS_MIN, Math.min(WALL_WEEKS_MAX, Math.round(n) || WALL_WEEKS_DEFAULT))

export const stepWallWeeks = (n: number, delta: number): number => clampWallWeeks(clampWallWeeks(n) + delta)

export const clampVolume = (n: number): number =>
  Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : DEFAULT_SETTINGS.volume

/** Fill settings added since the data was saved, and repair hand-edited or out-of-date values. */
export function repairSettings(saved: object): Settings {
  const s = { ...DEFAULT_SETTINGS, ...saved } as Settings
  if (!isSession(s.session)) s.session = DEFAULT_SETTINGS.session
  s.volume = typeof s.volume === 'number' ? clampVolume(s.volume) : DEFAULT_SETTINGS.volume
  if (!isEndSound(s.focusEndSound)) s.focusEndSound = DEFAULT_SETTINGS.focusEndSound
  if (!isEndSound(s.breakEndSound)) s.breakEndSound = DEFAULT_SETTINGS.breakEndSound
  if (RETIRED_VIDEO_IDS.includes(ytId(s.youtubeUrl) ?? '')) s.youtubeUrl = DEFAULT_SETTINGS.youtubeUrl
  return s
}
