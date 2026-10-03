import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { StepTarget } from '../core/model'
import { STORAGE_KEY, loadData, saveData } from '../core/persist'
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

  it('logs 50 minutes with the 50/10 setting', () => {
    const store = storeWith()
    store.setSession('50/10')
    expect(store.timer.leftSec).toBe(3000)
    store.startPause()
    store.tick(NOW + 50 * MIN)
    expect(store.logs[0].min).toBe(50)
    expect(store.timer.leftSec).toBe(600)
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

describe('storage key', () => {
  it('uses ember:v1', () => {
    freshStore()
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
  })
})
