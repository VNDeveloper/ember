<script setup lang="ts">
import { onMounted, ref } from 'vue'

defineProps<{ text: string }>()
const emit = defineEmits<{ close: [] }>()
const box = ref<HTMLTextAreaElement | null>(null)
onMounted(() => {
  box.value?.focus()
  box.value?.select()
})
</script>

<template>
  <div class="copy-box">
    <span class="section-label">Copy it from here</span>
    <textarea ref="box" class="input cb-text" rows="6" readonly :value="text" aria-label="Copy it from here"></textarea>
    <button class="btn btn-ghost cb-close" @click="emit('close')">Done</button>
  </div>
</template>

<style scoped>
.copy-box { display: flex; flex-direction: column; gap: var(--space-2); align-items: flex-start; }
.cb-text { width: 100%; font-family: var(--font-mono, monospace); font-size: 12px; resize: vertical; }
</style>
