import { onBeforeUnmount, onMounted } from 'vue'

/**
 * Drives the wall clock: ticks on mount, every intervalMs, and as soon as the tab is visible
 * again (background tabs throttle intervals, so a finished session would otherwise show late).
 */
export function useTicker(tick: () => void, intervalMs = 250): void {
  let id: ReturnType<typeof setInterval> | undefined
  const onVisible = () => {
    if (document.visibilityState === 'visible') tick()
  }
  onMounted(() => {
    tick()
    id = setInterval(tick, intervalMs)
    document.addEventListener('visibilitychange', onVisible)
  })
  onBeforeUnmount(() => {
    clearInterval(id)
    document.removeEventListener('visibilitychange', onVisible)
  })
}
