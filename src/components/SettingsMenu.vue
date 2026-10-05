<script setup lang="ts">
import { ChevronDown, Minus, Plus } from 'lucide-vue-next'
import { onBeforeUnmount, ref, watch } from 'vue'
import { plural } from '../core/format'
import type { SessionLength } from '../core/model'
import { clampWallWeeks, stepWallWeeks, WALL_WEEKS_MAX, WALL_WEEKS_MIN } from '../core/settings'
import { useEmberStore } from '../stores/ember'
import { useUiStore } from '../stores/ui'

const ember = useEmberStore()
const ui = useUiStore()

const root = ref<HTMLElement | null>(null)
const SESSIONS: [SessionLength, string][] = [['25/5', '25 / 5'], ['50/10', '50 / 10']]

const weeks = () => clampWallWeeks(ember.settings.wallWeeks)
const stepWeeks = (delta: number) => ember.updateSettings({ wallWeeks: stepWallWeeks(ember.settings.wallWeeks, delta) })

/** Clicking anywhere outside closes the panel. */
function onPointerDown(e: PointerEvent | MouseEvent) {
  if (root.value && e.target instanceof Node && !root.value.contains(e.target)) ui.settingsMenuOpen = false
}
watch(() => ui.settingsMenuOpen, (open) => {
  if (open) document.addEventListener('pointerdown', onPointerDown)
  else document.removeEventListener('pointerdown', onPointerDown)
}, { immediate: true })
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown))
</script>

<template>
  <div ref="root" class="settings-menu">
    <button class="sm-toggle" :aria-expanded="ui.settingsMenuOpen" aria-controls="ember-settings-panel" @click="ui.settingsMenuOpen = !ui.settingsMenuOpen">
      Settings<ChevronDown :size="14" :stroke-width="2.5" :class="{ 'is-open': ui.settingsMenuOpen }" />
    </button>
    <div v-if="ui.settingsMenuOpen" id="ember-settings-panel" class="sm-panel" role="region" aria-label="Settings">
      <section class="sm-group" aria-labelledby="sm-timer">
        <span id="sm-timer" class="section-label">Timer</span>
        <div class="sm-row">
          <span id="sm-session-label">Session</span>
          <div class="seg sm-session" role="radiogroup" aria-labelledby="sm-session-label">
            <label v-for="[value, label] in SESSIONS" :key="value" class="seg-opt">
              <input type="radio" name="ember-session" :value="value" :checked="ember.settings.session === value" @change="ember.setSession(value)" />{{ label }}
            </label>
          </div>
        </div>
        <p v-if="ember.timer.running" class="sm-note sm-session-note">Applies from the next session</p>
        <div class="sm-row">
          <span>Demo speed</span>
          <button
            class="flag-toggle sm-demo"
            :class="{ 'is-on': ember.demo }"
            aria-label="Demo speed"
            :aria-pressed="ember.demo"
            :disabled="ember.demoFromUrl"
            @click="ember.updateSettings({ demo: !ember.settings.demo })"
          >
            {{ ember.demo ? 'On' : 'Off' }}
          </button>
        </div>
        <p v-if="ember.demoFromUrl" class="sm-note sm-demo-note">On from the link (?demo=1)</p>
        <p v-else class="sm-note">25 minutes run in about 25 seconds.</p>
      </section>

      <section class="sm-group" aria-labelledby="sm-charts">
        <span id="sm-charts" class="section-label">Charts</span>
        <div class="sm-row">
          <span>Show future days</span>
          <button
            class="flag-toggle sm-future"
            :class="{ 'is-on': ember.settings.showFuture }"
            aria-label="Show future days"
            :aria-pressed="ember.settings.showFuture"
            @click="ember.updateSettings({ showFuture: !ember.settings.showFuture })"
          >
            {{ ember.settings.showFuture ? 'On' : 'Off' }}
          </button>
        </div>
        <div class="sm-row">
          <span>Done wall</span>
          <div class="sm-stepper">
            <button class="btn btn-secondary btn-icon sm-weeks-less" aria-label="One week fewer" :disabled="weeks() <= WALL_WEEKS_MIN" @click="stepWeeks(-1)">
              <Minus :size="16" :stroke-width="2.5" />
            </button>
            <span class="sm-weeks tabular" aria-live="polite">{{ plural(weeks(), 'week') }}</span>
            <button class="btn btn-secondary btn-icon sm-weeks-more" aria-label="One week more" :disabled="weeks() >= WALL_WEEKS_MAX" @click="stepWeeks(1)">
              <Plus :size="16" :stroke-width="2.5" />
            </button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.settings-menu { position: relative; }
.sm-toggle {
  display: inline-flex; align-items: center; gap: 4px; padding: 4px 0;
  border: 0; border-bottom: 2px solid transparent; background: none;
  font-size: 13px; font-weight: 700; color: var(--color-text);
}
.sm-toggle:hover, .sm-toggle[aria-expanded='true'] { color: var(--color-accent); }
.sm-toggle svg { transition: transform .15s; }
.sm-toggle svg.is-open { transform: rotate(180deg); }
.sm-panel {
  position: absolute; top: calc(100% + var(--space-2)); right: 0; z-index: 50;
  width: min(320px, calc(100vw - 2 * var(--space-4)));
  display: flex; flex-direction: column; padding: var(--space-4);
  background: var(--color-surface); border: 2px solid var(--color-text);
}
.sm-group { display: flex; flex-direction: column; gap: var(--space-2); }
.sm-group + .sm-group { margin-top: var(--space-4); padding-top: var(--space-4); border-top: 1px solid var(--color-divider); }
.sm-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); font-size: 14px; }
.sm-note { font-size: 12px; color: var(--color-neutral-700); }
.sm-stepper { display: flex; align-items: center; gap: var(--space-2); }
.sm-weeks { min-width: 64px; font-weight: 700; text-align: center; }
</style>
