<script setup lang="ts">
import { Minus, Plus } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { fmtM } from '../../core/format'
import type { StepTarget } from '../../core/model'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'

const props = defineProps<{ target: StepTarget; title: string; estMin: number }>()
const emit = defineEmits<{ delete: [e: Event] }>()
const ember = useEmberStore()
const ui = useUiStore()

const MIN = 25
const MAX = 600
const title = ref(props.title)
const est = ref(props.estMin)
const titleInput = ref<HTMLInputElement | null>(null)
onMounted(() => titleInput.value?.focus())

function save() {
  if (!title.value.trim()) return
  ember.updateStep(props.target, { title: title.value, estMin: est.value })
  ui.editing = null
}
function onEnter(e: KeyboardEvent) {
  if (!e.isComposing) save()
}
</script>

<template>
  <div class="edit-panel" role="group" :aria-label="`Edit step “${props.title}”`">
    <input ref="titleInput" v-model="title" class="input ep-title" aria-label="Title" @keydown.enter="onEnter" />
    <div class="ep-row">
      <span class="label">Estimate</span>
      <div class="ep-stepper">
        <button class="btn btn-secondary btn-icon ep-less" aria-label="25 minutes less" :disabled="est <= MIN" @click="est -= 25"><Minus :size="16" :stroke-width="2.5" /></button>
        <span class="ep-est tabular" aria-live="polite">{{ fmtM(est) }}</span>
        <button class="btn btn-secondary btn-icon ep-more" aria-label="25 minutes more" :disabled="est >= MAX" @click="est += 25"><Plus :size="16" :stroke-width="2.5" /></button>
      </div>
    </div>
    <div class="ep-actions">
      <button class="btn btn-primary ep-save" :disabled="!title.trim()" @click="save">Save</button>
      <button class="btn btn-ghost ep-cancel" @click="ui.editing = null">Cancel</button>
      <button class="btn btn-ghost ep-delete" @click="emit('delete', $event)">Delete</button>
    </div>
  </div>
</template>

<style scoped>
.ep-stepper { display: flex; align-items: center; gap: var(--space-2); }
.ep-est { min-width: 64px; font-weight: 700; text-align: center; }
</style>
