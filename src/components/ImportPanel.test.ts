import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { ImportKind } from '../core/importPlan'
import { dataFixture, goalFixture } from '../core/test-fixtures'
import { useEmberStore } from '../stores/ember'
import { useUiStore } from '../stores/ui'
import ImportPanel from './ImportPanel.vue'

let writeText: ReturnType<typeof vi.fn>

function setup(kind: ImportKind) {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  ember.replaceData(dataFixture({ goals: [goalFixture('D3', [['First charts', [['Bar', null]]]])] }))
  const w = mount(ImportPanel, { props: { kind, goal: kind === 'next' ? ember.goals[0] : null }, attachTo: document.body })
  return { w, ember, ui: useUiStore() }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
  writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})
afterEach(() => vi.useRealTimers())

describe('ImportPanel', () => {
  it('copies the prompt and says so for a moment', async () => {
    const { w } = setup('goal')
    await w.find('.ip-copy').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^My goal: /))
    expect(w.find('.ip-copy').text()).toBe('Copied')
    vi.advanceTimersByTime(2000)
    await nextTick()
    expect(w.find('.ip-copy').text()).toBe('Copy prompt')
  })

  it('shows the prompt to copy by hand when the clipboard refuses', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    const { w } = setup('tasks')
    await w.find('.ip-copy').trigger('click')
    await flushPromises()
    const box = w.find<HTMLTextAreaElement>('.copy-box textarea')
    expect(box.element.value).toMatch(/^What I need to do: /)
    expect(document.activeElement).toBe(box.element)
  })

  it('previews a pasted goal, lets you untick a step, and creates it', async () => {
    const { w, ember, ui } = setup('goal')
    await w.find('.ip-paste').setValue('Sure!\n# Goal: Spanish\n## Basics\n- Alphabet (45m)\n- Greetings')
    expect(w.find('.ipv-summary').text()).toBe('1 milestone · 2 steps · ~1h 35m')
    await w.findAll('.ipv-step input')[1].setValue(false)
    expect(w.find('.ipv-summary').text()).toBe('1 milestone · 1 step · ~45m')
    await w.find('.ip-create').trigger('click')
    const g = ember.goals.find((x) => x.title === 'Spanish')!
    expect(g.milestones[0].steps.map((s) => s.title)).toEqual(['Alphabet'])
    expect(ui.activeGoalId).toBe(g.id)
    expect(ui.undo?.record.label).toBe('Imported “Spanish”')
    expect(w.emitted('close')).toHaveLength(1)
  })

  it('refuses a paste of the other kind, an unreadable one, and a goal without a title', async () => {
    const { w } = setup('tasks')
    await w.find('.ip-paste').setValue('# Goal: Spanish\n## Basics')
    expect(w.find('.ipv-empty').text()).toBe('This looks like a goal — use Import a goal on the Goals page.')
    expect(w.find('.ip-create').attributes('disabled')).toBeDefined()
    await w.find('.ip-paste').setValue('hello')
    expect(w.find('.ipv-empty').text()).toBe('Nothing Ember can read yet — check it has ‘- ’ bullets.')
    const g = setup('goal').w
    await g.find('.ip-paste').setValue('# Tasks\n- a')
    expect(g.find('.ipv-empty').text()).toBe('This looks like a task list — use Paste tasks on Today.')
    await g.find('.ip-paste').setValue('## Basics\n- a')
    expect(g.find('.ipv-empty').text()).toBe('Add a ‘# Goal:’ line with the goal’s name.')
  })

  it('adds only the new steps to a goal, showing what is already there', async () => {
    const { w, ember } = setup('next')
    await w.find('.ip-paste').setValue('## First charts\n- Bar\n- Line (30m)')
    expect(w.find('.ipv-step.is-there').text()).toContain('Bar')
    expect(w.find('.ipv-step.is-there').text()).toContain('already there')
    expect(w.find('.ipv-step.is-there input').exists()).toBe(false)
    expect(w.find('.ip-create').text()).toBe('Add 1 step')
    await w.find('.ip-create').trigger('click')
    expect(ember.goals[0].milestones[0].steps.map((s) => s.title)).toEqual(['Bar', 'Line'])
  })

  it('adds the ticked tasks and lists what it skipped', async () => {
    const { w, ember, ui } = setup('tasks')
    await w.find('.ip-paste').setValue('- Book lesson | tomorrow | goal: D3\n- Skip this\n- [x] Done already')
    expect(w.findAll('.ipv-task').map((r) => r.find('.ipv-task-title').text())).toEqual(['Book lesson', 'Skip this'])
    expect(w.find('.ipv-task').text()).toContain('Tomorrow')
    expect(w.find('.ipv-skipped').text()).toContain('already done')
    await w.findAll('.ipv-task input')[1].setValue(false)
    expect(w.find('.ip-create').text()).toBe('Add 1 task')
    await w.find('.ip-create').trigger('click')
    expect(ember.tasks.at(-1)).toMatchObject({ title: 'Book lesson', date: '2026-09-24', goalId: 'D3' })
    expect(ui.undo?.record.label).toBe('Added 1 task')
  })

  it('cancel closes without saving', async () => {
    const { w, ember } = setup('goal')
    await w.find('.ip-paste').setValue('# Goal: Spanish\n- a')
    await w.find('.ip-cancel').trigger('click')
    expect(w.emitted('close')).toHaveLength(1)
    expect(ember.goals).toHaveLength(1)
  })

  it('keeps your ticks when data changes underneath (a sync, another tab)', async () => {
    const { w, ember } = setup('tasks')
    await w.find('.ip-paste').setValue('- Call mum\n- Water plants')
    await w.findAll('.ipv-task input')[1].setValue(false)
    ember.addGoal('Arrived from sync')
    await nextTick()
    expect(w.find('.ip-create').text()).toBe('Add 1 task')
  })

  it('reads a task list grouped under day headings', async () => {
    const { w } = setup('tasks')
    await w.find('.ip-paste').setValue('## This week\n- Call mum\n## Later\n- Water plants')
    expect(w.findAll('.ipv-task-title').map((x) => x.text())).toEqual(['Call mum', 'Water plants'])
  })

  it('uses square tick boxes, not the browser default', async () => {
    const { w } = setup('goal')
    await w.find('.ip-paste').setValue('# Goal: G\n## M\n- a')
    const boxes = w.findAll('.import-preview input[type="checkbox"]')
    expect(boxes.length).toBe(2)
    expect(boxes.every((b) => b.classes().includes('tick'))).toBe(true)
  })

  it("puts how the goal is going into Add from AI's prompt", async () => {
    const { w } = setup('next')
    await w.find('.ip-copy').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("How it's going:\n- Focused so far: 0m of an estimated 50m."))
  })
})
