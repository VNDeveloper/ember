import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import type { ISODate } from '../core/dates'
import type { Selection } from '../core/model'
import type { PickerTab } from '../core/picker'
import type { When } from './ember'

export type View = 'today' | 'goals' | 'activity'

/** View state that is not persisted. */
export const useUiStore = defineStore('ui', () => {
  const view = ref<View>('today')
  const activeGoalId = ref<string | null>(null)
  const pickerOpen = ref(false)
  const pickerTab = ref<PickerTab>('tasks')
  const pickerQuery = ref('')
  const focusModeOpen = ref(false)
  /** Add-task row draft; survives tab switches, not reloads. */
  const taskDraft = reactive<{ title: string; when: When; date: ISODate | ''; deadline: boolean; goalId: string }>({
    title: '', when: 'today', date: '', deadline: false, goalId: '',
  })
  /** Today list: finished rows expanded. */
  const doneOpen = ref(false)
  /** Upcoming: which collapsible groups (later, someday) are open. */
  const openGroups = reactive<Record<string, boolean>>({})

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
    view, activeGoalId, pickerOpen, pickerTab, pickerQuery, focusModeOpen, taskDraft, doneOpen, openGroups,
    openPicker, closePicker, openFocusMode, closeFocusMode, openGoal, escape,
  }
})
