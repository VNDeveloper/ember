<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useUiStore } from '../stores/ui'

const props = defineProps<{ what: 'milestone' | 'goal'; title: string }>()
const emit = defineEmits<{ save: [title: string]; delete: [e: Event] }>()
const ui = useUiStore()

const title = ref(props.title)
const titleInput = ref<HTMLInputElement | null>(null)
onMounted(() => titleInput.value?.focus())

function save() {
  const v = title.value.trim()
  if (v) emit('save', v)
}
function onEnter(e: KeyboardEvent) {
  if (!e.isComposing) save()
}
</script>

<template>
  <div class="edit-panel" role="group" :aria-label="`Edit ${what} “${props.title}”`">
    <input ref="titleInput" v-model="title" class="input ep-title" aria-label="Title" @keydown.enter="onEnter" />
    <div class="ep-actions">
      <button class="btn btn-primary ep-save" :disabled="!title.trim()" @click="save">Save</button>
      <button class="btn btn-ghost ep-cancel" @click="ui.editing = null">Cancel</button>
      <button class="btn btn-ghost ep-delete" @click="emit('delete', $event)">Delete</button>
    </div>
  </div>
</template>
