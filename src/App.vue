<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import FocusBar from './components/FocusBar.vue'
import FocusPicker from './components/FocusPicker.vue'
import NavBar from './components/NavBar.vue'
import TodayView from './components/today/TodayView.vue'
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
    <TodayView v-if="ui.view === 'today'" />
    <!-- Phases 4–5 replace this placeholder with GoalsView / ActivityView. -->
    <main v-else class="view">
      <span class="kicker">{{ VIEW_NAMES[ui.view] }}</span>
      <p class="muted">This view arrives in a later phase.</p>
    </main>
    <FocusPicker v-if="ui.pickerOpen" />
  </div>
</template>

<style scoped>
.app { min-height: 100vh; display: flex; flex-direction: column; background: var(--color-bg); color: var(--color-text); }
</style>
