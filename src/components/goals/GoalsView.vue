<script setup lang="ts">
import { computed } from 'vue'
import { isActiveGoal, isLive } from '../../core/goals'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import GoalList from './GoalList.vue'
import GoalSummary from './GoalSummary.vue'
import GoalTasks from './GoalTasks.vue'
import Roadmap from './Roadmap.vue'
import ImportPanel from '../ImportPanel.vue'

const ember = useEmberStore()
const ui = useUiStore()
const goal = computed(() =>
  ember.goals.find((g) => g.id === ui.activeGoalId && isLive(g)) ?? ember.goals.find(isActiveGoal) ?? ember.goals.find(isLive) ?? null,
)
</script>

<template>
  <div class="view goals-view">
    <GoalList :active-id="goal?.id ?? null" />
    <main class="gv-main" :class="{ 'gv-empty': !goal }">
      <ImportPanel v-if="ui.editing === 'import:goal'" kind="goal" @close="ui.editing = null" />
      <template v-if="goal">
        <GoalSummary :goal="goal" />
        <GoalTasks :goal="goal" />
        <Roadmap :goal="goal" />
      </template>
      <p v-else class="muted">No goals yet. Add one on the left.</p>
    </main>
  </div>
</template>

<style scoped>
.goals-view { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 0; padding: 0; }
.gv-main { min-width: 0; display: flex; flex-direction: column; gap: var(--space-6); padding: var(--space-6); }
@media (max-width: 860px) {
  .goals-view { grid-template-columns: minmax(0, 1fr); }
  .gv-main { padding: var(--space-4); }
}
</style>
