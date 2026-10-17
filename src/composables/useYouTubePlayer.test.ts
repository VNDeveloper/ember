import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref, type Ref } from 'vue'
import { useYouTubePlayer } from './useYouTubePlayer'

type Fn = ReturnType<typeof vi.fn>
interface FakePlayer { mute: Fn; unMute: Fn; playVideo: Fn; pauseVideo: Fn; setVolume: Fn; destroy: Fn; getIframe: () => HTMLIFrameElement }
let players: FakePlayer[]
let Player: ReturnType<typeof vi.fn>

let failed: Ref<boolean>
let playing: Ref<boolean>
function host(videoId: Ref<string | null>, muted: Ref<boolean>, volume = ref(80), paused = ref(false)) {
  return defineComponent({
    setup() {
      const el = ref<HTMLElement | null>(null)
      ;({ failed, playing } = useYouTubePlayer(el, videoId, { muted, volume, paused }))
      return () => h('div', { ref: el, class: 'host' })
    },
  })
}

beforeEach(() => {
  players = []
  Player = vi.fn(function () {
    const frame = document.createElement('iframe')
    const p = { mute: vi.fn(), unMute: vi.fn(), playVideo: vi.fn(), pauseVideo: vi.fn(), setVolume: vi.fn(), destroy: vi.fn(), getIframe: vi.fn(() => frame) }
    players.push(p)
    return p
  })
  ;(window as unknown as { YT: unknown }).YT = { Player }
})
afterEach(() => {
  delete (window as unknown as { YT?: unknown }).YT
})

describe('useYouTubePlayer', () => {
  it('creates a muted, looping, control-less player for the video', async () => {
    const w = mount(host(ref('jfKfPfyJRdk'), ref(true)))
    await flushPromises()
    expect(Player).toHaveBeenCalledTimes(1)
    const [el, opts] = Player.mock.calls[0]
    expect(w.find('.host').element.contains(el)).toBe(true)
    expect(opts).toMatchObject({
      videoId: 'jfKfPfyJRdk',
      host: 'https://www.youtube-nocookie.com',
      playerVars: {
        autoplay: 1, mute: 1, loop: 1, playlist: 'jfKfPfyJRdk', controls: 0, modestbranding: 1,
        playsinline: 1, rel: 0, iv_load_policy: 3, disablekb: 1,
      },
    })
  })

  it('applies the sound setting when ready', async () => {
    mount(host(ref('jfKfPfyJRdk'), ref(false)))
    await flushPromises()
    const target = players[0]
    Player.mock.calls[0][1].events.onReady({ target })
    expect(target.unMute).toHaveBeenCalled()
    expect(target.playVideo).toHaveBeenCalled()
  })

  it('ignores sound changes until the player is ready, then mutes and unmutes without recreating it', async () => {
    const muted = ref(true)
    mount(host(ref('jfKfPfyJRdk'), muted))
    await flushPromises()
    muted.value = false
    await flushPromises()
    expect(players[0].unMute).not.toHaveBeenCalled()
    Player.mock.calls[0][1].events.onReady({ target: players[0] })
    expect(players[0].unMute).toHaveBeenCalledTimes(1)
    muted.value = true
    await flushPromises()
    expect(players[0].mute).toHaveBeenCalledTimes(1)
    expect(Player).toHaveBeenCalledTimes(1)
  })

  it('keeps the iframe out of the tab order once ready', async () => {
    mount(host(ref('jfKfPfyJRdk'), ref(true)))
    await flushPromises()
    Player.mock.calls[0][1].events.onReady({ target: players[0] })
    const frame = players[0].getIframe()
    expect(frame.getAttribute('tabindex')).toBe('-1')
    expect(frame.getAttribute('title')).toBe('Background video')
  })

  it('recreates the player when the video changes and removes it when there is none', async () => {
    const id = ref<string | null>('jfKfPfyJRdk')
    mount(host(id, ref(true)))
    await flushPromises()
    id.value = 'dQw4w9WgXcQ'
    await flushPromises()
    expect(players[0].destroy).toHaveBeenCalled()
    expect(Player).toHaveBeenCalledTimes(2)
    expect(Player.mock.calls[1][1].videoId).toBe('dQw4w9WgXcQ')
    id.value = null
    await flushPromises()
    expect(players[1].destroy).toHaveBeenCalled()
    expect(Player).toHaveBeenCalledTimes(2)
  })

  it('applies the volume when ready and on change', async () => {
    const volume = ref(35)
    mount(host(ref('jfKfPfyJRdk'), ref(false), volume))
    await flushPromises()
    volume.value = 50
    await flushPromises()
    expect(players[0].setVolume).not.toHaveBeenCalled()
    Player.mock.calls[0][1].events.onReady({ target: players[0] })
    expect(players[0].setVolume).toHaveBeenCalledWith(50)
    volume.value = 10
    await flushPromises()
    expect(players[0].setVolume).toHaveBeenLastCalledWith(10)
  })

  it('pauses and plays the video without recreating it, and starts paused if asked', async () => {
    const paused = ref(true)
    mount(host(ref('jfKfPfyJRdk'), ref(true), ref(80), paused))
    await flushPromises()
    Player.mock.calls[0][1].events.onReady({ target: players[0] })
    expect(players[0].pauseVideo).toHaveBeenCalledTimes(1)
    expect(players[0].playVideo).not.toHaveBeenCalled()
    paused.value = false
    await flushPromises()
    expect(players[0].playVideo).toHaveBeenCalledTimes(1)
    paused.value = true
    await flushPromises()
    expect(players[0].pauseVideo).toHaveBeenCalledTimes(2)
    expect(Player).toHaveBeenCalledTimes(1)
  })

  it('reports a video YouTube refuses to play, until the video changes', async () => {
    const id = ref<string | null>('jfKfPfyJRdk')
    mount(host(id, ref(true)))
    await flushPromises()
    expect(failed.value).toBe(false)
    Player.mock.calls[0][1].events.onError({ data: 150 })
    expect(failed.value).toBe(true)
    id.value = 'dQw4w9WgXcQ'
    await flushPromises()
    expect(failed.value).toBe(false)
  })

  it('makes no player without a video, and destroys it on unmount', async () => {
    mount(host(ref(null), ref(true)))
    await flushPromises()
    expect(Player).not.toHaveBeenCalled()
    const w = mount(host(ref('jfKfPfyJRdk'), ref(true)))
    await flushPromises()
    w.unmount()
    expect(players[0].destroy).toHaveBeenCalled()
  })

  it('does not create a player after unmount', async () => {
    const w = mount(host(ref('jfKfPfyJRdk'), ref(true)))
    w.unmount()
    await flushPromises()
    expect(Player).not.toHaveBeenCalled()
  })
})

describe('loadYouTubeApi', () => {
  it('injects the API script once and resolves when it is ready', async () => {
    delete (window as unknown as { YT?: unknown }).YT
    vi.resetModules()
    const { loadYouTubeApi } = await import('./useYouTubePlayer')
    const a = loadYouTubeApi()
    const b = loadYouTubeApi()
    const scripts = [...document.querySelectorAll('script')].filter((s) => s.src === 'https://www.youtube.com/iframe_api')
    expect(scripts).toHaveLength(1)
    const YT = { Player }
    ;(window as unknown as { YT: unknown }).YT = YT
    ;(window as unknown as { onYouTubeIframeAPIReady: () => void }).onYouTubeIframeAPIReady()
    await expect(a).resolves.toBe(YT)
    await expect(b).resolves.toBe(YT)
    scripts[0].remove()
  })

  it('gives up after 15 seconds so a later call can retry', async () => {
    vi.useFakeTimers()
    delete (window as unknown as { YT?: unknown }).YT
    vi.resetModules()
    const { loadYouTubeApi } = await import('./useYouTubePlayer')
    const first = loadYouTubeApi()
    vi.advanceTimersByTime(15_000)
    await expect(first).rejects.toThrow('timed out')
    loadYouTubeApi().catch(() => {})
    const scripts = [...document.querySelectorAll('script')].filter((s) => s.src === 'https://www.youtube.com/iframe_api')
    expect(scripts).toHaveLength(1)
    scripts.forEach((s) => s.remove())
    vi.useRealTimers()
  })
})

describe('useYouTubePlayer — playing', () => {
  it('reports when the video is actually playing, and resets for a new video', async () => {
    const id = ref<string | null>('jfKfPfyJRdk')
    mount(host(id, ref(true)))
    await flushPromises()
    const events = Player.mock.calls[0][1].events
    expect(playing.value).toBe(false)
    events.onStateChange({ data: 3 })
    expect(playing.value).toBe(false)
    events.onStateChange({ data: 1 })
    expect(playing.value).toBe(true)
    events.onStateChange({ data: 2 })
    expect(playing.value).toBe(false)
    events.onStateChange({ data: 1 })
    id.value = 'dQw4w9WgXcQ'
    await flushPromises()
    expect(playing.value).toBe(false)
  })
})
