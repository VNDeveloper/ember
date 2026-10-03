# Handoff: Ember — tasks, learning goals and focus time

## Overview
Ember is a single-user productivity app for people who are learning things alongside everyday life. It has three tabs:
- **Today** (doing): what you're working on, today's tasks, and what's coming up.
- **Goals** (planning): learning goals broken into milestones and steps, with time estimates and a written finish line.
- **Activity** (reflection): a year heat map, a weekly "done wall", and a log.

A persistent **focus bar** (pomodoro) sits under the nav on every tab and logs time against whichever task or step is selected. **Focus mode** opens the timer full screen over a muted, black-and-white YouTube video.

## About the design files
`reference/Ember.dc.html` is a **design reference built in HTML**: a working prototype, not production code. Open it in a browser to try it (the other files in `reference/` only make it render). The logic lives in the `<script data-dc-script>` block at the bottom — use it for exact formulas and copy.

## Fidelity
**High fidelity.** Colours, type, spacing, copy and interactions are final.

The prototype pins today to **Wed 23 Sep 2026** (day index 265, 0-based from 1 Jan 2026) so the seed history looks right. The real app uses the real date and ISO dates throughout.

---

## Global layout
Full-height page on `--bg`. Vertical stack:
1. Nav bar
2. Focus bar (+ 4px progress bar)
3. Active view, with a 2px rule above it

Everything must reflow down to ~360px wide: grids collapse to one column, wide grids get `overflow-x: auto`.

### Nav bar
- Uses the `.nav` pattern: padding 12px 24px, gap 24px, 2px bottom rule.
- Left: "Ember" (Archivo 800, 18px).
- Tabs **Today / Goals / Activity**: 14px/700, padding 4px 0, no background. Active = accent text + 2px accent bottom border. Hover = accent text.
- Right: today's date, e.g. "Wed 23 Sep 2026", 13px.

### Focus bar
Grid `auto | 1fr | auto | auto`, gap 24px, padding 12px 24px. Below it a 4px progress bar (track neutral-300, fill accent, `width` transition .25s linear).
1. **Time** `MM:SS`: Archivo 800, 40px/1, tabular, letter-spacing −.02em.
2. **Stack:**
   - Phase label (11px uppercase, .08em, muted): "Next focus session" / "Focusing on" / "Session done — take 5" / "Break".
   - **Selected item title as a button** (16px/700, ellipsis) with a chevron-down icon. Hover shows a 2px accent underline. Click opens the **focus picker**. Empty state: "Pick a task or step to focus on".
   - Context (12px, muted, ellipsis). Step: "Learn D3.js · 02 First charts · 50m of est. 1h 15m". Task: "Task · Work · 25m focused" or "Speak Spanish at B1 · task". Empty: "Press the timer icon on any row".
3. **Right stack:** a "Demo speed" accent tag (only when demo mode is on), then "2 sessions · 50m today" (13px, muted, tabular).
4. **Buttons:**
   - Primary with play/pause icon: "Start focus" / "Pause" / "Resume" / "Start break".
   - **Focus mode** icon button (36×36, Lucide `scan` / corner-brackets icon, transparent, 1px border in current text colour).
   - Ghost "Reset": only during focus, and only once the timer has been started or partially run.
   - Ghost "Skip break": only during break.
- **Background by state** (`transition: background .3s`): idle neutral-200; focusing ink with bg-coloured text (muted text → neutral-400); break accent-100.
- **Completion toast:** "+25m · {title}" floats up from just below the bar at left 24px (800 16px, accent-700, float 1.6s).

### Focus picker (dialog)
Opened from the focus-bar title or the Focus-mode title. Uses `.dialog-backdrop` + `.dialog`, z-index above Focus mode, anchored near the top (padding-top 12vh), width min(560px, 100%), max-height 72vh, 2px ink border, `--shadow-lg`.
- **Header row** (2px bottom rule): search icon, borderless autofocused input, and a segmented control **Tasks | Goals**.
  - Opens on **Goals** if the current selection is a goal step, otherwise **Tasks**.
  - Placeholder: "Search tasks" / "Search goal steps".
- **Body** scrolls; section headers are sticky (11px uppercase 700, count on the right).
  - **Tasks tab:** sections *Today* (open tasks due today or earlier), *Upcoming* (future, by date; meta "Tomorrow · Work"), *Someday* (no date).
  - **Goals tab:** one section per goal (goal title); rows are the **open steps of that goal's current milestone**; the next step's meta ends with "· next step".
- **Row:** 10px swatch (goal colour; ink-outlined square for tasks without a goal), title (14px; bold if current), meta (12px, neutral-700), "Current" accent tag on the selected item. Selected row bg accent-100; hover accent-100.
- Search filters within the active tab on title + meta, case-insensitive. **Enter** picks the first match. Click picks. **Esc** or backdrop click closes (Esc closes the picker before Focus mode).
- Empty: "Nothing matches "{q}"."

### Focus mode
Full-screen fixed overlay (z above everything except the picker), ink background, bg-coloured text.
- **Background layer:** a YouTube iframe, `pointer-events: none`, `filter: grayscale(1)`, sized to cover (`width: max(100vw, 177.78vh); height: max(100vh, 56.25vw)`, centred). Over it, a scrim of ink at 62%.
  - Embed URL: `https://www.youtube-nocookie.com/embed/{id}?autoplay=1&mute={0|1}&loop=1&playlist={id}&controls=0&modestbranding=1&playsinline=1&rel=0&iv_load_policy=3&disablekb=1`
  - Default video: `https://www.youtube.com/watch?v=jfKfPfyJRdk`.
  - Parse IDs from `watch?v=`, `youtu.be/`, `embed/`, `shorts/`, `live/` links or a bare 11-character ID.
  - The prototype reloads the iframe when toggling sound; in production prefer the IFrame Player API (`mute()` / `unMute()`) so the video doesn't restart.
- **Top bar** (2px rule in bg at 35%): "Ember" + "FOCUS MODE" label; ghost "Exit · Esc" on the right.
- **Centre, flush left:**
  - phase label (13px uppercase 700)
  - time: Archivo 800, `clamp(96px, 18vw, 220px)`/.85, letter-spacing −.04em, tabular
  - selected title as a picker button (Archivo 800, `clamp(24px, 3vw, 40px)`, chevron)
  - context line (15px)
  - "Then: {next open step}" for goal steps (15px, 85% opacity)
  - buttons: primary Start/Pause (min-width 160px, **label flush left**); outlined "Mark done" (only in focus phase with a selection; completes the step/task and the selection hands off as usual); ghost "Skip break" during break
- **Bottom bar** (2px top rule, ink at 70%):
  - "BACKGROUND" label + segmented **Video | Off**
  - ghost sound toggle ("Sound off" / "Sound on", volume icon with or without x)
  - right-aligned: input "Paste a YouTube link" (bg-coloured) + primary "Play"
  - full-width line: "Now: youtu.be/{id}", plus "· That doesn't look like a YouTube link" (bold) on a parse failure
- A 6px accent progress bar along the very bottom.
- **Esc** or Exit closes. The timer keeps running across open/close. Persist the URL, mute and background choice.

---

## View 1 — Today
Padding 24px, gap 24px.

### Working on (strip)
One card per goal with an open step; equal-width cells in a row (wrap on narrow screens), separated by 2px rules.
- Goal swatch + **full goal name** + percentage.
- "MILESTONE 02 OF 04" (11px uppercase .08em, neutral-700), then the milestone title.
- Segment bar: one 6px segment per step in that milestone, gap 3px, accent if done else neutral-300.
- Bottom (margin-top auto): "Next" label and the next step title, plus a timer button.
- Clicking the card selects that step (bg accent-100 when selected). A link to open the goal on the Goals tab.

### Two columns: Today | Upcoming
Grid `1fr 1fr`, gap 32px; one column when narrow.

**Today column**
- Header: h4 "Today"; right side has a **7-day streak strip** (seven 10×10 squares, today ringed, filled accent if anything was done that day), "{n}-day streak", and bold "{done} of {total} done".
- **Add-task row at the top** (above the list):
  - Input "Add a task…" + primary "Add" (Enter adds).
  - Options row: segmented **Today | Tomorrow | Pick date | Someday**; a date input when Pick date is chosen (min = today); a **Deadline** toggle button (flag icon; pressed = accent-100 bg, accent border, accent-800 text) — hidden when Someday is chosen, since a deadline needs a date; a goal `<select>` ("No goal" + goal titles).
  - New tasks get tag "Inbox". The deadline toggle resets after adding.
- **List** (2px top rule). Shows open tasks with a date ≤ today, plus tasks completed today.
  - Order: missed hard deadlines first, then the rest in creation order.
  - Row grid `22px | 1fr | auto | 28px | 28px`, padding 8px, 1px bottom rule; accent-100 when selected.
    1. Checkbox 22×22, 2px ink border; checked = accent fill + bg-coloured check.
    2. Title (14px; done = line-through neutral-700) and a meta line (11px): goal swatch + goal name, or the tag; then a note (see below).
    3. Focused time ("25m"), 12px neutral-700.
    4. **Move to tomorrow** button (Lucide `arrow-right-to-line`), hidden on done rows.
    5. **Focus** button (Lucide `timer`), accent when selected, hidden on done rows.
  - **Done tasks collapse:** finished rows are hidden behind a row "{n} done" (chevron-right, 13px neutral-700) at the bottom of the list. Click expands to show them above a "Hide done" row.
- **Notes on rows:**
  - Hard deadline: flag icon + "Due today" / "Due Tomorrow" / "Due Sep 30" in accent-700, bold.
  - Missed hard deadline: "Deadline passed · Sep 21" in accent-700.
  - **No-deadline task left from an earlier day rolls into Today silently** with a grey "From Sep 21" note — never "Overdue", never red.

**Upcoming column**
- Header: h4 "Upcoming" + "{n} planned · {n} deadlines · {n} someday".
- The list (2px top rule) **scrolls on its own**: `max-height: min(640px, 72vh); overflow-y: auto`.
- Groups, each with a **sticky** header (11px uppercase 700, bg-coloured, 1px bottom rule):
  - One group per day for the next 6 days: "Tomorrow" / weekday name, with the date on the right.
  - **Later** (more than 6 days out): collapsible, starts collapsed; header shows a chevron and "{n} tasks".
  - **Someday** (no date): collapsible, starts collapsed, always last.
- Rows: grid `18px | 1fr | 28px`, smaller checkbox, same meta/note rules (Later rows show their date as the note); a **Move to today** button (Lucide `arrow-left-to-line`).
- Empty: "Nothing planned. Pick a date or Someday when you add a task."

---

## View 2 — Goals
Grid `280px | 1fr`; aside has a 2px right rule.

### Aside
- Kicker "GOALS", then a list (2px top rule). Each goal is a full-width button (padding 12px, 1px bottom rule, selected/hover accent-100): swatch + title (14px/700) + % (13px/700); a 4px progress bar (ink fill, accent at 100%); meta "4h 10m focused · 9/14 steps" (12px).
- **Goal colours** in order: accent, ink, accent-300, neutral-500, repeating.
- Bottom (`margin-top: auto`): "New goal" label, input "e.g. Learn Three.js", 36×36 primary plus button. A new goal gets one milestone "Getting started" with its add-step input open.

### Main (padding 24px, gap 24px)
1. **Header:** kicker "GOAL · 4h 10m FOCUSED · 1 OF 4 MILESTONES"; h2 goal title; % on the right in Archivo 800 64px/.9.
2. **Readme box** (2px border): strip "README · WHAT DONE LOOKS LIKE" / "Click to edit"; borderless 2-row textarea editing the outcome (15px/1.45); focus = 2px accent inset outline.
3. **Ledger stats** (4 cells, 2px rules top/bottom/between, 28px values): **Focused** (accent-700), **Estimated**, **Left to go** (Σ max(0, est − spent) over open steps), **Accuracy** (over done steps: min(ΣEst, ΣSpent) / max(ΣEst, ΣSpent), or "—").
4. **Tasks for this goal** (only if any): open tasks linked to the goal plus those done today, sorted by date (Someday last), with date notes. **Show the first 5**, then a ghost "Show all {n}" / "Show fewer".
5. **Legend:** ink "Earlier sessions", accent "Today", outlined "Estimate remaining", "1 block = 25 min".
6. **Roadmap:** each milestone is a row `32px | 1fr`, gap 16px.
   - Rail: 2px line at x=15px (accent if complete else neutral-300).
   - Marker 32×32: complete = accent + check; current (first incomplete) = ink + white "02"; future = bg, neutral-400 border, neutral-700 number.
   - Header button toggles expand: title (Archivo 800 20px), "You are here" tag on current, then right-aligned "1h 40m of est. 3h", "2 / 4", chevron (rotates 180°, .2s). Current milestone expanded by default; remember toggles.
   - Segment bar: 8px segments per step.
   - Step rows: grid `22px | 1fr | minmax(0,auto) | 104px | 28px`: checkbox; title; **session blocks** (14×14, gap 3px, max-width 220px; count = max(spent/25, est/25); filled ink, the last today/25 accent; unfilled up to est = 2px neutral-400 inset); ledger "50m / 1h 15m" over "+25m over" (accent-700 bold) or "Done Sep 16"; focus button.
   - "+ Add step" (ghost) → input "New step (estimated 2 sessions), Enter to add"; Esc/blur cancels; default est 50m.
   - After the last milestone: rail stub + secondary "+ Add milestone".
   - **Finish line:** 32×32 flag marker (accent fill when all milestones are complete), "Finish line" / "Finish line — reached", and the outcome text.

---

## View 3 — Activity
Single column, padding 24px, gap 32px.

1. **Year heat map** (GitHub layout; fits the width, never scrolls):
   - Header: kicker + h2, and a segmented **Focus time | Things done** on the right.
     - Focus: kicker "FOCUS TIME · ALL GOALS AND TASKS", h2 "{h} hours focused in 2026".
     - Done: kicker "THINGS DONE · TASKS AND GOAL STEPS", h2 "{n} things done in 2026".
   - Grid `28px repeat(53, minmax(0,1fr))`, 7 rows, column flow, gap 3px, square cells (`aspect-ratio: 1`), max-width 1100px. 1 Jan 2026 is a Thursday → 4 leading blanks. Day labels Mon/Wed/Fri (9px). Month labels above.
   - Levels — focus minutes: 0 neutral-300, ≤50 accent-200, ≤100 accent-400, ≤150 accent, more accent-800. Done counts: 0, 1–2, 3–4, 5–6, 7+ on the same ramp.
   - Today has a 2px ink ring and pops on a session completion (focus mode) or a completion (done mode). Future days: 1px neutral-300 inset (setting).
   - Legend "Less … More focus time" / "More done".
   - **Stats row** (4 cells, 32px values). Focus: September, Best day, Focus streak ("12d"), Daily average. Done: September, Best day, Streak, Active days.
2. **Two columns** `1.6fr | minmax(280px, 1fr)`, 2px top rule:
   - **Done wall:** kicker "DONE WALL · LAST 12 WEEKS", h3 "{n} things finished", goal legend + outlined "Tasks". One column per week (oldest left), 2px ink baseline, height (max(6, tallest)+1)×21px; 18px bricks stacked from the bottom (steps = goal colour; tasks = 2px inset in goal colour or ink). Current week bg accent-100, label accent-700. Stats: This week (accent-700), Best week, Weeks in a row, Milestones done.
   - **Activity log:** kicker "ACTIVITY LOG"; 10 entries, then a ghost **"Show earlier"** that adds 10 more (only shown when more exist). Entry: icon (accent check or timer), text 13px (`Completed "…"`, `Completed task "…"`, `Focused 25m on "…"`), meta 11px: bold 7-char hex hash, source, "Today"/"Yesterday"/"Sep 16". Order: today's completions, focus sessions newest first, older completions.

---

## Interactions & behaviour

### Selection
- One item (task or goal step) is selected at a time. Select via: the timer button on any task/step row, a Working-on card, or the focus picker.
- Completing the selected **step** moves the selection to the next open step of that goal. Completing the selected **task** clears it.

### Tasks and dates
- Every task has either a planned date or **no date (Someday)**. A **deadline** is a separate flag that only applies to dated tasks.
- Today = open tasks with date ≤ today, plus tasks done today.
- Unfinished non-deadline tasks roll over silently with "From {date}". Missed deadlines stay red and sort first.
- Move to tomorrow sets date = today + 1. Move to today (from Upcoming or Someday) sets date = today.

### Timer
- Focus 25 min / break 5 (or 50 / 10 by setting). Start, Pause, Resume, Reset as labelled.
- At 0 in focus: add the minutes to the selected item, increment sessions and today's total, prepend a log entry, switch to a paused break, show the toast. If nothing is selected, log as "Unassigned".
- At 0 in break: return to a paused focus.
- Use wall-clock deltas (`Date.now()`), not tick counting, so it survives tab throttling and reloads. Persist timer state.
- **Demo speed** (`?demo=1` or dev setting): 25 minutes run in ~25 seconds; show the "Demo speed" tag.

### Animations (retriggerable: alternate two identical keyframe names or remount with a key)
- **pop** .45s `cubic-bezier(.3,1.6,.5,1)`, scale .3 → 1.45 → 1: checkbox on check; today's heat-map cell; newest session block; streak strip today.
- **drop** .55s `cubic-bezier(.2,.9,.3,1.15)`: newest brick in the current week falls from −220px.
- **float** 1.6s ease-out: the toast rises +8px → −40px and fades.
- Transitions: focus-bar bg .3s, progress width .25s linear, chevrons .15–.2s.

### States
- Hovers/pressed from the accent ramp; keyboard focus `outline: 2px solid var(--accent); outline-offset: 2px`; disabled 45% opacity.
- Add task/goal/milestone/step: Enter commits, Esc/blur cancels.

### Not designed yet (make a sensible call and tell me)
- Editing or deleting tasks, steps and milestones; reordering.
- Editing a step's time estimate.
- Custom focus/break lengths beyond 25/5 and 50/10.
- Deeper task ↔ goal integration beyond colour and name.

---

## Data model
```ts
type ISODate = string; // 'YYYY-MM-DD'
type Step = { id: string; title: string; doneOn: ISODate | null; estMin: number };
type Milestone = { id: string; title: string; steps: Step[] };
type Goal = { id: string; title: string; outcome: string; milestones: Milestone[]; createdAt: ISODate };
type Task = { id: string; title: string; tag: string; goalId: string | null;
  date: ISODate | null;          // null = Someday
  deadline: boolean;             // only meaningful when date != null
  doneOn: ISODate | null };
type FocusLog = { id: string; at: number; date: ISODate; min: number;
  target: { kind: 'task'; taskId: string } | { kind: 'step'; goalId: string; msId: string; stepId: string } | null };
type Selection = FocusLog['target'];
type Timer = { phase: 'focus' | 'break'; running: boolean; endsAt: number | null; leftSec: number };
type Settings = { session: '25/5' | '50/10'; demo: boolean; showFuture: boolean; wallWeeks: number;
  focusBg: 'video' | 'off'; youtubeUrl: string; muted: boolean };
```
- **Derive, don't store:** spent minutes per task/step, today's minutes, sessions today, per-day focus minutes and things done, streaks, goal %, current milestone. All come from `FocusLog` and `doneOn`.
- The current milestone is the first with an open step; streaks count back from today (or from yesterday if today is still 0).

## State
- **UI:** view, active goal, expanded milestones, adding target and drafts, done-collapsed, open Upcoming groups, goal "show all" per goal, log page size, picker open / query / tab, Focus mode open.
- **Persist (localStorage):** goals, tasks, logs, selection, timer, settings.

## Seed data (match the prototype; see `SEED` and `L_SEED` in the script)
- **Tasks** (offset in days from today, ★ = deadline):
  - Send Q3 invoice to Halden & Co. — Work, 0 ★, done · Water the plants — Home, 0, done
  - Book dentist appointment — Health, −2 (shows "From …") · Renew car insurance — Personal, 0 ★
  - Book Spanish tutor for October — goal Spanish, 0 · Review pull request #482 — Work, 0 · 30-minute run — Health, 0
  - Call the landlord about the boiler — Home, +1 · Submit September expenses — Work, +2 ★ · Order cold-press paper — goal Watercolour, +3
  - Plan Q4 roadmap review — Work, +5 · Pay council tax — Personal, +6 ★ · Buy Mum's birthday present — Personal, +9 ★ · Car service — Home, +16
  - Someday: Try a sourdough starter — Home · Read "Visual Display of Quantitative Information" — goal D3 · Sort out old phone photos — Personal
- **Goals** (✓ = done; done steps spread over the last 1–11 weeks):
  - **Learn D3.js** — "Build and publish an interactive, animated chart of a real dataset — starting from a blank file, no tutorial open."
    Foundations ✓✓✓ · First charts: Bar chart from a CSV ✓, Line chart with tooltips ✓, Scatter plot with zoom ✓, Reusable chart function · Motion & interaction: Transitions & easing, Keyed enter / update / exit, Brushing & linked views · Capstone: Choose a dataset, Sketch the chart on paper, Build it, Publish & write it up
  - **Speak Spanish at B1** — "Hold a 20-minute conversation with a native speaker on everyday topics without switching to English."
    Basics ✓✓✓ · Past tenses ✓✓✓ · Conversation: 8 tutor sessions ✓, A series with Spanish subtitles ✓, 30-day journal · Exam: Mock DELE B1 paper, Book the exam
  - **Learn watercolour** — "Paint a finished landscape from one of my own photos — good enough to frame."
    Control ✓✓✓ · Studies: Ten skies, Trees & foliage, Water reflections · Final piece: Pick the photo, Value sketch, Paint it
- Estimates 50–125 min in 25-minute units; done steps spent = est ± 25. Each goal's next open step has 50m spent. "Reusable chart function" is pre-selected with 2 sessions (50m) today.
- Generate believable 2026 history (weekdays busier than weekends, rising through the year) — or skip history in production and start empty.

## Design tokens (Modernist)
| Token | Value |
|---|---|
| bg | `#f3f2f2` |
| surface (inputs, dialog) | `#eae9e9` |
| text / ink | `#201e1d` |
| accent | `#ec3013` |
| divider | ink at 40% |
| neutral 100–900 | `#f8f4f4 #eae7e7 #d7d3d3 #bab6b6 #9b9797 #7d7979 #605d5d #444141 #2d2b2b` |
| accent 100–900 | `#fff2ef #ffe0d9 #ffc4b8 #ff9783 #ff563c #dd2b0f #ae1800 #7c1405 #4d170e` |
| spacing | 4, 8, 12, 16, 24, 32 px |
| radius | **0 everywhere** |

The exact values live in `reference/_ds/…/styles.css` (`:root`) — copy from there if anything here disagrees.

- **Type:** Archivo (400/600/800). Body 15px/1.55. h2 32 / h3 25 / h4 20, weight 800, line-height 1.12, −0.015em. Kickers 10px uppercase .1em accent. Stat labels 11px uppercase .08em neutral-700.
- **Buttons:** Archivo 800 14px, padding 8px 14.4px, **labels flush left**, icon gap 6px. Primary accent/bg text (hover accent-600, active accent-700). Secondary 1px divider border. Ghost accent text. Icon 36×36.
- **Inputs:** min-height 36px, padding 6px 10px, 14px, surface bg, 1px divider border, accent border on focus.
- **Segmented control** (`.seg` / `.seg-opt`): native radios styled as joined square segments; checked = ink fill.
- **Tags:** 11px, padding 3px 10px; accent = accent-100 / accent-800; neutral = neutral-100 / neutral-800.
- **Rules:** 2px between major sections; 1px between list rows. Never hairlines.
- Accent text at paragraph size must use accent-700 for contrast.

## Assets
No images. Icons are all Lucide: `timer`, `check`, `plus`, `play`, `pause`, `chevron-down`, `chevron-right`, `flag`, `arrow-right`, `arrow-right-to-line`, `arrow-left-to-line`, `scan`, `x`, `search`, `volume-2`, `volume-x`. Archivo from Google Fonts. The YouTube video is user-supplied.

## Files
- `PROMPT.md` — kickoff prompt for Claude Code.
- `reference/Ember.dc.html` — working prototype (logic in the `<script data-dc-script>` block). Tweaks in the prototype map to Settings: Demo speed, Session length, Show future days, Done-wall weeks.
- `reference/support.js`, `reference/_ds/…` — only needed to render the prototype.
