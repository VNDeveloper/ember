import type { SyncBackend } from './backend'

export function createDriveBackend(clientId: string): SyncBackend {
  throw new Error(`Drive backend not built yet (${clientId})`)
}
