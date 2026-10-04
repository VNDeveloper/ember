import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref, type Ref } from 'vue'
import { useYouTubePlayer } from './useYouTubePlayer'

interface FakePlayer { mute: ReturnType<typeof vi.fn>; unMute: ReturnType<typeof vi.fn>; playVideo: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn>; getIframe: () => HTMLIFrameElement }
let players: FakePlayer[]
let Player: ReturnType<typeof vi.fn>

function host(videoId: Ref<string | null>, muted: Ref<boolean>) {
  return defineComponent({
    setup() {
      const el = ref<HTMLElement | null>(null)
      useYouTubePlayer(el, videoId, muted)
      return () => h('div', { ref: el, class: 'host' })
    },
  })
}

beforeEach(() => {
  players = []
  Player = vi.fn(function () {
    const frame = document.createElement('iframe')
    const p = { mute: vi.fn(), unMute: vi.fn(), playVideo: vi.fn(), destroy: vi.fn(), getIframe: vi.fn(() => frame) }
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
