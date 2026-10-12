<script setup lang="ts">
import { computed } from 'vue'
import { STATUS_LABEL, goalFilterOptions, statusCounts, type StatusFilter } from '../../core/resources'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'

const ember = useEmberStore()
const ui = useUiStore()
const ORDER: StatusFilter[] = ['using', 'later', 'finished', 'dropped', 'all']
const counts = computed(() => statusCounts(ember.resources, ui.resourceGoal, ember.goals))
const label = (s: StatusFilter) => (s === 'all' ? 'All' : STATUS_LABEL[s])
const goals = computed(() => goalFilterOptions(ember.resources, ember.goals))
</script>

<template>
  <div class="resource-filters">
    <div class="seg rf-status" role="radiogroup" aria-label="Status">
      <label v-for="s in ORDER" :key="s" class="seg-opt">
        <input v-model="ui.resourceStatus" type="radio" name="ember-resource-status" :value="s" />{{ label(s) }} <span class="rf-count tabular">{{ counts[s] }}</span>
      </label>
    </div>
    <label class="rf-goal-label">Goal
      <select v-model="ui.resourceGoal" class="input input-sm rf-goal">
        <option v-for="o in goals" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
    </label>
  </div>
</template>

<style scoped>
.resource-filters { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3) var(--space-4); }
.rf-status { flex-wrap: wrap; max-width: 100%; }
.rf-count { opacity: .7; }
.rf-goal-label { display: inline-flex; align-items: center; gap: var(--space-2); font-size: 13px; }
@media (max-width: 520px) {
  .rf-status { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); width: 100%; }
  .rf-status .seg-opt { flex-direction: column; justify-content: center; gap: 0; min-height: 44px; padding: 4px 2px; font-size: 12px; text-align: center; }
  .rf-status .seg-opt + .seg-opt { border-left: 1px solid var(--color-divider); }
}
</style>
