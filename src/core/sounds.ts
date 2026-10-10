export type EndSound = 'chime' | 'bell' | 'beeps' | 'soft' | 'none'

/** What a session or break can end with (picked separately in Settings). */
export const END_SOUNDS: { id: EndSound; label: string }[] = [
  { id: 'chime', label: 'Chime' },
  { id: 'bell', label: 'Bell' },
  { id: 'beeps', label: 'Beeps' },
  { id: 'soft', label: 'Soft' },
  { id: 'none', label: 'None' },
]

export const isEndSound = (s: unknown): s is EndSound => END_SOUNDS.some((x) => x.id === s)

/** One synthesised note: starts `at` seconds in, decays over `dur` seconds from `gain`. */
export interface Note { freq: number; at: number; dur: number; wave: 'sine' | 'triangle' | 'square'; gain: number }

/** Generated in the browser (Web Audio), so they work offline and ship no audio files. */
export const SOUND_NOTES: Record<Exclude<EndSound, 'none'>, Note[]> = {
  chime: [
    { freq: 659.25, at: 0, dur: 0.9, wave: 'sine', gain: 0.25 },
    { freq: 987.77, at: 0.18, dur: 1.2, wave: 'sine', gain: 0.2 },
  ],
  bell: [
    { freq: 880, at: 0, dur: 2.2, wave: 'sine', gain: 0.25 },
    { freq: 1320, at: 0, dur: 1.6, wave: 'sine', gain: 0.1 },
    { freq: 2420, at: 0, dur: 1.2, wave: 'sine', gain: 0.06 },
  ],
  beeps: [0, 0.25, 0.5].map((at) => ({ freq: 1000, at, dur: 0.12, wave: 'square' as const, gain: 0.06 })),
  soft: [
    { freq: 523.25, at: 0, dur: 1.4, wave: 'triangle', gain: 0.2 },
    { freq: 659.25, at: 0.3, dur: 1.4, wave: 'triangle', gain: 0.16 },
    { freq: 783.99, at: 0.6, dur: 1.4, wave: 'triangle', gain: 0.14 },
  ],
}

/** A phase that ended over a minute ago (the app was closed or asleep) ends silently on catch-up. */
export const endSoundDue = (endedAt: number, now: number): boolean => now - endedAt < 60_000
