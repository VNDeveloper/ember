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
