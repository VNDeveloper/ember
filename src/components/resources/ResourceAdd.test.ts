import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Resource } from '../../core/model'
import { dataFixture, goalFixture, resourceFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import ResourceAdd from './ResourceAdd.vue'

function setup(resources: Resource[] = [], props: { goalId?: string | null } = {}) {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  ember.replaceData(dataFixture({ goals: [goalFixture('D3', [])], resources }))
  return { w: mount(ResourceAdd, { props, attachTo: document.body }), ember, ui: useUiStore() }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
  localStorage.clear()
})
afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('ResourceAdd', () => {
  it('adds a pasted link at once and shows the just-added card with the title focused', async () => {
    const { w, ember } = setup([], { goalId: 'D3' })
    await w.find('.ra-input').setValue('https://huggingface.co/learn/llm-course')
    await w.find('.ra-form').trigger('submit')
    await flushPromises()
    expect(ember.resources).toHaveLength(1)
    expect(ember.resources[0].goalId).toBe('D3')
    expect((w.find('.ra-input').element as HTMLInputElement).value).toBe('')
    expect(w.find('.ra-added').text()).toBe('Added huggingface.co/learn/llm-course')
    expect(document.activeElement).toBe(w.find('.ra-title').element)
    expect(w.findAll('.ra-chip').map((c) => c.text())).toEqual(['Hugging Face', 'Course', 'Using', 'D3', 'Free'])
  })

  it('renames from the card, and Done closes it', async () => {
    const { w, ember } = setup()
    await w.find('.ra-input').setValue('https://huggingface.co/learn/llm-course')
    await w.find('.ra-form').trigger('submit')
    await w.find('.ra-title').setValue('LLM Course')
    expect(ember.resources[0].title).toBe('LLM Course')
    await w.find('.ra-done').trigger('click')
    expect(w.find('.ra-card').exists()).toBe(false)
  })

  it('lets you clear the title and type a new one, falling back to the link only when left blank', async () => {
    const { w, ember } = setup()
    await w.find('.ra-input').setValue('https://huggingface.co/learn/llm-course')
    await w.find('.ra-form').trigger('submit')
    await w.find('.ra-title').setValue('')
    expect((w.find('.ra-title').element as HTMLInputElement).value).toBe('')
    await w.find('.ra-title').setValue('My title')
    expect(ember.resources[0].title).toBe('My title')
    await w.find('.ra-title').setValue('')
    await w.find('.ra-done').trigger('click')
    expect(ember.resources[0].title).toBe('huggingface.co/learn/llm-course')
  })

  it('Undo on the card deletes it with the usual undo bar', async () => {
    const { w, ember, ui } = setup()
    await w.find('.ra-input').setValue('example.com/a')
    await w.find('.ra-form').trigger('submit')
    await w.find('.ra-undo').trigger('click')
    expect(ember.resources[0].deletedOn).toBe('2026-10-12')
    expect(ui.undo?.record.label).toBe('Deleted “A”')
    expect(w.find('.ra-card').exists()).toBe(false)
  })

  it('a chip opens the full edit panel on the Resources tab', async () => {
    const { w, ember, ui } = setup()
    await w.find('.ra-input').setValue('example.com/a')
    await w.find('.ra-form').trigger('submit')
    await w.findAll('.ra-chip')[1].trigger('click')
    const id = ember.resources[0].id
    expect(ui).toMatchObject({ view: 'resources', editing: `resource:${id}`, highlight: id, resourceGoal: 'all', resourceStatus: 'using' })
  })

  it('says when the text is not a link', async () => {
    const { w, ember } = setup()
    await w.find('.ra-input').setValue('hello there')
    await w.find('.ra-form').trigger('submit')
    expect(w.find('.ra-error').text()).toBe('That doesn’t look like a link.')
    expect(ember.resources).toHaveLength(0)
    await w.find('.ra-input').setValue('hello there!')
    expect(w.find('.ra-error').exists()).toBe(false)
  })

  it('spots a saved link while typing, disables Add and offers to show it', async () => {
    const { w, ui } = setup([resourceFixture('Joins', { url: 'https://youtube.com/watch?v=dQw4w9WgXcQ', company: 'YouTube' })])
    await w.find('.ra-input').setValue('https://youtu.be/dQw4w9WgXcQ')
    expect(w.find('.ra-dup').text()).toBe('Already saved: Joins · YouTube · Using. Show it')
    expect(w.find('.ra-submit').attributes('disabled')).toBeDefined()
    await w.find('.ra-show').trigger('click')
    expect(ui).toMatchObject({ view: 'resources', highlight: 'Joins', resourceStatus: 'all', resourceGoal: 'all' })
  })
})
