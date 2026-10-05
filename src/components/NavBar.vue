<script setup lang="ts">
import { navDate } from '../core/dates'
import { useEmberStore } from '../stores/ember'
import { useUiStore, type View } from '../stores/ui'
import DataMenu from './DataMenu.vue'
import SettingsMenu from './SettingsMenu.vue'

const ember = useEmberStore()
const ui = useUiStore()
const TABS: [View, string][] = [['today', 'Today'], ['goals', 'Goals'], ['activity', 'Activity']]
</script>

<template>
  <nav class="nav">
    <span class="nav-brand">Ember</span>
    <div class="tabs">
      <button
        v-for="[v, label] in TABS"
        :key="v"
        class="tab"
        :class="{ 'is-active': ui.view === v }"
        :aria-current="ui.view === v ? 'page' : undefined"
        @click="ui.view = v"
      >
        {{ label }}
      </button>
    </div>
    <DataMenu />
    <SettingsMenu />
    <span class="nav-date">{{ navDate(ember.today) }}</span>
  </nav>
</template>

<style scoped>
.nav { position: relative; flex-wrap: wrap; row-gap: var(--space-2); }
.nav-brand { margin-right: var(--space-2); }
.tabs { display: flex; gap: var(--space-6); margin-right: auto; }
.tab {
  padding: 4px 0; border: 0; border-bottom: 2px solid transparent; background: none;
  font-size: 14px; font-weight: 700; color: var(--color-text);
}
.tab:hover, .tab.is-active { color: var(--color-accent); }
.tab.is-active { border-bottom-color: var(--color-accent); }
.nav-date { font-size: 13px; }
@media (max-width: 520px) {
  .nav { padding: var(--space-3) var(--space-4); column-gap: var(--space-4); }
  .tabs { gap: var(--space-4); }
}
</style>
