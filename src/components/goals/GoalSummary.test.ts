import { useUiStore } from '../../stores/ui'
import { nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { goalMarkdown } from '../../core/importPlan'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { d3Fixture, dataFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import GoalSummary from './GoalSummary.vue'

function setup() {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  const { goal, logs } = d3Fixture()
  ember.replaceData(dataFixture({ goals: [goal], logs }))
  return { w: mount(GoalSummary, { props: { goal: ember.goals[0] } }), ember }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('GoalSummary', () => {
  it('shows the kicker, title and percentage', () => {
    const { w } = setup()
    expect(w.find('.gs-kicker').text()).toBe('Goal · 2h 5m focused · 1 of 3 milestones')
    expect(w.find('.gs-title').text()).toBe('D3')
    expect(w.find('.gs-pct').text()).toBe('40%')
  })

  it('shows the ledger stats', () => {
    const { w } = setup()
    expect(w.findAll('.gs-stat').map((s) => s.text())).toEqual([
      'Focused2h 5m', 'Estimated4h 10m', 'Left to go1h 40m', 'Estimates—',
    ])
    expect(w.findAll('.gs-stat-value')[0].classes()).toContain('is-accent')
  })

  it('edits the outcome', async () => {
    const { w, ember } = setup()
    await w.find('.gs-outcome').setValue('Ship a chart')
    expect(ember.goals[0].outcome).toBe('Ship a chart')
  })
  it('renames and deletes the goal from its menu', async () => {
    const { w, ember } = setup()
    await w.find('.rmn-trigger').trigger('click')
    await w.find('.rmn-edit').trigger('click')
    await nextTick()
    await w.find('.ep-title').setValue('D3 charts')
    await w.find('.ep-save').trigger('click')
    expect(ember.goals[0].title).toBe('D3 charts')
    await w.find('.rmn-trigger').trigger('click')
    await w.find('.rmn-delete').trigger('click')
    expect(ember.goals[0].deletedOn).toBe('2026-09-23')
    expect(useUiStore().undo?.record.label).toBe('Deleted goal “D3 charts”')
  })

  describe('status', () => {
    const menu = async (w: ReturnType<typeof mount>) => {
      await w.find('.rmn-trigger').trigger('click')
      return w.findAll('[role="menuitem"]').map((b) => b.text())
    }

    it('offers Pause and Mark achieved while active, Resume once paused, Reopen once achieved', async () => {
      const { w, ember } = setup()
      expect(await menu(w)).toEqual(['Edit', 'Pause', 'Mark achieved', 'Copy as markdown', 'Delete'])
      await w.find('.rmn-pause').trigger('click')
      expect(ember.goals[0].status).toBe('paused')
      expect(await menu(w)).toEqual(['Edit', 'Resume', 'Mark achieved', 'Copy as markdown', 'Delete'])
      await w.find('.rmn-resume').trigger('click')
      expect(ember.goals[0]).not.toHaveProperty('status')
      await menu(w)
      await w.find('.rmn-achieve').trigger('click')
      expect(ember.goals[0]).toMatchObject({ status: 'achieved', achievedOn: '2026-09-23' })
      expect(await menu(w)).toEqual(['Edit', 'Reopen', 'Copy as markdown', 'Delete'])
      await w.find('.rmn-reopen').trigger('click')
      expect(ember.goals[0]).not.toHaveProperty('status')
    })

    it('shows the achieved summary and pops its flag when achieved here', async () => {
      const { w, ember } = setup()
      expect(w.find('.gs-achieved').exists()).toBe(false)
      ember.setOutcome('D3', 'Ship a chart')
      ember.setGoalStatus('D3', 'achieved')
      await nextTick()
      expect(w.find('.gs-ach-outcome').text()).toBe('Ship a chart')
      expect(w.find('.gs-ach-span').text()).toBe('Jan 1 → Sep 23 · 265 days')
      expect(w.findAll('.gs-ach-stats > span').map((s) => s.text())).toEqual(['2h 5m focused', '5 sessions', '2 steps', '1 milestone'])
      expect(w.find('.gs-ach-flag').classes().some((c) => c.startsWith('anim-pop'))).toBe(true)
    })

    it('does not pop for a goal that was already achieved', () => {
      setActivePinia(createPinia())
      const ember = useEmberStore()
      const { goal, logs } = d3Fixture()
      ember.replaceData(dataFixture({ goals: [{ ...goal, status: 'achieved', achievedOn: '2026-09-20' }], logs }))
      const w = mount(GoalSummary, { props: { goal: ember.goals[0] } })
      expect(w.find('.gs-ach-outcome').text()).toBe('Goal achieved.')
      expect(w.find('.gs-ach-flag').classes().some((c) => c.startsWith('anim-pop'))).toBe(false)
    })
  })

  it('copies the goal as markdown, or shows it to copy by hand', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const { w, ember } = setup()
    await w.find('.rmn-trigger').trigger('click')
    await w.find('.rmn-copy').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(goalMarkdown(ember.goals[0]))
    expect(w.find('.gs-copied').text()).toBe('Copied')
    writeText.mockRejectedValue(new Error('denied'))
    await w.find('.rmn-trigger').trigger('click')
    await w.find('.rmn-copy').trigger('click')
    await flushPromises()
    expect(w.find<HTMLTextAreaElement>('.copy-box textarea').element.value).toBe(goalMarkdown(ember.goals[0]))
  })
})
