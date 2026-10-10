<script setup lang="ts">
import { Play } from 'lucide-vue-next'
import { useId } from 'vue'
import { playEndSound } from '../composables/useEndSounds'
import type { Settings } from '../core/model'
import { END_SOUNDS, type EndSound } from '../core/sounds'
import { useEmberStore } from '../stores/ember'

const ember = useEmberStore()
const id = useId()

type SoundKey = 'focusEndSound' | 'breakEndSound'
const ROWS: { key: SoundKey; label: string; cls: string }[] = [
  { key: 'focusEndSound', label: 'Session ends', cls: 'ss-focus' },
  { key: 'breakEndSound', label: 'Break ends', cls: 'ss-break' },
]

/** Choosing a sound plays it, so you hear what you picked. */
function choose(key: SoundKey, e: Event) {
  const value = (e.target as HTMLSelectElement).value as EndSound
  ember.updateSettings({ [key]: value } as Partial<Settings>)
  void playEndSound(value)
}
</script>

<template>
  <div class="ss">
    <div v-for="row in ROWS" :key="row.key" class="ss-row" :class="row.cls">
      <label :for="`${id}-${row.key}`">{{ row.label }}</label>
      <div class="ss-pick">
        <select :id="`${id}-${row.key}`" class="input input-sm ss-select" :value="ember.settings[row.key]" @change="choose(row.key, $event)">
          <option v-for="s in END_SOUNDS" :key="s.id" :value="s.id">{{ s.label }}</option>
        </select>
        <button
          class="btn btn-secondary btn-icon ss-preview"
          :aria-label="`Play the ${row.label.toLowerCase()} sound`"
          :title="`Play the ${row.label.toLowerCase()} sound`"
          :disabled="ember.settings[row.key] === 'none'"
          @click="playEndSound(ember.settings[row.key])"
        >
          <Play :size="14" :stroke-width="2.5" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ss { display: flex; flex-direction: column; gap: var(--space-2); }
.ss-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); font-size: 14px; }
.ss-pick { display: flex; align-items: center; gap: var(--space-2); }
.ss-select { width: 120px; }
</style>
