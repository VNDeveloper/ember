# Ember — pace check: design

Date: 2026-10-18 · Status: design agreed in conversation ("yes"); build Native with a final review; written-spec review waived by the user

## Purpose

Tell you, for each goal, **when you'll finish at your current pace** and, if you set a finish-by date, **whether you're on track**. To do that honestly, "Left to go" must count milestones you haven't broken into steps yet, and correct for how your estimates usually turn out.

**Success:**
- The goal page says "At your pace: ~Dec 19", and "At your habit: ~Nov 27" when the goal has a habit.
- With a finish-by date it says ahead, on track, behind or past due, and how much time a week you'd need.
- A milestone with no steps still counts toward what's left.
- The forecast quietly corrects for your track record and says so in words.

**Out of scope:**
- pace on the Today cards;
- forecast history and trends;
- notifications;
- a forecast across all goals combined.

## Decisions (from the conversation)

1. **Purpose:** a forecast always, plus a verdict when an optional finish-by date is set.
2. **Pace:** your actual pace, from focus on the goal's steps over the last 28 days. With a habit, a second "At your habit" line uses minutes × days per week.
3. **Milestones without steps:** an automatic guess (the average size of this goal's planned milestones, or 4h if none are planned) that you can override with rough hours. Shown with "~".
4. **Correction:** your actual ÷ estimated time on finished steps that had focus logged. It applies once there are 3 or more, kept between 0.5× and 2×, and is shown in words. It replaces Accuracy %.
5. **Only step time counts toward pace.** Time on linked tasks still counts for habits.
6. **Approach:** two new optional fields; everything else is derived live.

## Data (`src/core/model.ts`)

- `Goal.finishBy?: ISODate | null`: optional finish-by date.
- `Milestone.estMin?: number | null`: your rough estimate in minutes, used only while the milestone has no live steps.

**Repair:**
- **Goals:** `repairGoal` drops a `finishBy` that isn't a valid date.
- **Milestones:** it drops an `estMin` that isn't a whole number from 30 to 6000.
- **Valid goals** come back as the same object.

**Sync:** both are their record's own fields, so the existing stamping and per-goal/per-milestone newer-wins merge already handle them.

## Rules (`src/core/pace.ts`, pure)

- **Correction:** `correction(g, spent)` → `{ ratio, applied, short, text }`.
  - It uses the live finished steps with focus time above 0. When there are 3 or more, `ratio = clamp(Σspent / ΣestMin, 0.5, 2)` and `applied = true`; otherwise `ratio = 1` and `applied = false`.
  - **`short`** is `'+30%'`, `'−20%'`, `'on target'` (within ±5%), or `'—'` when not applied.
  - **`text`** is `'You usually take 30% longer'`, `'You usually take 20% less time'`, `'Your estimates are about right'`, or `''`.
- **Milestone estimate:** `milestoneEstimate(g, m)` → `{ min, guess } | null`.
  - It's null when the milestone has live steps.
  - Otherwise it's your `estMin` (`guess: false`), or the average of `ΣestMin` over this goal's live milestones that have steps, rounded to 5 minutes, or 240 (`guess: true`).
- **What's left:** `leftToGo(g, spent)` → `{ min, unplannedMin }`.
  - Each open live step adds `max(0, estMin × ratio − spent)`.
  - Each live milestone without steps adds `estimate × ratio` (counted in `unplannedMin` too).
  - Results are rounded to whole minutes.
- **Pace:** `stepPacePerWeek(g, logs, today)` sums the minutes of logs whose target is a step of this goal and whose date is within `[today − 27, today]`, then divides by 4.
- **Forecast:** `forecastDate(leftMin, perWeek, today)`.
  - 0 left gives today; a pace of 0 or less gives null.
  - Otherwise it's `today + ceil(leftMin ÷ (perWeek ÷ 7))` days.
- **Verdict** (with a finish-by date):
  - **past due:** after the date, with work left;
  - **ahead:** the forecast is on or before the date minus 14 days;
  - **on track:** the forecast is on or before the date;
  - **behind:** the forecast is after the date;
  - **none (null):** there's no forecast.
- **Need:** `ceil(leftMin ÷ (daysUntil ÷ 7))` minutes a week, as `'1h 9m a week'`; empty when past due.
- **Pace view:** `paceView(g, logs, spent, today)` → `PaceView | null` (null for achieved goals):
  - **`paused`;**
  - **`left`:** `'~7h 51m'`;
  - **`unplanned`:** `'incl. ~6h 56m unplanned'` or `''`;
  - **`correction`:** the correction text;
  - **`pace`:** `'50m a week · last 4 weeks'`, or `'No focus on its steps in the last 4 weeks'`;
  - **`atPace`, `atHabit`:** `'~Dec 19'` (with `, 2027` when the year differs) or null;
  - **`finishBy`:** `{ date, text, verdict, need }` or null;
  - **`behind`:** the verdict is behind or past due.
- **Dates:** `dayLabel`, adding the year when it differs from today's.

**Ledger change (`goalLedger`):**
- `left` becomes the corrected `leftToGo`, prefixed `~` when the correction applies or unplanned time is above 0.
- `accuracy` is replaced by `estimates` (the correction's `short`).
- The goal page's stat label changes from Accuracy to **Estimates**.

## Store (`src/stores/ember.ts`)

- `setFinishBy(goalId, date | null)` sets or clears the field; it does nothing for a missing or deleted goal or an invalid date.
- `setMilestoneEstimate(goalId, msId, hours | null)` stores `round(hours × 60 ÷ 5) × 5`, clamped to 30–6000, or clears it with null.

## UI

**Goal page stats strip:** "Left to go" shows the corrected value. "Accuracy" becomes "Estimates", with `+30%`, `−20%`, `on target` or `—`.

**Pace section (`PaceSection.vue`)**, under the habit row, on active and paused goals:
- **The kicker** reads "Pace".
- **Paused goals:** a single line, "Paused — no forecast".
- **Active goals:**
  - **"At your pace"** with `atPace` (or "—") and the `pace` text in small grey type;
  - **"At your habit"** with `atHabit`, when the goal has a habit;
  - **"Left to go"** with `left`, `unplanned` and `correction` in small grey type;
  - **"Finish by"**, when set: the date, the verdict as a tag (red for behind and past due, grey otherwise) and "To make it: ‹need›". **Change** opens an inline date input with **Save** and **Clear**.
  - **Without a finish-by date:** a **Set a finish date** ghost button opens the same input.

**Roadmap:** a milestone with no live steps shows its estimate in the ledger spot ("~4h guess", or "~2h" for your own figure). A **Set estimate** ghost button opens an inline hours input (step 0.5, 0.5–100) with **Save** and **Clear**.

**Goal list:** an active goal whose verdict is behind or past due gets "· behind" added to its meta line, in accent-700.

## Error handling

- Invalid saved values are repaired; invalid inputs are ignored or clamped.
- With no pace, there's no date, never "Infinity" or a nonsense date.
- Past-due goals show "past due" and no need figure.

## Testing

- **`core/pace`:** the correction (threshold, the limits, ±5%, the over and under wording), the milestone guess and override, `leftToGo` with the correction and unplanned milestones, the pace window, forecast dates, every verdict, need, and the full `paceView` for active, paused and achieved goals and with a habit.
- **`goalLedger`:** the corrected left and estimates.
- **Repair** of `finishBy` and `estMin`.
- **Store:** both setters, with clamping and clearing.
- **Components:** the Pace section (each state, setting and clearing the date), the stats label, the milestone estimate (show, set, clear), and the goal list's behind note.
- **Browser:** a check at the end.
