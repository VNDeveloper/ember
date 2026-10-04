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
- **Focus mode:** full-screen timer over a muted black-and-white YouTube video, using the IFrame Player API so sound toggles without restarting. Video/Off switch, paste-a-link, Mark done, Esc.
- **Animations:** pop (checkbox, today's heat-map cell, newest session block, streak square), drop (newest done-wall brick) and float (toast). All are retriggerable and respect reduced motion.
- **Seed data:** the prototype's goals and tasks plus a believable year of history, generated relative to the real date.

## Couldn't match, or known differences

- **Default Focus-mode video:** `jfKfPfyJRdk` is a live-stream recording that YouTube reports as unavailable in the embed. The prototype shows the same message. Paste any other link to fix it.
- **YouTube's own title and controls show faintly through the scrim.** `controls=0` no longer hides the title, and they can't be clicked.
- **Focus-mode presentation (grayscale and scrim over a control-less embed)** follows the design, by explicit decision, for personal use. It doesn't follow YouTube's player-presentation policies. Revisit before any public release.
- **Segmented-control checked state:** ink, as the README says. The prototype's stylesheet used accent. It's one token (`--seg-checked-bg`).
- **Sample numbers differ from the prototype's.** The prototype's spent-time formula had a sign bug, so done steps could show far less time than their estimate. Ember follows the README's "estimate ± 25 minutes".
- **The done wall is taller than the prototype's** with the seeded history, because it shows every finished task, not only today's. The height follows the spec formula. Counting goal steps only, or a lighter seed, is a small change.
- **Real data everywhere.** The prototype's heat map used fake arrays; Ember derives it from focus sessions and completions.

## "Not designed yet": calls made

| Item | Call |
|---|---|
| Editing or deleting tasks, steps, milestones and goals | Not built. Steps and tasks can be ticked and un-ticked; goals, milestones, steps and tasks can be added. |
| Reordering | Not built. |
| Editing a step's estimate | Not built. New steps default to 50 minutes ("2 sessions"). |
| Custom focus/break lengths | Not built. `settings.session` supports 25/5 and 50/10, with no settings screen yet. |
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
  - If the YouTube API doesn't load within 15 seconds, the background stays ink and a later visit retries.
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

## Suggested next steps

1. A small settings screen: session length, show future days, done-wall weeks, demo speed.
2. Edit and delete for tasks, steps, milestones and goals, plus editing a step's estimate.
3. Export and import of the data (JSON), since everything lives in one browser.
4. PWA install (manifest and service worker) so Ember opens offline like an app.
