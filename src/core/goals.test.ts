import { describe, expect, it } from 'vitest'
import { findStep, goalColor, goalOptions, goalStats, goalStatus, isActiveGoal, isMilestoneDone, nextOpenStep, repairGoal, stepAfter, stepTarget } from './goals'
import { goalFixture } from './test-fixtures'

const d3 = () => goalFixture('D3', [
  ['Foundations', [['SVG', '2026-07-01'], ['Scales', '2026-07-08']]],
  ['First charts', [['Bar', '2026-09-01'], ['Line', null], ['Scatter', null]]],
  ['Capstone', [['Build', null]]],
])

describe('goal derivations', () => {
  it('computes stats and the current milestone', () => {
    expect(goalStats(d3())).toEqual({ done: 3, total: 6, pct: 50, milestonesDone: 1, currentIndex: 1 })
  })

  it('treats an empty milestone as not done, so a new goal starts on it', () => {
    const g = goalFixture('New', [['Getting started', []]])
    expect(isMilestoneDone(g.milestones[0])).toBe(false)
    expect(goalStats(g)).toEqual({ done: 0, total: 0, pct: 0, milestonesDone: 0, currentIndex: 0 })
    expect(nextOpenStep(g)).toBeNull()
  })

  it('finds the next open step', () => {
    const g = d3()
    const next = nextOpenStep(g)
    expect(next?.step.title).toBe('Line')
    expect(next?.mi).toBe(1)
    expect(next?.si).toBe(1)
  })

  it('returns no next step and currentIndex -1 when everything is done', () => {
    const g = goalFixture('Done', [['Only', [['A', '2026-09-01']]]])
    expect(nextOpenStep(g)).toBeNull()
    expect(goalStats(g).currentIndex).toBe(-1)
    expect(goalStats(g).pct).toBe(100)
  })

  it('finds the open step after a given one, across milestones and skipping done steps', () => {
    const g = d3()
    expect(stepAfter(g, 'D3/First charts/Line')?.title).toBe('Scatter')
    expect(stepAfter(g, 'D3/First charts/Scatter')?.title).toBe('Build')
    expect(stepAfter(g, 'D3/Capstone/Build')).toBeNull()
    g.milestones[1].steps[2].doneOn = '2026-09-20'
    expect(stepAfter(g, 'D3/First charts/Line')?.title).toBe('Build')
  })

  it('locates a step target', () => {
    const g = d3()
    const t = stepTarget(g, g.milestones[1], g.milestones[1].steps[1])
    expect(t).toEqual({ kind: 'step', goalId: 'D3', msId: 'D3/First charts', stepId: 'D3/First charts/Line' })
    const loc = findStep([goalFixture('Other', []), g], t)
    expect(loc).toMatchObject({ gi: 1, mi: 1, si: 1 })
    expect(loc?.step.title).toBe('Line')
    expect(findStep([g], { ...t, stepId: 'nope' })).toBeNull()
  })

  it('cycles goal colours: accent, ink, accent-300, neutral-500', () => {
    expect(goalColor(0)).toBe('var(--color-accent)')
    expect(goalColor(1)).toBe('var(--color-text)')
    expect(goalColor(2)).toBe('var(--color-accent-300)')
    expect(goalColor(3)).toBe('var(--color-neutral-500)')
    expect(goalColor(4)).toBe('var(--color-accent)')
  })
})

describe('goal status', () => {
  const g = goalFixture('G', [['M', [['A', null]]]])
  it('reads a missing or unknown status as active', () => {
    expect(goalStatus(g)).toBe('active')
    expect(goalStatus({ ...g, status: 'done' as never })).toBe('active')
    expect(goalStatus({ ...g, status: 'paused' })).toBe('paused')
  })
  it('offers only live, active goals for focus', () => {
    expect(isActiveGoal(g)).toBe(true)
    expect(isActiveGoal({ ...g, status: 'paused' })).toBe(false)
    expect(isActiveGoal({ ...g, status: 'achieved' })).toBe(false)
    expect(isActiveGoal({ ...g, deletedOn: '2026-09-01' })).toBe(false)
  })
  it('drops an invalid finish-by date and invalid milestone estimates, keeping valid goals as they are', () => {
    const ok = { ...goalFixture('G', [['M', []]]), finishBy: '2026-12-01' }
    ok.milestones[0].estMin = 120
    expect(repairGoal(ok)).toBe(ok)
    const bad = { ...goalFixture('G', [['M', []], ['N', []]]), finishBy: 'soon' }
    bad.milestones[0].estMin = 7
    bad.milestones[1].estMin = 90
    const r = repairGoal(bad)
    expect(r).not.toHaveProperty('finishBy')
    expect(r.milestones[0]).not.toHaveProperty('estMin')
    expect(r.milestones[1].estMin).toBe(90)
  })

  it('drops a finish-by date that is not a real calendar date', () => {
    expect(repairGoal({ ...goalFixture('G', []), finishBy: '2026-99-99' })).not.toHaveProperty('finishBy')
    expect(repairGoal({ ...goalFixture('G', []), finishBy: '2026-02-30' })).not.toHaveProperty('finishBy')
  })

  it('repairs a goal’s habit, and drops one that cannot be repaired', () => {
    const ok = { ...goalFixture('G', []), habit: { targets: [{ minutes: 25, daysPerWeek: 3, from: '2026-09-28' }], pauses: [] } }
    expect(repairGoal(ok)).toBe(ok)
    expect(repairGoal({ ...goalFixture('G', []), habit: { targets: [], pauses: [] } })).not.toHaveProperty('habit')
  })

  it('repairs an unknown status and a stray achievedOn, leaving valid goals untouched', () => {
    expect(repairGoal(g)).toBe(g)
    const ok = { ...g, status: 'achieved' as const, achievedOn: '2026-10-11' }
    expect(repairGoal(ok)).toBe(ok)
    expect(repairGoal({ ...g, status: 'done' as never })).not.toHaveProperty('status')
    expect(repairGoal({ ...g, status: 'paused', achievedOn: '2026-10-11' })).not.toHaveProperty('achievedOn')
  })
  it('lets tasks link to active and paused goals, and keeps an achieved one already linked', () => {
    const p = { ...goalFixture('P', []), status: 'paused' as const }
    const a = { ...goalFixture('A', []), status: 'achieved' as const, achievedOn: '2026-10-01' }
    const d = { ...goalFixture('D', []), deletedOn: '2026-09-01' }
    expect(goalOptions([g, p, a, d]).map((x) => x.id)).toEqual(['G', 'P'])
    expect(goalOptions([g, p, a, d], 'A').map((x) => x.id)).toEqual(['G', 'P', 'A'])
  })
})
