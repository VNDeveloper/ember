import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Resource } from '../../core/model'
import { dataFixture, goalFixture, resourceFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import ResourceEditPanel from './ResourceEditPanel.vue'

function setup(r: Resource, others: Resource[] = []) {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  const achieved = { ...goalFixture('Old', []), status: 'achieved' as const, achievedOn: '2026-10-01' }
  ember.replaceData(dataFixture({ goals: [goalFixture('D3', []), achieved], resources: [r, ...others] }))
  const ui = useUiStore()
  ui.editing = `resource:${r.id}`
  const w = mount(ResourceEditPanel, { props: { resource: ember.resources[0] }, attachTo: document.body })
  return { w, ember, ui }
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

describe('ResourceEditPanel', () => {
  it('saves every field and closes', async () => {
    const { w, ember, ui } = setup(resourceFixture('A'), [resourceFixture('B', { company: 'Coursera' })])
    await w.find('.re-title').setValue('Coursera Plus')
    await w.find('.re-url').setValue('https://www.coursera.org/courseraplus/')
    await w.find('.re-company').setValue('Coursera')
    await w.find('.re-type').setValue('membership')
    await w.find('.re-goal').setValue('D3')
    await w.find('.re-status input[value="later"]').setValue()
    await w.find('.re-billing input[value="month"]').setValue()
    await w.find('.re-price').setValue('49')
    await w.find('.re-renews').setValue('2026-10-15')
    await w.find('.re-notes').setValue('Covers the course')
    await w.find('.re-save').trigger('click')
    expect(ember.resources[0]).toMatchObject({
      title: 'Coursera Plus', url: 'https://coursera.org/courseraplus', company: 'Coursera', type: 'membership', goalId: 'D3',
      status: 'later', billing: 'month', price: 49, renewsOn: '2026-10-15', notes: 'Covers the course',
    })
    expect(ui.editing).toBeNull()
  })

  it('shows price and renewal fields only when they apply', async () => {
    const { w } = setup(resourceFixture('A'))
    expect(w.find('.re-price').exists()).toBe(false)
    await w.find('.re-billing input[value="once"]').setValue()
    expect(w.find('.re-price').exists()).toBe(true)
    expect(w.find('.re-renews').exists()).toBe(false)
    await w.find('.re-billing input[value="year"]').setValue()
    expect(w.find('.re-renews').exists()).toBe(true)
  })

  it('cannot save a paid cost without a positive price', async () => {
    const { w } = setup(resourceFixture('A'))
    await w.find('.re-billing input[value="month"]').setValue()
    expect(w.find('.re-save').attributes('disabled')).toBeDefined()
    await w.find('.re-price').setValue('0')
    expect(w.find('.re-save').attributes('disabled')).toBeDefined()
    await w.find('.re-price').setValue('8')
    expect(w.find('.re-save').attributes('disabled')).toBeUndefined()
  })

  it('explains what a membership does', async () => {
    const { w } = setup(resourceFixture('Coursera Plus', { company: 'Coursera' }))
    expect(w.find('.re-hint').exists()).toBe(false)
    await w.find('.re-type').setValue('membership')
    expect(w.find('.re-hint').text()).toBe('While you’re using it, your other Coursera resources show as “In Coursera Plus”.')
  })

  it('offers active and paused goals, plus an achieved goal already linked', () => {
    expect(setup(resourceFixture('A')).w.findAll('.re-goal option').map((o) => o.text())).toEqual(['No goal', 'D3'])
    expect(setup(resourceFixture('A', { goalId: 'Old' })).w.findAll('.re-goal option').map((o) => o.text())).toEqual(['No goal', 'D3', 'Old'])
  })

  it('suggests companies already used', () => {
    const { w } = setup(resourceFixture('A'), [resourceFixture('B', { company: 'Coursera' }), resourceFixture('C', { company: 'YouTube' })])
    expect(w.findAll('#re-companies option').map((o) => o.attributes('value'))).toEqual(['Coursera', 'Example', 'YouTube'])
  })

  it('cancels without saving, and Delete emits delete', async () => {
    const { w, ember, ui } = setup(resourceFixture('A'))
    await w.find('.re-title').setValue('Changed')
    await w.find('.re-cancel').trigger('click')
    expect(ember.resources[0].title).toBe('A')
    expect(ui.editing).toBeNull()
    await w.find('.re-delete').trigger('click')
    expect(w.emitted('delete')).toHaveLength(1)
  })
})
