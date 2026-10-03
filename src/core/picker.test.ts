import { describe, expect, it } from 'vitest'
import type { StepTarget } from './model'
import { pickerSections } from './picker'
import { goalFixture, taskFixture } from './test-fixtures'

const TODAY = '2026-09-23'
const goals = [
  goalFixture('D3', [
    ['First charts', [['Bar', '2026-09-01'], ['Line', null], ['Scatter', null]]],
    ['Motion', [['Easing', null]]],
  ]),
  goalFixture('Finished', [['Only', [['A', '2026-09-01']]]]),
  goalFixture('Spanish', [['Talk', [['Tutor', null]]]]),
]
const tasks = [
  taskFixture('Review PR'),
  taskFixture('Dentist', { date: '2026-09-21', tag: 'Health' }),
  taskFixture('Council tax', { date: '2026-09-29', tag: 'Personal' }),
  taskFixture('Landlord', { date: '2026-09-24', tag: 'Home' }),
  taskFixture('Paper', { date: '2026-09-26', goalId: 'Spanish', tag: '' }),
  taskFixture('Sourdough', { date: null, tag: 'Home' }),
  taskFixture('Invoice', { doneOn: TODAY }),
  taskFixture('Read Tufte', { date: null, goalId: 'D3', tag: '' }),
]
const LINE: StepTarget = { kind: 'step', goalId: 'D3', msId: 'D3/First charts', stepId: 'D3/First charts/Line' }
const view = (s: ReturnType<typeof pickerSections>) => s.map((x) => [x.label, x.items.map((i) => `${i.title} | ${i.meta}`)])

describe('pickerSections — tasks', () => {
  const sections = pickerSections(goals, tasks, { kind: 'task', taskId: 'Review PR' }, 'tasks', '', TODAY)

  it('groups open tasks into Today, Upcoming (by date) and Someday', () => {
    expect(view(sections)).toEqual([
      ['Today', ['Review PR | Work', 'Dentist | Health']],
      ['Upcoming', ['Landlord | Tomorrow · Home', 'Paper | Sep 26 · Spanish', 'Council tax | Sep 29 · Personal']],
      ['Someday', ['Sourdough | Home', 'Read Tufte | D3']],
    ])
  })

  it('marks the current item and styles swatches by goal', () => {
    const [today, upcoming, someday] = sections
    expect(today.items[0]).toMatchObject({ current: true, outlined: true, swatch: 'transparent', target: { kind: 'task', taskId: 'Review PR' } })
    expect(today.items[1].current).toBe(false)
    expect(upcoming.items[1]).toMatchObject({ outlined: false, swatch: 'var(--color-accent-300)' })
    expect(someday.items[1].swatch).toBe('var(--color-accent)')
  })

  it('searches title and meta, case-insensitively', () => {
    expect(view(pickerSections(goals, tasks, null, 'tasks', 'TOMORROW', TODAY))).toEqual([['Upcoming', ['Landlord | Tomorrow · Home']]])
  })
})

describe('pickerSections — goals', () => {
  it("lists each goal's open steps in its current milestone, marking the next step", () => {
    const sections = pickerSections(goals, tasks, LINE, 'goals', '', TODAY)
    expect(view(sections)).toEqual([
      ['D3', ['Line | 01 First charts · next step', 'Scatter | 01 First charts']],
      ['Spanish', ['Tutor | 01 Talk · next step']],
    ])
    expect(sections[0].items[0]).toMatchObject({ current: true, swatch: 'var(--color-accent)', outlined: false, target: LINE })
    expect(sections[1].items[0].swatch).toBe('var(--color-accent-300)')
  })

  it('ignores surrounding whitespace and returns nothing when nothing matches', () => {
    expect(view(pickerSections(goals, tasks, null, 'goals', '  line ', TODAY))).toEqual([['D3', ['Line | 01 First charts · next step']]])
    expect(pickerSections(goals, tasks, null, 'goals', 'zzz', TODAY)).toEqual([])
  })
})
