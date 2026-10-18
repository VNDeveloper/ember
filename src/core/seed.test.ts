import { describe, expect, it } from 'vitest'
import { addDays, diffDays, isWeekend } from './dates'
import { findStep, nextOpenStep, stepTarget } from './goals'
import type { StepTarget } from './model'
import { targetKey } from './model'
import { DEFAULT_SETTINGS } from './model'
import { buildSeed, emptyData } from './seed'
import { tallyLogs } from './tally'

const NOW = new Date(2026, 8, 23, 10, 0, 0).getTime()
const TODAY = '2026-09-23'
const seed = buildSeed(NOW)
const tally = tallyLogs(seed.logs, TODAY)
const task = (title: string) => seed.tasks.find((t) => t.title === title)!

describe('buildSeed', () => {
  it('creates the three prototype goals with their milestones', () => {
    expect(seed.goals.map((g) => g.title)).toEqual(['Learn D3.js', 'Speak Spanish at B1', 'Learn watercolour'])
    const d3 = seed.goals[0]
    expect(d3.outcome).toBe('Build and publish an interactive, animated chart of a real dataset — starting from a blank file, no tutorial open.')
    expect(d3.milestones.map((m) => m.title)).toEqual(['Foundations', 'First charts', 'Motion & interaction', 'Capstone'])
    expect(d3.milestones[1].steps.map((s) => s.doneOn != null)).toEqual([true, true, true, false])
  })

  it('dates done steps by weeks ago, with 0 weeks meaning yesterday', () => {
    const conversation = seed.goals[1].milestones[2]
    expect(conversation.steps[0].doneOn).toBe(addDays(TODAY, -7))
    expect(conversation.steps[1].doneOn).toBe(addDays(TODAY, -1))
    expect(conversation.steps[2].doneOn).toBeNull()
  })

  it('estimates every step at 50–125 minutes in 25-minute units', () => {
    for (const s of seed.goals.flatMap((g) => g.milestones.flatMap((m) => m.steps))) {
      expect(s.estMin % 25).toBe(0)
      expect(s.estMin).toBeGreaterThanOrEqual(50)
      expect(s.estMin).toBeLessThanOrEqual(125)
    }
  })

  it('logs est ± 25 minutes against each done step', () => {
    for (const g of seed.goals) for (const m of g.milestones) for (const s of m.steps) {
      if (s.doneOn == null) continue
      const spent = tally.spent.get(targetKey(stepTarget(g, m, s))) ?? 0
      expect(spent).toBeGreaterThanOrEqual(25)
      expect([s.estMin - 25, s.estMin, s.estMin + 25]).toContain(spent)
    }
  })

  it("gives each goal's next open step 50 minutes, and pre-selects D3's with both sessions today", () => {
    for (const g of seed.goals) {
      const next = nextOpenStep(g)!
      expect(tally.spent.get(targetKey(stepTarget(g, next.milestone, next.step)))).toBe(50)
    }
    const sel = seed.selection as StepTarget
    expect(findStep(seed.goals, sel)?.step.title).toBe('Reusable chart function')
    expect(tally.spentToday.get(targetKey(sel))).toBe(50)
    expect(tally.sessionsToday).toBe(2)
    expect(tally.minutesToday).toBe(50)
  })

  it('places the prototype tasks relative to today', () => {
    expect(task('Book dentist appointment').date).toBe('2026-09-21')
    expect(task('Renew car insurance')).toMatchObject({ date: TODAY, deadline: true, doneOn: null })
    expect(task('Send Q3 invoice to Halden & Co.')).toMatchObject({ date: TODAY, deadline: true, doneOn: TODAY })
    expect(task('Water the plants').doneOn).toBe(TODAY)
    expect(task('Car service').date).toBe('2026-10-09')
    expect(task('Try a sourdough starter').date).toBeNull()
    expect(task('Book Spanish tutor for October').goalId).toBe(seed.goals[1].id)
    expect(task('Order cold-press paper').goalId).toBe(seed.goals[2].id)
    expect(task('Read “Visual Display of Quantitative Information”')).toMatchObject({ date: null, goalId: seed.goals[0].id })
    const titles = seed.tasks.map((t) => t.title)
    expect(titles.indexOf('Send Q3 invoice to Halden & Co.')).toBeLessThan(titles.indexOf('Sort out old phone photos'))
    expect(titles.at(-1)).toBe('Sort out old phone photos')
  })

  it('generates believable history: nothing in the future, active recent days, busier weekdays', () => {
    expect(seed.logs.every((l) => l.date <= TODAY)).toBe(true)
    expect(seed.tasks.every((t) => t.doneOn == null || t.doneOn <= TODAY)).toBe(true)

    const doneByDay = new Map<string, number>()
    const bump = (d: string | null) => d && doneByDay.set(d, (doneByDay.get(d) ?? 0) + 1)
    seed.tasks.forEach((t) => bump(t.doneOn))
    seed.goals.forEach((g) => g.milestones.forEach((m) => m.steps.forEach((s) => bump(s.doneOn))))
    for (let k = 1; k <= 18; k++) expect(doneByDay.get(addDays(TODAY, -k)) ?? 0).toBeGreaterThan(0)

    let wd = 0, wdDays = 0, we = 0, weDays = 0
    for (let k = 1; k <= 265; k++) {
      const d = addDays(TODAY, -k), n = doneByDay.get(d) ?? 0
      if (isWeekend(d)) { we += n; weDays++ } else { wd += n; wdDays++ }
    }
    expect(wd / wdDays).toBeGreaterThan(we / weDays)
  })

  it('is stable for the same day', () => {
    const again = buildSeed(NOW)
    expect(again.tasks.length).toBe(seed.tasks.length)
    expect(again.logs.length).toBe(seed.logs.length)
  })

  it('includes sample resources linked to the sample goals, with one renewal due in 3 days', () => {
    expect(seed.resources.length).toBe(12)
    expect(new Set(seed.resources.map((r) => r.company)).size).toBe(8)
    const plus = seed.resources.find((r) => r.title === 'Coursera Plus')!
    expect(plus).toMatchObject({ type: 'membership', billing: 'month', price: 49 })
    expect(diffDays(plus.renewsOn!, TODAY)).toBe(3)
    const goalIds = new Set(seed.goals.map((g) => g.id))
    for (const r of seed.resources) if (r.goalId) expect(goalIds.has(r.goalId)).toBe(true)
  })

  it('gives the Spanish goal a demo habit that started 8 weeks ago', () => {
    const spanish = seed.goals.find((g) => g.title === 'Speak Spanish at B1')!
    expect(spanish.habit).toEqual({ targets: [{ minutes: 25, daysPerWeek: 3, from: '2026-07-27' }], pauses: [] })
  })

  it('starts with an idle timer and default settings', () => {
    expect(seed.timer).toMatchObject({ phase: 'focus', running: false, leftSec: 1500 })
    expect(seed.settings.session).toBe('25/5')
  })
})

describe('emptyData', () => {
  it('has no goals, tasks, history or selection, an idle timer, and the given settings', () => {
    const settings = { ...DEFAULT_SETTINGS, session: '50/10' as const, wallWeeks: 20 }
    expect(emptyData(settings)).toEqual({
      goals: [], tasks: [], logs: [], resources: [], selection: null,
      timer: { phase: 'focus', running: false, endsAt: null, leftSec: 3000, speed: 1, lengthSec: 3000 },
      settings,
    })
  })
})
