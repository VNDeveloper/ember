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
