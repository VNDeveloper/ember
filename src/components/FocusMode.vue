<script setup lang="ts">
import { Check, ChevronDown, Pause, Play, SkipForward, SlidersHorizontal, Volume2, VolumeX, X } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useDialogFocus } from '../composables/useDialogFocus'
import { useYouTubePlayer } from '../composables/useYouTubePlayer'
import { hideFocusUI } from '../core/focusMode'
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
const settingsButton = ref<HTMLElement | null>(null)
const linkInput = ref<HTMLInputElement | null>(null)
const host = ref<HTMLElement | null>(null)
const { onKeydown } = useDialogFocus(root, startButton)

const session = computed(() => ember.settings.session)
const info = computed(() => describeSelection(ember.goals, ember.tasks, ember.selection, ember.tally.spent))
const itemSub = computed(() => nextStepText(ember.goals, ember.selection) || info.value.sub)
const canMarkDone = computed(() => !info.value.empty && ember.timer.phase === 'focus')
const pct = computed(() => `${Math.round(Math.min(1, Math.max(0, progress(ember.timer, ember.now))) * 100_000) / 1000}%`)
const startText = computed(() => startLabel(ember.timer, session.value))

const currentId = computed(() => ytId(ember.settings.youtubeUrl))
const videoId = computed(() => (ember.settings.focusBg === 'video' ? currentId.value : null))
const muted = computed(() => ember.settings.muted)
useYouTubePlayer(host, videoId, muted)

/** Auto-hide: any pointer or key activity shows the controls for another 3 seconds. */
const IDLE_MS = 3000
const idle = ref(false)
let idleTimer: ReturnType<typeof setTimeout> | undefined
function wake(e?: Event) {
  // While hidden, the first Enter/Space on a focused control only reveals the controls; it never acts unseen.
  if (hideUI.value && e instanceof KeyboardEvent && (e.key === 'Enter' || e.key === ' ') && e.target instanceof HTMLButtonElement) {
    e.preventDefault()
  }
  idle.value = false
  clearTimeout(idleTimer)
  idleTimer = setTimeout(() => { idle.value = true }, IDLE_MS)
}
const ACTIVITY = ['mousemove', 'click', 'pointerdown', 'keydown'] as const
const hideUI = computed(() =>
  hideFocusUI({ running: ember.timer.running, idle: idle.value, settingsOpen: ui.fmSettingsOpen, pickerOpen: ui.pickerOpen }),
)

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

/** Focus the link field on open; give focus back to the settings button when the panel closes. */
watch(() => ui.fmSettingsOpen, async (open) => {
  await nextTick()
  if (open) linkInput.value?.focus()
  else if (!document.activeElement || document.activeElement === document.body) settingsButton.value?.focus()
})

/** Skip break or Mark done can vanish under keyboard focus (phase change, last step done): keep focus on Play/Pause. */
watch([() => ember.timer.phase, canMarkDone], async () => {
  await nextTick()
  if (!document.activeElement || document.activeElement === document.body) startButton.value?.focus()
})

let previousOverflow = ''
onMounted(() => {
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  for (const type of ACTIVITY) document.addEventListener(type, wake, true)
  wake()
})
onBeforeUnmount(() => {
  document.body.style.overflow = previousOverflow
  for (const type of ACTIVITY) document.removeEventListener(type, wake, true)
  clearTimeout(idleTimer)
})
</script>

<template>
  <div
    ref="root"
    class="focus-mode"
    :class="{ 'ui-hidden': hideUI }"
    role="dialog"
    aria-modal="true"
    aria-label="Focus mode"
    @keydown="onKeydown"
  >
    <div v-if="videoId" class="fm-video" aria-hidden="true"><div ref="host" class="fm-player"></div></div>
    <div class="fm-gradient" aria-hidden="true"></div>

    <div class="fm-center">
      <span class="fm-time tabular">{{ clock(ember.remaining) }}</span>
      <div class="fm-bar"><div class="fm-bar-fill" :style="{ width: pct }"></div></div>
      <span class="fm-phase fm-chrome">{{ phaseLabel(ember.timer, session) }}</span>
    </div>

    <div class="fm-tr fm-chrome">
      <div class="fm-panel fm-group">
        <button
          ref="settingsButton"
          class="fm-icon fm-settings-btn"
          aria-label="Video settings"
          title="Video settings"
          aria-controls="fm-settings"
          :aria-expanded="ui.fmSettingsOpen"
          @click="ui.fmSettingsOpen = !ui.fmSettingsOpen"
        >
          <SlidersHorizontal :size="18" :stroke-width="2.25" />
        </button>
        <button
          class="fm-icon fm-sound"
          aria-label="Sound"
          :title="muted ? 'Sound off' : 'Sound on'"
          :aria-pressed="!muted"
          @click="ember.updateSettings({ muted: !muted })"
        >
          <VolumeX v-if="muted" :size="18" :stroke-width="2.25" /><Volume2 v-else :size="18" :stroke-width="2.25" />
        </button>
        <button class="fm-icon fm-exit" aria-label="Exit Focus mode" title="Exit · Esc" @click="ui.closeFocusMode()">
          <X :size="18" :stroke-width="2.5" />
        </button>
      </div>

      <div v-if="ui.fmSettingsOpen" id="fm-settings" class="fm-panel fm-settings">
        <div class="fm-bg-row">
          <span class="fm-bg-label">Background</span>
          <div class="seg fm-bg" role="radiogroup" aria-label="Background">
            <label class="seg-opt">
              <input type="radio" name="ember-bg" value="video" :checked="ember.settings.focusBg === 'video'" @change="ember.updateSettings({ focusBg: 'video' })" />Video
            </label>
            <label class="seg-opt">
              <input type="radio" name="ember-bg" value="off" :checked="ember.settings.focusBg === 'off'" @change="ember.updateSettings({ focusBg: 'off' })" />Off
            </label>
          </div>
        </div>
        <div class="fm-link">
          <input
            ref="linkInput"
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
    </div>

    <div class="fm-panel fm-bl fm-chrome">
      <button ref="startButton" class="fm-icon fm-start" :aria-label="startText" :title="startText" @click="ember.startPause()">
        <Pause v-if="ember.timer.running" :size="18" :stroke-width="2.5" /><Play v-else :size="18" :stroke-width="2.5" />
      </button>
      <button v-if="canMarkDone" class="fm-icon fm-outline fm-done" aria-label="Mark done" title="Mark done" @click="ember.completeSelected()">
        <Check :size="18" :stroke-width="3" />
      </button>
      <button v-if="ember.timer.phase === 'break'" class="fm-icon fm-outline fm-skip" aria-label="Skip break" title="Skip break" @click="ember.skipBreak()">
        <SkipForward :size="18" :stroke-width="2.25" />
      </button>
      <button class="fm-item" title="Change what you're focusing on" @click="ui.openPicker(ember.selection)">
        <span class="fm-item-line"><span class="fm-item-title">{{ info.title }}</span><ChevronDown :size="16" :stroke-width="2.5" /></span>
        <span class="fm-item-sub">{{ itemSub }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.focus-mode {
  --fm-ink: var(--color-text);
  --fm-light: var(--color-bg);
  position: fixed; inset: 0; z-index: 100; overflow: hidden;
  background: var(--fm-ink); color: var(--fm-light);
}
.focus-mode.ui-hidden { cursor: none; }

.fm-video { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.fm-player { position: absolute; inset: 0; }
.fm-player :deep(iframe) {
  position: absolute; top: 50%; left: 50%; border: 0;
  width: max(100vw, 177.78vh); height: max(100vh, 56.25vw); transform: translate(-50%, -50%);
}
/* The one darkening layer: bottom 40% only, so the controls read on bright footage. */
.fm-gradient {
  position: absolute; left: 0; right: 0; bottom: 0; height: 40%; pointer-events: none;
  background: linear-gradient(to top, color-mix(in oklch, var(--fm-ink) 55%, transparent), transparent);
}

.fm-center {
  position: absolute; inset: 0; pointer-events: none;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-3);
}
.fm-time {
  font: 600 clamp(56px, 9vw, 120px)/1 var(--font-heading); letter-spacing: -.03em;
  text-shadow: 0 2px 24px color-mix(in oklch, var(--fm-ink) 60%, transparent);
}
.fm-bar { width: clamp(160px, 18vw, 260px); height: 3px; background: color-mix(in oklch, var(--fm-light) 30%, transparent); }
.fm-bar-fill { height: 100%; background: var(--fm-light); transition: width .25s linear; }
.fm-phase {
  font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
  text-shadow: 0 1px 12px color-mix(in oklch, var(--fm-ink) 60%, transparent);
}

/* Controls that fade out while a session runs and nobody is using them. */
.fm-chrome { transition: opacity .4s; }
.ui-hidden .fm-chrome { opacity: 0; pointer-events: none; }

.fm-panel {
  background: color-mix(in oklch, var(--fm-ink) 72%, transparent);
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
}
.fm-tr { position: absolute; top: var(--space-6); right: var(--space-6); display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-2); }
.fm-group { display: flex; }

.fm-icon {
  flex: none; display: grid; place-items: center; width: 40px; height: 40px; padding: 0;
  border: 2px solid transparent; background: transparent; color: inherit; cursor: pointer;
}
.fm-icon:hover { background: color-mix(in srgb, var(--fm-light) 12%, transparent); }
.fm-start { background: var(--color-accent); color: var(--fm-light); }
.fm-start:hover { background: var(--color-accent-600); }
.fm-outline { border-color: currentColor; }

.fm-settings { width: min(360px, calc(100vw - 48px)); padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-3); }
.fm-bg-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.fm-bg-label { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
/* On ink, the checked segment is bg-coloured so it stays visible. */
.fm-bg { border-color: color-mix(in oklch, var(--fm-light) 45%, transparent); }
.fm-bg .seg-opt + .seg-opt { border-left-color: color-mix(in oklch, var(--fm-light) 45%, transparent); }
.fm-bg .seg-opt:has(input:checked) { background: var(--fm-light); color: var(--fm-ink); }
.fm-bg .seg-opt:not(:has(input:checked)):hover { background: color-mix(in srgb, var(--fm-light) 12%, transparent); }
.fm-link { display: flex; gap: var(--space-2); }
.fm-input { flex: 1; min-width: 0; background: var(--fm-light); color: var(--fm-ink); }
/* 16px stops iOS Safari zooming the fixed overlay when the field is focused. */
@media (max-width: 560px) { .fm-input { font-size: 16px; } }
.fm-now { font-size: 12px; overflow-wrap: anywhere; }

.fm-bl {
  position: absolute; left: var(--space-6); bottom: var(--space-6);
  width: min(380px, calc(100vw - 48px)); padding: var(--space-2);
  display: flex; align-items: center; gap: 8px;
}
.fm-item {
  flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; align-self: stretch; justify-content: center;
  padding: 0 var(--space-2); border: 0; background: none; color: inherit; text-align: left; cursor: pointer;
}
.fm-item:hover { background: color-mix(in srgb, var(--fm-light) 12%, transparent); }
.fm-item-line { display: flex; align-items: center; gap: 4px; min-width: 0; }
.fm-item-line svg { flex: none; }
.fm-item-title { font: 700 14px/1.2 var(--font-heading); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fm-item-sub { font-size: 12px; opacity: .8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

@media (max-width: 560px) {
  .fm-tr { top: var(--space-4); right: var(--space-4); }
  .fm-bl { left: var(--space-4); bottom: var(--space-4); width: calc(100vw - 32px); }
  .fm-settings { width: calc(100vw - 32px); }
}

@media (prefers-reduced-motion: reduce) {
  .fm-chrome, .fm-bar-fill { transition: none; }
}
</style>
