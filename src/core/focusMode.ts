import type { Phase } from './model'

export interface FocusUIState {
  running: boolean
  idle: boolean
  settingsOpen: boolean
  pickerOpen: boolean
  /** The mouse has left the window. */
  pointerOut: boolean
}

/**
 * Focus mode controls hide when the mouse leaves the window, or while a session runs, nobody is
 * using them and no panel is open. The timer itself always stays.
 */
export const hideFocusUI = (s: FocusUIState): boolean =>
  s.pointerOut || (s.running && s.idle && !s.settingsOpen && !s.pickerOpen)

export interface VideoPause {
  paused: boolean
  /** Paused by a focus session ending, not by the user. */
  auto: boolean
}
interface TimerState { phase: Phase; running: boolean }

/** The video pauses when a focus session ends and plays again when the next one starts, unless the user paused it. */
export function videoOnTimer(prev: TimerState, next: TimerState, v: VideoPause): VideoPause {
  if (prev.phase === 'focus' && next.phase === 'break') return v.paused ? v : { paused: true, auto: true }
  if (v.auto && next.phase === 'focus' && next.running) return { paused: false, auto: false }
  return v
}

export interface VideoWaitState {
  /** A background video is set and switched on. */
  videoOn: boolean
  /** YouTube refused the video. */
  failed: boolean
  /** The player reports it is actually playing. */
  playing: boolean
  /** The user paused the video themselves (not a session ending). */
  userPaused: boolean
}

/** Focus mode holds a starting session until its video is playing, unless the video is off, broken or paused on purpose. */
export const waitForVideo = (s: VideoWaitState): boolean => s.videoOn && !s.failed && !s.userPaused && !s.playing
