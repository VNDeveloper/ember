import { describe, expect, it } from 'vitest'
import { END_SOUNDS, endSoundDue, isEndSound, SOUND_NOTES } from './sounds'

describe('end sounds', () => {
  it('offers chime, bell, beeps, soft and none', () => {
    expect(END_SOUNDS.map((s) => s.id)).toEqual(['chime', 'bell', 'beeps', 'soft', 'none'])
    expect(END_SOUNDS.map((s) => s.label)).toEqual(['Chime', 'Bell', 'Beeps', 'Soft', 'None'])
  })

  it('knows its own ids', () => {
    expect(isEndSound('bell')).toBe(true)
    expect(isEndSound('none')).toBe(true)
    expect(isEndSound('gong')).toBe(false)
    expect(isEndSound(undefined)).toBe(false)
  })

  it('gives every audible sound short, quiet notes', () => {
    for (const { id } of END_SOUNDS) {
      if (id === 'none') continue
      const notes = SOUND_NOTES[id]
      expect(notes.length).toBeGreaterThan(0)
      for (const n of notes) {
        expect(n.freq).toBeGreaterThan(100)
        expect(n.gain).toBeGreaterThan(0)
        expect(n.gain).toBeLessThanOrEqual(0.4)
        expect(n.at + n.dur).toBeLessThanOrEqual(3)
      }
    }
  })

  it('stays silent for a phase that ended over a minute ago (the app was closed or asleep)', () => {
    expect(endSoundDue(1_000, 1_000)).toBe(true)
    expect(endSoundDue(1_000, 60_999)).toBe(true)
    expect(endSoundDue(1_000, 61_000)).toBe(false)
  })
})
