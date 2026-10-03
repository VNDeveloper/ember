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
