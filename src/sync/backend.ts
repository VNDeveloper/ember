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
