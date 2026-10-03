<script setup lang="ts">
import { ChevronDown, Pause, Play, Scan } from 'lucide-vue-next'
import { computed } from 'vue'
import { clock, fmtM, plural } from '../core/format'
import { describeSelection, targetTitle } from '../core/selection'
import { canReset, phaseLabel, progress, startLabel } from '../core/timer'
import { useEmberStore } from '../stores/ember'
import { useUiStore } from '../stores/ui'

const ember = useEmberStore()
const ui = useUiStore()

const session = computed(() => ember.settings.session)
const info = computed(() => describeSelection(ember.goals, ember.tasks, ember.selection, ember.tally.spent))
const state = computed(() => {
  if (ember.timer.phase === 'break') return 'break'
  return ember.timer.running ? 'focusing' : 'idle'
})
const todayText = computed(() => `${plural(ember.tally.sessionsToday, 'session')} · ${fmtM(ember.tally.minutesToday)} today`)
const pct = computed(() => `${Math.round(Math.min(1, Math.max(0, progress(ember.timer, ember.now))) * 100_000) / 1000}%`)
const showToast = computed(() => ember.completions > 0 && ember.timer.phase === 'break')
const toastText = computed(() => {
  const l = ember.lastLog
  return l ? `+${fmtM(l.min)} · ${targetTitle(ember.goals, ember.tasks, l.target)}` : ''
})
</script>

<template>
  <div class="focus-bar" :class="`is-${state}`">
    <div class="fb-row">
      <span class="fb-time tabular">{{ clock(ember.remaining) }}</span>
      <div class="fb-stack">
        <span class="fb-phase">{{ phaseLabel(ember.timer, session) }}</span>
        <button class="fb-title" title="Change what you're focusing on" @click="ui.openPicker(ember.selection)">
          <span>{{ info.title }}</span>
          <ChevronDown :size="16" :stroke-width="2.5" />
        </button>
        <span class="fb-sub">{{ info.sub }}</span>
      </div>
      <div class="fb-meta">
        <span v-if="ember.demo" class="tag tag-accent fb-demo" title="25 minutes run in about 25 seconds.">Demo speed</span>
        <span class="fb-today tabular">{{ todayText }}</span>
      </div>
      <div class="fb-actions">
        <button class="btn btn-primary fb-start" @click="ember.startPause()">
          <Pause v-if="ember.timer.running" :size="16" fill="currentColor" :stroke-width="0" />
          <Play v-else :size="16" fill="currentColor" :stroke-width="0" />
          {{ startLabel(ember.timer, session) }}
        </button>
        <button
          class="btn btn-secondary btn-icon btn-outline-current"
          aria-label="Focus mode"
          title="Focus mode — full screen"
          @click="ui.openFocusMode()"
        >
          <Scan :size="16" :stroke-width="2.25" />
        </button>
        <button v-if="canReset(ember.timer, session)" class="btn btn-ghost fb-ghost fb-reset" @click="ember.resetTimer()">Reset</button>
        <button v-if="ember.timer.phase === 'break'" class="btn btn-ghost fb-ghost fb-skip" @click="ember.skipBreak()">Skip break</button>
      </div>
    </div>
    <div class="fb-progress"><div class="fb-progress-fill" :style="{ width: pct }"></div></div>
    <div v-if="showToast" :key="ember.completions" class="fb-toast">{{ toastText }}</div>
  </div>
</template>

<style scoped>
.focus-bar {
  --fb-sub: var(--color-neutral-700);
  position: relative; display: flex; flex-direction: column;
  background: var(--color-neutral-200); color: var(--color-text); transition: background .3s;
}
.focus-bar.is-focusing { --fb-sub: var(--color-neutral-400); background: var(--color-text); color: var(--color-bg); }
.focus-bar.is-break { background: var(--color-accent-100); }

.fb-row {
  display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; gap: var(--space-6);
  align-items: center; padding: var(--space-3) var(--space-6);
}
.fb-time { font: 800 40px/1 var(--font-heading); letter-spacing: -.02em; }
.fb-stack { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.fb-phase { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--fb-sub); }
.fb-title {
  display: flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; align-self: flex-start;
  padding: 0; border: 0; border-bottom: 2px solid transparent; background: none;
  font-size: 16px; font-weight: 700; color: inherit; text-align: left;
}
.fb-title:hover { border-bottom-color: var(--color-accent); }
.fb-title span { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fb-title svg { flex: none; }
.fb-sub { font-size: 12px; color: var(--fb-sub); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fb-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.fb-today { font-size: 13px; color: var(--fb-sub); white-space: nowrap; }
.fb-actions { display: flex; gap: var(--space-2); }
.fb-ghost { color: inherit; }

.fb-progress { height: 4px; background: var(--color-neutral-300); }
.fb-progress-fill { height: 100%; background: var(--color-accent); transition: width .25s linear; }

.fb-toast {
  position: absolute; left: var(--space-6); bottom: -30px; z-index: 2;
  max-width: calc(100% - 2 * var(--space-6));
  font: 800 16px/1 var(--font-heading); color: var(--color-accent-700);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none;
  animation: float0 1.6s ease-out forwards;
}

@media (max-width: 760px) {
  .fb-row { grid-template-columns: auto minmax(0, 1fr); gap: var(--space-3) var(--space-4); padding: var(--space-3) var(--space-4); }
  .fb-time { font-size: 32px; }
  .fb-meta { grid-column: 1 / -1; flex-direction: row; align-items: center; gap: var(--space-2); }
  .fb-actions { grid-column: 1 / -1; flex-wrap: wrap; }
  .fb-toast { left: var(--space-4); max-width: calc(100% - 2 * var(--space-4)); }
}
</style>
