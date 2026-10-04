<script setup lang="ts">
import { computed } from 'vue'
import { goalTasks } from '../../core/goalView'
import type { Goal } from '../../core/model'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import TaskRow from '../TaskRow.vue'

const props = defineProps<{ goal: Goal }>()
const ember = useEmberStore()
const ui = useUiStore()

const all = computed(() => goalTasks(ember.tasks, props.goal.id, ember.today))
const showAll = computed(() => !!ui.goalTasksAll[props.goal.id])
const shown = computed(() => (showAll.value ? all.value : all.value.slice(0, 5)))
const toggle = () => { ui.goalTasksAll[props.goal.id] = !showAll.value }
</script>

<template>
  <section v-if="all.length" class="goal-tasks">
    <span class="kicker">Tasks for this goal</span>
    <div class="gt-rows">
      <TaskRow v-for="t in shown" :key="t.id" :task="t" variant="goal" show-date />
    </div>
    <button v-if="all.length > 5" class="btn btn-ghost gt-more" @click="toggle">
      {{ showAll ? 'Show fewer' : `Show all ${all.length}` }}
    </button>
  </section>
</template>

<style scoped>
.goal-tasks { display: flex; flex-direction: column; gap: var(--space-2); }
.gt-rows { display: flex; flex-direction: column; border-top: 2px solid var(--color-divider); }
.gt-more { align-self: flex-start; padding-left: 0; }
</style>
