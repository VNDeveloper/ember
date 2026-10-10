<script setup lang="ts">
import { Minus, Plus } from 'lucide-vue-next'
import { computed, useId } from 'vue'
import { BREAK_RANGE, FOCUS_RANGE, hasProgress, parseSession, PRESETS, stepSession } from '../core/timer'
import { useEmberStore } from '../stores/ember'

const ember = useEmberStore()
const id = useId()

const minutes = computed(() => parseSession(ember.settings.session) ?? { focus: 25, brk: 5 })
const presetLabel = (s: string) => s.replace('/', ' / ')
const step = (part: 'focus' | 'brk', dir: 1 | -1) => ember.setSession(stepSession(ember.settings.session, part, dir))
</script>

<template>
  <div class="ts">
    <div class="ts-row">
      <span :id="`${id}-preset`">Preset</span>
      <div class="seg ts-presets" role="radiogroup" :aria-labelledby="`${id}-preset`">
        <label v-for="p in PRESETS" :key="p" class="seg-opt">
          <input type="radio" :name="`${id}-session`" :value="p" :checked="ember.settings.session === p" @change="ember.setSession(p)" />{{ presetLabel(p) }}
        </label>
      </div>
    </div>
    <div class="ts-row">
      <span :id="`${id}-focus`">Focus</span>
      <div class="ts-stepper" role="group" :aria-labelledby="`${id}-focus`">
        <button class="btn btn-secondary btn-icon ts-focus-less" aria-label="Shorter focus" :disabled="minutes.focus <= FOCUS_RANGE.min" @click="step('focus', -1)">
          <Minus :size="16" :stroke-width="2.5" />
        </button>
        <span class="ts-value ts-focus tabular" aria-live="polite">{{ minutes.focus }} min</span>
        <button class="btn btn-secondary btn-icon ts-focus-more" aria-label="Longer focus" :disabled="minutes.focus >= FOCUS_RANGE.max" @click="step('focus', 1)">
          <Plus :size="16" :stroke-width="2.5" />
        </button>
      </div>
    </div>
    <div class="ts-row">
      <span :id="`${id}-break`">Break</span>
      <div class="ts-stepper" role="group" :aria-labelledby="`${id}-break`">
        <button class="btn btn-secondary btn-icon ts-break-less" aria-label="Shorter break" :disabled="minutes.brk <= BREAK_RANGE.min" @click="step('brk', -1)">
          <Minus :size="16" :stroke-width="2.5" />
        </button>
        <span class="ts-value ts-break tabular" aria-live="polite">{{ minutes.brk }} min</span>
        <button class="btn btn-secondary btn-icon ts-break-more" aria-label="Longer break" :disabled="minutes.brk >= BREAK_RANGE.max" @click="step('brk', 1)">
          <Plus :size="16" :stroke-width="2.5" />
        </button>
      </div>
    </div>
    <p v-if="ember.timer.running || hasProgress(ember.timer)" class="ts-note">Applies from the next session</p>
  </div>
</template>

<style scoped>
.ts { display: flex; flex-direction: column; gap: var(--space-2); }
.ts-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); font-size: 14px; }
.ts-stepper { display: flex; align-items: center; gap: var(--space-2); }
.ts-value { min-width: 64px; font-weight: 700; text-align: center; }
.ts-note { font-size: 12px; opacity: .8; }
</style>
