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
