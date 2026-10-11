<script setup lang="ts">
import { ChevronRight, Plus } from 'lucide-vue-next'
import { computed } from 'vue'
import { goalList, type GoalListGroup } from '../../core/goalView'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'

const props = defineProps<{ activeId: string | null }>()
const ember = useEmberStore()
const ui = useUiStore()
const groups = computed(() => goalList(ember.goals, ember.tally.spent))

/** Achieved starts collapsed, but opens to show the goal you're looking at unless you closed it yourself. */
const ACHIEVED_KEY = 'goals:achieved'
const isOpen = (g: GoalListGroup) =>
  g.status !== 'achieved' || (ui.openGroups[ACHIEVED_KEY] ?? g.items.some((i) => i.id === props.activeId))
const toggle = (g: GoalListGroup) => { ui.openGroups[ACHIEVED_KEY] = !isOpen(g) }

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
      <div v-for="grp in groups" :key="grp.status" class="gl-group" :data-status="grp.status">
        <span v-if="grp.status === 'paused'" class="gl-head section-label">{{ grp.label }}</span>
        <button
          v-else-if="grp.status === 'achieved'"
          class="gl-head gl-toggle section-label"
          :aria-expanded="isOpen(grp)"
          @click="toggle(grp)"
        >
          <ChevronRight :size="12" :stroke-width="3" :class="{ 'is-open': isOpen(grp) }" />{{ grp.label }} · {{ grp.items.length }}
        </button>
        <template v-if="isOpen(grp)">
          <button
            v-for="g in grp.items"
            :key="g.id"
            class="gl-item"
            :class="{ 'is-active': g.id === activeId, 'is-quiet': grp.status !== 'active' }"
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
        </template>
      </div>
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
.gl-group { display: flex; flex-direction: column; }
.gl-head {
  display: flex; align-items: center; gap: 6px; padding: var(--space-3) var(--space-3) var(--space-1);
  border-bottom: 1px solid var(--color-divider); color: var(--color-neutral-700);
}
.gl-toggle { width: 100%; border: 0; border-bottom: 1px solid var(--color-divider); background: transparent; text-align: left; }
.gl-toggle:hover { background: var(--color-accent-100); color: var(--color-text); }
.gl-toggle svg { flex: none; transition: transform .15s; }
.gl-toggle svg.is-open { transform: rotate(90deg); }
/* Paused and achieved goals sit back a step: grey bars, the accent kept for active progress. */
.gl-item.is-quiet .gl-bar span, .gl-item.is-quiet .gl-bar span.is-complete { background: var(--color-neutral-500); }
.gl-new { display: flex; flex-direction: column; gap: var(--space-2); margin-top: auto; }
.gl-new-label { font-size: 12px; font-weight: 700; }
.gl-new-row { display: flex; gap: var(--space-2); }
@media (max-width: 860px) {
  .goal-list { padding: var(--space-4); border-right: 0; border-bottom: 2px solid var(--color-divider); }
}
</style>
