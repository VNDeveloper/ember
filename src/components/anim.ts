/** Retriggerable animation classes: alternate between two identical keyframes per event. */
export const popClass = (n: number): string => `anim-pop${n % 2}`
export const dropClass = (n: number): string => `anim-drop${n % 2}`
