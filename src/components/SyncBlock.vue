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
