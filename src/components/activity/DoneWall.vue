<script setup lang="ts">
import { computed } from 'vue'
import { doneWall, type Brick } from '../../core/activityView'
import { useEmberStore } from '../../stores/ember'

const ember = useEmberStore()
const wall = computed(() => doneWall(ember.goals, ember.tasks, ember.today, ember.settings.wallWeeks))
const brickStyle = (b: Brick) => (b.kind === 'step' ? { background: b.color } : { boxShadow: `inset 0 0 0 2px ${b.color}` })
</script>

<template>
  <section class="wall">
    <div>
      <span class="kicker dw-kicker">Done wall · last {{ wall.weeks }} weeks</span>
      <h3 class="dw-title">{{ wall.headline }}</h3>
    </div>
    <div class="dw-legend">
      <span v-for="l in wall.legend" :key="l.name"><i :style="{ background: l.color }"></i>{{ l.name }}</span>
      <span><i class="is-task"></i>Tasks</span>
    </div>
    <div class="dw-chart" :style="{ height: `${wall.height}px` }">
      <div v-for="c in wall.columns" :key="c.monday" class="dw-col" :class="{ 'is-current': c.current }">
        <div
          v-for="(b, i) in c.bricks"
          :key="i"
          class="dw-brick"
          :class="`is-${b.kind}`"
          :style="brickStyle(b)"
          :title="b.tip"
        ></div>
      </div>
    </div>
    <div class="dw-labels">
      <span v-for="c in wall.columns" :key="c.monday" :class="{ 'is-current': c.current }">{{ c.label }}</span>
    </div>
    <div class="dw-stats">
      <div v-for="s in wall.stats" :key="s.label" class="dw-stat">
        <div class="label">{{ s.label }}</div>
        <div class="dw-stat-value" :class="{ 'is-accent': s.accent }">{{ s.value }}</div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.wall { min-width: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.dw-title { margin-top: 4px; }
.dw-legend { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-4); margin-top: var(--space-2); font-size: 12px; color: var(--color-neutral-700); }
.dw-legend span { display: flex; align-items: center; gap: 6px; }
.dw-legend i { width: 12px; height: 12px; }
.dw-legend i.is-task { box-shadow: inset 0 0 0 2px var(--color-text); }
.dw-chart {
  display: flex; align-items: flex-end; gap: 6px; margin-top: var(--space-3);
  border-bottom: 2px solid var(--color-text);
}
.dw-col { flex: 1 1 0; min-width: 0; height: 100%; display: flex; flex-direction: column-reverse; gap: 3px; }
.dw-col.is-current { background: var(--color-accent-100); }
.dw-brick { flex: none; height: 18px; }
.dw-labels { display: flex; gap: 6px; }
.dw-labels span { flex: 1 1 0; min-width: 0; overflow: hidden; white-space: nowrap; font-size: 11px; color: var(--color-neutral-700); }
.dw-labels span.is-current { color: var(--color-accent-700); }
.dw-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin-top: var(--space-3); border-top: 2px solid var(--color-divider); }
.dw-stat { padding: var(--space-3) var(--space-3) 0; border-left: 2px solid var(--color-divider); }
.dw-stat:first-child { padding-left: 0; border-left: 0; }
.dw-stat-value { font: 800 32px/1.1 var(--font-heading); }
.dw-stat-value.is-accent { color: var(--color-accent-700); }
@media (max-width: 560px) {
  .dw-chart, .dw-labels { gap: 2px; }
  .dw-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dw-stat:nth-child(3) { padding-left: 0; border-left: 0; }
  .dw-stat:nth-child(n + 3) { margin-top: var(--space-3); border-top: 2px solid var(--color-divider); }
}
</style>
