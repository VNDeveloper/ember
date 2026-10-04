import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import type { HeatMode } from '../core/activityView'
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
  /** Nav: the Data (back up / restore) panel is open. */
  const dataMenuOpen = ref(false)
  /** Add-task row draft; survives tab switches, not reloads. */
  const taskDraft = reactive<{ title: string; when: When; date: ISODate | ''; deadline: boolean; goalId: string }>({
    title: '', when: 'today', date: '', deadline: false, goalId: '',
  })
  /** Today list: finished rows expanded. */
  const doneOpen = ref(false)
  /** Upcoming: which collapsible groups (later, someday) are open. */
  const openGroups = reactive<Record<string, boolean>>({})
  /** Goals: milestone expanded state the user chose (the current milestone defaults to open). */
  const expanded = reactive<Record<string, boolean>>({})
  /** Goals: the add-step or add-milestone input that is open, if any. */
  const adding = ref<{ kind: 'step'; msId: string } | { kind: 'milestone' } | null>(null)
  /** Goals: text in the open add-step / add-milestone input. */
  const draft = ref('')
  /** Goals: the "New goal" input. */
  const goalDraft = ref('')
  /** Goals: "Show all" tasks, per goal. */
  const goalTasksAll = reactive<Record<string, boolean>>({})
  /** Activity: heat map shows focus time or things done. */
  const heatMode = ref<HeatMode>('focus')
  /** Activity: how many log entries are shown ("Show earlier" adds 10). */
  const feedSize = ref(10)

  function selectGoal(id: string) {
    activeGoalId.value = id
    adding.value = null
    draft.value = ''
  }

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

  /** Esc closes the data menu, then the picker, then Focus mode. Returns whether it closed anything. */
  function escape(): boolean {
    if (dataMenuOpen.value) {
      dataMenuOpen.value = false
      return true
    }
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
    view, activeGoalId, dataMenuOpen, pickerOpen, pickerTab, pickerQuery, focusModeOpen, taskDraft, doneOpen, openGroups,
    expanded, adding, draft, goalDraft, goalTasksAll, selectGoal, heatMode, feedSize,
    openPicker, closePicker, openFocusMode, closeFocusMode, openGoal, escape,
  }
})
