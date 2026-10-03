import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { useTicker } from './useTicker'

const host = (tick: () => void) => defineComponent({ setup() { useTicker(tick); return () => h('div') } })

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useTicker', () => {
  it('ticks on mount and every 250ms', () => {
    const tick = vi.fn()
    mount(host(tick))
    expect(tick).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(tick).toHaveBeenCalledTimes(5)
  })

  it('ticks when the tab becomes visible', () => {
    const tick = vi.fn()
    mount(host(tick))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(tick).toHaveBeenCalledTimes(2)
  })

  it('stops after unmount', () => {
    const tick = vi.fn()
    const w = mount(host(tick))
    w.unmount()
    vi.advanceTimersByTime(1000)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(tick).toHaveBeenCalledTimes(1)
  })
})
