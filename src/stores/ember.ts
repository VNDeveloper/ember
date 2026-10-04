import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { addDays, todayISO, type ISODate } from '../core/dates'
import { findStep, nextOpenStep, stepTarget } from '../core/goals'
import { uid } from '../core/ids'
import type {
  EmberData, FocusLog, Goal, Milestone, Selection, SessionLength, Settings, Step, StepTarget, Target, Task, Timer,
} from '../core/model'
import { sameTarget } from '../core/model'
import { STORAGE_KEY, parseStored, readData, saveBeforeRestore, saveData } from '../core/persist'
import { buildSeed } from '../core/seed'
import { tallyLogs } from '../core/tally'
import { DEMO_SPEED, idleTimer, isDue, pauseTimer, remainingSec, startTimer } from '../core/timer'

export type When = 'today' | 'tomorrow' | 'date' | 'someday'
export interface NewTask { title: string; when: When; date?: ISODate; deadline: boolean; goalId: string | null }

const demoInUrl = (): boolean =>
  typeof location !== 'undefined' && new URLSearchParams(location.search).get('demo') === '1'

export const useEmberStore = defineStore('ember', () => {
  const read = readData()
  const initial = read.status === 'ok' ? read.data : buildSeed(Date.now())
  /** False when saved data couldn't be read or backed up: run in memory rather than destroy it. */
  const storageWritable = ref(!(read.status === 'unreadable' && !read.backedUp))

  const goals = ref<Goal[]>(initial.goals)
  const tasks = ref<Task[]>(initial.tasks)
  const logs = ref<FocusLog[]>(initial.logs)
  const selection = ref<Selection>(initial.selection)
  const timer = ref<Timer>(initial.timer)
  const settings = ref<Settings>(initial.settings)

  /** Wall clock, advanced by tick(). Everything date- or time-based derives from it. */
  const now = ref(Date.now())
  /** Increments on every finished focus session (toast and pop animations). */
  const completions = ref(0)
  /** Last completed task or step (pop / drop animations); n increments on every completion. */
  const lastDone = ref<{ key: string; n: number } | null>(null)
  let doneSeq = 0
  const signalDone = (key: string) => { lastDone.value = { key, n: ++doneSeq } }
  const demoFromUrl = demoInUrl()

  const today = computed(() => todayISO(now.value))
  const demo = computed(() => demoFromUrl || settings.value.demo)
  const speed = computed(() => (demo.value ? DEMO_SPEED : 1))
  const tally = computed(() => tallyLogs(logs.value, today.value))
  const remaining = computed(() => remainingSec(timer.value, now.value))
  const lastLog = computed<FocusLog | null>(() => logs.value[logs.value.length - 1] ?? null)

  function snapshot(): EmberData {
    return {
      goals: goals.value,
      tasks: tasks.value,
      logs: logs.value,
      selection: selection.value,
      timer: timer.value,
      settings: settings.value,
    }
  }

  function replaceData(d: EmberData) {
    goals.value = d.goals
    tasks.value = d.tasks
    logs.value = d.logs
    selection.value = d.selection
    timer.value = d.timer
    settings.value = d.settings
  }

  const persist = () => { if (storageWritable.value) saveData(snapshot()) }
  if (read.status !== 'ok') persist()
  watch([goals, tasks, logs, selection, timer, settings], persist, { deep: true })

  // Another tab saved: adopt its data so our next save doesn't overwrite it.
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return
      const d = parseStored(e.newValue)
      if (d) replaceData(d)
    })
  }

  /** Load a backup: keep a safety copy of the current data, then replace it with an idle timer. */
  function restore(d: EmberData) {
    saveBeforeRestore(snapshot())
    replaceData({ ...d, timer: idleTimer(d.settings.session) })
    storageWritable.value = true
  }

  // — lookups —
  const taskById = (id: string): Task | null => tasks.value.find((t) => t.id === id) ?? null
  const goalById = (id: string): Goal | null => goals.value.find((g) => g.id === id) ?? null
  const targetExists = (t: Target): boolean => (t.kind === 'task' ? !!taskById(t.taskId) : !!findStep(goals.value, t))

  // — selection —
  function select(t: Selection) {
    selection.value = t
  }

  // — tasks —
  function addTask(input: NewTask): Task | null {
    const title = input.title.trim()
    if (!title) return null
    const t0 = today.value
    let date: ISODate | null = t0
    if (input.when === 'someday') date = null
    else if (input.when === 'tomorrow') date = addDays(t0, 1)
    else if (input.when === 'date' && input.date) date = input.date < t0 ? t0 : input.date
    const task: Task = { id: uid(), title, tag: 'Inbox', goalId: input.goalId, date, deadline: date != null && input.deadline, doneOn: null }
    tasks.value.push(task)
    return task
  }

  function toggleTask(id: string) {
    const t = taskById(id)
    if (!t) return
    const completing = t.doneOn == null
    t.doneOn = completing ? today.value : null
    if (completing) signalDone(`task:${id}`)
    if (completing && sameTarget(selection.value, { kind: 'task', taskId: id })) selection.value = null
  }

  function moveTask(id: string, date: ISODate) {
    const t = taskById(id)
    if (t) t.date = date
  }
  const moveToToday = (id: string) => moveTask(id, today.value)
  const moveToTomorrow = (id: string) => moveTask(id, addDays(today.value, 1))

  // — goals —
  function addGoal(title: string): Goal | null {
    const name = title.trim()
    if (!name) return null
    const goal: Goal = {
      id: uid(), title: name, outcome: '', createdAt: today.value,
      milestones: [{ id: uid(), title: 'Getting started', steps: [] }],
    }
    goals.value.push(goal)
    return goal
  }

  function addMilestone(goalId: string, title: string): Milestone | null {
    const g = goalById(goalId)
    const name = title.trim()
    if (!g || !name) return null
    const m: Milestone = { id: uid(), title: name, steps: [] }
    g.milestones.push(m)
    return m
  }

  function addStep(goalId: string, msId: string, title: string): Step | null {
    const m = goalById(goalId)?.milestones.find((x) => x.id === msId)
    const name = title.trim()
    if (!m || !name) return null
    const s: Step = { id: uid(), title: name, doneOn: null, estMin: 50 }
    m.steps.push(s)
    return s
  }

  function setOutcome(goalId: string, text: string) {
    const g = goalById(goalId)
    if (g) g.outcome = text
  }

  function toggleStep(t: StepTarget) {
    const loc = findStep(goals.value, t)
    if (!loc) return
    const completing = loc.step.doneOn == null
    loc.step.doneOn = completing ? today.value : null
    if (completing) signalDone(`step:${t.stepId}`)
    if (completing && sameTarget(selection.value, t)) {
      const next = nextOpenStep(loc.goal)
      selection.value = next ? stepTarget(loc.goal, next.milestone, next.step) : null
    }
  }

  /** Focus mode's "Mark done": completes the selected step or task if it's still open. */
  function completeSelected() {
    const s = selection.value
    if (!s) return
    if (s.kind === 'task') {
      if (taskById(s.taskId)?.doneOn == null) toggleTask(s.taskId)
    } else if (findStep(goals.value, s)?.step.doneOn == null) {
      toggleStep(s)
    }
  }

  // — timer —
  function finishPhase(at: number) {
    const session = settings.value.session
    if (timer.value.phase === 'break') {
      timer.value = idleTimer(session)
      return
    }
    const sel = selection.value
    logs.value.push({
      id: uid(), at, date: todayISO(at), min: timer.value.lengthSec / 60,
      target: sel && targetExists(sel) ? sel : null,
    })
    timer.value = idleTimer(session, 'break')
    completions.value++
  }

  function tick(at: number = Date.now()) {
    now.value = at
    const t = timer.value
    if (isDue(t, at) && t.endsAt != null) finishPhase(t.endsAt)
  }

  function startPause() {
    const at = Date.now()
    now.value = at
    timer.value = timer.value.running ? pauseTimer(timer.value, at) : startTimer(timer.value, at, speed.value)
  }

  const resetTimer = () => { timer.value = idleTimer(settings.value.session) }
  const skipBreak = () => { timer.value = idleTimer(settings.value.session) }

  function setSession(s: SessionLength) {
    settings.value.session = s
    if (!timer.value.running) timer.value = idleTimer(s, timer.value.phase)
  }

  function updateSettings(patch: Partial<Settings>) {
    settings.value = { ...settings.value, ...patch }
  }

  return {
    goals, tasks, logs, selection, timer, settings, now, completions, lastDone, storageWritable,
    today, demo, speed, tally, remaining, lastLog,
    snapshot, replaceData, restore, select, targetExists,
    addTask, toggleTask, moveTask, moveToToday, moveToTomorrow,
    addGoal, addMilestone, addStep, setOutcome, toggleStep, completeSelected,
    tick, startPause, resetTimer, skipBreak, setSession, updateSettings,
  }
})
