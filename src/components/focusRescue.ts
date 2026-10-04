import { nextTick } from 'vue'

/** First focus target walking from `start`: a task or step row's checkbox (or a wrapper's), or a button. */
function nearest(start: Element | null, step: (el: Element) => Element | null): HTMLElement | null {
  for (let el = start; el; el = step(el)) {
    const row = el.matches('.task-row, .step-row') ? el : el.querySelector(':scope > .task-row, :scope > .step-row')
    if (row) return row.querySelector<HTMLElement>('.check')
    if (el instanceof HTMLButtonElement) return el
  }
  return null
}

/**
 * Runs an action that may remove `row` (complete, move to another day). If the clicked control
 * had keyboard focus and disappears, focus moves to the next row (or the previous one) instead
 * of falling back to <body>.
 */
export async function withFocusRescue(row: HTMLElement | null, e: Event, action: () => void): Promise<void> {
  const control = e.currentTarget as HTMLElement | null
  const hadFocus = !!control && document.activeElement === control
  const candidates = [
    nearest(row?.nextElementSibling ?? null, (el) => el.nextElementSibling),
    nearest(row?.previousElementSibling ?? null, (el) => el.previousElementSibling),
  ]
  action()
  if (!hadFocus) return
  await nextTick()
  if (control!.isConnected) return
  candidates.find((c) => c?.isConnected)?.focus()
}
