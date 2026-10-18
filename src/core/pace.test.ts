import { describe, expect, it } from 'vitest'
import { correction, forecastDate, leftToGo, milestoneEstimate, needPerWeek, paceView, stepPacePerWeek, verdict } from './pace'
import type { Goal } from './model'
import { goalFixture, logFixture, stepRef } from './test-fixtures'

const TODAY = '2026-10-14'
function plan(): Goal {
  const g = goalFixture('P', [['M1', [['A', '2026-10-01'], ['B', '2026-10-02'], ['C', '2026-10-03'], ['D', null]]], ['M2', []], ['M3', []]])
  g.milestones[2].estMin = 120
  return g
}
const spent = new Map([['step:P/M1/A', 65], ['step:P/M1/B', 65], ['step:P/M1/C', 65], ['step:P/M1/D', 10]])
const logs = [
  logFixture('2026-09-17', stepRef('P', 'M1', 'A'), 60),
  logFixture('2026-10-01', stepRef('P', 'M1', 'B'), 100),
  logFixture('2026-10-14', stepRef('P', 'M1', 'D'), 40),
  logFixture('2026-09-16', stepRef('P', 'M1', 'A'), 500),
  logFixture('2026-10-10', { kind: 'task', taskId: 'Linked' }, 200),
]

describe('correction', () => {
  const three = (min: number) => new Map([['step:P/M1/A', min], ['step:P/M1/B', min], ['step:P/M1/C', min]])
  it('needs three finished steps with focus time', () => {
    expect(correction(plan(), new Map([['step:P/M1/A', 65], ['step:P/M1/B', 65]]))).toEqual({ ratio: 1, applied: false, short: '—', text: '' })
  })
  it('says which way your estimates go, within limits', () => {
    expect(correction(plan(), spent)).toEqual({ ratio: 1.3, applied: true, short: '+30%', text: 'You usually take 30% longer' })
    expect(correction(plan(), three(40))).toMatchObject({ ratio: 0.8, short: '−20%', text: 'You usually take 20% less time' })
    expect(correction(plan(), three(52))).toMatchObject({ short: 'on target', text: 'Your estimates are about right' })
    expect(correction(plan(), three(200)).ratio).toBe(2)
    expect(correction(plan(), three(10)).ratio).toBe(0.5)
  })
})

describe('what is left', () => {
  it('guesses unplanned milestones from planned ones, or uses your estimate', () => {
    const g = plan()
    expect(milestoneEstimate(g, g.milestones[0])).toBeNull()
    expect(milestoneEstimate(g, g.milestones[1])).toEqual({ min: 200, guess: true })
    expect(milestoneEstimate(g, g.milestones[2])).toEqual({ min: 120, guess: false })
    const fresh = goalFixture('N', [['Getting started', []]])
    expect(milestoneEstimate(fresh, fresh.milestones[0])).toEqual({ min: 240, guess: true })
  })
  it('scales open steps and unplanned milestones by your correction', () => {
    expect(leftToGo(plan(), spent)).toEqual({ min: 471, unplannedMin: 416 })
  })
})

describe('pace and forecast', () => {
  it('averages step focus over the last 4 weeks, ignoring linked tasks', () => {
    expect(stepPacePerWeek(plan(), logs, TODAY)).toBe(50)
  })
  it('forecasts a date, or none without pace', () => {
    expect(forecastDate(471, 50, TODAY)).toBe('2026-12-19')
    expect(forecastDate(0, 0, TODAY)).toBe(TODAY)
    expect(forecastDate(471, 0, TODAY)).toBeNull()
  })
  it('judges a finish-by date', () => {
    expect(verdict('2026-12-19', '2027-01-15', true, TODAY)).toBe('ahead')
    expect(verdict('2026-12-19', '2026-12-25', true, TODAY)).toBe('on track')
    expect(verdict('2026-12-19', '2026-12-01', true, TODAY)).toBe('behind')
    expect(verdict(null, '2026-12-01', true, TODAY)).toBeNull()
    expect(verdict('2026-12-19', TODAY, true, TODAY)).toBe('behind')
    expect(verdict('2026-12-19', '2026-10-13', true, TODAY)).toBe('past due')
    expect(needPerWeek(471, '2027-01-15', TODAY)).toBe(36)
    expect(needPerWeek(471, '2026-12-01', TODAY)).toBe(69)
    expect(needPerWeek(471, TODAY, TODAY)).toBeNull()
  })
})

describe('paceView', () => {
  it('puts it all in words', () => {
    const g = { ...plan(), finishBy: '2027-01-15', habit: { targets: [{ minutes: 25, daysPerWeek: 3, from: '2026-09-28' }], pauses: [] } }
    expect(paceView(g, logs, spent, TODAY)).toEqual({
      paused: false, left: '~7h 51m', unplanned: 'incl. ~6h 56m unplanned', correction: 'You usually take 30% longer',
      pace: '50m a week · last 4 weeks', atPace: '~Dec 19', atHabit: '~Nov 27',
      finishBy: { date: '2027-01-15', text: 'Jan 15, 2027', verdict: 'ahead', need: '36m a week' }, behind: false,
    })
  })
  it('marks behind and past due, and has no date without recent focus', () => {
    expect(paceView({ ...plan(), finishBy: '2026-12-01' }, logs, spent, TODAY)).toMatchObject({ behind: true, finishBy: { verdict: 'behind', need: '1h 9m a week' } })
    expect(paceView({ ...plan(), finishBy: '2026-10-01' }, logs, spent, TODAY)).toMatchObject({ behind: true, finishBy: { verdict: 'past due', need: '' } })
    const quiet = paceView({ ...plan(), finishBy: '2027-01-15' }, [], spent, TODAY)!
    expect(quiet).toMatchObject({ atPace: null, pace: 'No focus on its steps in the last 4 weeks', behind: false, finishBy: { verdict: null, need: '36m a week' } })
  })
  it('is paused for a paused goal and absent for an achieved one', () => {
    expect(paceView({ ...plan(), status: 'paused' }, logs, spent, TODAY)!.paused).toBe(true)
    expect(paceView({ ...plan(), status: 'achieved', achievedOn: TODAY }, logs, spent, TODAY)).toBeNull()
  })
})

describe('verdicts when little or nothing is left', () => {
  it('a goal with every step done is on track, even after its date', () => {
    const done = { ...goalFixture('Q', [['M', [['A', '2026-10-10'], ['B', '2026-10-11']]]]), finishBy: '2026-10-12' }
    const v = paceView(done, [], new Map([['step:Q/M/A', 50], ['step:Q/M/B', 50]]), TODAY)!
    expect(v.finishBy).toMatchObject({ verdict: 'on track' })
    expect(v.behind).toBe(false)
    expect(verdict(TODAY, '2026-10-12', false, TODAY)).toBe('on track')
  })
  it('an open step that ran over its estimate still counts as work left', () => {
    const over = { ...goalFixture('Q', [['M', [['A', null]]]]), finishBy: '2026-10-12' }
    const v = paceView(over, [], new Map([['step:Q/M/A', 90]]), TODAY)!
    expect(v.finishBy).toMatchObject({ verdict: 'past due' })
    expect(v.behind).toBe(true)
  })
  it('a paused goal is never flagged behind', () => {
    expect(paceView({ ...plan(), status: 'paused', finishBy: '2026-10-01' }, logs, spent, TODAY)!.behind).toBe(false)
  })
})

