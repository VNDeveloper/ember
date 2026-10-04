<script setup lang="ts">
import { ArrowLeftToLine, ArrowRightToLine, Check, Flag, Timer } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { fmtM } from '../core/format'
import { goalColor } from '../core/goals'
import type { Task } from '../core/model'
import { sameTarget } from '../core/model'
import { taskNote } from '../core/today'
import { useEmberStore } from '../stores/ember'
import { withFocusRescue } from './focusRescue'

const props = withDefaults(defineProps<{ task: Task; variant: 'today' | 'upcoming' | 'goal'; showDate?: boolean }>(), { showDate: false })
const ember = useEmberStore()
const root = ref<HTMLElement | null>(null)
const act = (e: Event, action: () => void) => withFocusRescue(root.value, e, action)

const done = computed(() => props.task.doneOn != null)
const goalIndex = computed(() => (props.task.goalId ? ember.goals.findIndex((g) => g.id === props.task.goalId) : -1))
const goal = computed(() => (goalIndex.value >= 0 ? ember.goals[goalIndex.value] : null))
const note = computed(() => taskNote(props.task, ember.today, props.showDate))
const spent = computed(() => {
  const min = ember.tally.spent.get(`task:${props.task.id}`) ?? 0
  return min ? fmtM(min) : ''
})
const target = computed(() => ({ kind: 'task' as const, taskId: props.task.id }))
const selected = computed(() => sameTarget(ember.selection, target.value))
const canDefer = computed(() => !done.value && props.task.date != null && props.task.date <= ember.today)
const canPull = computed(() => !done.value && (props.task.date == null || props.task.date > ember.today))
</script>

<template>
  <div ref="root" class="task-row" :class="[`is-${variant}`, { 'is-done': done, 'is-selected': selected && variant !== 'upcoming' }]">
    <button
      class="check"
      :class="{ 'check-sm': variant === 'upcoming', 'is-done': done }"
      role="checkbox"
      :aria-checked="done"
      :aria-label="task.title"
      @click="act($event, () => ember.toggleTask(task.id))"
    >
      <Check v-if="done" :size="variant === 'upcoming' ? 12 : 14" :stroke-width="3.5" />
    </button>
    <div class="tr-body">
      <span class="tr-title">{{ task.title }}</span>
      <span class="tr-meta">
        <span class="tr-label">
          <span v-if="goal" class="swatch swatch-sm" :style="{ background: goalColor(goalIndex) }"></span>{{ goal ? goal.title : task.tag }}
        </span>
        <span v-if="note" class="tr-note" :class="{ 'is-accent': note.accent }">
          <Flag v-if="task.deadline" :size="12" :stroke-width="2.5" />{{ note.text }}
        </span>
      </span>
    </div>
    <template v-if="variant !== 'upcoming'">
      <span class="tr-spent tabular">{{ spent }}</span>
      <button
        v-if="variant === 'today'"
        class="icon-btn tr-defer"
        :class="{ 'is-hidden': !canDefer }"
        aria-label="Move to tomorrow"
        title="Move to tomorrow"
        @click="act($event, () => ember.moveToTomorrow(task.id))"
      >
        <ArrowRightToLine :size="16" :stroke-width="2.25" />
      </button>
      <button
        class="icon-btn tr-focus"
        :class="{ 'is-on': selected, 'is-hidden': done }"
        aria-label="Focus on this task"
        title="Focus on this task"
        @click="ember.select(target)"
      >
        <Timer :size="16" :stroke-width="2.25" />
      </button>
    </template>
    <button
      v-else
      class="icon-btn tr-pull"
      :class="{ 'is-hidden': !canPull }"
      aria-label="Move to today"
      title="Move to today"
      @click="act($event, () => ember.moveToToday(task.id))"
    >
      <ArrowLeftToLine :size="16" :stroke-width="2.25" />
    </button>
  </div>
</template>

<style scoped>
.task-row { display: grid; align-items: center; border-bottom: 1px solid var(--color-divider); }
.task-row.is-today { grid-template-columns: 22px minmax(0, 1fr) auto 28px 28px; gap: var(--space-2) var(--space-3); padding: var(--space-2); }
.task-row.is-upcoming { grid-template-columns: 18px minmax(0, 1fr) 28px; gap: var(--space-3); padding: 6px var(--space-2); }
.task-row.is-goal { grid-template-columns: 22px minmax(0, 1fr) auto 28px; gap: var(--space-3); padding: 6px var(--space-2); }
.task-row.is-selected { background: var(--color-accent-100); }
.tr-body { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.tr-title { font-size: 14px; overflow-wrap: anywhere; }
.task-row.is-done .tr-title { text-decoration: line-through; color: var(--color-neutral-700); }
.tr-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 10px; font-size: 11px; color: var(--color-neutral-700); }
.tr-label { display: flex; align-items: center; gap: 5px; }
.tr-note { display: flex; align-items: center; gap: 4px; font-weight: 700; }
.tr-note.is-accent { color: var(--color-accent-700); }
.tr-note svg { flex: none; }
.tr-spent { font-size: 12px; color: var(--color-neutral-700); }
</style>
