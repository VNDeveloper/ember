# Ember — sync across devices with Google Drive: design

Date: 2026-10-05 · Status: approved in conversation, awaiting written-spec review

## Purpose

Use Ember on a Mac and an Android phone with the same tasks, goals and focus history. Ember stays local-first: it works fully offline and signed out, and sync catches devices up whenever it can.

**Success:**
- An edit on one device appears on the other the next time that device syncs: on open, on returning to the app, or within about a minute while it's open.
- Offline edits on both devices both survive.
- History never shrinks.
- Restoring a backup deliberately replaces the data everywhere.

**Out of scope (for now):**
- Shared timer and live updates. The design must keep both easy to add; see "Built for live updates and a shared timer later".
- Syncing sound on/off.
- Any server.
- iPhone.

## Decisions (from the conversation)

1. **Devices:** Mac plus Android phone, used one at a time.
2. **Timer is per device.** Each device has its own timer and selection. Finished sessions sync as soon as they're logged.
3. **Storage: one file in Google Drive's hidden app folder,** not Firebase or Supabase. The data stays in the user's own Drive, with no extra service. The trade-off is accepted: a "Reconnect" tap about every hour of use, and polling instead of live updates.
4. **Hosting: GitHub Pages** (public repo), with Ember installable as a PWA.
5. **Later-proofing:** implement so that live updates and a shared timer can be added later without rewriting the merge, the stamping or the UI.

## What syncs

| Shared (in Drive) | Per device (never sent) |
|---|---|
| goals (with milestones and steps), tasks, focus logs | timer, selection |
| settings: `session`, `showFuture`, `wallWeeks`, `focusBg`, `youtubeUrl` | settings: `muted`, `demo` |

The per-device list is one declared constant (`DEVICE_ONLY`) in `core/sync.ts`, and nothing else hard-codes it.

## Data changes

- `Task`, `Goal`, `Milestone` and `Step` gain optional `updatedAt?: number` (epoch ms).
- `Settings` gains `updatedAt?: number` for the shared part.
- The timer and selection are stamped too, under `deviceUpdatedAt` in the local data, so a shared timer can use them later.
- The fields are optional, so existing saved data, backups and seed data load unchanged. A missing `updatedAt` counts as 0 (oldest).
- **Focus-log IDs become `focus-<endsAt>`** for new logs. `endsAt` is the wall-clock end of the run, so two devices that both log the same run would produce the same ID. Existing UUID log IDs stay as they are.
- **Stamping is automatic and central.** On every save the store compares the previous saved state with the new one. `stampChanges(before, after, now)` sets `updatedAt = now` on each task, goal, milestone, step and settings object whose content (ignoring `updatedAt`) changed. No store action is edited for this.
- **Data that arrives from outside is saved without stamping.** That covers sync results and another tab's save, via `replaceData(d, { stamp: false })`. This prevents an echo loop.

## Merge rules (`mergeData(local, remote)`, pure)

- **Records** are matched by ID at each level: goals, milestones inside a goal, steps inside a milestone, tasks, logs.
- **Present on one side only:** kept.
- **Present on both sides:** the one with the higher `updatedAt` wins. On a tie, the local copy wins, so the result is deterministic.
- **Goals:** the goal's own fields come from the newer goal. Its milestones are then merged by ID, and each milestone's steps by ID, so a step ticked on one device and a step added on another both survive. Order: the newer goal's order, with items only on the other side appended in their original order.
- **Logs:** union by ID. Logs are never edited.
- **Settings:** the shared fields of the newer `settings` win as a whole. Per-device fields always stay local.
- **Deletes** are soft (`deletedOn`), so they're ordinary newer edits and merge like any other change.
- **Commutative and idempotent:** merging the same data twice, or in either order, gives the same result. So if two near-simultaneous uploads overwrite each other, the next sync from the overwritten device heals the file.

## Generations: deliberate replacement

- The Drive file carries `generation` (a UUID). Each device remembers the last generation it synced with.
- **A new generation is started (with a new UUID) by:**
  - restoring a backup while connected
  - choosing "Replace Drive with this device's data"
- **A device that downloads a file whose generation differs from its remembered one replaces its shared data with the file's.** It keeps a safety copy first (the existing `ember:v1:before-restore` mechanism), keeps its per-device state, and adopts the generation. It doesn't merge.

## Sync file

- **Name and place:** `ember-data.json` in Drive's `appDataFolder`.
- **Content:** the backup format plus two fields: `{ app: 'ember', version, exportedAt, generation, data }`. `data` is the shared part only.
- **Reading:** validated with the same checks as `readBackup`.
- **An unreadable file is never overwritten automatically.**

## Architecture

### Pure core: `src/core/sync.ts` (no network, unit-tested)
- `DEVICE_ONLY`: the declared per-device fields.
- `sharedPart(data)` / `withDeviceState(shared, local)`: split the data, and re-attach a device's per-device parts.
- `stampChanges(before, after, now)`.
- `mergeData(local, remote)`.
- `makeSyncFile(shared, generation, now)` / `readSyncFile(text)`.

### Storage interface: `src/sync/backend.ts`
```ts
interface SyncBackend {
  connect(interactive: boolean): Promise<'ok' | 'needs-user' | 'denied'>
  disconnect(): Promise<void>
  pull(): Promise<{ text: string } | null>       // null = no file yet
  push(text: string): Promise<void>
  subscribe?(onRemoteChange: () => void): () => void   // live backends only; Drive omits it
}
```

### Google Drive backend: `src/sync/drive.ts`
- **Requests:** plain `fetch` to the Drive v3 REST API, with no SDK.
- **Sign-in:** Google Identity Services token client with scope `https://www.googleapis.com/auth/drive.appdata` only.
- **Access token:** kept in localStorage with its expiry, and reused until it expires.
- **When the token expires:** renewal requires a user gesture (browsers block sign-in pop-ups otherwise), so `connect(false)` returns `needs-user`.

### Sync controller: `src/stores/sync.ts` (Pinia `useSyncStore`)

**Talks to the backend only through the interface. State:**
- `status`: `'unconfigured' | 'signed-out' | 'syncing' | 'synced' | 'offline' | 'needs-reconnect' | 'error' | 'unreadable'`
- `lastSyncedAt`
- `generation`

**A sync, run one at a time:**
1. Pull the file.
2. If there's no file, upload this device's shared data with a new generation.
3. If the generation is new, replace (with a safety copy) as described under "Generations".
4. Otherwise merge.
5. Apply the result to the store with `{ stamp: false }`.
6. Push the result if it differs from what was pulled.
7. Record the time and generation.

A change made during a sync queues one more sync.

**When it syncs:**
- on start
- when the page becomes visible
- 5 seconds after the last local change
- every 60 seconds while visible
- on the `online` event
- on "Sync now"

If the backend has `subscribe`, it is used instead of the 60-second poll. This is the hook live updates will use later.

**Retries after errors:** 1 minute, then 5 minutes, then 15 minutes.

**Configuration:** the controller is inert (`unconfigured`) when `import.meta.env.VITE_GOOGLE_CLIENT_ID` is empty.

**Persisted sync state** (localStorage `ember:sync`, per device): connected flag, last generation, last synced time. The token is stored separately with its expiry.

### First connection on a device
- **Drive has no file:** upload this device's data (new generation). Done.
- **Drive has a file:** show a confirm panel in the Data menu with a summary of the file ("3 goals · 24 tasks · 412 focus sessions, last synced Oct 5"). Choices:
  - **Use Drive's data here** (primary). It replaces this device's shared data with a safety copy, and adopts the generation.
  - **Replace Drive with this device's data.** Starts a new generation.
  - **Cancel.** Disconnects.

## UI

### Data menu: a "Sync" block above Back up
Hidden when the controller is `unconfigured`.

**Signed out:**
- The note: "Keep Ember in step across your devices using your Google Drive."
- A **Connect Google Drive** button (secondary).

**Connected:** a status line plus actions.

| Status | Text | Actions |
|---|---|---|
| synced | "Synced · just now" / "Synced · 3 min ago" | Sync now · Disconnect |
| syncing | "Syncing…" | Disconnect |
| offline | "Offline · will sync when you're back" | Disconnect |
| needs-reconnect | "Sign-in expired" | **Reconnect** (primary) · Disconnect |
| error | "Couldn't sync" | **Try again** · Disconnect |
| unreadable | "The file in Drive couldn't be read" | **Replace Drive with this device's data** · Disconnect |

**Disconnect:** forgets the token and stops syncing. It keeps local data and the Drive file.

### Nav
- While status is `needs-reconnect`, `error` or `unreadable`, an 8×8 accent square shows beside "Data".
- The toggle's accessible name then reads "Data, sync needs attention".
- Otherwise the toggle is unchanged.

### Restore while connected
- The confirm text adds: "This also replaces the data on your other devices."
- Restoring starts a new generation and syncs.

### Visual rules
- The existing tokens and the Data menu's look.
- No new colours.
- The accent is used only for the attention square and primary buttons.

## Hosting and install (PWA)

**GitHub Pages:**
- A public repo.
- An Actions workflow on push to `main`: install, then test, then build, then deploy to Pages.
- Vite `base: '/ember/'`.
- `VITE_GOOGLE_CLIENT_ID` comes from a repository variable.

**`vite-plugin-pwa`:**
- **Manifest:**
  - name "Ember"
  - `display: standalone`
  - `background_color #201e1d`
  - `theme_color #ec3013`
  - icons at 192, 512 and 512-maskable, plus a 180 apple-touch icon
- **Precache:** the built app.
- **Runtime cache:**
  - Google Fonts: stylesheet stale-while-revalidate; font files cache-first.
  - Google sign-in script and Drive API calls: never cached.

**Icons:** one SVG source, a square `#ec3013` tile with a block-built "E" in `#f3f2f2`, made into the PNG sizes with `@vite-pwa/assets-generator`.

**Update bar:**
- Uses the undo-bar style.
- Text: "A new version of Ember is ready" plus **Reload** and ×.
- Never reloads by itself.
- The dev server registers no service worker.

**Offline:** Focus mode's YouTube video needs the network. Offline, it falls back to the plain ground, as today.

## One-time setup by the user (documented in README)

1. Create the GitHub repo, push, and enable Pages using the "GitHub Actions" source.
2. In Google Cloud Console:
   - Create a project.
   - Enable the Drive API.
   - Set up the OAuth consent screen: External, Testing, with the user as the only test user.
   - Create an OAuth client of type "Web application", with authorised JavaScript origins `https://<user>.github.io` and `http://localhost:5199`.
3. Set the repo variable `VITE_GOOGLE_CLIENT_ID`, and the same value in a local `.env.local`.
4. **Optional:** publish the consent screen to production, so Google stops asking for a fresh sign-in every 7 days. `drive.appdata` doesn't require Google's review.

**Moving existing data across:**
1. Connect in the dev app at localhost:5199. Drive is empty, so its data uploads.
2. On each other device, connect and choose "Use Drive's data here".

## Built for live updates and a shared timer later

- **Live updates:** add a backend that implements `subscribe`, such as Firestore. The controller already prefers `subscribe` to polling. Merging, stamping, generations and the UI don't change.
- **Shared timer:**
  - Remove `timer` and `selection` from `DEVICE_ONLY`.
  - Add a merge rule: the newer `deviceUpdatedAt` wins.
  - Logs are already deduplicated by their `focus-<endsAt>` IDs.
- **Record-based merge:** `mergeData` works on ID-plus-`updatedAt` records, not on the Drive file's shape. So a per-record document store can reuse it.

## Accessibility

- Status changes are announced politely: the status line is `role="status"`.
- Every button has a visible label.
- The first-connection panel moves focus to its primary button, and Esc cancels it.
- The nav attention square has a text equivalent.

## Testing (TDD)

- **Core:**
  - `stampChanges`: per level, and ignores `updatedAt`-only differences.
  - `mergeData`:
    - one side only
    - newer wins
    - tie goes to local
    - a step ticked here and a step added there both survive
    - soft delete wins when newer
    - logs union
    - settings shared and per-device fields
    - commutative and idempotent
    - the "heals itself" scenario
  - Sync file round trip and rejecting bad files.
  - `focus-<endsAt>` log IDs.
- **Store:**
  - Saving stamps.
  - `replaceData(..., { stamp: false })` doesn't stamp.
  - Another tab's data isn't stamped.
  - Restore while connected starts a new generation.
- **Controller:** against a fake backend implementing `SyncBackend`:
  - first connection with an empty Drive, and with an existing file (both choices and cancel)
  - merge and upload
  - a new generation replaces with a safety copy
  - offline
  - needs-reconnect
  - errors with the retry schedule
  - an unreadable file is never overwritten
  - a change made during a sync queues another
  - the triggers (visibility, debounce, interval, online)
  - `subscribe` is used when present
- **Components:**
  - Sync block per status.
  - First-connection panel.
  - Nav attention square and its label.
  - Update bar.
  - Restore wording when connected.
- **Real check:**
  - Two Chrome profiles against the user's real Drive:
    - edit on one, see it on the other
    - offline edits on both, then reconnect
    - restore starts a new generation everywhere
    - Reconnect after the token expires (simulated)
  - The hosted app is installable on the Mac and on Android.
  - It opens offline.
