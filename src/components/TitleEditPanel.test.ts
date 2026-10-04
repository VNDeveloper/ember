import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useUiStore } from '../stores/ui'
import TitleEditPanel from './TitleEditPanel.vue'

beforeEach(() => setActivePinia(createPinia()))

describe('TitleEditPanel', () => {
  it('saves a trimmed title on Enter, refuses empty, and passes Delete up', async () => {
    const w = mount(TitleEditPanel, { props: { what: 'milestone', title: 'Capstone' }, attachTo: document.body })
    expect(w.find('.edit-panel').attributes('aria-label')).toBe('Edit milestone “Capstone”')
    expect(document.activeElement).toBe(w.find('.ep-title').element)
    await w.find('.ep-title').setValue('  ')
    expect(w.find('.ep-save').attributes('disabled')).toBeDefined()
    await w.find('.ep-title').setValue(' Final project ')
    await w.find('.ep-title').trigger('keydown', { key: 'Enter' })
    expect(w.emitted('save')?.[0]).toEqual(['Final project'])
    await w.find('.ep-delete').trigger('click')
    expect(w.emitted('delete')).toHaveLength(1)
    useUiStore().editing = 'ms:x'
    await w.find('.ep-cancel').trigger('click')
    expect(useUiStore().editing).toBeNull()
    w.unmount()
  })
})
