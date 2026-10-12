# Resources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A library of learning resources (link, company, type, status, cost, notes, optional goal) with its own Resources tab, shown where the focus loop needs it: the goal page, the focus bar, Focus mode, and renewal reminders on Today and Upcoming.

**Architecture:** A `resources: Resource[]` list on `EmberData`/`SharedData`, persisted, synced and backed up like tasks (soft delete, `updatedAt` stamps, union-by-id merge). Pure logic in two new core files: `src/core/companies.ts` (link normalising, company/type/title detection, duplicates, suggestions) and `src/core/resources.ts` (repair, costs, renewals, list view-models). The store gains add/update/delete/keep/cancel actions; components only render what core returns.

**Tech Stack:** Vue 3 `<script setup>` + TypeScript + Pinia, plain CSS tokens, lucide-vue-next, Vitest + jsdom + @vue/test-utils.

**Spec:** `docs/superpowers/specs/2026-10-12-ember-resources-design.md` (mockups: https://claude.ai/artifact/KXSEhDtbZ5AyUE8kZDDymS)

## Global Constraints

- `src/core/` imports no `vue`/`pinia`.
- Visual rules: zero radius; 2px rules between major sections, 1px between list rows; button labels flush left; red accent sparingly (paragraph-size accent text = `--color-accent-700`, class `text-accent`); no gradients, emoji or shadows (Focus mode's blurred panels are the existing exception).
- Red is used only for: the active nav tab, primary Add buttons, and renewals due within 7 days.
- Currency is £ only. Money text: `£49` for whole pounds, `£9.99` otherwise (`money()` in core/resources).
- Dates shown with the app's `dayLabel` ("Oct 15"), adding `, 2027` when the year differs from today's.
- No `DATA_VERSION` bump: a missing `resources` list always loads as `[]`.
- Only `http:`/`https:` links are ever stored or rendered as `href`.
- Links to resources open with `target="_blank" rel="noopener noreferrer"`.
- Copy: "subscriptions" in the money line (any type can recur); "Membership" is a type.
- Commands: `npx vitest run <file>` for one file, `npm test` for all, `npm run typecheck`, `npm run build`.

## Review Focus

1. A `javascript:` or `data:` link arriving through a restore, another tab or the Drive file must never become an `href`: repair drops it (Task 2 test).
2. A monthly renewal anchored on the 31st, or entered months ago, must step to the right next date (31 Jan → 28/29 Feb → 31 Mar), never drift or loop (Task 4 test).
3. "Keep it" dismisses only this renewal: once that date passes, the next cycle's reminder appears again (Task 4 test).
4. Deleting a goal: its resources show no goal and leave the focus bar and goal strip; undoing the delete brings them back (Task 4 and Task 11 tests).
5. Saving a paid cost with a blank, zero or negative price leaves a clean free resource, never `NaN`/`£0` text (Task 5 test).

---

## Phase A — data and logic

### Task 1: Resource model and link detection

**Files:**
- Modify: `src/core/model.ts`
- Create: `src/core/companies.ts`
- Test: `src/core/companies.test.ts`
- Modify: `src/core/test-fixtures.ts`

**Interfaces:**
- Produces (model.ts): `ResourceType`, `RESOURCE_TYPES`, `ResourceStatus`, `RESOURCE_STATUSES`, `Billing`, `BILLINGS`, `interface Resource`.
- Produces (companies.ts): `normaliseUrl(text: string): string | null`, `hostOf(url: string): string`, `shortLink(url: string): string`, `detect(url: string, existing: Resource[]): Detected` with `interface Detected { company: string; type: ResourceType; title: string }`, `linkKey(url: string): string`, `findDuplicate(url: string, rs: Resource[]): Resource | null`, `companySuggestions(rs: Resource[], typed: string): string[]`.
- Produces (test-fixtures.ts): `resourceFixture(title: string, patch?: Partial<Resource>): Resource`.

- [ ] **Step 1: Add the types** to `src/core/model.ts`, after the `Task` interface:

```ts
export type ResourceType = 'course' | 'video' | 'docs' | 'model' | 'article' | 'tool' | 'membership' | 'other'
export const RESOURCE_TYPES: ResourceType[] = ['course', 'video', 'docs', 'model', 'article', 'tool', 'membership', 'other']
export type ResourceStatus = 'using' | 'later' | 'finished' | 'dropped'
export const RESOURCE_STATUSES: ResourceStatus[] = ['using', 'later', 'finished', 'dropped']
export type Billing = 'free' | 'once' | 'month' | 'year'
export const BILLINGS: Billing[] = ['free', 'once', 'month', 'year']

export interface Resource {
  id: string
  title: string
  /** Always http(s), normalised (see core/companies normaliseUrl). */
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
  /** Soft delete: hidden from live views, kept for history. */
  deletedOn?: ISODate | null
  /** Last edit, epoch ms (sync merge: newer wins). Missing = oldest. */
  updatedAt?: number
}
```

Add to `src/core/test-fixtures.ts` (import `Resource` from `./model`):

```ts
/** id = title; a free, in-use course at example.com with no goal. */
export function resourceFixture(title: string, patch: Partial<Resource> = {}): Resource {
  return {
    id: title, title, url: `https://example.com/${encodeURIComponent(title)}`, company: 'Example', type: 'course',
    status: 'using', goalId: null, billing: 'free', price: null, renewsOn: null, notes: '', createdAt: '2026-09-01',
    ...patch,
  }
}
```

- [ ] **Step 2: Write the failing tests** in `src/core/companies.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { companySuggestions, detect, findDuplicate, hostOf, linkKey, normaliseUrl, shortLink } from './companies'
import { resourceFixture } from './test-fixtures'

describe('normaliseUrl', () => {
  it.each([
    ['https://www.HuggingFace.co/learn/llm-course/', 'https://huggingface.co/learn/llm-course'],
    ['  coursera.org/learn/machine-learning ', 'https://coursera.org/learn/machine-learning'],
    ['https://example.com/a?utm_source=x&id=3#top', 'https://example.com/a?id=3'],
    ['http://example.com', 'http://example.com'],
    ['https://example.com:8080/x', 'https://example.com:8080/x'],
  ])('%s → %s', (input, out) => {
    expect(normaliseUrl(input)).toBe(out)
  })

  it.each(['', 'hello world', 'javascript:alert(1)', 'data:text/html,hi', 'mailto:a@b.co', 'ftp://example.com', 'https://localhost'])(
    'rejects %j',
    (input) => { expect(normaliseUrl(input)).toBeNull() },
  )
})

describe('hostOf and shortLink', () => {
  it('reads the host without www, and a short link without the scheme', () => {
    expect(hostOf('https://www.youtube.com/watch?v=abc')).toBe('youtube.com')
    expect(hostOf('not a url')).toBe('')
    expect(shortLink('https://huggingface.co/learn/llm-course')).toBe('huggingface.co/learn/llm-course')
    expect(shortLink('https://example.com')).toBe('example.com')
  })
})

describe('detect', () => {
  it.each([
    ['https://huggingface.co/learn/llm-course', 'Hugging Face', 'course', 'Llm course'],
    ['https://huggingface.co/docs/transformers', 'Hugging Face', 'docs', 'Transformers'],
    ['https://huggingface.co/spaces/org/demo', 'Hugging Face', 'tool', 'Demo'],
    ['https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2', 'Hugging Face', 'model', 'all-MiniLM-L6-v2'],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ', 'YouTube', 'video', ''],
    ['https://youtu.be/dQw4w9WgXcQ', 'YouTube', 'video', ''],
    ['https://coursera.org/learn/machine-learning', 'Coursera', 'course', 'Machine learning'],
    ['https://observablehq.com/@d3/gallery', 'Observable', 'docs', 'Gallery'],
    ['https://someone.substack.com/p/why-charts-lie', 'Substack', 'article', 'Why charts lie'],
    ['https://docs.python.org/3/tutorial', 'docs.python.org', 'docs', 'Tutorial'],
    ['https://3blue1brown.com/lessons/neural-networks', '3blue1brown.com', 'article', 'Neural networks'],
    ['https://medium.com/@me/learning-d3-8f3a2b1c9d0e', 'Medium', 'article', 'Learning d3'],
    ['https://example.com/posts/12345', 'example.com', 'article', 'Posts'],
    ['https://example.com', 'example.com', 'article', ''],
  ])('%s', (url, company, type, title) => {
    expect(detect(url, [])).toEqual({ company, type, title })
  })

  it("uses the user's own spelling for a host they've saved before", () => {
    const mine = resourceFixture('Old', { url: 'https://3blue1brown.com/lessons/one', company: '3Blue1Brown' })
    expect(detect('https://3blue1brown.com/lessons/two', [mine]).company).toBe('3Blue1Brown')
    const gone = { ...mine, deletedOn: '2026-09-01' }
    expect(detect('https://3blue1brown.com/lessons/two', [gone]).company).toBe('3blue1brown.com')
  })
})

describe('duplicates', () => {
  it('matches the same YouTube video across link styles, and other links after normalising', () => {
    expect(linkKey('https://youtu.be/dQw4w9WgXcQ')).toBe(linkKey('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30'))
    expect(linkKey('https://example.com/a?v=dQw4w9WgXcQ')).not.toBe(linkKey('https://youtu.be/dQw4w9WgXcQ'))
    const saved = resourceFixture('Joins', { url: 'https://youtube.com/watch?v=dQw4w9WgXcQ' })
    const site = resourceFixture('Site', { url: 'https://example.com/a' })
    expect(findDuplicate('https://youtu.be/dQw4w9WgXcQ', [saved, site])?.id).toBe('Joins')
    expect(findDuplicate('https://www.example.com/a/?utm_source=x', [saved, site])?.id).toBe('Site')
    expect(findDuplicate('https://example.com/b', [saved, site])).toBeNull()
    expect(findDuplicate('https://example.com/a', [{ ...site, deletedOn: '2026-09-01' }])).toBeNull()
  })
})

describe('companySuggestions', () => {
  it('lists live companies containing the text, most used first, never the exact text', () => {
    const rs = [
      resourceFixture('A', { company: 'YouTube' }), resourceFixture('B', { company: 'YouTube' }),
      resourceFixture('C', { company: 'Coursera' }), resourceFixture('D', { company: 'Udemy', deletedOn: '2026-09-01' }),
    ]
    expect(companySuggestions(rs, '')).toEqual(['YouTube', 'Coursera'])
    expect(companySuggestions(rs, 'ou')).toEqual(['YouTube', 'Coursera'])
    expect(companySuggestions(rs, 'cour')).toEqual(['Coursera'])
    expect(companySuggestions(rs, 'coursera')).toEqual([])
    expect(companySuggestions(rs, 'udemy')).toEqual([])
  })
})
```

- [ ] **Step 3: Run** `npx vitest run src/core/companies.test.ts`. Expect failure: cannot find module `./companies`.

- [ ] **Step 4: Implement** `src/core/companies.ts`:

```ts
import type { Resource, ResourceType } from './model'
import { ytId } from './youtube'

interface Site { host: string; company: string; type: ResourceType }

/** Known sites, matched by host or any subdomain of it. */
const SITES: Site[] = [
  { host: 'huggingface.co', company: 'Hugging Face', type: 'model' },
  { host: 'youtube.com', company: 'YouTube', type: 'video' },
  { host: 'youtu.be', company: 'YouTube', type: 'video' },
  { host: 'coursera.org', company: 'Coursera', type: 'course' },
  { host: 'udemy.com', company: 'Udemy', type: 'course' },
  { host: 'edx.org', company: 'edX', type: 'course' },
  { host: 'github.com', company: 'GitHub', type: 'tool' },
  { host: 'kaggle.com', company: 'Kaggle', type: 'course' },
  { host: 'fast.ai', company: 'fast.ai', type: 'course' },
  { host: 'observablehq.com', company: 'Observable', type: 'docs' },
  { host: 'arxiv.org', company: 'arXiv', type: 'article' },
  { host: 'medium.com', company: 'Medium', type: 'article' },
  { host: 'substack.com', company: 'Substack', type: 'article' },
  { host: 'skillshare.com', company: 'Skillshare', type: 'course' },
  { host: 'domestika.org', company: 'Domestika', type: 'course' },
  { host: 'frontendmasters.com', company: 'Frontend Masters', type: 'course' },
  { host: 'developer.mozilla.org', company: 'MDN', type: 'docs' },
  { host: 'dev.to', company: 'DEV', type: 'article' },
]

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i
const DOMAINISH = /^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#:]|$)/i

/** An http(s) link in one canonical form (lower-case host, no www, hash, utm_* or trailing slash), or null. */
export function normaliseUrl(text: string): string | null {
  let s = text.trim()
  if (!s) return null
  if (!HAS_SCHEME.test(s)) {
    if (!DOMAINISH.test(s)) return null
    s = `https://${s}`
  }
  let u: URL
  try {
    u = new URL(s)
  } catch {
    return null
  }
  if ((u.protocol !== 'http:' && u.protocol !== 'https:') || !u.hostname.includes('.')) return null
  for (const k of [...u.searchParams.keys()]) if (k.toLowerCase().startsWith('utm_')) u.searchParams.delete(k)
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  const path = u.pathname.replace(/\/+$/, '')
  const query = u.searchParams.toString()
  return `${u.protocol}//${host}${u.port ? `:${u.port}` : ''}${path}${query ? `?${query}` : ''}`
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** "huggingface.co/learn/llm-course": the link without its scheme. */
export const shortLink = (url: string): string => url.replace(/^https?:\/\//, '')

const siteFor = (host: string): Site | undefined => SITES.find((s) => host === s.host || host.endsWith(`.${s.host}`))

function decode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** All digits, or a long run of letters and digits with at least one digit (video ids, hashes). */
const isIdLike = (s: string): boolean => /^\d+$/.test(s) || (/\d/.test(s) && /^[A-Za-z0-9_]{8,}$/.test(s))

/** The last meaningful path segment as a sentence-case title, or ''. */
function titleFromPath(segs: string[]): string {
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i].replace(/\.(html?|php|aspx?)$/i, '').replace(/-[0-9a-f]{8,}$/i, '').replace(/^@/, '')
    if (!s || isIdLike(s)) continue
    const words = s.replace(/[-_+]+/g, ' ').trim()
    if (!words) continue
    return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase()
  }
  return ''
}

function huggingFaceType(segs: string[]): ResourceType {
  const first = segs[0] ?? ''
  if (first === 'learn') return 'course'
  if (first === 'docs') return 'docs'
  if (first === 'spaces') return 'tool'
  if (first === 'datasets' || first === 'blog' || first === 'papers') return 'other'
  return segs.length >= 2 ? 'model' : 'other'
}

export interface Detected { company: string; type: ResourceType; title: string }

/** Company, type and a draft title for a normalised link. The user's own spelling of a host wins. */
export function detect(url: string, existing: Resource[]): Detected {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return { company: '', type: 'other', title: '' }
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  const segs = u.pathname.split('/').filter(Boolean).map(decode)
  const site = siteFor(host)
  const own = existing.find((r) => !r.deletedOn && hostOf(r.url) === host)
  const company = own?.company || site?.company || host
  if (site?.host === 'huggingface.co') {
    const type = huggingFaceType(segs)
    const title = type === 'model' ? segs[1] : titleFromPath(segs)
    return { company, type, title }
  }
  if (site?.company === 'YouTube') return { company, type: 'video', title: '' }
  const type: ResourceType = site?.type ?? (host.startsWith('docs.') ? 'docs' : 'article')
  return { company, type, title: titleFromPath(segs) }
}

/** What makes two links "the same": the video id for YouTube, else the normalised link. */
export function linkKey(url: string): string {
  const site = siteFor(hostOf(url))
  const id = site?.company === 'YouTube' ? ytId(url) : null
  return id ? `yt:${id}` : (normaliseUrl(url) ?? url)
}

export function findDuplicate(url: string, rs: Resource[]): Resource | null {
  const key = linkKey(url)
  return rs.find((r) => !r.deletedOn && linkKey(r.url) === key) ?? null
}

/** Companies of live resources containing `typed` (any case), most used first; the exact text is left out. */
export function companySuggestions(rs: Resource[], typed: string): string[] {
  const q = typed.trim().toLowerCase()
  const counts = new Map<string, number>()
  for (const r of rs) if (!r.deletedOn && r.company) counts.set(r.company, (counts.get(r.company) ?? 0) + 1)
  return [...counts]
    .filter(([c]) => c.toLowerCase().includes(q) && c.toLowerCase() !== q)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([c]) => c)
}
```

- [ ] **Step 5: Run** `npx vitest run src/core/companies.test.ts`. Expect all to pass. If a `detect` row fails, fix the code, not the expectation, unless the expectation contradicts the spec.

- [ ] **Step 6: Commit**

```bash
git add src/core/model.ts src/core/companies.ts src/core/companies.test.ts src/core/test-fixtures.ts
git commit -m "feat: resource model and link detection (company, type, title, duplicates)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Repair and persistence

**Files:**
- Modify: `src/core/model.ts` (`EmberData`)
- Create: `src/core/resources.ts`
- Test: `src/core/resources.test.ts`
- Modify: `src/core/persist.ts` (`normalize`), `src/core/seed.ts` (`buildSeed` return, `emptyData`), `src/core/test-fixtures.ts` (`dataFixture`)
- Test: `src/core/persist.test.ts`, `src/core/seed.test.ts`

**Interfaces:**
- Consumes: `Resource`, `RESOURCE_TYPES`, `RESOURCE_STATUSES`, `BILLINGS` (Task 1), `normaliseUrl`, `detect` (Task 1).
- Produces: `EmberData.resources: Resource[]`; `repairResource(x: unknown, today?: ISODate): Resource | null`; `repairResources(xs: unknown, today?: ISODate): Resource[]` (anything that isn't an array → `[]`).

- [ ] **Step 1: Write failing tests.** Create `src/core/resources.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { repairResource, repairResources } from './resources'
import { resourceFixture } from './test-fixtures'

describe('repairResource', () => {
  it('leaves a valid resource unchanged', () => {
    const r = resourceFixture('A', { billing: 'month', price: 49, renewsOn: '2026-10-15', keptFor: '2026-09-15', updatedAt: 5 })
    expect(repairResource(r)).toEqual(r)
  })

  it('drops entries without an id or an http(s) link', () => {
    expect(repairResource(null)).toBeNull()
    expect(repairResource({ ...resourceFixture('A'), id: '' })).toBeNull()
    expect(repairResource({ ...resourceFixture('A'), url: 42 })).toBeNull()
    expect(repairResource({ ...resourceFixture('A'), url: 'javascript:alert(1)' })).toBeNull()
    expect(repairResource({ ...resourceFixture('A'), url: 'data:text/html,hi' })).toBeNull()
  })

  it('repairs unknown type, status and billing, and a bad price', () => {
    const r = repairResource({ ...resourceFixture('A'), type: 'book', status: 'done', billing: 'weekly', price: 5 })!
    expect(r).toMatchObject({ type: 'other', status: 'using', billing: 'free', price: null, renewsOn: null })
    for (const price of [0, -3, Number.NaN, '12', null]) {
      expect(repairResource({ ...resourceFixture('A'), billing: 'month', price, renewsOn: '2026-10-15' })).toMatchObject({ billing: 'free', price: null, renewsOn: null })
    }
  })

  it('keeps a renewal date only for monthly or yearly billing', () => {
    expect(repairResource({ ...resourceFixture('A'), billing: 'once', price: 9.99, renewsOn: '2026-10-15' })).toMatchObject({ renewsOn: null })
    expect(repairResource({ ...resourceFixture('A'), billing: 'year', price: 99, renewsOn: 'soon' })).toMatchObject({ renewsOn: null })
  })

  it('fills missing text fields: title from the link, company from detection, empty notes', () => {
    const r = repairResource({ id: 'x', url: 'https://huggingface.co/learn/llm-course' }, '2026-10-12')!
    expect(r).toMatchObject({
      title: 'https://huggingface.co/learn/llm-course', company: 'Hugging Face', type: 'other', status: 'using',
      goalId: null, billing: 'free', price: null, renewsOn: null, notes: '', createdAt: '2026-10-12',
    })
    expect(r).not.toHaveProperty('keptFor')
    expect(r).not.toHaveProperty('deletedOn')
  })

  it('repairs a list, and treats anything else as empty', () => {
    expect(repairResources([resourceFixture('A'), { id: 'bad' }]).map((r) => r.id)).toEqual(['A'])
    expect(repairResources(undefined)).toEqual([])
    expect(repairResources({ a: 1 })).toEqual([])
  })
})
```

Add to `src/core/persist.test.ts` (inside its main describe; import `resourceFixture`):

```ts
  it('loads data saved before resources existed with an empty list, and repairs saved resources', () => {
    const old: Record<string, unknown> = { ...dataFixture() }
    delete old.resources
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, data: old }))
    expect(loadData()!.resources).toEqual([])
    const bad = { ...resourceFixture('X'), url: 'javascript:alert(1)' }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, data: { ...dataFixture(), resources: [resourceFixture('A'), bad] } }))
    expect(loadData()!.resources.map((r) => r.id)).toEqual(['A'])
  })
```

In `src/core/seed.test.ts`, change the `emptyData` expectation to include `resources: []`:

```ts
    expect(emptyData(settings)).toEqual({
      goals: [], tasks: [], logs: [], resources: [], selection: null,
      timer: { phase: 'focus', running: false, endsAt: null, leftSec: 3000, speed: 1, lengthSec: 3000 },
      settings,
    })
```

- [ ] **Step 2: Run** `npx vitest run src/core/resources.test.ts src/core/persist.test.ts src/core/seed.test.ts`. Expect failures (no `./resources` module; no `resources` in data).

- [ ] **Step 3: Implement.**

`src/core/model.ts`, in `EmberData` after `logs`:

```ts
  resources: Resource[]
```

`src/core/resources.ts`:

```ts
import { detect, normaliseUrl } from './companies'
import { todayISO, type ISODate } from './dates'
import { BILLINGS, RESOURCE_STATUSES, RESOURCE_TYPES, type Billing, type Resource, type ResourceStatus, type ResourceType } from './model'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const isDate = (x: unknown): x is ISODate => typeof x === 'string' && ISO.test(x)
const text = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')

/**
 * A resource as saved, synced or restored, made safe to use: null when it has no id or no http(s) link;
 * unknown type/status/billing and a bad price are repaired; a valid resource comes back equal.
 */
export function repairResource(x: unknown, today: ISODate = todayISO()): Resource | null {
  if (!x || typeof x !== 'object') return null
  const r = x as Record<string, unknown>
  if (typeof r.id !== 'string' || !r.id || typeof r.url !== 'string') return null
  const url = normaliseUrl(r.url)
  if (!url) return null
  const priced = typeof r.price === 'number' && Number.isFinite(r.price) && r.price > 0
  const billing: Billing = priced && BILLINGS.includes(r.billing as Billing) ? (r.billing as Billing) : 'free'
  const recurring = billing === 'month' || billing === 'year'
  const out: Resource = {
    id: r.id,
    title: text(r.title) || r.url,
    url: r.url,
    company: text(r.company) || detect(url, []).company || 'Other',
    type: RESOURCE_TYPES.includes(r.type as ResourceType) ? (r.type as ResourceType) : 'other',
    status: RESOURCE_STATUSES.includes(r.status as ResourceStatus) ? (r.status as ResourceStatus) : 'using',
    goalId: typeof r.goalId === 'string' && r.goalId ? r.goalId : null,
    billing,
    price: billing === 'free' ? null : (r.price as number),
    renewsOn: recurring && isDate(r.renewsOn) ? r.renewsOn : null,
    notes: typeof r.notes === 'string' ? r.notes : '',
    createdAt: isDate(r.createdAt) ? r.createdAt : today,
  }
  if (isDate(r.keptFor)) out.keptFor = r.keptFor
  if (isDate(r.deletedOn)) out.deletedOn = r.deletedOn
  else if (r.deletedOn === null) out.deletedOn = null
  if (typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt)) out.updatedAt = r.updatedAt
  return out
}

export function repairResources(xs: unknown, today: ISODate = todayISO()): Resource[] {
  if (!Array.isArray(xs)) return []
  return xs.map((x) => repairResource(x, today)).filter((r): r is Resource => r !== null)
}
```

Note: the stored `url` is kept as saved (`r.url`) when it is valid, so a valid resource comes back equal; only its validity is checked through `normaliseUrl`.

`src/core/persist.ts`, `normalize`: import `repairResources` from `./resources` and return

```ts
  return { ...d, goals: d.goals.map(repairGoal), resources: repairResources((d as Partial<EmberData>).resources), settings, timer: valid ? t : base }
```

`src/core/seed.ts`: in `buildSeed`'s returned object add `resources: [],` after `logs` (Task 5 fills it); in `emptyData` add `resources: [],` after `logs: []`.

`src/core/test-fixtures.ts`, `dataFixture`: add `resources: [],` after `logs: []`.

- [ ] **Step 4: Run** `npx vitest run src/core/resources.test.ts src/core/persist.test.ts src/core/seed.test.ts`, then `npm run typecheck`. Fix every object literal typed as `EmberData` that the type checker reports as missing `resources` by adding `resources: []` (test files included). Expect PASS and a clean typecheck.

- [ ] **Step 5: Commit**

```bash
git add src/core
git commit -m "feat: resources on saved data, repaired on load (unsafe links dropped)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: Sync and backup

**Files:**
- Modify: `src/core/sync.ts`
- Test: `src/core/sync.test.ts`, `src/core/backup.test.ts`

**Interfaces:**
- Consumes: `repairResources` (Task 2), `resourceFixture` (Task 1).
- Produces: `SharedData.resources: Resource[]`; `stampChanges`, `mergeData`, `sharedPart`, `withDeviceState`, `readSyncFile`, `syncSummary` handle resources.

- [ ] **Step 1: Write failing tests** in `src/core/sync.test.ts` (import `resourceFixture`):

Change the key list in "leaves per-device state out of the shared part" to:

```ts
    expect(Object.keys(s).sort()).toEqual(['goals', 'logs', 'resources', 'settings', 'tasks'])
```

Add inside `describe('stampChanges', …)`:

```ts
  it('stamps new and changed resources', () => {
    const b = dataFixture({ resources: [resourceFixture('A'), resourceFixture('B')] })
    const a = clone(b)
    a.resources[1].status = 'finished'
    a.resources.push(resourceFixture('C'))
    expect(stampChanges(b, a, T)).toBe(2)
    expect(a.resources.map((r) => r.updatedAt)).toEqual([undefined, T, T])
  })
```

Add inside `describe('mergeData', …)`:

```ts
  it('merges resources by id, newer edit winning', () => {
    const local = shared({ resources: [resourceFixture('A', { status: 'finished', updatedAt: 9 }), resourceFixture('L')] })
    const remote = shared({ resources: [resourceFixture('A', { updatedAt: 3 }), resourceFixture('R')] })
    const m = mergeData(local, remote)
    expect(m.resources.map((r) => r.id)).toEqual(['A', 'R', 'L'])
    expect(m.resources[0].status).toBe('finished')
  })

  it("keeps this device's resources when the Drive file was written by an app without them", () => {
    const local = shared({ resources: [resourceFixture('A', { updatedAt: 2 })] })
    const text = JSON.stringify({ app: 'ember', version: 1, generation: 'g', data: { goals: [], tasks: [], logs: [] } })
    const r = readSyncFile(text)
    expect(r.ok && r.data.resources).toEqual([])
    if (r.ok) expect(mergeData(local, r.data).resources.map((x) => x.id)).toEqual(['A'])
  })
```

Add inside `describe('sync file', …)`:

```ts
  it('repairs resources from the file, dropping unsafe links', () => {
    const resources = [resourceFixture('A'), { ...resourceFixture('B'), url: 'javascript:alert(1)' }, { ...resourceFixture('C'), status: '??' }]
    const r = readSyncFile(JSON.stringify({ app: 'ember', version: 1, generation: 'g', data: { goals: [], tasks: [], logs: [], resources } }))
    expect(r.ok && r.data.resources.map((x) => [x.id, x.status])).toEqual([['A', 'using'], ['C', 'using']])
  })

  it('adds live resources to the summary only when there are some', () => {
    expect(syncSummary(shared({ resources: [resourceFixture('A'), resourceFixture('B', { deletedOn: '2026-09-01' })] })))
      .toBe('0 goals · 0 tasks · 0 focus sessions · 1 resource')
  })
```

In `src/core/backup.test.ts` add (import `resourceFixture`, `dataFixture` as needed):

```ts
  it('round-trips resources, and reads an older backup without them', () => {
    const d = dataFixture({ resources: [resourceFixture('A')] })
    const r = readBackup(makeBackup(d, 0))
    expect(r.ok && r.data.resources.map((x) => x.id)).toEqual(['A'])
    const old: Record<string, unknown> = { ...dataFixture() }
    delete old.resources
    const r2 = readBackup(JSON.stringify({ app: 'ember', version: 1, exportedAt: null, data: old }))
    expect(r2.ok && r2.data.resources).toEqual([])
  })
```

- [ ] **Step 2: Run** `npx vitest run src/core/sync.test.ts src/core/backup.test.ts`. Expect failures (keys, stamps, merge, summary).

- [ ] **Step 3: Implement** in `src/core/sync.ts` (import `Resource` type and `repairResources`):

```ts
export interface SharedData { goals: Goal[]; tasks: Task[]; logs: FocusLog[]; resources: Resource[]; settings: SharedSettings }

export function sharedPart(d: EmberData): SharedData {
  return { goals: d.goals, tasks: d.tasks, logs: d.logs, resources: d.resources, settings: sharedSettings(d.settings) }
}
```

In `withDeviceState`, build `out` with resources:

```ts
  const out = { goals: shared.goals, tasks: shared.tasks, logs: shared.logs, resources: shared.resources, settings } as EmberData
```

In `stampChanges`, after the tasks loop:

```ts
  const resources = new Map(before.resources.map((r) => [r.id, r]))
  for (const r of after.resources) {
    const p = resources.get(r.id)
    if (changed(p, r)) { r.updatedAt = stampAfter(p); n++ }
  }
```

In `mergeData`'s returned object, after `tasks`:

```ts
    resources: unionById(local.resources, remote.resources, newer),
```

In `readSyncFile`'s `data`:

```ts
      data: { goals: d.goals.map(repairGoal), tasks: d.tasks, logs: d.logs, resources: repairResources(d.resources), settings },
```

`syncSummary`:

```ts
export function syncSummary(s: SharedData): string {
  const base = `${plural(s.goals.filter((g) => !g.deletedOn).length, 'goal')} · ${plural(s.tasks.filter((t) => !t.deletedOn).length, 'task')} · ${plural(s.logs.length, 'focus session')}`
  const n = s.resources.filter((r) => !r.deletedOn).length
  return n ? `${base} · ${plural(n, 'resource')}` : base
}
```

- [ ] **Step 4: Run** `npx vitest run src/core/sync.test.ts src/core/backup.test.ts src/stores/sync.test.ts` and `npm run typecheck`. Expect PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/sync.ts src/core/sync.test.ts src/core/backup.test.ts
git commit -m "feat: resources sync with Drive (stamped, merged by id) and travel in backups

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Costs, renewals and list views

**Files:**
- Modify: `src/core/resources.ts`
- Modify: `src/core/selection.ts`
- Test: `src/core/resources.test.ts`, `src/core/selection.test.ts`

**Interfaces:**
- Consumes: `Resource`, `Goal`, `Task`, `Selection` (model), `isLive`, `goalColor` (core/goals), `diffDays`, `dayLabel`, `toISO`, `yearOf` (core/dates), `plural` (core/format).
- Produces (resources.ts):
  - `TYPE_LABEL: Record<ResourceType, string>`, `STATUS_LABEL: Record<ResourceStatus, string>`
  - `liveResources(rs: Resource[]): Resource[]`, `isRecurring(r: Resource): boolean`, `money(n: number): string`, `inDays(n: number): string`
  - `addMonthsClamped(anchor: ISODate, months: number): ISODate`, `nextRenewal(r: Resource, today: ISODate): ISODate | null`
  - `monthlyCost(r: Resource): number`, `coveringMembership(r: Resource, rs: Resource[]): Resource | null`, `coveredBy(m: Resource, rs: Resource[]): Resource[]`
  - `priceText(r: Resource, rs: Resource[]): string`, `renewalText(r: Resource, today: ISODate): { text: string; soon: boolean } | null`
  - `interface DueRenewal { resource: Resource; date: ISODate; days: number }`, `dueRenewals(rs: Resource[], today: ISODate): DueRenewal[]`, `upcomingRenewals(rs: Resource[], today: ISODate): DueRenewal[]`
  - `type StatusFilter = ResourceStatus | 'all'`, `type GoalFilter = string` (`'all'`, `'none'` or a goal id), `matchesGoal(r: Resource, f: GoalFilter, liveGoals: Set<string>): boolean`, `statusCounts(rs: Resource[], goal: GoalFilter, goals: Goal[]): Record<StatusFilter, number>`
  - `interface ResourceRowView { resource: Resource; goal: { title: string; color: string } | null; price: string; paid: boolean; renewal: { text: string; soon: boolean } | null }`, `interface CompanyGroup { company: string; sub: string; rows: ResourceRowView[] }`, `resourceList(rs: Resource[], goals: Goal[], f: { status: StatusFilter; goal: GoalFilter }, today: ISODate): CompanyGroup[]`
  - `interface MoneyLine { total: string; count: string; renewal: { text: string; soon: boolean } | null }`, `moneyLine(rs: Resource[], today: ISODate): MoneyLine | null`
  - `libraryKicker(rs: Resource[]): string`, `goalResources(rs: Resource[], goalId: string): Resource[]`, `goalFilterOptions(rs: Resource[], goals: Goal[]): { value: GoalFilter; label: string }[]`
- Produces (selection.ts): `selectionGoalId(goals: Goal[], tasks: Task[], sel: Selection): string | null`.

- [ ] **Step 1: Write failing tests**, appended to `src/core/resources.test.ts` (extend imports from `./resources`; import `goalFixture` from `./test-fixtures`):

```ts
const TODAY = '2026-10-12'
const plus = resourceFixture('Coursera Plus', { company: 'Coursera', type: 'membership', billing: 'month', price: 49, renewsOn: '2026-10-15', createdAt: '2026-09-02' })
const infovis = resourceFixture('InfoVis', { company: 'Coursera', goalId: 'D3', notes: 'Week 3 of 5', createdAt: '2026-09-01' })
const llm = resourceFixture('LLM Course', { company: 'Hugging Face' })
const premium = resourceFixture('Premium', { company: 'Dreaming Spanish', type: 'membership', billing: 'month', price: 8, renewsOn: '2026-11-02' })
const skill = resourceFixture('Annual', { company: 'Skillshare', type: 'membership', billing: 'year', price: 99, renewsOn: '2027-01-20' })
const udemy = resourceFixture('Masterclass', { company: 'Udemy', billing: 'once', price: 12.99, status: 'dropped', goalId: 'D3' })

describe('money and labels', () => {
  it('formats pounds', () => {
    expect(money(49)).toBe('£49')
    expect(money(9.99)).toBe('£9.99')
    expect(money(65.25)).toBe('£65.25')
    expect(money(8.25)).toBe('£8.25')
    expect(money(99 / 12)).toBe('£8.25')
  })
  it('says how far away a day is', () => {
    expect([inDays(0), inDays(1), inDays(3)]).toEqual(['today', 'tomorrow', 'in 3 days'])
  })
})

describe('renewals', () => {
  it('steps a renewal forward by its period, clamping to the end of short months', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsClamped('2026-01-31', 2)).toBe('2026-03-31')
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonthsClamped('2026-11-15', 3)).toBe('2027-02-15')
    const r = { ...plus, renewsOn: '2026-01-31' }
    expect(nextRenewal(r, '2026-02-10')).toBe('2026-02-28')
    expect(nextRenewal(r, '2026-03-01')).toBe('2026-03-31')
    expect(nextRenewal(r, TODAY)).toBe('2026-10-31')
    expect(nextRenewal({ ...skill, renewsOn: '2020-03-01' }, TODAY)).toBe('2027-03-01')
    expect(nextRenewal(plus, TODAY)).toBe('2026-10-15')
    expect(nextRenewal(plus, '2026-10-15')).toBe('2026-10-15')
    expect(nextRenewal(udemy, TODAY)).toBeNull()
    expect(nextRenewal({ ...plus, renewsOn: null }, TODAY)).toBeNull()
  })

  it('reminds 0–3 days ahead for in-use subscriptions, until kept, and again next cycle', () => {
    expect(dueRenewals([plus, premium, skill, udemy], TODAY)).toEqual([{ resource: plus, date: '2026-10-15', days: 3 }])
    expect(dueRenewals([plus], '2026-10-11')).toEqual([])
    expect(dueRenewals([{ ...plus, status: 'dropped' }], TODAY)).toEqual([])
    expect(dueRenewals([{ ...plus, deletedOn: TODAY }], TODAY)).toEqual([])
    const kept = { ...plus, keptFor: '2026-10-15' }
    expect(dueRenewals([kept], TODAY)).toEqual([])
    expect(dueRenewals([kept], '2026-11-13')).toEqual([{ resource: kept, date: '2026-11-15', days: 2 }])
  })

  it('lists renewals in the next six days after today for Upcoming', () => {
    expect(upcomingRenewals([plus, premium], TODAY)).toEqual([{ resource: plus, date: '2026-10-15', days: 3 }])
    expect(upcomingRenewals([plus], '2026-10-15')).toEqual([])
  })

  it('describes the next renewal, red within a week, with the year when it differs', () => {
    expect(renewalText(plus, TODAY)).toEqual({ text: 'Renews Oct 15 · in 3 days', soon: true })
    expect(renewalText(premium, TODAY)).toEqual({ text: 'Renews Nov 2', soon: false })
    expect(renewalText(skill, TODAY)).toEqual({ text: 'Renews Jan 20, 2027', soon: false })
    expect(renewalText(udemy, TODAY)).toBeNull()
  })
})

describe('costs and memberships', () => {
  it('counts monthly cost only for in-use subscriptions', () => {
    expect([plus, premium, skill, udemy, llm].map(monthlyCost)).toEqual([49, 8, 8.25, 0, 0])
    expect(monthlyCost({ ...plus, status: 'later' })).toBe(0)
  })

  it("covers a company's free resources with its in-use membership", () => {
    const rs = [plus, infovis, llm]
    expect(coveringMembership(infovis, rs)).toBe(plus)
    expect(coveringMembership(llm, rs)).toBeNull()
    expect(coveringMembership(plus, rs)).toBeNull()
    expect(coveringMembership(infovis, [{ ...plus, status: 'dropped' }, infovis])).toBeNull()
    expect(coveredBy(plus, rs)).toEqual([infovis])
  })

  it('writes the price column', () => {
    const rs = [plus, infovis, llm, udemy, skill]
    expect([plus, infovis, llm, udemy, skill].map((r) => priceText(r, rs))).toEqual(['£49 / month', 'In Coursera Plus', 'Free', '£12.99 once', '£99 / year'])
  })

  it('writes the money line, hidden when nothing recurs', () => {
    expect(moneyLine([plus, premium, skill, infovis], TODAY)).toEqual({
      total: '£65.25 a month', count: 'on 3 subscriptions', renewal: { text: 'Coursera Plus renews in 3 days', soon: true },
    })
    expect(moneyLine([premium], TODAY)).toEqual({ total: '£8 a month', count: 'on 1 subscription', renewal: { text: 'next: Premium on Nov 2', soon: false } })
    expect(moneyLine([infovis, udemy], TODAY)).toBeNull()
  })
})

describe('resource list', () => {
  const goals = [goalFixture('D3', []), { ...goalFixture('Gone', []), deletedOn: '2026-09-01' }]
  const all = [plus, infovis, llm, premium, skill, udemy, resourceFixture('Orphan', { company: 'Hugging Face', goalId: 'Gone' })]

  it('groups by company, largest first, memberships first, with company subtotals', () => {
    const groups = resourceList(all, goals, { status: 'using', goal: 'all' }, TODAY)
    expect(groups.map((g) => [g.company, g.sub])).toEqual([
      ['Coursera', '2 resources · £49 a month'],
      ['Hugging Face', '2 resources'],
      ['Dreaming Spanish', '1 resource · £8 a month'],
      ['Skillshare', '1 resource · £8.25 a month'],
    ])
    expect(groups[0].rows.map((r) => r.resource.id)).toEqual(['Coursera Plus', 'InfoVis'])
    expect(groups[0].rows[1]).toMatchObject({ goal: { title: 'D3', color: 'var(--color-accent)' }, price: 'In Coursera Plus', paid: false, renewal: null })
    expect(groups[0].rows[0]).toMatchObject({ price: '£49 / month', paid: true, renewal: { text: 'Renews Oct 15 · in 3 days', soon: true } })
    expect(groups[1].rows.find((r) => r.resource.id === 'Orphan')!.goal).toBeNull()
  })

  it('filters by status and goal, and counts per status for the goal filter', () => {
    expect(resourceList(all, goals, { status: 'dropped', goal: 'all' }, TODAY).map((g) => g.company)).toEqual(['Udemy'])
    expect(resourceList(all, goals, { status: 'all', goal: 'D3' }, TODAY).flatMap((g) => g.rows.map((r) => r.resource.id))).toEqual(['InfoVis', 'Masterclass'])
    // "No goal" includes Orphan, whose goal was deleted; Hugging Face has two, so it leads.
    expect(resourceList(all, goals, { status: 'using', goal: 'none' }, TODAY).flatMap((g) => g.rows.map((r) => r.resource.id)))
      .toEqual(['LLM Course', 'Orphan', 'Coursera Plus', 'Premium', 'Annual'])
    expect(statusCounts(all, 'all', goals)).toEqual({ using: 6, later: 0, finished: 0, dropped: 1, all: 7 })
    expect(statusCounts(all, 'D3', goals)).toEqual({ using: 1, later: 0, finished: 0, dropped: 1, all: 2 })
    expect(statusCounts(all, 'none', goals)).toEqual({ using: 5, later: 0, finished: 0, dropped: 0, all: 5 })
    expect(resourceList([{ ...llm, deletedOn: TODAY }], goals, { status: 'all', goal: 'all' }, TODAY)).toEqual([])
  })

  it('offers goal filters for live goals that have resources, plus No goal', () => {
    expect(goalFilterOptions(all, goals)).toEqual([
      { value: 'all', label: 'All goals' }, { value: 'D3', label: 'D3' }, { value: 'none', label: 'No goal' },
    ])
  })

  it("lists a goal's in-use resources, oldest first", () => {
    expect(goalResources(all, 'D3').map((r) => r.id)).toEqual(['InfoVis'])
    expect(goalResources(all, 'Gone')).toEqual([resourceFixture('Orphan', { company: 'Hugging Face', goalId: 'Gone' })])
  })

  it('writes the library kicker', () => {
    expect(libraryKicker(all)).toBe('Library · 7 resources from 5 companies')
    expect(libraryKicker([llm])).toBe('Library · 1 resource from 1 company')
  })
})
```

(`goalResources` returns resources for any goal id; components only ask for live goals, so a deleted goal's resources never show. The Task 11 test covers the focus bar side.)

Append to `src/core/selection.test.ts` (import `selectionGoalId`, `taskFixture`, `goalFixture` as needed):

```ts
describe('selectionGoalId', () => {
  const goals = [goalFixture('D3', [['M', [['S', null]]]]), { ...goalFixture('Gone', [['M', [['S', null]]]]), deletedOn: '2026-09-01' }]
  const tasks = [taskFixture('T', { goalId: 'D3' }), taskFixture('Loose'), taskFixture('Old', { goalId: 'Gone' })]
  it("finds the goal of the selected step or task, if it's live", () => {
    expect(selectionGoalId(goals, tasks, { kind: 'step', goalId: 'D3', msId: 'D3/M', stepId: 'D3/M/S' })).toBe('D3')
    expect(selectionGoalId(goals, tasks, { kind: 'step', goalId: 'Gone', msId: 'Gone/M', stepId: 'Gone/M/S' })).toBeNull()
    expect(selectionGoalId(goals, tasks, { kind: 'task', taskId: 'T' })).toBe('D3')
    expect(selectionGoalId(goals, tasks, { kind: 'task', taskId: 'Loose' })).toBeNull()
    expect(selectionGoalId(goals, tasks, { kind: 'task', taskId: 'Old' })).toBeNull()
    expect(selectionGoalId(goals, tasks, null)).toBeNull()
  })
})
```

- [ ] **Step 2: Run** `npx vitest run src/core/resources.test.ts src/core/selection.test.ts`. Expect failures (functions not exported).

- [ ] **Step 3: Implement.** Append to `src/core/resources.ts` (extend imports: `dayLabel, diffDays, toISO, yearOf` from `./dates`; `goalColor, isLive` from `./goals`; `plural` from `./format`; `Goal` from `./model`):

```ts
export const TYPE_LABEL: Record<ResourceType, string> = {
  course: 'Course', video: 'Video', docs: 'Docs', model: 'Model', article: 'Article', tool: 'Tool', membership: 'Membership', other: 'Other',
}
export const STATUS_LABEL: Record<ResourceStatus, string> = { using: 'Using', later: 'Later', finished: 'Finished', dropped: 'Dropped' }

export const liveResources = (rs: Resource[]): Resource[] => rs.filter(isLive)
export const isRecurring = (r: Resource): boolean => (r.billing === 'month' || r.billing === 'year') && r.price != null

/** £49, £9.99 (rounded to the penny). */
export function money(n: number): string {
  const p = Math.round(n * 100)
  return p % 100 ? `£${(p / 100).toFixed(2)}` : `£${p / 100}`
}

export const inDays = (n: number): string => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`)

/** `anchor` plus whole months, keeping its day where the month has it, else the month's last day. */
export function addMonthsClamped(anchor: ISODate, months: number): ISODate {
  const [y, m, d] = anchor.split('-').map(Number)
  const total = m - 1 + months
  const ny = y + Math.floor(total / 12)
  const nm = ((total % 12) + 12) % 12
  const last = new Date(ny, nm + 1, 0).getDate()
  return toISO(new Date(ny, nm, Math.min(d, last)))
}

/** The first renewal on or after today, stepping from the entered date (never written back). */
export function nextRenewal(r: Resource, today: ISODate): ISODate | null {
  if (!isRecurring(r) || !r.renewsOn) return null
  const step = r.billing === 'month' ? 1 : 12
  let date = r.renewsOn
  for (let k = 1; date < today && k <= 1200; k++) date = addMonthsClamped(r.renewsOn, k * step)
  return date
}

export function monthlyCost(r: Resource): number {
  if (r.status !== 'using' || !isRecurring(r) || r.price == null) return 0
  return r.billing === 'month' ? r.price : r.price / 12
}

/** The in-use membership of the same company that a free resource comes with. */
export function coveringMembership(r: Resource, rs: Resource[]): Resource | null {
  if (r.billing !== 'free' || r.type === 'membership') return null
  return rs.find((m) => m.id !== r.id && isLive(m) && m.type === 'membership' && m.status === 'using' && m.company === r.company) ?? null
}

/** The live, in-use resources a membership covers. */
export function coveredBy(m: Resource, rs: Resource[]): Resource[] {
  if (m.type !== 'membership') return []
  return rs.filter((r) => isLive(r) && r.status === 'using' && coveringMembership(r, rs)?.id === m.id)
}

export function priceText(r: Resource, rs: Resource[]): string {
  if (r.billing === 'free' || r.price == null) {
    const m = coveringMembership(r, rs)
    return m ? `In ${m.title}` : 'Free'
  }
  if (r.billing === 'once') return `${money(r.price)} once`
  return `${money(r.price)} / ${r.billing === 'month' ? 'month' : 'year'}`
}

const dateText = (d: ISODate, today: ISODate): string => (yearOf(d) === yearOf(today) ? dayLabel(d) : `${dayLabel(d)}, ${yearOf(d)}`)

export function renewalText(r: Resource, today: ISODate): { text: string; soon: boolean } | null {
  const next = nextRenewal(r, today)
  if (!next) return null
  const days = diffDays(next, today)
  const soon = days <= 7
  return { text: soon ? `Renews ${dateText(next, today)} · ${inDays(days)}` : `Renews ${dateText(next, today)}`, soon }
}

export interface DueRenewal { resource: Resource; date: ISODate; days: number }

function renewalsWithin(rs: Resource[], today: ISODate, from: number, to: number): DueRenewal[] {
  const out: DueRenewal[] = []
  for (const r of rs) {
    if (!isLive(r) || r.status !== 'using') continue
    const date = nextRenewal(r, today)
    if (!date) continue
    const days = diffDays(date, today)
    if (days >= from && days <= to) out.push({ resource: r, date, days })
  }
  return out.sort((a, b) => a.days - b.days)
}

/** Today's reminders: due in 0–3 days and not already kept for that date. */
export const dueRenewals = (rs: Resource[], today: ISODate): DueRenewal[] =>
  renewalsWithin(rs, today, 0, 3).filter((d) => d.resource.keptFor !== d.date)

/** Upcoming's rows: renewals tomorrow through six days out (Upcoming's dated range). */
export const upcomingRenewals = (rs: Resource[], today: ISODate): DueRenewal[] => renewalsWithin(rs, today, 1, 6)

export type StatusFilter = ResourceStatus | 'all'
/** 'all', 'none' (no live goal) or a goal id. */
export type GoalFilter = string

const goalIds = (goals: Goal[]): Set<string> => new Set(goals.filter(isLive).map((g) => g.id))

/** 'none' also matches resources whose goal was deleted: they show "no goal" everywhere else too. */
export const matchesGoal = (r: Resource, f: GoalFilter, liveGoals: Set<string>): boolean =>
  f === 'all' ? true : f === 'none' ? !r.goalId || !liveGoals.has(r.goalId) : r.goalId === f

export function statusCounts(rs: Resource[], goal: GoalFilter, goals: Goal[]): Record<StatusFilter, number> {
  const out: Record<StatusFilter, number> = { using: 0, later: 0, finished: 0, dropped: 0, all: 0 }
  const ids = goalIds(goals)
  for (const r of liveResources(rs)) {
    if (!matchesGoal(r, goal, ids)) continue
    out[r.status]++
    out.all++
  }
  return out
}

export interface ResourceRowView {
  resource: Resource
  goal: { title: string; color: string } | null
  price: string
  paid: boolean
  renewal: { text: string; soon: boolean } | null
}
export interface CompanyGroup { company: string; sub: string; rows: ResourceRowView[] }

export function resourceList(rs: Resource[], goals: Goal[], f: { status: StatusFilter; goal: GoalFilter }, today: ISODate): CompanyGroup[] {
  const live = liveResources(rs)
  const ids = goalIds(goals)
  const shown = live.filter((r) => (f.status === 'all' || r.status === f.status) && matchesGoal(r, f.goal, ids))
  const byCompany = new Map<string, Resource[]>()
  for (const r of shown) byCompany.set(r.company, [...(byCompany.get(r.company) ?? []), r])
  const groups: CompanyGroup[] = []
  for (const [company, items] of byCompany) {
    items.sort((a, b) =>
      Number(b.type === 'membership') - Number(a.type === 'membership') || a.createdAt.localeCompare(b.createdAt) || a.title.localeCompare(b.title))
    const monthly = items.reduce((sum, r) => sum + monthlyCost(r), 0)
    const rows = items.map((r): ResourceRowView => {
      const gi = r.goalId ? goals.findIndex((g) => g.id === r.goalId) : -1
      const goal = gi >= 0 && isLive(goals[gi]) ? { title: goals[gi].title, color: goalColor(gi) } : null
      return { resource: r, goal, price: priceText(r, live), paid: r.billing !== 'free' && r.price != null, renewal: renewalText(r, today) }
    })
    groups.push({ company, sub: `${plural(rows.length, 'resource')}${monthly ? ` · ${money(monthly)} a month` : ''}`, rows })
  }
  return groups.sort((a, b) => b.rows.length - a.rows.length || a.company.localeCompare(b.company))
}

export interface MoneyLine { total: string; count: string; renewal: { text: string; soon: boolean } | null }

export function moneyLine(rs: Resource[], today: ISODate): MoneyLine | null {
  const paid = liveResources(rs).filter((r) => monthlyCost(r) > 0)
  if (!paid.length) return null
  const total = paid.reduce((sum, r) => sum + monthlyCost(r), 0)
  const next = paid
    .map((r) => ({ r, date: nextRenewal(r, today) }))
    .filter((x): x is { r: Resource; date: ISODate } => x.date != null)
    .sort((a, b) => a.date.localeCompare(b.date))[0]
  let renewal: MoneyLine['renewal'] = null
  if (next) {
    const days = diffDays(next.date, today)
    renewal = days <= 7
      ? { text: `${next.r.title} renews ${inDays(days)}`, soon: true }
      : { text: `next: ${next.r.title} on ${dateText(next.date, today)}`, soon: false }
  }
  return { total: `${money(total)} a month`, count: `on ${plural(paid.length, 'subscription')}`, renewal }
}

export function libraryKicker(rs: Resource[]): string {
  const live = liveResources(rs)
  const companies = new Set(live.map((r) => r.company)).size
  return `Library · ${plural(live.length, 'resource')} from ${companies} ${companies === 1 ? 'company' : 'companies'}`
}

/** A goal's in-use resources, oldest first (the goal strip, focus bar and Focus mode). */
export const goalResources = (rs: Resource[], goalId: string): Resource[] =>
  liveResources(rs)
    .filter((r) => r.status === 'using' && r.goalId === goalId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.title.localeCompare(b.title))

export function goalFilterOptions(rs: Resource[], goals: Goal[]): { value: GoalFilter; label: string }[] {
  const live = liveResources(rs)
  const used = new Set(live.map((r) => r.goalId))
  const opts: { value: GoalFilter; label: string }[] = [{ value: 'all', label: 'All goals' }]
  for (const g of goals) if (isLive(g) && used.has(g.id)) opts.push({ value: g.id, label: g.title })
  const ids = goalIds(goals)
  if (live.some((r) => !r.goalId || !ids.has(r.goalId))) opts.push({ value: 'none', label: 'No goal' })
  return opts
}
```

Append to `src/core/selection.ts` (import `isLive` if not already imported):

```ts
/** The live goal the current selection belongs to: a step's goal, or a task's linked goal. */
export function selectionGoalId(goals: Goal[], tasks: Task[], sel: Selection): string | null {
  if (!sel) return null
  const id = sel.kind === 'step' ? sel.goalId : tasks.find((t) => t.id === sel.taskId && isLive(t))?.goalId
  return id && goals.some((g) => g.id === id && isLive(g)) ? id : null
}
```

- [ ] **Step 4: Run** `npx vitest run src/core/resources.test.ts src/core/selection.test.ts`. Expect PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/resources.ts src/core/resources.test.ts src/core/selection.ts src/core/selection.test.ts
git commit -m "feat: resource costs, renewals, memberships and list views

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: Store actions and demo data

**Files:**
- Modify: `src/stores/ember.ts`
- Modify: `src/core/seed.ts`
- Test: `src/stores/ember.test.ts`, `src/core/seed.test.ts`

**Interfaces:**
- Consumes: `normaliseUrl`, `detect`, `findDuplicate`, `shortLink` (Task 1); `nextRenewal` (Task 4).
- Produces (store): `resources` ref; `type AddResult = { ok: true; id: string } | { ok: false; reason: 'invalid' } | { ok: false; reason: 'duplicate'; id: string }`; `addResource(text: string, opts?: { goalId?: string | null }): AddResult`; `type ResourcePatch = Partial<Pick<Resource, 'title' | 'url' | 'company' | 'type' | 'status' | 'goalId' | 'billing' | 'price' | 'renewsOn' | 'notes'>>`; `updateResource(id: string, patch: ResourcePatch): void`; `deleteResource(id: string): UndoRecord | null`; `keepRenewal(id: string): void`; `markCancelled(id: string): void`; `resourceById(id: string): Resource | null`; `DeleteKey` gains `{ kind: 'resource'; id: string }`.

- [ ] **Step 1: Write failing tests** in `src/stores/ember.test.ts` (import `resourceFixture`):

```ts
describe('resources', () => {
  it('adds a pasted link with detected fields, the given goal, and today', () => {
    const store = storeWith()
    const r = store.addResource('  https://www.huggingface.co/learn/llm-course/?utm_source=x ', { goalId: 'D3' })
    expect(r.ok).toBe(true)
    expect(store.resources[0]).toMatchObject({
      url: 'https://huggingface.co/learn/llm-course', title: 'Llm course', company: 'Hugging Face', type: 'course',
      status: 'using', goalId: 'D3', billing: 'free', price: null, renewsOn: null, notes: '', createdAt: '2026-09-23',
    })
  })

  it('titles a link with no usable slug by its short link, and ignores a goal that is not live', () => {
    const store = storeWith()
    store.addResource('youtu.be/dQw4w9WgXcQ', { goalId: 'missing' })
    expect(store.resources[0]).toMatchObject({ title: 'youtu.be/dQw4w9WgXcQ', company: 'YouTube', goalId: null })
  })

  it('refuses invalid links and duplicates', () => {
    const store = storeWith({ resources: [resourceFixture('Joins', { url: 'https://youtube.com/watch?v=dQw4w9WgXcQ' })] })
    expect(store.addResource('not a link')).toEqual({ ok: false, reason: 'invalid' })
    expect(store.addResource('javascript:alert(1)')).toEqual({ ok: false, reason: 'invalid' })
    expect(store.addResource('https://youtu.be/dQw4w9WgXcQ')).toEqual({ ok: false, reason: 'duplicate', id: 'Joins' })
    expect(store.resources).toHaveLength(1)
  })

  it('edits fields and keeps the cost consistent', () => {
    const store = storeWith({ resources: [resourceFixture('A')] })
    store.updateResource('A', { billing: 'month', price: 49, renewsOn: '2026-10-15', type: 'membership', company: ' Coursera ' })
    expect(store.resources[0]).toMatchObject({ billing: 'month', price: 49, renewsOn: '2026-10-15', type: 'membership', company: 'Coursera' })
    store.updateResource('A', { billing: 'once' })
    expect(store.resources[0]).toMatchObject({ billing: 'once', price: 49, renewsOn: null })
    store.updateResource('A', { billing: 'free' })
    expect(store.resources[0]).toMatchObject({ billing: 'free', price: null, renewsOn: null })
    for (const price of [0, -5, Number.NaN, null]) {
      store.updateResource('A', { billing: 'month', price, renewsOn: '2026-10-15' })
      expect(store.resources[0]).toMatchObject({ billing: 'free', price: null, renewsOn: null })
    }
  })

  it('falls back to the short link for a blank title, ignores a blank company and an invalid link', () => {
    const store = storeWith({ resources: [resourceFixture('A', { url: 'https://example.com/a' })] })
    store.updateResource('A', { title: '   ', company: '  ', url: 'javascript:alert(1)' })
    expect(store.resources[0]).toMatchObject({ title: 'example.com/a', company: 'Example', url: 'https://example.com/a' })
    store.updateResource('A', { url: 'www.example.com/b/' })
    expect(store.resources[0].url).toBe('https://example.com/b')
  })

  it('soft-deletes with undo', () => {
    const store = storeWith({ resources: [resourceFixture('A')] })
    const rec = store.deleteResource('A')!
    expect(rec.label).toBe('Deleted “A”')
    expect(store.resources[0].deletedOn).toBe('2026-09-23')
    store.undoDelete(rec)
    expect(store.resources[0].deletedOn).toBeNull()
    expect(store.deleteResource('missing')).toBeNull()
  })

  it('keeps a renewal for its current date, and marks a cancelled one dropped', () => {
    const store = storeWith({ resources: [resourceFixture('Plus', { billing: 'month', price: 49, renewsOn: '2026-08-25' })] })
    store.keepRenewal('Plus')
    expect(store.resources[0].keptFor).toBe('2026-09-25')
    store.markCancelled('Plus')
    expect(store.resources[0].status).toBe('dropped')
  })

  it('clears a kept reminder when the renewal date is edited', () => {
    const store = storeWith({ resources: [resourceFixture('Plus', { billing: 'month', price: 49, renewsOn: '2026-09-25', keptFor: '2026-09-25' })] })
    store.updateResource('Plus', { renewsOn: '2026-09-26' })
    expect(store.resources[0]).not.toHaveProperty('keptFor')
  })

  it('saves resources and stamps edits', async () => {
    const store = storeWith({ resources: [resourceFixture('A')] })
    store.updateResource('A', { notes: 'Week 3' })
    await nextTick()
    const saved = loadData()!
    expect(saved.resources[0]).toMatchObject({ notes: 'Week 3' })
    expect(typeof saved.resources[0].updatedAt).toBe('number')
  })
})
```

Add to `src/core/seed.test.ts`:

```ts
  it('includes sample resources linked to the sample goals, with one renewal due in 3 days', () => {
    expect(seed.resources.length).toBe(12)
    expect(new Set(seed.resources.map((r) => r.company)).size).toBe(8)
    const plus = seed.resources.find((r) => r.title === 'Coursera Plus')!
    expect(plus).toMatchObject({ type: 'membership', billing: 'month', price: 49 })
    expect(diffDays(plus.renewsOn!, todayISO(NOW))).toBe(3)
    const goalIds = new Set(seed.goals.map((g) => g.id))
    for (const r of seed.resources) if (r.goalId) expect(goalIds.has(r.goalId)).toBe(true)
  })
```

(Use the seed test file's existing `seed` and `NOW` names; import `diffDays` and `todayISO` from `./dates` if missing. If the file names them differently, use its names.)

- [ ] **Step 2: Run** `npx vitest run src/stores/ember.test.ts src/core/seed.test.ts`. Expect failures.

- [ ] **Step 3: Implement the store** in `src/stores/ember.ts`:

Imports: `detect, findDuplicate, normaliseUrl, shortLink` from `../core/companies`; `nextRenewal` from `../core/resources`; `Resource` in the model type import.

```ts
export type DeleteKey =
  | { kind: 'task'; id: string }
  | { kind: 'resource'; id: string }
  | { kind: 'step'; goalId: string; msId: string; stepId: string }
  | { kind: 'milestone'; goalId: string; msId: string }
  | { kind: 'goal'; goalId: string }
export type AddResult = { ok: true; id: string } | { ok: false; reason: 'invalid' } | { ok: false; reason: 'duplicate'; id: string }
export type ResourcePatch = Partial<Pick<Resource, 'title' | 'url' | 'company' | 'type' | 'status' | 'goalId' | 'billing' | 'price' | 'renewsOn' | 'notes'>>
```

State and plumbing:

```ts
  const resources = ref<Resource[]>(initial.resources)
```

- `snapshot()`: add `resources: resources.value,` after `logs`.
- `replaceData`: add `resources.value = d.resources` after `logs.value = d.logs`.
- The persist watch: `watch([goals, tasks, logs, resources, selection, timer, settings], persist, { deep: true })`.
- `itemFor`: first line becomes

```ts
    if (key.kind === 'task') return taskById(key.id)
    if (key.kind === 'resource') return resourceById(key.id)
```

Actions (after the edit section):

```ts
  // — resources —
  const resourceById = (id: string): Resource | null => resources.value.find((r) => r.id === id) ?? null

  function addResource(text: string, opts: { goalId?: string | null } = {}): AddResult {
    const url = normaliseUrl(text)
    if (!url) return { ok: false, reason: 'invalid' }
    const dup = findDuplicate(url, resources.value)
    if (dup) return { ok: false, reason: 'duplicate', id: dup.id }
    const d = detect(url, resources.value)
    const goal = opts.goalId ? goalById(opts.goalId) : null
    const r: Resource = {
      id: uid(), title: d.title || shortLink(url), url, company: d.company, type: d.type, status: 'using',
      goalId: goal && isLive(goal) ? goal.id : null, billing: 'free', price: null, renewsOn: null, notes: '', createdAt: today.value,
    }
    resources.value.push(r)
    return { ok: true, id: r.id }
  }

  function updateResource(id: string, patch: ResourcePatch) {
    const r = resourceById(id)
    if (!r) return
    if (patch.url !== undefined) {
      const url = normaliseUrl(patch.url)
      if (url) r.url = url
    }
    if (patch.title !== undefined) r.title = patch.title.trim() || shortLink(r.url)
    if (patch.company !== undefined && patch.company.trim()) r.company = patch.company.trim()
    if (patch.type !== undefined) r.type = patch.type
    if (patch.status !== undefined) r.status = patch.status
    if (patch.goalId !== undefined) r.goalId = patch.goalId
    if (patch.notes !== undefined) r.notes = patch.notes
    if (patch.billing !== undefined) r.billing = patch.billing
    if (patch.price !== undefined) r.price = patch.price
    const renewsBefore = r.renewsOn
    if (patch.renewsOn !== undefined) r.renewsOn = patch.renewsOn
    // A paid cost needs a positive price; renewal dates belong to monthly and yearly costs only.
    if (r.billing === 'free' || typeof r.price !== 'number' || !Number.isFinite(r.price) || r.price <= 0) {
      r.billing = 'free'
      r.price = null
      r.renewsOn = null
    } else if (r.billing === 'once') {
      r.renewsOn = null
    }
    if (r.renewsOn !== renewsBefore) delete r.keptFor
  }

  const deleteResource = (id: string) => softDelete({ kind: 'resource', id }, `Deleted “${resourceById(id)?.title ?? ''}”`)

  /** Today's "Keep it": dismiss the reminder for the current renewal date only. */
  function keepRenewal(id: string) {
    const r = resourceById(id)
    const next = r && isLive(r) ? nextRenewal(r, today.value) : null
    if (r && next) r.keptFor = next
  }

  function markCancelled(id: string) {
    const r = resourceById(id)
    if (r && isLive(r)) r.status = 'dropped'
  }
```

Return object: add `resources` after `logs`, and `resourceById, addResource, updateResource, deleteResource, keepRenewal, markCancelled` to the actions.

- [ ] **Step 4: Implement the demo data** in `src/core/seed.ts`. Add after the `GOALS` constant:

```ts
// [title, url, company, type, status, goal index, billing, price, renews in days, notes]
type ResourceSeed = [string, string, string, ResourceType, ResourceStatus, number | null, Billing, number | null, number | null, string]
const RESOURCES: ResourceSeed[] = [
  ['Coursera Plus', 'https://coursera.org/courseraplus', 'Coursera', 'membership', 'using', null, 'month', 49, 3, ''],
  ['Information Visualization', 'https://coursera.org/search?query=information%20visualization', 'Coursera', 'course', 'using', 0, 'free', null, null, 'Week 3 of 5'],
  ['LLM Course', 'https://huggingface.co/learn/llm-course', 'Hugging Face', 'course', 'using', null, 'free', null, null, 'Chapter 3: fine-tuning'],
  ['all-MiniLM-L6-v2', 'https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2', 'Hugging Face', 'model', 'using', null, 'free', null, null, ''],
  ['D3 data joins, explained', 'https://youtube.com/results?search_query=d3+data+joins', 'YouTube', 'video', 'using', 0, 'free', null, null, ''],
  ['Dreaming Spanish superbeginner playlist', 'https://youtube.com/@DreamingSpanish', 'YouTube', 'video', 'using', 1, 'free', null, null, ''],
  ['Loose watercolour skies', 'https://youtube.com/results?search_query=loose+watercolour+skies', 'YouTube', 'video', 'later', 2, 'free', null, null, ''],
  ['Premium', 'https://dreamingspanish.com', 'Dreaming Spanish', 'membership', 'using', 1, 'month', 8, 21, ''],
  ['D3 gallery', 'https://observablehq.com/@d3/gallery', 'Observable', 'docs', 'using', 0, 'free', null, null, ''],
  ['Annual membership', 'https://skillshare.com', 'Skillshare', 'membership', 'using', 2, 'year', 99, 100, ''],
  ['Watercolour landscapes', 'https://domestika.org/en/search?query=watercolour+landscapes', 'Domestika', 'course', 'finished', 2, 'once', 9.99, null, ''],
  ['D3.js masterclass', 'https://udemy.com/courses/search?q=d3.js', 'Udemy', 'course', 'dropped', 0, 'once', 12.99, null, 'Too slow, switched to Observable'],
]
```

Sample links are real pages or searches on the real sites, so nothing in the demo points at a made-up page.

Import `Billing, Resource, ResourceStatus, ResourceType` from `./model`. Before the `return` of `buildSeed`:

```ts
  const resources: Resource[] = RESOURCES.map(([title, url, company, type, status, goal, billing, price, renewIn, notes], i) => ({
    id: uid(), title, url, company, type, status,
    goalId: goal == null ? null : goals[goal].id,
    billing, price, renewsOn: renewIn == null ? null : addDays(today, renewIn), notes,
    createdAt: addDays(today, -60 + i),
  }))
```

and return `resources` (replacing the `resources: []` placeholder from Task 2).

- [ ] **Step 5: Run** `npx vitest run src/stores/ember.test.ts src/core/seed.test.ts` and `npm run typecheck`. Expect PASS.

- [ ] **Step 6: Commit**

```bash
git add src/stores/ember.ts src/stores/ember.test.ts src/core/seed.ts src/core/seed.test.ts
git commit -m "feat: add, edit, delete, keep and cancel resources; sample resources in demo data

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Phase B — the Resources tab

### Task 6: Navigation, UI state and the Resources view

**Files:**
- Modify: `src/stores/ui.ts`, `src/components/NavBar.vue`, `src/App.vue`
- Create: `src/components/resources/ResourcesView.vue`
- Test: `src/stores/ui.test.ts`, `src/components/NavBar.test.ts`, `src/components/resources/ResourcesView.test.ts`

**Interfaces:**
- Consumes: `libraryKicker`, `moneyLine`, `liveResources`, `StatusFilter`, `GoalFilter` (Task 4).
- Produces (ui store): `View` includes `'resources'`; `resourceStatus: Ref<StatusFilter>` (default `'using'`); `resourceGoal: Ref<GoalFilter>` (default `'all'`); `highlight: Ref<string | null>`; `fmResourcesOpen: Ref<boolean>`; `openResources(goal?: GoalFilter, status?: StatusFilter): void`. `ui.escape()` closes `fmResourcesOpen` before Focus mode; `openFocusMode`/`closeFocusMode` reset it.
- Produces: `ResourcesView.vue` (no props). Tasks 7 and 8 add children to it.

- [ ] **Step 1: Write failing tests.**

`src/stores/ui.test.ts`:

```ts
  it('opens Resources with filters, and Esc closes the Focus mode resources panel first', () => {
    const ui = useUiStore()
    expect(ui).toMatchObject({ resourceStatus: 'using', resourceGoal: 'all', highlight: null, fmResourcesOpen: false })
    ui.openResources('D3', 'all')
    expect(ui).toMatchObject({ view: 'resources', resourceGoal: 'D3', resourceStatus: 'all' })
    ui.openResources()
    expect(ui).toMatchObject({ resourceGoal: 'all', resourceStatus: 'using' })
    ui.openFocusMode()
    ui.fmResourcesOpen = true
    expect(ui.escape()).toBe(true)
    expect(ui.fmResourcesOpen).toBe(false)
    expect(ui.focusModeOpen).toBe(true)
    ui.fmResourcesOpen = true
    ui.closeFocusMode()
    expect(ui.fmResourcesOpen).toBe(false)
  })
```

`src/components/NavBar.test.ts` (follow the file's existing mount helper):

```ts
  it('has a Resources tab', async () => {
    const w = mountNav()
    const tab = w.findAll('.tab').find((b) => b.text() === 'Resources')!
    await tab.trigger('click')
    expect(useUiStore().view).toBe('resources')
  })
```

If `NavBar.test.ts` has no `mountNav` helper, use the same `setActivePinia(createPinia())` + `mount(NavBar)` lines its other tests use.

`src/components/resources/ResourcesView.test.ts`:

```ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Resource } from '../../core/model'
import { dataFixture, resourceFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import ResourcesView from './ResourcesView.vue'

function setup(resources: Resource[]) {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  ember.replaceData(dataFixture({ resources }))
  return { w: mount(ResourcesView), ember }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('ResourcesView', () => {
  it('shows the empty state with no resources', () => {
    const { w } = setup([])
    expect(w.find('.kicker').text()).toBe('Library')
    expect(w.find('.rv-pitch').text()).toContain('Keep the courses, videos, docs and models you learn from in one place')
    expect(w.findAll('.rv-how li')).toHaveLength(3)
    expect(w.find('.rv-money').exists()).toBe(false)
  })

  it('shows the kicker and the money line, red only for a renewal within a week', () => {
    const { w } = setup([
      resourceFixture('Coursera Plus', { company: 'Coursera', billing: 'month', price: 49, renewsOn: '2026-10-15' }),
      resourceFixture('InfoVis', { company: 'Coursera' }),
    ])
    expect(w.find('.kicker').text()).toBe('Library · 2 resources from 1 company')
    expect(w.find('.rv-money').text()).toBe('£49 a month on 1 subscription · Coursera Plus renews in 3 days')
    expect(w.find('.rv-renewal').classes()).toContain('text-accent')
    expect(w.find('.rv-pitch').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: Run** `npx vitest run src/stores/ui.test.ts src/components/NavBar.test.ts src/components/resources/ResourcesView.test.ts`. Expect failures.

- [ ] **Step 3: Implement.**

`src/stores/ui.ts`: import `type { GoalFilter, StatusFilter } from '../core/resources'`.

```ts
export type View = 'today' | 'goals' | 'activity' | 'resources'
```

Inside the store:

```ts
  /** Resources tab filters, the row to point at after "Show it", and Focus mode's resources panel. */
  const resourceStatus = ref<StatusFilter>('using')
  const resourceGoal = ref<GoalFilter>('all')
  const highlight = ref<string | null>(null)
  const fmResourcesOpen = ref(false)

  function openResources(goal: GoalFilter = 'all', status: StatusFilter = 'using') {
    resourceGoal.value = goal
    resourceStatus.value = status
    view.value = 'resources'
  }
```

`openFocusMode` and `closeFocusMode` each add `fmResourcesOpen.value = false`. In `escape()`, insert before the `focusModeOpen && fmSettingsOpen` check:

```ts
    if (focusModeOpen.value && fmResourcesOpen.value) {
      fmResourcesOpen.value = false
      return true
    }
```

Return the five new names.

`src/components/NavBar.vue`:

```ts
const TABS: [View, string][] = [['today', 'Today'], ['goals', 'Goals'], ['activity', 'Activity'], ['resources', 'Resources']]
```

`src/App.vue`: import `ResourcesView` and add before `<ActivityView v-else />`:

```vue
    <ResourcesView v-else-if="ui.view === 'resources'" />
```

`src/components/resources/ResourcesView.vue`:

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue'
import { libraryKicker, liveResources, moneyLine } from '../../core/resources'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'

const ember = useEmberStore()
const ui = useUiStore()

const any = computed(() => liveResources(ember.resources).length > 0)
const kicker = computed(() => (any.value ? libraryKicker(ember.resources) : 'Library'))
const money = computed(() => moneyLine(ember.resources, ember.today))
onBeforeUnmount(() => { ui.highlight = null })
</script>

<template>
  <main class="view resources-view">
    <div class="rv-col">
      <header class="rv-head">
        <span class="kicker">{{ kicker }}</span>
        <h2>Resources</h2>
        <p v-if="money" class="rv-money">
          <b class="tabular">{{ money.total }}</b> {{ money.count }}<template v-if="money.renewal"> · <b class="rv-renewal" :class="{ 'text-accent': money.renewal.soon, 'is-quiet': !money.renewal.soon }">{{ money.renewal.text }}</b></template>
        </p>
      </header>
      <template v-if="!any">
        <p class="rv-pitch">Keep the courses, videos, docs and models you learn from in one place, next to the goals they’re for.</p>
        <ol class="rv-how">
          <li>Ember fills in the company and the type from the link: Hugging Face, YouTube, Coursera, Udemy, GitHub, Kaggle and more.</li>
          <li>Link it to a goal, and it’s one click away whenever you focus on that goal.</li>
          <li>Add what a membership costs, and Today tells you before it renews.</li>
        </ol>
      </template>
    </div>
  </main>
</template>

<style scoped>
.rv-col { width: 100%; max-width: 1040px; display: flex; flex-direction: column; gap: var(--space-6); }
.rv-head { display: flex; flex-direction: column; gap: 6px; }
.rv-money { font-size: 14px; }
.rv-renewal.is-quiet { font-weight: 400; color: var(--color-neutral-700); }
.rv-pitch { max-width: 640px; font: 600 18px/1.45 var(--font-body); }
.rv-how { max-width: 640px; margin: 0; padding: 0; list-style: none; counter-reset: how; border-top: 2px solid var(--color-divider); }
.rv-how li {
  counter-increment: how; display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: var(--space-3);
  padding: var(--space-3) 0; border-bottom: 1px solid var(--color-divider); font-size: 14px;
}
.rv-how li::before { content: counter(how); font-weight: 800; }
</style>
```

- [ ] **Step 4: Run** the three test files plus `npx vitest run src/App.test.ts`. Expect PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/ui.ts src/stores/ui.test.ts src/components/NavBar.vue src/components/NavBar.test.ts src/App.vue src/components/resources
git commit -m "feat: Resources tab with library kicker, money line and empty state

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: Adding a resource

**Files:**
- Create: `src/components/resources/ResourceAdd.vue`
- Test: `src/components/resources/ResourceAdd.test.ts`
- Modify: `src/components/resources/ResourcesView.vue`

**Interfaces:**
- Consumes: `ember.addResource`, `ember.updateResource`, `ember.deleteResource` (Task 5); `normaliseUrl`, `findDuplicate`, `shortLink` (Task 1); `TYPE_LABEL`, `STATUS_LABEL`, `priceText`, `liveResources` (Task 4); `ui.showUndo`, `ui.startEdit`, `ui.highlight`, `ui.openResources` (Task 6).
- Produces: `ResourceAdd.vue` with props `{ goalId?: string | null; large?: boolean }`. It emits nothing; the just-added card lives inside it.

- [ ] **Step 1: Write failing tests** in `src/components/resources/ResourceAdd.test.ts`:

```ts
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Resource } from '../../core/model'
import { dataFixture, goalFixture, resourceFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import ResourceAdd from './ResourceAdd.vue'

function setup(resources: Resource[] = [], props: { goalId?: string | null } = {}) {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  ember.replaceData(dataFixture({ goals: [goalFixture('D3', [])], resources }))
  return { w: mount(ResourceAdd, { props, attachTo: document.body }), ember, ui: useUiStore() }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
  localStorage.clear()
})
afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('ResourceAdd', () => {
  it('adds a pasted link at once and shows the just-added card with the title focused', async () => {
    const { w, ember } = setup([], { goalId: 'D3' })
    await w.find('.ra-input').setValue('https://huggingface.co/learn/llm-course')
    await w.find('.ra-form').trigger('submit')
    await flushPromises()
    expect(ember.resources).toHaveLength(1)
    expect(ember.resources[0].goalId).toBe('D3')
    expect((w.find('.ra-input').element as HTMLInputElement).value).toBe('')
    expect(w.find('.ra-added').text()).toBe('Added huggingface.co/learn/llm-course')
    expect(document.activeElement).toBe(w.find('.ra-title').element)
    expect(w.findAll('.ra-chip').map((c) => c.text())).toEqual(['Hugging Face', 'Course', 'Using', 'D3', 'Free'])
  })

  it('renames from the card, and Done closes it', async () => {
    const { w, ember } = setup()
    await w.find('.ra-input').setValue('https://huggingface.co/learn/llm-course')
    await w.find('.ra-form').trigger('submit')
    await w.find('.ra-title').setValue('LLM Course')
    expect(ember.resources[0].title).toBe('LLM Course')
    await w.find('.ra-done').trigger('click')
    expect(w.find('.ra-card').exists()).toBe(false)
  })

  it('Undo on the card deletes it with the usual undo bar', async () => {
    const { w, ember, ui } = setup()
    await w.find('.ra-input').setValue('example.com/a')
    await w.find('.ra-form').trigger('submit')
    await w.find('.ra-undo').trigger('click')
    expect(ember.resources[0].deletedOn).toBe('2026-10-12')
    expect(ui.undo?.record.label).toBe('Deleted “A”')
    expect(w.find('.ra-card').exists()).toBe(false)
  })

  it('a chip opens the full edit panel on the Resources tab', async () => {
    const { w, ember, ui } = setup()
    await w.find('.ra-input').setValue('example.com/a')
    await w.find('.ra-form').trigger('submit')
    await w.findAll('.ra-chip')[1].trigger('click')
    const id = ember.resources[0].id
    expect(ui).toMatchObject({ view: 'resources', editing: `resource:${id}`, highlight: id, resourceGoal: 'all', resourceStatus: 'using' })
  })

  it('says when the text is not a link', async () => {
    const { w, ember } = setup()
    await w.find('.ra-input').setValue('hello there')
    await w.find('.ra-form').trigger('submit')
    expect(w.find('.ra-error').text()).toBe('That doesn’t look like a link.')
    expect(ember.resources).toHaveLength(0)
    await w.find('.ra-input').setValue('hello there!')
    expect(w.find('.ra-error').exists()).toBe(false)
  })

  it('spots a saved link while typing, disables Add and offers to show it', async () => {
    const { w, ui } = setup([resourceFixture('Joins', { url: 'https://youtube.com/watch?v=dQw4w9WgXcQ', company: 'YouTube' })])
    await w.find('.ra-input').setValue('https://youtu.be/dQw4w9WgXcQ')
    expect(w.find('.ra-dup').text()).toBe('Already saved: Joins · YouTube · Using. Show it')
    expect(w.find('.ra-submit').attributes('disabled')).toBeDefined()
    await w.find('.ra-show').trigger('click')
    expect(ui).toMatchObject({ view: 'resources', highlight: 'Joins', resourceStatus: 'all', resourceGoal: 'all' })
  })
})
```

- [ ] **Step 2: Run** `npx vitest run src/components/resources/ResourceAdd.test.ts`. Expect failure (no component).

- [ ] **Step 3: Implement** `src/components/resources/ResourceAdd.vue`:

```vue
<script setup lang="ts">
import { Plus } from 'lucide-vue-next'
import { computed, nextTick, ref, watch } from 'vue'
import { findDuplicate, normaliseUrl, shortLink } from '../../core/companies'
import { isLive } from '../../core/goals'
import { STATUS_LABEL, TYPE_LABEL, priceText } from '../../core/resources'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'

const props = withDefaults(defineProps<{ goalId?: string | null; large?: boolean }>(), { goalId: null, large: false })
const ember = useEmberStore()
const ui = useUiStore()

const text = ref('')
const invalid = ref(false)
const addedId = ref<string | null>(null)
const titleInput = ref<HTMLInputElement | null>(null)

watch(text, () => { invalid.value = false })

const dup = computed(() => {
  const url = normaliseUrl(text.value)
  return url ? findDuplicate(url, ember.resources) : null
})
const added = computed(() => {
  const r = addedId.value ? ember.resourceById(addedId.value) : null
  return r && isLive(r) ? r : null
})
const chips = computed(() => {
  const r = added.value
  if (!r) return []
  const goal = r.goalId ? ember.goals.find((g) => g.id === r.goalId && isLive(g)) : null
  return [r.company, TYPE_LABEL[r.type], STATUS_LABEL[r.status], goal ? goal.title : 'No goal', priceText(r, ember.resources)]
})

async function add() {
  if (dup.value) return
  const res = ember.addResource(text.value, { goalId: props.goalId })
  if (!res.ok) {
    invalid.value = res.reason === 'invalid'
    return
  }
  text.value = ''
  addedId.value = res.id
  await nextTick()
  titleInput.value?.focus()
  titleInput.value?.select()
}

function onTitle(e: Event) {
  if (addedId.value) ember.updateResource(addedId.value, { title: (e.target as HTMLInputElement).value })
}
function onTitleEnter(e: KeyboardEvent) {
  if (!e.isComposing) addedId.value = null
}

function edit() {
  const r = added.value
  if (!r) return
  const id = r.id
  addedId.value = null
  ui.openResources('all', r.status)
  ui.highlight = id
  ui.startEdit(`resource:${id}`)
}

function undo() {
  const id = addedId.value
  addedId.value = null
  if (id) ui.showUndo(ember.deleteResource(id))
}

function showIt() {
  const r = dup.value
  if (!r) return
  text.value = ''
  ui.openResources('all', 'all')
  ui.highlight = r.id
}
</script>

<template>
  <div class="resource-add" :class="{ 'is-large': large }">
    <form class="ra-form" @submit.prevent="add">
      <label class="ra-label">
        <span class="sr-only">Link</span>
        <input
          v-model="text"
          class="input ra-input"
          type="text"
          inputmode="url"
          autocomplete="off"
          placeholder="Paste a link to add it"
          :aria-invalid="invalid || undefined"
          :aria-describedby="invalid ? 'ra-error' : dup ? 'ra-dup' : undefined"
        />
      </label>
      <button class="btn btn-primary ra-submit" type="submit" :disabled="!!dup || !text.trim()">
        <Plus :size="16" :stroke-width="2.5" />Add
      </button>
    </form>
    <p v-if="invalid" id="ra-error" class="ra-msg ra-error" role="alert">That doesn’t look like a link.</p>
    <p v-else-if="dup" id="ra-dup" class="ra-msg ra-dup" role="status">
      Already saved: <b>{{ dup.title }}</b> · {{ dup.company }} · {{ STATUS_LABEL[dup.status] }}. <button type="button" class="btn btn-ghost ra-show" @click="showIt">Show it</button>
    </p>

    <div v-if="added" class="ra-card" role="group" aria-label="Added resource">
      <span class="ra-added">Added {{ shortLink(added.url) }}</span>
      <label class="ra-field">
        <span class="label">Title</span>
        <input ref="titleInput" class="input ra-title" :value="added.title" @input="onTitle" @keydown.enter="onTitleEnter" />
      </label>
      <div class="ra-chips">
        <button v-for="(c, i) in chips" :key="i" type="button" class="ra-chip" :class="{ 'is-company': i === 0 }" @click="edit">{{ c }}</button>
      </div>
      <div class="ep-actions">
        <button type="button" class="btn btn-secondary ra-done" @click="addedId = null">Done</button>
        <button type="button" class="btn btn-ghost ra-undo" @click="undo">Undo</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.resource-add { display: flex; flex-direction: column; gap: var(--space-2); max-width: 640px; }
.ra-form { display: flex; gap: var(--space-2); }
.ra-label { flex: 1; min-width: 0; }
.ra-input { min-height: 40px; }
.is-large .ra-input, .is-large .ra-submit { min-height: 48px; font-size: 16px; }
.ra-msg { font-size: 13px; }
.ra-error { color: var(--color-accent-700); font-weight: 700; }
.ra-show { padding: 0 var(--space-1); font-size: 13px; color: var(--color-accent-700); }
.ra-card {
  display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3);
  background: var(--color-surface); border: 2px solid var(--color-text);
}
.ra-added { font-size: 12px; color: var(--color-neutral-700); overflow-wrap: anywhere; }
.ra-field { display: flex; flex-direction: column; gap: 4px; }
.ra-title { background: var(--color-bg); }
.ra-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.ra-chip {
  padding: 3px 10px; border: 1px solid var(--color-divider); background: transparent;
  font-size: 12px; color: var(--color-text);
}
.ra-chip.is-company { font-weight: 700; }
.ra-chip:hover { border-color: var(--color-accent); }
@media (max-width: 520px) { .ra-input, .ra-submit { min-height: 44px; } }
</style>
```

In `ResourcesView.vue`: import `ResourceAdd`, and add a computed for the goal the add box should use:

```ts
const filterGoal = computed(() => (ui.resourceGoal !== 'all' && ui.resourceGoal !== 'none' ? ui.resourceGoal : null))
```

In the template, put `<ResourceAdd :goal-id="filterGoal" />` right after `</header>` inside a `<template v-if="any">`, and in the empty-state branch put `<ResourceAdd large />` between `.rv-pitch` and `.rv-how`.

Add to `ResourcesView.test.ts`:

```ts
  it('adds with the goal filter as the goal, and the empty state uses the large box', async () => {
    const { w, ember } = setup([resourceFixture('A', { goalId: 'D3' })])
    ember.goals.push(goalFixture('D3', []))
    useUiStore().resourceGoal = 'D3'
    await w.vm.$nextTick()
    await w.find('.ra-input').setValue('example.com/b')
    await w.find('.ra-form').trigger('submit')
    expect(ember.resources[1].goalId).toBe('D3')
    expect(setup([]).w.find('.resource-add').classes()).toContain('is-large')
  })
```

(Import `goalFixture` and `useUiStore` in the test file.)

- [ ] **Step 4: Run** `npx vitest run src/components/resources/`. Expect PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/resources
git commit -m "feat: paste a link to add a resource, with duplicate and invalid-link messages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: Filters and the company ledger

**Files:**
- Create: `src/components/resources/ResourceFilters.vue`, `src/components/resources/ResourceList.vue`, `src/components/resources/ResourceRow.vue`
- Test: `src/components/resources/ResourceList.test.ts`
- Modify: `src/components/resources/ResourcesView.vue`

**Interfaces:**
- Consumes: `resourceList`, `statusCounts`, `goalFilterOptions`, `STATUS_LABEL`, `TYPE_LABEL`, `CompanyGroup`, `ResourceRowView`, `StatusFilter` (Task 4); `ember.deleteResource` (Task 5); `RowMenu` (existing: props `menuKey`, `label`, emits `delete`).
- Produces: `ResourceRow.vue` with prop `{ row: ResourceRowView; showStatus: boolean }`; menu key and edit key `resource:<id>`. Task 9 adds the edit panel to it.

- [ ] **Step 1: Write failing tests** in `src/components/resources/ResourceList.test.ts`:

```ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dataFixture, goalFixture, resourceFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import ResourcesView from './ResourcesView.vue'

const resources = [
  resourceFixture('Coursera Plus', { company: 'Coursera', type: 'membership', billing: 'month', price: 49, renewsOn: '2026-10-15', createdAt: '2026-09-02' }),
  resourceFixture('InfoVis', { company: 'Coursera', goalId: 'D3', notes: 'Week 3 of 5', url: 'https://coursera.org/learn/infovis' }),
  resourceFixture('LLM Course', { company: 'Hugging Face' }),
  resourceFixture('Masterclass', { company: 'Udemy', billing: 'once', price: 12.99, status: 'dropped', goalId: 'D3' }),
]

function setup() {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  ember.replaceData(dataFixture({ goals: [goalFixture('D3', [])], resources: structuredClone(resources) }))
  return { w: mount(ResourcesView, { attachTo: document.body }), ember, ui: useUiStore() }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
  localStorage.clear()
})
afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('Resources ledger', () => {
  it('groups in-use resources by company with subtotals', () => {
    const { w } = setup()
    expect(w.findAll('.rl-company').map((c) => c.text())).toEqual(['Coursera', 'Hugging Face'])
    expect(w.findAll('.rl-sub')[0].text()).toBe('2 resources · £49 a month')
    const rows = w.findAll('.rr')
    expect(rows.map((r) => r.find('.rr-title').text())).toEqual(['Coursera Plus', 'InfoVis', 'LLM Course'])
    expect(rows[1].find('.rr-title').attributes()).toMatchObject({ href: 'https://coursera.org/learn/infovis', target: '_blank', rel: 'noopener noreferrer' })
    expect(rows[1].find('.rr-type').text()).toBe('Course')
    expect(rows[1].find('.rr-goal').text()).toBe('D3')
    expect(rows[1].find('.rr-notes').text()).toBe('Week 3 of 5')
    expect(rows[0].find('.rr-goal').exists()).toBe(false)
    expect(rows[1].find('.rr-price').text()).toBe('In Coursera Plus')
    expect(rows[0].find('.rr-price').text()).toBe('£49 / month')
    expect(rows[0].find('.rr-renew').text()).toBe('Renews Oct 15 · in 3 days')
    expect(rows[0].find('.rr-renew').classes()).toContain('is-soon')
  })

  it('filters by status (with counts) and by goal', async () => {
    const { w, ui } = setup()
    expect(w.findAll('.rf-status .seg-opt').map((o) => o.text())).toEqual(['Using 3', 'Later 0', 'Finished 0', 'Dropped 1', 'All 4'])
    await w.findAll('.rf-status input')[3].setValue()
    expect(ui.resourceStatus).toBe('dropped')
    expect(w.findAll('.rr-title').map((t) => t.text())).toEqual(['Masterclass'])
    await w.findAll('.rf-status input')[4].setValue()
    expect(w.findAll('.rr-status').map((t) => t.text())).toEqual(['Using', 'Using', 'Using', 'Dropped'])
    await w.find('.rf-goal').setValue('D3')
    expect(w.findAll('.rr-title').map((t) => t.text())).toEqual(['InfoVis', 'Masterclass'])
    expect(w.findAll('.rf-goal option').map((o) => o.text())).toEqual(['All goals', 'D3', 'No goal'])
  })

  it('says so when a filter matches nothing', async () => {
    const { w } = setup()
    await w.findAll('.rf-status input')[1].setValue()
    expect(w.find('.rl-empty').text()).toBe('Nothing here.')
  })

  it('deletes from the row menu with undo', async () => {
    const { w, ember, ui } = setup()
    await w.findAll('.rr')[2].find('.rmn-trigger').trigger('click')
    await w.find('.rmn-delete').trigger('click')
    expect(ember.resources[2].deletedOn).toBe('2026-10-12')
    expect(ui.undo?.record.label).toBe('Deleted “LLM Course”')
  })

  it('marks the highlighted row', async () => {
    const { w, ui } = setup()
    ui.highlight = 'LLM Course'
    await w.vm.$nextTick()
    expect(w.findAll('.rr')[2].classes()).toContain('is-highlight')
  })
})
```

- [ ] **Step 2: Run** `npx vitest run src/components/resources/ResourceList.test.ts`. Expect failures.

- [ ] **Step 3: Implement.**

`src/components/resources/ResourceFilters.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { STATUS_LABEL, goalFilterOptions, statusCounts, type StatusFilter } from '../../core/resources'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'

const ember = useEmberStore()
const ui = useUiStore()
const ORDER: StatusFilter[] = ['using', 'later', 'finished', 'dropped', 'all']
const counts = computed(() => statusCounts(ember.resources, ui.resourceGoal, ember.goals))
const label = (s: StatusFilter) => (s === 'all' ? 'All' : STATUS_LABEL[s])
const goals = computed(() => goalFilterOptions(ember.resources, ember.goals))
</script>

<template>
  <div class="resource-filters">
    <div class="seg rf-status" role="radiogroup" aria-label="Status">
      <label v-for="s in ORDER" :key="s" class="seg-opt">
        <input v-model="ui.resourceStatus" type="radio" name="ember-resource-status" :value="s" />{{ label(s) }} <span class="rf-count tabular">{{ counts[s] }}</span>
      </label>
    </div>
    <label class="rf-goal-label">Goal
      <select v-model="ui.resourceGoal" class="input input-sm rf-goal">
        <option v-for="o in goals" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
    </label>
  </div>
</template>

<style scoped>
.resource-filters { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3) var(--space-4); }
.rf-status { flex-wrap: wrap; max-width: 100%; }
.rf-count { opacity: .7; }
.rf-goal-label { display: inline-flex; align-items: center; gap: var(--space-2); font-size: 13px; }
@media (max-width: 520px) {
  .rf-status { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); width: 100%; }
  .rf-status .seg-opt { flex-direction: column; justify-content: center; gap: 0; min-height: 44px; padding: 4px 2px; font-size: 12px; text-align: center; }
  .rf-status .seg-opt + .seg-opt { border-left: 1px solid var(--color-divider); }
}
</style>
```

The text of each option renders as e.g. `Using 3` (label, space, count), which is what the test reads.

`src/components/resources/ResourceRow.vue`:

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { STATUS_LABEL, TYPE_LABEL, type ResourceRowView } from '../../core/resources'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import RowMenu from '../RowMenu.vue'

const props = defineProps<{ row: ResourceRowView; showStatus: boolean }>()
const ember = useEmberStore()
const ui = useUiStore()
const root = ref<HTMLElement | null>(null)
const r = computed(() => props.row.resource)
const key = computed(() => `resource:${r.value.id}`)
const highlighted = computed(() => ui.highlight === r.value.id)

watch(highlighted, (on) => { if (on) root.value?.scrollIntoView?.({ block: 'center' }) }, { flush: 'post', immediate: true })

function onDelete() {
  ui.editing = null
  ui.showUndo(ember.deleteResource(r.value.id))
}
</script>

<template>
  <div ref="root" class="rr" :class="{ 'is-highlight': highlighted }">
    <div class="rr-row">
      <div class="rr-body">
        <a class="rr-title" :href="r.url" target="_blank" rel="noopener noreferrer">{{ r.title }}</a>
        <span class="rr-meta">
          <span class="tag tag-neutral rr-type">{{ TYPE_LABEL[r.type] }}</span>
          <span v-if="row.goal" class="rr-goal"><span class="swatch swatch-sm" :style="{ background: row.goal.color }"></span>{{ row.goal.title }}</span>
          <span v-if="showStatus" class="rr-status">{{ STATUS_LABEL[r.status] }}</span>
          <span v-if="r.notes" class="rr-notes">{{ r.notes }}</span>
        </span>
      </div>
      <div class="rr-cost">
        <span class="rr-price tabular" :class="{ 'is-paid': row.paid }">{{ row.price }}</span>
        <span v-if="row.renewal" class="rr-renew" :class="{ 'is-soon': row.renewal.soon }">{{ row.renewal.text }}</span>
      </div>
      <RowMenu :menu-key="key" :label="r.title" @delete="onDelete" />
    </div>
  </div>
</template>

<style scoped>
.rr + .rr { border-top: 1px solid var(--color-divider); }
.rr.is-highlight { background: var(--color-accent-100); }
.rr-row { display: grid; grid-template-columns: minmax(0, 1fr) auto 28px; gap: 4px var(--space-4); align-items: center; padding: var(--space-2) 0 var(--space-2) var(--space-2); }
.rr-body { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.rr-title { font-size: 14px; font-weight: 600; color: var(--color-text); text-decoration: none; overflow-wrap: anywhere; }
.rr-title:hover { color: var(--color-accent-700); text-decoration: underline; }
.rr-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 10px; font-size: 11px; color: var(--color-neutral-700); }
.rr-type { padding: 1px 8px; }
.rr-goal { display: inline-flex; align-items: center; gap: 5px; }
.rr-status { font-weight: 700; }
.rr-cost { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; text-align: right; }
.rr-price { font-size: 13px; color: var(--color-neutral-700); }
.rr-price.is-paid { font-weight: 700; color: var(--color-text); }
.rr-renew { font-size: 11px; color: var(--color-neutral-700); }
.rr-renew.is-soon { font-weight: 700; color: var(--color-accent-700); }
@media (max-width: 520px) {
  .rr-row { grid-template-columns: minmax(0, 1fr) 44px; }
  .rr-cost { grid-column: 1; grid-row: 2; flex-direction: row; flex-wrap: wrap; gap: 2px 10px; align-items: baseline; }
}
</style>
```

`src/components/resources/ResourceList.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { resourceList } from '../../core/resources'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import ResourceRow from './ResourceRow.vue'

const ember = useEmberStore()
const ui = useUiStore()
const groups = computed(() => resourceList(ember.resources, ember.goals, { status: ui.resourceStatus, goal: ui.resourceGoal }, ember.today))
</script>

<template>
  <div class="resource-list">
    <p v-if="!groups.length" class="muted rl-empty">Nothing here.</p>
    <section v-for="g in groups" :key="g.company" class="rl-group" :aria-label="g.company">
      <div class="rl-head">
        <h3 class="rl-company">{{ g.company }}</h3>
        <span class="rl-sub tabular">{{ g.sub }}</span>
      </div>
      <div class="rl-rows">
        <ResourceRow v-for="row in g.rows" :key="row.resource.id" :row="row" :show-status="ui.resourceStatus === 'all'" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.resource-list { display: flex; flex-direction: column; border-top: 2px solid var(--color-divider); }
.rl-empty { padding: var(--space-4) 0; }
.rl-group { display: flex; flex-wrap: wrap; border-bottom: 2px solid var(--color-divider); }
.rl-head { flex: 1 1 180px; max-width: 220px; display: flex; flex-direction: column; gap: 2px; padding: 10px var(--space-4) 6px 0; }
.rl-company { font: 800 14px/1.3 var(--font-heading); letter-spacing: 0; overflow-wrap: anywhere; }
.rl-sub { font-size: 11px; color: var(--color-neutral-700); }
.rl-rows { flex: 999 1 480px; min-width: 0; }
@media (max-width: 720px) {
  .rl-head { max-width: none; flex-direction: row; justify-content: space-between; align-items: baseline; padding-bottom: 0; }
}
</style>
```

In `ResourcesView.vue`, import `ResourceFilters` and `ResourceList`, and inside the `v-if="any"` template after `<ResourceAdd …/>` add:

```vue
        <ResourceFilters />
        <ResourceList />
```

- [ ] **Step 4: Run** `npx vitest run src/components/resources/`. Expect PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/resources
git commit -m "feat: resources ledger grouped by company, with status and goal filters

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: Editing a resource

**Files:**
- Create: `src/components/resources/ResourceEditPanel.vue`
- Test: `src/components/resources/ResourceEditPanel.test.ts`
- Modify: `src/components/resources/ResourceRow.vue`

**Interfaces:**
- Consumes: `ember.updateResource` (`ResourcePatch`), `ember.deleteResource` (Task 5); `companySuggestions` (Task 1); `TYPE_LABEL`, `STATUS_LABEL` (Task 4); `goalOptions(goals, currentId)` (existing, core/goals); `RESOURCE_TYPES`, `RESOURCE_STATUSES` (Task 1).
- Produces: `ResourceEditPanel.vue` with prop `{ resource: Resource }` and event `delete`. It is shown under a row when `ui.editing === 'resource:<id>'`.

- [ ] **Step 1: Write failing tests** in `src/components/resources/ResourceEditPanel.test.ts`:

```ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Resource } from '../../core/model'
import { dataFixture, goalFixture, resourceFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import ResourceEditPanel from './ResourceEditPanel.vue'

function setup(r: Resource, others: Resource[] = []) {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  const achieved = { ...goalFixture('Old', []), status: 'achieved' as const, achievedOn: '2026-10-01' }
  ember.replaceData(dataFixture({ goals: [goalFixture('D3', []), achieved], resources: [r, ...others] }))
  const ui = useUiStore()
  ui.editing = `resource:${r.id}`
  const w = mount(ResourceEditPanel, { props: { resource: ember.resources[0] }, attachTo: document.body })
  return { w, ember, ui }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
  localStorage.clear()
})
afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('ResourceEditPanel', () => {
  it('saves every field and closes', async () => {
    const { w, ember, ui } = setup(resourceFixture('A'), [resourceFixture('B', { company: 'Coursera' })])
    await w.find('.re-title').setValue('Coursera Plus')
    await w.find('.re-url').setValue('https://www.coursera.org/courseraplus/')
    await w.find('.re-company').setValue('Coursera')
    await w.find('.re-type').setValue('membership')
    await w.find('.re-goal').setValue('D3')
    await w.find('.re-status input[value="later"]').setValue()
    await w.find('.re-billing input[value="month"]').setValue()
    await w.find('.re-price').setValue('49')
    await w.find('.re-renews').setValue('2026-10-15')
    await w.find('.re-notes').setValue('Covers the course')
    await w.find('.re-save').trigger('click')
    expect(ember.resources[0]).toMatchObject({
      title: 'Coursera Plus', url: 'https://coursera.org/courseraplus', company: 'Coursera', type: 'membership', goalId: 'D3',
      status: 'later', billing: 'month', price: 49, renewsOn: '2026-10-15', notes: 'Covers the course',
    })
    expect(ui.editing).toBeNull()
  })

  it('shows price and renewal fields only when they apply', async () => {
    const { w } = setup(resourceFixture('A'))
    expect(w.find('.re-price').exists()).toBe(false)
    await w.find('.re-billing input[value="once"]').setValue()
    expect(w.find('.re-price').exists()).toBe(true)
    expect(w.find('.re-renews').exists()).toBe(false)
    await w.find('.re-billing input[value="year"]').setValue()
    expect(w.find('.re-renews').exists()).toBe(true)
  })

  it('cannot save a paid cost without a positive price', async () => {
    const { w } = setup(resourceFixture('A'))
    await w.find('.re-billing input[value="month"]').setValue()
    expect(w.find('.re-save').attributes('disabled')).toBeDefined()
    await w.find('.re-price').setValue('0')
    expect(w.find('.re-save').attributes('disabled')).toBeDefined()
    await w.find('.re-price').setValue('8')
    expect(w.find('.re-save').attributes('disabled')).toBeUndefined()
  })

  it('explains what a membership does', async () => {
    const { w } = setup(resourceFixture('Coursera Plus', { company: 'Coursera' }))
    expect(w.find('.re-hint').exists()).toBe(false)
    await w.find('.re-type').setValue('membership')
    expect(w.find('.re-hint').text()).toBe('While you’re using it, your other Coursera resources show as “In Coursera Plus”.')
  })

  it('offers active and paused goals, plus an achieved goal already linked', () => {
    expect(setup(resourceFixture('A')).w.findAll('.re-goal option').map((o) => o.text())).toEqual(['No goal', 'D3'])
    expect(setup(resourceFixture('A', { goalId: 'Old' })).w.findAll('.re-goal option').map((o) => o.text())).toEqual(['No goal', 'D3', 'Old'])
  })

  it('suggests companies already used', () => {
    const { w } = setup(resourceFixture('A'), [resourceFixture('B', { company: 'Coursera' }), resourceFixture('C', { company: 'YouTube' })])
    expect(w.findAll('#re-companies option').map((o) => o.attributes('value'))).toEqual(['Coursera', 'Example', 'YouTube'])
  })

  it('cancels without saving, and Delete emits delete', async () => {
    const { w, ember, ui } = setup(resourceFixture('A'))
    await w.find('.re-title').setValue('Changed')
    await w.find('.re-cancel').trigger('click')
    expect(ember.resources[0].title).toBe('A')
    expect(ui.editing).toBeNull()
    await w.find('.re-delete').trigger('click')
    expect(w.emitted('delete')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run** `npx vitest run src/components/resources/ResourceEditPanel.test.ts`. Expect failure.

- [ ] **Step 3: Implement** `src/components/resources/ResourceEditPanel.vue`:

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { companySuggestions } from '../../core/companies'
import { goalOptions } from '../../core/goals'
import { RESOURCE_STATUSES, RESOURCE_TYPES, type Billing, type Resource } from '../../core/model'
import { STATUS_LABEL, TYPE_LABEL } from '../../core/resources'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'

const props = defineProps<{ resource: Resource }>()
const emit = defineEmits<{ delete: [e: Event] }>()
const ember = useEmberStore()
const ui = useUiStore()

const BILLING: [Billing, string][] = [['free', 'Free'], ['once', 'One-off'], ['month', 'Monthly'], ['year', 'Yearly']]

const title = ref(props.resource.title)
const url = ref(props.resource.url)
const company = ref(props.resource.company)
const type = ref(props.resource.type)
const status = ref(props.resource.status)
const goals = computed(() => goalOptions(ember.goals, props.resource.goalId))
const startGoal = props.resource.goalId && goals.value.some((g) => g.id === props.resource.goalId) ? props.resource.goalId : ''
const goalId = ref(startGoal)
const billing = ref<Billing>(props.resource.billing)
const price = ref(props.resource.price == null ? '' : String(props.resource.price))
const renewsOn = ref(props.resource.renewsOn ?? '')
const notes = ref(props.resource.notes)
const titleInput = ref<HTMLInputElement | null>(null)

const suggestions = computed(() => companySuggestions(ember.resources, ''))
const priceValue = computed(() => Number(price.value))
const paid = computed(() => billing.value !== 'free')
const recurring = computed(() => billing.value === 'month' || billing.value === 'year')
const canSave = computed(() => !paid.value || (Number.isFinite(priceValue.value) && priceValue.value > 0))

onMounted(() => titleInput.value?.focus())

function save() {
  if (!canSave.value) return
  ember.updateResource(props.resource.id, {
    title: title.value,
    url: url.value,
    company: company.value,
    type: type.value,
    status: status.value,
    // Only touch the link if the user changed it: a resource whose goal was deleted keeps it for undo.
    ...(goalId.value !== startGoal ? { goalId: goalId.value || null } : {}),
    billing: billing.value,
    price: paid.value ? priceValue.value : null,
    renewsOn: recurring.value && renewsOn.value ? renewsOn.value : null,
    notes: notes.value,
  })
  ui.editing = null
}

function onEnter(e: KeyboardEvent) {
  if (!e.isComposing) save()
}
</script>

<template>
  <div class="edit-panel resource-edit" role="group" :aria-label="`Edit “${resource.title}”`">
    <label class="re-field"><span class="label">Title</span>
      <input ref="titleInput" v-model="title" class="input re-title" @keydown.enter="onEnter" />
    </label>
    <div class="re-row">
      <label class="re-field re-grow"><span class="label">Link</span>
        <input v-model="url" class="input re-url" inputmode="url" @keydown.enter="onEnter" />
      </label>
      <label class="re-field"><span class="label">Company</span>
        <input v-model="company" class="input re-company" list="re-companies" @keydown.enter="onEnter" />
        <datalist id="re-companies"><option v-for="c in suggestions" :key="c" :value="c"></option></datalist>
      </label>
    </div>
    <div class="re-row">
      <label class="re-field"><span class="label">Type</span>
        <select v-model="type" class="input re-type">
          <option v-for="t in RESOURCE_TYPES" :key="t" :value="t">{{ TYPE_LABEL[t] }}</option>
        </select>
      </label>
      <label class="re-field"><span class="label">Goal</span>
        <select v-model="goalId" class="input re-goal">
          <option value="">No goal</option>
          <option v-for="g in goals" :key="g.id" :value="g.id">{{ g.title }}</option>
        </select>
      </label>
    </div>
    <p v-if="type === 'membership'" class="re-hint">While you’re using it, your other {{ company || 'company' }} resources show as “In {{ title || 'this membership' }}”.</p>
    <div class="re-field"><span class="label">Status</span>
      <div class="seg re-status" role="radiogroup" aria-label="Status">
        <label v-for="s in RESOURCE_STATUSES" :key="s" class="seg-opt">
          <input v-model="status" type="radio" :name="`re-status-${resource.id}`" :value="s" />{{ STATUS_LABEL[s] }}
        </label>
      </div>
    </div>
    <div class="re-field"><span class="label">Cost</span>
      <div class="seg re-billing" role="radiogroup" aria-label="Cost">
        <label v-for="[b, l] in BILLING" :key="b" class="seg-opt">
          <input v-model="billing" type="radio" :name="`re-billing-${resource.id}`" :value="b" />{{ l }}
        </label>
      </div>
    </div>
    <div v-if="paid" class="re-row">
      <label class="re-field"><span class="label">Price, £</span>
        <input v-model="price" class="input re-price tabular" type="number" min="0.01" step="0.01" inputmode="decimal" @keydown.enter="onEnter" />
      </label>
      <label v-if="recurring" class="re-field"><span class="label">Renews on</span>
        <input v-model="renewsOn" class="input re-renews" type="date" />
      </label>
    </div>
    <label class="re-field"><span class="label">Notes</span>
      <textarea v-model="notes" class="input re-notes" rows="2"></textarea>
    </label>
    <div class="ep-actions">
      <button class="btn btn-primary re-save" :disabled="!canSave" @click="save">Save</button>
      <button class="btn btn-ghost re-cancel" @click="ui.editing = null">Cancel</button>
      <button class="btn btn-ghost ep-delete re-delete" @click="emit('delete', $event)">Delete</button>
    </div>
  </div>
</template>

<style scoped>
.resource-edit { gap: var(--space-3); }
.re-row { display: flex; flex-wrap: wrap; gap: var(--space-3); }
.re-field { display: flex; flex-direction: column; gap: 4px; flex: 1 1 160px; min-width: 0; }
.re-grow { flex: 2 1 240px; }
.re-field .input { background: var(--color-bg); }
.re-notes { resize: vertical; }
.re-hint { margin-top: calc(-1 * var(--space-2)); font-size: 12px; color: var(--color-neutral-700); }
</style>
```

The datalist test expects `['Coursera', 'Example', 'YouTube']`: `companySuggestions(…, '')` sorts by count, then by name, and every company here has one resource, so the order is alphabetical.

In `ResourceRow.vue`: import `ResourceEditPanel`, add `const editing = computed(() => ui.editing === key.value)`, and render after `.rr-row`:

```vue
    <ResourceEditPanel v-if="editing" :resource="r" @delete="onDelete" />
```

Add to `ResourceList.test.ts`:

```ts
  it('opens the edit panel from the row menu', async () => {
    const { w } = setup()
    await w.findAll('.rr')[2].find('.rmn-trigger').trigger('click')
    await w.find('.rmn-edit').trigger('click')
    expect(w.findAll('.rr')[2].find('.resource-edit').exists()).toBe(true)
  })
```

- [ ] **Step 4: Run** `npx vitest run src/components/resources/`. Expect PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/resources
git commit -m "feat: edit a resource's link, company, type, goal, status, cost and notes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Phase C — resources in the Ember loop

### Task 10: Goal page strip

**Files:**
- Create: `src/components/goals/GoalResources.vue`
- Test: `src/components/goals/GoalResources.test.ts`
- Modify: `src/components/goals/GoalSummary.vue`

**Interfaces:**
- Consumes: `goalResources`, `liveResources` (Task 4); `ResourceAdd` (Task 7); `ui.openResources` (Task 6).
- Produces: `GoalResources.vue` with prop `{ goal: Goal }`.

- [ ] **Step 1: Write failing tests** in `src/components/goals/GoalResources.test.ts`:

```ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Resource } from '../../core/model'
import { dataFixture, goalFixture, resourceFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import GoalResources from './GoalResources.vue'

function setup(resources: Resource[]) {
  setActivePinia(createPinia())
  const ember = useEmberStore()
  ember.replaceData(dataFixture({ goals: [goalFixture('D3', [])], resources }))
  return { w: mount(GoalResources, { props: { goal: ember.goals[0] } }), ember, ui: useUiStore() }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('GoalResources', () => {
  const rs = [
    resourceFixture('InfoVis', { goalId: 'D3', company: 'Coursera', createdAt: '2026-09-01' }),
    resourceFixture('Gallery', { goalId: 'D3', company: 'Observable', createdAt: '2026-09-02' }),
    resourceFixture('Masterclass', { goalId: 'D3', status: 'dropped' }),
    resourceFixture('Other', { goalId: null }),
  ]

  it("lists the goal's in-use resources as links, with All N for every live one", () => {
    const { w } = setup(rs)
    expect(w.findAll('.gr-link').map((a) => a.text())).toEqual(['InfoVis', 'Gallery'])
    expect(w.findAll('.gr-co').map((s) => s.text())).toEqual(['Coursera', 'Observable'])
    expect(w.find('.gr-link').attributes('target')).toBe('_blank')
    expect(w.find('.gr-all').text()).toBe('All 3')
  })

  it('All N opens the Resources tab filtered to the goal', async () => {
    const { w, ui } = setup(rs)
    await w.find('.gr-all').trigger('click')
    expect(ui).toMatchObject({ view: 'resources', resourceGoal: 'D3', resourceStatus: 'all' })
  })

  it('+ opens an inline add box that links to this goal', async () => {
    const { w, ember } = setup([])
    expect(w.find('.gr-none').text()).toBe('No resources yet')
    expect(w.find('.gr-all').exists()).toBe(false)
    await w.find('.gr-add').trigger('click')
    await w.find('.ra-input').setValue('example.com/new')
    await w.find('.ra-form').trigger('submit')
    expect(ember.resources[0].goalId).toBe('D3')
  })
})
```

- [ ] **Step 2: Run** `npx vitest run src/components/goals/GoalResources.test.ts`. Expect failure.

- [ ] **Step 3: Implement** `src/components/goals/GoalResources.vue`:

```vue
<script setup lang="ts">
import { Plus } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import type { Goal } from '../../core/model'
import { goalResources, liveResources } from '../../core/resources'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import ResourceAdd from '../resources/ResourceAdd.vue'

const props = defineProps<{ goal: Goal }>()
const ember = useEmberStore()
const ui = useUiStore()
const adding = ref(false)

const using = computed(() => goalResources(ember.resources, props.goal.id))
const all = computed(() => liveResources(ember.resources).filter((r) => r.goalId === props.goal.id).length)
</script>

<template>
  <div class="goal-resources">
    <div class="gr-strip">
      <span class="section-label">Using</span>
      <span v-for="r in using" :key="r.id" class="gr-item">
        <a class="gr-link" :href="r.url" target="_blank" rel="noopener noreferrer">{{ r.title }}</a><span class="gr-co">{{ r.company }}</span>
      </span>
      <span v-if="!using.length" class="gr-none">No resources yet</span>
      <span class="gr-end">
        <button v-if="all" class="btn btn-ghost gr-all" @click="ui.openResources(goal.id, 'all')">All {{ all }}</button>
        <button
          class="icon-btn gr-add"
          :class="{ 'is-on': adding }"
          :aria-expanded="adding"
          :aria-label="`Add a resource to ${goal.title}`"
          :title="`Add a resource to ${goal.title}`"
          @click="adding = !adding"
        >
          <Plus :size="14" :stroke-width="2.5" />
        </button>
      </span>
    </div>
    <ResourceAdd v-if="adding" class="gr-adder" :goal-id="goal.id" />
  </div>
</template>

<style scoped>
.goal-resources { display: flex; flex-direction: column; gap: var(--space-2); margin-top: calc(-1 * var(--space-6)); }
.gr-strip {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px 20px;
  padding: 10px var(--space-3); border: 2px solid var(--color-divider); border-top: 0;
}
.gr-item { display: inline-flex; align-items: baseline; gap: 6px; min-width: 0; }
.gr-link { font-size: 14px; font-weight: 700; color: var(--color-text); text-decoration: none; overflow-wrap: anywhere; }
.gr-link:hover { color: var(--color-accent-700); text-decoration: underline; }
.gr-co, .gr-none { font-size: 11px; color: var(--color-neutral-700); }
.gr-none { font-size: 13px; }
.gr-end { margin-left: auto; display: inline-flex; align-items: center; gap: var(--space-2); }
.gr-all { font-size: 12px; font-weight: 400; color: var(--color-neutral-700); }
.gr-adder { padding-top: var(--space-2); }
</style>
```

In `GoalSummary.vue`, import `GoalResources` and add `<GoalResources :goal="goal" />` directly after the `.gs-readme` div. Its negative top margin cancels the summary's gap so the strip joins the Readme box.

Add to `src/components/goals/GoalsView.test.ts` (follow that file's existing setup):

```ts
  it('shows the resources strip under the readme', () => {
    const w = mountGoalsView()
    expect(w.find('.gs-readme + .goal-resources').exists()).toBe(true)
  })
```

If `GoalsView.test.ts` has no `mountGoalsView` helper, use the mounting lines from its first test.

- [ ] **Step 4: Run** `npx vitest run src/components/goals/`. Expect PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/goals
git commit -m "feat: goal page shows the resources in use, with inline add

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11: Focus bar links

**Files:**
- Modify: `src/components/FocusBar.vue`
- Test: `src/components/FocusBar.test.ts`

**Interfaces:**
- Consumes: `selectionGoalId` (Task 4, core/selection), `goalResources` (Task 4), `ui.openResources` (Task 6).
- Produces: a `.fb-res` line inside `.fb-stack` (desktop: up to 3 links + `+N`; ≤760px: "N resources · ‹first link›").

- [ ] **Step 1: Write failing tests** in `src/components/FocusBar.test.ts` (reuse the file's setup/mount helpers; data below is the essential part):

```ts
describe('FocusBar — resources', () => {
  function withResources(resources: Resource[], selection: Selection) {
    setActivePinia(createPinia())
    const ember = useEmberStore()
    ember.replaceData(dataFixture({
      goals: [goalFixture('D3', [['M', [['S', null]]]])],
      tasks: [taskFixture('Loose')],
      resources,
      selection,
    }))
    return { w: mount(FocusBar), ember, ui: useUiStore() }
  }
  const step = { kind: 'step' as const, goalId: 'D3', msId: 'D3/M', stepId: 'D3/M/S' }
  const rs = ['A', 'B', 'C', 'D'].map((t, i) => resourceFixture(t, { goalId: 'D3', createdAt: `2026-09-0${i + 1}` }))

  it("links the selected goal's first three resources, then +N", async () => {
    const { w, ui } = withResources(rs, step)
    expect(w.findAll('.fb-res-link').map((a) => a.text())).toEqual(['A', 'B', 'C'])
    expect(w.find('.fb-res-link').attributes()).toMatchObject({ target: '_blank', rel: 'noopener noreferrer' })
    expect(w.find('.fb-res-count').text()).toBe('4 resources ·')
    await w.find('.fb-res-more').trigger('click')
    expect(ui).toMatchObject({ view: 'resources', resourceGoal: 'D3', resourceStatus: 'using' })
  })

  it('shows nothing without a goal, or when the goal is deleted', async () => {
    expect(withResources(rs, { kind: 'task', taskId: 'Loose' }).w.find('.fb-res').exists()).toBe(false)
    const { w, ember } = withResources(rs, step)
    const rec = ember.deleteGoal('D3')!
    await w.vm.$nextTick()
    expect(w.find('.fb-res').exists()).toBe(false)
    ember.undoDelete(rec)
    await w.vm.$nextTick()
    expect(w.findAll('.fb-res-link')).toHaveLength(3)
  })
})
```

(Import `Resource`, `Selection` types, `resourceFixture`, `taskFixture`, `useUiStore` as needed.)

`ember.deleteGoal` clears the selection when its target is deleted. `undoDelete` restores the selection only if nothing else was selected since, which holds here. So after undo the selection is the step again.

- [ ] **Step 2: Run** `npx vitest run src/components/FocusBar.test.ts`. Expect failures.

- [ ] **Step 3: Implement** in `FocusBar.vue`:

```ts
import { Link2 } from 'lucide-vue-next'   // add to the existing lucide import
import { goalResources } from '../core/resources'
import { selectionGoalId } from '../core/selection'   // add to the existing selection import

const goalId = computed(() => selectionGoalId(ember.goals, ember.tasks, ember.selection))
const res = computed(() => (goalId.value ? goalResources(ember.resources, goalId.value) : []))
```

In the template, after `<span class="fb-sub">…</span>`:

```vue
        <span v-if="res.length" class="fb-res">
          <Link2 :size="12" :stroke-width="2.5" aria-hidden="true" />
          <span class="fb-res-count">{{ plural(res.length, 'resource') }} ·</span>
          <a v-for="r in res.slice(0, 3)" :key="r.id" class="fb-res-link" :href="r.url" target="_blank" rel="noopener noreferrer">{{ r.title }}</a>
          <button v-if="res.length > 3" class="fb-res-more" :aria-label="`All ${res.length} resources`" @click="ui.openResources(goalId ?? 'all', 'using')">+{{ res.length - 3 }}</button>
        </span>
```

Styles (scoped):

```css
.fb-res { display: flex; flex-wrap: wrap; align-items: center; gap: 2px var(--space-3); min-width: 0; font-size: 12px; color: var(--fb-sub); }
.fb-res svg { flex: none; }
.fb-res-count { display: none; }
.fb-res-link { font-weight: 700; color: inherit; text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 28ch; }
.fb-res-link:hover { color: var(--color-accent); text-decoration: underline; }
.fb-res-more { padding: 0; border: 0; background: none; font-size: 12px; font-weight: 700; color: inherit; }
@media (max-width: 760px) {
  .fb-res { flex-wrap: nowrap; }
  .fb-res-count { display: inline; white-space: nowrap; }
  .fb-res-link ~ .fb-res-link, .fb-res-more { display: none; }
}
```

- [ ] **Step 4: Run** `npx vitest run src/components/FocusBar.test.ts`. Expect PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/FocusBar.vue src/components/FocusBar.test.ts
git commit -m "feat: focus bar links the selected goal's resources

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 12: Focus mode resources panel

**Files:**
- Modify: `src/components/FocusMode.vue`
- Test: `src/components/FocusMode.test.ts`

**Interfaces:**
- Consumes: `selectionGoalId`, `goalResources`, `TYPE_LABEL` (Task 4); `ui.fmResourcesOpen` (Task 6).
- Produces: a `.fm-res-btn` button in the bottom-left panel and a `#fm-resources` panel above it.

- [ ] **Step 1: Write failing tests** in `src/components/FocusMode.test.ts` (reuse the file's mount helper, which stubs the YouTube player; add `resources` and a step selection to its data):

```ts
describe('FocusMode — resources', () => {
  it('toggles a panel of the goal’s resources; Esc closes it before Focus mode', async () => {
    const { w, ui } = mountFocusMode({
      goals: [goalFixture('D3', [['M', [['S', null]]]])],
      selection: { kind: 'step', goalId: 'D3', msId: 'D3/M', stepId: 'D3/M/S' },
      resources: [resourceFixture('InfoVis', { goalId: 'D3', company: 'Coursera', notes: 'Week 3 of 5' })],
    })
    expect(w.find('#fm-resources').exists()).toBe(false)
    await w.find('.fm-res-btn').trigger('click')
    expect(w.find('.fm-res-btn').attributes('aria-expanded')).toBe('true')
    expect(w.find('.fm-res-head').text()).toBe('D3 · resources')
    expect(w.find('.fm-res-link').attributes()).toMatchObject({ href: 'https://example.com/InfoVis', target: '_blank' })
    expect(w.find('.fm-res-sub').text()).toBe('Coursera · Course · Week 3 of 5')
    expect(ui.escape()).toBe(true)
    await w.vm.$nextTick()
    expect(w.find('#fm-resources').exists()).toBe(false)
    expect(ui.focusModeOpen).toBe(true)
  })

  it('has no resources button when the goal has none', () => {
    const { w } = mountFocusMode({
      goals: [goalFixture('D3', [['M', [['S', null]]]])],
      selection: { kind: 'step', goalId: 'D3', msId: 'D3/M', stepId: 'D3/M/S' },
    })
    expect(w.find('.fm-res-btn').exists()).toBe(false)
  })
})
```

If `FocusMode.test.ts` has no helper that takes data, add one at the top of this describe that does the same as its existing setup (create the pinia, `replaceData(dataFixture(patch))`, set `ui.focusModeOpen = true`, mount with the same stubs) and returns `{ w, ember, ui }`.

- [ ] **Step 2: Run** `npx vitest run src/components/FocusMode.test.ts`. Expect failures.

- [ ] **Step 3: Implement** in `FocusMode.vue`:

Script additions (add `BookOpen, ExternalLink` to the lucide import):

```ts
import type { Resource } from '../core/model'
import { TYPE_LABEL, goalResources } from '../core/resources'
import { selectionGoalId } from '../core/selection'   // add to the existing selection import

const resGoal = computed(() => {
  const id = selectionGoalId(ember.goals, ember.tasks, ember.selection)
  return id ? ember.goals.find((g) => g.id === id) ?? null : null
})
const res = computed(() => (resGoal.value ? goalResources(ember.resources, resGoal.value.id) : []))
const resSub = (r: Resource) => [r.company, TYPE_LABEL[r.type], r.notes].filter(Boolean).join(' · ')
watch(() => res.value.length, (n) => { if (!n) ui.fmResourcesOpen = false })
```

Template: inside `.fm-bl`, as its first child, add the panel. `.fm-bl` is absolutely positioned, so it is the panel's containing block.

```vue
      <div v-if="ui.fmResourcesOpen && res.length" id="fm-resources" class="fm-panel fm-res" role="region" :aria-label="`${resGoal?.title} resources`">
        <span class="fm-res-head">{{ resGoal?.title }} · resources</span>
        <a v-for="r in res" :key="r.id" class="fm-res-link" :href="r.url" target="_blank" rel="noopener noreferrer">
          <span class="fm-res-text"><span class="fm-res-title">{{ r.title }}</span><span class="fm-res-sub">{{ resSub(r) }}</span></span>
          <ExternalLink :size="14" :stroke-width="2.5" aria-hidden="true" />
        </a>
      </div>
```

After the `.fm-item` button, at the end of `.fm-bl`:

```vue
      <button
        v-if="res.length"
        class="fm-icon fm-res-btn"
        :class="{ 'is-on': ui.fmResourcesOpen }"
        aria-label="Resources"
        title="Resources for this goal"
        aria-controls="fm-resources"
        :aria-expanded="ui.fmResourcesOpen"
        @click="ui.fmResourcesOpen = !ui.fmResourcesOpen"
      >
        <BookOpen :size="18" :stroke-width="2.25" />
      </button>
```

Styles (scoped, next to `.fm-bl`):

```css
.fm-res {
  position: absolute; left: 0; bottom: calc(100% + var(--space-2)); width: 100%;
  display: flex; flex-direction: column; padding: var(--space-2);
}
.fm-res-head { padding: 2px var(--space-2) 6px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; opacity: .8; }
.fm-res-link {
  display: grid; grid-template-columns: minmax(0, 1fr) 14px; gap: var(--space-2); align-items: center;
  padding: 6px var(--space-2); color: inherit; text-decoration: none;
}
.fm-res-link + .fm-res-link { border-top: 1px solid color-mix(in srgb, var(--fm-light) 20%, transparent); }
.fm-res-link:hover { background: color-mix(in srgb, var(--fm-light) 12%, transparent); }
.fm-res-text { display: flex; flex-direction: column; min-width: 0; }
.fm-res-title { font: 700 14px/1.3 var(--font-heading); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fm-res-sub { font-size: 12px; opacity: .8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fm-res-btn.is-on { background: color-mix(in srgb, var(--fm-light) 16%, transparent); }
```

The panel sits inside `.fm-bl`, which already has the `fm-chrome` class, so it hides with the other controls while idle.

- [ ] **Step 4: Run** `npx vitest run src/components/FocusMode.test.ts src/stores/ui.test.ts`. Expect PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/FocusMode.vue src/components/FocusMode.test.ts
git commit -m "feat: Focus mode opens the goal's resources without leaving the timer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 13: Renewals on Today and Upcoming

**Files:**
- Create: `src/components/today/RenewalCard.vue`
- Test: `src/components/today/RenewalCard.test.ts`
- Modify: `src/components/today/TodayList.vue`, `src/core/today.ts` (`upcomingGroups`), `src/components/today/UpcomingList.vue`
- Test: `src/core/today.test.ts`, `src/components/today/UpcomingList.test.ts`, `src/components/today/TodayList.test.ts`

**Interfaces:**
- Consumes: `dueRenewals`, `upcomingRenewals`, `DueRenewal`, `coveredBy`, `money`, `inDays`, `TYPE_LABEL` (Task 4); `ember.keepRenewal`, `ember.markCancelled` (Task 5); `weekdayLong` (core/dates).
- Produces: `RenewalCard.vue` with prop `{ due: DueRenewal }`. `UpcomingGroup` gains `renewals: DueRenewal[]`. `upcomingGroups(tasks: Task[], today: ISODate, renewals: DueRenewal[] = [])`.

- [ ] **Step 1: Write failing tests.**

`src/components/today/RenewalCard.test.ts`:

```ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dueRenewals } from '../../core/resources'
import { dataFixture, resourceFixture } from '../../core/test-fixtures'
import { useEmberStore } from '../../stores/ember'
import RenewalCard from './RenewalCard.vue'

const plus = resourceFixture('Coursera Plus', { company: 'Coursera', type: 'membership', billing: 'month', price: 49, renewsOn: '2026-10-15' })
const covered = ['InfoVis', 'Python', 'SQL'].map((t) => resourceFixture(t, { company: 'Coursera' }))

function setup(today: Date, resources = [plus, ...covered]) {
  vi.setSystemTime(today)
  setActivePinia(createPinia())
  const ember = useEmberStore()
  ember.replaceData(dataFixture({ resources }))
  const due = dueRenewals(ember.resources, ember.today)[0]
  return { w: mount(RenewalCard, { props: { due } }), ember }
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('RenewalCard', () => {
  it('names the day, the amount in red, and what the membership covers', () => {
    const { w } = setup(new Date(2026, 9, 12, 10))
    expect(w.find('.rc-title').text()).toBe('Coursera Plus renews Thursday')
    expect(w.find('.rc-amount').text()).toBe('£49 in 3 days')
    expect(w.find('.rc-amount').classes()).toContain('text-accent')
    expect(w.find('.rc-sub').text()).toBe('£49 in 3 days · Covers InfoVis, Python +1')
    expect(w.find('.rc-open').attributes()).toMatchObject({ href: plus.url, target: '_blank' })
    expect(w.find('.rc-open').text()).toBe('Open Coursera')
  })

  it('says today or tomorrow, and leaves out Covers for a plain subscription', () => {
    expect(setup(new Date(2026, 9, 15, 10)).w.find('.rc-title').text()).toBe('Coursera Plus renews today')
    const sub = { ...plus, type: 'tool' as const }
    const { w } = setup(new Date(2026, 9, 14, 10), [sub, ...covered])
    expect(w.find('.rc-title').text()).toBe('Coursera Plus renews tomorrow')
    expect(w.find('.rc-sub').text()).toBe('£49 tomorrow')
  })

  it('Keep it and I’ve cancelled it update the resource', async () => {
    const { w, ember } = setup(new Date(2026, 9, 12, 10))
    await w.find('.rc-keep').trigger('click')
    expect(ember.resources[0].keptFor).toBe('2026-10-15')
    await w.find('.rc-cancelled').trigger('click')
    expect(ember.resources[0].status).toBe('dropped')
  })
})
```

`src/components/today/TodayList.test.ts` (reuse its setup; add `resources` to the data):

```ts
  it('shows due renewals above the tasks, without counting them as tasks', () => {
    // today in this file is 2026-09-23
    const w = mountTodayList({ resources: [resourceFixture('Plus', { billing: 'month', price: 49, renewsOn: '2026-09-25' })] })
    expect(w.find('.tl-rows > .renewal-card').exists()).toBe(true)
    expect(w.find('.tl-summary').text()).toMatch(/of \d+ done/)
    expect(w.find('.tl-summary').text()).toBe(mountTodayList({}).find('.tl-summary').text())
  })
```

If the file's helper has another name, use it. If it doesn't accept data, add `resources` to the data object it builds.

`src/core/today.test.ts`:

```ts
describe('upcomingGroups with renewals', () => {
  it('puts a renewal under its date, creating the day group if no task has it, in date order', () => {
    const today = '2026-09-23'
    const tasks = [taskFixture('Fri', { date: '2026-09-25' }), taskFixture('Later', { date: '2026-10-20' })]
    const plus = resourceFixture('Plus', { billing: 'month', price: 49, renewsOn: '2026-09-24' })
    const groups = upcomingGroups(tasks, today, [{ resource: plus, date: '2026-09-24', days: 1 }])
    expect(groups.map((g) => [g.key, g.items.length, g.renewals.length])).toEqual([
      ['2026-09-24', 0, 1], ['2026-09-25', 1, 0], ['later', 1, 0],
    ])
    expect(groups[0].label).toBe('Tomorrow')
  })
})
```

`src/components/today/UpcomingList.test.ts`:

```ts
  it('shows a renewal as a row that cannot be ticked', () => {
    const w = mountUpcoming({ resources: [resourceFixture('Plus', { type: 'membership', billing: 'month', price: 49, renewsOn: '2026-09-25' })] })
    const row = w.find('.up-renewal')
    expect(row.find('.up-ren-title').text()).toBe('Plus renews')
    expect(row.find('.up-ren-meta').text()).toBe('£49 · Membership')
    expect(row.find('.check').exists()).toBe(false)
  })
```

(Again, use the file's own mount helper.)

- [ ] **Step 2: Run** `npx vitest run src/components/today/ src/core/today.test.ts`. Expect failures.

- [ ] **Step 3: Implement.**

`src/core/today.ts`: import `type DueRenewal` from `./resources`.

```ts
export interface UpcomingGroup { key: string; label: string; right: string; collapsible: boolean; items: UpcomingItem[]; renewals: DueRenewal[] }

export function upcomingGroups(tasks: Task[], today: ISODate, renewals: DueRenewal[] = []): UpcomingGroup[] {
  const tomorrow = addDays(today, 1)
  const horizon = addDays(today, 6)
  const live = tasks.filter(isLive)
  const dayGroup = (date: ISODate): UpcomingGroup => ({
    key: date, label: date === tomorrow ? 'Tomorrow' : weekdayLong(date), right: dayLabel(date), collapsible: false, items: [], renewals: [],
  })
  const days = new Map<ISODate, UpcomingGroup>()
  const later: UpcomingGroup = { key: 'later', label: 'Later', right: '', collapsible: true, items: [], renewals: [] }
  const future = live.filter((t) => t.date != null && t.date > today && visibleToday(t, today)).sort(byDate)
  for (const t of future) {
    const date = t.date!
    if (date > horizon) {
      later.items.push({ task: t, showDate: true })
      continue
    }
    if (!days.has(date)) days.set(date, dayGroup(date))
    days.get(date)!.items.push({ task: t, showDate: false })
  }
  for (const r of renewals) {
    if (r.date <= today || r.date > horizon) continue
    if (!days.has(r.date)) days.set(r.date, dayGroup(r.date))
    days.get(r.date)!.renewals.push(r)
  }
  const groups = [...days.values()].sort((a, b) => a.key.localeCompare(b.key))
  if (later.items.length) groups.push(later)
  const someday = live.filter((t) => t.date == null && visibleToday(t, today))
  if (someday.length) {
    groups.push({ key: 'someday', label: 'Someday', right: '', collapsible: true, items: someday.map((task) => ({ task, showDate: false })), renewals: [] })
  }
  for (const g of groups) if (g.collapsible) g.right = plural(g.items.length, 'task')
  return groups
}
```

Run the existing `upcomingGroups` tests at this point. The rewrite must keep their results identical: the same groups in the same order, with `renewals: []` added. If an existing test uses `toEqual` on whole groups, add `renewals: []` to its expected objects.

`src/components/today/UpcomingList.vue`:

```ts
import { RefreshCw } from 'lucide-vue-next'   // add to the lucide import
import { TYPE_LABEL, money, upcomingRenewals } from '../../core/resources'
const groups = computed(() => upcomingGroups(ember.tasks, ember.today, upcomingRenewals(ember.resources, ember.today)))
```

In the template, inside `<template v-if="isOpen(g)">` and before the `TaskRow` loop:

```vue
          <div v-for="r in g.renewals" :key="`ren-${r.resource.id}`" class="up-renewal">
            <RefreshCw :size="14" :stroke-width="2.5" aria-hidden="true" />
            <span class="up-ren-body">
              <span class="up-ren-title">{{ r.resource.title }} renews</span>
              <span class="up-ren-meta">{{ money(r.resource.price ?? 0) }} · {{ TYPE_LABEL[r.resource.type] }}</span>
            </span>
          </div>
```

Styles:

```css
.up-renewal {
  display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: var(--space-3); align-items: center;
  padding: 6px var(--space-2); border-bottom: 1px solid var(--color-divider); color: var(--color-neutral-700);
}
.up-ren-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.up-ren-title { font-size: 14px; color: var(--color-text); }
.up-ren-meta { font-size: 11px; }
```

`src/components/today/RenewalCard.vue`:

```vue
<script setup lang="ts">
import { RefreshCw } from 'lucide-vue-next'
import { computed } from 'vue'
import { weekdayLong } from '../../core/dates'
import { coveredBy, inDays, money, type DueRenewal } from '../../core/resources'
import { useEmberStore } from '../../stores/ember'

const props = defineProps<{ due: DueRenewal }>()
const ember = useEmberStore()
const r = computed(() => props.due.resource)
const when = computed(() => (props.due.days === 0 ? 'today' : props.due.days === 1 ? 'tomorrow' : weekdayLong(props.due.date)))
const amount = computed(() => `${money(r.value.price ?? 0)} ${inDays(props.due.days)}`)
const covers = computed(() => {
  const titles = coveredBy(r.value, ember.resources).map((x) => x.title)
  if (!titles.length) return ''
  return `Covers ${titles.slice(0, 2).join(', ')}${titles.length > 2 ? ` +${titles.length - 2}` : ''}`
})
</script>

<template>
  <div class="renewal-card" role="group" :aria-label="`${r.title} renews ${when}`">
    <RefreshCw class="rc-icon" :size="18" :stroke-width="2.25" aria-hidden="true" />
    <div class="rc-body">
      <div class="rc-text">
        <span class="rc-title">{{ r.title }} renews {{ when }}</span>
        <span class="rc-sub"><b class="rc-amount text-accent">{{ amount }}</b><template v-if="covers"> · {{ covers }}</template></span>
      </div>
      <div class="rc-actions">
        <button class="btn btn-secondary rc-keep" @click="ember.keepRenewal(r.id)">Keep it</button>
        <button class="btn btn-secondary rc-cancelled" @click="ember.markCancelled(r.id)">I’ve cancelled it</button>
        <a class="btn btn-ghost rc-open" :href="r.url" target="_blank" rel="noopener noreferrer">Open {{ r.company }}</a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.renewal-card {
  display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: var(--space-2) var(--space-3); align-items: start;
  margin: var(--space-2) 0; padding: var(--space-3) var(--space-2);
  background: var(--color-surface); border: 2px solid var(--color-text);
}
.rc-icon { color: var(--color-accent-700); margin-top: 2px; }
.rc-body { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
.rc-text { display: flex; flex-direction: column; gap: 2px; }
.rc-title { font-size: 14px; font-weight: 700; }
.rc-sub { font-size: 12px; color: var(--color-neutral-700); }
.rc-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.rc-actions .btn { font-size: 13px; padding-block: 6px; }
</style>
```

`src/components/today/TodayList.vue`: import `RenewalCard` and `dueRenewals`:

```ts
const renewals = computed(() => dueRenewals(ember.resources, ember.today))
```

Inside `.tl-rows`, as the first child:

```vue
      <RenewalCard v-for="d in renewals" :key="`ren-${d.resource.id}`" :due="d" />
```

- [ ] **Step 4: Run** `npx vitest run src/components/today/ src/core/today.test.ts`. Expect PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/today.ts src/core/today.test.ts src/components/today
git commit -m "feat: renewal reminders on Today and renewal rows in Upcoming

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 14: Whole-app check and docs

**Files:**
- Modify: `CLAUDE.md`
- Modify: design canvas copy (Main and Phone boards: "memberships" → "subscriptions")

- [ ] **Step 1: Run everything.** Run `npm test`, `npm run typecheck` and `npm run build`. All must pass. Fix any failure in the task that owns the code before continuing.

- [ ] **Step 2: Update `CLAUDE.md`.** In the Architecture section, change the persisted slice line to:

```markdown
- `src/stores/ember.ts` — the single Pinia store. Persisted slice (goals, tasks, logs, resources, selection, timer, settings) → localStorage `ember:v1`.
```

and add after the Sync line:

```markdown
- Resources: `src/core/companies.ts` (link → company/type/title, duplicates) and `src/core/resources.ts` (repair, costs, renewals, list views). Only http(s) links are stored; repair drops anything else.
```

- [ ] **Step 3: Browser check.** Start the dev server (`npm run dev`, port 5199) with `?demo=1` cleared and fresh storage, then check:
  - The Resources tab at 1280px and 390px wide shows the ledger, the money line ("£65.25 a month on 3 subscriptions · Coursera Plus renews in 3 days") and working filters.
  - Pasting `https://huggingface.co/learn/llm-course` saves it at once, and pasting it again shows "Already saved".
  - The ⋯ menu's Edit panel saves a monthly cost, and Delete shows the undo bar.
  - Today shows the Coursera Plus renewal card. **Keep it** hides it. Upcoming lists Premium only when it is within 6 days.
  - With the D3 step selected, the focus bar shows its resource links, and Focus mode's book button opens the panel. Esc closes the panel, then Focus mode.
  - The Learn D3.js goal page shows the Using strip joined to the Readme, and **+** adds a resource linked to the goal.

  Fix anything that looks wrong and commit the fix with the task it belongs to.

- [ ] **Step 4: Update the design canvas copy.** On https://claude.ai/artifact/KXSEhDtbZ5AyUE8kZDDymS, change "on 3 memberships" to "on 3 subscriptions" in `project/Main.dc.html` and `project/Phone.dc.html`. Read each file from the artifact first, because it may have been edited in the browser since.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: resources in the architecture notes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
