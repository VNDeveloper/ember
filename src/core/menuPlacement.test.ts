import { describe, expect, it } from 'vitest'
import { placeMenu } from './menuPlacement'

const viewport = { width: 1280, height: 800 }
const trigger = (top: number, right = 1000) => ({ top, bottom: top + 28, right })

describe('placeMenu', () => {
  it('opens below the trigger, right edges aligned', () => {
    expect(placeMenu(trigger(100), 80, viewport)).toEqual({ top: 132, right: 280 })
  })

  it('flips above the trigger when there is no room below', () => {
    expect(placeMenu(trigger(740), 80, viewport)).toEqual({ bottom: 64, right: 280 })
  })

  it('stays below when there is no room above either', () => {
    expect(placeMenu(trigger(40), 80, { width: 1280, height: 120 })).toEqual({ top: 72, right: 280 })
  })

  it('keeps the menu inside the window on the right', () => {
    expect(placeMenu(trigger(100, 1290), 80, viewport).right).toBe(8)
  })
})
