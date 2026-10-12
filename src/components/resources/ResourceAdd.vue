<script setup lang="ts">
import { Plus } from 'lucide-vue-next'
import { computed, nextTick, ref, watch } from 'vue'
import { findDuplicate, normaliseUrl, shortLink } from '../../core/companies'
import { isLive } from '../../core/goals'
import { STATUS_LABEL, TYPE_LABEL, priceText } from '../../core/resources'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'

const props = withDefaults(defineProps<{ goalId?: string | null; large?: boolean }>(), { goalId: null, large: false })
const ember = useEmberStore()
const ui = useUiStore()

const text = ref('')
const invalid = ref(false)
const addedId = ref<string | null>(null)
const titleInput = ref<HTMLInputElement | null>(null)

watch(text, () => { invalid.value = false })

const dup = computed(() => {
  const url = normaliseUrl(text.value)
  return url ? findDuplicate(url, ember.resources) : null
})
const added = computed(() => {
  const r = addedId.value ? ember.resourceById(addedId.value) : null
  return r && isLive(r) ? r : null
})
const chips = computed(() => {
  const r = added.value
  if (!r) return []
  const goal = r.goalId ? ember.goals.find((g) => g.id === r.goalId && isLive(g)) : null
  return [r.company, TYPE_LABEL[r.type], STATUS_LABEL[r.status], goal ? goal.title : 'No goal', priceText(r, ember.resources)]
})

async function add() {
  if (dup.value) return
  const res = ember.addResource(text.value, { goalId: props.goalId })
  if (!res.ok) {
    invalid.value = res.reason === 'invalid'
    return
  }
  text.value = ''
  addedId.value = res.id
  await nextTick()
  titleInput.value?.focus()
  titleInput.value?.select()
}

function onTitle(e: Event) {
  if (addedId.value) ember.updateResource(addedId.value, { title: (e.target as HTMLInputElement).value })
}
function onTitleEnter(e: KeyboardEvent) {
  if (!e.isComposing) addedId.value = null
}

function edit() {
  const r = added.value
  if (!r) return
  const id = r.id
  addedId.value = null
  ui.openResources('all', r.status)
  ui.highlight = id
  ui.startEdit(`resource:${id}`)
}

function undo() {
  const id = addedId.value
  addedId.value = null
  if (id) ui.showUndo(ember.deleteResource(id))
}

function showIt() {
  const r = dup.value
  if (!r) return
  text.value = ''
  ui.openResources('all', 'all')
  ui.highlight = r.id
}
</script>

<template>
  <div class="resource-add" :class="{ 'is-large': large }">
    <form class="ra-form" @submit.prevent="add">
      <label class="ra-label">
        <span class="sr-only">Link</span>
        <input
          v-model="text"
          class="input ra-input"
          type="text"
          inputmode="url"
          autocomplete="off"
          placeholder="Paste a link to add it"
          :aria-invalid="invalid || undefined"
          :aria-describedby="invalid ? 'ra-error' : dup ? 'ra-dup' : undefined"
        />
      </label>
      <button class="btn btn-primary ra-submit" type="submit" :disabled="!!dup || !text.trim()">
        <Plus :size="16" :stroke-width="2.5" />Add
      </button>
    </form>
    <p v-if="invalid" id="ra-error" class="ra-msg ra-error" role="alert">That doesn’t look like a link.</p>
    <p v-else-if="dup" id="ra-dup" class="ra-msg ra-dup" role="status">
      Already saved: <b>{{ dup.title }}</b> · {{ dup.company }} · {{ STATUS_LABEL[dup.status] }}. <button type="button" class="btn btn-ghost ra-show" @click="showIt">Show it</button>
    </p>

    <div v-if="added" class="ra-card" role="group" aria-label="Added resource">
      <span class="ra-added">Added {{ shortLink(added.url) }}</span>
      <label class="ra-field">
        <span class="label">Title</span>
        <input ref="titleInput" class="input ra-title" :value="added.title" @input="onTitle" @keydown.enter="onTitleEnter" />
      </label>
      <div class="ra-chips">
        <button v-for="(c, i) in chips" :key="i" type="button" class="ra-chip" :class="{ 'is-company': i === 0 }" @click="edit">{{ c }}</button>
      </div>
      <div class="ep-actions">
        <button type="button" class="btn btn-secondary ra-done" @click="addedId = null">Done</button>
        <button type="button" class="btn btn-ghost ra-undo" @click="undo">Undo</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.resource-add { display: flex; flex-direction: column; gap: var(--space-2); max-width: 640px; }
.ra-form { display: flex; gap: var(--space-2); }
.ra-label { flex: 1; min-width: 0; }
.ra-input { min-height: 40px; }
.is-large .ra-input, .is-large .ra-submit { min-height: 48px; font-size: 16px; }
.ra-msg { font-size: 13px; }
.ra-error { color: var(--color-accent-700); font-weight: 700; }
.ra-show { padding: 0 var(--space-1); font-size: 13px; color: var(--color-accent-700); }
.ra-card {
  display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3);
  background: var(--color-surface); border: 2px solid var(--color-text);
}
.ra-added { font-size: 12px; color: var(--color-neutral-700); overflow-wrap: anywhere; }
.ra-field { display: flex; flex-direction: column; gap: 4px; }
.ra-title { background: var(--color-bg); }
.ra-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.ra-chip {
  padding: 3px 10px; border: 1px solid var(--color-divider); background: transparent;
  font-size: 12px; color: var(--color-text);
}
.ra-chip.is-company { font-weight: 700; }
.ra-chip:hover { border-color: var(--color-accent); }
@media (max-width: 520px) { .ra-input, .ra-submit { min-height: 44px; } }
</style>
