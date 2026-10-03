import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dataFixture, goalFixture, taskFixture } from '../core/test-fixtures'
import { useEmberStore } from '../stores/ember'
import { useUiStore } from '../stores/ui'
import FocusPicker from './FocusPicker.vue'

function setup() {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  ember.replaceData(dataFixture({
    goals: [goalFixture('D3', [['First charts', [['Line', null], ['Scatter', null]]]])],
    tasks: [taskFixture('Review PR'), taskFixture('Landlord', { date: '2026-09-24', tag: 'Home' }), taskFixture('Sourdough', { date: null })],
    selection: { kind: 'task', taskId: 'Review PR' },
  }))
  const ui = useUiStore()
  ui.openPicker(ember.selection)
  const w = mount(FocusPicker, { global: { stubs: { teleport: true } } })
  return { w, ember, ui }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('FocusPicker', () => {
  it('lists task sections with counts and marks the current item', () => {
    const { w } = setup()
    expect(w.findAll('.picker-section').map((s) => s.text())).toEqual(['Today1', 'Upcoming1', 'Someday1'])
    const first = w.findAll('.picker-row')[0]
    expect(first.text()).toContain('Review PR')
    expect(first.text()).toContain('Current')
    expect(w.find('.picker-input').attributes('placeholder')).toBe('Search tasks')
  })

  it('switches to goal steps', async () => {
    const { w, ui } = setup()
    ui.pickerTab = 'goals'
    await w.vm.$nextTick()
    expect(w.find('.picker-input').attributes('placeholder')).toBe('Search goal steps')
    expect(w.findAll('.picker-title').map((t) => t.text())).toEqual(['Line', 'Scatter'])
    expect(w.findAll('.picker-meta')[0].text()).toBe('01 First charts · next step')
  })

  it('filters as you type and picks the first match on Enter', async () => {
    const { w, ember, ui } = setup()
    await w.find('.picker-input').setValue('land')
    expect(w.findAll('.picker-title').map((t) => t.text())).toEqual(['Landlord'])
    await w.find('.picker-input').trigger('keydown', { key: 'Enter' })
    expect(ember.selection).toEqual({ kind: 'task', taskId: 'Landlord' })
    expect(ui.pickerOpen).toBe(false)
  })

  it('does nothing on Enter when nothing matches', async () => {
    const { w, ember, ui } = setup()
    await w.find('.picker-input').setValue('zzz')
    expect(w.find('.picker-empty').text()).toBe('Nothing matches “zzz”.')
    await w.find('.picker-input').trigger('keydown', { key: 'Enter' })
    expect(ember.selection).toEqual({ kind: 'task', taskId: 'Review PR' })
    expect(ui.pickerOpen).toBe(true)
  })

  it('picks a clicked row', async () => {
    const { w, ember, ui } = setup()
    await w.findAll('.picker-row')[2].trigger('click')
    expect(ember.selection).toEqual({ kind: 'task', taskId: 'Sourdough' })
    expect(ui.pickerOpen).toBe(false)
  })

  it('closes on a backdrop click but not on a click inside the dialog', async () => {
    const { w, ui } = setup()
    await w.find('.picker-head').trigger('click')
    expect(ui.pickerOpen).toBe(true)
    await w.find('.picker-backdrop').trigger('click')
    expect(ui.pickerOpen).toBe(false)
  })
})
