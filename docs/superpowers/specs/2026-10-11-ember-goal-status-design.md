# Ember — goal status (active, paused, achieved): design

Date: 2026-10-11 · Status: approved in conversation ("I trust you"); written-spec review waived by the user

## Purpose

First step of making the Goals tab help the user *achieve* goals, not just record them. The agreed sequence:

1. **Goal status** (this spec): Active / Paused / Achieved, an Achieved moment and an archive.
2. **Pace check**: optional finish-by date, rough estimates for milestones without steps, forecast coverage, direction-aware estimate correction.
3. Live with 1–2 for a week or two.
4. **Week planner**: plan by goal per day, pre-filled from the pace check, missed blocks don't pile up, "planned today" nudge.
5. Difficulty on steps only if real use shows the forecast needs it.

Status comes first because the pace check and nudges must skip goals the user has put aside, and finished goals should leave the active list without losing their history.

**Success:** the Goals list shows only what is in play at the top; pausing a goal takes it out of Today and the focus picker; finishing a goal's last step asks before closing it; an achieved goal shows a summary of the effort; nothing in Activity history changes.

**Out of scope:** pace, dates other than the achieved date, planner, reordering goals, an "abandoned" state (Delete already covers it).

## Decisions (from the conversation)

1. **Achieved is confirmed, never automatic.** When every milestone is done, the goal asks: *Mark achieved* or *Add a milestone*. Plans are often incomplete, so finishing the current steps is not proof the goal is done.
2. **Paused goals get out of the way**: a Paused group in the Goals list; gone from Working on and the focus picker; linked tasks still show; history stays.
3. **Approach A: a status field on the goal** (not a separate archive collection, not derived from steps).

## Data

- `Goal` gains `status?: 'active' | 'paused' | 'achieved'` (missing = active) and `achievedOn?: ISODate | null`.
- `src/core/goals.ts`: `goalStatus(g)` (missing or unknown → `'active'`) and `isActiveGoal(g)` (live and active: the goals offered for focus).
- Loading (`persist` normalize) and reading the Drive file (`readSyncFile`) repair an unknown `status` to `'active'` and drop `achievedOn` unless the status is achieved.
- Sync needs no new rules: status and `achievedOn` are a goal's own fields, already stamped by `stampChanges` and merged newer-wins by `mergeGoal`.
- Goal colours stay tied to the index among all goals, so status changes never recolour anything.

## Store actions (`src/stores/ember.ts`)

- `setGoalStatus(goalId, status)`: `'achieved'` sets `achievedOn = today`; `'active'`/`'paused'` clear it.
- `addStep` and `addMilestone` on an achieved goal set it back to active (there is more to do). Unticking a step does not reopen (achieved is the user's call).

## Goals list (`GoalList.vue`, `goalList` in `core/goalView.ts`)

- `goalList` returns groups: active (current order), **Paused**, **Achieved**. Empty groups are omitted.
- Achieved is collapsed by default with a count; open state lives in the UI store (not persisted), like Upcoming's groups.
- Paused and achieved items keep swatch and bar; meta line reads `Paused · <focused> focused` or `Achieved 12 Oct · <focused> focused`.
- `GoalsView` opens on the requested goal if live, else the first active goal, else the first live goal.

## Status actions (goal ⋯ menu)

- `RowMenu` gains an optional `extra` prop: `{ key, label, onSelect }[]`, rendered between Edit and Delete. Tasks and steps pass nothing and keep Edit / Delete.
- Active: Pause, Mark achieved. Paused: Resume, Mark achieved. Achieved: Reopen.

## Finish line and the Achieved summary

- `Roadmap`'s finish line, for an **active or paused** goal whose `finishLine` is reached, shows: "Every step is done. Is the goal achieved?" with **Mark achieved** (primary) and **Add a milestone** (opens the existing add-milestone input).
- An **achieved** goal shows an Achieved panel in `GoalSummary` (above the readme): the outcome text, `started → achieved · N days`, total focus time, sessions, steps done, milestones done. Pure helper `achievedSummary(goal, logs)` in `core/goalView.ts`; sessions count focus logs whose target is a live step of the goal.
- Marking achieved pops the panel's flag with the existing pop animation (no confetti; respects reduced motion).
- The roadmap stays visible and editable on achieved goals.

## Where paused and achieved goals disappear

- **Working on** (`core/today.ts` `workingOn`) and the **focus picker** goal sections (`core/picker.ts`): only `isActiveGoal` goals.
- **Goal dropdowns** (AddTask, TaskEditPanel): active and paused goals, plus the task's current goal when it is achieved, so editing never unlinks silently.
- **Unchanged**: linked task rows, the current timer selection (stays selected if its goal is paused), Activity log, heat map, done wall, stats and legend.

## Error handling

- Unknown or malformed status in saved data or the Drive file → active (repair, never reject).
- Status actions on a missing or deleted goal are no-ops.

## Testing

- `core`: `goalStatus` repair, `goalList` grouping and meta, `achievedSummary`, `workingOn` and picker filtering, `persist`/`readSyncFile` repair.
- Store: set status (achievedOn set/cleared), reopen on add step/milestone, not on untick.
- Sync: two devices changing status merge by the newer edit.
- Components: list groups and collapse, menu items per status, finish-line prompt buttons, Achieved panel, dropdown contents.
- Browser check of the Goals tab after implementation.
