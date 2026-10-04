import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { useDialogFocus } from './useDialogFocus'

const Dialog = defineComponent({
  setup() {
    const box = ref<HTMLElement | null>(null)
    const first = ref<HTMLElement | null>(null)
    const { onKeydown } = useDialogFocus(box, first)
    return () => h('div', { ref: box, class: 'box', onKeydown }, [
      h('input', { ref: first, class: 'first' }),
      h('button', { class: 'mid' }, 'Mid'),
      h('button', { class: 'off', disabled: true }, 'Off'),
      h('button', { class: 'last' }, 'Last'),
    ])
  },
})

describe('useDialogFocus', () => {
  it('focuses the initial element and gives focus back on close', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const w = mount(Dialog, { attachTo: document.body })
    expect(document.activeElement).toBe(w.find('.first').element)
    w.unmount()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it('keeps Tab inside, skipping disabled buttons', async () => {
    const w = mount(Dialog, { attachTo: document.body })
    ;(w.find('.last').element as HTMLElement).focus()
    await w.find('.box').trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(w.find('.first').element)
    await w.find('.box').trigger('keydown', { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(w.find('.last').element)
    w.unmount()
  })
})
