# Ember — plan with your AI (markdown import): design

Date: 2026-10-19 · Status: design agreed in conversation ("ok look good", "ok sound good"); build Native with a final review

## Purpose

Ember publishes a plain markdown format. You copy a ready prompt, paste it into whatever AI chat you already use, and paste the AI's reply back. Ember then builds:
- a goal with milestones, steps and estimates;
- new steps for a goal you have;
- or a task list.

Ember has **no AI in it**: no chat, no network calls, no API keys. It only copies text to the clipboard and reads what you paste, on your device.

**Success:**
- From "Import a goal" to a planned goal takes one copy, one paste and one click, with a preview before anything is saved.
- A goal can go out and come back: "Add from AI" includes the goal as it stands, and the reply only adds what's new. Done steps and focus history are never touched.
- Lines Ember can't read are listed with a reason, so nothing is lost silently.
- One Undo takes back a whole import.

**Out of scope:**
- any AI call or chat UI;
- syncing a goal to a paste (renaming, removing or re-estimating existing steps);
- importing resources, habits on their own, or focus history;
- file upload or drag-and-drop (paste only);
- JSON or other formats.

## Decisions (from the conversation)

1. **Three pastes:** a new goal, steps for an existing goal, and a task list. Goal and task pastes are separate.
2. **Both ways for goals:** a goal can be copied out in the same format, with done steps marked, so the AI can plan the rest.
3. **Paste-back only adds.** It matches by title; nothing is renamed or removed.
4. **Ember gives a ready prompt.** You fill in the first line in your AI chat, not in Ember.
5. **Preview, then Create,** with tick boxes. Undo still works afterwards.
6. **Tasks carry:** a date, the deadline flag, a tag and a goal link.
7. **Format:** a plain markdown outline, read leniently (option 1).

## The format

### Goal

```
# Goal: Speak conversational Spanish
Outcome: Hold a 15-minute conversation with a native speaker
Finish by: 2027-01-31
Habit: 25m on 5 days a week

## Sounds and greetings
- [x] Learn the alphabet and vowel sounds (45m)
- Practise 20 greetings out loud (1h)

## Everyday conversation
- Learn the 100 most common verbs (2h 30m)

## Real conversations (6h)
```

- **Title:** the first `#` heading. A leading `Goal:` is dropped.
- **Fields:** the lines `Outcome:`, `Finish by:` and `Habit:`, case-insensitive. They're read anywhere before the first `##`, and each is optional.
  - **Finish by** is a real `YYYY-MM-DD` date (`isRealDate`).
  - **Habit** is `<N>m on <D> days a week`, `<N> min on <D> days a week`, `<N>m a day`, `<N>m daily` or `<N>m every day` (the last three mean D = 7). It's valid only with 5 ≤ N ≤ 240 and 1 ≤ D ≤ 7, rounded with `clampHabit`; otherwise the line is skipped.
- **Milestones:** each `##` heading (any depth from 2 up) is a milestone. A leading `Milestone:`, `Milestone 2:`, `Phase 1 —` or `1.` is dropped. An estimate at the end of the heading, like `(6h)`, becomes the milestone's own estimate (`estMin`, clamped 30–6000). It's used only while the milestone has no steps; when it has steps the estimate is ignored and a note is shown.
- **Steps:** each bullet (`-`, `*`, `+`, `1.`, `1)`) under a milestone, with an optional `[ ]` or `[x]` / `[X]`.
  - **`[x]`** means done: it's marked done on the import day, with no focus time logged.
  - **Estimate:** a trailing bracket, `(45m)`, `(1h)`, `(1h 30m)`, `(90 min)`, `(1.5h)`, `(~2 hours)` or `(45 minutes)`, also after a ` — ` or ` - ` instead of brackets. It's rounded to 5 minutes and clamped to 5–480. Without one, the step gets 50 (the same as adding a step by hand).
  - **Nested bullets** (indented under a step) are skipped with the reason "sub-points aren't imported — make them steps".
- **Bullets before any `##`** go into a milestone called "Getting started".
- **Ignored silently:**
  - lines before the first `#` (the AI's intro);
  - code fence lines (` ``` `), blank lines, horizontal rules;
  - plain paragraphs after the fields (the AI's notes).
  - `**bold**`, `__bold__`, `*italic*` and `` `code` `` markers are stripped from titles.
- **Skipped with a reason** (shown in the preview):
  - a field line Ember can't read (`"Finish by: next spring" — not a date`);
  - a nested bullet;
  - a duplicate step in the same milestone;
  - a title longer than 200 characters (cut to 200, with a note rather than skipped);
  - anything past the limits: 30 milestones, 300 steps, 100 tasks, 50 000 characters of paste.

### Tasks

```
# Tasks
- Book a trial lesson | tomorrow | #Admin | goal: Speak conversational Spanish
- Renew passport | 2026-11-02 | deadline
- Read about learning plateaus
```

- `# Tasks` is optional in the tasks panel. Each bullet is a task, and an optional `[ ]` is dropped.
- **`[x]` tasks** are skipped ("already done").
- **The parts after `|`** can come in any order, case-insensitive:
  - **`today`, `tomorrow`, `someday` or `YYYY-MM-DD`:** the date. A date in the past becomes today; no date means Someday.
  - **`deadline`:** sets the deadline flag, but only on a dated task (otherwise it's noted as "deadline needs a date").
  - **`#Tag`:** the tag, trimmed to 24 characters; Inbox when there's none.
  - **`goal: <title>`:** links the task to the live goal whose title matches (normalised, see below). If none matches, the task is added without a goal and a note is shown.
  - **Anything else** is noted as "didn't understand ‘…’", and the task is still added.

### Title matching (normalise)

- lower case;
- markdown markers stripped;
- whitespace collapsed;
- trailing `.`, `:` and `;` dropped.

Used for paste-back matching, duplicate steps and goal links.

### Telling the two apart

`detectKind(text)` looks at the first heading:
- **`'tasks'`:** when it is `# Tasks` (or `Task list`, `To-dos`), optionally with a colon;
- **`'goal'`:** when it is any other `#` heading, or a heading that starts with `Goal:`;
- **`null`:** for any other `##` heading (a milestone, or a task list grouped by day), or no heading at all. The panel's own kind then decides.

A paste whose detected kind is not the panel's own kind shows "This looks like a goal — use Import a goal on the Goals page" (or "…a task list — use Paste tasks on Today") and can't be created.

## Copying out

**`goalMarkdown(goal)`** writes the format above from the live parts of a goal:
- title, outcome and finish-by date;
- the habit's current target (`25m on 5 days a week`);
- each live milestone (`(~4h)` when it has no live steps and its own `estMin`);
- each live step with `[x]` or `[ ]` and its estimate as `(1h 30m)`.

Parsing what it wrote gives back the same titles, estimates and done flags (a round-trip test).

**Prompts (`goalPrompt()`, `nextStepsPrompt(goal)`, `tasksPrompt(goals)`)** are plain text:

1. A first line for you to fill in:
   - `My goal: [describe it — what, by when, how much time a week]`;
   - `What I want next: [e.g. plan the next phase]`;
   - `What I need to do: [list or describe it]`.
2. One sentence of context ("I track this in an app that reads the markdown format below. Reply with only that markdown.").
3. The format with an example.
4. The rules:
   - 3–7 milestones, 3–7 steps each;
   - every step a concrete action under 3 hours with an estimate in brackets;
   - no nested bullets;
   - dates as YYYY-MM-DD;
   - today's date (so "tomorrow" and finish-by dates make sense).
5. **For next steps:** the current goal from `goalMarkdown`, with "Keep my existing milestones and steps exactly as written; add new steps under them or new milestones after them."
6. **For tasks:** the titles of your live goals, active and paused (in the "goal:" form), so the AI can link tasks.

## Rules (`src/core/importPlan.ts`, pure)

```ts
export interface Skipped { line: number; text: string; reason: string }
export interface PlanStep { title: string; estMin: number; done: boolean; line: number }
export interface PlanMilestone { title: string; estMin: number | null; steps: PlanStep[]; line: number }
export interface GoalPlan {
  title: string
  outcome: string | null
  finishBy: ISODate | null
  habit: { minutes: number; daysPerWeek: number } | null
  milestones: PlanMilestone[]
  skipped: Skipped[]
}
export interface TaskPlan {
  title: string; date: ISODate | null; deadline: boolean; tag: string; goalId: string | null; line: number
  notes: string[]
}
export function parseGoal(text: string): GoalPlan | null   // null when there is no title, milestone or step; title '' when only the title is missing
export function parseTasks(text: string, goals: Goal[], today: ISODate): { tasks: TaskPlan[]; skipped: Skipped[] }
export function parseEstimate(s: string): number | null    // minutes, before clamping
export function detectKind(text: string): 'goal' | 'tasks' | null
export function normTitle(s: string): string
export function goalMarkdown(goal: Goal): string
export function goalPrompt(today: ISODate): string
export function nextStepsPrompt(goal: Goal, today: ISODate): string
export function tasksPrompt(goals: Goal[], today: ISODate): string
```

**Paste-back matching:** `matchPlan(goal, plan)` returns:
- for each plan milestone, the live milestone it matches (or null for a new one);
- for each step, `'new'` or `'there'`;
- for each field, `'fill'` (the goal has none), `'kept'` (the goal has its own) or `'none'` (not in the paste).

A goal "has" an outcome when its trimmed outcome is non-empty, a finish-by date when one is set, and a habit when it has a live one. The plan's title is ignored for an existing goal.

**Selection:** the preview's ticks are passed as a set of keys (`m<i>` for milestones, `m<i>s<j>` for steps).
- Unticking a milestone unticks its steps. Ticking a step ticks its milestone.
- **New goal:**
  - a milestone that is ticked but has none of its steps ticked is still created, as an unplanned milestone (counting toward pace);
  - an unticked milestone is not created.
- **Existing goal:**
  - a matched milestone is never created again; only its ticked new steps are added;
  - "there" steps can't be ticked.

## Store (`src/stores/ember.ts`)

- **`importGoal(plan, picked: Set<string>): { goalId: string; undo: UndoRecord } | null`**
  - creates the goal with the picked milestones and steps, the outcome, finish-by date and habit (through the same rules as `setFinishBy` and `setHabit`);
  - selects the goal (`ui.selectGoal`, done by the caller);
  - returns null when the plan has no title.
- **`importIntoGoal(goalId, plan, picked): UndoRecord | null`**
  - adds the new milestones and steps, and fills only the `'fill'` fields;
  - re-opens an achieved goal (`reopenIfAchieved`), as adding by hand does;
  - returns null (a no-op) for a missing or deleted goal, or when nothing would be added.
- **`importTasks(tasks: TaskPlan[]): UndoRecord | null`**
  - adds the tasks, each with its own date, deadline, tag and goal, at the end of their day;
  - a `goalId` that no longer points to a live goal is cleared.
- **Undo:** `DeleteKey` gains `{ kind: 'import'; keys: DeleteKey[]; cleared?: { goalId: string; outcome?: boolean; finishBy?: boolean; habit?: boolean } }`.
  - `undoDelete` for this kind soft-deletes every key (goal, milestones, steps, tasks).
  - It clears each filled field: outcome back to `''`, finish-by to `null`, a habit it created to `null`.
  - It doesn't restore any selection.
- **Labels:**
  - `Imported “‹goal›”`;
  - `Added ‹n› steps to “‹goal›”` (or `‹n› steps and ‹m› milestones`);
  - `Added ‹n› tasks`.
- **Sync:** everything is created through the normal collections, so `stampChanges` and the merge handle it. The import is never stamped specially.

## UI

**`ImportPanel.vue`**:
- **Props:** `kind: 'goal' | 'next' | 'tasks'` and an optional `goal`. It's an inline `.edit-panel`.
- **Copy prompt** (a secondary button, so Create stays the panel's one primary action): a one-line explanation ("Paste this into your AI chat, fill in the first line, then paste its reply below.") and the button, which shows "Copied" for 2 s. If `navigator.clipboard` is missing or refuses, a read-only textarea with the prompt appears, focused and selected, with "Copy it from here".
- **Paste box:** a textarea, "Paste the AI's reply" (8 rows). It's parsed on every input (parsing is linear and fast, so there's no debounce).
- **Preview** (`ImportPreview.vue`):
  - **Goal / next:**
    - summary: `4 milestones · 18 steps · ~14h 30m` (new only, for next);
    - the milestone list with tick boxes, steps indented with their estimate, and "already there" greyed with no tick box;
    - field lines: `Outcome: …`, `Finish by: Jan 31, 2027`, `Habit: 25m on 5 days a week`, each with "kept yours" when `'kept'`.
    - **Goal only:** a note when a live goal already has the same normalised title ("You already have a goal called ‘…’ — Add from AI on its page adds to it instead"). Creating is still allowed.
  - **Tasks:** one row per task with a tick box, the title, its when (`Tomorrow`, `Nov 2`, `Someday`), `deadline`, `#Tag`, the goal's swatch and title, and its notes in small grey type.
  - **Skipped:** a quiet list (`section-label` "Skipped"), each with the line number, the text (cut to 60 characters) and the reason.
  - **No title (goal panel only):** "Add a ‘# Goal:’ line with the goal's name", and Create stays disabled. The next-steps panel ignores the title.
- **Empty:**
    - when nothing is readable: "Nothing Ember can read yet — check it starts with ‘# Goal:’" (or "with ‘- ’ bullets" for tasks);
    - the wrong-kind message as above.
- **Actions:**
  - the primary button: **Create goal**, **Add ‹n› steps** (**Add ‹n› steps and ‹m› milestones**), or **Add ‹n› tasks**. It's disabled when nothing is picked.
  - **Cancel** closes the panel and discards the paste.
  - After creating, the panel closes and the undo bar shows the label.
- **Where the panel opens:**
  - **Goals sidebar (`GoalList.vue`):** an **Import a goal** ghost button under the add-goal field. The panel opens in the main column (`GoalsView`, `ui.editing = 'import:goal'`).
  - **Goal page (`Roadmap.vue` header):** an **Add from AI** ghost button. The panel opens above the milestones (`ui.editing = 'import:next:<goalId>'`).
  - **Today (`TodayList.vue`, beside the add task form):** a **Paste tasks** ghost button. The panel opens under it (`ui.editing = 'import:tasks'`).
- **Goal row menu (`GoalSummary`):** a **Copy as markdown** item copies `goalMarkdown(goal)`, with the same clipboard fallback (shown in the panel's textarea).

Visual rules apply: zero radius, 1px rules between preview rows, red only for the primary button's existing style, no emoji.

## Error handling

- **Parsing never throws:** every line is either used, ignored as chatter, or listed as skipped with a reason.
- **Out-of-range values** (estimates, habit, dates) are clamped or skipped as stated; an impossible date is skipped, never coerced.
- **Pastes over 50 000 characters** are cut, with a skipped note "paste cut at 50 000 characters".
- **Store actions** on a missing or deleted goal do nothing. Imports create ids with `uid()` and never reuse ids from the paste.
- **A blocked clipboard** falls back to a selectable text box.

## Testing

- **`core/importPlan`:**
  - **Estimates:** every form, rounding and clamping, and none → 50.
  - **The goal parse:**
    - the title with and without `Goal:`;
    - each field, valid and invalid;
    - milestone prefixes and the heading estimate (with steps → note);
    - steps with every bullet style and `[x]`;
    - bullets before the first milestone → "Getting started";
    - nested bullets, duplicates, markers stripped, AI chatter before and after, code fences, the limits and the length cut.
  - **The task parse:** each part in any order, past dates, `deadline` without a date, tags, goal links found and missing, `[x]` skipped, unknown parts.
  - **`detectKind`.**
  - **`normTitle`.**
  - **Paste-back:** `matchPlan` (matched and new milestones, new and there steps, fill, kept and none).
  - **`goalMarkdown`:** output and the round trip through `parseGoal`.
  - **The prompts:** each contains the fill-in line, the rules, today's date, the goal's markdown (next) and the goal titles (tasks).
- **Store:**
  - `importGoal` (picked subsets, an unplanned milestone, fields);
  - `importIntoGoal` (adds only new, fills only empty, reopens an achieved goal, no-op cases);
  - `importTasks` (each field, a stale goal);
  - undo of each, including cleared fields;
  - sync stamping of the new records.
- **Components:**
  - `ImportPanel` (copy, the fallback, parse on paste, the wrong-kind message, empty, create, cancel);
  - `ImportPreview` (ticking and unticking, "already there", "kept yours", skipped list);
  - each entry point opens its panel;
  - Copy as markdown in the goal menu.
- **Browser:** a check at the end, with a real reply pasted from an AI chat.
