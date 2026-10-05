import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const needRefresh = ref(false)
const update = vi.fn()
const dismiss = vi.fn(() => { needRefresh.value = false })
vi.mock('../pwa/register', () => ({ useAppUpdate: () => ({ needRefresh, update, dismiss }) }))

import UpdateBar from './UpdateBar.vue'

describe('UpdateBar', () => {
  it('appears only when a new version is waiting; Reload applies it, × hides it', async () => {
    const w = mount(UpdateBar)
    expect(w.find('.update-bar').exists()).toBe(false)
    expect(w.find('.update-region').attributes('role')).toBe('status')
    needRefresh.value = true
    await w.vm.$nextTick()
    expect(w.find('.ub-text').text()).toBe('A new version of Ember is ready')
    await w.find('.up-reload').trigger('click')
    expect(update).toHaveBeenCalledTimes(1)
    await w.find('.up-close').trigger('click')
    expect(w.find('.update-bar').exists()).toBe(false)
  })
})
