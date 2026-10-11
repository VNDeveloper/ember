<script setup lang="ts">
import { Flag, Plus } from 'lucide-vue-next'
import { onMounted, watch } from 'vue'
import { addDays } from '../../core/dates'
import { goalOptions } from '../../core/goals'
import { useEmberStore, type When } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'

const ember = useEmberStore()
const draft = useUiStore().taskDraft
const WHEN: [When, string][] = [['today', 'Today'], ['tomorrow', 'Tomorrow'], ['date', 'Pick date'], ['someday', 'Someday']]

onMounted(() => {
  if (!draft.date) draft.date = addDays(ember.today, 2)
})

/** A picked date that has slipped into the past moves forward again. */
watch(() => ember.today, (t) => {
  if (draft.date && draft.date < t) draft.date = addDays(t, 2)
})

/** Clearing the field keeps the last valid date instead of silently filing the task under today. */
function onDate(e: Event) {
  const v = (e.target as HTMLInputElement).value
  if (v) draft.date = v
}

function setWhen(w: When) {
  draft.when = w
  if (w === 'someday') draft.deadline = false
}

function add() {
  const task = ember.addTask({
    title: draft.title, when: draft.when, date: draft.date || undefined, deadline: draft.deadline, goalId: draft.goalId || null,
  })
  if (!task) return
  draft.title = ''
  draft.deadline = false
}

function onEnter(e: KeyboardEvent) {
  if (!e.isComposing) add()
}
</script>

<template>
  <div class="add-task">
    <div class="at-row">
      <input v-model="draft.title" class="input at-title" placeholder="Add a task…" aria-label="New task" @keydown.enter="onEnter" />
      <button class="btn btn-primary at-add" @click="add"><Plus :size="16" :stroke-width="2.5" />Add</button>
    </div>
    <div class="at-options">
      <div class="seg" role="radiogroup" aria-label="When">
        <label v-for="[value, label] in WHEN" :key="value" class="seg-opt">
          <input type="radio" name="ember-when" :value="value" :checked="draft.when === value" @change="setWhen(value)" />{{ label }}
        </label>
      </div>
      <input v-if="draft.when === 'date'" :value="draft.date" type="date" @change="onDate" class="input input-sm at-date" aria-label="Date" :min="ember.today" />
      <button
        v-if="draft.when !== 'someday'"
        class="at-deadline"
        :class="{ 'is-on': draft.deadline }"
        :aria-pressed="draft.deadline"
        title="Mark as a hard deadline"
        @click="draft.deadline = !draft.deadline"
      >
        <Flag :size="14" :stroke-width="2.5" />Deadline
      </button>
      <select v-model="draft.goalId" class="input input-sm at-goal" aria-label="Link to a goal">
        <option value="">No goal</option>
        <option v-for="g in goalOptions(ember.goals)" :key="g.id" :value="g.id">{{ g.title }}</option>
      </select>
    </div>
  </div>
</template>

<style scoped>
.add-task { display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-1); }
.at-row { display: flex; gap: var(--space-2); }
.at-options { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
.at-goal { max-width: 100%; }
.at-deadline {
  display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; font-size: 13px;
  border: 1px solid var(--color-divider); background: transparent; color: var(--color-text);
}
.at-deadline:hover { border-color: var(--color-accent); }
.at-deadline.is-on { background: var(--color-accent-100); border-color: var(--color-accent); color: var(--color-accent-800); }
.at-deadline svg { flex: none; }
</style>
