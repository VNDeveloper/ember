import { onBeforeUnmount, onMounted, type Ref } from 'vue'

const FOCUSABLE = 'input:not([type=radio]), input[type=radio]:checked, button, select, textarea'

/**
 * Modal dialog focus: focus `initial` on open, give focus back to the opener on close,
 * and keep Tab / Shift+Tab cycling inside `container` — including when the focused control
 * was removed and focus fell back to the page.
 */
export function useDialogFocus(container: Ref<HTMLElement | null>, initial: Ref<HTMLElement | null>) {
  let returnTo: HTMLElement | null = null

  const focusables = () =>
    container.value
      ? [...container.value.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => !n.hasAttribute('disabled'))
      : []

  /** Tab pressed outside the dialog (e.g. focus dropped to <body>): bring it back in. */
  function onDocumentKeydown(e: KeyboardEvent) {
    if (e.key !== 'Tab' || !container.value) return
    const target = e.target
    if (target instanceof Node && container.value.contains(target)) return
    const otherDialog = target instanceof Element ? target.closest('[aria-modal="true"]') : null
    if (otherDialog && otherDialog !== container.value) return
    const nodes = focusables()
    const next = e.shiftKey ? nodes[nodes.length - 1] : nodes[0]
    if (!next) return
    e.preventDefault()
    next.focus()
  }

  onMounted(() => {
    const active = document.activeElement
    returnTo = active instanceof HTMLElement && active !== document.body ? active : null
    initial.value?.focus()
    document.addEventListener('keydown', onDocumentKeydown)
  })
  onBeforeUnmount(() => {
    document.removeEventListener('keydown', onDocumentKeydown)
    if (returnTo?.isConnected) returnTo.focus()
  })

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Tab') return
    const nodes = focusables()
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
