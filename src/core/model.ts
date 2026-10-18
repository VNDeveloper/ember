import type { ISODate } from './dates'
import type { EndSound } from './sounds'
import { DEFAULT_VIDEO_URL } from './youtube'

export type { ISODate }

/** deletedOn (soft delete): hidden from live views, kept for history. updatedAt: last edit (sync merge). */
export interface Step { id: string; title: string; doneOn: ISODate | null; estMin: number; deletedOn?: ISODate | null; updatedAt?: number }
export interface Milestone { id: string; title: string; steps: Step[]; deletedOn?: ISODate | null; updatedAt?: number }
export interface HabitTarget {
  /** Minutes of focus on the goal that make a day count (5–240). */
  minutes: number
  /** Days a week that must count for the week to be hit (1–7). */
  daysPerWeek: number
  /** The Monday this target applies from. */
  from: ISODate
}
/** A practice habit on a goal, measured from focus time (see core/habits). */
export interface Habit {
  /** Oldest first; the last is the current target. Never empty. */
  targets: HabitTarget[]
  /** Periods the goal was paused: [from, to); to is null while still paused. */
  pauses: { from: ISODate; to: ISODate | null }[]
  /** Soft delete (Remove habit), so the undo bar can bring it back. */
  deletedOn?: ISODate | null
}

export type GoalStatus = 'active' | 'paused' | 'achieved'
export interface Goal {
  id: string; title: string; outcome: string; milestones: Milestone[]; createdAt: ISODate
  /** Missing = active (active is never stored). */
  status?: GoalStatus
  /** Set only while achieved: the day the user confirmed it. */
  achievedOn?: ISODate | null
  /** Optional practice habit: focus minutes on N days a week. */
  habit?: Habit | null
  deletedOn?: ISODate | null; updatedAt?: number
}

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
  /** Soft delete: hidden from live views, kept for history. */
  deletedOn?: ISODate | null
  /** Last edit, epoch ms (sync merge: newer wins). Missing = oldest. */
  updatedAt?: number
}

export type ResourceType = 'course' | 'video' | 'docs' | 'model' | 'article' | 'tool' | 'membership' | 'other'
export const RESOURCE_TYPES: ResourceType[] = ['course', 'video', 'docs', 'model', 'article', 'tool', 'membership', 'other']
export type ResourceStatus = 'using' | 'later' | 'finished' | 'dropped'
export const RESOURCE_STATUSES: ResourceStatus[] = ['using', 'later', 'finished', 'dropped']
export type Billing = 'free' | 'once' | 'month' | 'year'
export const BILLINGS: Billing[] = ['free', 'once', 'month', 'year']

export interface Resource {
  id: string
  title: string
  /** Always http(s), normalised (see core/companies normaliseUrl). */
  url: string
  company: string
  type: ResourceType
  status: ResourceStatus
  goalId: string | null
  billing: Billing
  /** Pounds; null exactly when billing is 'free'. */
  price: number | null
  /** month/year only: a renewal date the user entered (later ones are derived from it). */
  renewsOn: ISODate | null
  /** The renewal date the user answered "Keep it" for, so that reminder stays dismissed. */
  keptFor?: ISODate | null
  notes: string
  createdAt: ISODate
  /** Soft delete: hidden from live views, kept for history. */
  deletedOn?: ISODate | null
  /** Last edit, epoch ms (sync merge: newer wins). Missing = oldest. */
  updatedAt?: number
}

export interface TaskTarget { kind: 'task'; taskId: string }
export interface StepTarget { kind: 'step'; goalId: string; msId: string; stepId: string }
export type Target = TaskTarget | StepTarget
export type Selection = Target | null

/** session: shared by the logs of one focus session split by finishing early (missing = its own session). */
export interface FocusLog { id: string; at: number; date: ISODate; min: number; target: Target | null; session?: string }

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
  /** Timer-seconds of this focus phase already logged by finishing early, and that session's key. */
  loggedSec?: number
  sessionId?: string
}

/** Focus and break minutes, e.g. '25/5' or a custom '40/8' (see core/timer parseSession). */
export type SessionLength = `${number}/${number}`
export type FocusBg = 'video' | 'off'
export interface Settings {
  session: SessionLength
  demo: boolean
  showFuture: boolean
  wallWeeks: number
  focusBg: FocusBg
  youtubeUrl: string
  muted: boolean
  /** Video volume, 0–100 (per device, like muted). */
  volume: number
  focusEndSound: EndSound
  breakEndSound: EndSound
  /** Last change to the shared settings (not muted/volume/demo), epoch ms. */
  updatedAt?: number
}

export interface EmberData {
  goals: Goal[]
  tasks: Task[]
  logs: FocusLog[]
  resources: Resource[]
  selection: Selection
  timer: Timer
  settings: Settings
  /** Last change to this device's timer or selection, epoch ms (for a shared timer later). */
  deviceUpdatedAt?: number
}

export const DEFAULT_SETTINGS: Settings = {
  session: '25/5',
  demo: false,
  showFuture: true,
  wallWeeks: 12,
  focusBg: 'video',
  youtubeUrl: DEFAULT_VIDEO_URL,
  muted: true,
  volume: 80,
  focusEndSound: 'chime',
  breakEndSound: 'bell',
}

export const targetKey = (t: Target): string => (t.kind === 'task' ? `task:${t.taskId}` : `step:${t.stepId}`)

export const sameTarget = (a: Target | null, b: Target | null): boolean =>
  !!a && !!b && targetKey(a) === targetKey(b)
