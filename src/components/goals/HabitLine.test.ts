import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { HabitView } from '../../core/habits'
import HabitLine from './HabitLine.vue'

const view = (patch: Partial<HabitView> = {}): HabitView => ({
  minutes: 25, daysPerWeek: 3, todayMin: 10, todayDone: false, doneDays: 1, streak: 6, best: 9,
  days: ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, i) => ({ date: `2026-10-${12 + i}`, label, state: i === 0 ? 'done' : i < 3 ? 'not' : 'future' })),
  recent: ['hit', 'current'], todayText: '10 of 25m today', daysText: '1 of 3 days', streakText: '6 weeks', targetText: '25m on 3 days a week',
  ...patch,
})

describe('HabitLine', () => {
  it("shows today's progress, the week's days and the streak", () => {
    const w = mount(HabitLine, { props: { view: view() } })
    expect(w.find('.hl-today').text()).toBe('10 of 25m today')
    expect(w.find('.hl-fill').attributes('style')).toContain('width: 40%')
    expect(w.findAll('.hl-day').map((d) => d.classes().find((c) => c.startsWith('is-')))).toEqual(['is-done', 'is-not', 'is-not', 'is-future', 'is-future', 'is-future', 'is-future'])
    expect(w.findAll('.hl-day')[0].attributes('aria-label')).toBe('Monday: counted')
    expect(w.findAll('.hl-day')[3].attributes('aria-label')).toBe('Thursday: still to come')
    expect(w.find('.hl-week').text()).toBe('1 of 3 days · 6 weeks')
  })

  it('marks today done and pops when the target is reached while watching', async () => {
    const w = mount(HabitLine, { props: { view: view() } })
    expect(w.find('.hl-check').exists()).toBe(false)
    await w.setProps({ view: view({ todayMin: 25, todayDone: true, todayText: '25 of 25m today' }) })
    expect(w.find('.hl-check').exists()).toBe(true)
    expect(w.find('.habit-line').classes()).toContain('is-done')
    expect(w.find('.hl-check').classes().some((c) => c.startsWith('anim-pop'))).toBe(true)
    expect(w.find('.hl-fill').attributes('style')).toContain('width: 100%')
  })
})
