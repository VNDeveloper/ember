import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { dataFixture, goalFixture, stepRef } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import StepEditPanel from './StepEditPanel.vue'

const LINE = stepRef('D3', 'M', 'Line')

function setup(estMin = 50) {
  setActivePinia(createPinia())
  localStorage.clear()
  const ember = useEmberStore()
  ember.replaceData(dataFixture({ goals: [goalFixture('D3', [['M', [['Line', null]]]])] }))
  ember.updateStep(LINE, { estMin })
  const ui = useUiStore()
  ui.startEdit(`step:${LINE.stepId}`)
  const w = mount(StepEditPanel, { props: { target: LINE, title: 'Line', estMin }, attachTo: document.body })
  return { w, ember, ui }
}

describe('StepEditPanel', () => {
  it('steps the estimate in 25-minute units within 25m–10h and saves', async () => {
    const { w, ember, ui } = setup()
    expect(w.find('.ep-est').text()).toBe('50m')
    await w.find('.ep-more').trigger('click')
    await w.find('.ep-more').trigger('click')
    expect(w.find('.ep-est').text()).toBe('1h 40m')
    await w.find('.ep-title').setValue('Line chart')
    await w.find('.ep-save').trigger('click')
    expect(ember.goals[0].milestones[0].steps[0]).toMatchObject({ title: 'Line chart', estMin: 100 })
    expect(ui.editing).toBeNull()
    w.unmount()
  })

  it('disables the stepper at the ends', async () => {
    const low = setup(25)
    expect(low.w.find('.ep-less').attributes('disabled')).toBeDefined()
    low.w.unmount()
    const high = setup(600)
    expect(high.w.find('.ep-more').attributes('disabled')).toBeDefined()
    high.w.unmount()
  })
})
