<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { plural } from '../core/format'
import {
  addedText, defaultPicks, detectKind, goalPrompt, matchPlan, nextStepsPrompt, parseGoal, parseTasks,
  pickSummary, progressNotes, taskKey, tasksPrompt, togglePick, type ImportKind,
} from '../core/importPlan'
import type { Goal } from '../core/model'
import { useEmberStore } from '../stores/ember'
import { useUiStore } from '../stores/ui'
import { copyText } from './clipboard'
import CopyBox from './CopyBox.vue'
import ImportPreview from './ImportPreview.vue'

const props = defineProps<{ kind: ImportKind; goal?: Goal | null }>()
const emit = defineEmits<{ close: [] }>()
const ember = useEmberStore()
const ui = useUiStore()

const TITLE: Record<ImportKind, string> = { goal: 'Import a goal', next: 'Add from AI', tasks: 'Paste tasks' }

const prompt = computed(() =>
  props.kind === 'goal' ? goalPrompt(ember.today)
  : props.kind === 'next' && props.goal ? nextStepsPrompt(props.goal, ember.today, progressNotes(props.goal, ember.logs, ember.tally.spent, ember.today))
  : tasksPrompt(ember.goals, ember.today))
const copied = ref(false)
const showPrompt = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined
async function copy() {
  if (await copyText(prompt.value)) {
    copied.value = true
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => { copied.value = false }, 2000)
  } else showPrompt.value = true
}
onBeforeUnmount(() => clearTimeout(copiedTimer))

const text = ref('')
const pasted = computed(() => text.value.trim() !== '')
const wrongKind = computed(() => {
  const k = detectKind(text.value)
  return k && k !== (props.kind === 'tasks' ? 'tasks' : 'goal') ? k : null
})
const plan = computed(() => (props.kind !== 'tasks' && pasted.value && !wrongKind.value ? parseGoal(text.value) : null))
const match = computed(() => (props.kind === 'next' && props.goal && plan.value ? matchPlan(props.goal, plan.value) : null))
const taskResult = computed(() =>
  props.kind === 'tasks' && pasted.value && !wrongKind.value ? parseTasks(text.value, ember.goals, ember.today) : null)

const picks = ref<Set<string>>(new Set())
// Ticks reset only for a new paste: data changing underneath (a sync, another tab) keeps what you unticked.
watch([text, () => props.kind, () => props.goal?.id], () => {
  picks.value = plan.value ? defaultPicks(plan.value, match.value) : new Set(taskResult.value?.tasks.map((_, i) => taskKey(i)) ?? [])
}, { immediate: true })
const toggle = (key: string) => { picks.value = togglePick(picks.value, key, plan.value, match.value) }

const message = computed(() => {
  if (!pasted.value) return ''
  if (wrongKind.value === 'goal') return 'This looks like a goal — use Import a goal on the Goals page.'
  if (wrongKind.value === 'tasks') return 'This looks like a task list — use Paste tasks on Today.'
  if (props.kind === 'tasks') return taskResult.value?.tasks.length ? '' : 'Nothing Ember can read yet — check it has ‘- ’ bullets.'
  if (!plan.value) {
    return props.kind === 'goal'
      ? 'Nothing Ember can read yet — check it starts with ‘# Goal:’.'
      : 'Nothing Ember can read yet — check it has ‘## ’ milestones.'
  }
  if (props.kind === 'goal' && !plan.value.title) return 'Add a ‘# Goal:’ line with the goal’s name.'
  return ''
})

const summary = computed(() => (plan.value ? pickSummary(plan.value, picks.value, match.value) : null))
const fills = computed(() => !!match.value && [match.value.outcome, match.value.finishBy, match.value.habit].includes('fill'))
const pickedTasks = computed(() => taskResult.value?.tasks.filter((_, i) => picks.value.has(taskKey(i))) ?? [])
const action = computed(() => {
  if (props.kind === 'goal') return 'Create goal'
  if (props.kind === 'tasks') return `Add ${plural(pickedTasks.value.length, 'task')}`
  const what = summary.value ? addedText(summary.value.steps, summary.value.milestones) : ''
  return what ? `Add ${what}` : 'Add details'
})
const canCreate = computed(() => {
  if (!pasted.value || message.value) return false
  if (props.kind === 'tasks') return pickedTasks.value.length > 0
  const p = plan.value
  const s = summary.value
  if (!p || !s) return false
  if (props.kind === 'goal') return p.milestones.length === 0 || s.milestones > 0
  return s.steps + s.milestones > 0 || fills.value
})

function create() {
  if (!canCreate.value) return
  if (props.kind === 'goal' && plan.value) {
    const r = ember.importGoal(plan.value, picks.value)
    if (r) {
      ui.selectGoal(r.goalId)
      ui.showUndo(r.undo)
    }
  } else if (props.kind === 'next' && props.goal && plan.value) {
    ui.showUndo(ember.importIntoGoal(props.goal.id, plan.value, picks.value))
  } else if (props.kind === 'tasks') {
    ui.showUndo(ember.importTasks(pickedTasks.value))
  }
  emit('close')
}
</script>

<template>
  <section class="edit-panel import-panel" :aria-label="TITLE[kind]">
    <span class="kicker">{{ TITLE[kind] }}</span>
    <div class="ip-copy-row">
      <p class="ip-help">Paste this into your AI chat, fill in the first line, then paste its reply below.</p>
      <button class="btn btn-secondary ip-copy" @click="copy">{{ copied ? 'Copied' : 'Copy prompt' }}</button>
    </div>
    <CopyBox v-if="showPrompt" :text="prompt" @close="showPrompt = false" />
    <label class="section-label" :for="`ip-paste-${kind}`">Paste the AI's reply</label>
    <textarea :id="`ip-paste-${kind}`" v-model="text" class="input ip-paste" rows="8" spellcheck="false"></textarea>
    <p v-if="message" class="muted ipv-empty">{{ message }}</p>
    <ImportPreview
      v-else-if="pasted"
      :kind="kind" :plan="plan" :match="match" :tasks="taskResult?.tasks ?? null"
      :skipped="plan?.skipped ?? taskResult?.skipped ?? []" :picks="picks" :summary="summary"
      @toggle="toggle"
    />
    <div class="ep-actions">
      <button class="btn btn-primary ip-create" :disabled="!canCreate" @click="create">{{ action }}</button>
      <button class="btn btn-ghost ip-cancel" @click="emit('close')">Cancel</button>
    </div>
  </section>
</template>

<style scoped>
.import-panel { margin: 0; gap: var(--space-3); }
.ip-copy-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); }
.ip-help { margin: 0; flex: 1 1 240px; }
.ip-paste { width: 100%; resize: vertical; font-family: var(--font-mono, monospace); font-size: 12px; }
</style>
