/** Lofi Girl's "1 A.M Study Session": a regular video, which outlives live streams. */
export const DEFAULT_VIDEO_URL = 'https://www.youtube.com/watch?v=lTRiuFIWV54'
/** Former defaults that no longer play; saved settings still pointing at them move to DEFAULT_VIDEO_URL. */
export const RETIRED_VIDEO_IDS = ['jfKfPfyJRdk']

/** Video id from watch?v=, youtu.be/, embed/, shorts/ or live/ links, or a bare 11-character id. */
export function ytId(input: string): string | null {
  const s = (input || '').trim()
  if (/^[\w-]{11}$/.test(s)) return s
  const m = s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})(?![\w-])/)
  return m ? m[1] : null
}

export const embedUrl = (id: string, muted: boolean): string =>
  `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=${muted ? 1 : 0}&loop=1&playlist=${id}` +
  '&controls=0&modestbranding=1&playsinline=1&rel=0&iv_load_policy=3&disablekb=1'
