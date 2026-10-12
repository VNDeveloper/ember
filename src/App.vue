<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import ActivityView from './components/activity/ActivityView.vue'
import FocusBar from './components/FocusBar.vue'
import FocusMode from './components/FocusMode.vue'
import FocusPicker from './components/FocusPicker.vue'
import GoalsView from './components/goals/GoalsView.vue'
import NavBar from './components/NavBar.vue'
import ResourcesView from './components/resources/ResourcesView.vue'
import TodayView from './components/today/TodayView.vue'
import UndoBar from './components/UndoBar.vue'
import UpdateBar from './components/UpdateBar.vue'
import { useEndSounds } from './composables/useEndSounds'
import { useTicker } from './composables/useTicker'
import { useEmberStore } from './stores/ember'
import { useSyncStore } from './stores/sync'
import { useUiStore } from './stores/ui'

const ember = useEmberStore()
const ui = useUiStore()
const sync = useSyncStore()

useTicker(() => ember.tick())
useEndSounds()

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && ui.escape()) e.preventDefault()
}
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  sync.start()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  sync.stop()
})
</script>

<template>
  <div class="app">
    <NavBar />
    <FocusBar />
    <TodayView v-if="ui.view === 'today'" />
    <GoalsView v-else-if="ui.view === 'goals'" />
    <ResourcesView v-else-if="ui.view === 'resources'" />
    <ActivityView v-else />
    <UndoBar />
    <UpdateBar />
    <FocusMode v-if="ui.focusModeOpen" />
    <FocusPicker v-if="ui.pickerOpen" />
  </div>
</template>

<style scoped>
.app { min-height: 100vh; display: flex; flex-direction: column; background: var(--color-bg); color: var(--color-text); }
</style>
