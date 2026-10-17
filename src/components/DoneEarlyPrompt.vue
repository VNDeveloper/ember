<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { useEmberStore } from '../stores/ember'
import { useUiStore } from '../stores/ui'

/** Asked when the selected item is finished mid-session: its minutes are already logged. */
const ember = useEmberStore()
const ui = useUiStore()

function pick() {
  ember.dismissDoneEarly()
  ui.openPicker(ember.selection)
}
</script>

<template>
  <div v-if="ember.doneEarly" class="done-early" role="group" aria-label="Finished early">
    <p class="de-text"><b>{{ ember.doneEarly.title }}</b> done, with time to spare. What next?</p>
    <div class="de-actions">
      <button v-if="ember.doneEarly.next" class="btn btn-primary de-keep" @click="ember.dismissDoneEarly()">Keep going on {{ ember.doneEarly.nextTitle }}</button>
      <button class="btn btn-secondary btn-outline-current de-pick" @click="pick">Pick something else</button>
      <button class="btn btn-secondary btn-outline-current de-break" @click="ember.takeBreakNow()">Take a break now</button>
    </div>
    <button class="icon-btn de-dismiss" aria-label="Dismiss" title="Not now" @click="ember.dismissDoneEarly()"><X :size="16" :stroke-width="2.25" /></button>
  </div>
</template>

<style scoped>
.done-early {
  position: relative; display: flex; flex-direction: column; gap: var(--space-2);
  padding: var(--space-3) calc(var(--space-3) + 32px) var(--space-3) var(--space-3);
}
.de-text { font-size: 14px; }
.de-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.de-actions .btn { font-size: 13px; padding-block: 6px; }
.de-dismiss { position: absolute; top: var(--space-2); right: var(--space-2); color: inherit; }
.de-dismiss:hover { background: color-mix(in srgb, currentColor 14%, transparent); }
</style>
