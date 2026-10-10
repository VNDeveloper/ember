import { onBeforeUnmount, onMounted, watch } from 'vue'
import { endSoundDue, SOUND_NOTES, type EndSound } from '../core/sounds'
import { useEmberStore } from '../stores/ember'

let ctx: AudioContext | null = null

/** One shared context, created on first use; null where Web Audio is missing. */
function audio(): AudioContext | null {
  if (ctx) return ctx
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  ctx = new Ctor()
  return ctx
}

export function resetAudioForTests(): void {
  ctx = null
}

/** Browsers start audio suspended until the page is used; a click resumes it so later sounds can play unprompted. */
async function wake(c: AudioContext): Promise<void> {
  if (c.state !== 'running') await c.resume().catch(() => undefined)
}

export async function playEndSound(id: EndSound): Promise<void> {
  if (id === 'none') return
  const c = audio()
  if (!c) return
  await wake(c)
  const t0 = c.currentTime
  for (const n of SOUND_NOTES[id]) {
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = n.wave
    osc.frequency.value = n.freq
    // Fast attack, exponential decay: a struck, not switched, sound.
    gain.gain.setValueAtTime(0.0001, t0 + n.at)
    gain.gain.exponentialRampToValueAtTime(n.gain, t0 + n.at + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur)
    osc.connect(gain)
    gain.connect(c.destination)
    osc.start(t0 + n.at)
    osc.stop(t0 + n.at + n.dur + 0.05)
  }
}

/** Plays the chosen sound when a focus session or break ends (see Settings → Sounds). */
export function useEndSounds(): void {
  const ember = useEmberStore()
  watch(() => ember.phaseEnded?.n, () => {
    const ended = ember.phaseEnded
    if (!ended || !endSoundDue(ended.at, Date.now())) return
    void playEndSound(ended.phase === 'focus' ? ember.settings.focusEndSound : ember.settings.breakEndSound)
  })

  const EVENTS = ['pointerdown', 'keydown'] as const
  const unlock = () => {
    const c = audio()
    if (c) void wake(c)
    for (const type of EVENTS) document.removeEventListener(type, unlock, true)
  }
  onMounted(() => { for (const type of EVENTS) document.addEventListener(type, unlock, true) })
  onBeforeUnmount(() => { for (const type of EVENTS) document.removeEventListener(type, unlock, true) })
}
