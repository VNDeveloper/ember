# Ember Phase 6 — Focus Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Focus mode: a full-screen overlay with the running timer, the selection, "Then: …", Start/Pause, Mark done and Skip break, over a muted black-and-white YouTube video controlled through the IFrame Player API (so toggling sound never restarts it), with a Video/Off switch, a sound toggle and "Paste a YouTube link".

**Architecture:** The overlay reads the existing store (timer, selection, settings) and UI store (`focusModeOpen`, picker). A new composable `useYouTubePlayer` loads the YouTube IFrame API once and owns one player: it recreates the player when the video id changes and calls `mute()`/`unMute()` when the sound setting flips. A second composable `useDialogFocus` (initial focus, focus restore, Tab trap) is extracted from the focus picker and shared by both dialogs. One pure helper, `nextStepText`, produces the "Then: …" line.

**Tech Stack:** Vue 3.5 `<script setup>`, Pinia 4, lucide-vue-next, YouTube IFrame Player API, Vitest 5 + jsdom + @vue/test-utils.

**Spec:** `docs/design/handoff.md` §Focus mode, §Interactions → Selection; prototype `docs/design/reference/Ember.dc.html` markup lines 315–351, logic lines 525–542.

## Global Constraints

- **User decision (2026-10-04): build exactly as designed** — grayscale filter and a 62% ink scrim over a muted, control-less, non-interactive (`pointer-events: none`) embed — for personal use, knowingly accepting that this doesn't follow YouTube's player-presentation policies. Revisit if Ember goes public.
- Zero border radius; button labels flush left (Start/Pause has min-width 160px); no gradients, no emoji, no shadows except the picker dialog.
- Overlay z-index 100 (above everything except the picker at 200). Esc closes the picker first, then Focus mode (already in `ui.escape()`).
- The timer keeps running across open/close; the URL, mute and background choice persist (`settings.youtubeUrl`, `settings.muted`, `settings.focusBg`).
- Embed parameters: `autoplay=1&mute=1&loop=1&playlist={id}&controls=0&modestbranding=1&playsinline=1&rel=0&iv_load_policy=3&disablekb=1`, host `https://www.youtube-nocookie.com`.
- Copy is exact: "Ember", "Focus mode", "Exit · Esc", phase labels (from `phaseLabel`), "Then: {step}", "Start focus / Pause / Resume / Start break", "Mark done", "Skip break", "Background", "Video | Off", "Sound off" / "Sound on", "Paste a YouTube link", "Play", "Now: youtu.be/{id}", "No video", " · That doesn't look like a YouTube link".
- Reflows to ~360px with no horizontal scroll.
- `src/core/` must not import `vue` or `pinia`.

## Decisions taken in this plan (tell the user)

1. **Segmented Video/Off on the dark bar shows the checked option in bg colour with ink text.** The shared ink-filled checked state would be invisible on ink.
2. **Opening Focus mode moves keyboard focus to Start/Pause; closing returns it** to whatever opened it (usually the scan button). Tab stays inside the overlay. The picker gets the same behaviour from the shared composable.
3. **Page scroll is locked while Focus mode is open.**
4. **Sound starts muted** (browsers block unmuted autoplay). If the saved setting is "Sound on", the player unmutes once it's ready; a browser may still keep it muted until the next click on the sound toggle.
5. **"Mark done" shows only when the selection still exists** (not just when something is selected).
6. **If the YouTube API can't load** (offline, blocked), the background is simply ink — Focus mode still works.
7. **Phones (≤560px):** smaller time (88px), 16px side padding, the link input takes its own row.

## Review Focus

1. **Toggling sound:** calls `mute()`/`unMute()` on the existing player; never recreates it (no restart). Pinned in Task 3 (`mutes and unmutes without recreating the player`) and Task 4 (`toggles sound without reloading the video`).
2. **Changing the video or switching Background to Off and back:** the old player is destroyed before a new one is made; no stray iframes. Pinned in Task 3 (`recreates the player when the video changes`) and Task 4 (`turns the video off`).
3. **Leaving Focus mode while the API is still loading:** no player is created after unmount. Pinned in Task 3 (`does not create a player after unmount`).
4. **Junk in the link field:** an error line, the saved URL unchanged; typing again clears the error. Pinned in Task 4 (`plays a pasted link and rejects junk`).
5. **Picker opened from Focus mode:** Esc closes the picker only; focus returns to the Focus-mode title, then Esc closes Focus mode and focus returns to the scan button. Pinned in Task 5 (`closes the picker before Focus mode`).

---

## File structure

```
src/
  core/
    selection.ts / selection.test.ts      + nextStepText
  composables/
    useDialogFocus.ts / useDialogFocus.test.ts
    useYouTubePlayer.ts / useYouTubePlayer.test.ts
  components/
    FocusPicker.vue                        uses useDialogFocus (behaviour unchanged)
    FocusMode.vue / FocusMode.test.ts
  App.vue                                  renders FocusMode when ui.focusModeOpen
  App.test.ts                              + Focus mode open/close and Esc order
```

---

### Task 1: "Then:" line (core)

**Files:**
- Modify: `src/core/selection.ts`, `src/core/selection.test.ts`

**Interfaces:**
- Consumes: `findStep`, `stepAfter` (goals.ts).
- Produces: `nextStepText(goals: Goal[], sel: Selection): string` — `"Then: {title}"` for a step selection with a later open step, otherwise `''`.

- [ ] **Step 1: Write the failing test** — append to `src/core/selection.test.ts`:

```ts
describe('nextStepText', () => {
  const roadmap = [goalFixture('D3', [
    ['First charts', [['Bar', '2026-09-01'], ['Line', null], ['Scatter', null]]],
    ['Motion', [['Easing', null]]],
  ])]
  const step = (ms: string, s: string): StepTarget => ({ kind: 'step', goalId: 'D3', msId: `D3/${ms}`, stepId: `D3/${ms}/${s}` })

  it('names the next open step, across milestones', () => {
    expect(nextStepText(roadmap, step('First charts', 'Line'))).toBe('Then: Scatter')
    expect(nextStepText(roadmap, step('First charts', 'Scatter'))).toBe('Then: Easing')
  })

  it('is empty for the last step, a task, nothing, or a missing step', () => {
    expect(nextStepText(roadmap, step('Motion', 'Easing'))).toBe('')
    expect(nextStepText(roadmap, { kind: 'task', taskId: 'x' })).toBe('')
    expect(nextStepText(roadmap, null)).toBe('')
    expect(nextStepText(roadmap, step('Motion', 'gone'))).toBe('')
  })
})
```
and change the import line to `import { EMPTY_SELECTION, describeSelection, nextStepText, targetTitle } from './selection'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/core/selection.test.ts`
Expected: FAIL — `nextStepText` is not exported.

- [ ] **Step 3: Add to `src/core/selection.ts`**

Change `import { findStep } from './goals'` to `import { findStep, stepAfter } from './goals'` and append:
```ts
/** Focus mode's "Then: …" line: the next open step after the selected one. */
export function nextStepText(goals: Goal[], sel: Selection): string {
  if (sel?.kind !== 'step') return ''
  const loc = findStep(goals, sel)
  if (!loc) return ''
  const next = stepAfter(loc.goal, loc.step.id)
  return next ? `Then: ${next.title}` : ''
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): add the Focus-mode \"Then:\" line"
```

---

### Task 2: Shared dialog focus handling

**Files:**
- Create: `src/composables/useDialogFocus.ts`
- Modify: `src/components/FocusPicker.vue`
- Test: `src/composables/useDialogFocus.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `useDialogFocus(container: Ref<HTMLElement | null>, initial: Ref<HTMLElement | null>): { onKeydown: (e: KeyboardEvent) => void }` — on mount remembers the focused element (unless it's `<body>`) and focuses `initial`; on unmount restores focus if that element is still in the document; `onKeydown` keeps Tab/Shift+Tab cycling inside `container` (focusable = inputs except unchecked radios, buttons, selects, textareas; disabled ones skipped).

- [ ] **Step 1: Write the failing test**

`src/composables/useDialogFocus.test.ts`:
```ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { useDialogFocus } from './useDialogFocus'

const Dialog = defineComponent({
  setup() {
    const box = ref<HTMLElement | null>(null)
    const first = ref<HTMLElement | null>(null)
    const { onKeydown } = useDialogFocus(box, first)
    return () => h('div', { ref: box, class: 'box', onKeydown }, [
      h('input', { ref: first, class: 'first' }),
      h('button', { class: 'mid' }, 'Mid'),
      h('button', { class: 'off', disabled: true }, 'Off'),
      h('button', { class: 'last' }, 'Last'),
    ])
  },
})

describe('useDialogFocus', () => {
  it('focuses the initial element and gives focus back on close', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const w = mount(Dialog, { attachTo: document.body })
    expect(document.activeElement).toBe(w.find('.first').element)
    w.unmount()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it('keeps Tab inside, skipping disabled buttons', async () => {
    const w = mount(Dialog, { attachTo: document.body })
    ;(w.find('.last').element as HTMLElement).focus()
    await w.find('.box').trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(w.find('.first').element)
    await w.find('.box').trigger('keydown', { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(w.find('.last').element)
    w.unmount()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/composables/useDialogFocus.test.ts`
Expected: FAIL — cannot resolve `./useDialogFocus`.

- [ ] **Step 3: Write `src/composables/useDialogFocus.ts`**

```ts
import { onBeforeUnmount, onMounted, type Ref } from 'vue'

const FOCUSABLE = 'input:not([type=radio]), input[type=radio]:checked, button, select, textarea'

/**
 * Modal dialog focus: focus `initial` on open, give focus back to the opener on close,
 * and keep Tab / Shift+Tab cycling inside `container`.
 */
export function useDialogFocus(container: Ref<HTMLElement | null>, initial: Ref<HTMLElement | null>) {
  let returnTo: HTMLElement | null = null

  onMounted(() => {
    const active = document.activeElement
    returnTo = active instanceof HTMLElement && active !== document.body ? active : null
    initial.value?.focus()
  })
  onBeforeUnmount(() => {
    if (returnTo?.isConnected) returnTo.focus()
  })

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Tab' || !container.value) return
    const nodes = [...container.value.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => !n.hasAttribute('disabled'))
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    if (!first || !last) return
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return { onKeydown }
}
```

- [ ] **Step 4: Use it in `src/components/FocusPicker.vue`**

- Change the vue import to `import { computed, ref } from 'vue'` and add `import { useDialogFocus } from '../composables/useDialogFocus'`.
- Delete the `returnTo` variable, the `onMounted` / `onBeforeUnmount` blocks and the `trapTab` function (with their comments).
- After `const dialog = ref<HTMLElement | null>(null)` add:
```ts
const { onKeydown } = useDialogFocus(dialog, input)
```
- In the template change `@keydown="trapTab"` to `@keydown="onKeydown"`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS — including the existing App picker-focus tests (`returns focus to the focus-bar title…`, `keeps Tab inside the picker`).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: share dialog focus handling between dialogs"
```

---

### Task 3: YouTube player composable

**Files:**
- Create: `src/composables/useYouTubePlayer.ts`
- Test: `src/composables/useYouTubePlayer.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `loadYouTubeApi(): Promise<YTNamespace>` (injects `https://www.youtube.com/iframe_api` once; resolves immediately if `window.YT.Player` exists); `playerVars(id: string)`; `useYouTubePlayer(host: Ref<HTMLElement | null>, videoId: Ref<string | null>, muted: Ref<boolean>): void` — creates the player inside `host` (via a child div the API replaces with its iframe), recreates it when `videoId` changes, destroys it when `videoId` becomes null or on unmount, and calls `mute()`/`unMute()` when `muted` changes.

- [ ] **Step 1: Write the failing test**

`src/composables/useYouTubePlayer.test.ts`:
```ts
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref, type Ref } from 'vue'
import { useYouTubePlayer } from './useYouTubePlayer'

interface FakePlayer { mute: ReturnType<typeof vi.fn>; unMute: ReturnType<typeof vi.fn>; playVideo: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }
let players: FakePlayer[]
let Player: ReturnType<typeof vi.fn>

function host(videoId: Ref<string | null>, muted: Ref<boolean>) {
  return defineComponent({
    setup() {
      const el = ref<HTMLElement | null>(null)
      useYouTubePlayer(el, videoId, muted)
      return () => h('div', { ref: el, class: 'host' })
    },
  })
}

beforeEach(() => {
  players = []
  Player = vi.fn(function () {
    const p = { mute: vi.fn(), unMute: vi.fn(), playVideo: vi.fn(), destroy: vi.fn() }
    players.push(p)
    return p
  })
  ;(window as unknown as { YT: unknown }).YT = { Player }
})
afterEach(() => {
  delete (window as unknown as { YT?: unknown }).YT
})

describe('useYouTubePlayer', () => {
  it('creates a muted, looping, control-less player for the video', async () => {
    const w = mount(host(ref('jfKfPfyJRdk'), ref(true)))
    await flushPromises()
    expect(Player).toHaveBeenCalledTimes(1)
    const [el, opts] = Player.mock.calls[0]
    expect(w.find('.host').element.contains(el)).toBe(true)
    expect(opts).toMatchObject({
      videoId: 'jfKfPfyJRdk',
      host: 'https://www.youtube-nocookie.com',
      playerVars: {
        autoplay: 1, mute: 1, loop: 1, playlist: 'jfKfPfyJRdk', controls: 0, modestbranding: 1,
        playsinline: 1, rel: 0, iv_load_policy: 3, disablekb: 1,
      },
    })
  })

  it('applies the sound setting when ready', async () => {
    mount(host(ref('jfKfPfyJRdk'), ref(false)))
    await flushPromises()
    const target = players[0]
    Player.mock.calls[0][1].events.onReady({ target })
    expect(target.unMute).toHaveBeenCalled()
    expect(target.playVideo).toHaveBeenCalled()
  })

  it('mutes and unmutes without recreating the player', async () => {
    const muted = ref(true)
    mount(host(ref('jfKfPfyJRdk'), muted))
    await flushPromises()
    muted.value = false
    await flushPromises()
    expect(players[0].unMute).toHaveBeenCalledTimes(1)
    muted.value = true
    await flushPromises()
    expect(players[0].mute).toHaveBeenCalledTimes(1)
    expect(Player).toHaveBeenCalledTimes(1)
  })

  it('recreates the player when the video changes and removes it when there is none', async () => {
    const id = ref<string | null>('jfKfPfyJRdk')
    mount(host(id, ref(true)))
    await flushPromises()
    id.value = 'dQw4w9WgXcQ'
    await flushPromises()
    expect(players[0].destroy).toHaveBeenCalled()
    expect(Player).toHaveBeenCalledTimes(2)
    expect(Player.mock.calls[1][1].videoId).toBe('dQw4w9WgXcQ')
    id.value = null
    await flushPromises()
    expect(players[1].destroy).toHaveBeenCalled()
    expect(Player).toHaveBeenCalledTimes(2)
  })

  it('makes no player without a video, and destroys it on unmount', async () => {
    mount(host(ref(null), ref(true)))
    await flushPromises()
    expect(Player).not.toHaveBeenCalled()
    const w = mount(host(ref('jfKfPfyJRdk'), ref(true)))
    await flushPromises()
    w.unmount()
    expect(players[0].destroy).toHaveBeenCalled()
  })

  it('does not create a player after unmount', async () => {
    const w = mount(host(ref('jfKfPfyJRdk'), ref(true)))
    w.unmount()
    await flushPromises()
    expect(Player).not.toHaveBeenCalled()
  })
})

describe('loadYouTubeApi', () => {
  it('injects the API script once and resolves when it is ready', async () => {
    delete (window as unknown as { YT?: unknown }).YT
    vi.resetModules()
    const { loadYouTubeApi } = await import('./useYouTubePlayer')
    const a = loadYouTubeApi()
    const b = loadYouTubeApi()
    const scripts = [...document.querySelectorAll('script')].filter((s) => s.src === 'https://www.youtube.com/iframe_api')
    expect(scripts).toHaveLength(1)
    const YT = { Player }
    ;(window as unknown as { YT: unknown }).YT = YT
    ;(window as unknown as { onYouTubeIframeAPIReady: () => void }).onYouTubeIframeAPIReady()
    await expect(a).resolves.toBe(YT)
    await expect(b).resolves.toBe(YT)
    scripts[0].remove()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/composables/useYouTubePlayer.test.ts`
Expected: FAIL — cannot resolve `./useYouTubePlayer`.

- [ ] **Step 3: Write `src/composables/useYouTubePlayer.ts`**

```ts
import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue'

interface YTPlayer {
  mute(): void
  unMute(): void
  playVideo(): void
  destroy(): void
}

interface YTPlayerOptions {
  videoId: string
  host: string
  playerVars: Record<string, string | number>
  events: { onReady: (e: { target: YTPlayer }) => void }
}

interface YTNamespace {
  Player: new (el: HTMLElement, opts: YTPlayerOptions) => YTPlayer
}

declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

const API_SRC = 'https://www.youtube.com/iframe_api'
let apiPromise: Promise<YTNamespace> | null = null

/** Loads the YouTube IFrame Player API once. */
export function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (apiPromise) return apiPromise
  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      if (window.YT) resolve(window.YT)
    }
    const script = document.createElement('script')
    script.src = API_SRC
    script.async = true
    script.onerror = () => {
      apiPromise = null
      reject(new Error('YouTube API failed to load'))
    }
    document.head.appendChild(script)
  })
  return apiPromise
}

/** Muted, looping, control-less background embed (see handoff §Focus mode). */
export const playerVars = (id: string) => ({
  autoplay: 1, mute: 1, loop: 1, playlist: id, controls: 0, modestbranding: 1,
  playsinline: 1, rel: 0, iv_load_policy: 3, disablekb: 1,
})

/**
 * One background player inside `host`. Changing the video recreates it; changing `muted`
 * calls mute()/unMute() so the video keeps playing.
 */
export function useYouTubePlayer(host: Ref<HTMLElement | null>, videoId: Ref<string | null>, muted: Ref<boolean>): void {
  let player: YTPlayer | null = null
  let alive = true

  function destroy() {
    player?.destroy()
    player = null
  }

  async function create(id: string | null) {
    destroy()
    if (!id) return
    const YT = await loadYouTubeApi().catch(() => null)
    if (!YT || !alive || !host.value || videoId.value !== id) return
    destroy()
    const mountPoint = document.createElement('div')
    host.value.replaceChildren(mountPoint)
    player = new YT.Player(mountPoint, {
      videoId: id,
      host: 'https://www.youtube-nocookie.com',
      playerVars: playerVars(id),
      events: {
        onReady: ({ target }) => {
          if (muted.value) target.mute()
          else target.unMute()
          target.playVideo()
        },
      },
    })
  }

  onMounted(() => { void create(videoId.value) })
  watch(videoId, (id) => { void create(id) })
  watch(muted, (m) => {
    if (!player) return
    if (m) player.mute()
    else player.unMute()
  })
  onBeforeUnmount(() => {
    alive = false
    destroy()
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add a YouTube background player that mutes without restarting"
```

---

### Task 4: Focus mode overlay

**Files:**
- Create: `src/components/FocusMode.vue`
- Test: `src/components/FocusMode.test.ts`

**Interfaces:**
- Consumes: `describeSelection`, `nextStepText` (selection.ts); `ytId` (youtube.ts); `clock` (format.ts); `phaseLabel`, `startLabel`, `progress` (timer.ts); `useYouTubePlayer`, `useDialogFocus`; store `goals`, `tasks`, `selection`, `timer`, `now`, `remaining`, `tally`, `settings`, `startPause`, `skipBreak`, `completeSelected`, `updateSettings`; `ui.closeFocusMode`, `ui.openPicker`.
- Produces: `<FocusMode />` (no props; render with `v-if="ui.focusModeOpen"`). CSS hooks: `.focus-mode`, `.fm-video`, `.fm-exit`, `.fm-phase`, `.fm-time`, `.fm-title`, `.fm-sub`, `.fm-then`, `.fm-start`, `.fm-done`, `.fm-skip`, `.fm-bg input` (Video, Off), `.fm-sound`, `.fm-input`, `.fm-play`, `.fm-now`, `.fm-progress-fill`.

- [ ] **Step 1: Write the failing test**

`src/components/FocusMode.test.ts`:
```ts
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EmberData, StepTarget } from '../core/model'
import { dataFixture, goalFixture } from '../core/test-fixtures'
import { useEmberStore } from '../stores/ember'
import { useUiStore } from '../stores/ui'
import FocusMode from './FocusMode.vue'

const LINE: StepTarget = { kind: 'step', goalId: 'D3', msId: 'D3/First charts', stepId: 'D3/First charts/Line' }
let players: { mute: ReturnType<typeof vi.fn>; unMute: ReturnType<typeof vi.fn>; playVideo: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }[]
let Player: ReturnType<typeof vi.fn>

async function setup(patch: Partial<EmberData> = {}) {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  ember.replaceData(dataFixture({
    goals: [goalFixture('D3', [['First charts', [['Bar', '2026-09-01'], ['Line', null], ['Scatter', null]]]])],
    selection: LINE,
    ...patch,
  }))
  const ui = useUiStore()
  ui.openFocusMode()
  const w = mount(FocusMode, { attachTo: document.body })
  await flushPromises()
  return { w, ember, ui }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  localStorage.clear()
  players = []
  Player = vi.fn(function () {
    const p = { mute: vi.fn(), unMute: vi.fn(), playVideo: vi.fn(), destroy: vi.fn() }
    players.push(p)
    return p
  })
  ;(window as unknown as { YT: unknown }).YT = { Player }
})
afterEach(() => {
  vi.useRealTimers()
  delete (window as unknown as { YT?: unknown }).YT
})

describe('FocusMode', () => {
  it('shows the timer, the selection and what comes next', async () => {
    const { w } = await setup()
    expect(w.find('.fm-phase').text()).toBe('Next focus session')
    expect(w.find('.fm-time').text()).toBe('25:00')
    expect(w.find('.fm-title').text()).toBe('Line')
    expect(w.find('.fm-sub').text()).toBe('D3 · 01 First charts · 0m of est. 50m')
    expect(w.find('.fm-then').text()).toBe('Then: Scatter')
    expect(w.find('.fm-start').text()).toBe('Start focus')
    w.unmount()
  })

  it('starts and pauses the shared timer', async () => {
    const { w, ember } = await setup()
    await w.find('.fm-start').trigger('click')
    expect(ember.timer.running).toBe(true)
    expect(w.find('.fm-start').text()).toBe('Pause')
    expect(w.find('.fm-phase').text()).toBe('Focusing on')
    ember.tick(new Date(2026, 8, 23, 10, 5).getTime())
    await flushPromises()
    expect(w.find('.fm-progress-fill').attributes('style')).toContain('width: 20%')
    w.unmount()
  })

  it('marks the selection done and hands off to the next step', async () => {
    const { w, ember } = await setup()
    await w.find('.fm-done').trigger('click')
    expect(ember.goals[0].milestones[0].steps[1].doneOn).toBe('2026-09-23')
    expect(w.find('.fm-title').text()).toBe('Scatter')
    expect(w.find('.fm-then').exists()).toBe(false)
    w.unmount()
  })

  it('hides Mark done without a selection or during a break, and offers Skip break', async () => {
    const none = await setup({ selection: null })
    expect(none.w.find('.fm-done').exists()).toBe(false)
    none.w.unmount()
    const brk = await setup({ timer: { phase: 'break', running: false, endsAt: null, leftSec: 300, speed: 1, lengthSec: 300 } })
    expect(brk.w.find('.fm-done').exists()).toBe(false)
    await brk.w.find('.fm-skip').trigger('click')
    expect(brk.ember.timer.phase).toBe('focus')
    brk.w.unmount()
  })

  it('exits, and opens the picker from the title', async () => {
    const { w, ui } = await setup()
    await w.find('.fm-title').trigger('click')
    expect(ui.pickerOpen).toBe(true)
    expect(ui.pickerTab).toBe('goals')
    await w.find('.fm-exit').trigger('click')
    expect(ui.focusModeOpen).toBe(false)
    w.unmount()
  })

  it('plays the saved video, and turns the video off', async () => {
    const { w, ember } = await setup()
    expect(w.find('.fm-video').exists()).toBe(true)
    expect(Player).toHaveBeenCalledTimes(1)
    expect(Player.mock.calls[0][1].videoId).toBe('jfKfPfyJRdk')
    expect(w.find('.fm-now').text()).toBe('Now: youtu.be/jfKfPfyJRdk')
    await w.findAll('.fm-bg input')[1].setValue(true)
    expect(ember.settings.focusBg).toBe('off')
    expect(w.find('.fm-video').exists()).toBe(false)
    expect(players[0].destroy).toHaveBeenCalled()
    w.unmount()
  })

  it('toggles sound without reloading the video', async () => {
    const { w, ember } = await setup()
    expect(w.find('.fm-sound').text()).toBe('Sound off')
    await w.find('.fm-sound').trigger('click')
    await flushPromises()
    expect(ember.settings.muted).toBe(false)
    expect(w.find('.fm-sound').text()).toBe('Sound on')
    expect(players[0].unMute).toHaveBeenCalledTimes(1)
    expect(Player).toHaveBeenCalledTimes(1)
    w.unmount()
  })

  it('plays a pasted link and rejects junk', async () => {
    const { w, ember } = await setup({ settings: { ...dataFixture().settings, focusBg: 'off' } })
    await w.find('.fm-input').setValue('hello')
    await w.find('.fm-play').trigger('click')
    expect(w.find('.fm-now').text()).toBe("Now: youtu.be/jfKfPfyJRdk · That doesn't look like a YouTube link")
    expect(ember.settings.youtubeUrl).toBe('https://www.youtube.com/watch?v=jfKfPfyJRdk')
    await w.find('.fm-input').setValue('https://youtu.be/dQw4w9WgXcQ')
    expect(w.find('.fm-now').text()).toBe('Now: youtu.be/jfKfPfyJRdk')
    await w.find('.fm-input').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(ember.settings).toMatchObject({ youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ', focusBg: 'video' })
    expect(w.find('.fm-now').text()).toBe('Now: youtu.be/dQw4w9WgXcQ')
    expect((w.find('.fm-input').element as HTMLInputElement).value).toBe('')
    expect(Player.mock.calls.at(-1)?.[1].videoId).toBe('dQw4w9WgXcQ')
    w.unmount()
  })

  it('locks page scroll and manages focus', async () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const { w } = await setup()
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.activeElement).toBe(w.find('.fm-start').element)
    w.unmount()
    expect(document.body.style.overflow).toBe('')
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/FocusMode.test.ts`
Expected: FAIL — cannot resolve `./FocusMode.vue`.

- [ ] **Step 3: Write `src/components/FocusMode.vue`**

```vue
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
      <button class="btn btn-ghost fm-ghost fm-sound" @click="ember.updateSettings({ muted: !muted })">
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Focus mode with a YouTube background"
```

---

### Task 5: Wire Focus mode into the App

**Files:**
- Modify: `src/App.vue`, `src/App.test.ts`

**Interfaces:**
- Consumes: `FocusMode`; `ui.focusModeOpen`.
- Produces: the finished overlay flow.

- [ ] **Step 1: Write the failing tests** — append inside `describe('App shell', …)` in `src/App.test.ts`:

```ts
  it('opens Focus mode from the focus bar and closes it with Esc', async () => {
    ;(window as unknown as { YT: unknown }).YT = { Player: vi.fn(function () { return { mute() {}, unMute() {}, playVideo() {}, destroy() {} } }) }
    const w = mountApp()
    const scan = w.find('[aria-label="Focus mode"]')
    ;(scan.element as HTMLElement).focus()
    await scan.trigger('click')
    expect(w.find('.focus-mode').exists()).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(w.find('.focus-mode').exists()).toBe(false)
    expect(document.activeElement).toBe(scan.element)
    w.unmount()
    delete (window as unknown as { YT?: unknown }).YT
  })

  it('closes the picker before Focus mode', async () => {
    ;(window as unknown as { YT: unknown }).YT = { Player: vi.fn(function () { return { mute() {}, unMute() {}, playVideo() {}, destroy() {} } }) }
    const w = mountApp()
    await w.find('[aria-label="Focus mode"]').trigger('click')
    const title = w.find('.fm-title')
    ;(title.element as HTMLElement).focus()
    await title.trigger('click')
    expect(w.find('.picker-backdrop').exists()).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(w.find('.picker-backdrop').exists()).toBe(false)
    expect(w.find('.focus-mode').exists()).toBe(true)
    expect(document.activeElement).toBe(w.find('.fm-title').element)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(w.find('.focus-mode').exists()).toBe(false)
    w.unmount()
    delete (window as unknown as { YT?: unknown }).YT
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/App.test.ts`
Expected: FAIL — no `.focus-mode`.

- [ ] **Step 3: Render FocusMode in `src/App.vue`**

Add `import FocusMode from './components/FocusMode.vue'` and, directly before `<FocusPicker v-if="ui.pickerOpen" />`, add:
```vue
    <FocusMode v-if="ui.focusModeOpen" />
```

- [ ] **Step 4: Run the full check**

Run: `npm test && npm run build`
Expected: all tests pass; vue-tsc clean; build succeeds.

- [ ] **Step 5: Check the running app**

Run `npm run dev` (background). In the Playwright browser at `http://localhost:5173/?demo=1` (clear localStorage first):
1. 1280px: click the scan button → full-screen ink overlay; after a moment the black-and-white video plays behind a dark scrim; top bar "Ember · FOCUS MODE · Exit · Esc"; big 25:00; "Reusable chart function", context line, "Then: Transitions & easing"; Start focus, Mark done; bottom bar with Background Video/Off (checked = light), "Sound off", link input + Play, "Now: youtu.be/jfKfPfyJRdk"; 6px progress bar. Screenshot.
2. Start → time counts at demo speed and the progress bar grows; Sound off → Sound on (the video keeps playing — check the iframe element is the same node before and after: `document.querySelector('.fm-player iframe')` identity); Background Off → video gone, ink only; paste `https://youtu.be/dQw4w9WgXcQ` + Enter → video switches; paste "hello" → error line.
3. Click the title → picker above the overlay; Esc closes only the picker; Esc again closes Focus mode; the timer is still running in the focus bar.
4. Mark done → title changes to the next step.
5. Resize to 360px with Focus mode open: everything fits, no horizontal scroll. Screenshot.
6. Console: no errors (YouTube's own iframe warnings excepted).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: open Focus mode from the focus bar"
```
