<script setup lang="ts">
import { Check } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import type { HabitView } from '../../core/habits'
import { popClass } from '../anim'

const props = withDefaults(defineProps<{ view: HabitView; compact?: boolean }>(), { compact: false })
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const STATE_WORDS = { done: 'counted', not: 'not yet', future: 'still to come' } as const

const pct = computed(() => `${Math.min(100, Math.round((props.view.todayMin / props.view.minutes) * 100))}%`)
/** The check pops when today's target is reached while you're looking, not when the page opens on a done day. */
const pops = ref(0)
watch(() => props.view.todayDone, (now, was) => { if (now && !was) pops.value++ })
</script>

<template>
  <div class="habit-line" :class="{ 'is-done': view.todayDone, 'is-compact': compact }">
    <div class="hl-progress">
      <span class="hl-today">{{ view.todayText }}</span>
      <Check v-if="view.todayDone" class="hl-check" :class="pops ? popClass(pops) : ''" :size="14" :stroke-width="3" aria-hidden="true" />
      <span class="hl-bar" aria-hidden="true"><span class="hl-fill" :style="{ width: pct }"></span></span>
    </div>
    <div class="hl-days" role="list" aria-label="This week">
      <span
        v-for="(d, i) in view.days"
        :key="d.date"
        role="listitem"
        class="hl-day"
        :class="`is-${d.state}`"
        :aria-label="`${DAY_NAMES[i]}: ${STATE_WORDS[d.state]}`"
        :title="`${DAY_NAMES[i]}: ${STATE_WORDS[d.state]}`"
      >{{ d.label }}</span>
    </div>
    <span class="hl-week">{{ view.daysText }} · {{ view.streakText }}</span>
  </div>
</template>

<style scoped>
.habit-line { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-4); font-size: 12px; }
.hl-progress { display: grid; grid-template-columns: auto auto; justify-content: start; align-items: center; gap: 3px 6px; min-width: 120px; }
.hl-today { font-weight: 700; }
.hl-check { color: var(--color-text); }
.hl-bar { grid-column: 1 / -1; display: block; height: 3px; background: var(--color-neutral-300); }
.hl-fill { display: block; height: 100%; background: var(--color-accent); }
.is-done .hl-fill { background: var(--color-text); }
.hl-days { display: flex; gap: 3px; }
.hl-day {
  width: 16px; height: 16px; display: grid; place-items: center;
  font-size: 9px; font-weight: 700; line-height: 1; border: 1px solid var(--color-text);
}
.hl-day.is-done { background: var(--color-text); color: var(--color-bg); }
.hl-day.is-not { color: var(--color-neutral-700); }
.hl-day.is-future { border-style: dotted; border-color: var(--color-neutral-500); color: var(--color-neutral-500); }
.hl-week { color: var(--color-neutral-700); }
.is-compact .hl-progress { min-width: 0; }
</style>
