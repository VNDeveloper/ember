<script setup lang="ts">
import { computed, ref } from 'vue'
import { plural } from '../../core/format'
import { goalStatus } from '../../core/goals'
import { clampHabit, goalMinutesByDay, habitStreak, habitView, habitWeeks, liveHabit } from '../../core/habits'
import type { Goal } from '../../core/model'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import HabitLine from './HabitLine.vue'

const props = defineProps<{ goal: Goal }>()
const ember = useEmberStore()
const ui = useUiStore()

const view = computed(() => habitView(props.goal, ember.tasks, ember.logs, ember.today))
const achieved = computed(() => goalStatus(props.goal) === 'achieved')
const hasHabit = computed(() => !!liveHabit(props.goal))
/** On an achieved goal, the best run the habit reached. */
const bestEver = computed(() => {
  const h = liveHabit(props.goal)
  if (!h) return 0
  return habitStreak(habitWeeks(h, goalMinutesByDay(props.goal, ember.tasks, ember.logs), ember.today)).best
})
const weeksText = (n: number) => (n ? plural(n, 'week') : '–')
const WEEK_WORDS = { hit: 'Hit', missed: 'Missed', off: 'Not counted', current: 'This week' } as const

const editing = ref(false)
const minutes = ref('25')
const days = ref(5)
const DAYS = [1, 2, 3, 4, 5, 6, 7]

function open() {
  minutes.value = String(view.value?.minutes ?? 25)
  days.value = view.value?.daysPerWeek ?? 5
  editing.value = true
}
function save() {
  ember.setHabit(props.goal.id, clampHabit(Number(minutes.value), days.value))
  editing.value = false
}
function remove() {
  editing.value = false
  ui.showUndo(ember.removeHabit(props.goal.id))
}
</script>

<template>
  <section class="habit-row" aria-label="Habit">
    <template v-if="achieved">
      <span v-if="hasHabit" class="kicker hr-kicker">Habit · best streak {{ weeksText(bestEver) }}</span>
    </template>
    <template v-else-if="view">
      <div class="hr-head">
        <span class="kicker hr-kicker">Habit · {{ view.targetText }}</span>
        <button v-if="!editing" class="btn btn-ghost hr-edit" @click="open">Edit</button>
      </div>
      <div class="hr-line"><HabitLine :view="view" /></div>
      <div class="hr-history">
        <span class="hr-weeks" role="list" aria-label="Recent weeks">
          <span
            v-for="(s, i) in view.recent"
            :key="i"
            role="listitem"
            class="hr-week"
            :class="`is-${s}`"
            :aria-label="WEEK_WORDS[s]"
            :title="WEEK_WORDS[s]"
          ></span>
        </span>
        <span class="hr-best">Best: {{ weeksText(view.best) }}</span>
      </div>
    </template>
    <button v-else-if="!editing" class="btn btn-ghost hr-add" @click="open">Add a habit</button>

    <div v-if="editing && !achieved" class="edit-panel hr-panel" role="group" aria-label="Habit">
      <div class="ep-row">
        <label class="hr-field">Minutes a day
          <input v-model="minutes" class="input input-sm hr-minutes" type="number" min="5" max="240" step="5" />
        </label>
        <div class="seg hr-days" role="radiogroup" aria-label="Days a week">
          <label v-for="d in DAYS" :key="d" class="seg-opt">
            <input v-model="days" type="radio" :name="`hr-days-${goal.id}`" :value="d" />{{ d }}
          </label>
        </div>
        <span class="hr-unit">days a week</span>
      </div>
      <div class="ep-actions">
        <button class="btn btn-primary hr-save" @click="save">Save</button>
        <button class="btn btn-ghost hr-cancel" @click="editing = false">Cancel</button>
        <button v-if="view" class="btn btn-ghost ep-delete hr-remove" @click="remove">Remove habit</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.habit-row { display: flex; flex-direction: column; gap: var(--space-2); }
.hr-head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-3); }
.hr-edit, .hr-add { align-self: flex-start; padding-inline: 0; font-size: 13px; }
.hr-history { display: flex; align-items: center; gap: var(--space-3); font-size: 12px; color: var(--color-neutral-700); }
.hr-weeks { display: flex; gap: 3px; }
.hr-week { width: 12px; height: 12px; border: 1px solid var(--color-text); }
.hr-week.is-hit { background: var(--color-text); }
.hr-week.is-off { border-style: dotted; border-color: var(--color-neutral-500); }
.hr-week.is-current { border-color: var(--color-accent); }
.hr-field { display: inline-flex; align-items: center; gap: var(--space-2); font-size: 13px; }
.hr-minutes { width: 72px; }
.hr-unit { font-size: 13px; color: var(--color-neutral-700); }
</style>
