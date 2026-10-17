import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { addDays, todayISO, type ISODate } from '../core/dates'
import { detect, findDuplicate, normaliseUrl, shortLink } from '../core/companies'
import { findStep, goalStatus, isLive, isStepLive, liveSteps, nextOpenStep, stepTarget } from '../core/goals'
import { plural } from '../core/format'
import { uid } from '../core/ids'
import type {
  EmberData, FocusLog, Goal, GoalStatus, Milestone, Phase, Resource, Selection, SessionLength, Settings, Step, StepTarget, Target, Task, Timer,
} from '../core/model'
import { sameTarget } from '../core/model'
import { STORAGE_KEY, parseStored, readData, saveBeforeRestore, saveData } from '../core/persist'
import { nextRenewal } from '../core/resources'
import { buildSeed, emptyData } from '../core/seed'
import { stampChanges, withDeviceState, type SharedData } from '../core/sync'
import { tallyLogs } from '../core/tally'
import { DEMO_SPEED, hasProgress, idleTimer, isDue, pauseTimer, remainingSec, startTimer } from '../core/timer'

export type When = 'today' | 'tomorrow' | 'date' | 'someday'
export interface NewTask { title: string; when: When; date?: ISODate; deadline: boolean; goalId: string | null }

const demoInUrl = (): boolean =>
  typeof location !== 'undefined' && new URLSearchParams(location.search).get('demo') === '1'

export type DeleteKey =
  | { kind: 'task'; id: string }
  | { kind: 'resource'; id: string }
  | { kind: 'step'; goalId: string; msId: string; stepId: string }
  | { kind: 'milestone'; goalId: string; msId: string }
  | { kind: 'goal'; goalId: string }
export interface UndoRecord { label: string; key: DeleteKey; selection: Selection }
export type TaskPatch = Partial<Pick<Task, 'title' | 'date' | 'deadline' | 'goalId' | 'tag'>>
export type AddResult = { ok: true; id: string } | { ok: false; reason: 'invalid' } | { ok: false; reason: 'duplicate'; id: string }
export type ResourcePatch = Partial<Pick<Resource, 'title' | 'url' | 'company' | 'type' | 'status' | 'goalId' | 'billing' | 'price' | 'renewsOn' | 'notes'>>

/** Whether saved data (the localStorage JSON) carries a resources list at all. */
function savedWithResources(raw: string): boolean {
  try {
    const data = (JSON.parse(raw) as { data?: Record<string, unknown> })?.data
    return !!data && Array.isArray(data.resources)
  } catch {
    return false
  }
}

export const useEmberStore = defineStore('ember', () => {
  const read = readData()
  const initial = read.status === 'ok' ? read.data : buildSeed(Date.now())
  /** False when saved data couldn't be read or backed up: run in memory rather than destroy it. */
  const storageWritable = ref(!(read.status === 'unreadable' && !read.backedUp))
  /** True while the data is the generated sample (nothing saved could be read); sync must not merge it into Drive. */
  const seeded = ref(read.status !== 'ok')

  const goals = ref<Goal[]>(initial.goals)
  const tasks = ref<Task[]>(initial.tasks)
  const logs = ref<FocusLog[]>(initial.logs)
  const resources = ref<Resource[]>(initial.resources)
  const selection = ref<Selection>(initial.selection)
  const timer = ref<Timer>(initial.timer)
  const settings = ref<Settings>(initial.settings)
  const deviceUpdatedAt = ref<number | undefined>(initial.deviceUpdatedAt)

  /** Wall clock, advanced by tick(). Everything date- or time-based derives from it. */
  const now = ref(Date.now())
  /** Increments on every finished focus session (toast and pop animations). */
  const completions = ref(0)
  /** The last phase to finish and its end time; n increments on every finish (end sounds). */
  const phaseEnded = ref<{ phase: Phase; at: number; n: number } | null>(null)
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
      resources: resources.value,
      selection: selection.value,
      timer: timer.value,
      settings: settings.value,
      deviceUpdatedAt: deviceUpdatedAt.value,
    }
  }

  const clone = (d: EmberData): EmberData => JSON.parse(JSON.stringify(d)) as EmberData
  /** What was last saved; the next save stamps everything that differs from it (sync merge). */
  let baseline = clone(snapshot())

  /** Data from outside (another tab, restore, sync, tests): adopted as-is, never stamped as a local edit. */
  function replaceData(d: EmberData) {
    baseline = clone(d)
    seeded.value = false
    goals.value = d.goals
    tasks.value = d.tasks
    logs.value = d.logs
    resources.value = d.resources
    selection.value = d.selection
    timer.value = d.timer
    settings.value = d.settings
    deviceUpdatedAt.value = d.deviceUpdatedAt
  }

  const persist = () => {
    const current = snapshot()
    stampChanges(baseline, current, Date.now())
    deviceUpdatedAt.value = current.deviceUpdatedAt
    baseline = clone(current)
    if (storageWritable.value) saveData(current)
  }
  if (read.status !== 'ok') persist()
  watch([goals, tasks, logs, resources, selection, timer, settings], persist, { deep: true })

  // Another tab saved: adopt its data so our next save doesn't overwrite it.
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return
      const d = parseStored(e.newValue)
      if (!d) return
      // A tab still running an app version from before resources saves without them: keep ours, don't adopt an empty list.
      if (!savedWithResources(e.newValue)) d.resources = resources.value
      replaceData(d)
    })
  }

  /** Load a backup: keep a safety copy of the current data, then replace it with an idle timer. */
  function restore(d: EmberData) {
    saveBeforeRestore(snapshot())
    replaceData({ ...d, timer: idleTimer(d.settings.session) })
    storageWritable.value = true
  }

  /** Delete data: keep a safety copy, then start empty with the same settings. */
  function eraseAll() {
    saveBeforeRestore(snapshot())
    replaceData(emptyData(settings.value))
    storageWritable.value = true
  }

  /** Shared data from sync: this device keeps its timer, selection, sound, volume and demo speed. */
  function applyShared(shared: SharedData, opts: { safetyCopy?: boolean } = {}) {
    if (opts.safetyCopy) saveBeforeRestore(snapshot())
    replaceData(withDeviceState(shared, snapshot()))
    if (selection.value && !targetExists(selection.value)) selection.value = null
  }

  // — lookups —
  const taskById = (id: string): Task | null => tasks.value.find((t) => t.id === id) ?? null
  const goalById = (id: string): Goal | null => goals.value.find((g) => g.id === id) ?? null
  /** The target exists and isn't deleted (a deleted target makes a finished session Unassigned). */
  const targetExists = (t: Target): boolean => {
    if (t.kind === 'task') {
      const task = taskById(t.taskId)
      return !!task && isLive(task)
    }
    return isStepLive(goals.value, t)
  }

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
    reopenIfAchieved(g)
    return m
  }

  function addStep(goalId: string, msId: string, title: string): Step | null {
    const g = goalById(goalId)
    const m = g?.milestones.find((x) => x.id === msId)
    const name = title.trim()
    if (!g || !m || !name) return null
    const s: Step = { id: uid(), title: name, doneOn: null, estMin: 50 }
    m.steps.push(s)
    reopenIfAchieved(g)
    return s
  }

  /** Active is stored as no status; achievedOn is kept only while achieved (first date wins). */
  function setGoalStatus(goalId: string, status: GoalStatus) {
    const g = goalById(goalId)
    if (!g || !isLive(g) || goalStatus(g) === status) return
    if (status === 'achieved') {
      g.status = 'achieved'
      g.achievedOn = today.value
      return
    }
    delete g.achievedOn
    if (status === 'paused') g.status = 'paused'
    else delete g.status
  }
  /** Adding work to an achieved goal reopens it: there is more to do. */
  function reopenIfAchieved(g: Goal) {
    if (goalStatus(g) === 'achieved') setGoalStatus(g.id, 'active')
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

  // — edit —
  function updateTask(id: string, patch: TaskPatch) {
    const t = taskById(id)
    if (!t) return
    if (patch.title !== undefined && patch.title.trim()) t.title = patch.title.trim()
    if (patch.tag !== undefined) t.tag = patch.tag.trim()
    if (patch.goalId !== undefined) t.goalId = patch.goalId
    if (patch.date !== undefined) t.date = patch.date
    if (patch.deadline !== undefined) t.deadline = patch.deadline
    if (t.date == null) t.deadline = false
  }

  function updateStep(target: StepTarget, patch: { title?: string; estMin?: number }) {
    const loc = findStep(goals.value, target)
    if (!loc) return
    if (patch.title !== undefined && patch.title.trim()) loc.step.title = patch.title.trim()
    if (patch.estMin !== undefined && Number.isFinite(patch.estMin)) {
      loc.step.estMin = Math.min(600, Math.max(25, Math.round(patch.estMin / 25) * 25))
    }
  }

  function renameMilestone(goalId: string, msId: string, title: string) {
    const m = goalById(goalId)?.milestones.find((x) => x.id === msId)
    if (m && title.trim()) m.title = title.trim()
  }

  function renameGoal(goalId: string, title: string) {
    const g = goalById(goalId)
    if (g && title.trim()) g.title = title.trim()
  }

  // — resources —
  const resourceById = (id: string): Resource | null => resources.value.find((r) => r.id === id) ?? null

  function addResource(text: string, opts: { goalId?: string | null } = {}): AddResult {
    const url = normaliseUrl(text)
    if (!url) return { ok: false, reason: 'invalid' }
    const dup = findDuplicate(url, resources.value)
    if (dup) return { ok: false, reason: 'duplicate', id: dup.id }
    const d = detect(url, resources.value)
    const goal = opts.goalId ? goalById(opts.goalId) : null
    const r: Resource = {
      id: uid(), title: d.title || shortLink(url), url, company: d.company, type: d.type, status: 'using',
      goalId: goal && isLive(goal) ? goal.id : null, billing: 'free', price: null, renewsOn: null, notes: '', createdAt: today.value,
    }
    resources.value.push(r)
    return { ok: true, id: r.id }
  }

  function updateResource(id: string, patch: ResourcePatch) {
    const r = resourceById(id)
    if (!r) return
    if (patch.url !== undefined) {
      const url = normaliseUrl(patch.url)
      if (url) r.url = url
    }
    if (patch.title !== undefined) r.title = patch.title.trim() || shortLink(r.url)
    if (patch.company !== undefined && patch.company.trim()) r.company = patch.company.trim()
    if (patch.type !== undefined) r.type = patch.type
    if (patch.status !== undefined) r.status = patch.status
    if (patch.goalId !== undefined) r.goalId = patch.goalId
    if (patch.notes !== undefined) r.notes = patch.notes
    if (patch.billing !== undefined) r.billing = patch.billing
    if (patch.price !== undefined) r.price = patch.price
    const renewsBefore = r.renewsOn
    if (patch.renewsOn !== undefined) r.renewsOn = patch.renewsOn
    // A paid cost needs a positive price; renewal dates belong to monthly and yearly costs only.
    if (r.billing === 'free' || typeof r.price !== 'number' || !Number.isFinite(r.price) || r.price <= 0) {
      r.billing = 'free'
      r.price = null
      r.renewsOn = null
    } else if (r.billing === 'once') {
      r.renewsOn = null
    }
    if (r.renewsOn !== renewsBefore) delete r.keptFor
  }

  /** Today's "Keep it": dismiss the reminder for the current renewal date only. */
  function keepRenewal(id: string) {
    const r = resourceById(id)
    const next = r && isLive(r) ? nextRenewal(r, today.value) : null
    if (r && next) r.keptFor = next
  }

  function markCancelled(id: string) {
    const r = resourceById(id)
    if (r && isLive(r)) r.status = 'dropped'
  }

  // — delete (soft) and undo —
  function itemFor(key: DeleteKey): { deletedOn?: ISODate | null } | null {
    if (key.kind === 'task') return taskById(key.id)
    if (key.kind === 'resource') return resourceById(key.id)
    const g = goalById(key.goalId)
    if (!g || key.kind === 'goal') return g
    const m = g.milestones.find((x) => x.id === key.msId) ?? null
    if (!m || key.kind === 'milestone') return m
    return m.steps.find((x) => x.id === key.stepId) ?? null
  }

  function softDelete(key: DeleteKey, label: string): UndoRecord | null {
    const item = itemFor(key)
    if (!item || !isLive(item)) return null
    const before = selection.value
    item.deletedOn = today.value
    if (selection.value && !targetExists(selection.value)) selection.value = null
    return { label, key, selection: before }
  }

  const deleteTask = (id: string) =>
    softDelete({ kind: 'task', id }, `Deleted “${taskById(id)?.title ?? ''}”`)

  const deleteStep = (t: StepTarget) =>
    softDelete({ kind: 'step', goalId: t.goalId, msId: t.msId, stepId: t.stepId }, `Deleted “${findStep(goals.value, t)?.step.title ?? ''}”`)

  function deleteMilestone(goalId: string, msId: string) {
    const m = goalById(goalId)?.milestones.find((x) => x.id === msId)
    const n = m ? liveSteps(m).length : 0
    const label = `Deleted milestone “${m?.title ?? ''}”${n ? ` and ${plural(n, 'step')}` : ''}`
    return softDelete({ kind: 'milestone', goalId, msId }, label)
  }

  const deleteResource = (id: string) => softDelete({ kind: 'resource', id }, `Deleted “${resourceById(id)?.title ?? ''}”`)

  const deleteGoal = (goalId: string) =>
    softDelete({ kind: 'goal', goalId }, `Deleted goal “${goalById(goalId)?.title ?? ''}”`)

  /** Clears the flag set by that delete; restores the selection if nothing has been selected since. */
  function undoDelete(record: UndoRecord) {
    const item = itemFor(record.key)
    if (item) item.deletedOn = null
    if (!selection.value && record.selection && targetExists(record.selection)) selection.value = record.selection
  }

  // — timer —
  function finishPhase(at: number) {
    const session = settings.value.session
    phaseEnded.value = { phase: timer.value.phase, at, n: (phaseEnded.value?.n ?? 0) + 1 }
    if (timer.value.phase === 'break') {
      timer.value = idleTimer(session)
      return
    }
    const sel = selection.value
    logs.value.push({
      // The run's end time names the session, so devices that both log it produce one record.
      id: `focus-${at}`, at, date: todayISO(at), min: timer.value.lengthSec / 60,
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

  /** Back to the start of the current phase: focus takes the session length; a break keeps its own length. */
  function resetTimer() {
    const t = timer.value
    timer.value = t.phase === 'break' ? { ...t, running: false, endsAt: null, leftSec: t.lengthSec } : idleTimer(settings.value.session)
  }
  const skipBreak = () => { timer.value = idleTimer(settings.value.session) }

  function setSession(s: SessionLength) {
    settings.value.session = s
    // Only a fresh timer takes the new length; a running or paused-partway phase keeps its own.
    if (!timer.value.running && !hasProgress(timer.value)) timer.value = idleTimer(s, timer.value.phase)
  }

  function updateSettings(patch: Partial<Settings>) {
    settings.value = { ...settings.value, ...patch }
  }

  return {
    goals, tasks, logs, resources, selection, timer, settings, now, completions, phaseEnded, lastDone, storageWritable,
    today, demo, demoFromUrl, speed, tally, remaining, lastLog,
    snapshot, replaceData, restore, applyShared, eraseAll, seeded, select, targetExists,
    addTask, toggleTask, moveTask, moveToToday, moveToTomorrow,
    addGoal, addMilestone, addStep, setGoalStatus, setOutcome, toggleStep, completeSelected,
    updateTask, updateStep, renameMilestone, renameGoal,
    deleteTask, deleteStep, deleteMilestone, deleteGoal, undoDelete,
    resourceById, addResource, updateResource, deleteResource, keepRenewal, markCancelled,
    tick, startPause, resetTimer, skipBreak, setSession, updateSettings,
  }
})
