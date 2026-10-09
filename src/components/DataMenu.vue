<script setup lang="ts">
import { ChevronDown, Download, Upload } from 'lucide-vue-next'
import { onBeforeUnmount, ref, watch } from 'vue'
import { backupFileName, lastBackup, makeBackup, readBackup, rememberBackup } from '../core/backup'
import { dayLabel, todayISO } from '../core/dates'
import { plural } from '../core/format'
import type { EmberData } from '../core/model'
import { useEmberStore } from '../stores/ember'
import { useSyncStore } from '../stores/sync'
import { useUiStore } from '../stores/ui'
import SyncBlock from './SyncBlock.vue'

const ember = useEmberStore()
const ui = useUiStore()
const sync = useSyncStore()

const root = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const last = ref(lastBackup())
const error = ref('')
const pending = ref<{ data: EmberData; from: string; summary: string } | null>(null)
/** The "Delete data…" confirmation is showing. */
const deleting = ref(false)

function backUp() {
  const blob = new Blob([makeBackup(ember.snapshot(), Date.now())], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = backupFileName(ember.today)
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  rememberBackup(ember.today)
  last.value = ember.today
}

const summarize = (d: EmberData) =>
  `${plural(d.goals.length, 'goal')} · ${plural(d.tasks.length, 'task')} · ${plural(d.logs.length, 'focus session')}`

async function onFile() {
  const input = fileInput.value
  const file = input?.files?.[0]
  if (!input || !file) return
  const result = readBackup(await file.text())
  input.value = ''
  if (!result.ok) {
    error.value = "That file isn't an Ember backup."
    pending.value = null
    return
  }
  error.value = ''
  pending.value = {
    data: result.data,
    from: result.exportedAt ? dayLabel(todayISO(Date.parse(result.exportedAt))) : 'an unknown date',
    summary: summarize(result.data),
  }
}

/** Delete data: here only (and stop syncing), or everywhere (a new, empty generation in Drive). */
function erase(where: 'local' | 'here' | 'everywhere') {
  if (where === 'local') ember.eraseAll()
  else if (where === 'here') void sync.eraseHere()
  else void sync.eraseEverywhere()
  deleting.value = false
  ui.dataMenuOpen = false
}

function replace() {
  if (!pending.value) return
  ember.restore(pending.value.data)
  if (sync.connected) void sync.afterRestore()
  pending.value = null
  ui.dataMenuOpen = false
}

function toggle() {
  ui.dataMenuOpen = !ui.dataMenuOpen
}

/** Clicking anywhere outside closes the panel. */
function onPointerDown(e: PointerEvent | MouseEvent) {
  if (root.value && e.target instanceof Node && !root.value.contains(e.target)) ui.dataMenuOpen = false
}
watch(() => ui.dataMenuOpen, (open) => {
  if (open) document.addEventListener('pointerdown', onPointerDown)
  else {
    document.removeEventListener('pointerdown', onPointerDown)
    if (sync.status === 'choose') void sync.cancelChoice()
    pending.value = null
    deleting.value = false
    error.value = ''
  }
})
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown))
</script>

<template>
  <div ref="root" class="data-menu">
    <button
      class="dm-toggle"
      :aria-expanded="ui.dataMenuOpen"
      aria-controls="ember-data-panel"
      :aria-label="sync.needsAttention ? 'Data, sync needs attention' : undefined"
      @click="toggle"
    >
      Data<span v-if="sync.needsAttention" class="dm-attn" aria-hidden="true"></span><ChevronDown :size="14" :stroke-width="2.5" :class="{ 'is-open': ui.dataMenuOpen }" />
    </button>
    <div v-if="ui.dataMenuOpen" id="ember-data-panel" class="dm-panel" role="region" aria-label="Your data">
      <SyncBlock v-if="sync.configured" />
      <span class="section-label">Your data</span>
      <p class="dm-note">Everything is stored in this browser. Keep a backup file somewhere safe.</p>
      <template v-if="!pending && !deleting">
        <button class="btn btn-secondary dm-backup" @click="backUp"><Download :size="16" :stroke-width="2.25" />Back up</button>
        <button class="btn btn-secondary dm-restore" @click="fileInput?.click()"><Upload :size="16" :stroke-width="2.25" />Restore from file…</button>
        <input ref="fileInput" class="dm-file" type="file" accept="application/json,.json" hidden @change="onFile" />
        <p v-if="error" class="dm-error" role="alert">{{ error }}</p>
        <p class="dm-last">Last backup: {{ last ? dayLabel(last) : 'Never' }}</p>
        <button class="btn btn-ghost dm-delete" @click="deleting = true">Delete data…</button>
      </template>
      <div v-else-if="deleting" class="dm-confirm dm-delete-confirm">
        <p>Delete all tasks, goals and focus history? Your settings stay. Back up first if you might want them back.</p>
        <button class="btn btn-secondary dm-backup" @click="backUp"><Download :size="16" :stroke-width="2.25" />Back up</button>
        <div class="dm-actions">
          <template v-if="sync.connected">
            <button class="btn btn-primary dm-erase-all" @click="erase('everywhere')">Delete everywhere</button>
            <button class="btn btn-secondary dm-erase-here" @click="erase('here')">Delete on this device only</button>
          </template>
          <button v-else class="btn btn-primary dm-erase" @click="erase('local')">Delete</button>
          <button class="btn btn-ghost dm-cancel-delete" @click="deleting = false">Cancel</button>
        </div>
        <p v-if="sync.connected" class="dm-note">Everywhere clears your other devices on their next sync. This device only also stops syncing here.</p>
      </div>
      <div v-else-if="pending" class="dm-confirm">
        <p>Replace everything with the backup from {{ pending.from }}? ({{ pending.summary }}) This can't be undone.<template v-if="sync.connected"> This also replaces the data on your other devices.</template></p>
        <div class="dm-actions">
          <button class="btn btn-primary dm-replace" @click="replace">Replace</button>
          <button class="btn btn-ghost dm-cancel" @click="pending = null">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.data-menu { position: relative; }
.dm-toggle {
  display: inline-flex; align-items: center; gap: 4px; padding: 4px 0;
  border: 0; border-bottom: 2px solid transparent; background: none;
  font-size: 13px; font-weight: 700; color: var(--color-text);
}
.dm-toggle:hover, .dm-toggle[aria-expanded='true'] { color: var(--color-accent); }
.dm-toggle svg { transition: transform .15s; }
.dm-attn { width: 8px; height: 8px; background: var(--color-accent); }
.dm-toggle svg.is-open { transform: rotate(180deg); }
.dm-panel {
  position: absolute; top: calc(100% + var(--space-2)); right: 0; z-index: 50;
  width: min(300px, calc(100vw - 2 * var(--space-4)));
  display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-4);
  background: var(--color-surface); border: 2px solid var(--color-text);
}
.dm-note, .dm-last { font-size: 12px; color: var(--color-neutral-700); }
.dm-error { font-size: 13px; font-weight: 700; color: var(--color-accent-700); }
.dm-confirm { display: flex; flex-direction: column; gap: var(--space-3); font-size: 14px; }
.dm-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.dm-delete { align-self: flex-start; }
.dm-delete-confirm .dm-backup { align-self: flex-start; }
/* On phones the toggle can wrap to the nav's second row: hang the panel from the nav, inside the gutters. */
@media (max-width: 520px) {
  .data-menu { position: static; }
  .dm-panel { top: calc(100% + 2px); left: var(--space-4); right: var(--space-4); width: auto; }
}
</style>
