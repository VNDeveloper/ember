<script setup lang="ts">
import { Plus } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import type { Goal } from '../../core/model'
import { goalResources, liveResources } from '../../core/resources'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import ResourceAdd from '../resources/ResourceAdd.vue'

const props = defineProps<{ goal: Goal }>()
const ember = useEmberStore()
const ui = useUiStore()
const adding = ref(false)

const using = computed(() => goalResources(ember.resources, props.goal.id))
const all = computed(() => liveResources(ember.resources).filter((r) => r.goalId === props.goal.id).length)
</script>

<template>
  <div class="goal-resources">
    <div class="gr-strip">
      <span class="section-label">Using</span>
      <span v-for="r in using" :key="r.id" class="gr-item">
        <a class="gr-link" :href="r.url" target="_blank" rel="noopener noreferrer">{{ r.title }}</a><span class="gr-co">{{ r.company }}</span>
      </span>
      <span v-if="!using.length" class="gr-none">No resources yet</span>
      <span class="gr-end">
        <button v-if="all" class="btn btn-ghost gr-all" @click="ui.openResources(goal.id, 'all')">All {{ all }}</button>
        <button
          class="icon-btn gr-add"
          :class="{ 'is-on': adding }"
          :aria-expanded="adding"
          :aria-label="`Add a resource to ${goal.title}`"
          :title="`Add a resource to ${goal.title}`"
          @click="adding = !adding"
        >
          <Plus :size="14" :stroke-width="2.5" />
        </button>
      </span>
    </div>
    <ResourceAdd v-if="adding" class="gr-adder" :goal-id="goal.id" />
  </div>
</template>

<style scoped>
.goal-resources { display: flex; flex-direction: column; gap: var(--space-2); margin-top: calc(-1 * var(--space-6)); }
.gr-strip {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px 20px;
  padding: 10px var(--space-3); border: 2px solid var(--color-divider); border-top: 0;
}
.gr-item { display: inline-flex; align-items: baseline; gap: 6px; min-width: 0; }
.gr-link { font-size: 14px; font-weight: 700; color: var(--color-text); text-decoration: none; overflow-wrap: anywhere; }
.gr-link:hover { color: var(--color-accent-700); text-decoration: underline; }
.gr-co { font-size: 11px; color: var(--color-neutral-700); }
.gr-none { font-size: 13px; color: var(--color-neutral-700); }
.gr-end { margin-left: auto; display: inline-flex; align-items: center; gap: var(--space-2); }
.gr-all { font-size: 12px; font-weight: 400; color: var(--color-neutral-700); }
.gr-adder { padding-top: var(--space-2); }
</style>
