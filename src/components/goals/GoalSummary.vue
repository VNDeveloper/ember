<script setup lang="ts">
import { computed } from 'vue'
import { goalKicker, goalLedger } from '../../core/goalView'
import { goalStats } from '../../core/goals'
import type { Goal } from '../../core/model'
import { useEmberStore } from '../../stores/ember'

const props = defineProps<{ goal: Goal }>()
const ember = useEmberStore()

const kicker = computed(() => goalKicker(props.goal, ember.tally.spent))
const pct = computed(() => goalStats(props.goal).pct)
const ledger = computed(() => goalLedger(props.goal, ember.tally.spent))
const stats = computed(() => [
  { label: 'Focused', value: ledger.value.focused, accent: true },
  { label: 'Estimated', value: ledger.value.estimated, accent: false },
  { label: 'Left to go', value: ledger.value.left, accent: false },
  { label: 'Accuracy', value: ledger.value.accuracy, accent: false },
])

const onOutcome = (e: Event) => ember.setOutcome(props.goal.id, (e.target as HTMLTextAreaElement).value)
</script>

<template>
  <div class="goal-summary">
    <div class="gs-head">
      <div>
        <span class="kicker gs-kicker">{{ kicker }}</span>
        <h2 class="gs-title">{{ goal.title }}</h2>
      </div>
      <div class="gs-pct">{{ pct }}%</div>
    </div>
    <div class="gs-readme">
      <div class="gs-readme-bar section-label">
        <span>Readme · what done looks like</span><span class="gs-hint">Click to edit</span>
      </div>
      <textarea
        class="gs-outcome"
        rows="2"
        :value="goal.outcome"
        placeholder="Describe the finish line — what will you be able to do?"
        aria-label="What done looks like"
        @input="onOutcome"
      ></textarea>
    </div>
    <div class="gs-stats">
      <div v-for="s in stats" :key="s.label" class="gs-stat">
        <div class="label">{{ s.label }}</div>
        <div class="stat-value gs-stat-value" :class="{ 'is-accent': s.accent }">{{ s.value }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.goal-summary { display: flex; flex-direction: column; gap: var(--space-6); }
.gs-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--space-6); align-items: end; }
.gs-title { margin-top: 4px; overflow-wrap: anywhere; }
.gs-pct { font: 800 64px/.9 var(--font-heading); letter-spacing: -.03em; }
.gs-readme { border: 2px solid var(--color-divider); }
.gs-readme-bar {
  display: flex; justify-content: space-between; gap: var(--space-2);
  padding: var(--space-2) var(--space-3); border-bottom: 2px solid var(--color-divider);
}
.gs-hint { font-weight: 400; color: var(--color-neutral-700); }
.gs-outcome {
  display: block; width: 100%; resize: none; border: 0; padding: var(--space-3);
  background: transparent; font-size: 15px; line-height: 1.45; color: var(--color-text);
}
.gs-outcome:focus { outline: 2px solid var(--color-accent); outline-offset: -2px; }
.gs-stats {
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
  border-top: 2px solid var(--color-divider); border-bottom: 2px solid var(--color-divider);
}
.gs-stat { padding: var(--space-3); border-left: 2px solid var(--color-divider); }
.gs-stat:first-child { padding-left: 0; border-left: 0; }
.gs-stat-value.is-accent { color: var(--color-accent-700); }
@media (max-width: 560px) {
  .gs-pct { font-size: 44px; }
  .gs-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .gs-stat:nth-child(3) { padding-left: 0; border-left: 0; }
  .gs-stat:nth-child(n + 3) { border-top: 2px solid var(--color-divider); }
}
</style>
