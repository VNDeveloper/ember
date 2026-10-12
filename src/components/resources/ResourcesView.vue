<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue'
import { libraryKicker, liveResources, moneyLine } from '../../core/resources'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import ResourceAdd from './ResourceAdd.vue'
import ResourceFilters from './ResourceFilters.vue'
import ResourceList from './ResourceList.vue'

const ember = useEmberStore()
const ui = useUiStore()

const any = computed(() => liveResources(ember.resources).length > 0)
const kicker = computed(() => (any.value ? libraryKicker(ember.resources) : 'Library'))
const money = computed(() => moneyLine(ember.resources, ember.today))
/** Adding while one goal is filtered links the new resource to it. */
const filterGoal = computed(() => (ui.resourceGoal !== 'all' && ui.resourceGoal !== 'none' ? ui.resourceGoal : null))
onBeforeUnmount(() => { ui.highlight = null })
</script>

<template>
  <main class="view resources-view">
    <div class="rv-col">
      <header class="rv-head">
        <span class="kicker">{{ kicker }}</span>
        <h2>Resources</h2>
        <p v-if="money" class="rv-money">
          <b class="tabular">{{ money.total }}</b> {{ money.count }}<template v-if="money.renewal"> · <b class="rv-renewal" :class="{ 'text-accent': money.renewal.soon, 'is-quiet': !money.renewal.soon }">{{ money.renewal.text }}</b></template>
        </p>
      </header>
      <p v-if="!any" class="rv-pitch">Keep the courses, videos, docs and models you learn from in one place, next to the goals they’re for.</p>
      <!-- One add box for both states, so the just-added card survives the first resource leaving the empty state. -->
      <ResourceAdd :goal-id="filterGoal" :large="!any" />
      <template v-if="any">
        <ResourceFilters />
        <ResourceList />
      </template>
      <template v-if="!any">
        <ol class="rv-how">
          <li>Ember fills in the company and the type from the link: Hugging Face, YouTube, Coursera, Udemy, GitHub, Kaggle and more.</li>
          <li>Link it to a goal, and it’s one click away whenever you focus on that goal.</li>
          <li>Add what a membership costs, and Today tells you before it renews.</li>
        </ol>
      </template>
    </div>
  </main>
</template>

<style scoped>
.rv-col { width: 100%; max-width: 1040px; display: flex; flex-direction: column; gap: var(--space-6); }
.rv-head { display: flex; flex-direction: column; gap: 6px; }
.rv-money { font-size: 14px; }
.rv-renewal.is-quiet { font-weight: 400; color: var(--color-neutral-700); }
.rv-pitch { max-width: 640px; font: 600 18px/1.45 var(--font-body); }
.rv-how { max-width: 640px; margin: 0; padding: 0; list-style: none; counter-reset: how; border-top: 2px solid var(--color-divider); }
.rv-how li {
  counter-increment: how; display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: var(--space-3);
  padding: var(--space-3) 0; border-bottom: 1px solid var(--color-divider); font-size: 14px;
}
.rv-how li::before { content: counter(how); font-weight: 800; }
</style>
