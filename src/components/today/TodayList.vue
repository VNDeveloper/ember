<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next'
import { computed } from 'vue'
import { doneByDay, lastDays, streakLength } from '../../core/activity'
import { todayList } from '../../core/today'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import TaskRow from '../TaskRow.vue'
import AddTask from './AddTask.vue'

const ember = useEmberStore()
const ui = useUiStore()

const list = computed(() => todayList(ember.tasks, ember.today))
const total = computed(() => list.value.open.length + list.value.done.length)
const counts = computed(() => doneByDay(ember.goals, ember.tasks))
const week = computed(() => lastDays(counts.value, ember.today, 7))
const streak = computed(() => streakLength(counts.value, ember.today))
</script>

<template>
  <section class="today-list">
    <div class="tl-head">
      <h4>Today</h4>
      <div class="tl-stats">
        <div class="tl-week" title="Last 7 days">
          <span v-for="d in week" :key="d.date" :title="d.tip" :class="{ 'is-today': d.isToday }" :style="{ background: d.color }"></span>
        </div>
        <span class="tl-streak">{{ streak }}-day streak</span>
        <span class="tl-summary">{{ list.done.length }} of {{ total }} done</span>
      </div>
    </div>
    <AddTask />
    <div class="tl-rows">
      <TaskRow v-for="t in list.open" :key="t.id" :task="t" variant="today" />
      <template v-if="ui.doneOpen">
        <TaskRow v-for="t in list.done" :key="t.id" :task="t" variant="today" />
      </template>
      <button v-if="list.done.length" class="tl-done-toggle" :aria-expanded="ui.doneOpen" @click="ui.doneOpen = !ui.doneOpen">
        <ChevronRight :size="14" :stroke-width="2.5" :class="{ 'is-open': ui.doneOpen }" />{{ ui.doneOpen ? 'Hide done' : `${list.done.length} done` }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.today-list { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
.tl-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; }
.tl-stats { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-3); font-size: 13px; color: var(--color-neutral-700); }
.tl-week { display: flex; gap: 3px; }
.tl-week span { width: 10px; height: 10px; }
.tl-week span.is-today { box-shadow: inset 0 0 0 2px var(--color-text); }
.tl-summary { color: var(--color-text); font-weight: 700; }
.tl-rows { display: flex; flex-direction: column; border-top: 2px solid var(--color-divider); }
.tl-done-toggle {
  display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2);
  border: 0; border-bottom: 1px solid var(--color-divider); background: transparent;
  font-size: 13px; color: var(--color-neutral-700); text-align: left;
}
.tl-done-toggle:hover { background: var(--color-accent-100); }
.tl-done-toggle svg { flex: none; transition: transform .15s; }
.tl-done-toggle svg.is-open { transform: rotate(90deg); }
</style>
