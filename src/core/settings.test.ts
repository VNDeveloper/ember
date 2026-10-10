import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from './model'
import { clampVolume, clampWallWeeks, repairSettings, stepWallWeeks, WALL_WEEKS_MAX, WALL_WEEKS_MIN } from './settings'
import { DEFAULT_VIDEO_URL } from './youtube'

describe('done-wall weeks', () => {
  it('keeps the prototype range of 4 to 26 weeks', () => {
    expect([WALL_WEEKS_MIN, WALL_WEEKS_MAX]).toEqual([4, 26])
  })

  it.each([[12, 12], [3, 4], [40, 26], [7.6, 8], [Number.NaN, 12], [0, 12]])('clamps %s to %s', (n, out) => {
    expect(clampWallWeeks(n)).toBe(out)
  })

  it('steps by whole weeks and stops at the ends', () => {
    expect(stepWallWeeks(12, 1)).toBe(13)
    expect(stepWallWeeks(12, -1)).toBe(11)
    expect(stepWallWeeks(4, -1)).toBe(4)
    expect(stepWallWeeks(26, 1)).toBe(26)
    expect(stepWallWeeks(99, -1)).toBe(25)
  })
})

describe('volume', () => {
  it.each([[80, 80], [-5, 0], [140, 100], [33.4, 33], [Number.NaN, 80]])('clamps %s to %s', (n, out) => {
    expect(clampVolume(n)).toBe(out)
  })
})

describe('repairSettings', () => {
  it('fills settings added since the data was saved', () => {
    const { volume: _v, focusEndSound: _f, breakEndSound: _b, ...old } = DEFAULT_SETTINGS
    expect(repairSettings(old)).toMatchObject({ volume: 80, focusEndSound: 'chime', breakEndSound: 'bell' })
  })

  it('keeps valid custom values', () => {
    const s = { ...DEFAULT_SETTINGS, session: '40/8' as const, volume: 35, focusEndSound: 'beeps' as const, breakEndSound: 'none' as const }
    expect(repairSettings(s)).toEqual(s)
  })

  it('repairs a bad session, volume or sound', () => {
    const bad = { ...DEFAULT_SETTINGS, session: '0/5', volume: 'loud', focusEndSound: 'gong', breakEndSound: 3 }
    expect(repairSettings(bad)).toMatchObject({ session: '25/5', volume: 80, focusEndSound: 'chime', breakEndSound: 'bell' })
  })

  it('moves the retired default stream to the current default video', () => {
    expect(repairSettings({ ...DEFAULT_SETTINGS, youtubeUrl: 'https://www.youtube.com/watch?v=jfKfPfyJRdk' }).youtubeUrl).toBe(DEFAULT_VIDEO_URL)
    expect(repairSettings({ ...DEFAULT_SETTINGS, youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' }).youtubeUrl).toBe('https://youtu.be/dQw4w9WgXcQ')
  })
})
