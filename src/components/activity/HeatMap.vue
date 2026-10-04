<script setup lang="ts">
import { computed } from 'vue'
import { LEVEL_COLORS, doneByDay } from '../../core/activity'
import { focusByDay, heatMap } from '../../core/activityView'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'

const ember = useEmberStore()
const ui = useUiStore()

const focus = computed(() => focusByDay(ember.logs))
const counts = computed(() => doneByDay(ember.goals, ember.tasks))
const hm = computed(() => heatMap(ui.heatMode, focus.value, counts.value, ember.today))
const columns = computed(() => ({ gridTemplateColumns: `28px repeat(${hm.value.columns}, minmax(0, 1fr))` }))
</script>

<template>
  <section class="heat">
    <div class="hm-head">
      <div>
        <span class="kicker hm-kicker">{{ hm.kicker }}</span>
        <h2 class="hm-title">{{ hm.title }}</h2>
      </div>
      <div class="seg" role="radiogroup" aria-label="Heat map shows">
        <label class="seg-opt"><input v-model="ui.heatMode" type="radio" name="ember-heat" value="focus" />Focus time</label>
        <label class="seg-opt"><input v-model="ui.heatMode" type="radio" name="ember-heat" value="done" />Things done</label>
      </div>
    </div>

    <div class="hm-wrap">
      <div class="hm-months" :style="columns" aria-hidden="true">
        <span v-for="m in hm.months" :key="m.label" :style="{ gridColumn: `${m.col} / span 4` }">{{ m.label }}</span>
      </div>
      <div class="hm-grid" :style="columns">
        <span></span><span class="hm-day">Mon</span><span></span><span class="hm-day">Wed</span><span></span><span class="hm-day">Fri</span><span></span>
        <div
          v-for="(c, i) in hm.cells"
          :key="c.date ?? `blank-${i}`"
          class="hm-cell"
          :class="{ 'is-today': c.isToday, 'is-future': c.future && ember.settings.showFuture }"
          :style="{ background: c.color }"
          :title="c.tip || undefined"
        ></div>
      </div>
      <div class="hm-legend">Less<i v-for="c in LEVEL_COLORS" :key="c" :style="{ background: c }"></i>{{ hm.legendMore }}</div>
    </div>

    <div class="hm-stats">
      <div v-for="s in hm.stats" :key="s.label" class="hm-stat">
        <div class="label">{{ s.label }}</div>
        <div class="hm-stat-value">{{ s.value }}</div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.heat { display: flex; flex-direction: column; gap: var(--space-4); }
.hm-head { display: flex; justify-content: space-between; align-items: flex-end; gap: var(--space-4); flex-wrap: wrap; }
.hm-title { margin-top: 4px; }
.hm-wrap { max-width: 1100px; display: flex; flex-direction: column; gap: 6px; }
.hm-months { display: grid; gap: 3px; height: 12px; }
.hm-months span {
  grid-row: 1; overflow: hidden; white-space: nowrap;
  font-size: 10px; line-height: 12px; letter-spacing: .06em; text-transform: uppercase; color: var(--color-neutral-700);
}
.hm-grid { display: grid; grid-template-rows: repeat(7, auto); grid-auto-flow: column; gap: 3px; }
.hm-day { align-self: center; font-size: 9px; line-height: 1; color: var(--color-neutral-700); }
.hm-cell { aspect-ratio: 1; }
.hm-cell.is-today { box-shadow: 0 0 0 2px var(--color-text); }
.hm-cell.is-future { box-shadow: inset 0 0 0 1px var(--color-neutral-300); }
.hm-legend { display: flex; align-items: center; gap: 4px; margin-left: 31px; font-size: 11px; color: var(--color-neutral-700); }
.hm-legend i { width: 12px; height: 12px; }
.hm-legend i:first-of-type { margin-left: 4px; }
.hm-legend i:last-of-type { margin-right: 4px; }
.hm-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-top: 2px solid var(--color-divider); }
.hm-stat { padding: var(--space-3) var(--space-3) 0; border-left: 2px solid var(--color-divider); }
.hm-stat:first-child { padding-left: 0; border-left: 0; }
.hm-stat-value { font: 800 32px/1.1 var(--font-heading); }
@media (max-width: 560px) {
  .hm-months, .hm-grid { gap: 1px; }
  .hm-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .hm-stat:nth-child(3) { padding-left: 0; border-left: 0; }
  .hm-stat:nth-child(n + 3) { margin-top: var(--space-3); border-top: 2px solid var(--color-divider); }
}
</style>
