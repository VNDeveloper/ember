<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import FocusBar from './components/FocusBar.vue'
import FocusPicker from './components/FocusPicker.vue'
import NavBar from './components/NavBar.vue'
import { useTicker } from './composables/useTicker'
import { useEmberStore } from './stores/ember'
import { useUiStore, type View } from './stores/ui'

const ember = useEmberStore()
const ui = useUiStore()

useTicker(() => ember.tick())

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && ui.escape()) e.preventDefault()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

const VIEW_NAMES: Record<View, string> = { today: 'Today', goals: 'Goals', activity: 'Activity' }
</script>

<template>
  <div class="app">
    <NavBar />
    <FocusBar />
    <!-- Phases 3–5 replace this placeholder with TodayView / GoalsView / ActivityView. -->
    <main class="view">
      <span class="kicker">{{ VIEW_NAMES[ui.view] }}</span>
      <p class="muted">This view arrives in a later phase.</p>
    </main>
    <FocusPicker v-if="ui.pickerOpen" />
  </div>
</template>

<style scoped>
.app { min-height: 100vh; display: flex; flex-direction: column; background: var(--color-bg); color: var(--color-text); }
.view {
  flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--space-2);
  padding: var(--space-6); border-top: 2px solid var(--color-divider);
}
@media (max-width: 520px) { .view { padding: var(--space-4); } }
</style>
