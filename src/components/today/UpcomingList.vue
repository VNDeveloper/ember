<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next'
import { computed } from 'vue'
import { upcomingGroups, upcomingSummary, type UpcomingGroup } from '../../core/today'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import TaskRow from '../TaskRow.vue'

const ember = useEmberStore()
const ui = useUiStore()

const groups = computed(() => upcomingGroups(ember.tasks, ember.today))
const summary = computed(() => upcomingSummary(ember.tasks, ember.today))
const isOpen = (g: UpcomingGroup) => !g.collapsible || !!ui.openGroups[g.key]
const toggle = (g: UpcomingGroup) => { ui.openGroups[g.key] = !ui.openGroups[g.key] }
</script>

<template>
  <section class="upcoming">
    <div class="up-head">
      <h4>Upcoming</h4>
      <span class="up-summary">{{ summary }}</span>
    </div>
    <div class="up-scroll">
      <template v-for="g in groups" :key="g.key">
        <div v-if="!g.collapsible" class="up-group section-label">
          <span class="up-label">{{ g.label }}</span><span class="up-right">{{ g.right }}</span>
        </div>
        <button v-else class="up-group up-toggle section-label" :aria-expanded="isOpen(g)" @click="toggle(g)">
          <ChevronRight :size="12" :stroke-width="3" :class="{ 'is-open': isOpen(g) }" />
          <span class="up-label">{{ g.label }}</span><span class="up-right">{{ g.right }}</span>
        </button>
        <template v-if="isOpen(g)">
          <TaskRow v-for="it in g.items" :key="it.task.id" :task="it.task" variant="upcoming" :show-date="it.showDate" />
        </template>
      </template>
      <p v-if="!groups.length" class="up-empty">Nothing planned. Pick a date or Someday when you add a task.</p>
    </div>
  </section>
</template>

<style scoped>
.upcoming { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
.up-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; }
.up-summary { font-size: 13px; color: var(--color-neutral-700); }
.up-scroll {
  display: flex; flex-direction: column; border-top: 2px solid var(--color-divider);
  max-height: min(640px, 72vh); overflow-y: auto;
}
.up-group {
  position: sticky; top: 0; z-index: 1; display: flex; align-items: center; justify-content: space-between;
  gap: var(--space-2); padding: var(--space-3) var(--space-2) var(--space-1);
  background: var(--color-bg); border-bottom: 1px solid var(--color-divider);
}
.up-right { font-weight: 400; color: var(--color-neutral-700); }
.up-toggle { width: 100%; justify-content: flex-start; border: 0; border-bottom: 1px solid var(--color-divider); color: var(--color-text); text-align: left; }
.up-toggle:hover { background: var(--color-accent-100); }
.up-toggle .up-right { margin-left: auto; letter-spacing: 0; text-transform: none; }
.up-toggle svg { flex: none; transition: transform .15s; }
.up-toggle svg.is-open { transform: rotate(90deg); }
.up-empty { padding: var(--space-3) 0; font-size: 13px; color: var(--color-neutral-700); }
</style>
