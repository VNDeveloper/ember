<script setup lang="ts">
import { Check, Flag, Play, Plus, Scan, Timer } from 'lucide-vue-next'
import { ref } from 'vue'

const WHEN = [['today', 'Today'], ['tomorrow', 'Tomorrow'], ['date', 'Pick date'], ['someday', 'Someday']] as const
const when = ref('today')
const done = ref(false)
</script>

<template>
  <nav class="nav">
    <span class="nav-brand">Ember</span>
    <span class="sample-date">Wed 23 Sep 2026</span>
  </nav>
  <main class="sample">
    <section>
      <span class="kicker">Kicker · type scale</span>
      <h2>Learn D3.js</h2>
      <h3>14 things finished</h3>
      <h4>Today</h4>
      <p>Body copy at 15px/1.55 in Archivo. <span class="text-accent">Paragraph-size accent text uses accent-700.</span></p>
    </section>

    <section class="rule-2">
      <span class="label">Buttons</span>
      <div class="row">
        <button class="btn btn-primary"><Play :size="16" />Start focus</button>
        <button class="btn btn-primary" style="min-width: 160px">Wide, flush left</button>
        <button class="btn btn-secondary"><Plus :size="16" :stroke-width="2.5" />Add milestone</button>
        <button class="btn btn-ghost">Show all 7</button>
        <button class="btn btn-secondary btn-icon" aria-label="Focus mode"><Scan :size="16" /></button>
        <button class="btn btn-primary" disabled>Disabled</button>
      </div>
    </section>

    <section class="rule-2">
      <span class="label">Inputs, segmented control, tags</span>
      <div class="row">
        <input class="input" placeholder="Add a task…" style="max-width: 280px" />
        <div class="seg">
          <label v-for="[value, text] in WHEN" :key="value" class="seg-opt">
            <input v-model="when" type="radio" name="sample-when" :value="value" />{{ text }}
          </label>
        </div>
        <span class="tag tag-accent">You are here</span>
        <span class="tag tag-neutral">Inbox</span>
      </div>
    </section>

    <section class="rule-2">
      <span class="label">List rows</span>
      <div class="list">
        <div class="sample-row">
          <button class="check" :class="{ 'is-done': done }" aria-label="Toggle task" @click="done = !done">
            <Check v-if="done" :size="14" :stroke-width="3.5" />
          </button>
          <span>Review pull request #482</span>
          <button class="icon-btn" aria-label="Deadline"><Flag :size="16" /></button>
          <button class="icon-btn is-on" aria-label="Focus on this task"><Timer :size="16" /></button>
        </div>
        <div class="sample-row">
          <button class="check" aria-label="Toggle task"></button>
          <span>30-minute run</span>
          <span></span>
          <button class="icon-btn" aria-label="Focus on this task"><Timer :size="16" /></button>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.sample-date { margin-left: auto; font-size: 13px; }
.sample { padding: var(--space-6); display: flex; flex-direction: column; gap: var(--space-6); }
section { display: flex; flex-direction: column; gap: var(--space-3); padding-top: var(--space-3); }
.row { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
.list { display: flex; flex-direction: column; border-top: 2px solid var(--color-divider); max-width: 560px; }
.sample-row {
  display: grid; grid-template-columns: 22px minmax(0, 1fr) 28px 28px; gap: var(--space-2) var(--space-3);
  align-items: center; padding: var(--space-2); border-bottom: 1px solid var(--color-divider); font-size: 14px;
}
</style>
