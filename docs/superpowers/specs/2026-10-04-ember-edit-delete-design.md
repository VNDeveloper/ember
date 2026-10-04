# Ember — edit and delete: design

Date: 2026-10-04 · Status: approved in conversation, awaiting written-spec review

## Purpose

Let the user correct mistakes and keep lists tidy as plans change: edit and delete tasks, goal steps, milestones and goals, and change a step's time estimate — without ever losing past effort by accident. The handoff lists these under "Not designed yet"; this spec designs them to fit the Modernist visual rules (zero radius, 2px/1px rules, flush-left labels, sparing accent, no shadows except the picker).

**Success:** any item can be fixed or removed from the UI; a delete can be undone for 8 seconds; heat map, streaks, done wall, activity log and today's totals never shrink because something was deleted.

**Out of scope:** reordering, a trash/restore-later view, multi-select, editing focus sessions.

## Decisions (from the conversation)

1. **Row menu + edit panel.** Each editable row gets a "⋯" button opening Edit / Delete; Edit opens a compact panel under the row.
2. **Undo bar + keep history.** Delete is immediate with an 8-second undo bar; focus history and completions of deleted items stay in history.
3. **Soft delete (approach A).** Items get `deletedOn` instead of being removed.
4. **Tasks linked to a deleted goal are kept** and fall back to their tag (or "Task").

## Data

- `Task`, `Step`, `Milestone`, `Goal` gain optional `deletedOn?: ISODate | null`. Optional, so existing saved data and backups load unchanged; nothing is ever removed from storage.
- **Cascade is implied, not copied:** a step is hidden if it, its milestone or its goal is deleted; a milestone is hidden if it or its goal is deleted. Only the item the user deleted gets `deletedOn`.
- **Goal colours stay stable:** a goal's colour comes from its index among *all* goals (deleted included), so deleting one never recolours others or history.

## What counts as "live"

A new pure module `src/core/visible.ts`:

- `isTaskLive(t)`, `liveTasks(tasks)` — tasks without `deletedOn`.
- `liveGoals(goals)` — goals without `deletedOn`, each a shallow copy whose `milestones` exclude deleted ones and whose milestones' `steps` exclude deleted ones. Read-only use only; store mutations always go through ids on the real objects.
- `goalIndexOf(goals, goalId)` — index in the full array, for `goalColor`.
- `isStepLive(goals, target)` — false if the step, its milestone or its goal is deleted or missing.

**Live views and calculations** switch to live data: Today list, Upcoming, Working-on, focus picker, roadmap, goal list and goal %, goal ledger stats, goal tasks, Focus mode "Then:", `describeSelection`, `WorkingOn`, `nextOpenStep` hand-off after completing a step, and the store's `targetExists` (a deleted target logs a finished session as "Unassigned").

**History calculations keep all items:** `doneByDay` (heat map "things done", streaks, 7-day strip), `focusByDay`, today's totals (`tallyLogs`), done wall, activity log. Activity-log sources for deleted items read "<goal> (deleted)" or "Task · <tag> (deleted)"; titles stay real.

## Store actions (`src/stores/ember.ts`)

- `updateTask(id, patch: { title?, date?, deadline?, goalId?, tag? })` — trims title (ignored if empty), clears `deadline` when `date` is null, never touches `doneOn`.
- `updateStep(target, { title?, estMin? })` — estimate clamped to 25…600 in 25-minute units.
- `renameMilestone(goalId, msId, title)`, `renameGoal(goalId, title)` — trimmed, empty ignored.
- `deleteTask(id)`, `deleteStep(target)`, `deleteMilestone(goalId, msId)`, `deleteGoal(goalId)` — set `deletedOn = today` on the one item; if the current selection is now not live, clear it. Each returns an undo record `{ label, keys, selection }` where `keys` identify the flagged item and `selection` is the selection before the delete.
- `undoDelete(record)` — clears `deletedOn` on the recorded item and restores the recorded selection if it is live again.

## UI state (`src/stores/ui.ts`, not persisted)

- `menuFor: string | null` — which row menu is open (one at a time).
- `editing: { kind: 'task' | 'step' | 'milestone' | 'goal'; key: string } | null` — the open edit panel (one at a time; opening another discards the first).
- `undo: { label: string; record: UndoRecord; until: number } | null` — the undo bar; replaced by each new delete; cleared after 8 s or on Undo.
- `escape()` closes, in order: data menu, row menu, edit panel, picker, Focus mode.

## Components

- **`RowMenu.vue`** — "⋯" icon button (28×28, `aria-label="More actions for “<title>”"`, `aria-haspopup="menu"`, `aria-expanded`) and a small menu (2px ink border, surface, square) with **Edit** and **Delete** (`role="menu"`, items `role="menuitem"`). Closes on Esc, outside click or choosing an item; focus returns to the "⋯" button.
- **`TaskEditPanel.vue`** — opens under the task row (Today, Upcoming, goal tasks). Fields: title (required — Save disabled when empty), When (Today | Tomorrow | Pick date | Someday, starting from the task's current date; a past date shows as Pick date and is kept unless changed), Deadline toggle (hidden for Someday), goal select ("No goal" + live goals), tag text (empty shows as "Task"). Finished tasks are editable; editing never un-ticks them.
- **`StepEditPanel.vue`** — under the step row: title, estimate stepper "− 50m +" (25-minute steps, 25m–10h; buttons disabled at the ends). Blocks, "Left to go" and "Accuracy" update immediately after Save.
- **`TitleEditPanel.vue`** — milestones (menu in the milestone header, before the count) and goals (menu in the goal header beside the big %). Title only; the goal outcome stays in the readme box.
- **Panel layout (all):** 2px ink border, `--color-surface`, square, `--space-3` padding; buttons flush left: primary **Save**, ghost **Cancel**, and a ghost accent **Delete** pushed to the right. Enter in a text field saves; Esc cancels. On phones fields stack and buttons wrap.
- **`UndoBar.vue`** — fixed bottom-left (16px gutters on phones), ink background, bg-coloured text, square, `role="status" aria-live="polite"`: "Deleted “Review pull request #482”" / "Deleted milestone “Capstone” and 4 steps" / "Deleted goal “Learn D3.js”" + ghost **Undo** + close (×). z-index above the page, below the picker and Focus mode.
- **After a delete:** the deleted row disappears; keyboard focus moves to the next row via the existing `withFocusRescue`; deleting the open goal in Goals moves to the next live goal.

## Accessibility

Menus and panels reachable by Tab; opening a panel focuses its title field; Save/Cancel/Esc return focus to the "⋯" button; the undo bar is announced; delete menu items name the item ("Delete “…”" as accessible label).

## Testing (TDD)

- **Core:** `visible.ts` filtering and cascades; colours stable after a goal is deleted; history functions (`doneByDay`, `activityLog`, `doneWall`, `tallyLogs`) unchanged by deletes, with "(deleted)" sources.
- **Store:** each update action (trim, empty ignored, deadline cleared for Someday, estimate clamped); each delete (flag, selection cleared, running session finishing as Unassigned), cascades via live views, undo restoring item and selection.
- **Components:** RowMenu open/close/focus; TaskEditPanel and StepEditPanel save/cancel/validation; TitleEditPanel; UndoBar timing (8 s) and Undo; Esc order.
- **Browser:** full flow at 1280 and 360 px — edit a task's date and goal, change an estimate and see blocks update, delete a step and undo, delete a goal and see Today/Goals/Activity react with history intact.
