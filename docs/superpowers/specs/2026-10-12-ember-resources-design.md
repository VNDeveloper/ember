# Ember — resources (links, companies, memberships): design

Date: 2026-10-12 · Status: design agreed in conversation; mockups on the design canvas https://claude.ai/artifact/KXSEhDtbZ5AyUE8kZDDymS (Main, AddEdit, Phone, Empty, Today, Focus, Goal)

## Purpose

Keep track of the learning resources in use (courses, videos, docs, models, articles, tools), their links and the company each comes from (Hugging Face, YouTube, Coursera…), and what the paid ones cost. Resources live in one library, can link to a goal, and show up where Ember's focus loop needs them: the focus bar, Focus mode, the goal page and, for renewals, Today.

**Success:**
- Pasting a link saves a resource in one step, with the company and type filled in.
- While focusing on a goal, its resources are one click away without leaving the timer.
- A paid renewal shows on Today three days before it is due.
- The Resources tab answers "what am I using, from whom, and what does it cost?"

**Out of scope:** currencies other than £, fetching page titles (no backend), tags, linking resources to steps, push or email reminders, tracking when a resource was opened, importing browser bookmarks.

## Decisions (from the conversation)

1. **Library, linked to goals.** One list with its own tab; each resource can link to one goal.
2. **Fields:** title, link, company, type, status, cost, notes.
3. **Company comes from the link**, editable, reusing the user's own spelling.
4. **After the design review:** focus bar and Focus mode list the goal's resources; renewals appear on Today; a Membership type covers its company's other resources; one-step add with guessed fields; company ledger instead of headers; goal page gets a one-line strip, not a section; an empty state; red only for the active tab, Add and renewals due within 7 days.

## Data (`src/core/model.ts`)

```ts
export type ResourceType = 'course' | 'video' | 'docs' | 'model' | 'article' | 'tool' | 'membership' | 'other'
export type ResourceStatus = 'using' | 'later' | 'finished' | 'dropped'
export type Billing = 'free' | 'once' | 'month' | 'year'

export interface Resource {
  id: string
  title: string
  url: string
  company: string
  type: ResourceType
  status: ResourceStatus
  goalId: string | null
  billing: Billing
  /** Pounds; null exactly when billing is 'free'. */
  price: number | null
  /** month/year only: a renewal date the user entered (later ones are derived from it). */
  renewsOn: ISODate | null
  /** The renewal date the user answered "Keep it" for, so that reminder stays dismissed. */
  keptFor?: ISODate | null
  notes: string
  createdAt: ISODate
  deletedOn?: ISODate | null
  updatedAt?: number
}
```

- `EmberData` and `SharedData` gain `resources: Resource[]`.
- **No `DATA_VERSION` bump.** A missing `resources` list loads as `[]` (local data, backups, the Drive file), so older files stay readable.
- `repairResource` (in `core/resources.ts`), used on load, restore and Drive read:
  - drops entries without a string `id` or `url`;
  - unknown `type` becomes `'other'`, unknown `status` becomes `'using'`, unknown `billing` becomes `'free'`;
  - a missing, non-numeric or non-positive `price` makes the resource free;
  - `renewsOn` is kept only for month/year billing with a valid date;
  - an empty `title` falls back to the link and an empty `company` to the detected one;
  - `notes` defaults to `''`.

## Derived values (`src/core/resources.ts`, pure)

- `liveResources(rs)`: not deleted.
- **Next renewal.** `nextRenewal(r, today)`: for month/year billing, the first date on or after today reached by stepping `renewsOn` forward by the billing period. Month steps keep the day, clamped to the month's last day. Nothing is written back, so sync sees no churn.
- **Monthly cost.** `monthlyCost(r)`: the price for monthly billing, the price ÷ 12 for yearly, else 0. Counted only while `status === 'using'`.
- **Covering membership.** `coveringMembership(r, rs)`: a live, in-use resource of type membership from the same company, when `r` is not itself recurring. The price column then shows "In ‹membership title›" instead of "Free".
- **Renewal reminder due.** `dueRenewals(rs, today)`: in-use, recurring, live resources whose next renewal is 0–3 days away and differs from `keptFor`.
- **Resources list.** `resourceList(rs, goals, { status, goalId }, today)` returns company groups:
  - **Group order:** the largest group first, then by name.
  - **Row order inside a group:** memberships first, then oldest first.
  - **Group fields:** name, resource count, and the monthly cost of its in-use memberships and subscriptions.
  - **Row fields:** price text, renewal text, and whether the renewal is within 7 days.
- **Money line.** `moneyLine(rs, today)` builds the one line under the title: *£65.25 a month on 3 subscriptions · Coursera Plus renews in 3 days*.
  - The renewal part is red when it is within 7 days. Otherwise it is grey: *next: Premium on Nov 2* (dates use the app's `dayLabel` format, "Oct 15", throughout).
  - The line is hidden when nothing has a recurring cost.
  - Wording: "subscriptions", because any type can recur. The mockup says "memberships"; the canvas will be updated to match.
- **A goal's resources.** `goalResources(rs, goalId)`: the in-use resources linked to a goal, oldest first.
- **Money format.** `£49` for whole pounds, `£9.99` otherwise; monthly equivalents are rounded to the penny when shown.

## Company and type from a link (`src/core/companies.ts`, pure)

- `normaliseUrl(text)`:
  - adds `https://` when the text looks like a domain without a scheme;
  - rejects anything that isn't http(s);
  - lowercases the host and strips `www.`, `utm_*` parameters and a trailing slash. The `#part` is kept (sites that route by `#/page` need it), and the query is kept as written; duplicate checks ignore the `#part`.
- `detect(url, existing)` returns `{ company, type, title }`:
  1. **Your own spelling first.** If a live resource has the same host, its `company` is used, so a rename sticks.
  2. **Known sites.** A table matched by host suffix: Hugging Face, YouTube (`youtube.com`, `youtu.be`), Coursera, Udemy, edX, GitHub, Kaggle, fast.ai, Observable, arXiv, Medium, Substack, Skillshare, Domestika, Frontend Masters, MDN, dev.to.
     - Each entry gives the company name and a default type.
     - Hugging Face also uses the path: `/learn` is a course, `/docs` is docs, `/spaces` is a tool, `/{org}/{model}` is a model.
     - Any `docs.` host gives type docs.
  3. **Anything else.** The company is the host without `www.`, and the type is article.
  4. **Title.** The last meaningful path segment, decoded, with `-` and `_` turned into spaces, in sentence case. Purely numeric or ID-like segments, and all YouTube links, give `''`.
- `findDuplicate(url, rs)`: compares normalised links of live resources in any status. YouTube links compare by video id.
- `companySuggestions(rs, typed)`: distinct companies of live resources that contain the typed text (case-insensitive), most used first.

## Store (`src/stores/ember.ts`)

- `resources` joins the persisted slice and the save watch. `snapshot`, `replaceData`, `applyShared` and `emptyData` carry it.
- **Adding.** `addResource(text, { goalId })`:
  - normalises the link, then checks for a duplicate;
  - returns `{ ok: false, reason: 'invalid' }`, or `{ ok: false, reason: 'duplicate', id }` for a link that's already saved;
  - otherwise creates the resource with the detected fields: status using, free, the given goal or none, today as `createdAt`;
  - returns `{ ok: true, id }`.
- **Editing.** `updateResource(id, patch)`:
  - switching billing to free clears `price` and `renewsOn`, and switching to once clears `renewsOn`;
  - a blank title falls back to the link.
- **Deleting.** `deleteResource(id)` is a soft delete through `softDelete`. `DeleteKey` gains `{ kind: 'resource'; id }`, so the existing undo bar works unchanged.
- **Reminder actions.** `keepRenewal(id)` sets `keptFor` to the current next renewal. `markCancelled(id)` sets status to dropped.
- **Goal choices** in the resource's goal dropdown follow the task rules: active and paused goals, plus the resource's current goal when it is achieved. A resource linked to a deleted goal shows no goal.

## Sync, backup, data deletion (`src/core/sync.ts`, `persist.ts`, `seed.ts`)

- `stampChanges` stamps changed or new resources like tasks.
- `mergeData` merges resources with `unionById(local, remote, newer)`.
- `sharedPart` and `withDeviceState` carry `resources`. All of it is shared; nothing is device-only.
- `readSyncFile` reads `d.resources` when it is an array (else `[]`) and repairs it. `syncSummary` adds "N resources" for live resources.
- **Older app versions.** An old app version that writes the Drive file without `resources` can't erase them: the next device on the new version keeps its local-only items through `unionById`, and its next sync writes them back.
- **Backups** include resources automatically. Restoring goes through `parseStored` → `normalize`, which repairs them.
- **Delete data** (here and everywhere) and `emptyData` reset resources to `[]`.
- **Demo seed** adds the 12 resources from the mockups, linked to the seed goals by index.

## UI

### Navigation and UI store
- `View` gains `'resources'`, and NavBar gets a fourth tab, Resources.
- UI store (not persisted):
  - `resourceStatus`: default `'using'`; also `'later' | 'finished' | 'dropped' | 'all'`.
  - `resourceGoal`: `'all' | 'none' | goalId`.
  - `highlight`: the row "Show it" points at. (The just-added card keeps its own state inside the add box.)
  - `fmResourcesOpen`.
- `ui.editing` accepts `resource:<id>`.
- `ui.escape()` closes the Focus mode resources panel before Focus mode itself.

### Resources tab (`components/resources/`)
- **`ResourcesView.vue`.** Shows the kicker "Library · N resources from M companies", the title, the money line, the add box, the filters and the list. Its column is limited to 1040px.
- **`ResourceAdd.vue`:**
  - **The box:** "Paste a link to add it" with an Add button. Enter or paste-then-Enter adds, using the goal filter as the goal when one goal is selected.
  - **Invalid link:** "That doesn't look like a link."
  - **Duplicate:** "Already saved: ‹title› · ‹company› · ‹status›" with **Show it**, which clears the filters and scrolls to and highlights the row. Add is disabled.
  - **The just-added card**, under the box:
    - "Added ‹host/path›";
    - a focused Title input;
    - buttons showing company, type, status, goal and cost, each of which opens the full edit panel for that resource;
    - **Done**, which closes the card, and **Undo**, which deletes the resource with the usual undo record.
  - **Company suggestions:** the edit panel's Company field offers `companySuggestions` through a native datalist (simpler and accessible; replaces the custom list in the mockup).
- **Filters.** A status segmented control (Using, Later, Finished, Dropped, All) with counts that respect the goal filter. Next to it, a goal dropdown with All goals, each live goal that has resources, and No goal.
- **`ResourceList.vue` (ledger).** One section per company, with a 2px rule between companies:
  - **Left column** (180–220px): the company name, plus "N resources · £X a month" when it has recurring costs.
  - **Right column:** rows separated by 1px rules.
  - **Phone:** the company column stacks above its rows.
- **`ResourceRow.vue`:**
  - the title links to the resource in a new tab (`rel="noopener"`), with no link icon;
  - the second line shows the type tag, the goal swatch and name, the status (only in All) and the notes;
  - the price column shows the price text, with a renewal line for recurring costs: red "Renews Oct 15 · in 3 days" within 7 days, grey "Renews Nov 2" otherwise, adding the year when it differs from this year;
  - the ⋯ menu (`RowMenu`) offers Edit and Delete.
- **`ResourceEditPanel.vue`** (inline, like `TaskEditPanel`):
  - **Fields:** title, link, company with suggestions, type as a select, goal as a select, status (segmented), cost as Free / One-off / Monthly / Yearly (segmented), price in £ (only when paid), Renews on (only for month and year), notes.
  - **Membership hint:** with type Membership, a note reads "While you're using it, your other ‹company› resources show as “In ‹title›”."
  - **Actions:** Save, Cancel, and Delete on the right.
  - Segmented controls use the existing `.seg` native-radio pattern.
- **Empty state:**
  - a larger add box;
  - the line "Keep the courses, videos, docs and models you learn from in one place, next to the goals they’re for.";
  - three numbered notes (company and type are filled in from the link; link a resource to a goal to have it one click away when focusing on that goal; Today warns before a membership renews).
  - The filters and money line are hidden until the first resource exists.

### Goal page (`components/goals/GoalResources.vue`)
- A strip joined to the bottom of the Readme box in `GoalSummary`:
  - the label **Using**, then each of `goalResources` as a link with its company in small grey text;
  - on the right, **All N** (every live resource linked to the goal), which opens the Resources tab filtered to the goal, and a **+** button.
- **+** turns the strip into an inline paste box, which adds through the same flow with this goal set and shows the just-added card under the strip.
- The strip is hidden when the goal has no live resources, except for the **+**, which stays visible.
- The goal sidebar is unchanged.

### Focus bar and Focus mode
- **The goal.** For a step, it's the step's goal. For a task, it's the task's `goalId` when that goal is live.
- **Focus bar** (`FocusBar.vue`): after the sub line, a link icon followed by up to 3 of that goal's in-use resources as links, then "+N" when there are more, which opens the Resources tab filtered to the goal. Nothing shows when the goal has none. On narrow screens: "N resources · ‹first title›".
- **Focus mode** (`FocusMode.vue`):
  - A book icon button sits at the end of the bottom-left panel, shown only when the goal has in-use resources. It toggles a panel above that panel, headed "‹goal› · resources".
  - Each row shows the title, then company, type and notes, with an external-link icon.
  - Links open in a new tab, and the timer keeps running.
  - The panel hides with the rest of the controls while idle, and Esc closes it first.

### Today and Upcoming
- **`RenewalCard.vue`** goes at the top of the Today list's rows, one per `dueRenewals` item:
  - **Line 1:** "‹title› renews ‹weekday›", or "today" or "tomorrow".
  - **Line 2:** "£X in N days", in red, then, for a membership only, "· Covers ‹up to 2 titles›(+N)" when it covers any of the company's other in-use resources.
  - **Actions:** **Keep it** (`keepRenewal`), **I've cancelled it** (`markCancelled`) and **Open ‹company›** (the resource's link).
  - **Styling:** the edit-panel frame, a 2px border in the text colour on the surface background. The only red is the amount line.
  - It doesn't count toward "N of M done" or the streak.
- **Upcoming** shows each in-use recurring resource's next renewal within its date range as a row that can't be ticked, with a renew icon, "‹title› renews" and "£X · ‹type›".

## Error handling

- **Invalid or non-http links:** they're never saved, and the add box shows the message instead.
- **Bad saved data:** malformed resources in saved data or a Drive file are repaired or dropped, never rejected; the rest of the data loads.
- **Missing records:** store actions on a missing or deleted resource do nothing.
- **Unusual renewal dates:** `nextRenewal` with a renewal date far in the past steps forward correctly, and end-of-month dates are clamped (31 Jan → 28/29 Feb → 31 Mar).

## Testing

- **`core/companies`:** URL normalisation; the known-site table and Hugging Face path rules; the unknown-host fallback; your own spelling winning; title from the slug and empty for IDs and YouTube; duplicates, including YouTube ids; suggestions.
- **`core/resources`:** repair cases; `nextRenewal` (stepping and clamping); `monthlyCost`; `coveringMembership`; `dueRenewals`, including `keptFor` and the 0–3 day window; `resourceList` grouping, order, counts and texts; `moneyLine` variants; `goalResources`.
- **Store:** add (invalid, duplicate, goal from filter); the billing-switch clearing rules; soft delete and undo; `keepRenewal`; `markCancelled`; goal dropdown contents.
- **Sync and persistence:** stamping; merge newer-wins; a missing `resources` list loads as `[]` from local data, backups and the Drive file; the old-client round trip keeps resources; `syncSummary`; `emptyData` and the seed.
- **Components:** the tab and its filters; the ledger; rows (price, renewal, membership cover); the add box (just-added card, duplicate, invalid); the edit panel; the empty state; the goal strip and its inline add; focus bar links and "+N"; Focus mode panel toggle and Esc; the renewal card's actions; the Upcoming renewal row.
- **Browser check** after implementation: Resources tab at desktop and phone widths, Today with a due renewal, and Focus mode.
