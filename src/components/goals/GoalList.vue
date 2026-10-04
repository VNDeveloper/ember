<script setup lang="ts">
import { Plus } from 'lucide-vue-next'
import { computed } from 'vue'
import { goalList } from '../../core/goalView'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'

defineProps<{ activeId: string | null }>()
const ember = useEmberStore()
const ui = useUiStore()
const items = computed(() => goalList(ember.goals, ember.tally.spent))

function add() {
  const goal = ember.addGoal(ui.goalDraft)
  if (!goal) return
  ui.goalDraft = ''
  ui.selectGoal(goal.id)
  ui.adding = { kind: 'step', msId: goal.milestones[0].id }
}

function onEnter(e: KeyboardEvent) {
  if (!e.isComposing) add()
}
</script>

<template>
  <aside class="goal-list">
    <span class="kicker">Goals</span>
    <div class="gl-items">
      <button
        v-for="g in items"
        :key="g.id"
        class="gl-item"
        :class="{ 'is-active': g.id === activeId }"
        :aria-current="g.id === activeId ? 'true' : undefined"
        @click="ui.selectGoal(g.id)"
      >
        <span class="gl-top">
          <span class="gl-name"><span class="swatch" :style="{ background: g.swatch }"></span>{{ g.title }}</span>
          <span class="gl-pct">{{ g.pct }}%</span>
        </span>
        <span class="gl-bar"><span :class="{ 'is-complete': g.complete }" :style="{ width: `${g.pct}%` }"></span></span>
        <span class="gl-meta">{{ g.meta }}</span>
      </button>
    </div>
    <div class="gl-new">
      <label class="gl-new-label" for="ember-new-goal">New goal</label>
      <div class="gl-new-row">
        <input id="ember-new-goal" v-model="ui.goalDraft" class="input gl-input" placeholder="e.g. Learn Three.js" @keydown.enter="onEnter" />
        <button class="btn btn-primary btn-icon gl-add" aria-label="Add goal" @click="add"><Plus :size="16" :stroke-width="2.5" /></button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.goal-list {
  display: flex; flex-direction: column; gap: var(--space-4);
  padding: var(--space-6); border-right: 2px solid var(--color-divider);
}
.gl-items { display: flex; flex-direction: column; border-top: 2px solid var(--color-divider); }
.gl-item {
  display: flex; flex-direction: column; align-items: stretch; gap: 8px; padding: var(--space-3);
  border: 0; border-bottom: 1px solid var(--color-divider); background: transparent; color: var(--color-text); text-align: left;
}
.gl-item:hover, .gl-item.is-active { background: var(--color-accent-100); }
.gl-top { display: flex; justify-content: space-between; gap: 8px; }
.gl-name { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 14px; font-weight: 700; }
.gl-pct { font-size: 13px; font-weight: 700; }
.gl-bar { display: block; height: 4px; background: var(--color-neutral-300); }
.gl-bar span { display: block; height: 100%; background: var(--color-text); }
.gl-bar span.is-complete { background: var(--color-accent); }
.gl-meta { font-size: 12px; color: var(--color-neutral-700); }
.gl-new { display: flex; flex-direction: column; gap: var(--space-2); margin-top: auto; }
.gl-new-label { font-size: 12px; font-weight: 700; }
.gl-new-row { display: flex; gap: var(--space-2); }
@media (max-width: 860px) {
  .goal-list { padding: var(--space-4); border-right: 0; border-bottom: 2px solid var(--color-divider); }
}
</style>
