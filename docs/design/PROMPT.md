Paste this into Claude Code from inside this folder:

---

Build **Ember**, a local, single-user web app that combines a daily task list, learning goals (goal → milestones → steps), a pomodoro focus timer with a full-screen Focus mode, and activity views. Every focus session is logged against the task or goal step that was selected.

`README.md` in this folder is the full spec — read all of it before writing code. `reference/Ember.dc.html` is a working HTML prototype of the exact look and behaviour; open it in a browser and use it as the source of truth whenever the README is ambiguous. All of its logic is in the `<script data-dc-script>` block at the bottom, which has the exact formulas. Recreate it; do not ship or wrap the prototype code.

Stack (if I have an existing project open, follow its conventions instead):
- Vite + React + TypeScript
- Plain CSS with the design tokens in README §Design tokens as CSS variables (no Tailwind, no UI kit)
- One store (Zustand, or useReducer + context), persisted to localStorage
- No backend, no accounts
- `lucide-react` for icons; Archivo from Google Fonts
- Vitest for unit tests

Work in this order and run the app after each step:
1. Scaffold, tokens, base styles (buttons, inputs, tags, segmented control, rules) per README §Design tokens.
2. Data model, store, date helpers and seed data (README §Data model, §State, §Seed data). Use real dates (ISO `YYYY-MM-DD`); the prototype pins "today" to 23 Sep 2026 only for the demo.
3. Nav bar and focus bar, including the focus picker (README §Focus bar, §Focus picker).
4. Today view: Working on strip, Today list, Upcoming list, add-task row, Someday and roll-over rules (README §View 1).
5. Goals view: goal list, readme, ledger stats, roadmap with session blocks, goal tasks (README §View 2).
6. Activity view: switchable year heat map, stats, done wall, activity log (README §View 3).
7. Timer engine using wall-clock deltas, plus a `?demo=1` flag where 1 real second ≈ 1 minute (README §Timer).
8. Focus mode with the YouTube background (README §Focus mode).
9. Animations and states (README §Interactions).
10. Unit tests for the store: timer completion and logging, selection hand-off, task roll-over and Someday, move to today/tomorrow, streaks and stats.
11. Compare every view side by side with the prototype and fix differences.

Non-negotiable visual rules: zero border radius everywhere; 2px rules between major sections and 1px between list rows; button labels flush left (never centred, even in wide buttons); red accent used sparingly; no gradients, no emoji, no drop shadows except the picker dialog.

When done, list anything you couldn't match and anything in README §Not designed yet that you had to make a call on.
