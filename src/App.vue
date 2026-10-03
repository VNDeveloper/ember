<script setup lang="ts">
import { navDate } from './core/dates'
import StyleSample from './dev/StyleSample.vue'
import { useEmberStore } from './stores/ember'

const store = useEmberStore()
</script>

<template>
  <StyleSample />
  <p class="store-line label">
    {{ navDate(store.today) }} · {{ store.goals.length }} goals · {{ store.tasks.length }} tasks ·
    {{ store.logs.length }} focus sessions · {{ store.tally.sessionsToday }} today · demo {{ store.demo ? 'on' : 'off' }}
  </p>
</template>

<style scoped>
.store-line { padding: 0 var(--space-6) var(--space-6); }
</style>
