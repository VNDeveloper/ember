import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

interface YTPlayer {
  mute(): void
  unMute(): void
  setVolume(v: number): void
  playVideo(): void
  pauseVideo(): void
  destroy(): void
  getIframe?(): HTMLIFrameElement
}

interface YTPlayerOptions {
  videoId: string
  host: string
  playerVars: Record<string, string | number>
  events: { onReady: (e: { target: YTPlayer }) => void; onError: (e: { data: number }) => void }
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

export interface PlayerControls {
  muted: Ref<boolean>
  /** 0–100. */
  volume: Ref<number>
  paused: Ref<boolean>
}

/**
 * One background player inside `host`. Changing the video recreates it; sound, volume and
 * pause are applied to the running player. `failed` is true while YouTube refuses the video
 * (removed, private, or not allowed in embeds).
 */
export function useYouTubePlayer(host: Ref<HTMLElement | null>, videoId: Ref<string | null>, controls: PlayerControls): { failed: Ref<boolean> } {
  const { muted, volume, paused } = controls
  const failed = ref(false)
  let player: YTPlayer | null = null
  /** The player's methods exist only once it reports ready. */
  let ready = false
  let alive = true

  function destroy() {
    player?.destroy()
    player = null
    ready = false
  }

  async function create(id: string | null) {
    destroy()
    failed.value = false
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
          target.setVolume(volume.value)
          if (muted.value) target.mute()
          else target.unMute()
          if (paused.value) target.pauseVideo()
          else target.playVideo()
        },
        onError: () => { failed.value = true },
      },
    })
  }

  /** Runs `fn` on the player once it is ready; changes before then are picked up by onReady. */
  const whenReady = (fn: (p: YTPlayer) => void) => { if (player && ready) fn(player) }

  onMounted(() => { void create(videoId.value) })
  watch(videoId, (id) => { void create(id) })
  watch(muted, (m) => whenReady((p) => (m ? p.mute() : p.unMute())))
  watch(volume, (v) => whenReady((p) => p.setVolume(v)))
  watch(paused, (pause) => whenReady((p) => (pause ? p.pauseVideo() : p.playVideo())))
  onBeforeUnmount(() => {
    alive = false
    destroy()
  })
  return { failed }
}
