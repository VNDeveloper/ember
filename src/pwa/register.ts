import { useRegisterSW } from 'virtual:pwa-register/vue'

/** A waiting new version: the app asks before reloading, so a running timer or Focus mode is never interrupted. */
export function useAppUpdate() {
  const { needRefresh, updateServiceWorker } = useRegisterSW()
  return {
    needRefresh,
    update: () => { void updateServiceWorker(true) },
    dismiss: () => { needRefresh.value = false },
  }
}
