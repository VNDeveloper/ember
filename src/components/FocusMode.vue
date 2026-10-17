<script setup lang="ts">
import { BookOpen, Check, ChevronDown, CirclePause, CirclePlay, ExternalLink, Pause, Play, RotateCcw, SkipForward, SlidersHorizontal, Volume2, VolumeX, X } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useDialogFocus } from '../composables/useDialogFocus'
import { useYouTubePlayer } from '../composables/useYouTubePlayer'
import { hideFocusUI, videoOnTimer } from '../core/focusMode'
import { clampVolume } from '../core/settings'
import { clock } from '../core/format'
import type { Resource } from '../core/model'
import { TYPE_LABEL, goalResources } from '../core/resources'
import { describeSelection, nextStepText, selectionGoalId } from '../core/selection'
import { canReset, phaseLabel, progress, startLabel } from '../core/timer'
import { ytId } from '../core/youtube'
import { useEmberStore } from '../stores/ember'
import { useUiStore } from '../stores/ui'
import SoundSettings from './SoundSettings.vue'
import TimerSettings from './TimerSettings.vue'

const ember = useEmberStore()
const ui = useUiStore()

const root = ref<HTMLElement | null>(null)
const startButton = ref<HTMLElement | null>(null)
const settingsButton = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const host = ref<HTMLElement | null>(null)
const { onKeydown } = useDialogFocus(root, startButton)

const info = computed(() => describeSelection(ember.goals, ember.tasks, ember.selection, ember.tally.spent))
const itemSub = computed(() => nextStepText(ember.goals, ember.selection) || info.value.sub)
const canMarkDone = computed(() => !info.value.empty && ember.timer.phase === 'focus')
const pct = computed(() => `${Math.round(Math.min(1, Math.max(0, progress(ember.timer, ember.now))) * 100_000) / 1000}%`)
const startText = computed(() => startLabel(ember.timer))

/** The selected goal's in-use resources, a click away without leaving the timer. */
const resGoal = computed(() => {
  const id = selectionGoalId(ember.goals, ember.tasks, ember.selection)
  return id ? ember.goals.find((g) => g.id === id) ?? null : null
})
const res = computed(() => (resGoal.value ? goalResources(ember.resources, resGoal.value.id) : []))
const resSub = (r: Resource) => [r.company, TYPE_LABEL[r.type], r.notes].filter(Boolean).join(' · ')
watch(() => res.value.length, (n) => { if (!n) ui.fmResourcesOpen = false })

const currentId = computed(() => ytId(ember.settings.youtubeUrl))
const videoId = computed(() => (ember.settings.focusBg === 'video' ? currentId.value : null))
const muted = computed(() => ember.settings.muted)
const volume = computed(() => clampVolume(ember.settings.volume))
const videoPaused = computed(() => ui.video.paused)
const { failed: videoFailed } = useYouTubePlayer(host, videoId, { muted, volume, paused: videoPaused })

function toggleVideo() {
  ui.video = { paused: !ui.video.paused, auto: false }
}

/** Turning sound on at zero volume would stay silent: bring the volume back up too. */
function toggleSound() {
  if (muted.value && volume.value === 0) ember.updateSettings({ muted: false, volume: 50 })
  else ember.updateSettings({ muted: !muted.value })
}

/** Dragging the volume turns sound on; dragging it to zero turns it off. */
function setVolume(e: Event) {
  const v = clampVolume(Number((e.target as HTMLInputElement).value))
  ember.updateSettings({ volume: v, muted: v === 0 })
}

/** The video pauses when a focus session ends and plays again when the next one starts. */
watch(
  () => ({ phase: ember.timer.phase, running: ember.timer.running }),
  (next, prev) => { ui.video = videoOnTimer(prev, next, ui.video) },
)

/** Auto-hide: any pointer or key activity shows the controls for another 3 seconds; the mouse leaving the window hides them at once. */
const IDLE_MS = 3000
const idle = ref(false)
const pointerOut = ref(false)
let idleTimer: ReturnType<typeof setTimeout> | undefined
function wake(e?: Event) {
  // While hidden, the first Enter/Space on a focused control only reveals the controls; it never acts unseen.
  if (hideUI.value && e instanceof KeyboardEvent && (e.key === 'Enter' || e.key === ' ') && e.target instanceof HTMLButtonElement) {
    e.preventDefault()
  }
  idle.value = false
  pointerOut.value = false
  clearTimeout(idleTimer)
  idleTimer = setTimeout(() => { idle.value = true }, IDLE_MS)
}
const ACTIVITY = ['mousemove', 'click', 'pointerdown', 'keydown'] as const
const onPointerLeave = () => { pointerOut.value = true }
const onPointerEnter = () => { pointerOut.value = false }
const hideUI = computed(() =>
  hideFocusUI({ running: ember.timer.running, idle: idle.value, settingsOpen: ui.fmSettingsOpen, pickerOpen: ui.pickerOpen, pointerOut: pointerOut.value }),
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

/** Focus the panel's first control on open; give focus back to the settings button when the panel closes. */
watch(() => ui.fmSettingsOpen, async (open) => {
  await nextTick()
  if (open) panel.value?.querySelector<HTMLElement>('input, select, button')?.focus()
  else if (!document.activeElement || document.activeElement === document.body) settingsButton.value?.focus()
})

/** Skip break, Mark done or Reset can vanish under keyboard focus (phase change, last step done, reset): keep focus on Play/Pause. */
watch([() => ember.timer.phase, canMarkDone, () => canReset(ember.timer)], async () => {
  await nextTick()
  if (!document.activeElement || document.activeElement === document.body) startButton.value?.focus()
})

let previousOverflow = ''
onMounted(() => {
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  for (const type of ACTIVITY) document.addEventListener(type, wake, true)
  document.documentElement.addEventListener('mouseleave', onPointerLeave)
  document.documentElement.addEventListener('mouseenter', onPointerEnter)
  wake()
})
onBeforeUnmount(() => {
  document.body.style.overflow = previousOverflow
  for (const type of ACTIVITY) document.removeEventListener(type, wake, true)
  document.documentElement.removeEventListener('mouseleave', onPointerLeave)
  document.documentElement.removeEventListener('mouseenter', onPointerEnter)
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
      <span class="fm-phase fm-chrome">{{ phaseLabel(ember.timer) }}</span>
    </div>

    <div class="fm-tr fm-chrome">
      <div class="fm-panel fm-group">
        <button
          v-if="videoId"
          class="fm-icon fm-video-btn"
          :aria-label="videoPaused ? 'Play video' : 'Pause video'"
          :title="videoPaused ? 'Play video' : 'Pause video'"
          @click="toggleVideo"
        >
          <CirclePlay v-if="videoPaused" :size="18" :stroke-width="2.25" /><CirclePause v-else :size="18" :stroke-width="2.25" />
        </button>
        <button
          class="fm-icon fm-sound"
          aria-label="Sound"
          :title="muted ? 'Sound off' : 'Sound on'"
          :aria-pressed="!muted"
          @click="toggleSound"
        >
          <VolumeX v-if="muted" :size="18" :stroke-width="2.25" /><Volume2 v-else :size="18" :stroke-width="2.25" />
        </button>
        <input
          v-if="videoId"
          class="fm-volume"
          type="range"
          min="0"
          max="100"
          step="1"
          aria-label="Volume"
          :title="`Volume ${muted ? 0 : volume}%`"
          :value="muted ? 0 : volume"
          :style="{ '--fill': `${muted ? 0 : volume}%` }"
          @input="setVolume"
        />
        <button
          ref="settingsButton"
          class="fm-icon fm-settings-btn"
          aria-label="Settings"
          title="Timer, sounds and video"
          aria-controls="fm-settings"
          :aria-expanded="ui.fmSettingsOpen"
          @click="ui.fmSettingsOpen = !ui.fmSettingsOpen"
        >
          <SlidersHorizontal :size="18" :stroke-width="2.25" />
        </button>
        <button class="fm-icon fm-exit" aria-label="Exit Focus mode" title="Exit · Esc" @click="ui.closeFocusMode()">
          <X :size="18" :stroke-width="2.5" />
        </button>
      </div>

      <p v-if="videoId && videoFailed && !ui.fmSettingsOpen" class="fm-panel fm-video-error" role="status">
        YouTube won't play this video here. Pick another in Settings.
      </p>

      <div v-if="ui.fmSettingsOpen" id="fm-settings" ref="panel" class="fm-panel fm-settings" role="region" aria-label="Focus mode settings">
        <section class="fm-section" aria-labelledby="fm-timer">
          <span id="fm-timer" class="fm-label">Timer</span>
          <TimerSettings />
        </section>
        <section class="fm-section" aria-labelledby="fm-sounds">
          <span id="fm-sounds" class="fm-label">Sounds</span>
          <SoundSettings />
        </section>
        <section class="fm-section" aria-labelledby="fm-video-label">
          <div class="fm-bg-row">
            <span id="fm-video-label" class="fm-label">Video</span>
            <div class="seg fm-bg" role="radiogroup" aria-label="Background">
              <label class="seg-opt">
                <input type="radio" name="ember-bg" value="video" :checked="ember.settings.focusBg === 'video'" @change="ember.updateSettings({ focusBg: 'video' })" />On
              </label>
              <label class="seg-opt">
                <input type="radio" name="ember-bg" value="off" :checked="ember.settings.focusBg === 'off'" @change="ember.updateSettings({ focusBg: 'off' })" />Off
              </label>
            </div>
          </div>
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
          <span class="fm-now">Now: {{ currentId ? `youtu.be/${currentId}` : 'No video' }}<b v-if="videoId && videoFailed"> · YouTube won't play this one here</b><b v-if="linkError"> · That doesn't look like a YouTube link</b></span>
        </section>
      </div>
    </div>

    <div class="fm-panel fm-bl fm-chrome">
      <div v-if="ui.fmResourcesOpen && res.length" id="fm-resources" class="fm-panel fm-res" role="region" :aria-label="`${resGoal?.title} resources`">
        <span class="fm-res-head">{{ resGoal?.title }} · resources</span>
        <a v-for="r in res" :key="r.id" class="fm-res-link" :href="r.url" target="_blank" rel="noopener noreferrer">
          <span class="fm-res-text"><span class="fm-res-title">{{ r.title }}</span><span class="fm-res-sub">{{ resSub(r) }}</span></span>
          <ExternalLink :size="14" :stroke-width="2.5" aria-hidden="true" />
        </a>
      </div>
      <button ref="startButton" class="fm-icon fm-start" :aria-label="startText" :title="startText" @click="ember.startPause()">
        <Pause v-if="ember.timer.running" :size="18" :stroke-width="2.5" /><Play v-else :size="18" :stroke-width="2.5" />
      </button>
      <button v-if="canMarkDone" class="fm-icon fm-outline fm-done" aria-label="Mark done" title="Mark done" @click="ember.completeSelected()">
        <Check :size="18" :stroke-width="3" />
      </button>
      <button v-if="ember.timer.phase === 'break'" class="fm-icon fm-outline fm-skip" aria-label="Skip break" title="Skip break" @click="ember.skipBreak()">
        <SkipForward :size="18" :stroke-width="2.25" />
      </button>
      <button v-if="canReset(ember.timer)" class="fm-icon fm-outline fm-reset" aria-label="Reset" title="Reset" @click="ember.resetTimer()">
        <RotateCcw :size="18" :stroke-width="2.25" />
      </button>
      <button class="fm-item" title="Change what you're focusing on" @click="ui.openPicker(ember.selection)">
        <span class="fm-item-line"><span class="fm-item-title">{{ info.title }}</span><ChevronDown :size="16" :stroke-width="2.5" /></span>
        <span class="fm-item-sub">{{ itemSub }}</span>
      </button>
      <button
        v-if="res.length"
        class="fm-icon fm-res-btn"
        :class="{ 'is-on': ui.fmResourcesOpen }"
        aria-label="Resources"
        title="Resources for this goal"
        aria-controls="fm-resources"
        :aria-expanded="ui.fmResourcesOpen"
        @click="ui.fmResourcesOpen = !ui.fmResourcesOpen"
      >
        <BookOpen :size="18" :stroke-width="2.25" />
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

/* Controls that slide off and fade while nobody is using them; the timer stays. */
.fm-chrome { transition: opacity .4s ease, transform .4s ease; }
.ui-hidden .fm-chrome { opacity: 0; pointer-events: none; }
.ui-hidden .fm-tr { transform: translateY(-16px); }
.ui-hidden .fm-bl { transform: translateY(16px); }

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

.fm-settings {
  width: min(360px, calc(100vw - 48px)); max-height: calc(100vh - 2 * var(--space-6) - 48px); overflow-y: auto;
  padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-4);
}
.fm-section { display: flex; flex-direction: column; gap: var(--space-3); }
.fm-section + .fm-section { padding-top: var(--space-4); border-top: 1px solid color-mix(in oklch, var(--fm-light) 25%, transparent); }
.fm-bg-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.fm-label { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
/* Shared controls on ink: light rules, and the checked segment is bg-coloured so it stays visible. */
.fm-settings :deep(.seg) { border-color: color-mix(in oklch, var(--fm-light) 45%, transparent); }
.fm-settings :deep(.seg-opt + .seg-opt) { border-left-color: color-mix(in oklch, var(--fm-light) 45%, transparent); }
.fm-settings :deep(.seg-opt:has(input:checked)) { background: var(--fm-light); color: var(--fm-ink); }
.fm-settings :deep(.seg-opt:not(:has(input:checked)):hover) { background: color-mix(in srgb, var(--fm-light) 12%, transparent); }
.fm-settings :deep(.btn-secondary) { color: inherit; border-color: color-mix(in oklch, var(--fm-light) 45%, transparent); }
.fm-settings :deep(.btn-secondary:hover:not(:disabled)) { background: color-mix(in srgb, var(--fm-light) 12%, transparent); }
.fm-settings :deep(.input) { background: var(--fm-light); color: var(--fm-ink); }
.fm-video-error { max-width: min(320px, calc(100vw - 48px)); padding: var(--space-2) var(--space-3); font-size: 12px; }

/* Round thumb on a thin track (the user's choice; an exception to zero radius). */
.fm-volume {
  appearance: none; -webkit-appearance: none; align-self: center; width: 88px; height: 40px; margin: 0 var(--space-2) 0 0;
  background: transparent; cursor: pointer;
}
.fm-volume { --fill: 0%; --vol-rest: color-mix(in oklch, var(--fm-light) 35%, transparent); }
/* The filled part is accent, the rest a faint light line: two flat colours split at --fill, not a fade. */
.fm-volume::-webkit-slider-runnable-track {
  height: 3px;
  background: linear-gradient(to right, var(--color-accent) var(--fill), var(--vol-rest) var(--fill));
}
.fm-volume::-moz-range-track { height: 3px; background: var(--vol-rest); }
.fm-volume::-moz-range-progress { height: 3px; background: var(--color-accent); }
.fm-volume::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; margin-top: -4.5px; border: 0; border-radius: 50%; background: var(--fm-light); }
.fm-volume::-moz-range-thumb { width: 12px; height: 12px; border: 0; border-radius: 50%; background: var(--fm-light); }
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
.fm-res {
  position: absolute; left: 0; bottom: calc(100% + var(--space-2)); width: 100%;
  display: flex; flex-direction: column; padding: var(--space-2);
}
.fm-res-head { padding: 2px var(--space-2) 6px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; opacity: .8; }
.fm-res-link {
  display: grid; grid-template-columns: minmax(0, 1fr) 14px; gap: var(--space-2); align-items: center;
  padding: 6px var(--space-2); color: inherit; text-decoration: none;
}
.fm-res-link + .fm-res-link { border-top: 1px solid color-mix(in srgb, var(--fm-light) 20%, transparent); }
.fm-res-link:hover { background: color-mix(in srgb, var(--fm-light) 12%, transparent); }
.fm-res-text { display: flex; flex-direction: column; min-width: 0; }
.fm-res-title { font: 700 14px/1.3 var(--font-heading); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fm-res-sub { font-size: 12px; opacity: .8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fm-res-btn.is-on { background: color-mix(in srgb, var(--fm-light) 16%, transparent); }
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

@media (max-width: 560px) { .fm-volume { width: 64px; } }

@media (prefers-reduced-motion: reduce) {
  .fm-chrome, .fm-bar-fill { transition: none; }
  .ui-hidden .fm-tr, .ui-hidden .fm-bl { transform: none; }
}
</style>
