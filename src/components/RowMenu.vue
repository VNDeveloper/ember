<script setup lang="ts">
import { Ellipsis } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, ref, watch, type CSSProperties } from 'vue'
import { placeMenu } from '../core/menuPlacement'
import { useUiStore } from '../stores/ui'

/** extra: items between Edit and Delete (e.g. a goal's Pause); picking one emits select with its key. */
const props = defineProps<{ menuKey: string; label: string; extra?: { key: string; label: string }[] }>()
const emit = defineEmits<{ delete: [e: Event]; select: [key: string] }>()
const ui = useUiStore()

const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const first = ref<HTMLButtonElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const open = computed(() => ui.menuFor === props.menuKey)

/**
 * The menu is fixed to the window, placed from the trigger, so a scrolling list (Upcoming) never
 * clips it or grows a scrollbar for it. Hidden until placed; follows the trigger on scroll and resize.
 */
const placement = ref<CSSProperties>({ visibility: 'hidden' })
function place() {
  if (!trigger.value || !menu.value) return
  // The window less its scrollbars: what position: fixed measures from.
  const { clientWidth: width, clientHeight: height } = document.documentElement
  const p = placeMenu(trigger.value.getBoundingClientRect(), menu.value.offsetHeight, { width, height })
  placement.value = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, `${v}px`]))
}
const follow = (on: boolean) => {
  const fn = on ? window.addEventListener : window.removeEventListener
  fn('scroll', place, true)
  fn('resize', place)
}

const toggle = () => { ui.menuFor = open.value ? null : props.menuKey }
function pick(key: string) {
  ui.menuFor = null
  emit('select', key)
}
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
    follow(true)
    void nextTick(() => {
      place()
      first.value?.focus({ preventScroll: true })
    })
  } else {
    document.removeEventListener('pointerdown', onPointerDown)
    follow(false)
    placement.value = { visibility: 'hidden' }
    if (wasOpen) refocus()
  }
})
watch(() => ui.editing === props.menuKey, (now, was) => { if (was && !now) refocus() })
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown)
  follow(false)
})
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
    <div v-if="open" ref="menu" class="rmn-menu" role="menu" :style="placement">
      <button ref="first" role="menuitem" class="rmn-item rmn-edit" @click="ui.startEdit(menuKey)">Edit</button>
      <button v-for="x in extra ?? []" :key="x.key" role="menuitem" class="rmn-item" :class="`rmn-${x.key}`" @click="pick(x.key)">{{ x.label }}</button>
      <button role="menuitem" class="rmn-item rmn-delete" :aria-label="`Delete “${label}”`" @click="onDelete">Delete</button>
    </div>
  </div>
</template>

<style scoped>
.row-menu { position: relative; }
.rmn-menu {
  position: fixed; z-index: 40; min-width: 140px;
  display: flex; flex-direction: column; background: var(--color-surface); border: 2px solid var(--color-text);
}
.rmn-item { padding: var(--space-2) var(--space-3); border: 0; background: transparent; font-size: 14px; color: var(--color-text); text-align: left; }
.rmn-item + .rmn-item { border-top: 1px solid var(--color-divider); }
.rmn-item:hover, .rmn-item:focus-visible { background: var(--color-accent-100); }
.rmn-delete { color: var(--color-accent-700); }
</style>
