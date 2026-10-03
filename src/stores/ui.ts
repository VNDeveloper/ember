import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Selection } from '../core/model'
import type { PickerTab } from '../core/picker'

export type View = 'today' | 'goals' | 'activity'

/** View state that is not persisted. */
export const useUiStore = defineStore('ui', () => {
  const view = ref<View>('today')
  const activeGoalId = ref<string | null>(null)
  const pickerOpen = ref(false)
  const pickerTab = ref<PickerTab>('tasks')
  const pickerQuery = ref('')
  const focusModeOpen = ref(false)

  function openPicker(selection: Selection) {
    pickerTab.value = selection?.kind === 'step' ? 'goals' : 'tasks'
    pickerQuery.value = ''
    pickerOpen.value = true
  }

  function closePicker() {
    pickerOpen.value = false
    pickerQuery.value = ''
  }

  const openFocusMode = () => { focusModeOpen.value = true }
  const closeFocusMode = () => { focusModeOpen.value = false }

  function openGoal(id: string) {
    activeGoalId.value = id
    view.value = 'goals'
  }

  /** Esc closes the picker first, then Focus mode. Returns whether it closed anything. */
  function escape(): boolean {
    if (pickerOpen.value) {
      closePicker()
      return true
    }
    if (focusModeOpen.value) {
      closeFocusMode()
      return true
    }
    return false
  }

  return {
    view, activeGoalId, pickerOpen, pickerTab, pickerQuery, focusModeOpen,
    openPicker, closePicker, openFocusMode, closeFocusMode, openGoal, escape,
  }
})
