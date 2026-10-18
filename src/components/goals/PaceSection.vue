<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Goal } from '../../core/model'
import { paceView } from '../../core/pace'
import { useEmberStore } from '../../stores/ember'

const props = defineProps<{ goal: Goal }>()
const ember = useEmberStore()
const view = computed(() => paceView(props.goal, ember.logs, ember.tally.spent, ember.today))
const editing = ref(false)
const date = ref('')

function open() {
  date.value = props.goal.finishBy ?? ''
  editing.value = true
}
function save() {
  if (date.value) ember.setFinishBy(props.goal.id, date.value)
  editing.value = false
}
function clear() {
  ember.setFinishBy(props.goal.id, null)
  editing.value = false
}
</script>

<template>
  <section v-if="view" class="pace-section" aria-label="Pace">
    <span class="kicker">Pace</span>
    <p v-if="view.paused" class="ps-paused muted">Paused — no forecast</p>
    <dl v-else class="ps-rows">
      <div class="ps-row"><dt>At your pace</dt><dd><b class="ps-at">{{ view.atPace ?? '—' }}</b> <span class="ps-pace">{{ view.pace }}</span></dd></div>
      <div v-if="view.atHabit" class="ps-row ps-habit"><dt>At your habit</dt><dd><b>{{ view.atHabit }}</b></dd></div>
      <div class="ps-row"><dt>Left to go</dt><dd><b class="ps-left">{{ view.left }}</b> <span v-if="view.unplanned" class="ps-sub">{{ view.unplanned }}</span> <span v-if="view.correction" class="ps-sub ps-corr">{{ view.correction }}</span></dd></div>
      <div class="ps-row">
        <dt>Finish by</dt>
        <dd v-if="view.finishBy && !editing">
          <b>{{ view.finishBy.text }}</b>
          <span v-if="view.finishBy.verdict" class="tag ps-verdict" :class="view.behind ? 'is-bad' : 'tag-neutral'">{{ view.finishBy.verdict }}</span>
          <span v-if="view.finishBy.need" class="ps-need">To make it: {{ view.finishBy.need }}</span>
          <button class="btn btn-ghost ps-change" @click="open">Change</button>
        </dd>
        <dd v-else-if="!editing"><button class="btn btn-ghost ps-set" @click="open">Set a finish date</button></dd>
        <dd v-else class="ps-edit">
          <input v-model="date" class="input input-sm ps-date" type="date" aria-label="Finish by" :min="ember.today" />
          <button class="btn btn-primary ps-save" :disabled="!date" @click="save">Save</button>
          <button v-if="goal.finishBy" class="btn btn-ghost ps-clear" @click="clear">Clear</button>
          <button class="btn btn-ghost ps-cancel" @click="editing = false">Cancel</button>
        </dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.pace-section { display: flex; flex-direction: column; gap: var(--space-2); }
.ps-rows { margin: 0; display: flex; flex-direction: column; border-top: 1px solid var(--color-divider); }
.ps-row { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: var(--space-3); align-items: baseline; padding: 6px 0; border-bottom: 1px solid var(--color-divider); font-size: 14px; }
.ps-row dt { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--color-neutral-700); }
.ps-row dd { margin: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px var(--space-3); }
.ps-pace, .ps-sub, .ps-need { font-size: 12px; color: var(--color-neutral-700); }
.ps-verdict.is-bad { background: var(--color-accent-100); color: var(--color-accent-700); font-weight: 700; }
.ps-change, .ps-set { padding-inline: 0; font-size: 13px; }
.ps-edit { gap: var(--space-2); }
@media (max-width: 520px) { .ps-row { grid-template-columns: minmax(0, 1fr); gap: 2px; } }
</style>
