<script setup lang="ts">
import { Check, ChevronDown, Volume2, VolumeX, X } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useDialogFocus } from '../composables/useDialogFocus'
import { useYouTubePlayer } from '../composables/useYouTubePlayer'
import { clock } from '../core/format'
import { describeSelection, nextStepText } from '../core/selection'
import { phaseLabel, progress, startLabel } from '../core/timer'
import { ytId } from '../core/youtube'
import { useEmberStore } from '../stores/ember'
import { useUiStore } from '../stores/ui'

const ember = useEmberStore()
const ui = useUiStore()

const root = ref<HTMLElement | null>(null)
const startButton = ref<HTMLElement | null>(null)
const host = ref<HTMLElement | null>(null)
const { onKeydown } = useDialogFocus(root, startButton)

const session = computed(() => ember.settings.session)
const info = computed(() => describeSelection(ember.goals, ember.tasks, ember.selection, ember.tally.spent))
const thenText = computed(() => nextStepText(ember.goals, ember.selection))
const canMarkDone = computed(() => !info.value.empty && ember.timer.phase === 'focus')
const pct = computed(() => `${Math.round(Math.min(1, Math.max(0, progress(ember.timer, ember.now))) * 100_000) / 1000}%`)

const currentId = computed(() => ytId(ember.settings.youtubeUrl))
const videoId = computed(() => (ember.settings.focusBg === 'video' ? currentId.value : null))
const muted = computed(() => ember.settings.muted)
useYouTubePlayer(host, videoId, muted)

const draft = ref('')
const linkError = ref(false)

function play() {
  const value = draft.value.trim()
  if (!value) return
  if (!ytId(value)) {
    linkError.value = true
    return
  }
  ember.updateSettings({ youtubeUrl: value, focusBg: 'video' })
  draft.value = ''
  linkError.value = false
}

function onLinkEnter(e: KeyboardEvent) {
  if (!e.isComposing) play()
}

let previousOverflow = ''
onMounted(() => {
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
})
onBeforeUnmount(() => {
  document.body.style.overflow = previousOverflow
})
</script>

<template>
  <div ref="root" class="focus-mode" role="dialog" aria-modal="true" aria-label="Focus mode" @keydown="onKeydown">
    <div v-if="videoId" class="fm-video" aria-hidden="true"><div ref="host" class="fm-player"></div></div>
    <div class="fm-scrim" aria-hidden="true"></div>

    <div class="fm-top">
      <span class="fm-brand">Ember</span>
      <span class="fm-label">Focus mode</span>
      <button class="btn btn-ghost fm-ghost fm-exit" @click="ui.closeFocusMode()"><X :size="16" :stroke-width="2.5" />Exit · Esc</button>
    </div>

    <div class="fm-center">
      <span class="fm-phase">{{ phaseLabel(ember.timer, session) }}</span>
      <span class="fm-time tabular">{{ clock(ember.remaining) }}</span>
      <div class="fm-sel">
        <button class="fm-title" title="Change what you're focusing on" @click="ui.openPicker(ember.selection)">
          <span>{{ info.title }}</span><ChevronDown :size="28" :stroke-width="2.5" />
        </button>
        <span class="fm-sub">{{ info.sub }}</span>
        <span v-if="thenText" class="fm-then">{{ thenText }}</span>
      </div>
      <div class="fm-actions">
        <button ref="startButton" class="btn btn-primary fm-start" @click="ember.startPause()">{{ startLabel(ember.timer, session) }}</button>
        <button v-if="canMarkDone" class="btn btn-secondary btn-outline-current fm-done" @click="ember.completeSelected()">
          <Check :size="16" :stroke-width="3" />Mark done
        </button>
        <button v-if="ember.timer.phase === 'break'" class="btn btn-ghost fm-ghost fm-skip" @click="ember.skipBreak()">Skip break</button>
      </div>
    </div>

    <div class="fm-bottom">
      <span class="fm-bg-label">Background</span>
      <div class="seg fm-bg" role="radiogroup" aria-label="Background">
        <label class="seg-opt">
          <input type="radio" name="ember-bg" value="video" :checked="ember.settings.focusBg === 'video'" @change="ember.updateSettings({ focusBg: 'video' })" />Video
        </label>
        <label class="seg-opt">
          <input type="radio" name="ember-bg" value="off" :checked="ember.settings.focusBg === 'off'" @change="ember.updateSettings({ focusBg: 'off' })" />Off
        </label>
      </div>
      <button class="btn btn-ghost fm-ghost fm-sound" :aria-pressed="!muted" @click="ember.updateSettings({ muted: !muted })">
        <VolumeX v-if="muted" :size="16" :stroke-width="2.25" /><Volume2 v-else :size="16" :stroke-width="2.25" />{{ muted ? 'Sound off' : 'Sound on' }}
      </button>
      <div class="fm-link">
        <input
          v-model="draft"
          class="input fm-input"
          placeholder="Paste a YouTube link"
          aria-label="YouTube link"
          @input="linkError = false"
          @keydown.enter="onLinkEnter"
        />
        <button class="btn btn-primary fm-play" @click="play">Play</button>
      </div>
      <span class="fm-now">Now: {{ currentId ? `youtu.be/${currentId}` : 'No video' }}<b v-if="linkError"> · That doesn't look like a YouTube link</b></span>
    </div>

    <div class="fm-progress"><div class="fm-progress-fill" :style="{ width: pct }"></div></div>
  </div>
</template>

<style scoped>
.focus-mode {
  position: fixed; inset: 0; z-index: 100; overflow: hidden;
  display: grid; grid-template-rows: auto minmax(0, 1fr) auto auto;
  background: var(--color-text); color: var(--color-bg);
}
.fm-video { position: absolute; inset: 0; overflow: hidden; pointer-events: none; filter: grayscale(1); }
.fm-player { position: absolute; inset: 0; }
.fm-player :deep(iframe) {
  position: absolute; top: 50%; left: 50%; border: 0;
  width: max(100vw, 177.78vh); height: max(100vh, 56.25vw); transform: translate(-50%, -50%);
}
.fm-scrim { position: absolute; inset: 0; pointer-events: none; background: color-mix(in oklch, var(--color-text) 62%, transparent); }

.fm-top {
  position: relative; display: flex; align-items: center; gap: var(--space-4);
  padding: var(--space-4) var(--space-8); border-bottom: 2px solid color-mix(in oklch, var(--color-bg) 35%, transparent);
}
.fm-brand { font: 800 18px/1 var(--font-heading); }
.fm-label { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
.fm-ghost { color: inherit; }
.fm-exit { margin-left: auto; }

.fm-center { position: relative; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: var(--space-4); padding: var(--space-8); }
.fm-phase { font-size: 13px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.fm-time { font: 800 clamp(96px, 18vw, 220px)/.85 var(--font-heading); letter-spacing: -.04em; }
.fm-sel { display: flex; flex-direction: column; gap: 6px; max-width: 900px; }
.fm-title {
  display: flex; align-items: center; gap: var(--space-3); align-self: flex-start; max-width: 100%;
  padding: 0; border: 0; border-bottom: 2px solid transparent; background: none;
  font: 800 clamp(24px, 3vw, 40px)/1.1 var(--font-heading); color: inherit; text-align: left;
}
.fm-title:hover { border-bottom-color: var(--color-accent); }
.fm-title span { overflow-wrap: anywhere; text-wrap: pretty; }
.fm-title svg { flex: none; }
.fm-sub { font-size: 15px; }
.fm-then { font-size: 15px; opacity: .85; }
.fm-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-4); }
.fm-start { min-width: 160px; }

.fm-bottom {
  position: relative; display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3) var(--space-4);
  padding: var(--space-4) var(--space-8);
  border-top: 2px solid color-mix(in oklch, var(--color-bg) 35%, transparent);
  background: color-mix(in oklch, var(--color-text) 70%, transparent);
}
.fm-bg-label { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
/* On ink, the checked segment is bg-coloured so it stays visible. */
.fm-bg { border-color: color-mix(in oklch, var(--color-bg) 45%, transparent); }
.fm-bg .seg-opt + .seg-opt { border-left-color: color-mix(in oklch, var(--color-bg) 45%, transparent); }
.fm-bg .seg-opt:has(input:checked) { background: var(--color-bg); color: var(--color-text); }
.fm-bg .seg-opt:not(:has(input:checked)):hover { background: color-mix(in srgb, var(--color-bg) 12%, transparent); }
.fm-link { display: flex; gap: var(--space-2); flex: 1 1 320px; max-width: 520px; margin-left: auto; }
.fm-input { background: var(--color-bg); color: var(--color-text); }
.fm-now { flex-basis: 100%; font-size: 12px; overflow-wrap: anywhere; }

.fm-progress { position: relative; height: 6px; background: color-mix(in oklch, var(--color-bg) 25%, transparent); }
.fm-progress-fill { height: 100%; background: var(--color-accent); transition: width .25s linear; }

@media (max-width: 560px) {
  .fm-top, .fm-center, .fm-bottom { padding-left: var(--space-4); padding-right: var(--space-4); }
  .fm-time { font-size: 88px; }
  .fm-link { flex-basis: 100%; margin-left: 0; }
}
</style>
