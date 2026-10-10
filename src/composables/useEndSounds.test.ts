import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { dataFixture } from '../core/test-fixtures'
import { useEmberStore } from '../stores/ember'
import { playEndSound, resetAudioForTests, useEndSounds } from './useEndSounds'

const NOW = new Date(2026, 8, 23, 10, 0).getTime()
let contexts: FakeContext[]

class FakeContext {
  state = 'suspended'
  currentTime = 0
  destination = {}
  oscillators: { type: string; frequency: { value: number }; start: ReturnType<typeof vi.fn> }[] = []
  resume = vi.fn(async () => { this.state = 'running' })
  constructor() { contexts.push(this) }
  createOscillator() {
    const o = { type: '', frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() }
    this.oscillators.push(o)
    return o
  }
  createGain() {
    return { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() }
  }
}

const Host = defineComponent({ setup() { useEndSounds(); return () => h('div') } })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  setActivePinia(createPinia())
  contexts = []
  resetAudioForTests()
  ;(window as unknown as { AudioContext: unknown }).AudioContext = FakeContext
})
afterEach(() => {
  vi.useRealTimers()
  delete (window as unknown as { AudioContext?: unknown }).AudioContext
})

describe('playEndSound', () => {
  it('synthesises the notes of the chosen sound', async () => {
    await playEndSound('beeps')
    expect(contexts).toHaveLength(1)
    expect(contexts[0].oscillators).toHaveLength(3)
    expect(contexts[0].oscillators[0]).toMatchObject({ type: 'square', frequency: { value: 1000 } })
    expect(contexts[0].resume).toHaveBeenCalled()
  })

  it('plays nothing for None, and reuses one audio context', async () => {
    await playEndSound('none')
    expect(contexts).toHaveLength(0)
    await playEndSound('chime')
    await playEndSound('bell')
    expect(contexts).toHaveLength(1)
  })

  it('does nothing where Web Audio is missing', async () => {
    delete (window as unknown as { AudioContext?: unknown }).AudioContext
    await expect(playEndSound('chime')).resolves.toBeUndefined()
  })
})

describe('useEndSounds', () => {
  function setup() {
    const ember = useEmberStore()
    ember.replaceData(dataFixture({ settings: { ...dataFixture().settings, focusEndSound: 'beeps', breakEndSound: 'soft' } }))
    const w = mount(Host)
    return { ember, w }
  }

  it('plays the focus sound when a session ends and the break sound when a break ends', async () => {
    const { ember, w } = setup()
    ember.startPause()
    ember.tick(NOW + 25 * 60_000)
    vi.setSystemTime(NOW + 25 * 60_000)
    await flushPromises()
    expect(contexts[0].oscillators.map((o) => o.type)).toEqual(['square', 'square', 'square'])
    ember.startPause()
    ember.tick(NOW + 30 * 60_000)
    vi.setSystemTime(NOW + 30 * 60_000)
    await flushPromises()
    expect(contexts[0].oscillators.slice(3).map((o) => o.type)).toEqual(['triangle', 'triangle', 'triangle'])
    w.unmount()
  })

  it('stays silent when a long-finished session is caught up on reopening', async () => {
    const { ember, w } = setup()
    ember.startPause()
    vi.setSystemTime(NOW + 3 * 60 * 60_000)
    ember.tick()
    await flushPromises()
    expect(ember.timer.phase).toBe('break')
    expect(contexts).toHaveLength(0)
    w.unmount()
  })

  it('wakes the audio on the first click, so a sound can play later without one', async () => {
    const { w } = setup()
    document.dispatchEvent(new Event('pointerdown'))
    await flushPromises()
    expect(contexts).toHaveLength(1)
    expect(contexts[0].resume).toHaveBeenCalled()
    w.unmount()
  })
})
