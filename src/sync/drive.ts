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
