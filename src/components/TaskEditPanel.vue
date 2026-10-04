<script setup lang="ts">
import { Flag } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { addDays, type ISODate } from '../core/dates'
import { isLive } from '../core/goals'
import type { Task } from '../core/model'
import { useEmberStore, type When } from '../stores/ember'
import { useUiStore } from '../stores/ui'

const props = defineProps<{ task: Task }>()
const emit = defineEmits<{ delete: [e: Event] }>()
const ember = useEmberStore()
const ui = useUiStore()

const today = ember.today
const tomorrow = addDays(today, 1)
const original = props.task.date
const startWhen: When = original == null ? 'someday' : original === today ? 'today' : original === tomorrow ? 'tomorrow' : 'date'
const WHEN: [When, string][] = [['today', 'Today'], ['tomorrow', 'Tomorrow'], ['date', 'Pick date'], ['someday', 'Someday']]

const title = ref(props.task.title)
const when = ref<When>(startWhen)
const date = ref<ISODate>(original ?? addDays(today, 2))
const deadline = ref(props.task.deadline)
const liveGoals = computed(() => ember.goals.filter(isLive))
const startGoal = props.task.goalId && liveGoals.value.some((g) => g.id === props.task.goalId) ? props.task.goalId : ''
const goalId = ref(startGoal)
const tag = ref(props.task.tag)
/** A task that is already late keeps its date selectable. */
const minDate = original && original < today ? original : today
const titleInput = ref<HTMLInputElement | null>(null)

onMounted(() => titleInput.value?.focus())

function onDate(e: Event) {
  const v = (e.target as HTMLInputElement).value
  if (v) date.value = v
}

function save() {
  if (!title.value.trim()) return
  const d = when.value === 'someday' ? null : when.value === 'today' ? today : when.value === 'tomorrow' ? tomorrow : date.value
  ember.updateTask(props.task.id, {
    title: title.value,
    date: d,
    deadline: d != null && deadline.value,
    tag: tag.value,
    // Only touch the link if the user changed it: a task whose goal was deleted keeps it for undo.
    ...(goalId.value !== startGoal ? { goalId: goalId.value || null } : {}),
  })
  ui.editing = null
}

function onEnter(e: KeyboardEvent) {
  if (!e.isComposing) save()
}
</script>

<template>
  <div class="edit-panel" role="group" :aria-label="`Edit “${task.title}”`">
    <input ref="titleInput" v-model="title" class="input ep-title" aria-label="Title" @keydown.enter="onEnter" />
    <div class="ep-row">
      <div class="seg ep-when" role="radiogroup" aria-label="When">
        <label v-for="[value, label] in WHEN" :key="value" class="seg-opt">
          <input v-model="when" type="radio" name="ember-edit-when" :value="value" />{{ label }}
        </label>
      </div>
      <input v-if="when === 'date'" type="date" class="input input-sm ep-date" aria-label="Date" :min="minDate" :value="date" @change="onDate" />
      <button v-if="when !== 'someday'" class="flag-toggle" :class="{ 'is-on': deadline }" :aria-pressed="deadline" @click="deadline = !deadline">
        <Flag :size="14" :stroke-width="2.5" />Deadline
      </button>
      <select v-model="goalId" class="input input-sm ep-goal" aria-label="Goal">
        <option value="">No goal</option>
        <option v-for="g in liveGoals" :key="g.id" :value="g.id">{{ g.title }}</option>
      </select>
      <input v-model="tag" class="input input-sm ep-tag" placeholder="Tag" aria-label="Tag" @keydown.enter="onEnter" />
    </div>
    <div class="ep-actions">
      <button class="btn btn-primary ep-save" :disabled="!title.trim()" @click="save">Save</button>
      <button class="btn btn-ghost ep-cancel" @click="ui.editing = null">Cancel</button>
      <button class="btn btn-ghost ep-delete" @click="emit('delete', $event)">Delete</button>
    </div>
  </div>
</template>

<style scoped>
.ep-tag { width: 120px; }
</style>
