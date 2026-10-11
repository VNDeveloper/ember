import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { StepTarget } from '../core/model'
import { STORAGE_KEY, loadData, saveData } from '../core/persist'
import { sharedPart } from '../core/sync'
import { dataFixture, goalFixture, taskFixture } from '../core/test-fixtures'
import { useEmberStore, type NewTask } from './ember'

const NOW = new Date(2026, 8, 23, 10, 0, 0).getTime()
const MIN = 60_000

const step = (ms: string, title: string): StepTarget =>
  ({ kind: 'step', goalId: 'D3', msId: `D3/${ms}`, stepId: `D3/${ms}/${title}` })
const LINE = step('First charts', 'Line')
const SCATTER = step('First charts', 'Scatter')
const EASING = step('Motion', 'Easing')

function fixture() {
  return dataFixture({
    goals: [goalFixture('D3', [
      ['First charts', [['Bar', '2026-09-01'], ['Line', null], ['Scatter', null]]],
      ['Motion', [['Easing', null]]],
    ])],
    tasks: [
      taskFixture('Review PR'),
      taskFixture('Dentist', { date: '2026-09-21' }),
      taskFixture('Sourdough', { date: null }),
    ],
  })
}

function freshStore() {
  setActivePinia(createPinia())
  return useEmberStore()
}

function storeWith(patch: Partial<ReturnType<typeof fixture>> = {}) {
  const store = freshStore()
  store.replaceData({ ...fixture(), ...patch })
  return store
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  localStorage.clear()
  window.history.replaceState({}, '', '/')
})
afterEach(() => vi.useRealTimers())

describe('loading', () => {
  it('seeds on first run and saves the seed straight away', () => {
    const store = freshStore()
    expect(store.goals.map((g) => g.title)).toEqual(['Learn D3.js', 'Speak Spanish at B1', 'Learn watercolour'])
    expect(store.today).toBe('2026-09-23')
    expect(loadData()?.goals).toHaveLength(3)
  })

  it('loads saved data instead of seeding', () => {
    saveData(fixture())
    expect(freshStore().goals.map((g) => g.title)).toEqual(['D3'])
  })

  it('saves changes', async () => {
    const store = storeWith()
    store.addTask({ title: 'Call the landlord', when: 'today', deadline: false, goalId: null })
    await nextTick()
    expect(loadData()?.tasks.map((t) => t.title)).toContain('Call the landlord')
  })
})

describe('timer', () => {
  it('logs a finished session against the selected step and switches to a paused break', () => {
    const store = storeWith({ selection: LINE })
    store.startPause()
    vi.setSystemTime(NOW + 25 * MIN)
    store.tick()
    expect(store.logs).toHaveLength(1)
    expect(store.logs[0]).toMatchObject({ at: NOW + 25 * MIN, date: '2026-09-23', min: 25, target: LINE })
    expect(store.timer).toMatchObject({ phase: 'break', running: false, leftSec: 300 })
    expect(store.tally.spent.get(`step:${LINE.stepId}`)).toBe(25)
    expect(store.tally.sessionsToday).toBe(1)
    expect(store.tally.minutesToday).toBe(25)
    expect(store.completions).toBe(1)
    expect(store.lastLog?.target).toEqual(LINE)
  })

  it('logs to Unassigned when nothing is selected', () => {
    const store = storeWith()
    store.startPause()
    store.tick(NOW + 25 * MIN)
    expect(store.logs[0].target).toBeNull()
  })

  it('logs to Unassigned when the selected item no longer exists', () => {
    const store = storeWith({ selection: { kind: 'task', taskId: 'gone' } })
    store.startPause()
    store.tick(NOW + 25 * MIN)
    expect(store.logs[0].target).toBeNull()
  })

  it('names a finished session after its end time, so two devices log the same run once', () => {
    const store = storeWith()
    store.startPause()
    const endsAt = store.timer.endsAt!
    store.tick(NOW + 25 * MIN)
    expect(store.logs).toHaveLength(1)
    expect(store.logs[0].id).toBe(`focus-${endsAt}`)
  })

  it('logs 50 minutes with the 50/10 setting', () => {
    const store = storeWith()
    store.setSession('50/10')
    expect(store.timer.leftSec).toBe(3000)
    store.startPause()
    store.tick(NOW + 50 * MIN)
    expect(store.logs[0].min).toBe(50)
    expect(store.timer.leftSec).toBe(600)
  })

  it('times a custom session length', () => {
    const store = storeWith()
    store.setSession('40/8')
    store.startPause()
    store.tick(NOW + 40 * MIN)
    expect(store.logs[0].min).toBe(40)
    expect(store.timer.leftSec).toBe(480)
  })

  it('signals which phase ended and when, for the end sound', () => {
    const store = storeWith()
    expect(store.phaseEnded).toBeNull()
    store.startPause()
    store.tick(NOW + 25 * MIN)
    expect(store.phaseEnded).toEqual({ phase: 'focus', at: NOW + 25 * MIN, n: 1 })
    vi.setSystemTime(NOW + 25 * MIN)
    store.startPause()
    store.tick(NOW + 30 * MIN)
    expect(store.phaseEnded).toEqual({ phase: 'break', at: NOW + 30 * MIN, n: 2 })
  })

  it('counts from the wall clock, so missed ticks lose nothing', () => {
    const store = storeWith()
    store.startPause()
    vi.setSystemTime(NOW + 10 * MIN)
    store.tick()
    expect(store.remaining).toBe(900)
  })

  it('pauses and resumes', () => {
    const store = storeWith()
    store.startPause()
    vi.setSystemTime(NOW + 5 * MIN)
    store.startPause()
    expect(store.timer).toMatchObject({ running: false, leftSec: 1200 })
    store.tick(NOW + 60 * MIN)
    expect(store.logs).toHaveLength(0)
    expect(store.remaining).toBe(1200)
  })

  it('returns to a paused full focus session when a break ends', () => {
    const store = storeWith({ timer: { phase: 'break', running: false, endsAt: null, leftSec: 300, speed: 1, lengthSec: 300 } })
    store.startPause()
    store.tick(NOW + 5 * MIN)
    expect(store.timer).toEqual({ phase: 'focus', running: false, endsAt: null, leftSec: 1500, speed: 1, lengthSec: 1500 })
    expect(store.logs).toHaveLength(0)
  })

  it('resets focus and skips breaks', () => {
    const store = storeWith()
    store.startPause()
    store.resetTimer()
    expect(store.timer).toMatchObject({ phase: 'focus', running: false, leftSec: 1500 })
    store.replaceData({ ...fixture(), timer: { phase: 'break', running: true, endsAt: NOW + MIN, leftSec: 300, speed: 1, lengthSec: 300 } })
    store.skipBreak()
    expect(store.timer).toMatchObject({ phase: 'focus', running: false, leftSec: 1500 })
  })

  it('runs 25 minutes in 25 seconds with ?demo=1', () => {
    window.history.replaceState({}, '', '/?demo=1')
    const store = storeWith()
    expect(store.demo).toBe(true)
    store.startPause()
    store.tick(NOW + 25_000)
    expect(store.logs).toHaveLength(1)
    expect(store.logs[0].min).toBe(25)
  })

  it('completes once after a reload, dated by when it ended', async () => {
    vi.setSystemTime(new Date(2026, 8, 23, 23, 50).getTime())
    const store = storeWith({ selection: LINE })
    store.startPause()
    await nextTick()

    vi.setSystemTime(new Date(2026, 8, 24, 8, 0).getTime())
    const reloaded = freshStore()
    reloaded.tick()
    reloaded.tick()
    expect(reloaded.logs).toHaveLength(1)
    expect(reloaded.logs[0]).toMatchObject({ at: new Date(2026, 8, 24, 0, 15).getTime(), date: '2026-09-24', target: LINE })
    expect(reloaded.timer).toMatchObject({ phase: 'break', running: false })
  })

  it('keeps the speed a run started with across reloads', async () => {
    window.history.replaceState({}, '', '/?demo=1')
    const store = storeWith()
    store.startPause()
    await nextTick()

    window.history.replaceState({}, '', '/')
    const reloaded = freshStore()
    expect(reloaded.demo).toBe(false)
    reloaded.tick(NOW + 10_000)
    expect(reloaded.remaining).toBe(900)
  })

  it('resets an idle timer when the session length changes, but not a running one', () => {
    const store = storeWith()
    store.setSession('50/10')
    expect(store.timer.leftSec).toBe(3000)
    store.startPause()
    store.setSession('25/5')
    expect(store.timer.running).toBe(true)
    expect(store.remaining).toBe(3000)
  })

  it('keeps a paused, partly-run session when the length changes, and logs it at its own length', () => {
    const store = storeWith()
    store.startPause()
    vi.setSystemTime(NOW + 20 * MIN)
    store.startPause()
    expect(store.timer.leftSec).toBe(300)
    store.setSession('50/10')
    expect(store.timer).toMatchObject({ running: false, leftSec: 300, lengthSec: 1500 })
    store.startPause()
    store.tick(NOW + 25 * MIN)
    expect(store.logs[0].min).toBe(25)
    expect(store.timer).toMatchObject({ phase: 'break', leftSec: 600 })
  })

  it('logs the length a run actually ran when the session changes mid-run', () => {
    const store = storeWith()
    store.setSession('50/10')
    store.startPause()
    store.setSession('25/5')
    store.tick(NOW + 50 * MIN)
    expect(store.logs).toHaveLength(1)
    expect(store.logs[0].min).toBe(50)
  })

  it('rolls today over at midnight', () => {
    const store = storeWith()
    store.startPause()
    store.tick(NOW + 25 * MIN)
    expect(store.tally.sessionsToday).toBe(1)
    store.tick(new Date(2026, 8, 24, 0, 1).getTime())
    expect(store.today).toBe('2026-09-24')
    expect(store.tally.sessionsToday).toBe(0)
  })
})

describe('selection hand-off', () => {
  it('moves to the next open step when the selected step is completed', () => {
    const store = storeWith({ selection: LINE })
    store.toggleStep(LINE)
    expect(store.selection).toEqual(SCATTER)
    store.toggleStep(SCATTER)
    expect(store.selection).toEqual(EASING)
    store.toggleStep(EASING)
    expect(store.selection).toBeNull()
  })

  it('stamps and clears doneOn when toggling a step', () => {
    const store = storeWith()
    store.toggleStep(LINE)
    expect(store.goals[0].milestones[0].steps[1].doneOn).toBe('2026-09-23')
    store.toggleStep(LINE)
    expect(store.goals[0].milestones[0].steps[1].doneOn).toBeNull()
  })

  it('leaves the selection alone when another step is completed', () => {
    const store = storeWith({ selection: SCATTER })
    store.toggleStep(LINE)
    expect(store.selection).toEqual(SCATTER)
  })

  it('clears the selection when the selected task is completed', () => {
    const store = storeWith({ selection: { kind: 'task', taskId: 'Review PR' } })
    store.toggleTask('Review PR')
    expect(store.selection).toBeNull()
    expect(store.tasks[0].doneOn).toBe('2026-09-23')
  })

  it('signals each completion for animations, but not un-completions', () => {
    const store = storeWith()
    expect(store.lastDone).toBeNull()
    store.toggleTask('Review PR')
    expect(store.lastDone).toEqual({ key: 'task:Review PR', n: 1 })
    store.toggleTask('Review PR')
    expect(store.lastDone).toEqual({ key: 'task:Review PR', n: 1 })
    store.toggleStep(LINE)
    expect(store.lastDone).toEqual({ key: `step:${LINE.stepId}`, n: 2 })
  })

  it('completes whatever is selected (Focus mode "Mark done")', () => {
    const store = storeWith({ selection: LINE })
    store.completeSelected()
    expect(store.goals[0].milestones[0].steps[1].doneOn).toBe('2026-09-23')
    expect(store.selection).toEqual(SCATTER)
  })
})

describe('tasks', () => {
  const add = (store: ReturnType<typeof useEmberStore>, patch: Partial<NewTask>) =>
    store.addTask({ title: 'New', when: 'today', deadline: false, goalId: null, ...patch })

  it('adds trimmed Inbox tasks dated by the chosen option', () => {
    const store = storeWith()
    expect(add(store, { title: '  Call the landlord  ' })).toMatchObject({ title: 'Call the landlord', tag: 'Inbox', date: '2026-09-23', doneOn: null })
    expect(add(store, { when: 'tomorrow' })?.date).toBe('2026-09-24')
    expect(add(store, { when: 'date', date: '2026-10-02' })?.date).toBe('2026-10-02')
    expect(add(store, { when: 'someday' })?.date).toBeNull()
    expect(add(store, { goalId: 'D3' })?.goalId).toBe('D3')
  })

  it('clamps a picked date in the past to today', () => {
    expect(add(storeWith(), { when: 'date', date: '2026-09-01' })?.date).toBe('2026-09-23')
  })

  it('drops the deadline on Someday tasks', () => {
    const store = storeWith()
    expect(add(store, { when: 'someday', deadline: true })?.deadline).toBe(false)
    expect(add(store, { when: 'today', deadline: true })?.deadline).toBe(true)
  })

  it('ignores empty titles', () => {
    const store = storeWith()
    expect(add(store, { title: '   ' })).toBeNull()
    expect(store.tasks).toHaveLength(3)
  })

  it('moves tasks to tomorrow and to today (including from Someday)', () => {
    const store = storeWith()
    store.moveToTomorrow('Dentist')
    expect(store.tasks.find((t) => t.id === 'Dentist')?.date).toBe('2026-09-24')
    store.moveToToday('Sourdough')
    expect(store.tasks.find((t) => t.id === 'Sourdough')?.date).toBe('2026-09-23')
  })

  it('un-completes a task', () => {
    const store = storeWith()
    store.toggleTask('Review PR')
    store.toggleTask('Review PR')
    expect(store.tasks[0].doneOn).toBeNull()
  })
})

describe('goals', () => {
  it('adds a goal with a "Getting started" milestone', () => {
    const store = storeWith()
    const g = store.addGoal('  Learn Three.js ')
    expect(g).toMatchObject({ title: 'Learn Three.js', outcome: '', createdAt: '2026-09-23' })
    expect(g?.milestones.map((m) => m.title)).toEqual(['Getting started'])
    expect(store.addGoal('')).toBeNull()
  })

  it('adds milestones and 50-minute steps', () => {
    const store = storeWith()
    const ms = store.addMilestone('D3', 'Capstone')
    expect(store.goals[0].milestones.at(-1)?.title).toBe('Capstone')
    const s = store.addStep('D3', ms!.id, 'Build it')
    expect(s).toMatchObject({ title: 'Build it', estMin: 50, doneOn: null })
    expect(store.addStep('D3', ms!.id, ' ')).toBeNull()
    expect(store.addMilestone('nope', 'X')).toBeNull()
  })

  it('edits the outcome', () => {
    const store = storeWith()
    store.setOutcome('D3', 'Ship a chart')
    expect(store.goals[0].outcome).toBe('Ship a chart')
  })
})

describe('unreadable saved data', () => {
  it('never overwrites data it could not back up', async () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    const real = Storage.prototype.setItem
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key.includes(':corrupt:')) throw new Error('QuotaExceededError')
      return real.call(this, key, value)
    })
    const store = freshStore()
    expect(store.storageWritable).toBe(false)
    store.addTask({ title: 'New', when: 'today', deadline: false, goalId: null })
    await nextTick()
    spy.mockRestore()
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{not json')
  })
})

describe('other tabs', () => {
  it('adopts data another tab saved instead of overwriting it later', async () => {
    const store = storeWith()
    await nextTick()
    const other = { ...fixture(), tasks: [...fixture().tasks, taskFixture('Added in tab B')] }
    saveData(other)
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: localStorage.getItem(STORAGE_KEY) }))
    expect(store.tasks.map((t) => t.title)).toContain('Added in tab B')
    store.toggleTask('Review PR')
    await nextTick()
    expect(loadData()?.tasks.map((t) => t.title)).toContain('Added in tab B')
  })

  it('ignores unreadable or unrelated storage events', () => {
    const store = storeWith()
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: '{bad' }))
    window.dispatchEvent(new StorageEvent('storage', { key: 'other', newValue: '{}' }))
    expect(store.tasks).toHaveLength(3)
  })
})

describe('restore', () => {
  it('replaces everything, keeps a safety copy, and resets the timer', async () => {
    const store = storeWith({ timer: { phase: 'focus', running: true, endsAt: NOW + 60_000, leftSec: 1500, speed: 1, lengthSec: 1500 } })
    await nextTick()
    const backup = dataFixture({
      goals: [goalFixture('Spanish', [])],
      timer: { phase: 'focus', running: true, endsAt: NOW - 3_600_000, leftSec: 1500, speed: 1, lengthSec: 1500 },
    })
    store.restore(backup)
    expect(store.goals.map((g) => g.title)).toEqual(['Spanish'])
    expect(store.timer).toMatchObject({ phase: 'focus', running: false, endsAt: null, leftSec: 1500 })
    store.tick(NOW)
    expect(store.logs).toHaveLength(0)
    const safety = JSON.parse(localStorage.getItem(`${STORAGE_KEY}:before-restore`)!)
    expect(safety.data.goals.map((g: { title: string }) => g.title)).toEqual(['D3'])
    await nextTick()
    expect(loadData()?.goals.map((g) => g.title)).toEqual(['Spanish'])
  })
})

describe('erase', () => {
  it('empties tasks, goals and history, keeps settings and a safety copy, and stays empty after a reload', async () => {
    const store = storeWith({ selection: LINE, logs: [{ id: 'l', at: NOW, date: '2026-09-23', min: 25, target: LINE }] })
    store.updateSettings({ wallWeeks: 20, muted: false })
    store.startPause()
    await nextTick()
    store.eraseAll()
    expect([store.goals, store.tasks, store.logs]).toEqual([[], [], []])
    expect(store.selection).toBeNull()
    expect(store.timer).toMatchObject({ running: false, leftSec: 1500 })
    expect(store.settings).toMatchObject({ wallWeeks: 20, muted: false })
    expect(localStorage.getItem(`${STORAGE_KEY}:before-restore`)).toContain('Review PR')
    await nextTick()
    const reloaded = freshStore()
    expect([reloaded.goals, reloaded.tasks, reloaded.logs]).toEqual([[], [], []])
    expect(reloaded.seeded).toBe(false)
  })
})

describe('edit', () => {
  it('updates a task, trimming text, clearing the deadline for Someday, never un-ticking', () => {
    const store = storeWith()
    store.toggleTask('Review PR')
    store.updateTask('Review PR', { title: '  PR #482 ', tag: ' Work ', date: '2026-09-25', deadline: true, goalId: 'D3' })
    expect(store.tasks[0]).toMatchObject({ title: 'PR #482', tag: 'Work', date: '2026-09-25', deadline: true, goalId: 'D3', doneOn: '2026-09-23' })
    store.updateTask('Review PR', { title: '   ', date: null })
    expect(store.tasks[0]).toMatchObject({ title: 'PR #482', date: null, deadline: false })
  })

  it('updates a step, clamping the estimate to 25-minute units between 25m and 10h', () => {
    const store = storeWith()
    store.updateStep(LINE, { title: 'Line chart', estMin: 80 })
    expect(store.goals[0].milestones[0].steps[1]).toMatchObject({ title: 'Line chart', estMin: 75 })
    store.updateStep(LINE, { estMin: 5 })
    expect(store.goals[0].milestones[0].steps[1].estMin).toBe(25)
    store.updateStep(LINE, { estMin: 9999 })
    expect(store.goals[0].milestones[0].steps[1].estMin).toBe(600)
  })

  it('renames milestones and goals, ignoring empty names', () => {
    const store = storeWith()
    store.renameMilestone('D3', 'D3/Motion', ' Animation ')
    store.renameGoal('D3', 'D3 charts')
    store.renameGoal('D3', ' ')
    expect(store.goals[0].milestones[1].title).toBe('Animation')
    expect(store.goals[0].title).toBe('D3 charts')
  })
})

describe('delete and undo', () => {
  it('soft-deletes a task and undoes it', () => {
    const store = storeWith({ selection: { kind: 'task', taskId: 'Review PR' } })
    const rec = store.deleteTask('Review PR')!
    expect(rec.label).toBe('Deleted “Review PR”')
    expect(store.tasks[0].deletedOn).toBe('2026-09-23')
    expect(store.selection).toBeNull()
    store.undoDelete(rec)
    expect(store.tasks[0].deletedOn).toBeNull()
    expect(store.selection).toEqual({ kind: 'task', taskId: 'Review PR' })
  })

  it('logs a running session as Unassigned when its step is deleted', () => {
    const store = storeWith({ selection: LINE })
    store.startPause()
    store.deleteStep(LINE)
    expect(store.selection).toBeNull()
    store.tick(NOW + 25 * MIN)
    expect(store.logs[0].target).toBeNull()
  })

  it('labels milestone and goal deletes, and undo brings the whole branch back', () => {
    const store = storeWith({ selection: SCATTER })
    const ms = store.deleteMilestone('D3', 'D3/First charts')!
    expect(ms.label).toBe('Deleted milestone “First charts” and 3 steps')
    expect(store.selection).toBeNull()
    store.undoDelete(ms)
    expect(store.goals[0].milestones[0].deletedOn).toBeNull()
    expect(store.selection).toEqual(SCATTER)
    const goal = store.deleteGoal('D3')!
    expect(goal.label).toBe('Deleted goal “D3”')
    expect(store.goals[0].deletedOn).toBe('2026-09-23')
    store.undoDelete(goal)
    expect(store.goals[0].deletedOn).toBeNull()
  })

  it('returns null for unknown or already deleted items', () => {
    const store = storeWith()
    expect(store.deleteTask('nope')).toBeNull()
    store.deleteTask('Review PR')
    expect(store.deleteTask('Review PR')).toBeNull()
  })
})

describe('storage key', () => {
  it('uses ember:v1', () => {
    freshStore()
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
  })
})

describe('sync support', () => {
  it('stamps what changed when the store saves', async () => {
    const store = storeWith()
    await nextTick()
    vi.setSystemTime(NOW + MIN)
    store.updateTask('Review PR', { title: 'Review PR #2' })
    await nextTick()
    expect(store.tasks.find((t) => t.id === 'Review PR')!.updatedAt).toBe(NOW + MIN)
    expect(store.tasks.find((t) => t.id === 'Dentist')!.updatedAt).toBeUndefined()
    expect(loadData()!.tasks.find((t) => t.id === 'Review PR')!.updatedAt).toBe(NOW + MIN)
  })

  it('never stamps data that arrives from elsewhere', async () => {
    const store = storeWith()
    await nextTick()
    const other = fixture()
    other.tasks[0].title = 'Changed in another tab'
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: JSON.stringify({ version: 1, data: other }) }))
    await nextTick()
    expect(store.tasks[0].title).toBe('Changed in another tab')
    expect(store.tasks[0].updatedAt).toBeUndefined()
  })

  it("applies shared data from sync, keeping this device's timer, selection and sound", async () => {
    const store = storeWith({ selection: { kind: 'task', taskId: 'Review PR' } })
    store.startPause()
    store.updateSettings({ muted: false })
    await nextTick()
    const remote = sharedPart({ ...fixture(), tasks: [...fixture().tasks, taskFixture('From phone')] })
    remote.settings = { ...remote.settings, wallWeeks: 20 }
    store.applyShared(remote)
    await nextTick()
    expect(store.tasks.map((t) => t.id)).toContain('From phone')
    expect(store.timer.running).toBe(true)
    expect(store.selection).toEqual({ kind: 'task', taskId: 'Review PR' })
    expect(store.settings).toMatchObject({ wallWeeks: 20, muted: false })
    expect(store.tasks.find((t) => t.id === 'From phone')!.updatedAt).toBeUndefined()
  })

  it('keeps a safety copy when asked, and clears a selection deleted on the other device', async () => {
    const store = storeWith({ selection: { kind: 'task', taskId: 'Review PR' } })
    store.startPause()
    await nextTick()
    const remote = sharedPart(fixture())
    remote.tasks = remote.tasks.map((t) => (t.id === 'Review PR' ? { ...t, deletedOn: '2026-09-23' } : t))
    store.applyShared(remote, { safetyCopy: true })
    expect(store.selection).toBeNull()
    expect(store.timer.running).toBe(true)
    expect(localStorage.getItem(`${STORAGE_KEY}:before-restore`)).toContain('Review PR')
  })
})

describe('goal status', () => {
  it('pauses, resumes, achieves and reopens, dating only the achievement', () => {
    const store = storeWith()
    store.setGoalStatus('D3', 'paused')
    expect(store.goals[0]).toMatchObject({ status: 'paused' })
    store.setGoalStatus('D3', 'achieved')
    expect(store.goals[0]).toMatchObject({ status: 'achieved', achievedOn: '2026-09-23' })
    store.setGoalStatus('D3', 'active')
    expect(store.goals[0]).not.toHaveProperty('status')
    expect(store.goals[0]).not.toHaveProperty('achievedOn')
  })

  it('keeps the first achieved date when marked again', () => {
    const store = storeWith()
    store.setGoalStatus('D3', 'achieved')
    vi.setSystemTime(NOW + 3 * 864e5)
    store.tick()
    store.setGoalStatus('D3', 'achieved')
    expect(store.goals[0].achievedOn).toBe('2026-09-23')
  })

  it('reopens an achieved goal when a step or milestone is added, not when a step is unticked', () => {
    const store = storeWith()
    store.setGoalStatus('D3', 'achieved')
    store.toggleStep(LINE)
    store.toggleStep(LINE)
    expect(store.goals[0].status).toBe('achieved')
    store.addStep('D3', 'D3/Motion', 'Springs')
    expect(store.goals[0]).not.toHaveProperty('status')
    store.setGoalStatus('D3', 'achieved')
    store.addMilestone('D3', 'Polish')
    expect(store.goals[0]).not.toHaveProperty('status')
  })

  it('ignores missing or deleted goals and keeps the timer selection on pause', () => {
    const store = storeWith({ selection: LINE })
    store.setGoalStatus('nope', 'paused')
    store.setGoalStatus('D3', 'paused')
    expect(store.selection).toEqual(LINE)
    store.deleteGoal('D3')
    store.setGoalStatus('D3', 'achieved')
    expect(store.goals[0].status).toBe('paused')
  })
})
