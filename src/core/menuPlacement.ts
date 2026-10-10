export interface TriggerRect { top: number; bottom: number; right: number }
/** CSS for a position: fixed menu: top or bottom, and right, in px from the window edges. */
export type MenuPlacement = { top: number; right: number } | { bottom: number; right: number }

const GAP = 4
const EDGE = 8

/** Below the trigger with right edges aligned; above it when it would run off the bottom and fits there. */
export function placeMenu(t: TriggerRect, menuHeight: number, viewport: { width: number; height: number }): MenuPlacement {
  const right = Math.max(EDGE, viewport.width - t.right)
  const fitsBelow = t.bottom + GAP + menuHeight <= viewport.height - EDGE
  const fitsAbove = t.top - GAP - menuHeight >= EDGE
  if (!fitsBelow && fitsAbove) return { bottom: viewport.height - t.top + GAP, right }
  return { top: t.bottom + GAP, right }
}
