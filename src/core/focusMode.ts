export interface FocusUIState {
  running: boolean
  idle: boolean
  settingsOpen: boolean
  pickerOpen: boolean
}

/** Focus mode controls hide only while a session runs, nobody is using them, and no panel is open. */
export const hideFocusUI = (s: FocusUIState): boolean => s.running && s.idle && !s.settingsOpen && !s.pickerOpen
