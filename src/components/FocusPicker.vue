<script setup lang="ts">
import { Search } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useDialogFocus } from '../composables/useDialogFocus'
import { pickerSections, type PickerItem } from '../core/picker'
import { useEmberStore } from '../stores/ember'
import { useUiStore } from '../stores/ui'

const ember = useEmberStore()
const ui = useUiStore()
const input = ref<HTMLInputElement | null>(null)
const dialog = ref<HTMLElement | null>(null)
const { onKeydown } = useDialogFocus(dialog, input)

const sections = computed(() =>
  pickerSections(ember.goals, ember.tasks, ember.selection, ui.pickerTab, ui.pickerQuery, ember.today),
)

function pick(item: PickerItem) {
  ember.select(item.target)
  ui.closePicker()
}

function onEnter(e: KeyboardEvent) {
  if (!e.isComposing) pickFirst()
}

function pickFirst() {
  const first = sections.value[0]?.items[0]
  if (first) pick(first)
}
</script>

<template>
  <Teleport to="body">
    <div class="dialog-backdrop picker-backdrop" @click.self="ui.closePicker()">
      <div ref="dialog" class="dialog picker" role="dialog" aria-modal="true" aria-label="Pick what to focus on" @keydown="onKeydown">
        <div class="picker-head">
          <Search :size="18" :stroke-width="2.25" />
          <input
            ref="input"
            v-model="ui.pickerQuery"
            class="picker-input"
            :placeholder="ui.pickerTab === 'goals' ? 'Search goal steps' : 'Search tasks'"
            aria-label="Search"
            @keydown.enter.prevent="onEnter"
          />
          <div class="seg">
            <label class="seg-opt"><input v-model="ui.pickerTab" type="radio" name="ember-pick" value="tasks" />Tasks</label>
            <label class="seg-opt"><input v-model="ui.pickerTab" type="radio" name="ember-pick" value="goals" />Goals</label>
          </div>
        </div>
        <div class="picker-body">
          <template v-for="(sec, i) in sections" :key="`${i}-${sec.label}`">
            <div class="picker-section section-label">
              <span>{{ sec.label }}</span><span class="picker-count">{{ sec.items.length }}</span>
            </div>
            <button
              v-for="it in sec.items"
              :key="it.key"
              class="picker-row"
              :class="{ 'is-current': it.current }"
              @click="pick(it)"
            >
              <span class="swatch" :class="{ 'is-outlined': it.outlined }" :style="{ background: it.swatch }"></span>
              <span class="picker-text">
                <span class="picker-title">{{ it.title }}</span>
                <span class="picker-meta">{{ it.meta }}</span>
              </span>
              <span v-if="it.current" class="tag tag-accent">Current</span>
            </button>
          </template>
          <p v-if="!sections.length" class="picker-empty">Nothing matches “{{ ui.pickerQuery }}”.</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.picker-backdrop { z-index: 200; place-items: start center; padding-top: 12vh; }
.picker { width: min(560px, 100%); max-height: 72vh; color: var(--color-text); border: 2px solid var(--color-text); }
.picker-head {
  display: flex; align-items: center; gap: var(--space-3);
  padding: var(--space-3) var(--space-4); border-bottom: 2px solid var(--color-divider);
}
.picker-head > svg { flex: none; }
.picker-input { flex: 1; min-width: 0; border: 0; background: transparent; font-size: 16px; color: var(--color-text); }
.picker-input:focus-visible { outline: none; }
.picker-head .seg { flex: none; }
.picker-body { overflow-y: auto; display: flex; flex-direction: column; padding-bottom: var(--space-2); }
.picker-section {
  position: sticky; top: 0; z-index: 1; display: flex; justify-content: space-between;
  padding: var(--space-3) var(--space-4) var(--space-1);
  background: var(--color-surface); border-bottom: 1px solid var(--color-divider);
}
.picker-count { font-weight: 400; color: var(--color-neutral-700); }
.picker-row {
  display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; gap: var(--space-3); align-items: center;
  padding: var(--space-2) var(--space-4); border: 0; border-bottom: 1px solid var(--color-divider);
  background: transparent; color: var(--color-text); text-align: left;
}
.picker-row:hover, .picker-row.is-current { background: var(--color-accent-100); }
.picker-text { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.picker-title { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.is-current .picker-title { font-weight: 700; }
.picker-meta { font-size: 12px; color: var(--color-neutral-700); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.picker-empty { padding: var(--space-4); font-size: 14px; color: var(--color-neutral-700); }
.is-outlined { box-shadow: inset 0 0 0 2px var(--color-text); }
@media (max-width: 520px) {
  .picker-backdrop { padding: var(--space-4) var(--space-4) 0; }
  .picker-head { flex-wrap: wrap; }
}
</style>
