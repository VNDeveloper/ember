# Ember — practice habits: design

Date: 2026-10-18 · Status: approach and design agreed in conversation (user chose "a field on the goal"); written-spec review waived by the user unless they ask

## Purpose

A practice habit is a standing promise to show up for a goal, for example "Speak Spanish: 25 minutes on 5 days a week". Ember already logs every focus session against a goal's steps or linked tasks, so a habit is tracked **automatically from focus time**, with nothing to tick. It brings the habit idea back in the form that fits Ember (timer + goals), and is a first slice of the planned week planner ("plan by goal per day").

**Success:**
- Setting a habit on a goal takes one small edit.
- The goal's Working on card on Today shows today's minutes toward the target, this week's days and the streak.
- A day counts as soon as enough focus time is logged, with no manual tick.
- Rest days and paused goals never break a streak unfairly.

**Out of scope:**
- checkbox habits (not measured by focus time);
- habits on tasks or on "any focus";
- reminders and notifications;
- a separate Habits page;
- habit stats in Activity;
- several habits per goal.

## Decisions (from the conversation)

1. **Practice habits only**, measured by focus minutes. Checkbox habits stay out, as in the rebuild.
2. **A habit belongs to a goal.** Time on the goal's steps and on tasks linked to the goal both count.
3. **The target is minutes on N days a week** (N = 7 means daily). The streak counts **weeks**, so rest days are free.
4. **It shows on the goal's Working on card and on the goal page.** There's no new section.
5. **Approach 1: an optional `habit` field on `Goal`.** It syncs, backs up and is deleted with its goal.

## Data (`src/core/model.ts`)

```ts
export interface HabitTarget {
  /** Minutes of focus on the goal that make a day count (5–240). */
  minutes: number
  /** Days a week that must count for the week to be hit (1–7). */
  daysPerWeek: number
  /** The Monday this target applies from. */
  from: ISODate
}
export interface Habit {
  /** Oldest first; the last is the current target. Never empty. */
  targets: HabitTarget[]
  /** Periods the goal was paused: [start, end) as dates; end null while still paused. */
  pauses: { from: ISODate; to: ISODate | null }[]
  /** Soft delete (Remove habit), so the undo bar can bring it back. */
  deletedOn?: ISODate | null
}
// Goal gains:
habit?: Habit | null
```

**Repair** (`repairHabit` in `core/habits.ts`, called from `repairGoal`):
- drops targets with minutes outside 5–240, days outside 1–7, or a `from` that isn't a valid date;
- sorts the targets, and removes the habit if no target is left;
- drops malformed pauses;
- leaves valid habits unchanged.

**Sync:** `habit` is one of the goal's own fields, so `stampChanges` stamps it and `mergeGoal` merges it newer-wins with the goal, like `status`. No new merge rule is needed. Backups and Delete data follow the goal.

## Rules (`src/core/habits.ts`, pure)

**Minutes on a goal per day.**
- `goalMinutesByDay(goal, tasks, logs)` returns `Map<ISODate, number>`.
- It counts logs whose target is a step of the goal (`target.goalId === goal.id`) or a task whose `goalId === goal.id`. Deleted steps and tasks still count, because history is history.
- Split logs from finishing early count like any other log.

**Weeks.**
- Weeks run Monday to Sunday (`mondayOf`, as on the done wall).
- History starts at the first target's `from`.
- For each week, the target is the latest one whose `from` is on or before that Monday.
- A **qualifying day** has `minutes ≥ target.minutes`. A week is **hit** when its qualifying days reach `daysPerWeek`.

**Week status** (`weekStatus` → `'hit' | 'missed' | 'paused' | 'current'`):
- **`current`** is this week while not yet hit. Once hit, it's `hit`.
- **`paused`** is a past week that overlaps a pause and wasn't hit. It neither counts nor breaks the streak.
- **`missed`** is any other past week that wasn't hit.

**Streak** (`habitStreak`): walking back from the most recent week, `hit` adds 1, `paused` and `current` are skipped, and `missed` stops the count. **Best** is the longest run, by the same rule, over the whole history.

**Today's view** (`habitView(goal, tasks, logs, today)` → `HabitView | null`, null without a live habit):
- `todayMin`, `targetMin`, `todayDone`;
- `days`: the 7 days Mon–Sun, each `'done' | 'not' | 'future'`;
- `doneDays`, `daysPerWeek`;
- `streak`, `best`;
- `recent`: the last 8 weeks' statuses, oldest first;
- text: `"10 of 25m today"`, `"3 of 5 days"`, `"6 weeks"` (`"1 week"`, `"–"` at 0).

**Changing the target** (`withTarget(habit, minutes, daysPerWeek, today)`):
- If the last target starts this week, it's replaced. Otherwise a new target is added from this Monday.
- Earlier weeks keep their own target, so the streak stays honest.

**Pause bookkeeping:**
- When `setGoalStatus` moves a goal to `paused`, it opens a pause `{ from: today, to: null }`.
- Moving it out of `paused` closes the pause with `to: today`.
- A week overlaps a pause if any of its days fall in `[from, to)`. An open pause runs to today.

**Achieved goals:** the habit stops being shown on Today, because achieved goals leave Working on. The goal page shows the habit's best streak in the Achieved summary.

## Store (`src/stores/ember.ts`)

- `setHabit(goalId, { minutes, daysPerWeek })`:
  - creates the habit (`targets: [{ …, from: mondayOf(today) }]`, `pauses: []`, plus an open pause if the goal is paused), or applies `withTarget`;
  - clamps the values to range;
  - does nothing on a missing or deleted goal.
- `removeHabit(goalId)`:
  - a soft delete through `softDelete`, with `DeleteKey` gaining `{ kind: 'habit'; goalId }`;
  - label `Removed the habit on “‹goal›”`;
  - the undo bar restores it.
- `setHabit` on a goal whose habit was removed starts fresh: a new habit, not the removed one.
- `setGoalStatus` records pauses as above when the goal has a live habit.

## UI

**`HabitLine.vue`** (shared; prop `view: HabitView`, optional `compact`):
- **Left:** `10 of 25m today` with a thin progress bar. Its fill is accent while under target and ink once done, with a check icon that pops (existing `popClass`) when today's target is reached.
- **Middle:** seven small squares labelled M T W T F S S. Filled ink means a qualifying day, an outline means not yet, and dotted means future.
- **Right:** `3 of 5 days · 6 weeks`.
- **Accessibility:** the squares have an `aria-label` such as "Monday counted".

**Working on card (`WorkingOn.vue`, `core/today.ts` `workingOn`):**
- Cards gain `habit: HabitView | null`.
- A card with a habit adds a 1px rule and the compact `HabitLine` at the bottom.
- Cards without a habit are unchanged.

**Goal page (`HabitRow.vue`, under `GoalSummary`'s stats strip):**
- **With a habit:**
  - a kicker "Habit · 25m on 5 days a week";
  - a full-width `HabitLine`;
  - the last 8 weeks as squares (hit = filled, missed = outline, paused = dotted, current = outline with an accent edge), with "Best: 9 weeks";
  - **Edit** opens an inline panel (`.edit-panel`) with Minutes (number, step 5, 5–240), Days a week (a 1–7 segmented control), Save, Cancel and **Remove habit**.
- **Without a habit:** an "Add a habit" ghost button opens the same panel, pre-filled with 25m and 5 days.
- **Achieved goals:** the row shows "Habit · best streak 9 weeks" and no editor.

## Error handling

- Saved or synced habits with bad values are repaired or dropped, never rejected.
- `setHabit` clamps minutes to 5–240 (in steps of 5) and days to 1–7.
- Store actions on a missing or deleted goal, or on a removed habit, do nothing.
- A habit whose goal is deleted disappears with the goal, and undoing the goal delete brings it back.

## Testing

- **`core/habits`:**
  - minutes per day (steps, linked tasks, deleted items, split logs);
  - qualifying days and week hit/miss;
  - the current week never breaks the streak;
  - rest days;
  - paused weeks are neutral;
  - a target change keeps the old weeks' target;
  - streak and best;
  - `habitView` texts and day states;
  - `withTarget` replace vs add;
  - repair.
- **Store:** set, change, remove and undo; clamping; pauses recorded by `setGoalStatus`; sync stamping (via the goal).
- **Components:** `HabitLine` states and the pop, the Working on card with and without a habit, and `HabitRow` (add, edit, remove, achieved).
- **Browser:** a check of Today and the goal page.
