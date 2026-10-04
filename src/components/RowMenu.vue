<script setup lang="ts">
import { Ellipsis } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useUiStore } from '../stores/ui'

const props = defineProps<{ menuKey: string; label: string }>()
const emit = defineEmits<{ delete: [e: Event] }>()
const ui = useUiStore()

const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const first = ref<HTMLButtonElement | null>(null)
const open = computed(() => ui.menuFor === props.menuKey)

const toggle = () => { ui.menuFor = open.value ? null : props.menuKey }
function onDelete(e: Event) {
  ui.menuFor = null
  emit('delete', e)
}

function onPointerDown(e: PointerEvent | MouseEvent) {
  if (open.value && root.value && e.target instanceof Node && !root.value.contains(e.target)) ui.menuFor = null
}

/** Give focus back to "⋯" when the menu or this row's edit panel closes and focus has nowhere better to be. */
function refocus() {
  void nextTick(() => {
    const active = document.activeElement
    if (trigger.value?.isConnected && (!active || active === document.body || root.value?.contains(active))) trigger.value.focus()
  })
}

watch(open, (isOpen, wasOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', onPointerDown)
    void nextTick(() => first.value?.focus())
  } else {
    document.removeEventListener('pointerdown', onPointerDown)
    if (wasOpen) refocus()
  }
})
watch(() => ui.editing === props.menuKey, (now, was) => { if (was && !now) refocus() })
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown))
</script>

<template>
  <div ref="root" class="row-menu">
    <button
      ref="trigger"
      class="icon-btn rmn-trigger"
      :class="{ 'is-on': open }"
      :aria-label="`More actions for “${label}”`"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="toggle"
    >
      <Ellipsis :size="16" :stroke-width="2.25" />
    </button>
    <div v-if="open" class="rmn-menu" role="menu">
      <button ref="first" role="menuitem" class="rmn-item rmn-edit" @click="ui.startEdit(menuKey)">Edit</button>
      <button role="menuitem" class="rmn-item rmn-delete" :aria-label="`Delete “${label}”`" @click="onDelete">Delete</button>
    </div>
  </div>
</template>

<style scoped>
.row-menu { position: relative; }
.rmn-menu {
  position: absolute; top: calc(100% + 4px); right: 0; z-index: 40; min-width: 140px;
  display: flex; flex-direction: column; background: var(--color-surface); border: 2px solid var(--color-text);
}
.rmn-item { padding: var(--space-2) var(--space-3); border: 0; background: transparent; font-size: 14px; color: var(--color-text); text-align: left; }
.rmn-item + .rmn-item { border-top: 1px solid var(--color-divider); }
.rmn-item:hover, .rmn-item:focus-visible { background: var(--color-accent-100); }
.rmn-delete { color: var(--color-accent-700); }
</style>
