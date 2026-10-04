<script setup lang="ts">
import TodayList from './TodayList.vue'
import UpcomingList from './UpcomingList.vue'
import WorkingOn from './WorkingOn.vue'
</script>

<template>
  <main class="view today-view">
    <WorkingOn />
    <div class="tv-columns">
      <TodayList />
      <UpcomingList />
    </div>
  </main>
</template>

<style scoped>
.today-view { gap: var(--space-8); }
.tv-columns {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr));
  gap: var(--space-8); align-items: start;
}
</style>
