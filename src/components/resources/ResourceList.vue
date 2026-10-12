<script setup lang="ts">
import { computed } from 'vue'
import { resourceList } from '../../core/resources'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import ResourceRow from './ResourceRow.vue'

const ember = useEmberStore()
const ui = useUiStore()
const groups = computed(() => resourceList(ember.resources, ember.goals, { status: ui.resourceStatus, goal: ui.resourceGoal }, ember.today))
</script>

<template>
  <div class="resource-list">
    <p v-if="!groups.length" class="muted rl-empty">Nothing here.</p>
    <section v-for="g in groups" :key="g.company" class="rl-group" :aria-label="g.company">
      <div class="rl-head">
        <h3 class="rl-company">{{ g.company }}</h3>
        <span class="rl-sub tabular">{{ g.sub }}</span>
      </div>
      <div class="rl-rows">
        <ResourceRow v-for="row in g.rows" :key="row.resource.id" :row="row" :show-status="ui.resourceStatus === 'all'" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.resource-list { display: flex; flex-direction: column; border-top: 2px solid var(--color-divider); }
.rl-empty { padding: var(--space-4) 0; }
.rl-group { display: flex; flex-wrap: wrap; border-bottom: 2px solid var(--color-divider); }
.rl-head { flex: 1 1 180px; max-width: 220px; display: flex; flex-direction: column; gap: 2px; padding: 10px var(--space-4) 6px 0; }
.rl-company { font: 800 14px/1.3 var(--font-heading); letter-spacing: 0; overflow-wrap: anywhere; }
.rl-sub { font-size: 11px; color: var(--color-neutral-700); }
.rl-rows { flex: 999 1 480px; min-width: 0; }
@media (max-width: 720px) {
  .rl-head { max-width: none; flex-direction: row; justify-content: space-between; align-items: baseline; padding-bottom: 0; }
}
</style>
