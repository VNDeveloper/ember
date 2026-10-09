# Ember — build report

Built from the design handoff in this folder (`handoff.md`, `reference/Ember.dc.html`) over seven phases, 4 October 2026. Each phase has a plan in `docs/superpowers/plans/`.

## What was built

- **Stack:** Vite + Vue 3 + TypeScript + Pinia, plain CSS tokens, lucide-vue-next, Vitest. The brief suggested React + Zustand; Vue + Pinia was chosen by request. Data lives in localStorage (`ember:v1`). There is no backend. 278 unit and component tests.
- **Shell:**
  - Nav bar.
  - Focus bar: the wall-clock pomodoro timer, the selected task or step, today's totals, the progress bar, the "+25m" toast, and the "Demo speed" tag with `?demo=1`.
  - Focus picker: Tasks/Goals tabs, search, Enter to pick, Esc to close.
- **Today:**
  - Working-on cards.
  - Today list: quiet roll-over, missed deadlines first, done collapse, 7-day streak.
  - Add-task row with Today, Tomorrow, Pick date or Someday, a Deadline toggle and a goal link.
  - Upcoming: next six days, then Later and Someday.
- **Goals:** goal list, readme, ledger stats, the goal's tasks, and the roadmap with session blocks, add step, add milestone and finish line.
- **Activity:** year heat map (focus time or things done), stats, done wall and activity log.
- **Focus mode (video-first, reworked after the handoff):** a full-colour YouTube video fills the screen, with a small centred time and progress bar. Top right: video settings (Video/Off, paste a link), sound and exit. Bottom left: play/pause, Mark done or Skip break, and the selected item, which opens the picker. While a session runs, the controls and cursor fade out after 3 seconds without mouse, touch or key activity. Pausing, or opening the settings or picker, keeps them visible. Sound uses the IFrame Player API, so muting never restarts the video. Esc closes the picker, then the settings, then Focus mode.
- **Animations:** pop (checkbox, today's heat-map cell, newest session block, streak square), drop (newest done-wall brick) and float (toast). All are retriggerable and respect reduced motion.
- **Settings (added after the handoff):** a Settings menu in the nav, beside Data, with the prototype's Tweaks. Timer: session length (25/5 or 50/10) and demo speed. Charts: show future days and done-wall weeks (4–26). A new length resets a fresh timer. A running session, or one paused partway, keeps its own length and its minutes ("Applies from the next session"). Timer labels (Resume, Reset, "take 5") read the timer's own length. When `?demo=1` is in the link, demo speed shows as on and locked. On phones the panel hangs full-width from the nav.
- **Sync, hosting and install (added after the handoff):**
  - Ember syncs tasks, goals, focus history and shared settings through one hidden file in your Google Drive. It uses the `drive.appdata` scope, Google Identity Services and the Drive REST API, with no server.
  - Every item carries an "updated at" stamp set when the store saves. Merges go item by item at every level, and the newest edit wins.
  - A generation ID makes a restore replace the data on every device.
  - The timer, selection, sound and demo speed stay per device.
  - Sync runs on open, on return, 5 s after a change, every minute while open, and when the network returns.
  - Sign-in lasts an hour, then the Data menu offers **Reconnect**.
  - Hosted on GitHub Pages and installable as an offline app, with an update bar.
  - The storage interface (`pull`/`push`/`subscribe`) and run-based log IDs (`focus-<endsAt>`) leave room for live updates and a shared timer later.
- **Delete data (added after the handoff):** Data → **Delete data…** asks first and offers a backup, then empties tasks, goals and focus history. Settings stay, and a safety copy is kept in the browser. When sync is connected it offers **Delete everywhere** (a new, empty generation in Drive, so other devices are cleared on their next sync) or **Delete on this device only** (also disconnects, or the next sync would merge everything back). Today, Working on and the activity log have plain empty-state messages.
- **Back up / restore (added after the handoff):** a Data menu in the nav downloads all data as a dated JSON file and restores from one. It confirms first, keeps a safety copy of the current data in the browser, and resets the timer.
- **Seed data:** the prototype's goals and tasks plus a believable year of history, generated relative to the real date.

## Couldn't match, or known differences

- **Default Focus-mode video:** `jfKfPfyJRdk` is a live-stream recording that YouTube reports as unavailable in the embed. The prototype shows the same message. Paste any other link to fix it.
- **YouTube's own title, captions and paused overlay can show over the video.** `controls=0` no longer hides the title, captions follow the viewer's YouTube settings, and none of it can be clicked.
- **Focus-mode presentation (a control-less, muted background embed)** is for personal use. It doesn't follow YouTube's player-presentation policies. Revisit before any public release.
- **Focus mode breaks two house rules on purpose:** a bottom legibility gradient and blurred translucent panels, so the controls read over bright footage.
- **Segmented-control checked state:** ink, as the README says. The prototype's stylesheet used accent. It's one token (`--seg-checked-bg`).
- **Sample numbers differ from the prototype's.** The prototype's spent-time formula had a sign bug, so done steps could show far less time than their estimate. Ember follows the README's "estimate ± 25 minutes".
- **The done wall is taller than the prototype's** with the seeded history, because it shows every finished task, not only today's. The height follows the spec formula. Counting goal steps only, or a lighter seed, is a small change.
- **Real data everywhere.** The prototype's heat map used fake arrays; Ember derives it from focus sessions and completions.

## "Not designed yet": calls made

| Item | Call |
|---|---|
| Editing or deleting tasks, steps, milestones and goals | Built after the handoff: a "⋯" row menu → inline edit panel; soft delete with an 8-second undo bar; history keeps deleted items (marked “(deleted)” in the log). Tasks of a deleted goal are kept. |
| Reordering | Not built. |
| Editing a step's estimate | Built: estimate stepper in 25-minute units, 25m–10h. |
| Custom focus/break lengths | 25/5 or 50/10 from the Settings menu; no custom minutes. |
| Deeper task↔goal integration | A task can be linked to a goal (colour and name). It appears under "Tasks for this goal". Time on a task counts on the task, not toward the goal's focused time. |

## Other decisions, by area

- **Data:**
  - IDs instead of array indices.
  - The timer captures its speed and phase length when it starts, so reloads or setting changes mid-run don't distort it.
  - Data that can't be read is backed up before falling back to seed data. If even the backup fails, Ember runs in memory and doesn't overwrite.
  - Other open tabs' saves are picked up automatically.
  - Older saved data is normalised on load.
- **Shell:**
  - The timer also ticks on load and when the tab becomes visible.
  - Esc closes the picker before Focus mode.
  - Dialogs move keyboard focus in, give it back on close, and keep Tab inside.
- **Today:**
  - A future task finished today stays visible, struck through, until midnight.
  - Clicking a Working-on card selects its step; the goal name opens the goal.
  - Drafts and collapse state survive tab switches.
  - Clearing the picked date keeps the last valid date.
- **Goals:**
  - The add-step and add-milestone inputs stay open for the next entry.
  - Switching windows doesn't cancel them; Esc returns focus to the Add button.
  - Accuracy shows "—" until a step is done.
- **Activity:**
  - Log order: today's completions, then newest day first, with focus sessions before completions on the same day.
  - Log hashes are stable.
  - Dates from another year show the year.
  - "Weeks in a row" forgives an empty current week.
  - The heat map covers the calendar year; streaks continue across New Year.
- **Focus mode:**
  - Sound starts muted, because of browser autoplay rules.
  - Key presses and taps count as activity too, so keyboard and touch users can bring the controls back.
  - If the YouTube API doesn't load within 15 seconds, the background stays ink. Opening Focus mode again retries when the script itself was slow or failed; if YouTube's script half-loaded, reload the page.
  - Page scroll is locked while Focus mode is open.
- **Phones (to ~360px):**
  - The focus bar wraps to two rows; the nav date drops under the tabs.
  - Cards and columns stack; stats go 2×2.
  - Step blocks move under the title; every other month is labelled on the heat map.

## Deferred minor issues

- An empty picker with an empty query reads `Nothing matches “”.` (as in the prototype).
- Safari doesn't focus buttons on click, so after closing the picker, focus returns to Start or nothing instead of the title.
- Working-on card bodies aren't keyboard-focusable. The timer button covers selection.
- A missed-deadline task ticked off today shows a red "Due Sep 21" on its struck row (as in the prototype).
- The four-option When control can't wrap. It fits at 360px with about 13px to spare.
- An add-step input open during a mousedown elsewhere can shift the layout so the next click misses (as in the prototype).
- The readme saves the whole store on every keystroke. A debounce would be cheap.
- 7-character log hashes can collide for keys differing only in the last character (cosmetic, as in the prototype).
- Per-day heat-map values and done-wall brick names are only in hover tooltips. They aren't reachable by keyboard, touch or screen readers.
- `resetTimer` and `skipBreak` are identical (kept as separate intents).
- Hand-edited saved data with a garbage timer `phase` or a running timer without a valid `endsAt` isn't repaired on load (missing or invalid lengths and speeds are).
- The draft "Pick date" only moves forward while the Today tab is open. Come back after midnight and the field can show a past date; the task is then filed under today.
- Right after clearing the date field it looks empty while the last valid date is still used. It corrects on the next re-render.
- Un-ticking a completion doesn't cancel its pending animations: opening Activity afterwards still pops today's cell and drops the last brick (the prototype turns these off after an undo).
- Focus mode: a bad YouTube link isn't announced to screen readers (no live region or `aria-invalid`).
- Focus mode: the selected-item button doesn't say it opens a dialog (no `aria-haspopup`; the hint is only in `title`).
- Focus mode tests don't pin that activity listeners use the capture phase, or that closing Focus mode (not only opening it) resets the settings panel.
- Settings: turning demo speed on or off mid-run takes effect at the next start, but the "Demo speed" tag changes at once.
- Settings: the done-wall stepper disables its own button at 4 or 26 weeks, which drops keyboard focus to the page.
- Settings: the On/Off toggles are named by `aria-label` only, so voice control must say "Demo speed", not the visible "On"/"Off".
- Settings test: clicking the locked demo toggle is a no-op in the test tool, so that one assertion can't fail (the `disabled` check is the real guard).

## Suggested next steps

1. Live updates and a shared timer: a backend with `subscribe` (e.g. Firestore), and `timer`/`selection` moved out of `DEVICE_ONLY`.
