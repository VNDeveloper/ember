<script setup lang="ts">
import { RefreshCw } from 'lucide-vue-next'
import { computed } from 'vue'
import { weekdayLong } from '../../core/dates'
import { coveredBy, inDays, money, type DueRenewal } from '../../core/resources'
import { useEmberStore } from '../../stores/ember'

const props = defineProps<{ due: DueRenewal }>()
const ember = useEmberStore()
const r = computed(() => props.due.resource)
const when = computed(() => (props.due.days === 0 ? 'today' : props.due.days === 1 ? 'tomorrow' : weekdayLong(props.due.date)))
const amount = computed(() => `${money(r.value.price ?? 0)} ${inDays(props.due.days)}`)
const covers = computed(() => {
  const titles = coveredBy(r.value, ember.resources).map((x) => x.title)
  if (!titles.length) return ''
  return `Covers ${titles.slice(0, 2).join(', ')}${titles.length > 2 ? ` +${titles.length - 2}` : ''}`
})
</script>

<template>
  <div class="renewal-card" role="group" :aria-label="`${r.title} renews ${when}`">
    <RefreshCw class="rc-icon" :size="18" :stroke-width="2.25" aria-hidden="true" />
    <div class="rc-body">
      <div class="rc-text">
        <span class="rc-title">{{ r.title }} renews {{ when }}</span>
        <span class="rc-sub"><b class="rc-amount text-accent">{{ amount }}</b><template v-if="covers"> · {{ covers }}</template></span>
      </div>
      <div class="rc-actions">
        <button class="btn btn-secondary rc-keep" @click="ember.keepRenewal(r.id)">Keep it</button>
        <button class="btn btn-secondary rc-cancelled" @click="ember.markCancelled(r.id)">I’ve cancelled it</button>
        <a class="btn btn-ghost rc-open" :href="r.url" target="_blank" rel="noopener noreferrer">Open {{ r.company }}</a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.renewal-card {
  display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: var(--space-2) var(--space-3); align-items: start;
  margin: var(--space-2) 0; padding: var(--space-3) var(--space-2);
  background: var(--color-surface); border: 2px solid var(--color-text);
}
.rc-icon { color: var(--color-neutral-700); margin-top: 2px; }
.rc-body { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
.rc-text { display: flex; flex-direction: column; gap: 2px; }
.rc-title { font-size: 14px; font-weight: 700; }
.rc-sub { font-size: 12px; color: var(--color-neutral-700); }
.rc-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.rc-actions .btn { font-size: 13px; padding-block: 6px; }
</style>
