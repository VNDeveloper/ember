import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useUiStore } from '../stores/ui'
import RowMenu from './RowMenu.vue'

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => vi.restoreAllMocks())
const mountMenu = () => mount(RowMenu, { props: { menuKey: 'task:a', label: 'Review PR' }, attachTo: document.body })

describe('RowMenu', () => {
  it('opens a menu with Edit and Delete, focusing Edit', async () => {
    const w = mountMenu()
    const trigger = w.find('.rmn-trigger')
    expect(trigger.attributes('aria-label')).toBe('More actions for “Review PR”')
    expect(trigger.attributes('aria-haspopup')).toBe('menu')
    await trigger.trigger('click')
    expect(trigger.attributes('aria-expanded')).toBe('true')
    await nextTick()
    expect(document.activeElement).toBe(w.find('.rmn-edit').element)
    expect(w.find('.rmn-delete').attributes('aria-label')).toBe('Delete “Review PR”')
    w.unmount()
  })

  it('Edit opens the panel; Delete emits and closes', async () => {
    const w = mountMenu()
    const ui = useUiStore()
    await w.find('.rmn-trigger').trigger('click')
    await w.find('.rmn-edit').trigger('click')
    expect(ui.editing).toBe('task:a')
    expect(ui.menuFor).toBeNull()
    await w.find('.rmn-trigger').trigger('click')
    await w.find('.rmn-delete').trigger('click')
    expect(w.emitted('delete')).toHaveLength(1)
    expect(ui.menuFor).toBeNull()
    w.unmount()
  })

  it('closes on an outside click and gives focus back to the trigger after Esc', async () => {
    const w = mountMenu()
    const ui = useUiStore()
    await w.find('.rmn-trigger').trigger('click')
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await nextTick()
    expect(ui.menuFor).toBeNull()
    await w.find('.rmn-trigger').trigger('click')
    await nextTick()
    ui.escape()
    await nextTick()
    await nextTick()
    expect(document.activeElement).toBe(w.find('.rmn-trigger').element)
    w.unmount()
  })

  it('fixes the menu to the window under the trigger, so a scrolling list never clips it', async () => {
    const w = mountMenu()
    let top = 100
    vi.spyOn(w.find('.rmn-trigger').element, 'getBoundingClientRect').mockImplementation(() => ({ top, bottom: top + 28, right: 1000 }) as DOMRect)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(80)
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1280)
    vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(800)
    await w.find('.rmn-trigger').trigger('click')
    await nextTick()
    const style = () => (w.find('.rmn-menu').element as HTMLElement).style
    expect(style()).toMatchObject({ top: '132px', right: '280px', visibility: '' })
    top = 740
    window.dispatchEvent(new Event('scroll'))
    await nextTick()
    expect(style()).toMatchObject({ top: '', bottom: '64px' })
    w.unmount()
  })

  it('shows extra items between Edit and Delete and reports the one picked', async () => {
    const w = mount(RowMenu, { props: { menuKey: 'goal:g', label: 'G', extra: [{ key: 'pause', label: 'Pause' }] }, attachTo: document.body })
    await w.find('.rmn-trigger').trigger('click')
    expect(w.findAll('[role="menuitem"]').map((b) => b.text())).toEqual(['Edit', 'Pause', 'Delete'])
    await w.find('.rmn-pause').trigger('click')
    expect(w.emitted('select')).toEqual([['pause']])
    expect(useUiStore().menuFor).toBeNull()
    w.unmount()
  })
})
