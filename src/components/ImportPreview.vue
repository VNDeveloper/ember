<script setup lang="ts">
import { computed } from 'vue'
import { addDays, dayLabel, yearOf } from '../core/dates'
import { fmtM } from '../core/format'
import { goalColor, isLive } from '../core/goals'
import { targetText } from '../core/habits'
import {
  msKey, normTitle, stepKey, summaryText, taskKey,
  type GoalPlan, type ImportKind, type PickSummary, type PlanMatch, type Skipped, type TaskPlan,
} from '../core/importPlan'
import { useEmberStore } from '../stores/ember'

const props = defineProps<{
  kind: ImportKind; plan: GoalPlan | null; match: PlanMatch | null; tasks: TaskPlan[] | null
  skipped: Skipped[]; picks: Set<string>; summary: PickSummary | null
}>()
const emit = defineEmits<{ toggle: [key: string] }>()
const ember = useEmberStore()

const there = (mi: number, si: number) => props.match?.milestones[mi]?.steps[si] === 'there'
const matched = (mi: number) => !!props.match?.milestones[mi]?.msId
const sameName = computed(() =>
  props.kind === 'goal' && !!props.plan?.title && ember.goals.some((g) => isLive(g) && normTitle(g.title) === normTitle(props.plan!.title)))
const fields = computed(() => {
  const p = props.plan
  if (!p) return []
  const m = props.match
  return [
    p.outcome ? { label: 'Outcome', text: p.outcome, kept: m?.outcome === 'kept' } : null,
    p.finishBy ? { label: 'Finish by', text: `${dayLabel(p.finishBy)}, ${yearOf(p.finishBy)}`, kept: m?.finishBy === 'kept' } : null,
    p.habit ? { label: 'Habit', text: targetText(p.habit.minutes, p.habit.daysPerWeek), kept: m?.habit === 'kept' } : null,
  ].filter((f): f is { label: string; text: string; kept: boolean } => f !== null)
})
const when = (d: string | null) =>
  d === null ? 'Someday' : d === ember.today ? 'Today' : d === addDays(ember.today, 1) ? 'Tomorrow' : dayLabel(d)
function goalOf(id: string | null) {
  const gi = ember.goals.findIndex((g) => g.id === id)
  return gi < 0 ? null : { title: ember.goals[gi].title, color: goalColor(gi) }
}
const short = (s: string) => (s.length > 60 ? `${s.slice(0, 59)}…` : s)
</script>

<template>
  <div class="import-preview">
    <template v-if="plan">
      <p class="ipv-summary">{{ summary ? summaryText(summary, kind === 'next') : '' }}</p>
      <p v-if="sameName" class="muted ipv-note">You already have a goal called ‘{{ plan.title }}’ — Add from AI on its page adds to it instead.</p>
      <h5 v-if="kind === 'goal'" class="ipv-title">{{ plan.title }}</h5>
      <ul class="ipv-list">
        <li v-for="(m, mi) in plan.milestones" :key="mi" class="ipv-ms">
          <label class="ipv-row ipv-ms-row">
            <input type="checkbox" :checked="picks.has(msKey(mi))" @change="emit('toggle', msKey(mi))" />
            <span class="ipv-ms-title">{{ m.title }}</span>
            <span v-if="matched(mi)" class="ipv-meta">adding to it</span>
            <span v-else-if="!m.steps.length && m.estMin" class="ipv-meta">~{{ fmtM(m.estMin) }}</span>
          </label>
          <ul class="ipv-steps">
            <li v-for="(s, si) in m.steps" :key="si" class="ipv-step" :class="{ 'is-there': there(mi, si) }">
              <label class="ipv-row">
                <input v-if="!there(mi, si)" type="checkbox" :checked="picks.has(stepKey(mi, si))" @change="emit('toggle', stepKey(mi, si))" />
                <span class="ipv-step-title" :class="{ 'is-done': s.done }">{{ s.title }}</span>
                <span class="ipv-meta">{{ there(mi, si) ? 'already there' : fmtM(s.estMin) }}</span>
              </label>
            </li>
          </ul>
        </li>
      </ul>
      <dl v-if="fields.length" class="ipv-fields">
        <div v-for="f in fields" :key="f.label" class="ipv-field">
          <dt>{{ f.label }}</dt>
          <dd>{{ f.text }}<span v-if="f.kept" class="ipv-meta"> · kept yours</span></dd>
        </div>
      </dl>
    </template>
    <ul v-else-if="tasks" class="ipv-list">
      <li v-for="(t, ti) in tasks" :key="ti" class="ipv-task">
        <label class="ipv-row">
          <input type="checkbox" :checked="picks.has(taskKey(ti))" @change="emit('toggle', taskKey(ti))" />
          <span class="ipv-task-body">
            <span class="ipv-task-title">{{ t.title }}</span>
            <span class="ipv-task-meta">
              {{ when(t.date) }}<template v-if="t.deadline"> · deadline</template> · #{{ t.tag }}
              <span v-if="goalOf(t.goalId)" class="ipv-goal">· <span class="swatch swatch-sm" :style="{ background: goalOf(t.goalId)!.color }"></span>{{ goalOf(t.goalId)!.title }}</span>
            </span>
            <span v-for="n in t.notes" :key="n" class="muted ipv-task-note">{{ n }}</span>
          </span>
        </label>
      </li>
    </ul>
    <div v-if="skipped.length" class="ipv-skipped">
      <span class="section-label">Skipped</span>
      <ul>
        <li v-for="s in skipped" :key="`${s.line}-${s.reason}`" class="muted"><b>Line {{ s.line }}</b> {{ short(s.text) }} — {{ s.reason }}</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.import-preview { display: flex; flex-direction: column; gap: var(--space-2); }
.ipv-summary { font-weight: 700; }
.ipv-title { font-size: 16px; }
.ipv-list, .ipv-steps, .ipv-skipped ul { list-style: none; margin: 0; padding: 0; }
.ipv-ms + .ipv-ms, .ipv-task + .ipv-task { border-top: 1px solid var(--color-divider); }
.ipv-steps { padding-left: var(--space-6); }
.ipv-row { display: flex; align-items: baseline; gap: var(--space-2); padding: 6px 0; cursor: pointer; }
.ipv-ms-title { font-weight: 700; }
.ipv-meta { margin-left: auto; font-size: 12px; color: var(--color-neutral-700); white-space: nowrap; }
.ipv-step.is-there { color: var(--color-neutral-700); }
.ipv-step.is-there .ipv-row { cursor: default; padding-left: 28px; }
.ipv-step-title.is-done { text-decoration: line-through; }
.ipv-task-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ipv-task-meta { font-size: 12px; color: var(--color-neutral-700); }
.ipv-goal { display: inline-flex; align-items: center; gap: 6px; }
.ipv-task-note { font-size: 12px; }
.ipv-fields { display: grid; gap: 4px; margin: 0; }
.ipv-field { display: flex; gap: var(--space-2); }
.ipv-field dt { font-weight: 700; min-width: 72px; }
.ipv-field dd { margin: 0; }
.ipv-skipped { font-size: 12px; border-top: 1px solid var(--color-divider); padding-top: var(--space-2); }
</style>
