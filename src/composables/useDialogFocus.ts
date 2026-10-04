import { onBeforeUnmount, onMounted, type Ref } from 'vue'

const FOCUSABLE = 'input:not([type=radio]), input[type=radio]:checked, button, select, textarea'

/**
 * Modal dialog focus: focus `initial` on open, give focus back to the opener on close,
 * and keep Tab / Shift+Tab cycling inside `container`.
 */
export function useDialogFocus(container: Ref<HTMLElement | null>, initial: Ref<HTMLElement | null>) {
  let returnTo: HTMLElement | null = null

  onMounted(() => {
    const active = document.activeElement
    returnTo = active instanceof HTMLElement && active !== document.body ? active : null
    initial.value?.focus()
  })
  onBeforeUnmount(() => {
    if (returnTo?.isConnected) returnTo.focus()
  })

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Tab' || !container.value) return
    const nodes = [...container.value.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => !n.hasAttribute('disabled'))
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    if (!first || !last) return
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return { onKeydown }
}
