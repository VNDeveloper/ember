import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dataFixture, goalFixture, resourceFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import ResourcesView from './ResourcesView.vue'

const resources = [
  resourceFixture('Coursera Plus', { company: 'Coursera', type: 'membership', billing: 'month', price: 49, renewsOn: '2026-10-15', createdAt: '2026-09-02' }),
  resourceFixture('InfoVis', { company: 'Coursera', goalId: 'D3', notes: 'Week 3 of 5', url: 'https://coursera.org/learn/infovis' }),
  resourceFixture('LLM Course', { company: 'Hugging Face' }),
  resourceFixture('Masterclass', { company: 'Udemy', billing: 'once', price: 12.99, status: 'dropped', goalId: 'D3' }),
]

function setup() {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  ember.replaceData(dataFixture({ goals: [goalFixture('D3', [])], resources: structuredClone(resources) }))
  return { w: mount(ResourcesView, { attachTo: document.body }), ember, ui: useUiStore() }
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

describe('Resources ledger', () => {
  it('groups in-use resources by company with subtotals', () => {
    const { w } = setup()
    expect(w.findAll('.rl-company').map((c) => c.text())).toEqual(['Coursera', 'Hugging Face'])
    expect(w.findAll('.rl-sub')[0].text()).toBe('2 resources · £49 a month')
    const rows = w.findAll('.rr')
    expect(rows.map((r) => r.find('.rr-title').text())).toEqual(['Coursera Plus', 'InfoVis', 'LLM Course'])
    expect(rows[1].find('.rr-title').attributes()).toMatchObject({ href: 'https://coursera.org/learn/infovis', target: '_blank', rel: 'noopener noreferrer' })
    expect(rows[1].find('.rr-type').text()).toBe('Course')
    expect(rows[1].find('.rr-goal').text()).toBe('D3')
    expect(rows[1].find('.rr-notes').text()).toBe('Week 3 of 5')
    expect(rows[0].find('.rr-goal').exists()).toBe(false)
    expect(rows[1].find('.rr-price').text()).toBe('In Coursera Plus')
    expect(rows[0].find('.rr-price').text()).toBe('£49 / month')
    expect(rows[0].find('.rr-renew').text()).toBe('Renews Oct 15 · in 3 days')
    expect(rows[0].find('.rr-renew').classes()).toContain('is-soon')
  })

  it('filters by status (with counts) and by goal', async () => {
    const { w, ui } = setup()
    expect(w.findAll('.rf-status .seg-opt').map((o) => o.text())).toEqual(['Using 3', 'Later 0', 'Finished 0', 'Dropped 1', 'All 4'])
    await w.findAll('.rf-status input')[3].setValue()
    expect(ui.resourceStatus).toBe('dropped')
    expect(w.findAll('.rr-title').map((t) => t.text())).toEqual(['Masterclass'])
    await w.findAll('.rf-status input')[4].setValue()
    expect(w.findAll('.rr-status').map((t) => t.text())).toEqual(['Using', 'Using', 'Using', 'Dropped'])
    await w.find('.rf-goal').setValue('D3')
    expect(w.findAll('.rr-title').map((t) => t.text())).toEqual(['InfoVis', 'Masterclass'])
    expect(w.findAll('.rf-goal option').map((o) => o.text())).toEqual(['All goals', 'D3', 'No goal'])
  })

  it('says so when a filter matches nothing', async () => {
    const { w } = setup()
    await w.findAll('.rf-status input')[1].setValue()
    expect(w.find('.rl-empty').text()).toBe('Nothing here.')
  })

  it('deletes from the row menu with undo', async () => {
    const { w, ember, ui } = setup()
    await w.findAll('.rr')[2].find('.rmn-trigger').trigger('click')
    await w.find('.rmn-delete').trigger('click')
    expect(ember.resources[2].deletedOn).toBe('2026-10-12')
    expect(ui.undo?.record.label).toBe('Deleted “LLM Course”')
  })

  it('marks the highlighted row', async () => {
    const { w, ui } = setup()
    ui.highlight = 'LLM Course'
    await w.vm.$nextTick()
    expect(w.findAll('.rr')[2].classes()).toContain('is-highlight')
  })
})
