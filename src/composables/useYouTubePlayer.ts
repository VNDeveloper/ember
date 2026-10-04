import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue'

interface YTPlayer {
  mute(): void
  unMute(): void
  playVideo(): void
  destroy(): void
  getIframe?(): HTMLIFrameElement
}

interface YTPlayerOptions {
  videoId: string
  host: string
  playerVars: Record<string, string | number>
  events: { onReady: (e: { target: YTPlayer }) => void }
}

interface YTNamespace {
  Player: new (el: HTMLElement, opts: YTPlayerOptions) => YTPlayer
}

declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

const API_SRC = 'https://www.youtube.com/iframe_api'
let apiPromise: Promise<YTNamespace> | null = null

/** Loads the YouTube IFrame Player API once. */
export function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (apiPromise) return apiPromise
  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const script = document.createElement('script')
    /** Give up (and allow a retry) if the API never reports ready, e.g. a follow-on script failed. */
    const timeout = setTimeout(() => {
      apiPromise = null
      script.remove()
      reject(new Error('YouTube API timed out'))
    }, 15_000)
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      clearTimeout(timeout)
      if (window.YT) resolve(window.YT)
    }
    script.src = API_SRC
    script.async = true
    script.onerror = () => {
      clearTimeout(timeout)
      apiPromise = null
      script.remove()
      reject(new Error('YouTube API failed to load'))
    }
    document.head.appendChild(script)
  })
  return apiPromise
}

/** Muted, looping, control-less background embed (see handoff §Focus mode). */
export const playerVars = (id: string) => ({
  autoplay: 1, mute: 1, loop: 1, playlist: id, controls: 0, modestbranding: 1,
  playsinline: 1, rel: 0, iv_load_policy: 3, disablekb: 1,
})

/**
 * One background player inside `host`. Changing the video recreates it; changing `muted`
 * calls mute()/unMute() so the video keeps playing.
 */
export function useYouTubePlayer(host: Ref<HTMLElement | null>, videoId: Ref<string | null>, muted: Ref<boolean>): void {
  let player: YTPlayer | null = null
  /** mute()/unMute() exist only once the player reports ready. */
  let ready = false
  let alive = true

  function destroy() {
    player?.destroy()
    player = null
    ready = false
  }

  async function create(id: string | null) {
    destroy()
    if (!id) return
    const YT = await loadYouTubeApi().catch(() => null)
    if (!YT || !alive || !host.value || videoId.value !== id) return
    destroy()
    const mountPoint = document.createElement('div')
    host.value.replaceChildren(mountPoint)
    player = new YT.Player(mountPoint, {
      videoId: id,
      host: 'https://www.youtube-nocookie.com',
      playerVars: playerVars(id),
      events: {
        onReady: ({ target }) => {
          ready = true
          const frame = target.getIframe?.()
          frame?.setAttribute('tabindex', '-1')
          frame?.setAttribute('title', 'Background video')
          if (muted.value) target.mute()
          else target.unMute()
          target.playVideo()
        },
      },
    })
  }

  onMounted(() => { void create(videoId.value) })
  watch(videoId, (id) => { void create(id) })
  watch(muted, (m) => {
    if (!player || !ready) return
    if (m) player.mute()
    else player.unMute()
  })
  onBeforeUnmount(() => {
    alive = false
    destroy()
  })
}
