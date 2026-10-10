import { useRegisterSW } from 'virtual:pwa-register/vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * A waiting new version. Before the page has been used (just opened or refreshed) it is applied at once,
 * so a refresh shows the latest Ember; after that the app asks before reloading, so Focus mode is never interrupted.
 */
export function useAppUpdate() {
  const used = ref(false)
  const applying = ref(false)
  const { needRefresh, updateServiceWorker } = useRegisterSW({
    onNeedRefresh() {
      if (used.value) return
      applying.value = true
      void updateServiceWorker(true)
    },
  })

  const USE = ['pointerdown', 'keydown'] as const
  const markUsed = () => {
    used.value = true
    for (const type of USE) document.removeEventListener(type, markUsed, true)
  }
  onMounted(() => { for (const type of USE) document.addEventListener(type, markUsed, true) })
  onBeforeUnmount(() => { for (const type of USE) document.removeEventListener(type, markUsed, true) })

  return {
    needRefresh: computed({ get: () => needRefresh.value && !applying.value, set: (v) => { needRefresh.value = v } }),
    update: () => { void updateServiceWorker(true) },
    dismiss: () => { needRefresh.value = false },
  }
}
