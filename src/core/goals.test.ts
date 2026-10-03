import { describe, expect, it } from 'vitest'
import { findStep, goalColor, goalStats, isMilestoneDone, nextOpenStep, stepAfter, stepTarget } from './goals'
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
