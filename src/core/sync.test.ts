import { describe, expect, it } from 'vitest'
import type { EmberData } from './model'
import { DEVICE_ONLY, canonical, makeSyncFile, mergeData, readSyncFile, sharedPart, stampChanges, syncSummary, syncedAgo, withDeviceState } from './sync'
import { dataFixture, goalFixture, taskFixture } from './test-fixtures'

const T = 1_800_000_000_000
const clone = <X>(x: X): X => JSON.parse(JSON.stringify(x))

describe('shared and per-device parts', () => {
  it('declares the timer, selection, sound, volume and demo speed as per device', () => {
    expect(DEVICE_ONLY).toEqual({ data: ['timer', 'selection', 'deviceUpdatedAt'], settings: ['muted', 'demo', 'volume'] })
  })

  it('leaves per-device state out of the shared part', () => {
    const d = dataFixture({ tasks: [taskFixture('A')], selection: { kind: 'task', taskId: 'A' }, deviceUpdatedAt: 5 })
    const s = sharedPart(d)
    expect(Object.keys(s).sort()).toEqual(['goals', 'logs', 'settings', 'tasks'])
    expect(s.settings).not.toHaveProperty('muted')
    expect(s.settings).not.toHaveProperty('demo')
    expect(s.settings).not.toHaveProperty('volume')
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

  it("stamps an edit later than the version it replaced, even when this device's clock is behind", () => {
    const ahead = T + 120_000
    const b = dataFixture({
      goals: [{ ...goalFixture('D3', [['Charts', [['Bar', null]]]]), updatedAt: ahead }],
      tasks: [taskFixture('A', { updatedAt: ahead })],
    })
    b.settings = { ...b.settings, updatedAt: ahead }
    b.goals[0].milestones[0].steps[0].updatedAt = ahead
    const a = clone(b)
    a.tasks[0].title = 'edited on the slow device'
    a.goals[0].title = 'Learn D3'
    a.goals[0].milestones[0].steps[0].doneOn = '2026-09-23'
    a.settings.wallWeeks = 8
    stampChanges(b, a, T)
    expect([a.tasks[0].updatedAt, a.goals[0].updatedAt, a.goals[0].milestones[0].steps[0].updatedAt, a.settings.updatedAt]).toEqual([ahead + 1, ahead + 1, ahead + 1, ahead + 1])
    expect(mergeData(sharedPart(a), sharedPart(b)).tasks[0].title).toBe('edited on the slow device')
  })

  it("stamps this device's timer and selection separately, without counting them", () => {
    const b = dataFixture()
    const a = clone(b)
    a.selection = { kind: 'task', taskId: 'A' }
    expect(stampChanges(b, a, T)).toBe(0)
    expect(a.deviceUpdatedAt).toBe(T)
  })
})

const shared = (patch: Partial<EmberData> = {}) => sharedPart(dataFixture(patch))
const ids = (xs: { id: string }[]) => xs.map((x) => x.id)

describe('mergeData', () => {
  it('keeps items that exist on one side only, Drive order first', () => {
    const m = mergeData(shared({ tasks: [taskFixture('A')] }), shared({ tasks: [taskFixture('B')] }))
    expect(ids(m.tasks)).toEqual(['B', 'A'])
  })

  it('picks the newer copy of an item on both sides', () => {
    const local = shared({ tasks: [taskFixture('A', { title: 'old', updatedAt: 1 })] })
    const remote = shared({ tasks: [taskFixture('A', { title: 'new', updatedAt: 2 })] })
    expect(mergeData(local, remote).tasks[0].title).toBe('new')
    expect(mergeData(remote, local).tasks[0].title).toBe('new')
  })

  it('breaks equal stamps by content, the same way on every device', () => {
    const a = shared({ tasks: [taskFixture('A', { title: 'Apple', updatedAt: 5 })] })
    const b = shared({ tasks: [taskFixture('A', { title: 'Banana', updatedAt: 5 })] })
    expect(mergeData(a, b).tasks[0].title).toBe(mergeData(b, a).tasks[0].title)
  })

  it('a later stamp wins even when its device has older stamps elsewhere', () => {
    const local = shared({ tasks: [taskFixture('A', { title: 'phone', updatedAt: 900 }), taskFixture('B', { updatedAt: 100 })] })
    const remote = shared({ tasks: [taskFixture('A', { title: 'mac', updatedAt: 1000 }), taskFixture('B', { updatedAt: 50 })] })
    const m = mergeData(local, remote)
    expect(m.tasks.find((t) => t.id === 'A')!.title).toBe('mac')
    expect(m.tasks.find((t) => t.id === 'B')!.updatedAt).toBe(100)
  })

  it('merges goals per milestone and step, so edits on two devices both survive', () => {
    const base = goalFixture('D3', [['Charts', [['Bar', null], ['Line', null]]]])
    const local = clone(base)
    local.milestones[0].steps[1] = { ...local.milestones[0].steps[1], doneOn: '2026-09-23', updatedAt: 2 }
    const remote = clone(base)
    remote.milestones[0].steps.push({ id: 'D3/Charts/Scatter', title: 'Scatter', doneOn: null, estMin: 50, updatedAt: 3 })
    const m = mergeData(shared({ goals: [local] }), shared({ goals: [remote] }))
    const steps = m.goals[0].milestones[0].steps
    expect(ids(steps)).toEqual(['D3/Charts/Bar', 'D3/Charts/Line', 'D3/Charts/Scatter'])
    expect(steps[1].doneOn).toBe('2026-09-23')
  })

  it("takes a goal's own fields from the newer goal without dropping the other side's milestones", () => {
    const local = { ...goalFixture('D3', [['Charts', []]]), title: 'Learn D3', updatedAt: 9 }
    const remote = { ...goalFixture('D3', [['Charts', []], ['Motion', []]]), updatedAt: 1 }
    const m = mergeData(shared({ goals: [local] }), shared({ goals: [remote] }))
    expect(m.goals[0].title).toBe('Learn D3')
    expect(ids(m.goals[0].milestones)).toEqual(['D3/Charts', 'D3/Motion'])
  })

  it('keeps a newer soft delete', () => {
    const local = shared({ tasks: [taskFixture('A', { deletedOn: '2026-09-23', updatedAt: 5 })] })
    const remote = shared({ tasks: [taskFixture('A', { title: 'renamed', updatedAt: 3 })] })
    expect(mergeData(local, remote).tasks[0].deletedOn).toBe('2026-09-23')
  })

  it('unions focus logs by id, in time order', () => {
    const log = (id: string, at: number) => ({ id, at, date: '2026-09-23', min: 25, target: null })
    const m = mergeData(shared({ logs: [log('a', 3), log('b', 1)] }), shared({ logs: [log('b', 1), log('c', 2)] }))
    expect(ids(m.logs)).toEqual(['b', 'c', 'a'])
  })

  it('takes shared settings from the newer side', () => {
    const s = dataFixture().settings
    const local = shared({ settings: { ...s, wallWeeks: 8, updatedAt: 2 } })
    const remote = shared({ settings: { ...s, wallWeeks: 20, session: '50/10', updatedAt: 1 } })
    expect(mergeData(local, remote).settings).toMatchObject({ wallWeeks: 8, session: '25/5' })
  })

  it('gives every device the same goal order once both have synced (goal colours match)', () => {
    const g = (id: string) => goalFixture(id, [])
    let file = shared({ goals: [g('G1')] })
    const a = mergeData(shared({ goals: [g('G1'), g('GA')] }), file)
    file = a
    const b = mergeData(shared({ goals: [g('G1'), g('GB')] }), file)
    file = b
    const a2 = mergeData(a, file)
    expect(ids(a2.goals)).toEqual(ids(b.goals))
    expect(ids(b.goals)).toEqual(['G1', 'GA', 'GB'])
  })

  it('is idempotent, and heals an upload that was overwritten', () => {
    const empty = shared()
    const onA = mergeData(shared({ tasks: [taskFixture('X', { updatedAt: 1 })] }), empty)
    expect(canonical(mergeData(onA, onA))).toBe(canonical(onA))
    // B merged against the empty file before A's upload landed, then overwrote it.
    const onB = mergeData(shared({ tasks: [taskFixture('Y', { updatedAt: 2 })] }), empty)
    const file = onB
    const healed = mergeData(onA, file)
    expect(ids(healed.tasks).sort()).toEqual(['X', 'Y'])
  })
})

describe('sync file', () => {
  it('round-trips shared data with its generation', () => {
    const s = shared({ tasks: [taskFixture('A', { updatedAt: 3 })] })
    const r = readSyncFile(makeSyncFile(s, 'gen-1', T))
    expect(r).toMatchObject({ ok: true, generation: 'gen-1', exportedAt: new Date(T).toISOString() })
    if (r.ok) expect(canonical(r.data)).toBe(canonical(s))
  })

  it('never carries per-device state', () => {
    const text = makeSyncFile(shared(), 'g', T)
    expect(text).not.toContain('"timer"')
    expect(text).not.toContain('"muted"')
  })

  it.each([
    ['junk', 'not json'],
    ['a backup (no generation)', JSON.stringify({ app: 'ember', version: 1, data: shared() })],
    ['another app', JSON.stringify({ app: 'other', version: 1, generation: 'g', data: shared() })],
    ['a future version', JSON.stringify({ app: 'ember', version: 2, generation: 'g', data: shared() })],
    ['missing lists', JSON.stringify({ app: 'ember', version: 1, generation: 'g', data: { goals: [] } })],
  ])('rejects %s', (_, text) => {
    expect(readSyncFile(text).ok).toBe(false)
  })

  it('fills settings added since the file was written, and repairs a bad session length', () => {
    const text = JSON.stringify({ app: 'ember', version: 1, generation: 'g', data: { goals: [], tasks: [], logs: [], settings: { session: '200/5' } } })
    const r = readSyncFile(text)
    expect(r.ok && r.data.settings).toMatchObject({ session: '25/5', showFuture: true, wallWeeks: 12 })
    expect(r.ok && r.data.settings).not.toHaveProperty('muted')
  })

  it('summarises live goals and tasks, and all focus sessions', () => {
    const s = shared({
      goals: [goalFixture('D3', []), { ...goalFixture('Old', []), deletedOn: '2026-09-01' }],
      tasks: [taskFixture('A'), taskFixture('B')],
    })
    expect(syncSummary(s)).toBe('1 goal · 2 tasks · 0 focus sessions')
  })
})

describe('syncedAgo', () => {
  const at = (h: number, m: number, day = 23) => new Date(2026, 8, day, h, m).getTime()
  it.each([
    [at(10, 0), at(10, 0) + 30_000, 'just now'],
    [at(10, 0), at(10, 3), '3 min ago'],
    [at(9, 5), at(14, 0), 'at 09:05'],
    [at(9, 5, 16), at(14, 0), 'on Sep 16'],
  ])('%s → %s', (last, now, text) => {
    expect(syncedAgo(last, now)).toBe(text)
  })
})
