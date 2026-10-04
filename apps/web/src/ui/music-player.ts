/**
 * Plays the session's music on this device, wherever the room says it is
 * (ADR 0017).
 *
 * One `<audio>` element, routed through a Web Audio gain node because iOS
 * ignores `.volume` on a media element. Nothing plays until somebody on this
 * device presses something: browsers refuse sound a page was not asked for,
 * and the press that opens audio is the one that also says "I want to hear
 * this". The element is never in the DOM — it is a player, not a control.
 */

/** How far this device may drift from the room before it seeks back into place. */
export const DRIFT_MS = 750

/** Whether a device playing at `currentSeconds` should seek to the room's `targetMs`. */
export function shouldSeek(currentSeconds: number, targetMs: number): boolean {
  return Math.abs(currentSeconds * 1000 - targetMs) >= DRIFT_MS
}

export interface Listening {
  readonly muted: boolean
  /** 0 to 1. */
  readonly volume: number
}

const SOUND_KEY = 'openframe:music-sound'
const DEFAULT_LISTENING: Listening = { muted: false, volume: 0.6 }

/** This device's mute and volume, kept between visits. Never the room's. */
export function readListening(): Listening {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(SOUND_KEY) ?? 'null')
    if (typeof raw !== 'object' || raw === null) return DEFAULT_LISTENING
    const { muted, volume } = raw as { muted?: unknown; volume?: unknown }
    if (typeof muted !== 'boolean' || typeof volume !== 'number') return DEFAULT_LISTENING
    if (!(volume >= 0 && volume <= 1)) return DEFAULT_LISTENING
    return { muted, volume }
  } catch {
    return DEFAULT_LISTENING
  }
}

export function writeListening(listening: Listening): void {
  try {
    window.localStorage.setItem(SOUND_KEY, JSON.stringify(listening))
  } catch {
    // Held for this page; only a reload forgets it.
  }
}

/** Where the room says the music is, resolved to something an element can play. */
export interface Cue {
  readonly trackId: string
  readonly url: string
  readonly offsetMs: number
  readonly playing: boolean
}

export class MusicPlayer {
  readonly #audio: HTMLAudioElement
  #context: AudioContext | null = null
  #gain: GainNode | null = null
  #trackId: string | null = null
  #listening: Listening = DEFAULT_LISTENING
  #joined = false

  constructor() {
    this.#audio = new Audio()
    // The tracks come from the room server's origin; Web Audio may only read
    // a cross-origin stream that was fetched with CORS.
    this.#audio.crossOrigin = 'anonymous'
    this.#audio.preload = 'auto'
  }

  /** Whether this device has asked to hear the music. */
  get joined(): boolean {
    return this.#joined
  }

  /**
   * Opens audio. Must be called from a press — a browser refuses to create or
   * resume an audio context otherwise. Where there is no Web Audio, the
   * element's own volume is used and iOS simply cannot be turned down.
   */
  join(): void {
    this.#joined = true
    try {
      if (this.#context === null) {
        this.#context = new AudioContext()
        this.#gain = this.#context.createGain()
        this.#context.createMediaElementSource(this.#audio).connect(this.#gain)
        this.#gain.connect(this.#context.destination)
      }
      if (this.#context.state === 'suspended') void this.#context.resume()
    } catch {
      this.#context = null
      this.#gain = null
    }
    this.#applyVolume()
  }

  setListening(listening: Listening): void {
    this.#listening = listening
    this.#applyVolume()
  }

  /**
   * Follows the room: loads the right track, seeks when this device has
   * drifted, and plays or holds. Called on every tick while the sheet is
   * anywhere on the page, so a device that buffered catches back up.
   */
  follow(cue: Cue | null): void {
    if (cue === null || !this.#joined) {
      this.#audio.pause()
      return
    }
    if (cue.trackId !== this.#trackId) {
      this.#trackId = cue.trackId
      this.#audio.src = cue.url
      this.#seek(cue.offsetMs)
    } else if (shouldSeek(this.#audio.currentTime, cue.offsetMs)) {
      this.#seek(cue.offsetMs)
    }
    if (cue.playing && this.#audio.paused) {
      void this.#audio.play().catch(() => {
        // Refused until a press; the sheet offers one.
      })
    } else if (!cue.playing && !this.#audio.paused) {
      this.#audio.pause()
    }
  }

  destroy(): void {
    this.#audio.pause()
    this.#audio.removeAttribute('src')
    this.#audio.load()
    void this.#context?.close().catch(() => undefined)
  }

  #seek(offsetMs: number): void {
    try {
      this.#audio.currentTime = offsetMs / 1000
    } catch {
      // Not seekable until its metadata arrives; the next tick tries again.
    }
  }

  #applyVolume(): void {
    const level = this.#listening.muted ? 0 : this.#listening.volume
    if (this.#gain !== null) {
      this.#gain.gain.value = level
      this.#audio.volume = 1
    } else {
      this.#audio.volume = level
    }
  }
}
