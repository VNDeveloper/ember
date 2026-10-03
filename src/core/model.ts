import type { ISODate } from './dates'
import { DEFAULT_VIDEO_URL } from './youtube'

export type { ISODate }

export interface Step { id: string; title: string; doneOn: ISODate | null; estMin: number }
export interface Milestone { id: string; title: string; steps: Step[] }
export interface Goal { id: string; title: string; outcome: string; milestones: Milestone[]; createdAt: ISODate }

export interface Task {
  id: string
  title: string
  tag: string
  goalId: string | null
  /** null = Someday */
  date: ISODate | null
  /** Only meaningful when date != null. */
  deadline: boolean
  doneOn: ISODate | null
}

export interface TaskTarget { kind: 'task'; taskId: string }
export interface StepTarget { kind: 'step'; goalId: string; msId: string; stepId: string }
export type Target = TaskTarget | StepTarget
export type Selection = Target | null

export interface FocusLog { id: string; at: number; date: ISODate; min: number; target: Target | null }

export type Phase = 'focus' | 'break'
export interface Timer {
  phase: Phase
  running: boolean
  /** Wall-clock ms when the phase ends; set only while running. */
  endsAt: number | null
  /** Timer-seconds left while paused (speed-independent). */
  leftSec: number
  /** Timer-seconds per real second, captured when a run starts (1, or 60 in demo). */
  speed: number
  /** Full length of this phase in timer-seconds, fixed when the phase begins (what a finished focus logs). */
  lengthSec: number
}

export type SessionLength = '25/5' | '50/10'
export type FocusBg = 'video' | 'off'
export interface Settings {
  session: SessionLength
  demo: boolean
  showFuture: boolean
  wallWeeks: number
  focusBg: FocusBg
  youtubeUrl: string
  muted: boolean
}

export interface EmberData {
  goals: Goal[]
  tasks: Task[]
  logs: FocusLog[]
  selection: Selection
  timer: Timer
  settings: Settings
}

export const DEFAULT_SETTINGS: Settings = {
  session: '25/5',
  demo: false,
  showFuture: true,
  wallWeeks: 12,
  focusBg: 'video',
  youtubeUrl: DEFAULT_VIDEO_URL,
  muted: true,
}

export const targetKey = (t: Target): string => (t.kind === 'task' ? `task:${t.taskId}` : `step:${t.stepId}`)

export const sameTarget = (a: Target | null, b: Target | null): boolean =>
  !!a && !!b && targetKey(a) === targetKey(b)
