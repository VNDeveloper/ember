import { describe, expect, it } from 'vitest'
import { DEVICE_ONLY, canonical, sharedPart, stampChanges, withDeviceState } from './sync'
import { dataFixture, goalFixture, taskFixture } from './test-fixtures'

const T = 1_800_000_000_000
const clone = <X>(x: X): X => JSON.parse(JSON.stringify(x))

describe('shared and per-device parts', () => {
  it('declares the timer, selection, sound and demo speed as per device', () => {
    expect(DEVICE_ONLY).toEqual({ data: ['timer', 'selection', 'deviceUpdatedAt'], settings: ['muted', 'demo'] })
  })

  it('leaves per-device state out of the shared part', () => {
    const d = dataFixture({ tasks: [taskFixture('A')], selection: { kind: 'task', taskId: 'A' }, deviceUpdatedAt: 5 })
    const s = sharedPart(d)
    expect(Object.keys(s).sort()).toEqual(['goals', 'logs', 'settings', 'tasks'])
    expect(s.settings).not.toHaveProperty('muted')
    expect(s.settings).not.toHaveProperty('demo')
    expect(s.settings.session).toBe('25/5')
    expect(s.tasks.map((t) => t.id)).toEqual(['A'])
  })

  it("re-attaches this device's state to shared data", () => {
    const base = dataFixture().settings
    const local = dataFixture({ selection: { kind: 'task', taskId: 'A' }, deviceUpdatedAt: 7, settings: { ...base, muted: false, demo: true } })
    const remote = sharedPart(dataFixture({ tasks: [taskFixture('B')], settings: { ...base, session: '50/10', muted: true, demo: false } }))
    const d = withDeviceState(remote, local)
    expect(d.tasks.map((t) => t.id)).toEqual(['B'])
    expect(d.selection).toEqual({ kind: 'task', taskId: 'A' })
    expect(d.timer).toBe(local.timer)
    expect(d.deviceUpdatedAt).toBe(7)
    expect(d.settings).toMatchObject({ session: '50/10', muted: false, demo: true })
  })
})

describe('canonical', () => {
  it('ignores key order and undefined values', () => {
    expect(canonical({ b: 1, a: { d: undefined, c: [2, 1] } })).toBe(canonical({ a: { c: [2, 1] }, b: 1 }))
    expect(canonical({ a: null })).not.toBe(canonical({}))
  })
})

describe('stampChanges', () => {
  const before = () => dataFixture({
    goals: [goalFixture('D3', [['Charts', [['Bar', null], ['Line', null]]]])],
    tasks: [taskFixture('A'), taskFixture('B')],
  })

  it('stamps new and changed items at every level, and nothing else', () => {
    const b = before()
    const a = clone(b)
    a.tasks[0].title = 'A2'
    a.tasks.push(taskFixture('C'))
    a.goals[0].milestones[0].steps[1].doneOn = '2026-09-23'
    expect(stampChanges(b, a, T)).toBe(3)
    expect(a.tasks.map((t) => t.updatedAt)).toEqual([T, undefined, T])
    const g = a.goals[0]
    expect(g.updatedAt).toBeUndefined()
    expect(g.milestones[0].updatedAt).toBeUndefined()
    expect(g.milestones[0].steps.map((s) => s.updatedAt)).toEqual([undefined, T])
  })

  it('stamps a goal or milestone for its own fields only', () => {
    const b = before()
    const a = clone(b)
    a.goals[0].milestones[0].title = 'First charts'
    expect(stampChanges(b, a, T)).toBe(1)
    expect([a.goals[0].updatedAt, a.goals[0].milestones[0].updatedAt]).toEqual([undefined, T])
    const c = clone(b)
    c.goals[0].title = 'Learn D3'
    expect(stampChanges(b, c, T)).toBe(1)
    expect([c.goals[0].updatedAt, c.goals[0].milestones[0].updatedAt]).toEqual([T, undefined])
  })

  it('treats an undo (deletedOn back to null) as an edit', () => {
    const b = before()
    const a = clone(b)
    a.tasks[0].deletedOn = null
    expect(stampChanges(b, a, T)).toBe(1)
  })

  it('ignores a difference in updatedAt alone', () => {
    const b = dataFixture({ tasks: [taskFixture('A', { updatedAt: 1 })] })
    const a = clone(b)
    a.tasks[0].updatedAt = 2
    expect(stampChanges(b, a, T)).toBe(0)
    expect(a.tasks[0].updatedAt).toBe(2)
  })

  it('stamps shared settings, but not sound or demo speed', () => {
    const b = dataFixture()
    const a = clone(b)
    a.settings.muted = false
    a.settings.demo = true
    expect(stampChanges(b, a, T)).toBe(0)
    expect(a.settings.updatedAt).toBeUndefined()
    a.settings.wallWeeks = 8
    expect(stampChanges(b, a, T)).toBe(1)
    expect(a.settings.updatedAt).toBe(T)
  })

  it("stamps this device's timer and selection separately, without counting them", () => {
    const b = dataFixture()
    const a = clone(b)
    a.selection = { kind: 'task', taskId: 'A' }
    expect(stampChanges(b, a, T)).toBe(0)
    expect(a.deviceUpdatedAt).toBe(T)
  })
})
