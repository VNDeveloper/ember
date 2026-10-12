<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { STATUS_LABEL, TYPE_LABEL, type ResourceRowView } from '../../core/resources'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import RowMenu from '../RowMenu.vue'

const props = defineProps<{ row: ResourceRowView; showStatus: boolean }>()
const ember = useEmberStore()
const ui = useUiStore()
const root = ref<HTMLElement | null>(null)
const r = computed(() => props.row.resource)
const key = computed(() => `resource:${r.value.id}`)
const highlighted = computed(() => ui.highlight === r.value.id)

watch(highlighted, (on) => { if (on) root.value?.scrollIntoView?.({ block: 'center' }) }, { flush: 'post', immediate: true })

function onDelete() {
  ui.editing = null
  ui.showUndo(ember.deleteResource(r.value.id))
}
</script>

<template>
  <div ref="root" class="rr" :class="{ 'is-highlight': highlighted }">
    <div class="rr-row">
      <div class="rr-body">
        <a class="rr-title" :href="r.url" target="_blank" rel="noopener noreferrer">{{ r.title }}</a>
        <span class="rr-meta">
          <span class="tag tag-neutral rr-type">{{ TYPE_LABEL[r.type] }}</span>
          <span v-if="row.goal" class="rr-goal"><span class="swatch swatch-sm" :style="{ background: row.goal.color }"></span>{{ row.goal.title }}</span>
          <span v-if="showStatus" class="rr-status">{{ STATUS_LABEL[r.status] }}</span>
          <span v-if="r.notes" class="rr-notes">{{ r.notes }}</span>
        </span>
      </div>
      <div class="rr-cost">
        <span class="rr-price tabular" :class="{ 'is-paid': row.paid }">{{ row.price }}</span>
        <span v-if="row.renewal" class="rr-renew" :class="{ 'is-soon': row.renewal.soon }">{{ row.renewal.text }}</span>
      </div>
      <RowMenu :menu-key="key" :label="r.title" @delete="onDelete" />
    </div>
  </div>
</template>

<style scoped>
.rr + .rr { border-top: 1px solid var(--color-divider); }
.rr.is-highlight { background: var(--color-accent-100); }
.rr-row { display: grid; grid-template-columns: minmax(0, 1fr) auto 28px; gap: 4px var(--space-4); align-items: center; padding: var(--space-2) 0 var(--space-2) var(--space-2); }
.rr-body { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.rr-title { font-size: 14px; font-weight: 600; color: var(--color-text); text-decoration: none; overflow-wrap: anywhere; }
.rr-title:hover { color: var(--color-accent-700); text-decoration: underline; }
.rr-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 10px; font-size: 11px; color: var(--color-neutral-700); }
.rr-type { padding: 1px 8px; }
.rr-goal { display: inline-flex; align-items: center; gap: 5px; }
.rr-status { font-weight: 700; }
.rr-cost { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; text-align: right; }
.rr-price { font-size: 13px; color: var(--color-neutral-700); }
.rr-price.is-paid { font-weight: 700; color: var(--color-text); }
.rr-renew { font-size: 11px; color: var(--color-neutral-700); }
.rr-renew.is-soon { font-weight: 700; color: var(--color-accent-700); }
@media (max-width: 520px) {
  .rr-row { grid-template-columns: minmax(0, 1fr) 44px; }
  .rr-cost { grid-column: 1; grid-row: 2; flex-direction: row; flex-wrap: wrap; gap: 2px 10px; align-items: baseline; }
}
</style>
