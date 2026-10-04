<script setup lang="ts">
import { ArrowRight, Timer } from 'lucide-vue-next'
import { computed } from 'vue'
import { workingOn } from '../../core/today'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'

const ember = useEmberStore()
const ui = useUiStore()
const cards = computed(() => workingOn(ember.goals, ember.selection))
</script>

<template>
  <section class="working-on">
    <div class="wo-head">
      <span class="kicker">Working on</span>
      <button class="btn btn-ghost wo-all" @click="ui.view = 'goals'">All goals<ArrowRight :size="14" :stroke-width="2.5" /></button>
    </div>
    <div v-if="cards.length" class="wo-grid">
      <div v-for="c in cards" :key="c.goalId" class="wo-card" :class="{ 'is-selected': c.selected }" @click="ember.select(c.target)">
        <button class="wo-goal" title="Open goal" @click.stop="ui.openGoal(c.goalId)">
          <span class="swatch" :style="{ background: c.swatch }"></span>
          <span class="wo-goal-title">{{ c.title }}</span>
          <span class="wo-pct">{{ c.pct }}%</span>
        </button>
        <div class="wo-ms">
          <span class="label">{{ c.milestoneLabel }}</span>
          <span class="wo-ms-title">{{ c.milestoneTitle }}</span>
        </div>
        <div class="wo-segs"><span v-for="(isDone, i) in c.segments" :key="i" :class="{ 'is-done': isDone }"></span></div>
        <div class="wo-next">
          <div class="wo-next-text">
            <span class="wo-next-label">Next step</span>
            <span class="wo-next-title">{{ c.nextTitle }}</span>
          </div>
          <button
            class="icon-btn wo-focus"
            :class="{ 'is-on': c.selected }"
            aria-label="Focus on this step"
            title="Focus on this step"
            @click.stop="ember.select(c.target)"
          >
            <Timer :size="16" :stroke-width="2.25" />
          </button>
        </div>
      </div>
    </div>
    <p v-else class="muted wo-empty">No goal has an open step. Add steps on the Goals tab.</p>
  </section>
</template>

<style scoped>
.working-on { display: flex; flex-direction: column; gap: var(--space-3); }
.wo-head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-4); }
.wo-all { padding: 2px 4px; font-size: 13px; }
/* Cards wrap on narrow screens; 2px rules between them are drawn as hard-edged box-shadows and clipped at the edges. */
.wo-grid {
  display: flex; flex-wrap: wrap; overflow: hidden;
  border-top: 2px solid var(--color-text); border-bottom: 2px solid var(--color-divider);
}
.wo-card {
  flex: 1 1 220px; min-width: 0; display: flex; flex-direction: column; gap: var(--space-2);
  padding: var(--space-3) var(--space-4) var(--space-4);
  box-shadow: -2px 0 0 var(--color-divider), 0 -2px 0 var(--color-divider);
  cursor: pointer; transition: background .2s;
}
.wo-card.is-selected { background: var(--color-accent-100); }
.wo-goal {
  display: flex; align-items: flex-start; gap: 8px; padding: 0; border: 0; background: none;
  font-size: 14px; font-weight: 700; line-height: 1.3; color: var(--color-text); text-align: left;
}
.wo-goal:hover { color: var(--color-accent); }
.wo-goal .swatch { margin-top: 4px; }
.wo-goal-title { flex: 1; min-width: 0; }
.wo-pct { font-size: 13px; }
.wo-ms { display: flex; flex-direction: column; gap: 2px; }
.wo-ms-title { font: 800 18px/1.2 var(--font-heading); }
.wo-segs { display: flex; gap: 3px; }
.wo-segs span { flex: 1; height: 6px; background: var(--color-neutral-300); }
.wo-segs span.is-done { background: var(--color-accent); }
.wo-next { display: flex; align-items: center; gap: var(--space-2); margin-top: auto; }
.wo-next-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.wo-next-label { font-size: 11px; color: var(--color-neutral-700); }
.wo-next-title { font-size: 14px; }
</style>
