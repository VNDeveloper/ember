# Ember — Google Drive sync, hosting and install Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync Ember's tasks, goals, focus history and shared settings between a Mac and an Android phone through one file in the user's Google Drive app folder, host Ember on GitHub Pages, and make it installable and usable offline.

**Architecture:**
- **localStorage stays the source of truth.** The store stamps `updatedAt` on whatever changed whenever it saves.
- **Pure merge logic in `src/core/sync.ts`.** It merges records by ID, and the newer `updatedAt` wins.
- **The sync controller talks only to a `SyncBackend` interface.** It has `pull`, `push` and an optional `subscribe`. Google Drive implements it over plain `fetch` with Google Identity Services sign-in, and a fake implements it for tests.
- **A `generation` ID in the Drive file** lets a restore deliberately replace the data everywhere.
- **`vite-plugin-pwa`** adds the manifest, offline caching and an update prompt. A GitHub Actions workflow deploys to Pages.

**Tech Stack:**
- Already in use: Vite 8, Vue 3.5, TypeScript ~6.0.3, Pinia 4, Vitest 5 + jsdom + @vue/test-utils, lucide-vue-next.
- New: `vite-plugin-pwa` 2 (+ `workbox-window`), `@vite-pwa/assets-generator` 2 (dev), and the Google Identity Services script (loaded at runtime from Google, not an npm package).

**Spec:** `docs/superpowers/specs/2026-10-05-ember-drive-sync-design.md`

## Notes on the spec (rulings made while planning)

1. **Ties break on content, not "local wins".** The spec says "On a tie, the local copy wins", but it also requires the merge to be commutative, and "local wins" isn't. Equal `updatedAt` values are broken by comparing the two copies' canonical JSON, so every device picks the same winner.
2. **Order: the Drive file's order first, then local-only items.** This replaces "the newer goal's order". The file is the hub, so every device converges on one order. That keeps goal colours (index among all goals) identical everywhere.
3. **`replaceData` always resets the stamping baseline.** This replaces a `{ stamp: false }` option. Every caller of `replaceData` brings data from outside (another tab, restore, sync, tests), so none of them should stamp.
4. **Two additions to the controller:**
   - A `'choose'` status for the first-connection panel.
   - A saved `newGeneration` flag, so a restore whose upload failed is pushed on the next sync instead of being replaced by the old Drive data.
5. **`base` comes from `BASE_PATH`.** CI sets `/<repo>/`. Local dev, preview and tests use `/`.
6. **The update bar sits bottom-right on wide screens** (full width on phones), so it never covers the undo bar.
7. **Esc on the first-connection panel closes the Data menu, which cancels the choice.** This is the spec's "Esc cancels", done through the existing Esc order.

## Global Constraints

- **Visual rules:**
  - Zero border radius; 2px rules between major sections, 1px between list rows.
  - Button labels flush left.
  - Accent used sparingly: only the nav attention square and primary buttons.
  - No gradients, emoji or shadows (the picker dialog and Focus mode exceptions stay as they are).
  - No new colours.
- **`src/core/` stays pure:** no `vue`, `pinia` or network imports.
- **Google scope:** only `https://www.googleapis.com/auth/drive.appdata`.
- **Drive file:** `ember-data.json` in `appDataFolder`.
- **Sync file shape:** `{ app: 'ember', version: 1, exportedAt, generation, data }`. `data` holds the shared part only.
- **Per device (never sent):** `timer`, `selection`, `deviceUpdatedAt`, `settings.muted`, `settings.demo`. They are declared once, in `DEVICE_ONLY`.
- **Storage keys:**
  - `ember:v1` (data, unchanged)
  - `ember:sync` (controller state)
  - `ember:sync:token` (access token + expiry)
  - `ember:v1:before-restore` (safety copy, reused)
- **New focus-log IDs:** `focus-<endsAt>`.
- **Trigger timings:**
  - Sync 5 s after the last local change.
  - Poll every 60 s while visible.
  - Error retries after 1 min, then 5 min, then 15 min.
- **Copy, verbatim:**
  - "Keep Ember in step across your devices using your Google Drive."
  - "Connect Google Drive"
  - "Synced · just now"
  - "Synced · 3 min ago"
  - "Syncing…"
  - "Offline · will sync when you're back"
  - "Sign-in expired"
  - "Reconnect"
  - "Couldn't sync"
  - "Try again"
  - "The file in Drive couldn't be read"
  - "Replace Drive with this device's data"
  - "Use Drive's data here"
  - "Sync now"
  - "Disconnect"
  - "This also replaces the data on your other devices."
  - "Data, sync needs attention"
  - "A new version of Ember is ready"
  - "Reload"
- **Manifest:**
  - `name: 'Ember'`
  - `display: 'standalone'`
  - `background_color: '#201e1d'`
  - `theme_color: '#ec3013'`
- **No sync UI without a client ID:** when `VITE_GOOGLE_CLIENT_ID` is empty, the sync UI is hidden and the controller is `'unconfigured'`.
- **Commands:**
  - `npm test` (Vitest)
  - `npm run typecheck`
  - `npm run build` (vue-tsc + vite build)

## Review Focus

1. **Clock skew between devices.** A phone whose clock runs minutes behind loses ties it should win. Expected: the merge never crashes, and newer-by-clock wins consistently. Pinned in Task 3 ("a later stamp wins even when its device's clock is behind on other items").
2. **A local edit made while an upload is in flight.** Expected: it isn't lost, and the next sync sends it. Pinned in Task 7.
3. **The selected task or step is deleted on the other device.** Expected: after sync this device's selection clears, and a running timer keeps running. Pinned in Task 5.
4. **Goals created on both devices.** Expected: once both have synced, both show the goals in the same order, so the colours match. Pinned in Task 3.
5. **The sign-in pass expires between pull and push.** Expected: status becomes "Sign-in expired", local data is intact, and the next sync after Reconnect uploads. Pinned in Task 6.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/core/model.ts` (modify) | optional `updatedAt` on Task/Step/Milestone/Goal/Settings, `deviceUpdatedAt` on EmberData |
| `src/core/sync.ts` (create) | `DEVICE_ONLY`, `sharedPart`, `withDeviceState`, `canonical`, `stampChanges`, `mergeData`, `makeSyncFile`, `readSyncFile`, `syncSummary`, `syncedAgo` |
| `src/stores/ember.ts` (modify) | stamp on save, baseline reset in `replaceData`, `applyShared`, `focus-<endsAt>` log IDs |
| `src/sync/backend.ts` (create) | `SyncBackend` interface, `SyncAuthError`, `SyncOfflineError` |
| `src/sync/test-backend.ts` (create) | `FakeBackend` for tests |
| `src/sync/drive.ts` (create) | Google Drive backend (GIS token client + Drive REST) |
| `src/stores/sync.ts` (create) | `useSyncStore`: status, runs, first connection, generations, retries, triggers |
| `src/components/SyncBlock.vue` (create) | the Sync block in the Data menu |
| `src/components/DataMenu.vue` (modify) | hosts SyncBlock, attention square, restore wording, `afterRestore` |
| `src/App.vue` (modify) | `sync.start()` / `sync.stop()`, UpdateBar |
| `src/pwa/options.ts` (create) | `pwaOptions` (manifest, workbox) |
| `src/pwa/register.ts` (create) | `useAppUpdate()` wrapper over `virtual:pwa-register/vue` |
| `src/components/UpdateBar.vue` (create) | "A new version of Ember is ready" bar |
| `src/env.d.ts` (create) | `VITE_GOOGLE_CLIENT_ID` typing, PWA virtual-module types |
| `vite.config.ts`, `index.html`, `tsconfig.app.json`, `package.json`, `.gitignore` (modify) | PWA plugin, base path, icons, test env |
| `public/icon.svg` + generated PNGs, `pwa-assets.config.ts` (create) | icons |
| `.github/workflows/deploy.yml`, `README.md`, `.env.example` (create) | deploy and setup docs |
| `docs/design/build-report.md` (modify) | report |

---

### Task 1: Data fields and run-based focus-log IDs

**Files:**
- Modify: `src/core/model.ts`
- Modify: `src/stores/ember.ts` (`finishPhase`)
- Test: `src/stores/ember.test.ts`

**Interfaces:**
- Produces:
  - `Task.updatedAt?`, `Step.updatedAt?`, `Milestone.updatedAt?`, `Goal.updatedAt?`, `Settings.updatedAt?` (all `number`)
  - `EmberData.deviceUpdatedAt?: number`
  - Logs created by a finished focus phase have `id === \`focus-${endsAt}\``

- [ ] **Step 1: Write the failing test** in `src/stores/ember.test.ts`, inside the existing `describe` that holds "logs 50 minutes with the 50/10 setting":

```ts
  it('names a finished session after its end time, so two devices log the same run once', () => {
    const store = storeWith()
    store.startPause()
    const endsAt = store.timer.endsAt!
    store.tick(NOW + 25 * MIN)
    expect(store.logs).toHaveLength(1)
    expect(store.logs[0].id).toBe(`focus-${endsAt}`)
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/stores/ember.test.ts -t "names a finished session"`
Expected: FAIL. The ID is a UUID, not `focus-…`.

- [ ] **Step 3: Implement.** In `src/stores/ember.ts`, inside `finishPhase`, replace `id: uid(),` in the `logs.value.push({` call with:

```ts
      // The run's end time names the session, so devices that both log it produce one record.
      id: `focus-${at}`,
```

In `src/core/model.ts`, add the optional fields:

```ts
/** deletedOn (soft delete): hidden from live views, kept for history. updatedAt: last edit (sync merge). */
export interface Step { id: string; title: string; doneOn: ISODate | null; estMin: number; deletedOn?: ISODate | null; updatedAt?: number }
export interface Milestone { id: string; title: string; steps: Step[]; deletedOn?: ISODate | null; updatedAt?: number }
export interface Goal { id: string; title: string; outcome: string; milestones: Milestone[]; createdAt: ISODate; deletedOn?: ISODate | null; updatedAt?: number }
```

In `Task`, after `deletedOn?: ISODate | null`, add:

```ts
  /** Last edit, epoch ms (sync merge: newer wins). Missing = oldest. */
  updatedAt?: number
```

In `Settings`, after `muted: boolean`, add:

```ts
  /** Last change to the shared settings (not muted/demo), epoch ms. */
  updatedAt?: number
```

In `EmberData`, after `settings: Settings`, add:

```ts
  /** Last change to this device's timer or selection, epoch ms (for a shared timer later). */
  deviceUpdatedAt?: number
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run src/stores/ember.test.ts && npm run typecheck`
Expected: PASS, no type errors. If `uid` is now unused in `ember.ts`, the typecheck fails with "declared but never read". `uid` is still used for new tasks, steps, milestones and goals, so expect no error.

- [ ] **Step 5: Commit**

```bash
git add src/core/model.ts src/stores/ember.ts src/stores/ember.test.ts
git commit -m "feat: updatedAt fields for sync; name focus logs after their end time"
```

---

### Task 2: Shared vs per-device data, and change stamping

**Files:**
- Create: `src/core/sync.ts`
- Test: `src/core/sync.test.ts`

**Interfaces:**
- Consumes: the Task 1 fields.
- Produces:
  - `DEVICE_ONLY: { data: readonly ['timer', 'selection', 'deviceUpdatedAt']; settings: readonly ['muted', 'demo'] }`
  - `type SharedSettings = Omit<Settings, 'muted' | 'demo'>`
  - `interface SharedData { goals: Goal[]; tasks: Task[]; logs: FocusLog[]; settings: SharedSettings }`
  - `sharedPart(d: EmberData): SharedData`
  - `withDeviceState(shared: SharedData, local: EmberData): EmberData`
  - `canonical(x: unknown): string` (JSON with sorted object keys, `undefined` dropped)
  - `stampChanges(before: EmberData, after: EmberData, now: number): number` (mutates `after`, returns the count of shared records stamped)

- [ ] **Step 1: Write the failing tests** in `src/core/sync.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEVICE_ONLY, canonical, sharedPart, stampChanges, withDeviceState } from './sync'
import { dataFixture, goalFixture, taskFixture } from './test-fixtures'

const T = 1_800_000_000_000
const clone = <X>(x: X): X => JSON.parse(JSON.stringify(x))

describe('shared and per-device parts', () => {
  it('declares the timer, selection, sound and demo speed as per device', () => {
    expect(DEVICE_ONLY).toEqual({ data: ['timer', 'selection', 'deviceUpdatedAt'], settings: ['muted', 'demo'] })
  })

  it('leaves per-device state out of the shared part', () => {
    const d = dataFixture({ tasks: [taskFixture('A')], selection: { kind: 'task', taskId: 'A' }, deviceUpdatedAt: 5 })
    const s = sharedPart(d)
    expect(Object.keys(s).sort()).toEqual(['goals', 'logs', 'settings', 'tasks'])
    expect(s.settings).not.toHaveProperty('muted')
    expect(s.settings).not.toHaveProperty('demo')
    expect(s.settings.session).toBe('25/5')
    expect(s.tasks.map((t) => t.id)).toEqual(['A'])
  })

  it("re-attaches this device's state to shared data", () => {
    const base = dataFixture().settings
    const local = dataFixture({ selection: { kind: 'task', taskId: 'A' }, deviceUpdatedAt: 7, settings: { ...base, muted: false, demo: true } })
    const remote = sharedPart(dataFixture({ tasks: [taskFixture('B')], settings: { ...base, session: '50/10', muted: true, demo: false } }))
    const d = withDeviceState(remote, local)
    expect(d.tasks.map((t) => t.id)).toEqual(['B'])
    expect(d.selection).toEqual({ kind: 'task', taskId: 'A' })
    expect(d.timer).toBe(local.timer)
    expect(d.deviceUpdatedAt).toBe(7)
    expect(d.settings).toMatchObject({ session: '50/10', muted: false, demo: true })
  })
})

describe('canonical', () => {
  it('ignores key order and undefined values', () => {
    expect(canonical({ b: 1, a: { d: undefined, c: [2, 1] } })).toBe(canonical({ a: { c: [2, 1] }, b: 1 }))
    expect(canonical({ a: null })).not.toBe(canonical({}))
  })
})

describe('stampChanges', () => {
  const before = () => dataFixture({
    goals: [goalFixture('D3', [['Charts', [['Bar', null], ['Line', null]]]])],
    tasks: [taskFixture('A'), taskFixture('B')],
  })

  it('stamps new and changed items at every level, and nothing else', () => {
    const b = before()
    const a = clone(b)
    a.tasks[0].title = 'A2'
    a.tasks.push(taskFixture('C'))
    a.goals[0].milestones[0].steps[1].doneOn = '2026-09-23'
    expect(stampChanges(b, a, T)).toBe(3)
    expect(a.tasks.map((t) => t.updatedAt)).toEqual([T, undefined, T])
    const g = a.goals[0]
    expect(g.updatedAt).toBeUndefined()
    expect(g.milestones[0].updatedAt).toBeUndefined()
    expect(g.milestones[0].steps.map((s) => s.updatedAt)).toEqual([undefined, T])
  })

  it('stamps a goal or milestone for its own fields only', () => {
    const b = before()
    const a = clone(b)
    a.goals[0].milestones[0].title = 'First charts'
    expect(stampChanges(b, a, T)).toBe(1)
    expect([a.goals[0].updatedAt, a.goals[0].milestones[0].updatedAt]).toEqual([undefined, T])
    const c = clone(b)
    c.goals[0].title = 'Learn D3'
    expect(stampChanges(b, c, T)).toBe(1)
    expect([c.goals[0].updatedAt, c.goals[0].milestones[0].updatedAt]).toEqual([T, undefined])
  })

  it('treats an undo (deletedOn back to null) as an edit', () => {
    const b = before()
    const a = clone(b)
    a.tasks[0].deletedOn = null
    expect(stampChanges(b, a, T)).toBe(1)
  })

  it('ignores a difference in updatedAt alone', () => {
    const b = dataFixture({ tasks: [taskFixture('A', { updatedAt: 1 })] })
    const a = clone(b)
    a.tasks[0].updatedAt = 2
    expect(stampChanges(b, a, T)).toBe(0)
    expect(a.tasks[0].updatedAt).toBe(2)
  })

  it('stamps shared settings, but not sound or demo speed', () => {
    const b = dataFixture()
    const a = clone(b)
    a.settings.muted = false
    a.settings.demo = true
    expect(stampChanges(b, a, T)).toBe(0)
    expect(a.settings.updatedAt).toBeUndefined()
    a.settings.wallWeeks = 8
    expect(stampChanges(b, a, T)).toBe(1)
    expect(a.settings.updatedAt).toBe(T)
  })

  it("stamps this device's timer and selection separately, without counting them", () => {
    const b = dataFixture()
    const a = clone(b)
    a.selection = { kind: 'task', taskId: 'A' }
    expect(stampChanges(b, a, T)).toBe(0)
    expect(a.deviceUpdatedAt).toBe(T)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/core/sync.test.ts`
Expected: FAIL with `Failed to resolve import "./sync"`.

- [ ] **Step 3: Implement** `src/core/sync.ts`:

```ts
import type { EmberData, FocusLog, Goal, Settings, Task } from './model'

/** What never leaves this device. Moving timer/selection to shared later = removing them here (+ a merge rule). */
export const DEVICE_ONLY = {
  data: ['timer', 'selection', 'deviceUpdatedAt'],
  settings: ['muted', 'demo'],
} as const

type DeviceSettingKey = (typeof DEVICE_ONLY.settings)[number]
export type SharedSettings = Omit<Settings, DeviceSettingKey>
export interface SharedData { goals: Goal[]; tasks: Task[]; logs: FocusLog[]; settings: SharedSettings }

const without = (x: object, keys: readonly string[]): Record<string, unknown> =>
  Object.fromEntries(Object.entries(x).filter(([k]) => !keys.includes(k)))

export function sharedSettings(s: Settings | SharedSettings): SharedSettings {
  return without(s, DEVICE_ONLY.settings) as SharedSettings
}

export function sharedPart(d: EmberData): SharedData {
  return { goals: d.goals, tasks: d.tasks, logs: d.logs, settings: sharedSettings(d.settings) }
}

/** Shared data plus this device's own timer, selection, sound and demo speed. */
export function withDeviceState(shared: SharedData, local: EmberData): EmberData {
  const settings = { ...shared.settings } as Settings
  for (const k of DEVICE_ONLY.settings) (settings as unknown as Record<string, unknown>)[k] = local.settings[k]
  const out = { goals: shared.goals, tasks: shared.tasks, logs: shared.logs, settings } as EmberData
  for (const k of DEVICE_ONLY.data) (out as unknown as Record<string, unknown>)[k] = local[k]
  return out
}

/** JSON with object keys sorted (and undefined dropped), so equal content gives equal strings. */
export function canonical(x: unknown): string {
  return JSON.stringify(x, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  )
}

/** An item's own content: without its stamp and without its child list. */
const own = (x: object, child?: string): string => canonical(without(x, child ? ['updatedAt', child] : ['updatedAt']))
const changed = (prev: object | undefined, next: object, child?: string): boolean => !prev || own(prev, child) !== own(next, child)

/**
 * Sets updatedAt = now on every task, goal, milestone, step and shared-settings object in `after`
 * whose own content differs from `before` (new items included). Stamps deviceUpdatedAt when the
 * timer or selection changed. Mutates `after`; returns how many shared records were stamped.
 */
export function stampChanges(before: EmberData, after: EmberData, now: number): number {
  let n = 0
  const tasks = new Map(before.tasks.map((t) => [t.id, t]))
  for (const t of after.tasks) {
    if (changed(tasks.get(t.id), t)) { t.updatedAt = now; n++ }
  }
  const goals = new Map(before.goals.map((g) => [g.id, g]))
  for (const g of after.goals) {
    const pg = goals.get(g.id)
    if (changed(pg, g, 'milestones')) { g.updatedAt = now; n++ }
    const mss = new Map((pg?.milestones ?? []).map((m) => [m.id, m]))
    for (const m of g.milestones) {
      const pm = mss.get(m.id)
      if (changed(pm, m, 'steps')) { m.updatedAt = now; n++ }
      const steps = new Map((pm?.steps ?? []).map((s) => [s.id, s]))
      for (const s of m.steps) {
        if (changed(steps.get(s.id), s)) { s.updatedAt = now; n++ }
      }
    }
  }
  if (own(sharedSettings(before.settings)) !== own(sharedSettings(after.settings))) { after.settings.updatedAt = now; n++ }
  if (canonical([before.timer, before.selection]) !== canonical([after.timer, after.selection])) after.deviceUpdatedAt = now
  return n
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/core/sync.test.ts && npm run typecheck`
Expected: PASS (all 10 tests), and the typecheck is clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/sync.ts src/core/sync.test.ts
git commit -m "feat: split shared and per-device data; stamp changed records"
```

---

### Task 3: Merge

**Files:**
- Modify: `src/core/sync.ts`
- Test: `src/core/sync.test.ts`

**Interfaces:**
- Consumes: `SharedData`, `canonical` (Task 2).
- Produces: `mergeData(local: SharedData, remote: SharedData): SharedData`. This is the order rule from "Notes on the spec" 2, and the content tie-break from note 1.

- [ ] **Step 1: Write the failing tests.** Append to `src/core/sync.test.ts`. Extend its first import to `import { DEVICE_ONLY, canonical, mergeData, sharedPart, stampChanges, withDeviceState } from './sync'` and add `import type { EmberData } from './model'`:

```ts
const shared = (patch: Partial<EmberData> = {}) => sharedPart(dataFixture(patch))
const ids = (xs: { id: string }[]) => xs.map((x) => x.id)

describe('mergeData', () => {
  it('keeps items that exist on one side only, Drive order first', () => {
    const m = mergeData(shared({ tasks: [taskFixture('A')] }), shared({ tasks: [taskFixture('B')] }))
    expect(ids(m.tasks)).toEqual(['B', 'A'])
  })

  it('picks the newer copy of an item on both sides', () => {
    const local = shared({ tasks: [taskFixture('A', { title: 'old', updatedAt: 1 })] })
    const remote = shared({ tasks: [taskFixture('A', { title: 'new', updatedAt: 2 })] })
    expect(mergeData(local, remote).tasks[0].title).toBe('new')
    expect(mergeData(remote, local).tasks[0].title).toBe('new')
  })

  it('breaks equal stamps by content, the same way on every device', () => {
    const a = shared({ tasks: [taskFixture('A', { title: 'Apple', updatedAt: 5 })] })
    const b = shared({ tasks: [taskFixture('A', { title: 'Banana', updatedAt: 5 })] })
    expect(mergeData(a, b).tasks[0].title).toBe(mergeData(b, a).tasks[0].title)
  })

  it('a later stamp wins even when its device has older stamps elsewhere', () => {
    const local = shared({ tasks: [taskFixture('A', { title: 'phone', updatedAt: 900 }), taskFixture('B', { updatedAt: 100 })] })
    const remote = shared({ tasks: [taskFixture('A', { title: 'mac', updatedAt: 1000 }), taskFixture('B', { updatedAt: 50 })] })
    const m = mergeData(local, remote)
    expect(m.tasks.find((t) => t.id === 'A')!.title).toBe('mac')
    expect(m.tasks.find((t) => t.id === 'B')!.updatedAt).toBe(100)
  })

  it('merges goals per milestone and step, so edits on two devices both survive', () => {
    const base = goalFixture('D3', [['Charts', [['Bar', null], ['Line', null]]]])
    const local = clone(base)
    local.milestones[0].steps[1] = { ...local.milestones[0].steps[1], doneOn: '2026-09-23', updatedAt: 2 }
    const remote = clone(base)
    remote.milestones[0].steps.push({ id: 'D3/Charts/Scatter', title: 'Scatter', doneOn: null, estMin: 50, updatedAt: 3 })
    const m = mergeData(shared({ goals: [local] }), shared({ goals: [remote] }))
    const steps = m.goals[0].milestones[0].steps
    expect(ids(steps)).toEqual(['D3/Charts/Bar', 'D3/Charts/Line', 'D3/Charts/Scatter'])
    expect(steps[1].doneOn).toBe('2026-09-23')
  })

  it("takes a goal's own fields from the newer goal without dropping the other side's milestones", () => {
    const local = { ...goalFixture('D3', [['Charts', []]]), title: 'Learn D3', updatedAt: 9 }
    const remote = { ...goalFixture('D3', [['Charts', []], ['Motion', []]]), updatedAt: 1 }
    const m = mergeData(shared({ goals: [local] }), shared({ goals: [remote] }))
    expect(m.goals[0].title).toBe('Learn D3')
    expect(ids(m.goals[0].milestones)).toEqual(['D3/Charts', 'D3/Motion'])
  })

  it('keeps a newer soft delete', () => {
    const local = shared({ tasks: [taskFixture('A', { deletedOn: '2026-09-23', updatedAt: 5 })] })
    const remote = shared({ tasks: [taskFixture('A', { title: 'renamed', updatedAt: 3 })] })
    expect(mergeData(local, remote).tasks[0].deletedOn).toBe('2026-09-23')
  })

  it('unions focus logs by id, in time order', () => {
    const log = (id: string, at: number) => ({ id, at, date: '2026-09-23', min: 25, target: null })
    const m = mergeData(shared({ logs: [log('a', 3), log('b', 1)] }), shared({ logs: [log('b', 1), log('c', 2)] }))
    expect(ids(m.logs)).toEqual(['b', 'c', 'a'])
  })

  it('takes shared settings from the newer side', () => {
    const s = dataFixture().settings
    const local = shared({ settings: { ...s, wallWeeks: 8, updatedAt: 2 } })
    const remote = shared({ settings: { ...s, wallWeeks: 20, session: '50/10', updatedAt: 1 } })
    expect(mergeData(local, remote).settings).toMatchObject({ wallWeeks: 8, session: '25/5' })
  })

  it('gives every device the same goal order once both have synced (goal colours match)', () => {
    const g = (id: string) => goalFixture(id, [])
    let file = shared({ goals: [g('G1')] })
    const a = mergeData(shared({ goals: [g('G1'), g('GA')] }), file)
    file = a
    const b = mergeData(shared({ goals: [g('G1'), g('GB')] }), file)
    file = b
    const a2 = mergeData(a, file)
    expect(ids(a2.goals)).toEqual(ids(b.goals))
    expect(ids(b.goals)).toEqual(['G1', 'GA', 'GB'])
  })

  it('is idempotent, and heals an upload that was overwritten', () => {
    const empty = shared()
    const onA = mergeData(shared({ tasks: [taskFixture('X', { updatedAt: 1 })] }), empty)
    expect(canonical(mergeData(onA, onA))).toBe(canonical(onA))
    // B merged against the empty file before A's upload landed, then overwrote it.
    const onB = mergeData(shared({ tasks: [taskFixture('Y', { updatedAt: 2 })] }), empty)
    const file = onB
    const healed = mergeData(onA, file)
    expect(ids(healed.tasks).sort()).toEqual(['X', 'Y'])
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/core/sync.test.ts`
Expected: FAIL. `mergeData` is not exported.

- [ ] **Step 3: Implement.** Append to `src/core/sync.ts`:

```ts
type Stamped = { updatedAt?: number }
const stampOf = (x: Stamped): number => x.updatedAt ?? 0

/** Newer wins; equal stamps fall back to content, so every device picks the same copy. */
function newer<T extends Stamped>(a: T, b: T): T {
  if (stampOf(a) !== stampOf(b)) return stampOf(a) > stampOf(b) ? a : b
  return canonical(a) >= canonical(b) ? a : b
}

/** Drive's order first (the file is the hub, so devices converge on it), then items only this device has. */
function unionById<T extends { id: string }>(local: T[], remote: T[], pick: (l: T, r: T) => T): T[] {
  const mine = new Map(local.map((x) => [x.id, x]))
  const seen = new Set<string>()
  const out: T[] = []
  for (const r of remote) {
    const l = mine.get(r.id)
    out.push(l ? pick(l, r) : r)
    seen.add(r.id)
  }
  for (const l of local) if (!seen.has(l.id)) out.push(l)
  return out
}

/** An item's own fields from the newer copy; its children merged one by one. */
function mergeWithChildren<T extends Stamped, K extends keyof T>(l: T, r: T, child: K, mergeChildren: (a: T[K], b: T[K]) => T[K]): T {
  const strip = (x: T) => without(x, [child as string]) as T
  return { ...newer(strip(l), strip(r)), [child]: mergeChildren(l[child], r[child]) } as T
}

const mergeMilestone = (l: Goal['milestones'][number], r: Goal['milestones'][number]) =>
  mergeWithChildren(l, r, 'steps', (a, b) => unionById(a, b, newer))

const mergeGoal = (l: Goal, r: Goal): Goal =>
  mergeWithChildren(l, r, 'milestones', (a, b) => unionById(a, b, mergeMilestone))

/** Merge this device's shared data with Drive's: union by id at every level, newer updatedAt wins. */
export function mergeData(local: SharedData, remote: SharedData): SharedData {
  const logs = unionById(local.logs, remote.logs, (l) => l)
    .sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return {
    goals: unionById(local.goals, remote.goals, mergeGoal),
    tasks: unionById(local.tasks, remote.tasks, newer),
    logs,
    settings: newer(local.settings, remote.settings),
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/core/sync.test.ts && npm run typecheck`
Expected: PASS (21 tests), clean typecheck.

- [ ] **Step 5: Commit**

```bash
git add src/core/sync.ts src/core/sync.test.ts
git commit -m "feat: merge shared data per record, newest wins"
```

---

### Task 4: Sync file, summary and "synced … ago"

**Files:**
- Modify: `src/core/sync.ts`
- Test: `src/core/sync.test.ts`

**Interfaces:**
- Consumes: `SharedData`, `sharedSettings`; `DATA_VERSION` from `./persist`; `DEFAULT_SETTINGS` from `./model`; `plural`, `pad2` from `./format`; `dayLabel`, `todayISO` from `./dates`.
- Produces:
  - `makeSyncFile(shared: SharedData, generation: string, now: number): string`
  - `type SyncFileResult = { ok: true; generation: string; exportedAt: string | null; data: SharedData } | { ok: false }`
  - `readSyncFile(text: string): SyncFileResult`
  - `syncSummary(shared: SharedData): string`, e.g. `'1 goal · 2 tasks · 0 focus sessions'` (live goals and tasks, all logs)
  - `syncedAgo(last: number, now: number): string`: `'just now'` | `'3 min ago'` | `'at 14:05'` | `'on Sep 16'`

- [ ] **Step 1: Write the failing tests.** Append to `src/core/sync.test.ts` and add `makeSyncFile, readSyncFile, syncSummary, syncedAgo` to the import:

```ts
describe('sync file', () => {
  it('round-trips shared data with its generation', () => {
    const s = shared({ tasks: [taskFixture('A', { updatedAt: 3 })] })
    const r = readSyncFile(makeSyncFile(s, 'gen-1', T))
    expect(r).toMatchObject({ ok: true, generation: 'gen-1', exportedAt: new Date(T).toISOString() })
    if (r.ok) expect(canonical(r.data)).toBe(canonical(s))
  })

  it('never carries per-device state', () => {
    const text = makeSyncFile(shared(), 'g', T)
    expect(text).not.toContain('"timer"')
    expect(text).not.toContain('"muted"')
  })

  it.each([
    ['junk', 'not json'],
    ['a backup (no generation)', JSON.stringify({ app: 'ember', version: 1, data: shared() })],
    ['another app', JSON.stringify({ app: 'other', version: 1, generation: 'g', data: shared() })],
    ['a future version', JSON.stringify({ app: 'ember', version: 2, generation: 'g', data: shared() })],
    ['missing lists', JSON.stringify({ app: 'ember', version: 1, generation: 'g', data: { goals: [] } })],
  ])('rejects %s', (_, text) => {
    expect(readSyncFile(text).ok).toBe(false)
  })

  it('fills settings added since the file was written, and repairs a bad session length', () => {
    const text = JSON.stringify({ app: 'ember', version: 1, generation: 'g', data: { goals: [], tasks: [], logs: [], settings: { session: '90/5' } } })
    const r = readSyncFile(text)
    expect(r.ok && r.data.settings).toMatchObject({ session: '25/5', showFuture: true, wallWeeks: 12 })
    expect(r.ok && r.data.settings).not.toHaveProperty('muted')
  })

  it('summarises live goals and tasks, and all focus sessions', () => {
    const s = shared({
      goals: [goalFixture('D3', []), { ...goalFixture('Old', []), deletedOn: '2026-09-01' }],
      tasks: [taskFixture('A'), taskFixture('B')],
    })
    expect(syncSummary(s)).toBe('1 goal · 2 tasks · 0 focus sessions')
  })
})

describe('syncedAgo', () => {
  const at = (h: number, m: number, day = 23) => new Date(2026, 8, day, h, m).getTime()
  it.each([
    [at(10, 0), at(10, 0) + 30_000, 'just now'],
    [at(10, 0), at(10, 3), '3 min ago'],
    [at(9, 5), at(14, 0), 'at 09:05'],
    [at(9, 5, 16), at(14, 0), 'on Sep 16'],
  ])('%s → %s', (last, now, text) => {
    expect(syncedAgo(last, now)).toBe(text)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/core/sync.test.ts`
Expected: FAIL. `makeSyncFile` and the other new functions are not exported.

- [ ] **Step 3: Implement.** Add the imports at the top of `src/core/sync.ts`:

```ts
import { dayLabel, todayISO } from './dates'
import { pad2, plural } from './format'
import { DEFAULT_SETTINGS, type SessionLength } from './model'
import { DATA_VERSION } from './persist'
```

Merge `DEFAULT_SETTINGS` and `SessionLength` into the existing model import:

```ts
import { DEFAULT_SETTINGS, type EmberData, type FocusLog, type Goal, type SessionLength, type Settings, type Task } from './model'
```

Then append:

```ts
/** The Drive file: the backup format, shared data only, plus the generation it belongs to. */
export function makeSyncFile(shared: SharedData, generation: string, now: number): string {
  return JSON.stringify({ app: 'ember', version: DATA_VERSION, exportedAt: new Date(now).toISOString(), generation, data: shared })
}

export type SyncFileResult = { ok: true; generation: string; exportedAt: string | null; data: SharedData } | { ok: false }

const SESSIONS: SessionLength[] = ['25/5', '50/10']

export function readSyncFile(text: string): SyncFileResult {
  try {
    const f = JSON.parse(text) as { app?: unknown; version?: unknown; generation?: unknown; exportedAt?: unknown; data?: Partial<SharedData> }
    const d = f?.data
    if (f?.app !== 'ember' || f.version !== DATA_VERSION || typeof f.generation !== 'string' || !f.generation) return { ok: false }
    if (!d || !Array.isArray(d.goals) || !Array.isArray(d.tasks) || !Array.isArray(d.logs)) return { ok: false }
    const settings = sharedSettings({ ...DEFAULT_SETTINGS, ...(d.settings ?? {}) } as Settings)
    if (!SESSIONS.includes(settings.session)) settings.session = DEFAULT_SETTINGS.session
    return {
      ok: true,
      generation: f.generation,
      exportedAt: typeof f.exportedAt === 'string' ? f.exportedAt : null,
      data: { goals: d.goals, tasks: d.tasks, logs: d.logs, settings },
    }
  } catch {
    return { ok: false }
  }
}

export const syncSummary = (s: SharedData): string =>
  `${plural(s.goals.filter((g) => !g.deletedOn).length, 'goal')} · ${plural(s.tasks.filter((t) => !t.deletedOn).length, 'task')} · ${plural(s.logs.length, 'focus session')}`

/** "just now", "3 min ago", "at 14:05" (earlier today) or "on Sep 16". */
export function syncedAgo(last: number, now: number): string {
  const min = Math.floor((now - last) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  if (todayISO(last) === todayISO(now)) {
    const d = new Date(last)
    return `at ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  }
  return `on ${dayLabel(todayISO(last))}`
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/core && npm run typecheck`
Expected: PASS, clean. If there's a circular-import warning between `sync.ts` → `persist.ts` → `timer.ts`, it's harmless (no cycle back to `sync.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/core/sync.ts src/core/sync.test.ts
git commit -m "feat: Drive sync file with generation; summary and synced-ago text"
```

---

### Task 5: Store stamps on save, and applies shared data

**Files:**
- Modify: `src/stores/ember.ts`
- Test: `src/stores/ember.test.ts`

**Interfaces:**
- Consumes: `stampChanges`, `withDeviceState`, `SharedData` (Tasks 2–3); the existing `saveBeforeRestore`.
- Produces:
  - Saving stamps changed records.
  - `replaceData(d)` resets the baseline, so outside data is never stamped.
  - `applyShared(shared: SharedData, opts?: { safetyCopy?: boolean }): void`. It replaces the shared part, keeps this device's timer, selection, sound and demo speed, and clears a selection whose target no longer exists. With `safetyCopy`, it first writes `ember:v1:before-restore`.

- [ ] **Step 1: Write the failing tests.** Append to `src/stores/ember.test.ts`, and add `import { sharedPart } from '../core/sync'`:

```ts
describe('sync support', () => {
  it('stamps what changed when the store saves', async () => {
    const store = storeWith()
    await nextTick()
    vi.setSystemTime(NOW + MIN)
    store.updateTask('Review PR', { title: 'Review PR #2' })
    await nextTick()
    expect(store.tasks.find((t) => t.id === 'Review PR')!.updatedAt).toBe(NOW + MIN)
    expect(store.tasks.find((t) => t.id === 'Dentist')!.updatedAt).toBeUndefined()
    expect(loadData()!.tasks.find((t) => t.id === 'Review PR')!.updatedAt).toBe(NOW + MIN)
  })

  it('never stamps data that arrives from elsewhere', async () => {
    const store = storeWith()
    await nextTick()
    const other = fixture()
    other.tasks[0].title = 'Changed in another tab'
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: JSON.stringify({ version: 1, data: other }) }))
    await nextTick()
    expect(store.tasks[0].title).toBe('Changed in another tab')
    expect(store.tasks[0].updatedAt).toBeUndefined()
  })

  it("applies shared data from sync, keeping this device's timer, selection and sound", async () => {
    const store = storeWith({ selection: { kind: 'task', taskId: 'Review PR' } })
    store.startPause()
    store.updateSettings({ muted: false })
    await nextTick()
    const remote = sharedPart({ ...fixture(), tasks: [...fixture().tasks, taskFixture('From phone')] })
    remote.settings = { ...remote.settings, wallWeeks: 20 }
    store.applyShared(remote)
    await nextTick()
    expect(store.tasks.map((t) => t.id)).toContain('From phone')
    expect(store.timer.running).toBe(true)
    expect(store.selection).toEqual({ kind: 'task', taskId: 'Review PR' })
    expect(store.settings).toMatchObject({ wallWeeks: 20, muted: false })
    expect(store.tasks.find((t) => t.id === 'From phone')!.updatedAt).toBeUndefined()
  })

  it('keeps a safety copy when asked, and clears a selection deleted on the other device', async () => {
    const store = storeWith({ selection: { kind: 'task', taskId: 'Review PR' } })
    store.startPause()
    await nextTick()
    const remote = sharedPart(fixture())
    remote.tasks = remote.tasks.map((t) => (t.id === 'Review PR' ? { ...t, deletedOn: '2026-09-23' } : t))
    store.applyShared(remote, { safetyCopy: true })
    expect(store.selection).toBeNull()
    expect(store.timer.running).toBe(true)
    expect(localStorage.getItem(`${STORAGE_KEY}:before-restore`)).toContain('Review PR')
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/stores/ember.test.ts -t "sync support"`
Expected: FAIL. `updatedAt` stays undefined, and `applyShared` is not a function.

- [ ] **Step 3: Implement** in `src/stores/ember.ts`. Add the import:

```ts
import { stampChanges, withDeviceState, type SharedData } from '../core/sync'
```

Replace `replaceData` and the `persist` lines (from `function replaceData` through `watch([goals, tasks, logs, selection, timer, settings], persist, { deep: true })`) with:

```ts
  const clone = (d: EmberData): EmberData => JSON.parse(JSON.stringify(d)) as EmberData
  /** What was last saved; the next save stamps everything that differs from it (sync merge). */
  let baseline = clone(snapshot())

  /** Data from outside (another tab, restore, sync, tests): adopted as-is, never stamped as a local edit. */
  function replaceData(d: EmberData) {
    baseline = clone(d)
    goals.value = d.goals
    tasks.value = d.tasks
    logs.value = d.logs
    selection.value = d.selection
    timer.value = d.timer
    settings.value = d.settings
  }

  const persist = () => {
    stampChanges(baseline, snapshot(), Date.now())
    baseline = clone(snapshot())
    if (storageWritable.value) saveData(snapshot())
  }
  if (read.status !== 'ok') persist()
  watch([goals, tasks, logs, selection, timer, settings], persist, { deep: true })
```

`snapshot()` must also return `deviceUpdatedAt`. Add `const deviceUpdatedAt = ref<number | undefined>(initial.deviceUpdatedAt)` next to the other refs. Add `deviceUpdatedAt: deviceUpdatedAt.value` to `snapshot()`, and `deviceUpdatedAt.value = d.deviceUpdatedAt` to `replaceData`. Because `stampChanges` writes `deviceUpdatedAt` onto the plain snapshot object, copy it back in `persist`:

```ts
  const persist = () => {
    const current = snapshot()
    stampChanges(baseline, current, Date.now())
    deviceUpdatedAt.value = current.deviceUpdatedAt
    baseline = clone(current)
    if (storageWritable.value) saveData(current)
  }
```

(The task, goal and settings objects inside `current` are the reactive objects themselves, so their stamps land in the store directly. The second watcher run that this triggers finds no differences.)

Add `applyShared` after `restore`:

```ts
  /** Shared data from sync: this device keeps its timer, selection, sound and demo speed. */
  function applyShared(shared: SharedData, opts: { safetyCopy?: boolean } = {}) {
    if (opts.safetyCopy) saveBeforeRestore(snapshot())
    replaceData(withDeviceState(shared, snapshot()))
    if (selection.value && !targetExists(selection.value)) selection.value = null
  }
```

Add `applyShared` to the returned object, next to `restore`.

- [ ] **Step 4: Run the tests and the whole suite**

Run: `npx vitest run src/stores/ember.test.ts && npx vitest run && npm run typecheck`
Expected: PASS everywhere. Existing tests must not change. If an existing test compares saved data with `toEqual` and now sees extra `updatedAt` fields, that test made an edit and checked the saved copy. Change its expectation to `toMatchObject`, and record a ruling in the ledger.

- [ ] **Step 5: Commit**

```bash
git add src/stores/ember.ts src/stores/ember.test.ts
git commit -m "feat: stamp edits on save; apply shared data from sync"
```

---

### Task 6: Sync controller (runs, first connection, generations, errors)

**Files:**
- Create: `src/sync/backend.ts`, `src/sync/test-backend.ts`, `src/stores/sync.ts`, `src/env.d.ts`
- Create (stub, finished in Task 8): `src/sync/drive.ts`
- Modify: `vite.config.ts` (test env)
- Test: `src/stores/sync.test.ts`

**Interfaces:**
- Consumes:
  - `mergeData`, `makeSyncFile`, `readSyncFile`, `sharedPart`, `canonical`, `syncSummary`, `SharedData` (Tasks 2–4)
  - `ember.applyShared`, `ember.snapshot` (Task 5)
  - `uid` from `core/ids`
- Produces:
  - `interface SyncBackend { connect(interactive: boolean): Promise<'ok' | 'needs-user' | 'denied'>; disconnect(): Promise<void>; pull(): Promise<{ text: string } | null>; push(text: string): Promise<void>; subscribe?(onRemoteChange: () => void): () => void }`
  - `class SyncAuthError extends Error`, `class SyncOfflineError extends Error`
  - `provideSyncBackend(b: SyncBackend | null | undefined): void`. `undefined` means use the default, Drive when configured.
  - `type SyncStatus = 'unconfigured' | 'signed-out' | 'choose' | 'syncing' | 'synced' | 'offline' | 'needs-reconnect' | 'error' | 'unreadable'`
  - `useSyncStore()` exposing:
    - state: `status`, `lastSyncedAt`, `choice` (`{ summary: string; from: string | null } | null`), `connected`, `configured`, `needsAttention`
    - actions: `connect()`, `reconnect()`, `syncNow()`, `useDriveData()`, `replaceDrive()`, `cancelChoice()`, `disconnect()`, `afterRestore()`
  - `createDriveBackend(clientId: string): SyncBackend`, stubbed here and finished in Task 8

- [ ] **Step 1: Create the interface, the fake and the env typing** (no behaviour to test yet).

`src/sync/backend.ts`:

```ts
/** Where the shared data lives. Drive implements pull/push; a live backend (e.g. Firestore) adds subscribe. */
export interface SyncBackend {
  /** interactive=true only from a click: it may open Google's sign-in pop-up. */
  connect(interactive: boolean): Promise<'ok' | 'needs-user' | 'denied'>
  disconnect(): Promise<void>
  /** The sync file's text, or null when there is none yet. */
  pull(): Promise<{ text: string } | null>
  push(text: string): Promise<void>
  /** Live backends: call back on remote changes; returns an unsubscribe. The controller then stops polling. */
  subscribe?(onRemoteChange: () => void): () => void
}

/** Sign-in expired or was revoked: the user must reconnect (a click). */
export class SyncAuthError extends Error {}
/** The network is unreachable. */
export class SyncOfflineError extends Error {}
```

`src/sync/test-backend.ts`:

```ts
import type { SyncBackend } from './backend'

/** In-memory backend for tests: a "Drive" holding one file. */
export class FakeBackend implements SyncBackend {
  file: string | null = null
  connectResult: 'ok' | 'needs-user' | 'denied' = 'ok'
  pulls = 0
  pushes: string[] = []
  /** Thrown by the next pull or push, then cleared. */
  failNext: Error | null = null
  /** Runs inside push, before the file is written (simulate edits during an upload). */
  onPush: (() => void) | null = null
  subscribers: (() => void)[] = []
  live = false

  async connect(): Promise<'ok' | 'needs-user' | 'denied'> { return this.connectResult }
  async disconnect(): Promise<void> {}
  async pull(): Promise<{ text: string } | null> {
    this.pulls++
    this.throwIfFailing()
    return this.file === null ? null : { text: this.file }
  }
  async push(text: string): Promise<void> {
    this.onPush?.()
    this.throwIfFailing()
    this.pushes.push(text)
    this.file = text
  }
  private throwIfFailing() {
    if (!this.failNext) return
    const e = this.failNext
    this.failNext = null
    throw e
  }
}

/** A FakeBackend that can push changes to the app (live backends). */
export class LiveFakeBackend extends FakeBackend {
  subscribe(onRemoteChange: () => void): () => void {
    this.subscribers.push(onRemoteChange)
    return () => { this.subscribers = this.subscribers.filter((f) => f !== onRemoteChange) }
  }
}
```

`src/env.d.ts`:

```ts
interface ImportMetaEnv {
  /** Google OAuth client ID; empty = sync turned off. */
  readonly VITE_GOOGLE_CLIENT_ID?: string
}
```

`src/sync/drive.ts` (stub, finished in Task 8):

```ts
import type { SyncBackend } from './backend'

export function createDriveBackend(clientId: string): SyncBackend {
  throw new Error(`Drive backend not built yet (${clientId})`)
}
```

`vite.config.ts`: inside `test: { … }`, add `env: { VITE_GOOGLE_CLIENT_ID: '' },` so a developer's `.env.local` never turns sync on in tests.

- [ ] **Step 2: Write the failing tests** in `src/stores/sync.test.ts`:

```ts
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EmberData } from '../core/model'
import { STORAGE_KEY } from '../core/persist'
import { makeSyncFile, readSyncFile, sharedPart } from '../core/sync'
import { dataFixture, goalFixture, taskFixture } from '../core/test-fixtures'
import { SyncAuthError, SyncOfflineError } from '../sync/backend'
import { FakeBackend } from '../sync/test-backend'
import { useEmberStore } from './ember'
import { provideSyncBackend, useSyncStore } from './sync'

const NOW = new Date(2026, 9, 5, 10, 0).getTime()
const local = () => dataFixture({ tasks: [taskFixture('Here', { updatedAt: 1 })] })
const driveFile = (generation: string, patch: Partial<EmberData> = {}) =>
  makeSyncFile(sharedPart(dataFixture({ goals: [goalFixture('D3', [])], tasks: [taskFixture('There', { updatedAt: 1 })], ...patch })), generation, NOW - 86_400_000)
const fileOf = (b: FakeBackend) => {
  const r = readSyncFile(b.file!)
  if (!r.ok) throw new Error('bad file')
  return r
}

function setup(opts: { backend?: FakeBackend | null; saved?: object; data?: EmberData } = {}) {
  if (opts.saved) localStorage.setItem('ember:sync', JSON.stringify(opts.saved))
  const backend = opts.backend === undefined ? new FakeBackend() : opts.backend
  provideSyncBackend(backend)
  setActivePinia(createPinia())
  const ember = useEmberStore()
  ember.replaceData(opts.data ?? local())
  const sync = useSyncStore()
  return { ember, sync, backend: backend as FakeBackend }
}
const connectedTo = (generation: string) => ({ connected: true, generation, lastSyncedAt: NOW - 60_000, newGeneration: false })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  localStorage.clear()
})
afterEach(() => {
  provideSyncBackend(undefined)
  vi.useRealTimers()
})

describe('sync controller', () => {
  it('is unconfigured without a backend, and signed out with one', () => {
    expect(setup({ backend: null }).sync.status).toBe('unconfigured')
    expect(setup().sync).toMatchObject({ status: 'signed-out', configured: true, connected: false })
  })

  it('first connection with an empty Drive uploads this device as a new generation', async () => {
    const { sync, backend } = setup()
    await sync.connect()
    expect(sync.status).toBe('synced')
    expect(fileOf(backend).data.tasks.map((t) => t.id)).toEqual(['Here'])
    const saved = JSON.parse(localStorage.getItem('ember:sync')!)
    expect(saved).toMatchObject({ connected: true, generation: fileOf(backend).generation, lastSyncedAt: NOW })
  })

  it('first connection with data in Drive asks which to keep', async () => {
    const { sync, backend } = setup()
    backend.file = driveFile('g1')
    await sync.connect()
    expect(sync.status).toBe('choose')
    expect(sync.choice).toEqual({ summary: '1 goal · 1 task · 0 focus sessions', from: 'Oct 4' })
    expect(backend.pushes).toHaveLength(0)
  })

  it("uses Drive's data here with a safety copy, keeping this device's timer", async () => {
    const { sync, ember, backend } = setup()
    backend.file = driveFile('g1')
    ember.startPause()
    await sync.connect()
    sync.useDriveData()
    expect(ember.tasks.map((t) => t.id)).toEqual(['There'])
    expect(ember.timer.running).toBe(true)
    expect(localStorage.getItem(`${STORAGE_KEY}:before-restore`)).toContain('Here')
    expect(sync).toMatchObject({ status: 'synced', choice: null })
    expect(backend.pushes).toHaveLength(0)
  })

  it("replaces Drive with this device's data as a new generation", async () => {
    const { sync, backend } = setup()
    backend.file = driveFile('g1')
    await sync.connect()
    await sync.replaceDrive()
    const f = fileOf(backend)
    expect(f.generation).not.toBe('g1')
    expect(f.data.tasks.map((t) => t.id)).toEqual(['Here'])
    expect(sync.status).toBe('synced')
  })

  it('cancelling the choice signs out and changes nothing', async () => {
    const { sync, ember, backend } = setup()
    backend.file = driveFile('g1')
    await sync.connect()
    await sync.cancelChoice()
    expect(sync).toMatchObject({ status: 'signed-out', connected: false })
    expect(ember.tasks.map((t) => t.id)).toEqual(['Here'])
  })

  it('stays signed out when sign-in is refused', async () => {
    const { sync, backend } = setup()
    backend.connectResult = 'denied'
    await sync.connect()
    expect(sync).toMatchObject({ status: 'signed-out', connected: false })
  })

  it('merges, and uploads only when something changed', async () => {
    const { sync, ember, backend } = setup({ saved: connectedTo('g1') })
    backend.file = driveFile('g1')
    await sync.syncNow()
    expect(ember.tasks.map((t) => t.id).sort()).toEqual(['Here', 'There'])
    expect(fileOf(backend).data.tasks.map((t) => t.id).sort()).toEqual(['Here', 'There'])
    expect(backend.pushes).toHaveLength(1)
    await sync.syncNow()
    expect(backend.pushes).toHaveLength(1)
    expect(sync.status).toBe('synced')
  })

  it('replaces local data, with a safety copy, when Drive starts a new generation', async () => {
    const { sync, ember, backend } = setup({ saved: connectedTo('g1') })
    backend.file = driveFile('g2')
    await sync.syncNow()
    expect(ember.tasks.map((t) => t.id)).toEqual(['There'])
    expect(localStorage.getItem(`${STORAGE_KEY}:before-restore`)).toContain('Here')
    expect(backend.pushes).toHaveLength(0)
    expect(JSON.parse(localStorage.getItem('ember:sync')!).generation).toBe('g2')
  })

  it('never overwrites an unreadable Drive file, unless asked', async () => {
    const { sync, backend } = setup({ saved: connectedTo('g1') })
    backend.file = 'garbage'
    await sync.syncNow()
    expect(sync.status).toBe('unreadable')
    expect(backend.pushes).toHaveLength(0)
    await sync.replaceDrive()
    expect(fileOf(backend).data.tasks.map((t) => t.id)).toEqual(['Here'])
  })

  it('asks to reconnect when the pass expires mid-sync, keeping local data, then uploads after reconnecting', async () => {
    const { sync, ember, backend } = setup({ saved: connectedTo('g1') })
    backend.file = driveFile('g1')
    backend.onPush = () => { backend.onPush = null; backend.failNext = new SyncAuthError('401') }
    await sync.syncNow()
    expect(sync.status).toBe('needs-reconnect')
    expect(sync.needsAttention).toBe(true)
    expect(ember.tasks.map((t) => t.id).sort()).toEqual(['Here', 'There'])
    await sync.reconnect()
    expect(sync.status).toBe('synced')
    expect(fileOf(backend).data.tasks.map((t) => t.id).sort()).toEqual(['Here', 'There'])
  })

  it('goes offline without retrying, and retries other errors after 1, 5 and 15 minutes', async () => {
    const { sync, backend } = setup({ saved: connectedTo('g1') })
    backend.file = driveFile('g1')
    backend.failNext = new SyncOfflineError('net')
    await sync.syncNow()
    expect(sync.status).toBe('offline')
    expect(vi.getTimerCount()).toBe(0)

    const pullsAt = () => backend.pulls
    backend.failNext = new Error('Drive 500')
    await sync.syncNow()
    expect(sync.status).toBe('error')
    const p = pullsAt()
    backend.failNext = new Error('Drive 500')
    await vi.advanceTimersByTimeAsync(59_000)
    expect(backend.pulls).toBe(p)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(backend.pulls).toBe(p + 1)
    backend.failNext = new Error('Drive 500')
    await vi.advanceTimersByTimeAsync(300_000)
    expect(backend.pulls).toBe(p + 2)
    await vi.advanceTimersByTimeAsync(900_000)
    expect(backend.pulls).toBe(p + 3)
    expect(sync.status).toBe('synced')
  })

  it('after a restore, starts a new generation, and pushes it even if that upload first fails', async () => {
    const { sync, backend } = setup({ saved: connectedTo('g1') })
    backend.file = driveFile('g1')
    backend.failNext = new Error('Drive 500')
    await sync.afterRestore()
    expect(sync.status).toBe('error')
    await sync.syncNow()
    const f = fileOf(backend)
    expect(f.generation).not.toBe('g1')
    expect(f.data.tasks.map((t) => t.id)).toEqual(['Here'])
  })

  it('disconnects, keeping local data and the Drive file', async () => {
    const { sync, ember, backend } = setup({ saved: connectedTo('g1') })
    backend.file = driveFile('g1')
    await sync.disconnect()
    expect(sync).toMatchObject({ status: 'signed-out', connected: false })
    expect(JSON.parse(localStorage.getItem('ember:sync')!)).toMatchObject({ connected: false, generation: null })
    expect(backend.file).not.toBeNull()
    expect(ember.tasks.map((t) => t.id)).toEqual(['Here'])
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run src/stores/sync.test.ts`
Expected: FAIL with `Failed to resolve import "./sync"`.

- [ ] **Step 4: Implement** `src/stores/sync.ts`:

```ts
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { dayLabel, todayISO } from '../core/dates'
import { uid } from '../core/ids'
import { defaultStorage } from '../core/persist'
import { canonical, makeSyncFile, mergeData, readSyncFile, sharedPart, syncSummary, type SharedData } from '../core/sync'
import { SyncAuthError, SyncOfflineError, type SyncBackend } from '../sync/backend'
import { createDriveBackend } from '../sync/drive'
import { useEmberStore } from './ember'

export type SyncStatus = 'unconfigured' | 'signed-out' | 'choose' | 'syncing' | 'synced' | 'offline' | 'needs-reconnect' | 'error' | 'unreadable'

const STATE_KEY = 'ember:sync'
const RETRY_MS = [60_000, 300_000, 900_000]

interface SavedState { connected: boolean; generation: string | null; lastSyncedAt: number | null; newGeneration: boolean }
const EMPTY: SavedState = { connected: false, generation: null, lastSyncedAt: null, newGeneration: false }

function readState(): SavedState {
  try {
    const raw = defaultStorage()?.getItem(STATE_KEY)
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<SavedState>) } : { ...EMPTY }
  } catch {
    return { ...EMPTY }
  }
}
function writeState(s: SavedState) {
  try { defaultStorage()?.setItem(STATE_KEY, JSON.stringify(s)) } catch { /* not critical */ }
}

let backendOverride: SyncBackend | null | undefined
/** Tests and future backends supply the backend; undefined = Google Drive when a client ID is configured. */
export function provideSyncBackend(b: SyncBackend | null | undefined): void { backendOverride = b }
function makeBackend(): SyncBackend | null {
  if (backendOverride !== undefined) return backendOverride
  const id = import.meta.env.VITE_GOOGLE_CLIENT_ID
  return id ? createDriveBackend(id) : null
}

export const useSyncStore = defineStore('sync', () => {
  const ember = useEmberStore()
  const backend = makeBackend()
  const saved = readState()

  const connected = ref(!!backend && saved.connected)
  const generation = ref(saved.generation)
  const newGeneration = ref(saved.newGeneration)
  const lastSyncedAt = ref(saved.lastSyncedAt)
  const status = ref<SyncStatus>(!backend ? 'unconfigured' : connected.value ? 'synced' : 'signed-out')
  const pendingFile = ref<{ generation: string; data: SharedData } | null>(null)
  const choice = ref<{ summary: string; from: string | null } | null>(null)
  const configured = computed(() => !!backend)
  const needsAttention = computed(() => ['needs-reconnect', 'error', 'unreadable'].includes(status.value))

  let failures = 0
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let running: Promise<void> | null = null
  let again = false
  /** Shared data as last agreed with Drive; local edits make the current data differ from it. */
  let syncedSig = ''

  const save = () => writeState({ connected: connected.value, generation: generation.value, lastSyncedAt: lastSyncedAt.value, newGeneration: newGeneration.value })
  const localShared = () => sharedPart(ember.snapshot())
  const hasLocalChanges = () => canonical(localShared()) !== syncedSig

  function synced(sig: string) {
    syncedSig = sig
    lastSyncedAt.value = Date.now()
    failures = 0
    status.value = 'synced'
    save()
  }

  async function pushShared(shared: SharedData) {
    await backend!.push(makeSyncFile(shared, generation.value!, Date.now()))
  }

  /** One round: pull, then upload a pending new generation, adopt Drive's, or merge. */
  async function once() {
    if (newGeneration.value) {
      const shared = localShared()
      await pushShared(shared)
      newGeneration.value = false
      synced(canonical(shared))
      return
    }
    const pulled = await backend!.pull()
    if (!pulled) {
      // Drive is empty: this device's data starts the first generation.
      generation.value = uid()
      const shared = localShared()
      await pushShared(shared)
      synced(canonical(shared))
      return
    }
    const file = readSyncFile(pulled.text)
    if (!file.ok) {
      status.value = 'unreadable'
      return
    }
    if (generation.value === null) {
      pendingFile.value = { generation: file.generation, data: file.data }
      choice.value = { summary: syncSummary(file.data), from: file.exportedAt ? dayLabel(todayISO(Date.parse(file.exportedAt))) : null }
      status.value = 'choose'
      return
    }
    if (file.generation !== generation.value) {
      // Someone restored or replaced Drive on purpose: adopt it rather than merge.
      ember.applyShared(file.data, { safetyCopy: true })
      generation.value = file.generation
      synced(canonical(file.data))
      return
    }
    // Merge and apply in one synchronous step, so an edit made during the upload stays local (and unsynced).
    const merged = mergeData(localShared(), file.data)
    const sig = canonical(merged)
    if (sig !== canonical(localShared())) ember.applyShared(merged)
    if (sig !== canonical(file.data)) await pushShared(merged)
    synced(sig)
  }

  function fail(e: unknown) {
    if (e instanceof SyncAuthError) {
      status.value = 'needs-reconnect'
      return
    }
    if (e instanceof SyncOfflineError || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      status.value = 'offline'
      return
    }
    status.value = 'error'
    const delay = RETRY_MS[Math.min(failures, RETRY_MS.length - 1)]
    failures++
    clearTimeout(retryTimer)
    retryTimer = setTimeout(() => { void syncNow() }, delay)
  }

  /** Runs one sync at a time; a call during a run queues exactly one more. */
  async function syncNow(): Promise<void> {
    if (!backend || !connected.value) return
    if (running) {
      again = true
      return running
    }
    running = (async () => {
      do {
        again = false
        clearTimeout(retryTimer)
        status.value = 'syncing'
        try {
          await once()
        } catch (e) {
          fail(e)
          again = false
        }
      } while (again)
    })()
    try {
      await running
    } finally {
      running = null
    }
  }

  /** From a click: may open Google's sign-in. */
  async function connect() {
    if (!backend) return
    const r = await backend.connect(true)
    if (r !== 'ok') {
      status.value = connected.value ? 'needs-reconnect' : 'signed-out'
      return
    }
    connected.value = true
    save()
    await syncNow()
  }

  function useDriveData() {
    const f = pendingFile.value
    if (!f) return
    ember.applyShared(f.data, { safetyCopy: true })
    generation.value = f.generation
    pendingFile.value = null
    choice.value = null
    synced(canonical(f.data))
  }

  /** Start a new generation from this device's data (restore, or "Replace Drive"). */
  async function startNewGeneration() {
    if (!backend || !connected.value) return
    pendingFile.value = null
    choice.value = null
    generation.value = uid()
    newGeneration.value = true
    save()
    await syncNow()
  }

  async function disconnect() {
    clearTimeout(retryTimer)
    await backend?.disconnect()
    connected.value = false
    generation.value = null
    newGeneration.value = false
    pendingFile.value = null
    choice.value = null
    status.value = backend ? 'signed-out' : 'unconfigured'
    save()
  }

  return {
    status, lastSyncedAt, choice, connected, configured, needsAttention,
    connect, reconnect: connect, syncNow, useDriveData, replaceDrive: startNewGeneration, cancelChoice: disconnect,
    disconnect, afterRestore: startNewGeneration,
    // Used by the triggers (Task 7).
    hasLocalChanges, backend,
  }
})
```

- [ ] **Step 5: Run the tests and the whole suite**

Run: `npx vitest run src/stores/sync.test.ts && npx vitest run && npm run typecheck`
Expected: PASS (13 sync tests), the full suite green, and the typecheck clean.

If "first connection … asks which to keep" fails on `from`: `dayLabel(todayISO(NOW - 1 day))` with NOW = 5 Oct 2026 is `'Oct 4'`. Check that `driveFile` passes `NOW - 86_400_000`.

If the retry test's offline case leaves a timer: `syncNow` clears `retryTimer` and offline sets none, so `vi.getTimerCount()` must be 0.

- [ ] **Step 6: Commit**

```bash
git add src/sync src/stores/sync.ts src/stores/sync.test.ts src/env.d.ts vite.config.ts
git commit -m "feat: sync controller with first connection, generations and retries"
```

---

### Task 7: Sync triggers

**Files:**
- Modify: `src/stores/sync.ts`
- Modify: `src/App.vue`
- Test: `src/stores/sync.test.ts`

**Interfaces:**
- Consumes: `syncNow`, `hasLocalChanges`, `backend` (Task 6).
- Produces: `sync.start()` and `sync.stop()`. `App.vue` calls `start()` on mount and `stop()` on unmount.

- [ ] **Step 1: Write the failing tests.** Append to `src/stores/sync.test.ts`, and add `import { LiveFakeBackend } from '../sync/test-backend'` (merge it into the existing import):

```ts
describe('sync triggers', () => {
  const setVisibility = (v: 'visible' | 'hidden') => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v })
    document.dispatchEvent(new Event('visibilitychange'))
  }
  afterEach(() => setVisibility('visible'))

  it('syncs on start when connected', async () => {
    const { sync, backend } = setup({ saved: connectedTo('g1') })
    backend.file = driveFile('g1')
    sync.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(backend.pulls).toBe(1)
    sync.stop()
  })

  it('asks to reconnect on start when the sign-in pass has expired', async () => {
    const { sync, backend } = setup({ saved: connectedTo('g1') })
    backend.connectResult = 'needs-user'
    sync.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(sync.status).toBe('needs-reconnect')
    expect(backend.pulls).toBe(0)
    sync.stop()
  })

  it('syncs 5 seconds after a local change, not before, and not for data that came from sync', async () => {
    const { sync, ember, backend } = setup({ saved: connectedTo('g1') })
    backend.file = driveFile('g1')
    sync.start()
    await vi.advanceTimersByTimeAsync(10_000)
    const p = backend.pulls
    ember.addTask({ title: 'New', when: 'today', deadline: false, goalId: null })
    await vi.advanceTimersByTimeAsync(4_900)
    expect(backend.pulls).toBe(p)
    await vi.advanceTimersByTimeAsync(200)
    expect(backend.pulls).toBe(p + 1)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(backend.pulls).toBe(p + 1)
    sync.stop()
  })

  it('polls every minute while visible, not while hidden, and syncs on becoming visible', async () => {
    const { sync, backend } = setup({ saved: connectedTo('g1') })
    backend.file = driveFile('g1')
    sync.start()
    await vi.advanceTimersByTimeAsync(0)
    const p = backend.pulls
    await vi.advanceTimersByTimeAsync(60_000)
    expect(backend.pulls).toBe(p + 1)
    setVisibility('hidden')
    await vi.advanceTimersByTimeAsync(120_000)
    expect(backend.pulls).toBe(p + 1)
    setVisibility('visible')
    await vi.advanceTimersByTimeAsync(0)
    expect(backend.pulls).toBe(p + 2)
    sync.stop()
  })

  it('syncs when the network comes back', async () => {
    const { sync, backend } = setup({ saved: connectedTo('g1') })
    backend.file = driveFile('g1')
    sync.start()
    await vi.advanceTimersByTimeAsync(0)
    const p = backend.pulls
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
    expect(backend.pulls).toBe(p + 1)
    sync.stop()
  })

  it('uses subscribe instead of polling when the backend offers it', async () => {
    const live = new LiveFakeBackend()
    live.file = driveFile('g1')
    const { sync } = setup({ backend: live, saved: connectedTo('g1') })
    sync.start()
    await vi.advanceTimersByTimeAsync(0)
    const p = live.pulls
    await vi.advanceTimersByTimeAsync(180_000)
    expect(live.pulls).toBe(p)
    live.subscribers.forEach((f) => f())
    await vi.advanceTimersByTimeAsync(0)
    expect(live.pulls).toBe(p + 1)
    sync.stop()
    expect(live.subscribers).toHaveLength(0)
  })

  it('keeps an edit made during an upload and sends it on the next sync', async () => {
    const { sync, ember, backend } = setup({ saved: connectedTo('g1') })
    backend.file = driveFile('g1')
    backend.onPush = () => {
      backend.onPush = null
      ember.addTask({ title: 'Typed during upload', when: 'today', deadline: false, goalId: null })
    }
    sync.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(ember.tasks.some((t) => t.title === 'Typed during upload')).toBe(true)
    await vi.advanceTimersByTimeAsync(6_000)
    expect(fileOf(backend).data.tasks.some((t) => t.title === 'Typed during upload')).toBe(true)
    sync.stop()
  })

  it('stops every trigger on stop', async () => {
    const { sync, backend } = setup({ saved: connectedTo('g1') })
    backend.file = driveFile('g1')
    sync.start()
    await vi.advanceTimersByTimeAsync(0)
    sync.stop()
    const p = backend.pulls
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(300_000)
    expect(backend.pulls).toBe(p)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/stores/sync.test.ts -t "sync triggers"`
Expected: FAIL with "sync.start is not a function".

- [ ] **Step 3: Implement.** In `src/stores/sync.ts`, add `watch` to the vue import and these constants:

```ts
const DEBOUNCE_MS = 5_000
const POLL_MS = 60_000
```

Inside the store, before `return`:

```ts
  let stops: (() => void)[] = []

  /** Sync on open, on becoming visible, 5 s after a local change, every minute while visible (or on remote change for live backends), and when back online. */
  function start() {
    if (!backend || stops.length) return
    const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden'
    const onVisible = () => { if (visible()) void syncNow() }
    const onOnline = () => { void syncNow() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)

    let debounce: ReturnType<typeof setTimeout> | undefined
    const stopWatch = watch(
      () => [ember.goals, ember.tasks, ember.logs, ember.settings],
      () => {
        clearTimeout(debounce)
        debounce = setTimeout(() => { if (hasLocalChanges()) void syncNow() }, DEBOUNCE_MS)
      },
      { deep: true },
    )

    let stopRemote: () => void
    if (backend.subscribe) stopRemote = backend.subscribe(() => { void syncNow() })
    else {
      const id = setInterval(() => { if (visible()) void syncNow() }, POLL_MS)
      stopRemote = () => clearInterval(id)
    }

    stops = [
      () => document.removeEventListener('visibilitychange', onVisible),
      () => window.removeEventListener('online', onOnline),
      stopWatch,
      () => clearTimeout(debounce),
      stopRemote,
      () => clearTimeout(retryTimer),
    ]

    if (connected.value) {
      void backend.connect(false).then((r) => {
        if (r === 'ok') void syncNow()
        else status.value = 'needs-reconnect'
      })
    }
  }

  function stop() {
    stops.forEach((f) => f())
    stops = []
  }
```

Add `start, stop` to the returned object.

In `src/App.vue`, add `import { useSyncStore } from './stores/sync'` and `const sync = useSyncStore()`. Extend the existing hooks:

```ts
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  sync.start()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  sync.stop()
})
```

- [ ] **Step 4: Run the tests and the whole suite**

Run: `npx vitest run src/stores/sync.test.ts && npx vitest run && npm run typecheck`
Expected: PASS. App tests are unaffected, because tests have no client ID, so the store is unconfigured and `start()` returns at once.

- [ ] **Step 5: Commit**

```bash
git add src/stores/sync.ts src/stores/sync.test.ts src/App.vue
git commit -m "feat: sync on open, visibility, edits, a 1-minute poll and reconnecting"
```

---

### Task 8: Google Drive backend

**Files:**
- Modify: `src/sync/drive.ts` (replace the stub)
- Test: `src/sync/drive.test.ts`

**Interfaces:**
- Consumes: `SyncBackend`, `SyncAuthError`, `SyncOfflineError` (Task 6).
- Produces: `createDriveBackend(clientId: string, deps?: { storage?: Storage; fetchFn?: typeof fetch; now?: () => number }): SyncBackend`

**Important (user gesture):** browsers allow Google's sign-in pop-up only when it opens directly from a click. `connect(true)` must therefore call `requestAccessToken` before any `await` whenever the Google script has already loaded. The script is preloaded when the backend is created, and `SyncBlock`'s buttons call `sync.connect()` straight from `@click`.

- [ ] **Step 1: Write the failing tests** in `src/sync/drive.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SyncAuthError, SyncOfflineError } from './backend'
import { createDriveBackend } from './drive'

const NOW = 1_800_000_000_000
type Callback = (r: { access_token?: string; expires_in?: number; error?: string }) => void
let callback: Callback
let requested: { prompt?: string }[]
let initArgs: { client_id: string; scope: string }[]
const revoke = vi.fn((_t: string, done?: () => void) => done?.())

function fakeGoogle() {
  requested = []
  initArgs = []
  ;(window as unknown as { google: unknown }).google = {
    accounts: {
      oauth2: {
        initTokenClient: (cfg: { client_id: string; scope: string; callback: Callback }) => {
          initArgs.push(cfg)
          callback = cfg.callback
          return { requestAccessToken: (o?: { prompt?: string }) => { requested.push(o ?? {}) } }
        },
        revoke,
      },
    },
  }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
function backendWith(fetchFn: typeof fetch, token: { value: string; expiresAt: number } | null = { value: 'tok', expiresAt: NOW + 3_600_000 }) {
  if (token) localStorage.setItem('ember:sync:token', JSON.stringify(token))
  return createDriveBackend('client-1', { storage: localStorage, fetchFn, now: () => NOW })
}

beforeEach(() => {
  localStorage.clear()
  fakeGoogle()
  revoke.mockClear()
})
afterEach(() => { delete (window as unknown as { google?: unknown }).google })

describe('Drive backend', () => {
  it('signs in with the Drive app-folder scope only, from the click, and keeps the pass until it expires', async () => {
    const b = backendWith(vi.fn(), null)
    const result = b.connect(true)
    expect(requested).toEqual([{ prompt: '' }])
    expect(initArgs[0]).toMatchObject({ client_id: 'client-1', scope: 'https://www.googleapis.com/auth/drive.appdata' })
    callback({ access_token: 'new', expires_in: 3600 })
    expect(await result).toBe('ok')
    expect(JSON.parse(localStorage.getItem('ember:sync:token')!)).toEqual({ value: 'new', expiresAt: NOW + 3_600_000 })
    expect(await b.connect(false)).toBe('ok')
  })

  it('needs the user when the pass has expired, and reports a refusal', async () => {
    const b = backendWith(vi.fn(), { value: 'old', expiresAt: NOW - 1 })
    expect(await b.connect(false)).toBe('needs-user')
    const r = b.connect(true)
    callback({ error: 'access_denied' })
    expect(await r).toBe('denied')
  })

  it('pulls nothing when there is no file, otherwise its text', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(json({ files: [] }))
      .mockResolvedValueOnce(json({ files: [{ id: 'f1' }] }))
      .mockResolvedValueOnce(new Response('{"app":"ember"}'))
    const b = backendWith(fetchFn as unknown as typeof fetch)
    expect(await b.pull()).toBeNull()
    expect(await b.pull()).toEqual({ text: '{"app":"ember"}' })
    const [listUrl, listInit] = fetchFn.mock.calls[0]
    expect(listUrl).toContain('spaces=appDataFolder')
    expect(decodeURIComponent(listUrl)).toContain("name='ember-data.json'")
    expect(listInit.headers.Authorization).toBe('Bearer tok')
    expect(fetchFn.mock.calls[2][0]).toBe('https://www.googleapis.com/drive/v3/files/f1?alt=media')
  })

  it('creates the file in the app folder once, then updates it in place', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(json({ files: [] }))
      .mockResolvedValueOnce(json({ id: 'f9' }))
      .mockResolvedValueOnce(json({ id: 'f9' }))
    const b = backendWith(fetchFn as unknown as typeof fetch)
    await b.push('one')
    await b.push('two')
    const [createUrl, createInit] = fetchFn.mock.calls[1]
    expect(createUrl).toBe('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart')
    expect(createInit.method).toBe('POST')
    expect(createInit.body).toContain('"parents":["appDataFolder"]')
    expect(createInit.body).toContain('"name":"ember-data.json"')
    expect(createInit.body).toContain('one')
    const [updateUrl, updateInit] = fetchFn.mock.calls[2]
    expect(updateUrl).toBe('https://www.googleapis.com/upload/drive/v3/files/f9?uploadType=media')
    expect(updateInit).toMatchObject({ method: 'PATCH', body: 'two' })
  })

  it('treats 401 as an expired sign-in and forgets the pass', async () => {
    const b = backendWith(vi.fn().mockResolvedValue(json({}, 401)) as unknown as typeof fetch)
    await expect(b.pull()).rejects.toBeInstanceOf(SyncAuthError)
    expect(localStorage.getItem('ember:sync:token')).toBeNull()
    await expect(b.pull()).rejects.toBeInstanceOf(SyncAuthError)
  })

  it('reports the network being down, and other Drive errors as errors', async () => {
    const down = backendWith(vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) as unknown as typeof fetch)
    await expect(down.pull()).rejects.toBeInstanceOf(SyncOfflineError)
    const broken = backendWith(vi.fn().mockResolvedValue(json({}, 500)) as unknown as typeof fetch)
    const e = await broken.pull().catch((x: unknown) => x)
    expect(e).toBeInstanceOf(Error)
    expect(e).not.toBeInstanceOf(SyncAuthError)
  })

  it('disconnect revokes the pass and forgets it', async () => {
    const b = backendWith(vi.fn())
    await b.disconnect()
    expect(revoke).toHaveBeenCalledWith('tok', expect.any(Function))
    expect(localStorage.getItem('ember:sync:token')).toBeNull()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/sync/drive.test.ts`
Expected: FAIL with "Drive backend not built yet".

- [ ] **Step 3: Implement** `src/sync/drive.ts`:

```ts
import { defaultStorage } from '../core/persist'
import { SyncAuthError, SyncOfflineError, type SyncBackend } from './backend'

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
const FILE_NAME = 'ember-data.json'
const TOKEN_KEY = 'ember:sync:token'
const GIS_SRC = 'https://accounts.google.com/gsi/client'
const API = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'

interface TokenResponse { access_token?: string; expires_in?: number; error?: string }
interface TokenClient { requestAccessToken(o?: { prompt?: string }): void }
interface GoogleOAuth {
  initTokenClient(c: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type: string }) => void }): TokenClient
  revoke(token: string, done?: () => void): void
}
interface GoogleNs { accounts: { oauth2: GoogleOAuth } }
declare global { interface Window { google?: GoogleNs } }

let gisPromise: Promise<GoogleNs> | null = null
/** Google Identity Services, loaded once. */
function loadGis(): Promise<GoogleNs> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google)
  if (gisPromise) return gisPromise
  gisPromise = new Promise<GoogleNs>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.onload = () => (window.google ? resolve(window.google) : reject(new Error('Google sign-in missing')))
    script.onerror = () => {
      gisPromise = null
      script.remove()
      reject(new SyncOfflineError('Google sign-in failed to load'))
    }
    document.head.appendChild(script)
  })
  return gisPromise
}

interface Token { value: string; expiresAt: number }

export function createDriveBackend(
  clientId: string,
  deps: { storage?: Storage; fetchFn?: typeof fetch; now?: () => number } = {},
): SyncBackend {
  const storage = deps.storage ?? defaultStorage()
  const fetchFn = deps.fetchFn ?? ((...a: Parameters<typeof fetch>) => fetch(...a))
  const now = deps.now ?? Date.now
  let google: GoogleNs | null = window.google?.accounts?.oauth2 ? window.google : null
  // Preload, so a later click can open the sign-in pop-up without waiting (browsers block it otherwise).
  if (!google) void loadGis().then((g) => { google = g }).catch(() => {})
  let fileId: string | null = null

  const readToken = (): Token | null => {
    try {
      const raw = storage?.getItem(TOKEN_KEY)
      return raw ? (JSON.parse(raw) as Token) : null
    } catch {
      return null
    }
  }
  const saveToken = (t: Token) => { try { storage?.setItem(TOKEN_KEY, JSON.stringify(t)) } catch { /* in-memory only */ } }
  const clearToken = () => { try { storage?.removeItem(TOKEN_KEY) } catch { /* ignore */ } }
  const validToken = (): Token | null => {
    const t = readToken()
    return t && t.expiresAt > now() + 60_000 ? t : null
  }

  async function api(url: string, init: RequestInit = {}): Promise<Response> {
    const t = validToken()
    if (!t) throw new SyncAuthError('Sign-in expired')
    let res: Response
    try {
      res = await fetchFn(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${t.value}` } })
    } catch {
      throw new SyncOfflineError('Network unreachable')
    }
    if (res.status === 401) {
      clearToken()
      throw new SyncAuthError('Sign-in expired')
    }
    if (!res.ok) throw new Error(`Drive ${res.status}`)
    return res
  }

  async function findFile(): Promise<string | null> {
    const q = encodeURIComponent(`name='${FILE_NAME}'`)
    const res = await api(`${API}?spaces=appDataFolder&q=${q}&fields=files(id)`)
    const body = (await res.json()) as { files?: { id: string }[] }
    fileId = body.files?.[0]?.id ?? null
    return fileId
  }

  return {
    connect(interactive) {
      if (validToken()) return Promise.resolve('ok')
      if (!interactive) return Promise.resolve('needs-user')
      const request = (g: GoogleNs) =>
        new Promise<'ok' | 'denied'>((resolve) => {
          const client = g.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: SCOPE,
            callback: (r) => {
              if (r.access_token) {
                saveToken({ value: r.access_token, expiresAt: now() + (r.expires_in ?? 3600) * 1000 })
                resolve('ok')
              } else resolve('denied')
            },
            error_callback: () => resolve('denied'),
          })
          client.requestAccessToken({ prompt: '' })
        })
      // Synchronous when the script is ready, so the pop-up opens inside the click.
      return google ? request(google) : loadGis().then(request, () => 'denied' as const)
    },

    async disconnect() {
      const t = readToken()
      clearToken()
      fileId = null
      if (t && google) await new Promise<void>((resolve) => google!.accounts.oauth2.revoke(t.value, () => resolve()))
    },

    async pull() {
      const id = await findFile()
      if (!id) return null
      const res = await api(`${API}/${id}?alt=media`)
      return { text: await res.text() }
    },

    async push(text) {
      const id = fileId ?? (await findFile())
      if (id) {
        await api(`${UPLOAD}/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: text })
        return
      }
      const boundary = `ember${Math.random().toString(36).slice(2)}`
      const meta = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] })
      const body =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${boundary}--`
      const res = await api(`${UPLOAD}?uploadType=multipart`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body })
      fileId = ((await res.json()) as { id: string }).id
    },
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/sync/drive.test.ts && npx vitest run && npm run typecheck`
Expected: PASS (7 Drive tests), full suite green, clean typecheck.

If `'signs in … from the click'` fails because `requested` is empty right after `b.connect(true)`, the backend didn't pick up `window.google` synchronously. Check that the `google` variable is set at creation, before any `await`.

- [ ] **Step 5: Commit**

```bash
git add src/sync/drive.ts src/sync/drive.test.ts
git commit -m "feat: Google Drive app-folder backend over Identity Services and REST"
```

---

### Task 9: Sync block, nav attention and restore wording

**Files:**
- Create: `src/components/SyncBlock.vue`
- Modify: `src/components/DataMenu.vue`
- Test: `src/components/SyncBlock.test.ts`, `src/components/DataMenu.test.ts`

**Interfaces:**
- Consumes: `useSyncStore` (Tasks 6–7), `syncedAgo` (Task 4), `FakeBackend`, `provideSyncBackend`.
- Produces: the UI described in the spec. When the Data menu closes during `'choose'`, `cancelChoice()` is called.

- [ ] **Step 1: Write the failing tests** in `src/components/SyncBlock.test.ts`:

```ts
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeSyncFile, sharedPart } from '../core/sync'
import { dataFixture, taskFixture } from '../core/test-fixtures'
import { useEmberStore } from '../stores/ember'
import { provideSyncBackend, useSyncStore, type SyncStatus } from '../stores/sync'
import { FakeBackend } from '../sync/test-backend'
import SyncBlock from './SyncBlock.vue'

const NOW = new Date(2026, 9, 5, 10, 0).getTime()

function setup(saved?: object) {
  if (saved) localStorage.setItem('ember:sync', JSON.stringify(saved))
  const backend = new FakeBackend()
  provideSyncBackend(backend)
  setActivePinia(createPinia())
  useEmberStore().replaceData(dataFixture({ tasks: [taskFixture('Here')] }))
  const sync = useSyncStore()
  const w = mount(SyncBlock, { attachTo: document.body })
  return { w, sync, backend }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  localStorage.clear()
})
afterEach(() => {
  provideSyncBackend(undefined)
  vi.useRealTimers()
})

describe('SyncBlock', () => {
  it('offers to connect when signed out', async () => {
    const { w, sync, backend } = setup()
    expect(w.find('.sb-note').text()).toBe('Keep Ember in step across your devices using your Google Drive.')
    await w.find('.sb-connect').trigger('click')
    await flushPromises()
    expect(sync.status).toBe('synced')
    expect(backend.pushes).toHaveLength(1)
    expect(w.find('.sb-status').text()).toBe('Synced · just now')
    w.unmount()
  })

  it.each<[SyncStatus, string, string[]]>([
    ['synced', 'Synced · 3 min ago', ['Sync now', 'Disconnect']],
    ['syncing', 'Syncing…', ['Disconnect']],
    ['offline', "Offline · will sync when you're back", ['Disconnect']],
    ['needs-reconnect', 'Sign-in expired', ['Reconnect', 'Disconnect']],
    ['error', "Couldn't sync", ['Try again', 'Disconnect']],
    ['unreadable', "The file in Drive couldn't be read", ["Replace Drive with this device's data", 'Disconnect']],
  ])('shows %s', async (status, text, buttons) => {
    const { w, sync } = setup({ connected: true, generation: 'g1', lastSyncedAt: NOW - 3 * 60_000 })
    sync.status = status
    await flushPromises()
    expect(w.find('.sb-status').text()).toBe(text)
    expect(w.find('.sb-status').attributes('role')).toBe('status')
    expect(w.findAll('.sb-actions button').map((b) => b.text())).toEqual(buttons)
    w.unmount()
  })

  it('asks which data to keep on first connection, focusing the recommended choice', async () => {
    const { w, sync, backend } = setup()
    backend.file = makeSyncFile(sharedPart(dataFixture({ tasks: [taskFixture('There')] })), 'g1', NOW - 86_400_000)
    await w.find('.sb-connect').trigger('click')
    await flushPromises()
    expect(w.find('.sb-choice p').text()).toBe('Your Drive already has Ember data (0 goals · 1 task · 0 focus sessions, last synced Oct 4).')
    expect(w.findAll('.sb-choice button').map((b) => b.text())).toEqual(["Use Drive's data here", "Replace Drive with this device's data", 'Cancel'])
    expect(document.activeElement).toBe(w.find('.sb-use').element)
    await w.find('.sb-use').trigger('click')
    expect(sync.status).toBe('synced')
    w.unmount()
  })
})
```

Add to `src/components/DataMenu.test.ts`. Add the imports `import { provideSyncBackend, useSyncStore } from '../stores/sync'` and `import { FakeBackend } from '../sync/test-backend'`, and put `afterEach(() => provideSyncBackend(undefined))` beside the existing hooks:

```ts
  it('hides sync when no Google client is configured', async () => {
    const { w } = setup()
    await w.find('.dm-toggle').trigger('click')
    expect(w.find('.sync-block').exists()).toBe(false)
    w.unmount()
  })

  it('marks the Data button when sync needs attention', async () => {
    provideSyncBackend(new FakeBackend())
    const { w } = setup()
    const sync = useSyncStore()
    expect(w.find('.dm-attn').exists()).toBe(false)
    expect(w.find('.dm-toggle').attributes('aria-label')).toBeUndefined()
    sync.status = 'needs-reconnect'
    await flushPromises()
    expect(w.find('.dm-attn').exists()).toBe(true)
    expect(w.find('.dm-toggle').attributes('aria-label')).toBe('Data, sync needs attention')
    w.unmount()
  })

  it('warns that a restore replaces other devices too, and starts a new generation', async () => {
    localStorage.setItem('ember:sync', JSON.stringify({ connected: true, generation: 'g1', lastSyncedAt: null }))
    const backend = new FakeBackend()
    provideSyncBackend(backend)
    const { w } = setup()
    await w.find('.dm-toggle').trigger('click')
    await pickFile(w, makeBackup(dataFixture({ tasks: [taskFixture('From backup')] }), NOW))
    expect(w.find('.dm-confirm p').text()).toContain('This also replaces the data on your other devices.')
    await w.find('.dm-replace').trigger('click')
    await flushPromises()
    expect(backend.file).toContain('From backup')
    expect(backend.file).not.toContain('"generation":"g1"')
    w.unmount()
  })

  it('cancels a pending first-connection choice when the menu closes', async () => {
    const backend = new FakeBackend()
    backend.file = '{"app":"ember","version":1,"generation":"g1","data":{"goals":[],"tasks":[],"logs":[],"settings":{}}}'
    provideSyncBackend(backend)
    const { w, ui } = setup()
    const sync = useSyncStore()
    await w.find('.dm-toggle').trigger('click')
    await sync.connect()
    expect(sync.status).toBe('choose')
    ui.dataMenuOpen = false
    await flushPromises()
    expect(sync).toMatchObject({ status: 'signed-out', connected: false })
    w.unmount()
  })
```

(`setup()` in `DataMenu.test.ts` creates the pinia. These tests call `provideSyncBackend` before `setup()`, so the sync store created inside it picks up the fake. Order matters.)

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/SyncBlock.test.ts src/components/DataMenu.test.ts`
Expected: FAIL. `SyncBlock.vue` doesn't exist, and `.dm-attn` doesn't exist.

- [ ] **Step 3: Implement.** Create `src/components/SyncBlock.vue`:

```vue
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { syncedAgo } from '../core/sync'
import { useEmberStore } from '../stores/ember'
import { useSyncStore } from '../stores/sync'

const sync = useSyncStore()
const ember = useEmberStore()
const useButton = ref<HTMLElement | null>(null)

const statusText = computed(() => {
  switch (sync.status) {
    case 'synced': return sync.lastSyncedAt ? `Synced · ${syncedAgo(sync.lastSyncedAt, ember.now)}` : 'Synced'
    case 'syncing': return 'Syncing…'
    case 'offline': return "Offline · will sync when you're back"
    case 'needs-reconnect': return 'Sign-in expired'
    case 'error': return "Couldn't sync"
    case 'unreadable': return "The file in Drive couldn't be read"
    default: return ''
  }
})

watch(() => sync.status, async (s) => {
  if (s !== 'choose') return
  await nextTick()
  useButton.value?.focus()
})
</script>

<template>
  <section class="sync-block" aria-labelledby="sb-title">
    <span id="sb-title" class="section-label">Sync</span>
    <template v-if="sync.status === 'signed-out'">
      <p class="sb-note">Keep Ember in step across your devices using your Google Drive.</p>
      <button class="btn btn-secondary sb-connect" @click="sync.connect()">Connect Google Drive</button>
    </template>
    <div v-else-if="sync.status === 'choose' && sync.choice" class="sb-choice">
      <p>Your Drive already has Ember data ({{ sync.choice.summary }}{{ sync.choice.from ? `, last synced ${sync.choice.from}` : '' }}).</p>
      <div class="sb-buttons">
        <button ref="useButton" class="btn btn-primary sb-use" @click="sync.useDriveData()">Use Drive's data here</button>
        <button class="btn btn-secondary sb-replace" @click="sync.replaceDrive()">Replace Drive with this device's data</button>
        <button class="btn btn-ghost sb-cancel" @click="sync.cancelChoice()">Cancel</button>
      </div>
    </div>
    <template v-else>
      <p class="sb-status" role="status">{{ statusText }}</p>
      <div class="sb-actions">
        <button v-if="sync.status === 'needs-reconnect'" class="btn btn-primary sb-reconnect" @click="sync.reconnect()">Reconnect</button>
        <button v-if="sync.status === 'error'" class="btn btn-secondary sb-retry" @click="sync.syncNow()">Try again</button>
        <button v-if="sync.status === 'unreadable'" class="btn btn-secondary sb-replace" @click="sync.replaceDrive()">Replace Drive with this device's data</button>
        <button v-if="sync.status === 'synced'" class="btn btn-secondary sb-now" @click="sync.syncNow()">Sync now</button>
        <button class="btn btn-ghost sb-disconnect" @click="sync.disconnect()">Disconnect</button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.sync-block {
  display: flex; flex-direction: column; gap: var(--space-2);
  padding-bottom: var(--space-4); margin-bottom: var(--space-2); border-bottom: 1px solid var(--color-divider);
}
.sb-note, .sb-status { font-size: 12px; color: var(--color-neutral-700); }
.sb-status { font-size: 13px; color: var(--color-text); }
.sb-choice { display: flex; flex-direction: column; gap: var(--space-3); font-size: 14px; }
.sb-actions, .sb-buttons { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.sb-buttons { flex-direction: column; align-items: flex-start; }
</style>
```

(The `.sb-buttons` row is separate from `.sb-actions` so the status test's `.sb-actions button` selector never includes the choice buttons.)

Modify `src/components/DataMenu.vue`:
- Imports: `import { useSyncStore } from '../stores/sync'` and `import SyncBlock from './SyncBlock.vue'`. Add `const sync = useSyncStore()`.
- In `replace()`, after `ember.restore(pending.value.data)`, add `if (sync.connected) void sync.afterRestore()`.
- In the existing `watch(() => ui.dataMenuOpen, …)` else-branch, add `if (sync.status === 'choose') void sync.cancelChoice()`.
- Toggle button: add `:aria-label="sync.needsAttention ? 'Data, sync needs attention' : undefined"`. Make its content `Data<span v-if="sync.needsAttention" class="dm-attn" aria-hidden="true"></span><ChevronDown … />`.
- Panel: insert `<SyncBlock v-if="sync.configured" />` as the first child of `.dm-panel`, before `<span class="section-label">Your data</span>`.
- Confirm paragraph: `<p>Replace everything with the backup from {{ pending.from }}? ({{ pending.summary }}) This can't be undone.<template v-if="sync.connected"> This also replaces the data on your other devices.</template></p>`.
- Style: `.dm-attn { width: 8px; height: 8px; background: var(--color-accent); }`.

- [ ] **Step 4: Run the tests and the whole suite**

Run: `npx vitest run src/components && npx vitest run && npm run typecheck`
Expected: PASS everywhere.

- [ ] **Step 5: Browser check.** Run `npm run dev` without a client ID: the Data menu looks exactly as before. Then check the block's look with a fake backend:
1. Temporarily set `VITE_GOOGLE_CLIENT_ID=test` in `.env.local`.
2. Open the Data menu at 1280px and 360px: the "Connect Google Drive" block fits, with no horizontal scroll.
3. Delete `.env.local` afterwards.

Expected: the block renders in the Data menu's style. Connecting itself can't be tested without a real client ID, which happens in Task 12.

- [ ] **Step 6: Commit**

```bash
git add src/components/SyncBlock.vue src/components/SyncBlock.test.ts src/components/DataMenu.vue src/components/DataMenu.test.ts
git commit -m "feat: Sync block in the Data menu; nav attention mark; restore replaces other devices"
```

---

### Task 10: Installable app (PWA) and update bar

**Files:**
- Create: `src/pwa/options.ts`, `src/pwa/register.ts`, `src/components/UpdateBar.vue`, `public/icon.svg`, `pwa-assets.config.ts`
- Generated: `public/pwa-64x64.png`, `public/pwa-192x192.png`, `public/pwa-512x512.png`, `public/maskable-icon-512x512.png`, `public/apple-touch-icon-180x180.png`, `public/favicon.ico`
- Modify: `package.json`, `vite.config.ts`, `index.html`, `tsconfig.app.json`, `src/App.vue`
- Test: `src/pwa/options.test.ts`, `src/components/UpdateBar.test.ts`

**Interfaces:**
- Produces:
  - `pwaOptions: Partial<VitePWAOptions>`
  - `useAppUpdate(): { needRefresh: Ref<boolean>; update: () => void; dismiss: () => void }`
  - `<UpdateBar />`

- [ ] **Step 1: Install the dependencies**

Run: `npm install -D vite-plugin-pwa@^2 @vite-pwa/assets-generator@^2 workbox-window@^7`
Expected: installs without peer-dependency errors (vite-plugin-pwa 2.0 lists Vite ^8).

- [ ] **Step 2: Write the failing tests.** `src/pwa/options.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { pwaOptions } from './options'

type Rule = { urlPattern: (o: { url: URL }) => boolean; handler: string }
const rules = () => (pwaOptions.workbox?.runtimeCaching ?? []) as unknown as Rule[]
const handlerFor = (href: string) => rules().find((r) => r.urlPattern({ url: new URL(href) }))?.handler ?? null

describe('PWA options', () => {
  it('describes Ember as a standalone app in its colours', () => {
    expect(pwaOptions.registerType).toBe('prompt')
    expect(pwaOptions.manifest).toMatchObject({ name: 'Ember', short_name: 'Ember', display: 'standalone', background_color: '#201e1d', theme_color: '#ec3013', start_url: '.', scope: '.' })
  })

  it('lists the install icons, including a maskable one', () => {
    const icons = (pwaOptions.manifest && pwaOptions.manifest.icons) || []
    expect(icons.map((i) => `${i.sizes}${i.purpose ? ` ${i.purpose}` : ''}`)).toEqual(['64x64', '192x192', '512x512', '512x512 maskable'])
  })

  it('caches Google Fonts for offline use, but never sign-in or Drive', () => {
    expect(handlerFor('https://fonts.googleapis.com/css2?family=Archivo')).toBe('StaleWhileRevalidate')
    expect(handlerFor('https://fonts.gstatic.com/s/archivo/v1/a.woff2')).toBe('CacheFirst')
    expect(handlerFor('https://accounts.google.com/gsi/client')).toBeNull()
    expect(handlerFor('https://www.googleapis.com/drive/v3/files')).toBeNull()
    expect(handlerFor('https://www.youtube.com/iframe_api')).toBeNull()
  })
})
```

`src/components/UpdateBar.test.ts`:

```ts
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const needRefresh = ref(false)
const update = vi.fn()
const dismiss = vi.fn(() => { needRefresh.value = false })
vi.mock('../pwa/register', () => ({ useAppUpdate: () => ({ needRefresh, update, dismiss }) }))

import UpdateBar from './UpdateBar.vue'

describe('UpdateBar', () => {
  it('appears only when a new version is waiting; Reload applies it, × hides it', async () => {
    const w = mount(UpdateBar)
    expect(w.find('.update-bar').exists()).toBe(false)
    expect(w.find('.update-region').attributes('role')).toBe('status')
    needRefresh.value = true
    await w.vm.$nextTick()
    expect(w.find('.ub-text').text()).toBe('A new version of Ember is ready')
    await w.find('.up-reload').trigger('click')
    expect(update).toHaveBeenCalledTimes(1)
    await w.find('.up-close').trigger('click')
    expect(w.find('.update-bar').exists()).toBe(false)
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run src/pwa src/components/UpdateBar.test.ts`
Expected: FAIL. `./options` and `./UpdateBar.vue` can't be resolved.

- [ ] **Step 4: Implement.** `src/pwa/options.ts`:

```ts
import type { VitePWAOptions } from 'vite-plugin-pwa'

/** Installable Ember: own window, ink launch screen, red title bar; offline app shell; fonts cached after first use. */
export const pwaOptions: Partial<VitePWAOptions> = {
  registerType: 'prompt',
  includeAssets: ['icon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
  manifest: {
    name: 'Ember',
    short_name: 'Ember',
    description: 'Tasks, learning goals and a focus timer.',
    display: 'standalone',
    start_url: '.',
    scope: '.',
    background_color: '#201e1d',
    theme_color: '#ec3013',
    icons: [
      { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
      { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
    runtimeCaching: [
      {
        urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
        handler: 'StaleWhileRevalidate',
        options: { cacheName: 'google-fonts-css' },
      },
      {
        urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
        handler: 'CacheFirst',
        options: { cacheName: 'google-fonts', expiration: { maxEntries: 20, maxAgeSeconds: 31_536_000 }, cacheableResponse: { statuses: [0, 200] } },
      },
    ],
  },
}
```

`src/pwa/register.ts`:

```ts
import { useRegisterSW } from 'virtual:pwa-register/vue'

/** A waiting new version: the app asks before reloading, so a running timer or Focus mode is never interrupted. */
export function useAppUpdate() {
  const { needRefresh, updateServiceWorker } = useRegisterSW()
  return {
    needRefresh,
    update: () => { void updateServiceWorker(true) },
    dismiss: () => { needRefresh.value = false },
  }
}
```

`src/components/UpdateBar.vue`:

```vue
<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { useAppUpdate } from '../pwa/register'

const { needRefresh, update, dismiss } = useAppUpdate()
</script>

<template>
  <div role="status" aria-live="polite" class="update-region">
    <div v-if="needRefresh" class="update-bar">
      <span class="ub-text">A new version of Ember is ready</span>
      <button class="btn btn-ghost up-reload" @click="update()">Reload</button>
      <button class="icon-btn up-close" aria-label="Dismiss" @click="dismiss()"><X :size="16" :stroke-width="2.25" /></button>
    </div>
  </div>
</template>

<style scoped>
/* Bottom-right, so it never covers the undo bar (bottom-left). */
.update-region { position: fixed; right: var(--space-6); bottom: var(--space-6); z-index: 90; max-width: calc(100% - 2 * var(--space-6)); }
.update-bar {
  display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
  background: var(--color-text); color: var(--color-bg); font-size: 14px;
}
.ub-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.up-reload { color: var(--color-accent-400); }
.up-close { color: inherit; }
.up-close:hover { background: color-mix(in srgb, var(--color-bg) 15%, transparent); }
@media (max-width: 520px) {
  .update-region { left: var(--space-4); right: var(--space-4); bottom: var(--space-4); max-width: none; }
}
</style>
```

`public/icon.svg`. Its "E" sits inside the maskable safe zone, a circle of radius 204 around the centre:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#ec3013"/>
  <g fill="#f3f2f2">
    <rect x="160" y="128" width="64" height="256"/>
    <rect x="160" y="128" width="192" height="56"/>
    <rect x="160" y="228" width="160" height="56"/>
    <rect x="160" y="328" width="192" height="56"/>
  </g>
</svg>
```

`pwa-assets.config.ts`:

```ts
import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

export default defineConfig({ preset: minimal2023Preset, images: ['public/icon.svg'] })
```

In `package.json`, add the script `"icons": "pwa-assets-generator"` and run it: `npm run icons`. Expected: the six PNG/ICO files listed above appear in `public/`.

`vite.config.ts`:

```ts
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'
import { pwaOptions } from './src/pwa/options'

export default defineConfig({
  // GitHub Pages serves from /<repo>/ (set by the deploy workflow); everything else from /.
  base: process.env.BASE_PATH ?? '/',
  plugins: [vue(), VitePWA(pwaOptions)],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    env: { VITE_GOOGLE_CLIENT_ID: '' },
  },
})
```

In `tsconfig.app.json`, change `"types": ["vite/client"]` to `"types": ["vite/client", "vite-plugin-pwa/vue"]`.

`index.html`: replace the data-URI `<link rel="icon" …>` with:

```html
    <link rel="icon" href="/favicon.ico" sizes="48x48" />
    <link rel="icon" href="/icon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png" />
    <meta name="theme-color" content="#ec3013" />
```

`src/App.vue`: `import UpdateBar from './components/UpdateBar.vue'`, and add `<UpdateBar />` after `<UndoBar />`.

- [ ] **Step 5: Run the tests and the whole suite**

Run: `npx vitest run src/pwa src/components/UpdateBar.test.ts && npx vitest run && npm run typecheck`
Expected: PASS.

If `App.test.ts` fails with "Failed to resolve import virtual:pwa-register/vue", the PWA plugin doesn't provide its virtual module under Vitest. Add `vi.mock('./pwa/register', () => ({ useAppUpdate: () => ({ needRefresh: { value: false }, update: () => {}, dismiss: () => {} }) }))` to `App.test.ts`, and ledger the ruling.

- [ ] **Step 6: Build and check offline in the browser**

Run: `npm run build && npx vite preview --port 4321`

Expected:
- `dist/sw.js` and `dist/manifest.webmanifest` exist.
- In Chrome at http://localhost:4321, DevTools → Application → Manifest shows Ember with icons and no errors, and Chrome's install button appears.
- Then stop the preview server and reload: Ember still opens.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vite.config.ts index.html tsconfig.app.json pwa-assets.config.ts public src/pwa src/components/UpdateBar.vue src/components/UpdateBar.test.ts src/App.vue
git commit -m "feat: installable offline app with icons and an update prompt"
```

---

### Task 11: Deploy workflow, setup docs and report

**Files:**
- Create: `.github/workflows/deploy.yml`, `README.md`, `.env.example`
- Modify: `.gitignore`, `docs/design/build-report.md`, `CLAUDE.md`

- [ ] **Step 1: Write `.github/workflows/deploy.yml`**

```yaml
name: Deploy
on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
        env:
          BASE_PATH: /${{ github.event.repository.name }}/
          VITE_GOOGLE_CLIENT_ID: ${{ vars.VITE_GOOGLE_CLIENT_ID }}
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Verify the production build with a sub-path**

Run: `BASE_PATH=/ember/ npm run build && grep -c '/ember/' dist/index.html`
Expected: a count of at least 3 (script, stylesheet and icons are prefixed). `dist/manifest.webmanifest` has `"start_url":"."`.

- [ ] **Step 3: Write `.env.example`, `.gitignore` and `README.md`**

`.env.example`:

```
# Google OAuth client ID (Web application). Empty = sync turned off.
VITE_GOOGLE_CLIENT_ID=
```

Append `*.local` to `.gitignore`.

`README.md`:

````markdown
# Ember

Tasks, learning goals and a pomodoro focus timer. Local-first: data lives in your browser, and can sync between devices through your own Google Drive.

## Develop

```bash
npm install
npm run dev        # http://localhost:5199 with `-- --port 5199`
npm test
npm run build
```

## Install as an app

Open the hosted address in Chrome (Mac or Android) and choose **Install app** (Safari on Mac: **File → Add to Dock**). Ember then opens in its own window and works offline. When a new version is deployed, a bar offers **Reload**.

## One-time setup: hosting and sync

1. **GitHub.** Create a public repo named `ember`, push `main`, then **Settings → Pages → Source: GitHub Actions**. Each push to `main` tests, builds and deploys to `https://<you>.github.io/ember/`.
2. **Google Cloud** (https://console.cloud.google.com):
   1. Create a project, e.g. "Ember".
   2. **APIs & Services → Library**: enable **Google Drive API**.
   3. **OAuth consent screen**: External; app name Ember; your email; scope `.../auth/drive.appdata`; publishing status **Testing**; add yourself as a test user.
   4. **Credentials → Create credentials → OAuth client ID → Web application.** Authorised JavaScript origins: `https://<you>.github.io` and `http://localhost:5199`. No redirect URIs.
3. **Client ID.**
   - GitHub: **Settings → Secrets and variables → Actions → Variables → New repository variable** `VITE_GOOGLE_CLIENT_ID`, then re-run the Deploy workflow.
   - Locally: copy `.env.example` to `.env.local` and fill it in.
4. **Optional: stop the weekly sign-in.** While the consent screen is in Testing, Google expires sign-in after 7 days. **OAuth consent screen → Publish app** removes that; the `drive.appdata` scope doesn't need Google's review.

## Moving your data onto the hosted app

1. In the app you've been using (e.g. http://localhost:5199): **Data → Connect Google Drive**. Drive is empty, so your data uploads.
2. On each other device: open the hosted app, **Data → Connect Google Drive → Use Drive's data here**.

## How sync behaves

- Syncs when Ember opens, when you come back to it, 5 seconds after a change, and every minute while it's open.
- The timer, the selected task, sound and demo speed stay per device; finished focus sessions sync.
- Edits on two devices merge item by item; the newest edit to the same item wins. Deletes sync.
- Google's sign-in lasts an hour; after that the Data menu shows **Reconnect**. Your work carries on locally meanwhile.
- **Restore** while connected replaces the data on all devices (each keeps a safety copy).
- Data → **Disconnect** stops syncing; your data and the Drive file are kept.
````

- [ ] **Step 4: Update `docs/design/build-report.md` and `CLAUDE.md`**

In the build report's "What was built" list, after the Settings line, add:

```markdown
- **Sync, hosting and install (added after the handoff):**
  - Ember syncs tasks, goals, focus history and shared settings through one hidden file in your Google Drive. It uses the `drive.appdata` scope, Google Identity Services and the Drive REST API, with no server.
  - Every item carries an "updated at" stamp set when the store saves. Merges go item by item at every level, and the newest edit wins.
  - A generation ID makes a restore replace the data on every device.
  - The timer, selection, sound and demo speed stay per device.
  - Sync runs on open, on return, 5 s after a change, every minute while open, and when the network returns.
  - Sign-in lasts an hour, then the Data menu offers **Reconnect**.
  - Hosted on GitHub Pages and installable as an offline app, with an update bar.
  - The storage interface (`pull`/`push`/`subscribe`) and run-based log IDs (`focus-<endsAt>`) leave room for live updates and a shared timer later.
```

Replace the "Suggested next steps" list with:

```markdown
1. Live updates and a shared timer: a backend with `subscribe` (e.g. Firestore), and `timer`/`selection` moved out of `DEVICE_ONLY`.
```

In `CLAUDE.md`, add one line under Architecture:

```markdown
- Sync: `src/core/sync.ts` (pure merge/stamp), `src/stores/sync.ts` (controller), `src/sync/` (backends). The store stamps `updatedAt` on save; data from outside goes through `replaceData`/`applyShared` and is never stamped.
```

- [ ] **Step 5: Run everything**

Run: `npx vitest run && npm run build`
Expected: all green and the build succeeds.

- [ ] **Step 6: Commit**

```bash
git add .github .env.example .gitignore README.md docs/design/build-report.md CLAUDE.md
git commit -m "docs: deploy workflow, setup guide and report for sync and install"
```

---

### Task 12: Real-world check (with the user)

This task has outward-facing steps (creating a GitHub repo, pushing, and Google Cloud setup), so **stop and ask the user before each one**. Nothing here changes code unless a check fails. If one fails, the fix goes in test-first, as in earlier tasks.

- [ ] **Step 1: Walk the user through README steps 1–3.** They create the repo, Pages, Google project and client ID. Ask before running `git remote add` and `git push`.
- [ ] **Step 2: Dev app connects and uploads.**
  1. With `.env.local` set, run `npm run dev -- --port 5199`.
  2. Data → Connect Google Drive → Google pop-up → "Synced · just now".
  3. In Google Drive, Settings → Manage apps should list Ember with hidden app data.
- [ ] **Step 3: The hosted app adopts the data.**
  1. Open `https://<user>.github.io/ember/` in a second Chrome profile.
  2. Connect → "Your Drive already has Ember data (…)" → Use Drive's data here.
  3. The same tasks and goals appear, and the goal colours match.
- [ ] **Step 4: Edits flow both ways.**
  1. Add a task in one profile; it appears in the other within about a minute, or on switching back to its tab.
  2. Tick a step in one profile and add a step to the same goal in the other while offline (DevTools → Network → Offline). Go back online: both changes survive in both profiles.
- [ ] **Step 5: Restore replaces everywhere.** Back up, make an edit, then restore the backup in profile A. Profile B adopts it on its next sync, and `ember:v1:before-restore` exists in B.
- [ ] **Step 6: Reconnect.**
  1. In profile A's DevTools, set `ember:sync:token`'s `expiresAt` to 0, then reload.
  2. Expected: the nav shows the attention square, and Data shows "Sign-in expired".
  3. Click Reconnect → "Synced".
- [ ] **Step 7: Install and offline.**
  1. Install from the hosted address on the Mac (Chrome install button) and on the Android phone (Chrome → Install app).
  2. Connect on the phone and choose Use Drive's data here.
  3. Airplane mode → Ember still opens, and edits sync once back online.
- [ ] **Step 8: Record the results** in the ledger, and note any differences in the build report.

---

## Self-review

**1. Spec coverage:**

| Spec section | Task |
|---|---|
| What syncs | 2 |
| Data changes | 1, 5 |
| Merge rules | 3 |
| Generations | 6 |
| Sync file | 4 |
| Architecture: core | 2–4 |
| Architecture: interface and Drive | 6, 8 |
| Architecture: controller and triggers | 6, 7 |
| First connection | 6, 9 |
| UI | 9 |
| Restore while connected | 9 |
| Hosting and PWA | 10, 11 |
| Setup docs | 11 |
| Built for live and shared timer | 6 (`subscribe` path tested in 7), 1, 2 |
| Accessibility | 9 |
| Testing | every task; real check in 12 |

**2. Placeholders:** none. Every code step has the code.

**3. Type consistency:**
- `SharedData`, `SyncBackend`, `SyncStatus`, `provideSyncBackend`, `applyShared(shared, { safetyCopy })` and `createDriveBackend(clientId, deps?)` match across tasks.
- The `choice` shape `{ summary, from }` is the same in Tasks 6 and 9.

**4. Review Focus:** each of the five lines has a test in its owning task: 3 (skew, order), 5 (deleted selection), 6 (pass expiring mid-sync), 7 (edit during upload).
