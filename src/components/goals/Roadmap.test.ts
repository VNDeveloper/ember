import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { Goal } from '../../core/model'
import { d3Fixture, dataFixture, goalFixture, stepRef } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import Roadmap from './Roadmap.vue'

function setup(goal?: Goal) {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  const d3 = d3Fixture()
  ember.replaceData(dataFixture({ goals: [goal ?? d3.goal], logs: d3.logs }))
  return { w: mount(Roadmap, { props: { goal: ember.goals[0] }, attachTo: document.body }), ember, ui: useUiStore() }
}
const blocks = (row: ReturnType<ReturnType<typeof mount>['find']>) =>
  row.findAll('.blk').map((b) => b.classes().find((c) => c.startsWith('is-')))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('Roadmap', () => {
  it('shows the legend and milestone markers by state', () => {
    const { w } = setup()
    expect(w.find('.rm-legend').text()).toBe('Earlier sessionsTodayEstimate remaining1 block = 25 min')
    const markers = w.findAll('.rm-marker')
    expect(markers[0].classes()).toContain('is-complete')
    expect(markers[0].find('svg').exists()).toBe(true)
    expect(markers[1].classes()).toContain('is-current')
    expect(markers[1].text()).toBe('02')
    expect(markers[2].classes()).not.toContain('is-current')
    expect(markers[2].text()).toBe('03')
    w.unmount()
  })

  it('shows milestone headers with "You are here", ledger and count', () => {
    const { w } = setup()
    const heads = w.findAll('.rm-head')
    expect(heads.map((h) => h.find('.rm-title').text())).toEqual(['Foundations', 'First charts', 'Motion'])
    expect(heads[1].text()).toContain('You are here')
    expect(heads[1].find('.rm-ledger').text()).toBe('2h 5m of est. 2h 30m')
    expect(heads[1].find('.rm-count').text()).toBe('1 / 3')
    expect(w.findAll('.rm-ms')[1].findAll('.rm-segs span').map((s) => s.classes().includes('is-done'))).toEqual([true, false, false])
    w.unmount()
  })

  it('expands only the current milestone by default and remembers toggles', async () => {
    const { w } = setup()
    expect(w.findAll('.sr-title').map((t) => t.text())).toEqual(['Bar', 'Line', 'Scatter'])
    const heads = w.findAll('.rm-head')
    expect(heads[1].attributes('aria-expanded')).toBe('true')
    await heads[1].trigger('click')
    expect(w.findAll('.sr-title')).toHaveLength(0)
    await heads[0].trigger('click')
    expect(w.findAll('.sr-title').map((t) => t.text())).toEqual(['SVG'])
    w.unmount()
  })

  it('draws session blocks, ledgers and notes on step rows', () => {
    const { w } = setup()
    const [bar, line, scatter] = w.findAll('.step-row')
    expect(blocks(bar)).toEqual(['is-earlier', 'is-earlier', 'is-earlier'])
    expect(bar.find('.sr-ledger').text()).toBe('1h 15m / 50m+25m over')
    expect(bar.find('.sr-note').classes()).toContain('is-accent')
    expect(blocks(line)).toEqual(['is-earlier', 'is-today'])
    expect(blocks(scatter)).toEqual(['is-remaining', 'is-remaining'])
    expect(bar.classes()).toContain('is-done')
    expect(bar.find('.sr-focus').classes()).toContain('is-hidden')
    w.unmount()
  })

  it('completes and selects steps', async () => {
    const { w, ember } = setup()
    const line = () => w.findAll('.step-row')[1]
    await line().find('.sr-focus').trigger('click')
    expect(ember.selection).toEqual(stepRef('D3', 'First charts', 'Line'))
    expect(line().classes()).toContain('is-selected')
    await line().find('.check').trigger('click')
    expect(ember.goals[0].milestones[1].steps[1].doneOn).toBe('2026-09-23')
    expect(ember.selection).toEqual(stepRef('D3', 'First charts', 'Scatter'))
    w.unmount()
  })

  it('adds steps with Enter, keeps the input open, and closes it with Esc', async () => {
    const { w, ember } = setup()
    await w.find('.rm-add-step').trigger('click')
    const input = w.find('.rm-step-input')
    expect(document.activeElement).toBe(input.element)
    await input.setValue('Small multiples')
    await input.trigger('keydown', { key: 'Enter' })
    expect(ember.goals[0].milestones[1].steps.at(-1)).toMatchObject({ title: 'Small multiples', estMin: 50, doneOn: null })
    expect((w.find('.rm-step-input').element as HTMLInputElement).value).toBe('')
    await w.find('.rm-step-input').trigger('keydown', { key: 'Escape' })
    expect(w.find('.rm-step-input').exists()).toBe(false)
    w.unmount()
  })

  it('ignores empty step names', async () => {
    const { w, ember } = setup()
    await w.find('.rm-add-step').trigger('click')
    await w.find('.rm-step-input').trigger('keydown', { key: 'Enter' })
    expect(ember.goals[0].milestones[1].steps).toHaveLength(3)
    expect(w.find('.rm-step-input').exists()).toBe(true)
    w.unmount()
  })

  it('adds a milestone', async () => {
    const { w, ember } = setup()
    await w.find('.rm-add-ms').trigger('click')
    await w.find('.rm-ms-input').setValue('Capstone')
    await w.find('.rm-ms-input').trigger('keydown', { key: 'Enter' })
    expect(ember.goals[0].milestones.at(-1)?.title).toBe('Capstone')
    w.unmount()
  })

  it('shows the outcome on the finish line, and marks it reached when every milestone is done', async () => {
    const { w, ember } = setup()
    expect(w.find('.rm-finish-title').text()).toBe('Finish line')
    expect(w.find('.rm-finish-outcome').text()).toBe('Describe what done looks like above.')
    ember.setOutcome('D3', 'Publish a chart')
    await nextTick()
    expect(w.find('.rm-finish-outcome').text()).toBe('Publish a chart')
    w.unmount()

    const done = setup(goalFixture('Done', [['M', [['A', '2026-09-01']]]]))
    expect(done.w.find('.rm-flag').classes()).toContain('is-reached')
    expect(done.w.find('.rm-finish-title').text()).toBe('Finish line — reached')
    done.w.unmount()
  })

  it('opens the add-step input of a brand-new goal straight away', async () => {
    const fresh = goalFixture('New', [['Getting started', []]])
    setActivePinia(createPinia())
    const ember = useEmberStore()
    ember.replaceData(dataFixture({ goals: [fresh] }))
    useUiStore().adding = { kind: 'step', msId: 'New/Getting started' }
    const w = mount(Roadmap, { props: { goal: ember.goals[0] }, attachTo: document.body })
    expect(w.find('.rm-head').text()).toContain('You are here')
    expect(document.activeElement).toBe(w.find('.rm-step-input').element)
    w.unmount()
  })

  it('keeps the add-step input and its text when the window loses focus', async () => {
    const { w, ui } = setup()
    await w.find('.rm-add-step').trigger('click')
    await w.find('.rm-step-input').setValue('Read chapter 4')
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    await w.find('.rm-step-input').trigger('blur')
    expect(w.find('.rm-step-input').exists()).toBe(true)
    expect(ui.draft).toBe('Read chapter 4')
    hasFocus.mockReturnValue(true)
    await w.find('.rm-step-input').trigger('blur')
    expect(w.find('.rm-step-input').exists()).toBe(false)
    hasFocus.mockRestore()
    w.unmount()
  })

  it('pops the step checkbox and retriggers on the next completion', async () => {
    const { w, ui } = setup()
    ui.expanded['D3/First charts'] = true // finishing the milestone would otherwise fold it away
    const row = (i: number) => w.findAll('.step-row')[i]
    await row(1).find('.check').trigger('click')
    expect(row(1).find('.check').classes()).toContain('anim-pop1')
    await row(2).find('.check').trigger('click')
    expect(row(2).find('.check').classes()).toContain('anim-pop0')
    w.unmount()
  })

  it('pops the newest session block when a session finishes', async () => {
    const { w, ember } = setup()
    ember.select(stepRef('D3', 'First charts', 'Line'))
    ember.startPause()
    ember.tick(new Date(2026, 8, 23, 10, 25).getTime())
    await nextTick()
    const lineBlocks = w.findAll('.step-row')[1].findAll('.blk')
    expect(lineBlocks).toHaveLength(3)
    expect(lineBlocks[2].classes()).toContain('anim-pop1')
    expect(lineBlocks[1].classes().some((c) => c.startsWith('anim-pop'))).toBe(false)
    w.unmount()
  })

  it('returns focus to the Add step button on Esc, and labels checkboxes with their milestone', async () => {
    const { w } = setup()
    const add = w.find('.rm-add-step')
    await add.trigger('click')
    await w.find('.rm-step-input').trigger('keydown', { key: 'Escape' })
    await nextTick()
    expect(document.activeElement).toBe(w.find('.rm-add-step').element)
    expect(w.findAll('.step-row')[1].find('.check').attributes('aria-label')).toBe('Line, First charts')
    w.unmount()
  })
  it('edits a step estimate and the blocks follow', async () => {
    const { w, ember } = setup()
    const row = () => w.findAll('.step-item')[2]
    await row().find('.rmn-trigger').trigger('click')
    await row().find('.rmn-edit').trigger('click')
    await nextTick()
    await w.find('.ep-more').trigger('click')
    await w.find('.ep-save').trigger('click')
    expect(ember.goals[0].milestones[1].steps[2].estMin).toBe(75)
    expect(row().findAll('.blk')).toHaveLength(3)
    w.unmount()
  })

  it('deletes a step and a milestone with undo labels', async () => {
    const { w, ember, ui } = setup()
    await w.findAll('.step-item')[2].find('.rmn-trigger').trigger('click')
    await w.findAll('.step-item')[2].find('.rmn-delete').trigger('click')
    expect(ui.undo?.record.label).toBe('Deleted “Scatter”')
    expect(w.findAll('.sr-title').map((t) => t.text())).toEqual(['Bar', 'Line'])
    const head = w.findAll('.rm-head-row')[2]
    await head.find('.rmn-trigger').trigger('click')
    await head.find('.rmn-delete').trigger('click')
    expect(ui.undo?.record.label).toBe('Deleted milestone “Motion” and 1 step')
    expect(w.findAll('.rm-title').map((t) => t.text())).toEqual(['Foundations', 'First charts'])
    ember.undoDelete(ui.undo!.record)
    await nextTick()
    expect(w.findAll('.rm-title')).toHaveLength(3)
    w.unmount()
  })

  it('renames a milestone', async () => {
    const { w, ember } = setup()
    const head = w.findAll('.rm-head-row')[0]
    await head.find('.rmn-trigger').trigger('click')
    await head.find('.rmn-edit').trigger('click')
    await nextTick()
    await w.find('.ep-title').setValue('Basics')
    await w.find('.ep-save').trigger('click')
    expect(ember.goals[0].milestones[0].title).toBe('Basics')
    w.unmount()
  })

  describe('finish line', () => {
    const finished = (status?: 'achieved') => ({
      ...goalFixture('Run', [['Base', [['5k', '2026-09-01']]], ['Race', [['10k', '2026-09-20']]]]),
      ...(status ? { status, achievedOn: '2026-09-21' } : {}),
    })

    it('asks whether the goal is achieved once every step is done', async () => {
      const { w, ember } = setup(finished())
      expect(w.find('.rm-finish-ask span').text()).toBe('Every step is done. Is the goal achieved?')
      expect(w.find('.rm-achieve').text()).toBe('Mark achieved')
      expect(w.find('.rm-more').text()).toBe('Add a milestone')
      await w.find('.rm-achieve').trigger('click')
      expect(ember.goals[0]).toMatchObject({ status: 'achieved', achievedOn: '2026-09-23' })
      expect(w.find('.rm-finish-ask').exists()).toBe(false)
      w.unmount()
    })

    it('opens the milestone input from Add a milestone', async () => {
      const { w, ui } = setup(finished())
      await w.find('.rm-more').trigger('click')
      expect(ui.adding).toEqual({ kind: 'milestone' })
      expect(w.find('.rm-ms-input').exists()).toBe(true)
      w.unmount()
    })

    it('does not ask while steps are open or once achieved', () => {
      const open = setup()
      expect(open.w.find('.rm-finish-ask').exists()).toBe(false)
      open.w.unmount()
      const done = setup(finished('achieved'))
      expect(done.w.find('.rm-finish-ask').exists()).toBe(false)
      done.w.unmount()
    })
  })

  it('shows and sets a rough estimate on a milestone without steps', async () => {
    const { w, ember } = setup(goalFixture('D3', [['Planned', [['A', null]]], ['Later', []]]))
    const later = () => w.findAll('.rm-ms')[1]
    expect(later().find('.rm-ledger').text()).toBe('~50m guess')
    await later().find('.rm-est-set').trigger('click')
    await later().find('.rm-est-input').setValue('2')
    await later().find('.rm-est-save').trigger('click')
    expect(ember.goals[0].milestones[1].estMin).toBe(120)
    expect(later().find('.rm-ledger').text()).toBe('~2h')
    await later().find('.rm-est-set').trigger('click')
    await later().find('.rm-est-clear').trigger('click')
    expect(ember.goals[0].milestones[1]).not.toHaveProperty('estMin')
  })
})
