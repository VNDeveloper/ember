import { describe, expect, it } from 'vitest'
import { achievedSummary, finishLine, goalKicker, goalLedger, goalList, goalTasks, roadmap, sessionBlocks } from './goalView'
import { goalColor } from './goals'
import { tallyLogs } from './tally'
import { d3Fixture, goalFixture, stepRef, taskFixture } from './test-fixtures'

const TODAY = '2026-09-23'
const { goal, logs } = d3Fixture()
const { spent, spentToday } = tallyLogs(logs, TODAY)

describe('goal list, kicker and ledger', () => {
  it('groups goals into active, paused and achieved with their own meta lines', () => {
    const spanish = goalFixture('Spanish', [['All', [['A', '2026-09-01'], ['B', '2026-09-02']]]])
    const art = { ...goalFixture('Art', []), status: 'paused' as const }
    const run = { ...goalFixture('Run', []), status: 'achieved' as const, achievedOn: '2026-10-12' }
    const groups = goalList([goal, art, spanish, run], spent)
    expect(groups.map((g) => [g.status, g.label, g.items.map((i) => i.id)])).toEqual([
      ['active', 'Active', ['D3', 'Spanish']], ['paused', 'Paused', ['Art']], ['achieved', 'Achieved', ['Run']],
    ])
    expect(groups[0].items).toEqual([
      { id: 'D3', title: 'D3', swatch: 'var(--color-accent)', pct: 40, complete: false, meta: '2h 5m focused · 2/5 steps', behind: false },
      { id: 'Spanish', title: 'Spanish', swatch: goalColor(2), pct: 100, complete: true, meta: '0m focused · 2/2 steps', behind: false },
    ])
    expect(groups[1].items[0].meta).toBe('Paused · 0m focused')
    expect(groups[2].items[0].meta).toBe('Achieved Oct 12 · 0m focused')
    expect(groups[1].items[0].swatch).toBe(goalColor(1))
  })

  it('leaves out empty groups and deleted goals', () => {
    const gone = { ...goalFixture('Gone', []), deletedOn: '2026-09-01', status: 'paused' as const }
    expect(goalList([goal, gone], spent).map((g) => g.status)).toEqual(['active'])
  })

  it('builds the header kicker', () => {
    expect(goalKicker(goal, spent)).toBe('Goal · 2h 5m focused · 1 of 3 milestones')
  })

  it('computes focused, estimated, left to go and accuracy', () => {
    expect(goalLedger(goal, spent)).toEqual({ focused: '2h 5m', estimated: '4h 10m', left: '1h 40m', estimates: '—' })
  })

  it('handles an empty goal', () => {
    const fresh = goalFixture('New', [['Getting started', []]])
    expect(goalLedger(fresh, spent)).toEqual({ focused: '0m', estimated: '0m', left: '~4h', estimates: '—' })
    expect(goalKicker(fresh, spent)).toBe('Goal · 0m focused · 0 of 1 milestones')
    expect(roadmap(fresh, spent, spentToday, null)[0]).toMatchObject({ current: true, complete: false, count: '0 / 0', steps: [] })
  })
})

describe('pace in the roadmap and list', () => {
  it('shows unplanned milestone estimates in the roadmap and flags behind goals in the list', () => {
    const g = goalFixture('G', [['Planned', [['A', null]]], ['Later', []]])
    const rows = roadmap(g, spent, spentToday, null)
    expect(rows[0].estimate).toBeNull()
    expect(rows[1].estimate).toEqual({ text: '~50m guess', guess: true })
    g.milestones[1].estMin = 120
    expect(roadmap(g, spent, spentToday, null)[1].estimate).toEqual({ text: '~2h', guess: false })
    const items = goalList([g, goalFixture('H', [])], spent, new Set(['G']))[0].items
    expect(items.map((i) => i.behind)).toEqual([true, false])
  })
})

describe('achieved goals', () => {
  it('count nothing left for milestones they never planned', () => {
    const done = { ...goalFixture('G', [['Planned', [['A', '2026-09-01']]], ['Getting started', []]]), status: 'achieved' as const, achievedOn: '2026-09-02' }
    expect(goalLedger(done, spent).left).toBe('0m')
  })
})

describe('goalTasks', () => {
  it("lists the goal's open tasks and today's finished ones by date, Someday last", () => {
    const tasks = [
      taskFixture('t1', { goalId: 'D3', date: null }),
      taskFixture('t2', { goalId: 'D3', date: '2026-09-25' }),
      taskFixture('t3', { goalId: 'D3', date: TODAY }),
      taskFixture('t4', { goalId: 'D3', date: '2026-09-22', doneOn: '2026-09-22' }),
      taskFixture('t5', { goalId: 'D3', date: '2026-09-20', doneOn: TODAY }),
      taskFixture('t6', { goalId: 'Other' }),
    ]
    expect(goalTasks(tasks, 'D3', TODAY).map((t) => t.title)).toEqual(['t5', 't3', 't2', 't1'])
  })
})

describe('sessionBlocks', () => {
  it('draws earlier time in ink, today in accent, and the rest of the estimate outlined', () => {
    expect(sessionBlocks(50, 75, 25)).toEqual(['earlier', 'today', 'remaining'])
    expect(sessionBlocks(75, 50, 0)).toEqual(['earlier', 'earlier', 'earlier'])
    expect(sessionBlocks(0, 50, 0)).toEqual(['remaining', 'remaining'])
    expect(sessionBlocks(25, 50, 50)).toEqual(['today', 'remaining'])
  })
})

describe('roadmap', () => {
  const rows = roadmap(goal, spent, spentToday, stepRef('D3', 'First charts', 'Line'))

  it('builds milestone rows with state, ledger and segments', () => {
    expect(rows.map((r) => [r.num, r.title, r.complete, r.current, r.count, r.ledger, r.segments])).toEqual([
      ['01', 'Foundations', true, false, '1 / 1', '0m of est. 50m', [true]],
      ['02', 'First charts', false, true, '1 / 3', '2h 5m of est. 2h 30m', [true, false, false]],
      ['03', 'Motion', false, false, '0 / 1', '0m of est. 50m', [false]],
    ])
  })

  it('builds roadmap rows for steps with blocks, ledger and notes', () => {
    const [svg] = rows[0].steps
    const [bar, line, scatter] = rows[1].steps
    expect(svg).toMatchObject({ title: 'SVG', done: true, ledger: '0m / 50m', note: 'Done Jul 1', noteAccent: false, blocks: ['remaining', 'remaining'] })
    expect(bar).toMatchObject({ done: true, ledger: '1h 15m / 50m', note: '+25m over', noteAccent: true, blocks: ['earlier', 'earlier', 'earlier'] })
    expect(line).toMatchObject({ done: false, selected: true, ledger: '50m / 50m', note: '', blocks: ['earlier', 'today'] })
    expect(line.target).toEqual(stepRef('D3', 'First charts', 'Line'))
    expect(scatter).toMatchObject({ selected: false, blocks: ['remaining', 'remaining'] })
  })
})

describe('finishLine', () => {
  it('shows the outcome, or a prompt, and whether it is reached', () => {
    expect(finishLine(goal)).toEqual({ reached: false, title: 'Finish line', text: 'Describe what done looks like above.' })
    const done = { ...goalFixture('Done', [['M', [['A', '2026-09-01']]]]), outcome: 'Ship it' }
    expect(finishLine(done)).toEqual({ reached: true, title: 'Finish line — reached', text: 'Ship it' })
    expect(finishLine(goalFixture('Empty', [])).reached).toBe(false)
  })
})

describe('achievedSummary', () => {
  it('sums the effort from start to the achieved day', () => {
    const done = { ...goal, outcome: 'Ship a chart', status: 'achieved' as const, achievedOn: '2026-10-12' }
    expect(achievedSummary(done, logs)).toEqual({
      outcome: 'Ship a chart', span: 'Jan 1 → Oct 12 · 284 days', focused: '2h 5m', sessions: 5, steps: 2, milestones: 1,
    })
  })
  it('says same day when started and achieved together', () => {
    const quick = { ...goalFixture('Q', []), status: 'achieved' as const, achievedOn: '2026-01-01' }
    expect(achievedSummary(quick, []).span).toBe('Jan 1 → Jan 1 · same day')
  })
  it('counts only sessions on the goal\'s live steps', () => {
    const done = { ...goal, status: 'achieved' as const, achievedOn: '2026-10-12' }
    const other = { ...logs[0], id: 'x', target: { kind: 'task' as const, taskId: 'T' } }
    expect(achievedSummary(done, [...logs, other]).sessions).toBe(5)
  })
  it('counts a session split between two of its steps once', () => {
    const done = { ...goal, status: 'achieved' as const, achievedOn: '2026-10-12' }
    const split = [{ ...logs[0], session: 'S' }, { ...logs[1], session: 'S' }, ...logs.slice(2)]
    expect(achievedSummary(done, split).sessions).toBe(4)
  })
})
