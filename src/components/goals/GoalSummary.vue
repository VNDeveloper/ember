<script setup lang="ts">
import { Flag } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { achievedSummary, goalKicker, goalLedger } from '../../core/goalView'
import { goalStats, goalStatus } from '../../core/goals'
import type { Goal, GoalStatus } from '../../core/model'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import { popClass } from '../anim'
import RowMenu from '../RowMenu.vue'
import TitleEditPanel from '../TitleEditPanel.vue'

const props = defineProps<{ goal: Goal }>()
const ember = useEmberStore()
const ui = useUiStore()

function rename(title: string) {
  ember.renameGoal(props.goal.id, title)
  ui.editing = null
}
function remove() {
  ui.editing = null
  ui.showUndo(ember.deleteGoal(props.goal.id))
}

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

const status = computed(() => goalStatus(props.goal))
const MENU: Record<GoalStatus, { key: string; label: string }[]> = {
  active: [{ key: 'pause', label: 'Pause' }, { key: 'achieve', label: 'Mark achieved' }],
  paused: [{ key: 'resume', label: 'Resume' }, { key: 'achieve', label: 'Mark achieved' }],
  achieved: [{ key: 'reopen', label: 'Reopen' }],
}
const NEXT: Record<string, GoalStatus> = { pause: 'paused', achieve: 'achieved', resume: 'active', reopen: 'active' }
const onSelect = (key: string) => ember.setGoalStatus(props.goal.id, NEXT[key])

const summary = computed(() => achievedSummary(props.goal, ember.logs))
const word = (n: number, w: string) => (n === 1 ? w : `${w}s`)
/** The flag pops when this goal becomes achieved while you're looking at it, not when you open an achieved goal. */
const pops = ref(0)
watch(() => [props.goal.id, status.value] as const, ([id, s], [pid, ps]) => {
  if (id === pid && s === 'achieved' && ps !== 'achieved') pops.value++
})
</script>

<template>
  <div class="goal-summary">
    <div class="gs-head">
      <div>
        <span class="kicker gs-kicker">{{ kicker }}</span>
        <h2 class="gs-title">{{ goal.title }}</h2>
      </div>
      <div class="gs-side">
        <div class="gs-pct">{{ pct }}%</div>
        <RowMenu :menu-key="`goal:${goal.id}`" :label="goal.title" :extra="MENU[status]" @select="onSelect" @delete="remove" />
      </div>
    </div>
    <TitleEditPanel v-if="ui.editing === `goal:${goal.id}`" what="goal" :title="goal.title" @save="rename" @delete="remove" />
    <div v-if="status === 'achieved'" class="gs-achieved">
      <div class="gs-ach-flag" :class="pops ? popClass(pops) : ''"><Flag :size="18" :stroke-width="2.5" /></div>
      <div class="gs-ach-body">
        <span class="kicker">Achieved</span>
        <p class="gs-ach-outcome">{{ summary.outcome || 'Goal achieved.' }}</p>
        <p class="gs-ach-span">{{ summary.span }}</p>
        <div class="gs-ach-stats">
          <span><b>{{ summary.focused }}</b> focused</span>
          <span><b>{{ summary.sessions }}</b> {{ word(summary.sessions, 'session') }}</span>
          <span><b>{{ summary.steps }}</b> {{ word(summary.steps, 'step') }}</span>
          <span><b>{{ summary.milestones }}</b> {{ word(summary.milestones, 'milestone') }}</span>
        </div>
      </div>
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
.gs-side { display: flex; align-items: flex-end; gap: var(--space-2); }
.gs-pct { font: 800 64px/.9 var(--font-heading); letter-spacing: -.03em; }
.gs-readme { border: 2px solid var(--color-divider); }
.gs-achieved {
  display: grid; grid-template-columns: 40px minmax(0, 1fr); gap: var(--space-4);
  padding: var(--space-4); border: 2px solid var(--color-text);
}
.gs-ach-flag { width: 40px; height: 40px; display: grid; place-items: center; background: var(--color-accent); color: var(--color-bg); }
.gs-ach-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.gs-ach-outcome { font: 700 18px/1.3 var(--font-heading); overflow-wrap: anywhere; }
.gs-ach-span { font-size: 13px; color: var(--color-neutral-700); }
.gs-ach-stats { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-4); margin-top: var(--space-2); font-size: 13px; }
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
