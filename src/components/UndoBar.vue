<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { useEmberStore } from '../stores/ember'
import { useUiStore } from '../stores/ui'

const ember = useEmberStore()
const ui = useUiStore()

function undo() {
  if (ui.undo) ember.undoDelete(ui.undo.record)
  ui.dismissUndo()
}
</script>

<template>
  <div role="status" aria-live="polite" class="undo-region">
    <div v-if="ui.undo" class="undo-bar">
      <span class="ub-text">{{ ui.undo.record.label }}</span>
      <button class="btn btn-ghost ub-undo" @click="undo">Undo</button>
      <button class="icon-btn ub-close" aria-label="Dismiss" @click="ui.dismissUndo()"><X :size="16" :stroke-width="2.25" /></button>
    </div>
  </div>
</template>

<style scoped>
.undo-region { position: fixed; left: var(--space-6); bottom: var(--space-6); z-index: 90; max-width: calc(100% - 2 * var(--space-6)); }
.undo-bar {
  display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
  background: var(--color-text); color: var(--color-bg); font-size: 14px;
}
.ub-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ub-undo { color: var(--color-accent-400); }
.ub-close { color: inherit; }
.ub-close:hover { background: color-mix(in srgb, var(--color-bg) 15%, transparent); }
@media (max-width: 520px) {
  .undo-region { left: var(--space-4); right: var(--space-4); bottom: var(--space-4); max-width: none; }
}
</style>
