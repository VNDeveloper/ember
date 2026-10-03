# Ember Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold Ember (Vite + Vue 3 + TS + Pinia), ship the Modernist tokens and base styles, and build the fully tested data layer: model, date helpers, derivations, wall-clock timer engine, seed data with 2026 history, localStorage persistence and the single Pinia store.

**Architecture:** `src/core/` is framework-agnostic pure TypeScript (no Vue imports) holding the model, date maths, derivations, timer engine, seed generator and persistence; every module is unit-tested. `src/stores/ember.ts` is one Pinia setup store that owns the persisted slice (goals, tasks, logs, selection, timer, settings) plus a non-persisted wall clock `now`; everything time-based derives from `now`. No UI beyond a temporary style-sample page in this phase.

**Tech Stack:** Vite 8, Vue 3.5 (`<script setup>`), TypeScript ~6.0 (vue-tsc cannot load TS 7), Pinia 4, lucide-vue-next, plain CSS custom properties, Vitest 5 + jsdom.

**Spec:** `docs/design/handoff.md` (copied from the design handoff README) and the working prototype `docs/design/reference/Ember.dc.html` (logic in the `<script data-dc-script>` block — source of truth for formulas and copy). The kickoff brief is `docs/design/PROMPT.md`; its React stack suggestion is overridden by the user's choice of Vue + Pinia.

## Phase map (one plan per phase; this is Phase 1)

| Phase | Handoff steps | Contents |
|---|---|---|
| **1 Foundation (this plan)** | 1, 2, engine of 7, store tests of 10 | scaffold, tokens, base styles, model, dates, derivations, timer engine, seed, persistence, store |
| 2 Shell | 3, UI of 7 | nav, focus bar, progress bar, toast, focus picker, 250ms ticker, `?demo=1` tag |
| 3 Today | 4 + tests of 10 | Working-on strip, Today list (roll-over, deadlines, done collapse), Upcoming groups, add-task row, 7-day streak |
| 4 Goals | 5 | aside, readme, ledger stats, goal tasks, roadmap with session blocks, add milestone/step |
| 5 Activity | 6 + tests of 10 | year heat map (focus/done), stats, done wall, activity log |
| 6 Focus mode | 8 | full-screen overlay, YouTube IFrame Player API background, picker on top |
| 7 Polish & QA | 9, 11 | pop/drop/float animations, states, side-by-side comparison with the prototype, report |

## Global Constraints

- Zero border radius everywhere (`border-radius: 0` on every element, tokens `--radius-*: 0`).
- 2px rules between major sections; 1px rules between list rows. Never hairlines.
- Button labels flush left (`justify-content: flex-start`), never centred, even in wide buttons. Icon-only buttons centre their icon.
- Red accent used sparingly; accent text at paragraph size uses `--color-accent-700`.
- No gradients, no emoji, no drop shadows except the picker dialog (`--shadow-lg`).
- Colours, spacing and type come only from the tokens in `src/styles/tokens.css` (values copied from `docs/design/reference/_ds/…/styles.css`).
- Type: Archivo from Google Fonts. Body 15px/1.55; h2 32 / h3 25 / h4 20, weight 800, line-height 1.12, letter-spacing −0.015em.
- Dates are ISO `YYYY-MM-DD` strings in local time; "today" is the real date (the prototype's pinned 23 Sep 2026 is demo-only).
- Derive, don't store: spent minutes per task/step, today's minutes, sessions today, per-day totals, streaks, goal % and current milestone all come from `FocusLog` and `doneOn`.
- Timer uses wall-clock deltas (`endsAt` vs `Date.now()`), never tick counting. Timer state is persisted.
- Persisted slice: goals, tasks, logs, selection, timer, settings — localStorage key `ember:v1`.
- `src/core/` must not import from `vue` or `pinia`.
- TypeScript pinned to `~6.0.3`.

## Decisions taken in this plan (tell the user)

1. **Segmented control checked state = ink fill** (README §Design tokens says "checked = ink fill"; the prototype's DS stylesheet uses accent). It's one token, `--seg-checked-bg`, so flipping to accent is a one-line change.
2. **Archivo 700 is loaded as well as 400/600/800** — the prototype uses `font-weight: 700` in dozens of places.
3. **IDs instead of array indices** for goals, milestones, steps and tasks (the prototype uses indices; the README data model uses ids).
4. **`Timer.speed` added** to the README `Timer` type: the speed (1 or 60 in demo) is captured when a run starts so a reload with a different demo flag can't rescale a running session.
5. **Seeded history is real data.** The year's "things done" history becomes done history tasks (generic titles like "Weekly review") and focus history becomes 25-minute `FocusLog` entries, using the prototype's `HIST`/`FOCUS` formulas and RNG seeds. Consequence for later phases: the done wall and activity log will be denser than the prototype, which only had aggregate numbers.
6. **Corrupt or unknown-version saved data is backed up** to `ember:v1:corrupt:<timestamp>` before Ember falls back to seed data, so a bad parse never silently destroys the user's history.
7. **Settings have no UI yet.** The prototype's Tweaks (session length, show future days, done-wall weeks, demo speed) live in `settings` with defaults; `?demo=1` turns on demo speed for that page load.

## Review Focus

1. **App reopened after the timer should have finished (tab closed, laptop asleep, next morning):** exactly one session is logged, stamped at `endsAt` and dated by `endsAt`'s day, and the timer lands in a paused break — not a running one, and no double logging. Pinned in Task 7 (`completes once after a reload, dated by when it ended`).
2. **Saved data is corrupt or from an unknown version:** Ember must not overwrite it with seed data without keeping a copy. Pinned in Task 6 (`backs up unreadable data before giving up`).
3. **Demo flag differs between start and reload:** a run started at demo speed keeps demo speed until paused. Pinned in Task 7 (`keeps the speed a run started with across reloads`).
4. **Selection points at an item that no longer exists** (hand-edited storage, future delete): completing a session logs it as Unassigned instead of crashing or attributing time to a ghost. Pinned in Task 7 (`logs to Unassigned when the selected item no longer exists`).
5. **Midnight passes while the app is open:** `today` advances on the next tick, and today's minutes/sessions reset. Pinned in Task 7 (`rolls today over at midnight`).

---

## File structure

```
ember/
  .gitignore
  CLAUDE.md                     project notes for future sessions
  index.html                    Archivo font links, #app
  package.json
  tsconfig.json / tsconfig.app.json / tsconfig.node.json
  vite.config.ts                vue plugin + vitest (jsdom)
  docs/design/                  handoff (already copied)
  src/
    main.ts                     createApp + pinia + global CSS
    App.vue                     Phase 1: style sample + store sanity line
    dev/StyleSample.vue         temporary kitchen-sink of base styles (deleted in Phase 2)
    styles/
      tokens.css                :root tokens
      base.css                  reset, type, focus ring, helpers
      components.css            .btn .input .seg .tag .nav .dialog .check .icon-btn .swatch
      animations.css            pop/drop/float keyframe pairs
    core/
      format.ts                 pad2, fmtM, fmtInt, clock, hashStr, hash7, plural
      dates.ts                  ISO date maths and labels
      youtube.ts                ytId, embedUrl
      model.ts                  types, DEFAULT_SETTINGS, targetKey, sameTarget
      ids.ts                    uid()
      goals.ts                  isMilestoneDone, goalStats, nextOpenStep, stepAfter, findStep, stepTarget, goalColor
      tally.ts                  tallyLogs → spent maps, today's minutes and sessions
      timer.ts                  lengths, idle/start/pause/remaining/isDue, labels
      seed.ts                   buildSeed(now)
      persist.ts                loadData / saveData (+ corrupt backup)
      test-fixtures.ts          goalFixture, taskFixture, dataFixture (tests only)
      *.test.ts                 colocated unit tests
    stores/
      ember.ts                  useEmberStore
      ember.test.ts
```

---

### Task 1: Scaffold, tokens and base styles

**Files:**
- Create: `package.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `.gitignore`, `CLAUDE.md`
- Create: `src/main.ts`, `src/App.vue`, `src/dev/StyleSample.vue`
- Create: `src/styles/tokens.css`, `src/styles/base.css`, `src/styles/components.css`, `src/styles/animations.css`
- Test: `src/core/smoke.test.ts` (deleted in Task 2)

**Interfaces:**
- Consumes: nothing.
- Produces: CSS classes later phases use — `.btn .btn-primary .btn-secondary .btn-ghost .btn-icon .btn-outline-current .input .input-sm .seg .seg-opt .tag .tag-accent .tag-neutral .nav .nav-brand .dialog-backdrop .dialog .check .check-sm .is-done .icon-btn .is-on .swatch .swatch-sm .kicker .label .section-label .stat-value .rule-2 .tabular .text-accent .muted`; keyframes `pop0/pop1`, `drop0/drop1`, `float0/float1`; CSS vars in tokens.css. npm scripts `dev`, `build`, `test`, `typecheck`.

- [ ] **Step 1: Initialise git on `main` and commit the docs**

```bash
cd /Users/quangnguyen/Projects/ember
git init -b main
printf 'node_modules\ndist\n*.tsbuildinfo\n.DS_Store\ncoverage\n' > .gitignore
git add .gitignore docs
git commit -m "docs: add Ember design handoff and phase 1 plan"
git checkout -b phase1-foundation
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "ember",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "vue-tsc -b"
  }
}
```

- [ ] **Step 3: Install dependencies**

```bash
npm install vue@^3.5.43 pinia@^4.0.3 lucide-vue-next@^1.0.0
npm install -D vite@^8.3.2 @vitejs/plugin-vue@^6.0.9 typescript@~6.0.3 vue-tsc@^3.3.12 @vue/tsconfig@^0.9.1 vitest@^5.0.3 jsdom@^30.1.1 @vue/test-utils@^2.5.1 @types/node@^24
```

Expected: installs without peer-dependency errors. If npm reports a TypeScript 7 peer conflict, keep `typescript@~6.0.3` (vue-tsc can't load TS 7).

- [ ] **Step 4: Write the TypeScript and Vite config**

`tsconfig.json`:
```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }]
}
```

`tsconfig.app.json`:
```json
{
  "extends": "@vue/tsconfig/tsconfig.dom.json",
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "types": ["vite/client"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/**/*.ts", "src/**/*.vue"]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "moduleDetection": "force",
    "types": ["node"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "verbatimModuleSyntax": true
  },
  "include": ["vite.config.ts"]
}
```

`vite.config.ts`:
```ts
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 5: Write a smoke test and run it**

`src/core/smoke.test.ts`:
```ts
import { describe, expect, it } from 'vitest'

describe('toolchain', () => {
  it('runs tests in jsdom', () => {
    expect(typeof localStorage.setItem).toBe('function')
  })
})
```

Run: `npm test`
Expected: PASS, 1 test.

- [ ] **Step 6: Write `index.html`**

```html
<!doctype html>
<html lang="en-GB">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Ember</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;700;800&display=swap"
      rel="stylesheet"
    />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 7: Write `src/styles/tokens.css`**

```css
/* Modernist tokens — values copied from docs/design/reference/_ds/…/styles.css. */
:root {
  --color-bg: #f3f2f2;
  --color-surface: #eae9e9;
  --color-text: #201e1d;
  --color-accent: #ec3013;
  --color-divider: color-mix(in srgb, #201e1d 40%, transparent);

  --color-neutral-100: #f8f4f4;
  --color-neutral-200: #eae7e7;
  --color-neutral-300: #d7d3d3;
  --color-neutral-400: #bab6b6;
  --color-neutral-500: #9b9797;
  --color-neutral-600: #7d7979;
  --color-neutral-700: #605d5d;
  --color-neutral-800: #444141;
  --color-neutral-900: #2d2b2b;

  --color-accent-100: #fff2ef;
  --color-accent-200: #ffe0d9;
  --color-accent-300: #ffc4b8;
  --color-accent-400: #ff9783;
  --color-accent-500: #ff563c;
  --color-accent-600: #dd2b0f;
  --color-accent-700: #ae1800;
  --color-accent-800: #7c1405;
  --color-accent-900: #4d170e;

  --font-heading: "Archivo", system-ui, sans-serif;
  --font-body: "Archivo", system-ui, sans-serif;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;

  --radius-sm: 0px;
  --radius-md: 0px;
  --radius-lg: 0px;

  /* Only the picker dialog casts a shadow. */
  --shadow-lg: 0 12px 32px color-mix(in srgb, #2d2b2b 22%, transparent);

  /* README: segmented control checked = ink fill. Prototype CSS used accent; flip here if wanted. */
  --seg-checked-bg: var(--color-text);
  --seg-checked-fg: var(--color-bg);

  --ease-pop: cubic-bezier(.3, 1.6, .5, 1);
  --ease-drop: cubic-bezier(.2, .9, .3, 1.15);
}
```

- [ ] **Step 8: Write `src/styles/base.css`**

```css
*, *::before, *::after { box-sizing: border-box; border-radius: 0; }

html, body { margin: 0; }
body {
  min-height: 100vh;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: 15px;
  line-height: 1.55;
  font-weight: 400;
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3, h4, h5, h6 {
  margin: 0;
  font-family: var(--font-heading);
  font-weight: 800;
  line-height: 1.12;
  letter-spacing: -0.015em;
}
h2 { font-size: 32px; }
h3 { font-size: 25px; }
h4 { font-size: 20px; }
p { margin: 0; }

button, input, select, textarea { font: inherit; color: inherit; }
button { cursor: pointer; }
:disabled { opacity: 0.45; cursor: not-allowed; }

a { color: var(--color-accent); text-underline-offset: 3px; }
a:hover { color: var(--color-accent-600); }

:focus { outline: none; }
:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
::selection { background: color-mix(in srgb, var(--color-accent) 30%, transparent); }

/* Kicker: 10px uppercase accent. */
.kicker { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--color-accent); }
/* Stat / meta label: 11px uppercase neutral-700. */
.label { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-neutral-700); }
/* Sticky group headers in lists and the picker. */
.section-label { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 700; }
.stat-value { font: 800 28px/1.1 var(--font-heading); }

.rule-2 { border-top: 2px solid var(--color-divider); }
.tabular { font-variant-numeric: tabular-nums; }
.text-accent { color: var(--color-accent-700); }
.muted { color: var(--color-neutral-700); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

- [ ] **Step 9: Write `src/styles/components.css`**

```css
/* — buttons: labels always flush left — */
.btn {
  display: inline-flex; align-items: center; justify-content: flex-start; gap: 6px;
  font-family: var(--font-heading); font-weight: 800; font-size: 14px; line-height: 1.2;
  color: var(--color-text); text-align: left; text-decoration: none; white-space: nowrap;
  background: transparent; border: 1px solid transparent;
  padding: var(--space-2) calc(var(--space-3) * 1.2);
}
.btn svg { display: block; flex: none; }
.btn-primary { background: var(--color-accent); color: var(--color-bg); }
.btn-primary:hover:not(:disabled) { background: var(--color-accent-600); }
.btn-primary:active:not(:disabled) { background: var(--color-accent-700); }
.btn-secondary { border-color: var(--color-divider); }
.btn-secondary:hover:not(:disabled) { background: color-mix(in srgb, var(--color-text) 7%, transparent); }
.btn-secondary:active:not(:disabled) { background: color-mix(in srgb, var(--color-text) 14%, transparent); }
.btn-ghost { color: var(--color-accent); padding-inline: var(--space-1); }
.btn-ghost:hover:not(:disabled) { background: color-mix(in srgb, var(--color-accent) 10%, transparent); }
.btn-ghost:active:not(:disabled) { background: color-mix(in srgb, var(--color-accent) 18%, transparent); }
/* Icon-only buttons have no label, so the icon is centred. */
.btn-icon { width: 36px; height: 36px; padding: 0; justify-content: center; }
/* Outlined in the current text colour (focus bar, focus mode). */
.btn-outline-current { color: inherit; border-color: currentColor; background: transparent; }

/* — inputs — */
.input {
  width: 100%; min-height: 36px; padding: 6px 10px;
  font-size: 14px; color: var(--color-text); caret-color: var(--color-accent);
  background: var(--color-surface); border: 1px solid var(--color-divider);
}
.input:hover { border-color: color-mix(in srgb, var(--color-text) 45%, transparent); }
.input:focus-visible { border-color: var(--color-accent); outline-offset: 0; }
.input-sm { width: auto; min-height: 33px; padding: 4px 8px; font-size: 13px; }

/* — segmented control: native radios as joined square segments — */
.seg { display: inline-flex; overflow: hidden; border: 1px solid var(--color-divider); }
.seg-opt { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; font-size: 13px; cursor: pointer; white-space: nowrap; }
.seg-opt input { position: absolute; opacity: 0; width: 0; height: 0; pointer-events: none; }
.seg-opt + .seg-opt { border-left: 1px solid var(--color-divider); }
.seg-opt:has(input:checked) { background: var(--seg-checked-bg); color: var(--seg-checked-fg); }
.seg-opt:not(:has(input:checked)):hover { background: color-mix(in srgb, var(--color-text) 7%, transparent); }
.seg-opt:has(input:focus-visible) { outline: 2px solid var(--color-accent); outline-offset: -2px; }

/* — tags — */
.tag { display: inline-flex; align-items: center; font-size: 11px; letter-spacing: 0.02em; padding: 3px 10px; white-space: nowrap; }
.tag-accent { background: var(--color-accent-100); color: var(--color-accent-800); }
.tag-neutral { background: var(--color-neutral-100); color: var(--color-neutral-800); }

/* — nav — */
.nav {
  display: flex; align-items: center; gap: var(--space-6);
  padding: var(--space-3) var(--space-6);
  border-bottom: 2px solid var(--color-divider);
}
.nav-brand { font-family: var(--font-heading); font-weight: 800; font-size: 18px; }

/* — dialog (the only shadow in the app) — */
.dialog-backdrop {
  position: fixed; inset: 0; display: grid; place-items: center; padding: var(--space-4);
  background: color-mix(in srgb, var(--color-neutral-900) 50%, transparent);
}
.dialog {
  width: min(440px, 100%); display: flex; flex-direction: column;
  background: var(--color-surface); box-shadow: var(--shadow-lg);
}

/* — row controls — */
.check {
  flex: none; width: 22px; height: 22px; padding: 0; display: grid; place-items: center;
  border: 2px solid var(--color-text); background: transparent; color: var(--color-bg);
}
.check:hover { border-color: var(--color-accent); }
.check.is-done { background: var(--color-accent); border-color: var(--color-accent); }
.check-sm { width: 18px; height: 18px; }

.icon-btn {
  flex: none; width: 28px; height: 28px; padding: 0; display: grid; place-items: center;
  border: 0; background: transparent; color: var(--color-text);
}
.icon-btn:hover { background: var(--color-accent-200); }
.icon-btn.is-on { color: var(--color-accent); }

.swatch { flex: none; width: 10px; height: 10px; }
.swatch-sm { width: 8px; height: 8px; }
```

- [ ] **Step 10: Write `src/styles/animations.css`**

```css
/* Each animation has two identical copies so alternating the name retriggers it. */
@keyframes pop0 { 0% { transform: scale(.3); } 60% { transform: scale(1.45); } 100% { transform: scale(1); } }
@keyframes pop1 { 0% { transform: scale(.3); } 60% { transform: scale(1.45); } 100% { transform: scale(1); } }
@keyframes drop0 { 0% { transform: translateY(-220px); opacity: 0; } 70% { transform: translateY(3px); opacity: 1; } 100% { transform: translateY(0); } }
@keyframes drop1 { 0% { transform: translateY(-220px); opacity: 0; } 70% { transform: translateY(3px); opacity: 1; } 100% { transform: translateY(0); } }
@keyframes float0 { 0% { transform: translateY(8px); opacity: 0; } 15% { opacity: 1; } 100% { transform: translateY(-40px); opacity: 0; } }
@keyframes float1 { 0% { transform: translateY(8px); opacity: 0; } 15% { opacity: 1; } 100% { transform: translateY(-40px); opacity: 0; } }
```

- [ ] **Step 11: Write `src/dev/StyleSample.vue`**

```vue
<script setup lang="ts">
import { Check, Flag, Play, Plus, Scan, Timer } from 'lucide-vue-next'
import { ref } from 'vue'

const WHEN = [['today', 'Today'], ['tomorrow', 'Tomorrow'], ['date', 'Pick date'], ['someday', 'Someday']] as const
const when = ref('today')
const done = ref(false)
</script>

<template>
  <nav class="nav">
    <span class="nav-brand">Ember</span>
    <span class="sample-date">Wed 23 Sep 2026</span>
  </nav>
  <main class="sample">
    <section>
      <span class="kicker">Kicker · type scale</span>
      <h2>Learn D3.js</h2>
      <h3>14 things finished</h3>
      <h4>Today</h4>
      <p>Body copy at 15px/1.55 in Archivo. <span class="text-accent">Paragraph-size accent text uses accent-700.</span></p>
    </section>

    <section class="rule-2">
      <span class="label">Buttons</span>
      <div class="row">
        <button class="btn btn-primary"><Play :size="16" />Start focus</button>
        <button class="btn btn-primary" style="min-width: 160px">Wide, flush left</button>
        <button class="btn btn-secondary"><Plus :size="16" :stroke-width="2.5" />Add milestone</button>
        <button class="btn btn-ghost">Show all 7</button>
        <button class="btn btn-secondary btn-icon" aria-label="Focus mode"><Scan :size="16" /></button>
        <button class="btn btn-primary" disabled>Disabled</button>
      </div>
    </section>

    <section class="rule-2">
      <span class="label">Inputs, segmented control, tags</span>
      <div class="row">
        <input class="input" placeholder="Add a task…" style="max-width: 280px" />
        <div class="seg">
          <label v-for="[value, text] in WHEN" :key="value" class="seg-opt">
            <input v-model="when" type="radio" name="sample-when" :value="value" />{{ text }}
          </label>
        </div>
        <span class="tag tag-accent">You are here</span>
        <span class="tag tag-neutral">Inbox</span>
      </div>
    </section>

    <section class="rule-2">
      <span class="label">List rows</span>
      <div class="list">
        <div class="sample-row">
          <button class="check" :class="{ 'is-done': done }" aria-label="Toggle task" @click="done = !done">
            <Check v-if="done" :size="14" :stroke-width="3.5" />
          </button>
          <span>Review pull request #482</span>
          <button class="icon-btn" aria-label="Deadline"><Flag :size="16" /></button>
          <button class="icon-btn is-on" aria-label="Focus on this task"><Timer :size="16" /></button>
        </div>
        <div class="sample-row">
          <button class="check" aria-label="Toggle task"></button>
          <span>30-minute run</span>
          <span></span>
          <button class="icon-btn" aria-label="Focus on this task"><Timer :size="16" /></button>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.sample-date { margin-left: auto; font-size: 13px; }
.sample { padding: var(--space-6); display: flex; flex-direction: column; gap: var(--space-6); }
section { display: flex; flex-direction: column; gap: var(--space-3); padding-top: var(--space-3); }
.row { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
.list { display: flex; flex-direction: column; border-top: 2px solid var(--color-divider); max-width: 560px; }
.sample-row {
  display: grid; grid-template-columns: 22px minmax(0, 1fr) 28px 28px; gap: var(--space-2) var(--space-3);
  align-items: center; padding: var(--space-2); border-bottom: 1px solid var(--color-divider); font-size: 14px;
}
</style>
```

- [ ] **Step 12: Write `src/main.ts` and `src/App.vue`**

`src/main.ts`:
```ts
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import './styles/animations.css'

createApp(App).use(createPinia()).mount('#app')
```

`src/App.vue` (Task 8 adds the store line):
```vue
<script setup lang="ts">
import StyleSample from './dev/StyleSample.vue'
</script>

<template>
  <StyleSample />
</template>
```

- [ ] **Step 13: Write `CLAUDE.md`**

```markdown
# Ember

Local-first, single-user app: daily tasks, learning goals (goal → milestones → steps), pomodoro focus timer with a full-screen Focus mode, and activity views. Fresh build from the design handoff in `docs/design/`:
- `docs/design/handoff.md` — the spec.
- `docs/design/reference/Ember.dc.html` — working prototype; source of truth for formulas and copy when the spec is ambiguous. Its logic is in the `<script data-dc-script>` block. Recreate, never ship or wrap it.

## Commands
- `npm run dev` · `npm test` · `npm run build` (vue-tsc + vite) · `npm run typecheck`

## Stack
Vite + Vue 3 (`<script setup>`) + TypeScript + Pinia; plain CSS tokens in `src/styles/`; lucide-vue-next; Vitest + jsdom. No UI kit, no Tailwind, no backend. TypeScript pinned to ~6 (vue-tsc can't load TS 7).

## Architecture
- `src/core/` — framework-agnostic pure TS (model, dates, derivations, timer, seed, persistence). No `vue`/`pinia` imports. Unit-tested.
- `src/stores/ember.ts` — the single Pinia store. Persisted slice (goals, tasks, logs, selection, timer, settings) → localStorage `ember:v1`.
- Derive, don't store: spent minutes, today's totals, streaks and goal % come from `FocusLog` + `doneOn`.
- Timer uses wall-clock `endsAt`, never tick counting.
- Plans: one per phase in `docs/superpowers/plans/`.

## Visual rules (non-negotiable)
Zero border radius; 2px rules between major sections, 1px between list rows; button labels flush left; red accent sparingly (paragraph-size accent text = accent-700); no gradients, no emoji, no shadows except the picker dialog.
```

- [ ] **Step 14: Verify build, tests and the page**

Run: `npm run build && npm test`
Expected: vue-tsc passes, `dist/` builds, 1 test passes.

Run `npm run dev` (background), open `http://localhost:5173` in the Playwright browser and screenshot. Check: Archivo renders; no rounded corners; the wide primary button's label sits at the left; the checked segment is ink-filled; the 2px rules sit above sections; the checkbox fills red when clicked.

- [ ] **Step 15: Commit**

```bash
git add -A
git commit -m "feat: scaffold Ember with Modernist tokens and base styles"
```

---

### Task 2: Format, date and YouTube helpers

**Files:**
- Create: `src/core/format.ts`, `src/core/dates.ts`, `src/core/youtube.ts`
- Test: `src/core/format.test.ts`, `src/core/dates.test.ts`, `src/core/youtube.test.ts`
- Delete: `src/core/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `format.ts`: `pad2(n: number): string`, `fmtM(min: number): string`, `fmtInt(n: number): string`, `clock(sec: number): string`, `hashStr(s: string): number`, `hash7(s: string): string`, `plural(n: number, word: string): string`
  - `dates.ts`: `type ISODate = string`, `toISO(d: Date)`, `fromISO(s)`, `todayISO(now?: number)`, `addDays(s, n)`, `diffDays(a, b): number` (a − b), `dayLabel(s)` → `"Sep 21"`, `weekdayLong(s)` → `"Wednesday"`, `navDate(s)` → `"Wed 23 Sep 2026"`, `monthName(s)` → `"September"`, `isWeekend(s)`, `yearOf(s): number`, `startOfYear(s)`, `dayOfYear(s): number` (0-based), `daysInYear(year: number)`, `mondayOf(s)`
  - `youtube.ts`: `ytId(input: string): string | null`, `embedUrl(id: string, muted: boolean): string`, `DEFAULT_VIDEO_URL`

- [ ] **Step 1: Write the failing tests**

`src/core/format.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { clock, fmtInt, fmtM, hash7, hashStr, pad2, plural } from './format'

describe('format', () => {
  it('pads to two digits', () => {
    expect(pad2(2)).toBe('02')
    expect(pad2(12)).toBe('12')
  })

  it('formats minutes like the prototype', () => {
    expect(fmtM(0)).toBe('0m')
    expect(fmtM(25)).toBe('25m')
    expect(fmtM(60)).toBe('1h')
    expect(fmtM(75)).toBe('1h 15m')
    expect(fmtM(250)).toBe('4h 10m')
  })

  it('formats integers with en-US grouping', () => {
    expect(fmtInt(1234)).toBe('1,234')
  })

  it('formats a countdown as MM:SS, rounding seconds up and clamping at zero', () => {
    expect(clock(1500)).toBe('25:00')
    expect(clock(3000)).toBe('50:00')
    expect(clock(59.2)).toBe('01:00')
    expect(clock(-3)).toBe('00:00')
  })

  it('hashes strings like the prototype hsh()', () => {
    expect(hashStr('abc')).toBe(304891)
    expect(hash7('abc')).toBe('0004a6f')
  })

  it('pluralises', () => {
    expect(plural(1, 'session')).toBe('1 session')
    expect(plural(2, 'session')).toBe('2 sessions')
    expect(plural(0, 'task')).toBe('0 tasks')
  })
})
```

`src/core/dates.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  addDays, dayLabel, dayOfYear, daysInYear, diffDays, fromISO, isWeekend, mondayOf,
  monthName, navDate, startOfYear, toISO, todayISO, weekdayLong, yearOf,
} from './dates'

describe('dates', () => {
  it('round-trips ISO dates in local time', () => {
    expect(toISO(fromISO('2026-09-23'))).toBe('2026-09-23')
    expect(todayISO(new Date(2026, 8, 23, 23, 59).getTime())).toBe('2026-09-23')
    expect(todayISO(new Date(2026, 8, 24, 0, 1).getTime())).toBe('2026-09-24')
  })

  it('adds days across month and year ends', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2026-09-23', 0)).toBe('2026-09-23')
  })

  it('counts whole days, including across a DST change', () => {
    expect(diffDays('2026-09-25', '2026-09-23')).toBe(2)
    expect(diffDays('2026-09-21', '2026-09-23')).toBe(-2)
    expect(diffDays('2026-11-02', '2026-10-24')).toBe(9)
    expect(diffDays('2026-04-02', '2026-03-24')).toBe(9)
  })

  it('formats labels', () => {
    expect(dayLabel('2026-09-21')).toBe('Sep 21')
    expect(weekdayLong('2026-09-23')).toBe('Wednesday')
    expect(navDate('2026-09-23')).toBe('Wed 23 Sep 2026')
    expect(monthName('2026-09-23')).toBe('September')
  })

  it('knows weekends', () => {
    expect(isWeekend('2026-09-26')).toBe(true)
    expect(isWeekend('2026-09-27')).toBe(true)
    expect(isWeekend('2026-09-23')).toBe(false)
  })

  it('locates a day in its year', () => {
    expect(yearOf('2026-09-23')).toBe(2026)
    expect(startOfYear('2026-09-23')).toBe('2026-01-01')
    expect(dayOfYear('2026-01-01')).toBe(0)
    expect(dayOfYear('2026-09-23')).toBe(265)
    expect(daysInYear(2026)).toBe(365)
    expect(daysInYear(2028)).toBe(366)
    expect(daysInYear(2100)).toBe(365)
    expect(fromISO('2026-01-01').getDay()).toBe(4)
  })

  it('finds the Monday of a week', () => {
    expect(mondayOf('2026-09-23')).toBe('2026-09-21')
    expect(mondayOf('2026-09-21')).toBe('2026-09-21')
    expect(mondayOf('2026-09-27')).toBe('2026-09-21')
  })
})
```

`src/core/youtube.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { embedUrl, ytId } from './youtube'

describe('ytId', () => {
  it.each([
    ['https://www.youtube.com/watch?v=jfKfPfyJRdk', 'jfKfPfyJRdk'],
    ['https://youtube.com/watch?feature=share&v=jfKfPfyJRdk&t=30', 'jfKfPfyJRdk'],
    ['https://youtu.be/jfKfPfyJRdk?si=abc', 'jfKfPfyJRdk'],
    ['https://www.youtube.com/embed/jfKfPfyJRdk', 'jfKfPfyJRdk'],
    ['https://www.youtube.com/shorts/jfKfPfyJRdk', 'jfKfPfyJRdk'],
    ['https://www.youtube.com/live/jfKfPfyJRdk', 'jfKfPfyJRdk'],
    ['  jfKfPfyJRdk  ', 'jfKfPfyJRdk'],
  ])('parses %s', (input, id) => {
    expect(ytId(input)).toBe(id)
  })

  it.each(['', 'hello', 'https://vimeo.com/123456', 'https://youtube.com/watch?v=short'])('rejects %s', (input) => {
    expect(ytId(input)).toBeNull()
  })
})

describe('embedUrl', () => {
  it('builds the nocookie loop URL', () => {
    expect(embedUrl('jfKfPfyJRdk', true)).toBe(
      'https://www.youtube-nocookie.com/embed/jfKfPfyJRdk?autoplay=1&mute=1&loop=1&playlist=jfKfPfyJRdk&controls=0&modestbranding=1&playsinline=1&rel=0&iv_load_policy=3&disablekb=1',
    )
    expect(embedUrl('jfKfPfyJRdk', false)).toContain('mute=0')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `rm src/core/smoke.test.ts && npm test`
Expected: FAIL — cannot resolve `./format`, `./dates`, `./youtube`.

- [ ] **Step 3: Write `src/core/format.ts`**

```ts
export const pad2 = (n: number): string => String(n).padStart(2, '0')

/** 25 → "25m", 60 → "1h", 75 → "1h 15m". */
export function fmtM(min: number): string {
  const m = Math.round(min)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? `${h}h ${rest}m` : `${h}h`
}

export const fmtInt = (n: number): string => n.toLocaleString('en-US')

/** Seconds left → "MM:SS", rounding up so 0.2s still reads 00:01. */
export function clock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec))
  return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`
}

/** The prototype's hsh(): stable 32-bit string hash. */
export function hashStr(s: string): number {
  let h = 7
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}

/** 7-character hex id shown in the activity log. */
export const hash7 = (s: string): string => hashStr(s).toString(16).padStart(8, '0').slice(0, 7)

export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`
```

- [ ] **Step 4: Write `src/core/dates.ts`**

```ts
import { pad2 } from './format'

/** 'YYYY-MM-DD' in local time. */
export type ISODate = string

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const toISO = (d: Date): ISODate => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

/** Local midnight of the given day. */
export function fromISO(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const todayISO = (now: number = Date.now()): ISODate => toISO(new Date(now))

export function addDays(s: ISODate, n: number): ISODate {
  const d = fromISO(s)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

/** Whole days from b to a (a − b). Rounding absorbs DST hours. */
export const diffDays = (a: ISODate, b: ISODate): number =>
  Math.round((fromISO(a).getTime() - fromISO(b).getTime()) / 864e5)

export function dayLabel(s: ISODate): string {
  const d = fromISO(s)
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

export const weekdayLong = (s: ISODate): string => WEEKDAYS_LONG[fromISO(s).getDay()]

export function navDate(s: ISODate): string {
  const d = fromISO(s)
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export const monthName = (s: ISODate): string => MONTHS_LONG[fromISO(s).getMonth()]

export function isWeekend(s: ISODate): boolean {
  const day = fromISO(s).getDay()
  return day === 0 || day === 6
}

export const yearOf = (s: ISODate): number => Number(s.slice(0, 4))
export const startOfYear = (s: ISODate): ISODate => `${s.slice(0, 4)}-01-01`
/** 0-based: 1 Jan → 0. */
export const dayOfYear = (s: ISODate): number => diffDays(s, startOfYear(s))
export const daysInYear = (y: number): number => ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365)

export const mondayOf = (s: ISODate): ISODate => addDays(s, -((fromISO(s).getDay() + 6) % 7))
```

- [ ] **Step 5: Write `src/core/youtube.ts`**

```ts
export const DEFAULT_VIDEO_URL = 'https://www.youtube.com/watch?v=jfKfPfyJRdk'

/** Video id from watch?v=, youtu.be/, embed/, shorts/ or live/ links, or a bare 11-character id. */
export function ytId(input: string): string | null {
  const s = (input || '').trim()
  if (/^[\w-]{11}$/.test(s)) return s
  const m = s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})(?![\w-])/)
  return m ? m[1] : null
}

export const embedUrl = (id: string, muted: boolean): string =>
  `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=${muted ? 1 : 0}&loop=1&playlist=${id}` +
  '&controls=0&modestbranding=1&playsinline=1&rel=0&iv_load_policy=3&disablekb=1'
```

Note: the `(?![\w-])` lookahead is stricter than the prototype so `watch?v=short` (too short) and over-long ids are rejected.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — format, dates, youtube suites green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(core): add format, date and YouTube helpers"
```

---

### Task 3: Model, goal derivations and log tally

**Files:**
- Create: `src/core/model.ts`, `src/core/ids.ts`, `src/core/goals.ts`, `src/core/tally.ts`, `src/core/test-fixtures.ts`
- Test: `src/core/goals.test.ts`, `src/core/tally.test.ts`

**Interfaces:**
- Consumes: `ISODate` from `dates.ts`; `DEFAULT_VIDEO_URL` from `youtube.ts`.
- Produces:
  - `model.ts`: types `Step`, `Milestone`, `Goal`, `Task`, `TaskTarget`, `StepTarget`, `Target`, `FocusLog`, `Selection`, `Phase`, `Timer`, `SessionLength`, `FocusBg`, `Settings`, `EmberData`; `DEFAULT_SETTINGS: Settings`; `targetKey(t: Target): string` (`"task:<id>"` / `"step:<stepId>"`); `sameTarget(a: Target | null, b: Target | null): boolean`
  - `ids.ts`: `uid(): string`
  - `goals.ts`: `isMilestoneDone(m)`, `interface GoalStats { done; total; pct; milestonesDone; currentIndex }`, `goalStats(g)`, `interface OpenStep { milestone; mi; step; si }`, `nextOpenStep(g): OpenStep | null`, `stepTarget(g, m, s): StepTarget`, `interface StepLocation { goal; gi; milestone; mi; step; si }`, `findStep(goals, t: StepTarget): StepLocation | null`, `stepAfter(g, stepId): Step | null`, `GOAL_COLORS`, `goalColor(gi)`
  - `tally.ts`: `interface Tally { spent: Map<string, number>; spentToday: Map<string, number>; minutesToday: number; sessionsToday: number }`, `tallyLogs(logs, today): Tally`
  - `test-fixtures.ts`: `goalFixture(title, milestones)`, `taskFixture(title, patch?)`, `dataFixture(patch?)`. Fixture ids: goal id = title; milestone id = `"<goal>/<milestone>"`; step id = `"<goal>/<milestone>/<step>"`; task id = title. Fixture steps have `estMin: 50`.

- [ ] **Step 1: Write `src/core/model.ts`** (types only — nothing to test first)

```ts
import type { ISODate } from './dates'
import { DEFAULT_VIDEO_URL } from './youtube'

export type { ISODate }

export interface Step { id: string; title: string; doneOn: ISODate | null; estMin: number }
export interface Milestone { id: string; title: string; steps: Step[] }
export interface Goal { id: string; title: string; outcome: string; milestones: Milestone[]; createdAt: ISODate }

export interface Task {
  id: string
  title: string
  tag: string
  goalId: string | null
  /** null = Someday */
  date: ISODate | null
  /** Only meaningful when date != null. */
  deadline: boolean
  doneOn: ISODate | null
}

export interface TaskTarget { kind: 'task'; taskId: string }
export interface StepTarget { kind: 'step'; goalId: string; msId: string; stepId: string }
export type Target = TaskTarget | StepTarget
export type Selection = Target | null

export interface FocusLog { id: string; at: number; date: ISODate; min: number; target: Target | null }

export type Phase = 'focus' | 'break'
export interface Timer {
  phase: Phase
  running: boolean
  /** Wall-clock ms when the phase ends; set only while running. */
  endsAt: number | null
  /** Timer-seconds left while paused (speed-independent). */
  leftSec: number
  /** Timer-seconds per real second, captured when a run starts (1, or 60 in demo). */
  speed: number
}

export type SessionLength = '25/5' | '50/10'
export type FocusBg = 'video' | 'off'
export interface Settings {
  session: SessionLength
  demo: boolean
  showFuture: boolean
  wallWeeks: number
  focusBg: FocusBg
  youtubeUrl: string
  muted: boolean
}

export interface EmberData {
  goals: Goal[]
  tasks: Task[]
  logs: FocusLog[]
  selection: Selection
  timer: Timer
  settings: Settings
}

export const DEFAULT_SETTINGS: Settings = {
  session: '25/5',
  demo: false,
  showFuture: true,
  wallWeeks: 12,
  focusBg: 'video',
  youtubeUrl: DEFAULT_VIDEO_URL,
  muted: true,
}

export const targetKey = (t: Target): string => (t.kind === 'task' ? `task:${t.taskId}` : `step:${t.stepId}`)

export const sameTarget = (a: Target | null, b: Target | null): boolean =>
  !!a && !!b && targetKey(a) === targetKey(b)
```

`src/core/ids.ts`:
```ts
export const uid = (): string => crypto.randomUUID()
```

- [ ] **Step 2: Write `src/core/test-fixtures.ts`**

```ts
import type { ISODate } from './dates'
import type { EmberData, Goal, Task } from './model'
import { DEFAULT_SETTINGS } from './model'
import { idleTimer } from './timer'

type StepSpec = [title: string, doneOn: ISODate | null]
type MilestoneSpec = [title: string, steps: StepSpec[]]

/** Readable ids: goal = title, milestone = "goal/ms", step = "goal/ms/step". Every step is estimated at 50m. */
export function goalFixture(title: string, milestones: MilestoneSpec[]): Goal {
  return {
    id: title,
    title,
    outcome: '',
    createdAt: '2026-01-01',
    milestones: milestones.map(([mt, steps]) => ({
      id: `${title}/${mt}`,
      title: mt,
      steps: steps.map(([st, doneOn]) => ({ id: `${title}/${mt}/${st}`, title: st, doneOn, estMin: 50 })),
    })),
  }
}

export function taskFixture(title: string, patch: Partial<Task> = {}): Task {
  return { id: title, title, tag: 'Work', goalId: null, date: '2026-09-23', deadline: false, doneOn: null, ...patch }
}

export function dataFixture(patch: Partial<EmberData> = {}): EmberData {
  return {
    goals: [],
    tasks: [],
    logs: [],
    selection: null,
    timer: idleTimer('25/5'),
    settings: { ...DEFAULT_SETTINGS },
    ...patch,
  }
}
```

(This imports `idleTimer` from Task 4's `timer.ts`. Create a stub now so it compiles — Task 4 replaces it:)

`src/core/timer.ts` (temporary stub):
```ts
import type { Phase, SessionLength, Timer } from './model'

export const LENGTHS: Record<SessionLength, { focus: number; brk: number }> = {
  '25/5': { focus: 1500, brk: 300 },
  '50/10': { focus: 3000, brk: 600 },
}

export const phaseLength = (phase: Phase, session: SessionLength): number =>
  phase === 'focus' ? LENGTHS[session].focus : LENGTHS[session].brk

export const idleTimer = (session: SessionLength, phase: Phase = 'focus'): Timer => ({
  phase, running: false, endsAt: null, leftSec: phaseLength(phase, session), speed: 1,
})
```

- [ ] **Step 3: Write the failing tests**

`src/core/goals.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { findStep, goalColor, goalStats, isMilestoneDone, nextOpenStep, stepAfter, stepTarget } from './goals'
import { goalFixture } from './test-fixtures'

const d3 = () => goalFixture('D3', [
  ['Foundations', [['SVG', '2026-07-01'], ['Scales', '2026-07-08']]],
  ['First charts', [['Bar', '2026-09-01'], ['Line', null], ['Scatter', null]]],
  ['Capstone', [['Build', null]]],
])

describe('goal derivations', () => {
  it('computes stats and the current milestone', () => {
    expect(goalStats(d3())).toEqual({ done: 3, total: 6, pct: 50, milestonesDone: 1, currentIndex: 1 })
  })

  it('treats an empty milestone as not done, so a new goal starts on it', () => {
    const g = goalFixture('New', [['Getting started', []]])
    expect(isMilestoneDone(g.milestones[0])).toBe(false)
    expect(goalStats(g)).toEqual({ done: 0, total: 0, pct: 0, milestonesDone: 0, currentIndex: 0 })
    expect(nextOpenStep(g)).toBeNull()
  })

  it('finds the next open step', () => {
    const g = d3()
    const next = nextOpenStep(g)
    expect(next?.step.title).toBe('Line')
    expect(next?.mi).toBe(1)
    expect(next?.si).toBe(1)
  })

  it('returns no next step and currentIndex -1 when everything is done', () => {
    const g = goalFixture('Done', [['Only', [['A', '2026-09-01']]]])
    expect(nextOpenStep(g)).toBeNull()
    expect(goalStats(g).currentIndex).toBe(-1)
    expect(goalStats(g).pct).toBe(100)
  })

  it('finds the open step after a given one, across milestones and skipping done steps', () => {
    const g = d3()
    expect(stepAfter(g, 'D3/First charts/Line')?.title).toBe('Scatter')
    expect(stepAfter(g, 'D3/First charts/Scatter')?.title).toBe('Build')
    expect(stepAfter(g, 'D3/Capstone/Build')).toBeNull()
    g.milestones[1].steps[2].doneOn = '2026-09-20'
    expect(stepAfter(g, 'D3/First charts/Line')?.title).toBe('Build')
  })

  it('locates a step target', () => {
    const g = d3()
    const t = stepTarget(g, g.milestones[1], g.milestones[1].steps[1])
    expect(t).toEqual({ kind: 'step', goalId: 'D3', msId: 'D3/First charts', stepId: 'D3/First charts/Line' })
    const loc = findStep([goalFixture('Other', []), g], t)
    expect(loc).toMatchObject({ gi: 1, mi: 1, si: 1 })
    expect(loc?.step.title).toBe('Line')
    expect(findStep([g], { ...t, stepId: 'nope' })).toBeNull()
  })

  it('cycles goal colours: accent, ink, accent-300, neutral-500', () => {
    expect(goalColor(0)).toBe('var(--color-accent)')
    expect(goalColor(1)).toBe('var(--color-text)')
    expect(goalColor(2)).toBe('var(--color-accent-300)')
    expect(goalColor(3)).toBe('var(--color-neutral-500)')
    expect(goalColor(4)).toBe('var(--color-accent)')
  })
})
```

`src/core/tally.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { FocusLog } from './model'
import { tallyLogs } from './tally'

const log = (date: string, min: number, target: FocusLog['target']): FocusLog => ({ id: `${date}-${Math.random()}`, at: 0, date, min, target })
const step = { kind: 'step', goalId: 'g', msId: 'm', stepId: 's1' } as const
const task = { kind: 'task', taskId: 't1' } as const

describe('tallyLogs', () => {
  it('sums spent minutes per target and today totals', () => {
    const t = tallyLogs([
      log('2026-09-22', 25, step),
      log('2026-09-23', 25, step),
      log('2026-09-23', 25, task),
      log('2026-09-23', 25, null),
    ], '2026-09-23')
    expect(t.spent.get('step:s1')).toBe(50)
    expect(t.spent.get('task:t1')).toBe(25)
    expect(t.spentToday.get('step:s1')).toBe(25)
    expect(t.minutesToday).toBe(75)
    expect(t.sessionsToday).toBe(3)
  })

  it('is empty with no logs', () => {
    const t = tallyLogs([], '2026-09-23')
    expect(t.spent.size).toBe(0)
    expect(t.minutesToday).toBe(0)
    expect(t.sessionsToday).toBe(0)
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./goals`, `./tally`.

- [ ] **Step 5: Write `src/core/goals.ts`**

```ts
import type { Goal, Milestone, Step, StepTarget } from './model'

export const isMilestoneDone = (m: Milestone): boolean => m.steps.length > 0 && m.steps.every((s) => s.doneOn != null)

export interface GoalStats { done: number; total: number; pct: number; milestonesDone: number; currentIndex: number }

export function goalStats(g: Goal): GoalStats {
  const all = g.milestones.flatMap((m) => m.steps)
  const done = all.filter((s) => s.doneOn != null).length
  return {
    done,
    total: all.length,
    pct: all.length ? Math.round((done / all.length) * 100) : 0,
    milestonesDone: g.milestones.filter(isMilestoneDone).length,
    /** First milestone with an open step (or no steps); -1 when all are done. */
    currentIndex: g.milestones.findIndex((m) => !isMilestoneDone(m)),
  }
}

export interface OpenStep { milestone: Milestone; mi: number; step: Step; si: number }

/** First open step of the goal, in roadmap order. */
export function nextOpenStep(g: Goal): OpenStep | null {
  for (let mi = 0; mi < g.milestones.length; mi++) {
    const milestone = g.milestones[mi]
    const si = milestone.steps.findIndex((s) => s.doneOn == null)
    if (si >= 0) return { milestone, mi, step: milestone.steps[si], si }
  }
  return null
}

export const stepTarget = (g: Goal, m: Milestone, s: Step): StepTarget =>
  ({ kind: 'step', goalId: g.id, msId: m.id, stepId: s.id })

export interface StepLocation { goal: Goal; gi: number; milestone: Milestone; mi: number; step: Step; si: number }

export function findStep(goals: Goal[], t: StepTarget): StepLocation | null {
  const gi = goals.findIndex((g) => g.id === t.goalId)
  if (gi < 0) return null
  const goal = goals[gi]
  const mi = goal.milestones.findIndex((m) => m.id === t.msId)
  if (mi < 0) return null
  const milestone = goal.milestones[mi]
  const si = milestone.steps.findIndex((s) => s.id === t.stepId)
  if (si < 0) return null
  return { goal, gi, milestone, mi, step: milestone.steps[si], si }
}

/** The next open step after `stepId` in roadmap order — Focus mode's "Then:" line. */
export function stepAfter(g: Goal, stepId: string): Step | null {
  let past = false
  for (const m of g.milestones) {
    for (const s of m.steps) {
      if (s.id === stepId) past = true
      else if (past && s.doneOn == null) return s
    }
  }
  return null
}

export const GOAL_COLORS = [
  'var(--color-accent)',
  'var(--color-text)',
  'var(--color-accent-300)',
  'var(--color-neutral-500)',
] as const

export const goalColor = (gi: number): string => GOAL_COLORS[gi % GOAL_COLORS.length]
```

- [ ] **Step 6: Write `src/core/tally.ts`**

```ts
import type { ISODate } from './dates'
import type { FocusLog } from './model'
import { targetKey } from './model'

export interface Tally {
  /** Minutes per targetKey, all time. */
  spent: Map<string, number>
  /** Minutes per targetKey, today only (session blocks drawn in accent). */
  spentToday: Map<string, number>
  minutesToday: number
  sessionsToday: number
}

export function tallyLogs(logs: FocusLog[], today: ISODate): Tally {
  const spent = new Map<string, number>()
  const spentToday = new Map<string, number>()
  let minutesToday = 0
  let sessionsToday = 0
  for (const l of logs) {
    const key = l.target ? targetKey(l.target) : null
    if (key) spent.set(key, (spent.get(key) ?? 0) + l.min)
    if (l.date !== today) continue
    minutesToday += l.min
    sessionsToday++
    if (key) spentToday.set(key, (spentToday.get(key) ?? 0) + l.min)
  }
  return { spent, spentToday, minutesToday, sessionsToday }
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS; no type errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(core): add data model, goal derivations and log tally"
```

---

### Task 4: Wall-clock timer engine

**Files:**
- Modify: `src/core/timer.ts` (replace the stub)
- Test: `src/core/timer.test.ts`

**Interfaces:**
- Consumes: `Timer`, `Phase`, `SessionLength` from `model.ts`.
- Produces: `DEMO_SPEED = 60`, `LENGTHS`, `phaseLength(phase, session)`, `idleTimer(session, phase = 'focus')`, `remainingSec(t, now)`, `startTimer(t, now, speed)`, `pauseTimer(t, now)`, `isDue(t, now)`, `progress(t, now, session): number` (0–1), `phaseLabel(t, session)`, `startLabel(t, session)`, `canReset(t, session)`.

- [ ] **Step 1: Write the failing tests**

`src/core/timer.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  DEMO_SPEED, canReset, idleTimer, isDue, pauseTimer, phaseLabel, progress, remainingSec, startLabel, startTimer,
} from './timer'

const T0 = new Date(2026, 8, 23, 10, 0, 0).getTime()
const MIN = 60_000

describe('timer engine', () => {
  it('starts idle in a full focus phase', () => {
    const t = idleTimer('25/5')
    expect(t).toEqual({ phase: 'focus', running: false, endsAt: null, leftSec: 1500, speed: 1 })
    expect(idleTimer('50/10').leftSec).toBe(3000)
    expect(idleTimer('25/5', 'break').leftSec).toBe(300)
    expect(idleTimer('50/10', 'break').leftSec).toBe(600)
  })

  it('counts down from the wall clock, not from ticks', () => {
    const t = startTimer(idleTimer('25/5'), T0, 1)
    expect(t.endsAt).toBe(T0 + 25 * MIN)
    expect(remainingSec(t, T0 + 10 * MIN)).toBe(900)
    expect(isDue(t, T0 + 25 * MIN - 1)).toBe(false)
    expect(isDue(t, T0 + 25 * MIN)).toBe(true)
    expect(remainingSec(t, T0 + 99 * MIN)).toBe(0)
  })

  it('pauses and resumes without losing time', () => {
    let t = startTimer(idleTimer('25/5'), T0, 1)
    t = pauseTimer(t, T0 + 5 * MIN)
    expect(t).toMatchObject({ running: false, endsAt: null, leftSec: 1200 })
    expect(remainingSec(t, T0 + 60 * MIN)).toBe(1200)
    t = startTimer(t, T0 + 60 * MIN, 1)
    expect(t.endsAt).toBe(T0 + 80 * MIN)
  })

  it('runs 25 minutes in 25 seconds at demo speed', () => {
    const t = startTimer(idleTimer('25/5'), T0, DEMO_SPEED)
    expect(t.speed).toBe(60)
    expect(t.endsAt).toBe(T0 + 25_000)
    expect(remainingSec(t, T0 + 10_000)).toBe(900)
  })

  it('ignores start when running and pause when paused', () => {
    const running = startTimer(idleTimer('25/5'), T0, 1)
    expect(startTimer(running, T0 + MIN, 1)).toBe(running)
    const idle = idleTimer('25/5')
    expect(pauseTimer(idle, T0)).toBe(idle)
  })

  it('reports progress through the phase', () => {
    const t = startTimer(idleTimer('25/5'), T0, 1)
    expect(progress(idleTimer('25/5'), T0, '25/5')).toBe(0)
    expect(progress(t, T0 + 5 * MIN, '25/5')).toBeCloseTo(0.2)
  })

  it('labels the phase and the start button like the prototype', () => {
    const idle = idleTimer('25/5')
    const running = startTimer(idle, T0, 1)
    const paused = pauseTimer(running, T0 + MIN)
    const brk = idleTimer('25/5', 'break')
    expect(phaseLabel(idle, '25/5')).toBe('Next focus session')
    expect(phaseLabel(running, '25/5')).toBe('Focusing on')
    expect(phaseLabel(brk, '25/5')).toBe('Session done — take 5')
    expect(phaseLabel(brk, '50/10')).toBe('Session done — take 10')
    expect(phaseLabel(startTimer(brk, T0, 1), '25/5')).toBe('Break')
    expect(startLabel(idle, '25/5')).toBe('Start focus')
    expect(startLabel(running, '25/5')).toBe('Pause')
    expect(startLabel(paused, '25/5')).toBe('Resume')
    expect(startLabel(brk, '25/5')).toBe('Start break')
  })

  it('offers Reset only in focus once the timer has run', () => {
    const idle = idleTimer('25/5')
    const running = startTimer(idle, T0, 1)
    expect(canReset(idle, '25/5')).toBe(false)
    expect(canReset(running, '25/5')).toBe(true)
    expect(canReset(pauseTimer(running, T0 + MIN), '25/5')).toBe(true)
    expect(canReset(idleTimer('25/5', 'break'), '25/5')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/core/timer.test.ts`
Expected: FAIL — `startTimer`, `remainingSec`, etc. are not exported.

- [ ] **Step 3: Replace `src/core/timer.ts`**

```ts
import type { Phase, SessionLength, Timer } from './model'

/** Demo speed: one real second ≈ one timer minute. */
export const DEMO_SPEED = 60

/** Phase lengths in timer-seconds. */
export const LENGTHS: Record<SessionLength, { focus: number; brk: number }> = {
  '25/5': { focus: 1500, brk: 300 },
  '50/10': { focus: 3000, brk: 600 },
}

export const phaseLength = (phase: Phase, session: SessionLength): number =>
  phase === 'focus' ? LENGTHS[session].focus : LENGTHS[session].brk

export const idleTimer = (session: SessionLength, phase: Phase = 'focus'): Timer => ({
  phase, running: false, endsAt: null, leftSec: phaseLength(phase, session), speed: 1,
})

/** Timer-seconds left, derived from the wall clock while running. */
export function remainingSec(t: Timer, now: number): number {
  if (!t.running || t.endsAt == null) return t.leftSec
  return Math.max(0, ((t.endsAt - now) / 1000) * t.speed)
}

export function startTimer(t: Timer, now: number, speed: number): Timer {
  if (t.running) return t
  return { ...t, running: true, speed, endsAt: now + (t.leftSec * 1000) / speed }
}

export function pauseTimer(t: Timer, now: number): Timer {
  if (!t.running) return t
  return { ...t, running: false, endsAt: null, leftSec: remainingSec(t, now) }
}

export const isDue = (t: Timer, now: number): boolean => t.running && t.endsAt != null && now >= t.endsAt

export const progress = (t: Timer, now: number, session: SessionLength): number =>
  1 - remainingSec(t, now) / phaseLength(t.phase, session)

export function phaseLabel(t: Timer, session: SessionLength): string {
  if (t.phase === 'break') return t.running ? 'Break' : `Session done — take ${LENGTHS[session].brk / 60}`
  return t.running ? 'Focusing on' : 'Next focus session'
}

export function startLabel(t: Timer, session: SessionLength): string {
  if (t.running) return 'Pause'
  if (t.phase === 'break') return 'Start break'
  return t.leftSec < phaseLength('focus', session) ? 'Resume' : 'Start focus'
}

export const canReset = (t: Timer, session: SessionLength): boolean =>
  t.phase === 'focus' && (t.running || t.leftSec < phaseLength('focus', session))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all suites.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): add wall-clock timer engine"
```

---

### Task 5: Seed data with generated history

**Files:**
- Create: `src/core/seed.ts`
- Test: `src/core/seed.test.ts`

**Interfaces:**
- Consumes: `dates.ts` (`addDays`, `dayOfYear`, `daysInYear`, `fromISO`, `isWeekend`, `startOfYear`, `todayISO`, `yearOf`), `hashStr`, `uid`, `goals.ts` (`nextOpenStep`, `stepTarget`), `idleTimer`, `DEFAULT_SETTINGS`, model types.
- Produces: `buildSeed(now?: number): EmberData` — deterministic content for a given `now` (ids are random UUIDs). Seed tasks keep the prototype order after the history tasks; `logs` sorted by `at` ascending; `selection` = Learn D3.js's next open step ("Reusable chart function").

- [ ] **Step 1: Write the failing tests**

`src/core/seed.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { addDays, isWeekend } from './dates'
import { findStep, nextOpenStep, stepTarget } from './goals'
import type { StepTarget } from './model'
import { targetKey } from './model'
import { buildSeed } from './seed'
import { tallyLogs } from './tally'

const NOW = new Date(2026, 8, 23, 10, 0, 0).getTime()
const TODAY = '2026-09-23'
const seed = buildSeed(NOW)
const tally = tallyLogs(seed.logs, TODAY)
const task = (title: string) => seed.tasks.find((t) => t.title === title)!

describe('buildSeed', () => {
  it('creates the three prototype goals with their milestones', () => {
    expect(seed.goals.map((g) => g.title)).toEqual(['Learn D3.js', 'Speak Spanish at B1', 'Learn watercolour'])
    const d3 = seed.goals[0]
    expect(d3.outcome).toBe('Build and publish an interactive, animated chart of a real dataset — starting from a blank file, no tutorial open.')
    expect(d3.milestones.map((m) => m.title)).toEqual(['Foundations', 'First charts', 'Motion & interaction', 'Capstone'])
    expect(d3.milestones[1].steps.map((s) => s.doneOn != null)).toEqual([true, true, true, false])
  })

  it('dates done steps by weeks ago, with 0 weeks meaning yesterday', () => {
    const conversation = seed.goals[1].milestones[2]
    expect(conversation.steps[0].doneOn).toBe(addDays(TODAY, -7))
    expect(conversation.steps[1].doneOn).toBe(addDays(TODAY, -1))
    expect(conversation.steps[2].doneOn).toBeNull()
  })

  it('estimates every step at 50–125 minutes in 25-minute units', () => {
    for (const s of seed.goals.flatMap((g) => g.milestones.flatMap((m) => m.steps))) {
      expect(s.estMin % 25).toBe(0)
      expect(s.estMin).toBeGreaterThanOrEqual(50)
      expect(s.estMin).toBeLessThanOrEqual(125)
    }
  })

  it('logs est ± 25 minutes against each done step', () => {
    for (const g of seed.goals) for (const m of g.milestones) for (const s of m.steps) {
      if (s.doneOn == null) continue
      const spent = tally.spent.get(targetKey(stepTarget(g, m, s))) ?? 0
      expect(spent).toBeGreaterThanOrEqual(25)
      expect([s.estMin - 25, s.estMin, s.estMin + 25]).toContain(spent)
    }
  })

  it("gives each goal's next open step 50 minutes, and pre-selects D3's with both sessions today", () => {
    for (const g of seed.goals) {
      const next = nextOpenStep(g)!
      expect(tally.spent.get(targetKey(stepTarget(g, next.milestone, next.step)))).toBe(50)
    }
    const sel = seed.selection as StepTarget
    expect(findStep(seed.goals, sel)?.step.title).toBe('Reusable chart function')
    expect(tally.spentToday.get(targetKey(sel))).toBe(50)
    expect(tally.sessionsToday).toBe(2)
    expect(tally.minutesToday).toBe(50)
  })

  it('places the prototype tasks relative to today', () => {
    expect(task('Book dentist appointment').date).toBe('2026-09-21')
    expect(task('Renew car insurance')).toMatchObject({ date: TODAY, deadline: true, doneOn: null })
    expect(task('Send Q3 invoice to Halden & Co.')).toMatchObject({ date: TODAY, deadline: true, doneOn: TODAY })
    expect(task('Water the plants').doneOn).toBe(TODAY)
    expect(task('Car service').date).toBe('2026-10-09')
    expect(task('Try a sourdough starter').date).toBeNull()
    expect(task('Book Spanish tutor for October').goalId).toBe(seed.goals[1].id)
    expect(task('Order cold-press paper').goalId).toBe(seed.goals[2].id)
    expect(task('Read “Visual Display of Quantitative Information”')).toMatchObject({ date: null, goalId: seed.goals[0].id })
    const titles = seed.tasks.map((t) => t.title)
    expect(titles.indexOf('Send Q3 invoice to Halden & Co.')).toBeLessThan(titles.indexOf('Sort out old phone photos'))
    expect(titles.at(-1)).toBe('Sort out old phone photos')
  })

  it('generates believable history: nothing in the future, active recent days, busier weekdays', () => {
    expect(seed.logs.every((l) => l.date <= TODAY)).toBe(true)
    expect(seed.tasks.every((t) => t.doneOn == null || t.doneOn <= TODAY)).toBe(true)

    const doneByDay = new Map<string, number>()
    const bump = (d: string | null) => d && doneByDay.set(d, (doneByDay.get(d) ?? 0) + 1)
    seed.tasks.forEach((t) => bump(t.doneOn))
    seed.goals.forEach((g) => g.milestones.forEach((m) => m.steps.forEach((s) => bump(s.doneOn))))
    for (let k = 1; k <= 18; k++) expect(doneByDay.get(addDays(TODAY, -k)) ?? 0).toBeGreaterThan(0)

    let wd = 0, wdDays = 0, we = 0, weDays = 0
    for (let k = 1; k <= 265; k++) {
      const d = addDays(TODAY, -k), n = doneByDay.get(d) ?? 0
      if (isWeekend(d)) { we += n; weDays++ } else { wd += n; wdDays++ }
    }
    expect(wd / wdDays).toBeGreaterThan(we / weDays)
  })

  it('is stable for the same day', () => {
    const again = buildSeed(NOW)
    expect(again.tasks.length).toBe(seed.tasks.length)
    expect(again.logs.length).toBe(seed.logs.length)
  })

  it('starts with an idle timer and default settings', () => {
    expect(seed.timer).toMatchObject({ phase: 'focus', running: false, leftSec: 1500 })
    expect(seed.settings.session).toBe('25/5')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/core/seed.test.ts`
Expected: FAIL — cannot resolve `./seed`.

- [ ] **Step 3: Write `src/core/seed.ts`**

```ts
import {
  addDays, dayOfYear, daysInYear, fromISO, isWeekend, startOfYear, todayISO, yearOf, type ISODate,
} from './dates'
import { hashStr } from './format'
import { nextOpenStep, stepTarget } from './goals'
import { uid } from './ids'
import type { EmberData, FocusLog, Goal, Target, Task } from './model'
import { DEFAULT_SETTINGS } from './model'
import { idleTimer } from './timer'

/** The prototype's Park–Miller generator, so history matches its HIST / FOCUS shapes. */
const rng = (seed: number) => {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

// [title, tag, done today, day offset (null = Someday), deadline, goal index]
type TaskSeed = [string, string, boolean, number | null, boolean, number | null]
const TASKS: TaskSeed[] = [
  ['Send Q3 invoice to Halden & Co.', 'Work', true, 0, true, null],
  ['Water the plants', 'Home', true, 0, false, null],
  ['Book dentist appointment', 'Health', false, -2, false, null],
  ['Renew car insurance', 'Personal', false, 0, true, null],
  ['Book Spanish tutor for October', '', false, 0, false, 1],
  ['Review pull request #482', 'Work', false, 0, false, null],
  ['30-minute run', 'Health', false, 0, false, null],
  ['Call the landlord about the boiler', 'Home', false, 1, false, null],
  ['Submit September expenses', 'Work', false, 2, true, null],
  ['Order cold-press paper', '', false, 3, false, 2],
  ['Plan Q4 roadmap review', 'Work', false, 5, false, null],
  ['Pay council tax', 'Personal', false, 6, true, null],
  ['Buy Mum’s birthday present', 'Personal', false, 9, true, null],
  ['Car service', 'Home', false, 16, false, null],
  ['Try a sourdough starter', 'Home', false, null, false, null],
  ['Read “Visual Display of Quantitative Information”', '', false, null, false, 0],
  ['Sort out old phone photos', 'Personal', false, null, false, null],
]

// [step title, weeks ago it was done (omitted = open)]
type StepSeed = [string, number?]
type GoalSeed = [string, string, [string, StepSeed[]][]]
const GOALS: GoalSeed[] = [
  ['Learn D3.js', 'Build and publish an interactive, animated chart of a real dataset — starting from a blank file, no tutorial open.', [
    ['Foundations', [['SVG shapes & paths', 11], ['Selections & data joins', 10], ['Scales & axes', 9]]],
    ['First charts', [['Bar chart from a CSV', 7], ['Line chart with tooltips', 5], ['Scatter plot with zoom', 2], ['Reusable chart function']]],
    ['Motion & interaction', [['Transitions & easing'], ['Keyed enter / update / exit'], ['Brushing & linked views']]],
    ['Capstone', [['Choose a dataset'], ['Sketch the chart on paper'], ['Build it'], ['Publish & write it up']]],
  ]],
  ['Speak Spanish at B1', 'Hold a 20-minute conversation with a native speaker on everyday topics without switching to English.', [
    ['Basics', [['Present tense', 11], ['500 core words', 10], ['Pronunciation drills', 8]]],
    ['Past tenses', [['Preterite', 6], ['Imperfect', 4], ['Preterite vs imperfect', 3]]],
    ['Conversation', [['8 tutor sessions', 1], ['A series with Spanish subtitles', 0], ['30-day journal']]],
    ['Exam', [['Mock DELE B1 paper'], ['Book the exam']]],
  ]],
  ['Learn watercolour', 'Paint a finished landscape from one of my own photos — good enough to frame.', [
    ['Control', [['Flat & graded washes', 9], ['Wet-on-wet', 6], ['Colour mixing chart', 2]]],
    ['Studies', [['Ten skies'], ['Trees & foliage'], ['Water reflections']]],
    ['Final piece', [['Pick the photo'], ['Value sketch'], ['Paint it']]],
  ]],
]

const HISTORY_TITLES = [
  'Inbox zero', 'Weekly review', 'Groceries', 'Reply to emails', 'Laundry', 'Pay bills', 'Gym session',
  'Tidy the desk', 'Call home', 'Meal prep', 'Read 20 pages', 'Update the budget', 'Back up the laptop',
  'Plan the week', 'Clean the kitchen',
]
const HISTORY_TAGS = ['Work', 'Home', 'Health', 'Personal']

const SESSION = 25
const MIN = 60_000

/** Week 0 means yesterday, as in the prototype's L_W. */
const weeksAgo = (today: ISODate, w: number): ISODate => addDays(today, -(w * 7 + (w === 0 ? 1 : 0)))

export function buildSeed(now: number = Date.now()): EmberData {
  const today = todayISO(now)
  const logs: FocusLog[] = []
  const addLog = (date: ISODate, slot: number, target: Target | null, at?: number) =>
    logs.push({ id: uid(), at: at ?? fromISO(date).getTime() + (9 * 60 + slot * 30) * MIN, date, min: SESSION, target })

  const goals: Goal[] = GOALS.map(([title, outcome, milestones]) => ({
    id: uid(),
    title,
    outcome,
    createdAt: addDays(today, -120),
    milestones: milestones.map(([mt, steps]) => ({
      id: uid(),
      title: mt,
      steps: steps.map(([st, w]) => ({
        id: uid(),
        title: st,
        estMin: SESSION * (2 + (hashStr(st) % 4)),
        doneOn: w == null ? null : weeksAgo(today, w),
      })),
    })),
  }))

  // Done steps took their estimate ± 25 minutes, one session a day leading up to completion.
  for (const g of goals) for (const m of g.milestones) for (const s of m.steps) {
    if (s.doneOn == null) continue
    const spent = Math.max(SESSION, s.estMin + SESSION * (((hashStr(s.title) >> 3) % 3) - 1))
    for (let k = 0; k < spent / SESSION; k++) addLog(addDays(s.doneOn, -k), 0, stepTarget(g, m, s))
  }

  // Each goal's next open step has 50m; D3's is selected with both sessions today.
  let selection: Target | null = null
  goals.forEach((g, gi) => {
    const next = nextOpenStep(g)
    if (!next) return
    const target = stepTarget(g, next.milestone, next.step)
    if (gi === 0) {
      selection = target
      addLog(today, 0, target, now - 55 * MIN)
      addLog(today, 0, target, now - 25 * MIN)
    } else {
      addLog(addDays(today, -1), 1, target)
      addLog(addDays(today, -2), 1, target)
    }
  })

  const tasks: Task[] = TASKS.map(([title, tag, done, offset, deadline, goal]) => ({
    id: uid(),
    title,
    tag,
    goalId: goal == null ? null : goals[goal].id,
    date: offset == null ? null : addDays(today, offset),
    deadline,
    doneOn: done ? today : null,
  }))

  // Year-to-date history using the prototype's HIST (things done) and FOCUS (minutes) formulas.
  const stepsDone = new Map<ISODate, number>()
  for (const g of goals) for (const m of g.milestones) for (const s of m.steps) {
    if (s.doneOn) stepsDone.set(s.doneOn, (stepsDone.get(s.doneOn) ?? 0) + 1)
  }
  const placed = new Map<ISODate, number>()
  for (const l of logs) placed.set(l.date, (placed.get(l.date) ?? 0) + l.min)

  const year0 = startOfYear(today)
  const todayIdx = dayOfYear(today)
  const yearLen = daysInYear(yearOf(today))
  const doneR = rng(11)
  const focusR = rng(7)
  const pickR = rng(3)
  const history: Task[] = []

  for (let i = 0; i < todayIdx; i++) {
    const date = addDays(year0, i)
    const weekend = isWeekend(date)
    const trend = i / yearLen

    const skipDone = i < todayIdx - 18 && doneR() < (weekend ? 0.35 : 0.1)
    const done = skipDone ? 0 : Math.max(1, Math.round((weekend ? 2 : 4.5) * (0.55 + trend * 0.7) * (0.5 + doneR())))
    const dayTasks: Task[] = []
    for (let k = 0; k < done - (stepsDone.get(date) ?? 0); k++) {
      dayTasks.push({
        id: uid(),
        title: HISTORY_TITLES[Math.floor(pickR() * HISTORY_TITLES.length)],
        tag: HISTORY_TAGS[Math.floor(pickR() * HISTORY_TAGS.length)],
        goalId: null,
        date,
        deadline: false,
        doneOn: date,
      })
    }
    history.push(...dayTasks)

    const skipFocus = i < todayIdx - 12 && focusR() < (weekend ? 0.55 : 0.18)
    const focus = skipFocus ? 0 : SESSION * Math.max(1, Math.round((weekend ? 1.5 : 3) * (0.6 + trend * 0.8) * (0.4 + focusR())))
    const sessions = Math.max(0, Math.round((focus - (placed.get(date) ?? 0)) / SESSION))
    for (let k = 0; k < sessions; k++) {
      const t = dayTasks[k % Math.max(1, dayTasks.length)]
      addLog(date, k + 2, t ? { kind: 'task', taskId: t.id } : null)
    }
  }

  return {
    goals,
    tasks: [...history, ...tasks],
    logs: logs.sort((a, b) => a.at - b.at),
    selection,
    timer: idleTimer('25/5'),
    settings: { ...DEFAULT_SETTINGS },
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS. If the weekday/weekend or 18-day test fails, compare the loop to `HIST`/`FOCUS` in `docs/design/reference/Ember.dc.html` lines 362–370 (short-circuit `&&` before calling the RNG matters).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): seed prototype goals, tasks and year-to-date history"
```

---

### Task 6: localStorage persistence

**Files:**
- Create: `src/core/persist.ts`
- Test: `src/core/persist.test.ts`

**Interfaces:**
- Consumes: `EmberData`, `DEFAULT_SETTINGS`.
- Produces: `STORAGE_KEY = 'ember:v1'`, `loadData(storage?: Storage): EmberData | null`, `saveData(data: EmberData, storage?: Storage): void`. Unreadable data is copied to `ember:v1:corrupt:<Date.now()>` before `loadData` returns null.

- [ ] **Step 1: Write the failing tests**

`src/core/persist.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEY, loadData, saveData } from './persist'
import { dataFixture, taskFixture } from './test-fixtures'

describe('persistence', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips data', () => {
    const data = dataFixture({ tasks: [taskFixture('Water the plants')] })
    saveData(data)
    expect(loadData()).toEqual(data)
  })

  it('returns null when nothing is saved', () => {
    expect(loadData()).toBeNull()
  })

  it('backs up unreadable data before giving up', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    expect(loadData()).toBeNull()
    const backups = Object.keys(localStorage).filter((k) => k.startsWith(`${STORAGE_KEY}:corrupt:`))
    expect(backups).toHaveLength(1)
    expect(localStorage.getItem(backups[0])).toBe('{not json')
  })

  it('backs up data from an unknown version', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 99, data: dataFixture() }))
    expect(loadData()).toBeNull()
    expect(Object.keys(localStorage).some((k) => k.startsWith(`${STORAGE_KEY}:corrupt:`))).toBe(true)
  })

  it('fills in settings added after the data was saved', () => {
    const data = dataFixture()
    const { wallWeeks: _dropped, ...oldSettings } = data.settings
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, data: { ...data, settings: oldSettings } }))
    expect(loadData()?.settings.wallWeeks).toBe(12)
  })

  it('keeps running when storage refuses to save', () => {
    const full = { setItem: vi.fn(() => { throw new Error('QuotaExceededError') }) } as unknown as Storage
    expect(() => saveData(dataFixture(), full)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/core/persist.test.ts`
Expected: FAIL — cannot resolve `./persist`.

- [ ] **Step 3: Write `src/core/persist.ts`**

```ts
import type { EmberData } from './model'
import { DEFAULT_SETTINGS } from './model'

export const STORAGE_KEY = 'ember:v1'
const VERSION = 1

interface Stored { version: number; data: EmberData }

function isData(d: unknown): d is EmberData {
  if (!d || typeof d !== 'object') return false
  const x = d as Record<string, unknown>
  return Array.isArray(x.goals) && Array.isArray(x.tasks) && Array.isArray(x.logs) && !!x.timer && typeof x.timer === 'object'
}

/** Keep a copy of anything we can't read, so falling back to seed data never destroys it. */
function backup(storage: Storage, raw: string) {
  try {
    storage.setItem(`${STORAGE_KEY}:corrupt:${Date.now()}`, raw)
  } catch {
    // Storage full: nothing more we can do.
  }
}

export function loadData(storage: Storage | undefined = globalThis.localStorage): EmberData | null {
  if (!storage) return null
  const raw = storage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Stored
    if (parsed?.version !== VERSION || !isData(parsed.data)) {
      backup(storage, raw)
      return null
    }
    return { ...parsed.data, settings: { ...DEFAULT_SETTINGS, ...parsed.data.settings } }
  } catch {
    backup(storage, raw)
    return null
  }
}

export function saveData(data: EmberData, storage: Storage | undefined = globalThis.localStorage): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, data } satisfies Stored))
  } catch {
    // Quota exceeded or private mode: keep running in memory.
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): persist data to localStorage with corrupt-data backup"
```

---

### Task 7: The Ember store

**Files:**
- Create: `src/stores/ember.ts`
- Test: `src/stores/ember.test.ts`

**Interfaces:**
- Consumes: everything in `src/core/`.
- Produces `useEmberStore()` with:
  - State (refs): `goals: Goal[]`, `tasks: Task[]`, `logs: FocusLog[]`, `selection: Selection`, `timer: Timer`, `settings: Settings`, `now: number`, `completions: number` (increments per finished focus session; drives toast/pops later).
  - Getters (computed): `today: ISODate`, `demo: boolean`, `speed: number`, `tally: Tally`, `remaining: number` (timer-seconds), `lastLog: FocusLog | null`.
  - Types: `type When = 'today' | 'tomorrow' | 'date' | 'someday'`, `interface NewTask { title: string; when: When; date?: ISODate; deadline: boolean; goalId: string | null }`.
  - Actions: `replaceData(d: EmberData)`, `snapshot(): EmberData`, `select(t: Selection)`, `targetExists(t: Target): boolean`, `addTask(input: NewTask): Task | null`, `toggleTask(id)`, `moveTask(id, date: ISODate)`, `moveToToday(id)`, `moveToTomorrow(id)`, `addGoal(title): Goal | null`, `addMilestone(goalId, title): Milestone | null`, `addStep(goalId, msId, title): Step | null`, `setOutcome(goalId, text)`, `toggleStep(t: StepTarget)`, `completeSelected()`, `tick(at = Date.now())`, `startPause()`, `resetTimer()`, `skipBreak()`, `setSession(s: SessionLength)`, `updateSettings(patch: Partial<Settings>)`.

- [ ] **Step 1: Write the failing tests**

`src/stores/ember.test.ts`:
```ts
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { StepTarget } from '../core/model'
import { STORAGE_KEY, loadData, saveData } from '../core/persist'
import { dataFixture, goalFixture, taskFixture } from '../core/test-fixtures'
import { useEmberStore, type NewTask } from './ember'

const NOW = new Date(2026, 8, 23, 10, 0, 0).getTime()
const MIN = 60_000

const step = (ms: string, title: string): StepTarget =>
  ({ kind: 'step', goalId: 'D3', msId: `D3/${ms}`, stepId: `D3/${ms}/${title}` })
const LINE = step('First charts', 'Line')
const SCATTER = step('First charts', 'Scatter')
const EASING = step('Motion', 'Easing')

function fixture() {
  return dataFixture({
    goals: [goalFixture('D3', [
      ['First charts', [['Bar', '2026-09-01'], ['Line', null], ['Scatter', null]]],
      ['Motion', [['Easing', null]]],
    ])],
    tasks: [
      taskFixture('Review PR'),
      taskFixture('Dentist', { date: '2026-09-21' }),
      taskFixture('Sourdough', { date: null }),
    ],
  })
}

function freshStore() {
  setActivePinia(createPinia())
  return useEmberStore()
}

function storeWith(patch: Partial<ReturnType<typeof fixture>> = {}) {
  const store = freshStore()
  store.replaceData({ ...fixture(), ...patch })
  return store
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  localStorage.clear()
  window.history.replaceState({}, '', '/')
})
afterEach(() => vi.useRealTimers())

describe('loading', () => {
  it('seeds on first run and saves the seed straight away', () => {
    const store = freshStore()
    expect(store.goals.map((g) => g.title)).toEqual(['Learn D3.js', 'Speak Spanish at B1', 'Learn watercolour'])
    expect(store.today).toBe('2026-09-23')
    expect(loadData()?.goals).toHaveLength(3)
  })

  it('loads saved data instead of seeding', () => {
    saveData(fixture())
    expect(freshStore().goals.map((g) => g.title)).toEqual(['D3'])
  })

  it('saves changes', async () => {
    const store = storeWith()
    store.addTask({ title: 'Call the landlord', when: 'today', deadline: false, goalId: null })
    await nextTick()
    expect(loadData()?.tasks.map((t) => t.title)).toContain('Call the landlord')
  })
})

describe('timer', () => {
  it('logs a finished session against the selected step and switches to a paused break', () => {
    const store = storeWith({ selection: LINE })
    store.startPause()
    vi.setSystemTime(NOW + 25 * MIN)
    store.tick()
    expect(store.logs).toHaveLength(1)
    expect(store.logs[0]).toMatchObject({ at: NOW + 25 * MIN, date: '2026-09-23', min: 25, target: LINE })
    expect(store.timer).toMatchObject({ phase: 'break', running: false, leftSec: 300 })
    expect(store.tally.spent.get(`step:${LINE.stepId}`)).toBe(25)
    expect(store.tally.sessionsToday).toBe(1)
    expect(store.tally.minutesToday).toBe(25)
    expect(store.completions).toBe(1)
    expect(store.lastLog?.target).toEqual(LINE)
  })

  it('logs to Unassigned when nothing is selected', () => {
    const store = storeWith()
    store.startPause()
    store.tick(NOW + 25 * MIN)
    expect(store.logs[0].target).toBeNull()
  })

  it('logs to Unassigned when the selected item no longer exists', () => {
    const store = storeWith({ selection: { kind: 'task', taskId: 'gone' } })
    store.startPause()
    store.tick(NOW + 25 * MIN)
    expect(store.logs[0].target).toBeNull()
  })

  it('logs 50 minutes with the 50/10 setting', () => {
    const store = storeWith()
    store.setSession('50/10')
    expect(store.timer.leftSec).toBe(3000)
    store.startPause()
    store.tick(NOW + 50 * MIN)
    expect(store.logs[0].min).toBe(50)
    expect(store.timer.leftSec).toBe(600)
  })

  it('counts from the wall clock, so missed ticks lose nothing', () => {
    const store = storeWith()
    store.startPause()
    vi.setSystemTime(NOW + 10 * MIN)
    store.tick()
    expect(store.remaining).toBe(900)
  })

  it('pauses and resumes', () => {
    const store = storeWith()
    store.startPause()
    vi.setSystemTime(NOW + 5 * MIN)
    store.startPause()
    expect(store.timer).toMatchObject({ running: false, leftSec: 1200 })
    store.tick(NOW + 60 * MIN)
    expect(store.logs).toHaveLength(0)
    expect(store.remaining).toBe(1200)
  })

  it('returns to a paused full focus session when a break ends', () => {
    const store = storeWith({ timer: { phase: 'break', running: false, endsAt: null, leftSec: 300, speed: 1 } })
    store.startPause()
    store.tick(NOW + 5 * MIN)
    expect(store.timer).toEqual({ phase: 'focus', running: false, endsAt: null, leftSec: 1500, speed: 1 })
    expect(store.logs).toHaveLength(0)
  })

  it('resets focus and skips breaks', () => {
    const store = storeWith()
    store.startPause()
    store.resetTimer()
    expect(store.timer).toMatchObject({ phase: 'focus', running: false, leftSec: 1500 })
    store.replaceData({ ...fixture(), timer: { phase: 'break', running: true, endsAt: NOW + MIN, leftSec: 300, speed: 1 } })
    store.skipBreak()
    expect(store.timer).toMatchObject({ phase: 'focus', running: false, leftSec: 1500 })
  })

  it('runs 25 minutes in 25 seconds with ?demo=1', () => {
    window.history.replaceState({}, '', '/?demo=1')
    const store = storeWith()
    expect(store.demo).toBe(true)
    store.startPause()
    store.tick(NOW + 25_000)
    expect(store.logs).toHaveLength(1)
    expect(store.logs[0].min).toBe(25)
  })

  it('completes once after a reload, dated by when it ended', async () => {
    vi.setSystemTime(new Date(2026, 8, 23, 23, 50).getTime())
    const store = storeWith({ selection: LINE })
    store.startPause()
    await nextTick()

    vi.setSystemTime(new Date(2026, 8, 24, 8, 0).getTime())
    const reloaded = freshStore()
    reloaded.tick()
    reloaded.tick()
    expect(reloaded.logs).toHaveLength(1)
    expect(reloaded.logs[0]).toMatchObject({ at: new Date(2026, 8, 24, 0, 15).getTime(), date: '2026-09-24', target: LINE })
    expect(reloaded.timer).toMatchObject({ phase: 'break', running: false })
  })

  it('keeps the speed a run started with across reloads', async () => {
    window.history.replaceState({}, '', '/?demo=1')
    const store = storeWith()
    store.startPause()
    await nextTick()

    window.history.replaceState({}, '', '/')
    const reloaded = freshStore()
    expect(reloaded.demo).toBe(false)
    reloaded.tick(NOW + 10_000)
    expect(reloaded.remaining).toBe(900)
  })

  it('resets an idle timer when the session length changes, but not a running one', () => {
    const store = storeWith()
    store.setSession('50/10')
    expect(store.timer.leftSec).toBe(3000)
    store.startPause()
    store.setSession('25/5')
    expect(store.timer.running).toBe(true)
    expect(store.remaining).toBe(3000)
  })

  it('rolls today over at midnight', () => {
    const store = storeWith()
    store.startPause()
    store.tick(NOW + 25 * MIN)
    expect(store.tally.sessionsToday).toBe(1)
    store.tick(new Date(2026, 8, 24, 0, 1).getTime())
    expect(store.today).toBe('2026-09-24')
    expect(store.tally.sessionsToday).toBe(0)
  })
})

describe('selection hand-off', () => {
  it('moves to the next open step when the selected step is completed', () => {
    const store = storeWith({ selection: LINE })
    store.toggleStep(LINE)
    expect(store.selection).toEqual(SCATTER)
    store.toggleStep(SCATTER)
    expect(store.selection).toEqual(EASING)
    store.toggleStep(EASING)
    expect(store.selection).toBeNull()
  })

  it('stamps and clears doneOn when toggling a step', () => {
    const store = storeWith()
    store.toggleStep(LINE)
    expect(store.goals[0].milestones[0].steps[1].doneOn).toBe('2026-09-23')
    store.toggleStep(LINE)
    expect(store.goals[0].milestones[0].steps[1].doneOn).toBeNull()
  })

  it('leaves the selection alone when another step is completed', () => {
    const store = storeWith({ selection: SCATTER })
    store.toggleStep(LINE)
    expect(store.selection).toEqual(SCATTER)
  })

  it('clears the selection when the selected task is completed', () => {
    const store = storeWith({ selection: { kind: 'task', taskId: 'Review PR' } })
    store.toggleTask('Review PR')
    expect(store.selection).toBeNull()
    expect(store.tasks[0].doneOn).toBe('2026-09-23')
  })

  it('completes whatever is selected (Focus mode "Mark done")', () => {
    const store = storeWith({ selection: LINE })
    store.completeSelected()
    expect(store.goals[0].milestones[0].steps[1].doneOn).toBe('2026-09-23')
    expect(store.selection).toEqual(SCATTER)
  })
})

describe('tasks', () => {
  const add = (store: ReturnType<typeof useEmberStore>, patch: Partial<NewTask>) =>
    store.addTask({ title: 'New', when: 'today', deadline: false, goalId: null, ...patch })

  it('adds trimmed Inbox tasks dated by the chosen option', () => {
    const store = storeWith()
    expect(add(store, { title: '  Call the landlord  ' })).toMatchObject({ title: 'Call the landlord', tag: 'Inbox', date: '2026-09-23', doneOn: null })
    expect(add(store, { when: 'tomorrow' })?.date).toBe('2026-09-24')
    expect(add(store, { when: 'date', date: '2026-10-02' })?.date).toBe('2026-10-02')
    expect(add(store, { when: 'someday' })?.date).toBeNull()
    expect(add(store, { goalId: 'D3' })?.goalId).toBe('D3')
  })

  it('clamps a picked date in the past to today', () => {
    expect(add(storeWith(), { when: 'date', date: '2026-09-01' })?.date).toBe('2026-09-23')
  })

  it('drops the deadline on Someday tasks', () => {
    const store = storeWith()
    expect(add(store, { when: 'someday', deadline: true })?.deadline).toBe(false)
    expect(add(store, { when: 'today', deadline: true })?.deadline).toBe(true)
  })

  it('ignores empty titles', () => {
    const store = storeWith()
    expect(add(store, { title: '   ' })).toBeNull()
    expect(store.tasks).toHaveLength(3)
  })

  it('moves tasks to tomorrow and to today (including from Someday)', () => {
    const store = storeWith()
    store.moveToTomorrow('Dentist')
    expect(store.tasks.find((t) => t.id === 'Dentist')?.date).toBe('2026-09-24')
    store.moveToToday('Sourdough')
    expect(store.tasks.find((t) => t.id === 'Sourdough')?.date).toBe('2026-09-23')
  })

  it('un-completes a task', () => {
    const store = storeWith()
    store.toggleTask('Review PR')
    store.toggleTask('Review PR')
    expect(store.tasks[0].doneOn).toBeNull()
  })
})

describe('goals', () => {
  it('adds a goal with a "Getting started" milestone', () => {
    const store = storeWith()
    const g = store.addGoal('  Learn Three.js ')
    expect(g).toMatchObject({ title: 'Learn Three.js', outcome: '', createdAt: '2026-09-23' })
    expect(g?.milestones.map((m) => m.title)).toEqual(['Getting started'])
    expect(store.addGoal('')).toBeNull()
  })

  it('adds milestones and 50-minute steps', () => {
    const store = storeWith()
    const ms = store.addMilestone('D3', 'Capstone')
    expect(store.goals[0].milestones.at(-1)?.title).toBe('Capstone')
    const s = store.addStep('D3', ms!.id, 'Build it')
    expect(s).toMatchObject({ title: 'Build it', estMin: 50, doneOn: null })
    expect(store.addStep('D3', ms!.id, ' ')).toBeNull()
    expect(store.addMilestone('nope', 'X')).toBeNull()
  })

  it('edits the outcome', () => {
    const store = storeWith()
    store.setOutcome('D3', 'Ship a chart')
    expect(store.goals[0].outcome).toBe('Ship a chart')
  })
})

describe('storage key', () => {
  it('uses ember:v1', () => {
    freshStore()
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/stores/ember.test.ts`
Expected: FAIL — cannot resolve `./ember`.

- [ ] **Step 3: Write `src/stores/ember.ts`**

```ts
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { addDays, todayISO, type ISODate } from '../core/dates'
import { findStep, nextOpenStep, stepTarget } from '../core/goals'
import { uid } from '../core/ids'
import type {
  EmberData, FocusLog, Goal, Milestone, Selection, SessionLength, Settings, Step, StepTarget, Target, Task, Timer,
} from '../core/model'
import { sameTarget } from '../core/model'
import { loadData, saveData } from '../core/persist'
import { buildSeed } from '../core/seed'
import { tallyLogs } from '../core/tally'
import { DEMO_SPEED, LENGTHS, idleTimer, isDue, pauseTimer, remainingSec, startTimer } from '../core/timer'

export type When = 'today' | 'tomorrow' | 'date' | 'someday'
export interface NewTask { title: string; when: When; date?: ISODate; deadline: boolean; goalId: string | null }

const demoInUrl = (): boolean =>
  typeof location !== 'undefined' && new URLSearchParams(location.search).get('demo') === '1'

export const useEmberStore = defineStore('ember', () => {
  const loaded = loadData()
  const initial = loaded ?? buildSeed(Date.now())

  const goals = ref<Goal[]>(initial.goals)
  const tasks = ref<Task[]>(initial.tasks)
  const logs = ref<FocusLog[]>(initial.logs)
  const selection = ref<Selection>(initial.selection)
  const timer = ref<Timer>(initial.timer)
  const settings = ref<Settings>(initial.settings)

  /** Wall clock, advanced by tick(). Everything date- or time-based derives from it. */
  const now = ref(Date.now())
  /** Increments on every finished focus session (toast and pop animations). */
  const completions = ref(0)
  const demoFromUrl = demoInUrl()

  const today = computed(() => todayISO(now.value))
  const demo = computed(() => demoFromUrl || settings.value.demo)
  const speed = computed(() => (demo.value ? DEMO_SPEED : 1))
  const tally = computed(() => tallyLogs(logs.value, today.value))
  const remaining = computed(() => remainingSec(timer.value, now.value))
  const lastLog = computed<FocusLog | null>(() => logs.value[logs.value.length - 1] ?? null)

  function snapshot(): EmberData {
    return {
      goals: goals.value,
      tasks: tasks.value,
      logs: logs.value,
      selection: selection.value,
      timer: timer.value,
      settings: settings.value,
    }
  }

  function replaceData(d: EmberData) {
    goals.value = d.goals
    tasks.value = d.tasks
    logs.value = d.logs
    selection.value = d.selection
    timer.value = d.timer
    settings.value = d.settings
  }

  if (!loaded) saveData(snapshot())
  watch([goals, tasks, logs, selection, timer, settings], () => saveData(snapshot()), { deep: true })

  // — lookups —
  const taskById = (id: string): Task | null => tasks.value.find((t) => t.id === id) ?? null
  const goalById = (id: string): Goal | null => goals.value.find((g) => g.id === id) ?? null
  const targetExists = (t: Target): boolean => (t.kind === 'task' ? !!taskById(t.taskId) : !!findStep(goals.value, t))

  // — selection —
  function select(t: Selection) {
    selection.value = t
  }

  // — tasks —
  function addTask(input: NewTask): Task | null {
    const title = input.title.trim()
    if (!title) return null
    const t0 = today.value
    let date: ISODate | null = t0
    if (input.when === 'someday') date = null
    else if (input.when === 'tomorrow') date = addDays(t0, 1)
    else if (input.when === 'date' && input.date) date = input.date < t0 ? t0 : input.date
    const task: Task = { id: uid(), title, tag: 'Inbox', goalId: input.goalId, date, deadline: date != null && input.deadline, doneOn: null }
    tasks.value.push(task)
    return task
  }

  function toggleTask(id: string) {
    const t = taskById(id)
    if (!t) return
    const completing = t.doneOn == null
    t.doneOn = completing ? today.value : null
    if (completing && sameTarget(selection.value, { kind: 'task', taskId: id })) selection.value = null
  }

  function moveTask(id: string, date: ISODate) {
    const t = taskById(id)
    if (t) t.date = date
  }
  const moveToToday = (id: string) => moveTask(id, today.value)
  const moveToTomorrow = (id: string) => moveTask(id, addDays(today.value, 1))

  // — goals —
  function addGoal(title: string): Goal | null {
    const name = title.trim()
    if (!name) return null
    const goal: Goal = {
      id: uid(), title: name, outcome: '', createdAt: today.value,
      milestones: [{ id: uid(), title: 'Getting started', steps: [] }],
    }
    goals.value.push(goal)
    return goal
  }

  function addMilestone(goalId: string, title: string): Milestone | null {
    const g = goalById(goalId)
    const name = title.trim()
    if (!g || !name) return null
    const m: Milestone = { id: uid(), title: name, steps: [] }
    g.milestones.push(m)
    return m
  }

  function addStep(goalId: string, msId: string, title: string): Step | null {
    const m = goalById(goalId)?.milestones.find((x) => x.id === msId)
    const name = title.trim()
    if (!m || !name) return null
    const s: Step = { id: uid(), title: name, doneOn: null, estMin: 50 }
    m.steps.push(s)
    return s
  }

  function setOutcome(goalId: string, text: string) {
    const g = goalById(goalId)
    if (g) g.outcome = text
  }

  function toggleStep(t: StepTarget) {
    const loc = findStep(goals.value, t)
    if (!loc) return
    const completing = loc.step.doneOn == null
    loc.step.doneOn = completing ? today.value : null
    if (completing && sameTarget(selection.value, t)) {
      const next = nextOpenStep(loc.goal)
      selection.value = next ? stepTarget(loc.goal, next.milestone, next.step) : null
    }
  }

  /** Focus mode's "Mark done": completes the selected step or task if it's still open. */
  function completeSelected() {
    const s = selection.value
    if (!s) return
    if (s.kind === 'task') {
      if (taskById(s.taskId)?.doneOn == null) toggleTask(s.taskId)
    } else if (findStep(goals.value, s)?.step.doneOn == null) {
      toggleStep(s)
    }
  }

  // — timer —
  function finishPhase(at: number) {
    const session = settings.value.session
    if (timer.value.phase === 'break') {
      timer.value = idleTimer(session)
      return
    }
    const sel = selection.value
    logs.value.push({
      id: uid(), at, date: todayISO(at), min: LENGTHS[session].focus / 60,
      target: sel && targetExists(sel) ? sel : null,
    })
    timer.value = idleTimer(session, 'break')
    completions.value++
  }

  function tick(at: number = Date.now()) {
    now.value = at
    const t = timer.value
    if (isDue(t, at) && t.endsAt != null) finishPhase(t.endsAt)
  }

  function startPause() {
    const at = Date.now()
    now.value = at
    timer.value = timer.value.running ? pauseTimer(timer.value, at) : startTimer(timer.value, at, speed.value)
  }

  const resetTimer = () => { timer.value = idleTimer(settings.value.session) }
  const skipBreak = () => { timer.value = idleTimer(settings.value.session) }

  function setSession(s: SessionLength) {
    settings.value.session = s
    if (!timer.value.running) timer.value = idleTimer(s, timer.value.phase)
  }

  function updateSettings(patch: Partial<Settings>) {
    settings.value = { ...settings.value, ...patch }
  }

  return {
    goals, tasks, logs, selection, timer, settings, now, completions,
    today, demo, speed, tally, remaining, lastLog,
    snapshot, replaceData, select, targetExists,
    addTask, toggleTask, moveTask, moveToToday, moveToTomorrow,
    addGoal, addMilestone, addStep, setOutcome, toggleStep, completeSelected,
    tick, startPause, resetTimer, skipBreak, setSession, updateSettings,
  }
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS — all store tests green.

If `completes once after a reload` fails because the reloaded store started from the seed, the `watch` didn't flush before `freshStore()`; confirm the test awaits `nextTick()` after `startPause()`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(store): add Pinia store with timer, selection hand-off and persistence"
```

---

### Task 8: Wire the store into the app and verify end to end

**Files:**
- Modify: `src/App.vue`

**Interfaces:**
- Consumes: `useEmberStore`, `navDate`.
- Produces: nothing new (Phase 2 replaces `App.vue`).

- [ ] **Step 1: Show a store sanity line on the sample page**

`src/App.vue`:
```vue
<script setup lang="ts">
import { navDate } from './core/dates'
import StyleSample from './dev/StyleSample.vue'
import { useEmberStore } from './stores/ember'

const store = useEmberStore()
</script>

<template>
  <StyleSample />
  <p class="store-line label">
    {{ navDate(store.today) }} · {{ store.goals.length }} goals · {{ store.tasks.length }} tasks ·
    {{ store.logs.length }} focus sessions · {{ store.tally.sessionsToday }} today · demo {{ store.demo ? 'on' : 'off' }}
  </p>
</template>

<style scoped>
.store-line { padding: 0 var(--space-6) var(--space-6); }
</style>
```

- [ ] **Step 2: Run the full check**

Run: `npm test && npm run build`
Expected: all tests pass; vue-tsc clean; build succeeds.

- [ ] **Step 3: Check the running app**

Run `npm run dev` in the background. In the Playwright browser:
1. Open `http://localhost:5173/` → the store line shows today's real date, `3 goals`, several hundred tasks and sessions, `2 today`, `demo off`.
2. Evaluate `Object.keys(localStorage)` → contains `ember:v1`.
3. Reload → the counts are unchanged (loaded, not re-seeded).
4. Open `http://localhost:5173/?demo=1` → `demo on`.
5. No console errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: load the Ember store in the app shell"
```

- [ ] **Step 5: Merge Phase 1 into main**

```bash
git checkout main
git merge --ff-only phase1-foundation
```

Phase 2 (Shell) gets its own plan: `docs/superpowers/plans/<date>-ember-phase2-shell.md`.
