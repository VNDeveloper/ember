<script setup lang="ts">
import ActivityLog from './ActivityLog.vue'
import DoneWall from './DoneWall.vue'
import HeatMap from './HeatMap.vue'
</script>

<template>
  <main class="view activity-view">
    <HeatMap />
    <div class="av-columns">
      <DoneWall />
      <ActivityLog />
    </div>
  </main>
</template>

<style scoped>
.activity-view { gap: var(--space-8); }
.av-columns {
  display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(280px, 1fr); gap: var(--space-8); align-items: start;
  padding-top: var(--space-6); border-top: 2px solid var(--color-divider);
}
@media (max-width: 860px) { .av-columns { grid-template-columns: minmax(0, 1fr); } }
</style>
