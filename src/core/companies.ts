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

/** An http(s) link in one canonical form (lower-case host, no www, utm_* or trailing slash; the #part is kept), or null. */
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
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  const path = u.pathname.replace(/\/+$/, '')
  // The query as written (so "?flag" stays "?flag"), minus tracking parameters.
  const query = u.search.slice(1).split('&').filter((p) => p && !p.split('=')[0].toLowerCase().startsWith('utm_')).join('&')
  // Kept: apps that route by #/page need it to open the right page.
  const hash = u.hash.length > 1 ? u.hash : ''
  return `${u.protocol}//${host}${u.port ? `:${u.port}` : ''}${path}${query ? `?${query}` : ''}${hash}`
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

/** What makes two links "the same": the video id for YouTube, else the normalised link without its #part. */
export function linkKey(url: string): string {
  const site = siteFor(hostOf(url))
  const id = site?.company === 'YouTube' ? ytId(url) : null
  return id ? `yt:${id}` : (normaliseUrl(url) ?? url).replace(/#.*$/, '')
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
