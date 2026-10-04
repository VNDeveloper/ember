<script setup lang="ts">
import { Check, Timer } from 'lucide-vue-next'
import { computed } from 'vue'
import { activityLog } from '../../core/activityView'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'

const ember = useEmberStore()
const ui = useUiStore()
const entries = computed(() => activityLog(ember.goals, ember.tasks, ember.logs, ember.today))
const shown = computed(() => entries.value.slice(0, ui.feedSize))
</script>

<template>
  <section class="log">
    <span class="kicker al-kicker">Activity log</span>
    <div class="al-list">
      <div v-for="e in shown" :key="e.key" class="al-entry">
        <Check v-if="e.kind === 'done'" class="al-icon is-done" :size="16" :stroke-width="3" />
        <Timer v-else class="al-icon" :size="16" :stroke-width="2.25" />
        <div class="al-body">
          <div class="al-text">{{ e.text }}</div>
          <div class="al-meta">
            <span class="al-hash tabular">{{ e.hash }}</span><span>{{ e.src }}</span><span>{{ e.when }}</span>
          </div>
        </div>
      </div>
    </div>
    <button v-if="entries.length > ui.feedSize" class="btn btn-ghost al-more" @click="ui.feedSize += 10">Show earlier</button>
  </section>
</template>

<style scoped>
.log { min-width: 0; display: flex; flex-direction: column; }
.al-kicker { margin-bottom: var(--space-2); }
.al-list { display: flex; flex-direction: column; border-top: 2px solid var(--color-divider); }
.al-entry {
  display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: var(--space-2);
  padding: var(--space-2) 0; border-bottom: 1px solid var(--color-divider);
}
.al-icon { margin-top: 2px; }
.al-icon.is-done { color: var(--color-accent); }
.al-text { font-size: 13px; line-height: 1.35; overflow-wrap: anywhere; }
.al-meta { display: flex; flex-wrap: wrap; gap: 0 8px; margin-top: 2px; font-size: 11px; color: var(--color-neutral-700); }
.al-hash { font-weight: 700; }
.al-more { align-self: flex-start; padding-left: 0; }
</style>
