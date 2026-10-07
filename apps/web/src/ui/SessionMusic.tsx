import {
  MUSIC_GENRES,
  pauseMusic,
  playMusic,
  playlistOf,
  positionOf,
  setGenre,
  skipMusic,
  stopMusic,
  stoppedMusic,
  type Catalogue,
  type MusicGenre,
  type SessionMusic as Music,
} from '@openframe/core/facilitation'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { CloseIcon, NextTrackIcon, PreviousTrackIcon } from '../controls/icons.js'
import { useCanEdit } from '../hooks/use-can-edit.js'
import { useMe } from '../hooks/use-me.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import type { FacilitationChannel } from '../runtime/facilitation.js'
import { useServices, type MusicService } from '../runtime/services.js'
import { MusicPlayer, readListening, writeListening, type Listening } from './music-player.js'
import { asksToListen, readAgreed, startedText, writeAgreed } from './music-listen.js'
import { clockText, elapsedText } from './clock-text.js'

/** Open Lo-Fi's category labels, cut to what fits a row of toggles. */
const GENRE_NAMES: Readonly<Record<MusicGenre, string>> = {
  chillhop: 'Chillhop',
  jazzhop: 'Jazz lounge',
  'ambient-lofi': 'Ambient',
  'soul-rnb': 'Soul & slow jams',
  'asian-lofi': 'Asian & zen',
  'funk-soul': 'Funk & soul',
  'seasonal-weather': 'Seasons & weather',
  'late-night': 'Late night',
  activities: 'Focus & routines',
  hybrid: 'Hybrid & world',
}

/** Often enough that a device which buffered is back in place within a second. */
const FOLLOW_MS = 1000

/**
 * The approved library, read once per board. `null` until it answers, and
 * where there is nothing to play from — no room server, or nothing approved
 * in it yet. A section for music that cannot play would be a promise the
 * product does not keep.
 */
export function useCatalogue(): Catalogue | null {
  const { music } = useServices()
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null)
  useEffect(() => {
    let current = true
    void music.catalogue().then((read) => {
      if (current) setCatalogue(read)
    })
    return () => {
      current = false
    }
  }, [music])
  return catalogue === null || catalogue.tracks.length === 0 ? null : catalogue
}

export interface MusicSession {
  /** Whether there is anything here for this person: a library, and an editor or music to hear. */
  readonly shown: boolean
  readonly active: boolean
  /** Playing in the room, and silent on this device. */
  readonly unheard: boolean
  readonly state: Music['status'] | 'unheard'
  /** What the pill says about the music to a screen reader. */
  readonly words: string
  readonly prompt: ListenPromptProps | null
  readonly panel: MusicPanelProps | null
}

/**
 * Session music: one playlist, at the same place on every device at the
 * board (ADR 0017), in the Session pill (`Session`).
 *
 * Mounted for as long as the board is open, because it is also what plays:
 * the player follows the room whether or not the sheet is open, and the
 * offer to listen comes to the person rather than waiting in a sheet nobody
 * knows to open.
 */
export function useMusicSession(
  channel: FacilitationChannel,
  catalogue: Catalogue | null,
  library: MusicService,
  sheetOpen: boolean,
): MusicSession {
  const stored = useSyncExternalStore(channel.subscribe, channel.music)
  const ready = useSyncExternalStore(channel.subscribe, channel.ready)
  const canEdit = useCanEdit()
  const me = useMe()
  const [listening, setListening] = useState<Listening>(readListening)
  const [joined, setJoined] = useState(false)
  const [dismissedRun, setDismissedRun] = useState<number | null>(null)
  const [refusedRun, setRefusedRun] = useState<number | null>(null)
  const runRef = useRef(0)
  const agreed = useRef(readAgreed())
  const announced = useRef<number | null>(null)
  const announce = useInteractionStore((state) => state.announce)
  const player = useRef<MusicPlayer | null>(null)
  const hasLibrary = catalogue !== null

  const genres =
    catalogue === null
      ? []
      : MUSIC_GENRES.filter((genre) => playlistOf(catalogue, genre).length > 0)
  const music = stored ?? stoppedMusic(genres[0] ?? 'ambient-lofi')
  const now = useTick(channel.now, music.status === 'playing')
  const position = positionOf(music, now)
  const track =
    position === null || catalogue === null
      ? undefined
      : catalogue.tracks.find((entry) => entry.id === position.trackId)

  useEffect(() => {
    if (!hasLibrary) return
    const created = new MusicPlayer(() => {
      setJoined(false)
      setRefusedRun(runRef.current)
    })
    player.current = created
    return () => {
      created.destroy()
      player.current = null
    }
  }, [hasLibrary])

  useEffect(() => {
    player.current?.setListening(listening)
    writeListening(listening)
  }, [listening])

  useEffect(() => {
    player.current?.follow(
      position === null || track === undefined
        ? null
        : {
            trackId: position.trackId,
            url: library.trackUrl(position.trackId),
            offsetMs: position.offsetMs,
            playing: music.status === 'playing',
          },
    )
  }, [position, track, music.status, library, joined])

  const join = useCallback((): void => {
    player.current?.join()
    setJoined(true)
  }, [])
  /** A yes said out loud: this device listens, and this browser remembers it. */
  const agree = (): void => {
    agreed.current = true
    writeAgreed()
    join()
  }

  /*
   * Somebody else started the music and this device cannot hear it: a browser
   * makes no sound until somebody here presses something. So it is offered
   * where the person is rather than inside a sheet nobody knows to open — and
   * a browser that has said yes before joins on its own, or on the next press
   * anywhere.
   */
  const unheard = hasLibrary && music.status === 'playing' && !joined
  const asking = hasLibrary && asksToListen(music, joined, dismissedRun) && !sheetOpen

  useEffect(() => {
    runRef.current = music.run
  }, [music.run])

  useEffect(() => {
    if (!unheard || announced.current === music.run) return
    announced.current = music.run
    announce(startedText(music))
  }, [unheard, music, announce])

  const refused = refusedRun === music.run
  useEffect(() => {
    if (!unheard || !agreed.current) return
    if (!refused && 'userActivation' in navigator && navigator.userActivation.hasBeenActive) {
      const soon = setTimeout(join, 0)
      return () => {
        clearTimeout(soon)
      }
    }
    const onPress = (): void => {
      join()
    }
    const options = { capture: true, once: true } as const
    window.addEventListener('pointerdown', onPress, options)
    window.addEventListener('keydown', onPress, options)
    return () => {
      window.removeEventListener('pointerdown', onPress, options)
      window.removeEventListener('keydown', onPress, options)
    }
  }, [unheard, refused, join])

  const active = music.status !== 'stopped'
  const state = unheard ? 'unheard' : music.status
  if (catalogue === null) {
    return {
      shown: false,
      active: false,
      unheard: false,
      state,
      words: '',
      prompt: null,
      panel: null,
    }
  }
  const write = (change: (music: Music, now: number, by: string | null) => Music): void => {
    channel.writeMusic(change(music, channel.now(), me?.name ?? null))
  }
  /*
   * Play and Resume are asking to hear it, and the press that opens audio.
   * Nothing else is: an editor who pauses, skips or stops somebody else's
   * music has not said they want it in this browser (Codex, on #87).
   */
  const start = (): void => {
    agree()
    write((current, at, by) => playMusic(current, at, by, playlistOf(catalogue, current.genre)))
  }
  return {
    shown: canEdit || active,
    active,
    unheard,
    state,
    words: !active
      ? ''
      : `music, ${GENRE_NAMES[music.genre]}, ${music.status === 'playing' ? 'playing' : 'paused'}${unheard ? ', not playing here' : ''}`,
    prompt: asking
      ? {
          text: startedText(music),
          onListen: agree,
          onDismiss: () => {
            setDismissedRun(music.run)
          },
        }
      : null,
    panel: {
      catalogue,
      genres,
      music,
      position,
      track,
      canEdit,
      ready,
      active,
      joined,
      listening,
      setListening,
      write,
      start,
      agree,
    },
  }
}

interface ListenPromptProps {
  readonly text: string
  readonly onListen: () => void
  readonly onDismiss: () => void
}

/** The offer to listen, under the pill: what a browser needs before it makes a sound. */
export function ListenPrompt({ prompt }: { readonly prompt: ListenPromptProps }) {
  /*
   * The prompt never takes the keyboard, but somebody can Tab into it — and
   * both its buttons take it away. So whatever is pressed there, the keyboard
   * goes on to the pill it came from rather than falling to the page, and
   * Escape in it waves it away like the ×.
   */
  const answered = (answer: () => void, from: EventTarget): void => {
    const inside = from instanceof Element && from.contains(document.activeElement)
    answer()
    if (!inside) return
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[data-testid="session-button"]')?.focus()
    })
  }
  return (
    <div
      className="of-notice of-music__prompt"
      role="group"
      aria-label="Music"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        answered(prompt.onDismiss, event.currentTarget)
      }}
    >
      <span className="of-notice__body" data-testid="music-prompt">
        {prompt.text}
      </span>
      <button
        type="button"
        className="of-button of-button--primary"
        data-testid="music-prompt-listen"
        onClick={(event) => {
          answered(prompt.onListen, event.currentTarget)
        }}
      >
        Listen
      </button>
      <button
        type="button"
        className="of-icon-button"
        aria-label="Dismiss"
        data-tip="Dismiss"
        data-testid="music-prompt-dismiss"
        onClick={(event) => {
          answered(prompt.onDismiss, event.currentTarget)
        }}
      >
        <CloseIcon />
      </button>
    </div>
  )
}

interface MusicPanelProps {
  readonly catalogue: Catalogue
  readonly genres: readonly MusicGenre[]
  readonly music: Music
  readonly position: ReturnType<typeof positionOf>
  readonly track: Catalogue['tracks'][number] | undefined
  readonly canEdit: boolean
  readonly ready: boolean
  readonly active: boolean
  readonly joined: boolean
  readonly listening: Listening
  readonly setListening: (change: (current: Listening) => Listening) => void
  readonly write: (change: (music: Music, now: number, by: string | null) => Music) => void
  readonly start: () => void
  readonly agree: () => void
}

/** The music's part of the Session sheet. */
export function MusicPanel({ panel }: { readonly panel: MusicPanelProps }) {
  const {
    catalogue,
    genres,
    music,
    position,
    track,
    canEdit,
    ready,
    active,
    joined,
    listening,
    setListening,
    write,
    start,
    agree,
  } = panel
  const state = music.status
  const choose = (genre: (typeof genres)[number]): void => {
    write((current, at, by) => setGenre(current, genre, at, by, playlistOf(catalogue, genre)))
  }
  return (
    <>
      <div
        className="of-music__genres"
        role="radiogroup"
        aria-label="Genre"
        /*
         * A radio group is ONE stop, walked with the arrows, which choose as
         * they go — as the record panel's swatches are. Each genre was its
         * own Tab stop and the arrows did nothing.
         */
        onKeyDown={(event) => {
          const step =
            event.key === 'ArrowRight' || event.key === 'ArrowDown'
              ? 1
              : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                ? -1
                : 0
          if (step === 0) return
          event.preventDefault()
          const at = genres.indexOf(music.genre)
          const next = genres[(at + step + genres.length) % genres.length]
          if (next === undefined) return
          choose(next)
          event.currentTarget.querySelector<HTMLElement>(`[data-genre="${next}"]`)?.focus()
        }}
      >
        {genres.map((genre, index) => (
          <button
            key={genre}
            type="button"
            role="radio"
            className="of-button of-music__genre"
            data-genre={genre}
            aria-checked={music.genre === genre}
            tabIndex={
              music.genre === genre || (!genres.includes(music.genre) && index === 0) ? 0 : -1
            }
            disabled={!canEdit || !ready}
            onClick={() => {
              choose(genre)
            }}
          >
            {GENRE_NAMES[genre]}
          </button>
        ))}
      </div>

      {position !== null && track !== undefined && (
        <p className="of-music__now" data-testid="music-now">
          <span className="of-music__title">{track.title}</span>
          <span className="of-music__credit">{track.artist} · CC0</span>
          <span className="of-music__elapsed" data-testid="music-elapsed">
            {elapsedText(position.offsetMs)} / {clockText(position.durationMs)}
          </span>
        </p>
      )}

      {canEdit && (
        <div className="of-music__actions">
          {active && (
            <button
              type="button"
              className="of-icon-button"
              aria-label="Previous track"
              data-tip="Previous track"
              data-testid="music-previous"
              disabled={!ready}
              onClick={() => {
                write((current, at, by) => skipMusic(current, at, by, -1))
              }}
            >
              <PreviousTrackIcon />
            </button>
          )}
          {state === 'playing' ? (
            <button
              type="button"
              className="of-button"
              data-testid="music-pause"
              disabled={!ready}
              onClick={() => {
                write(pauseMusic)
              }}
            >
              Pause
            </button>
          ) : (
            <button
              type="button"
              className="of-button of-button--primary"
              data-testid="music-play"
              disabled={!ready}
              onClick={start}
            >
              {state === 'paused' ? 'Resume' : 'Play'}
            </button>
          )}
          {active && (
            <button
              type="button"
              className="of-icon-button"
              aria-label="Next track"
              data-tip="Next track"
              data-testid="music-next"
              disabled={!ready}
              onClick={() => {
                write((current, at, by) => skipMusic(current, at, by, 1))
              }}
            >
              <NextTrackIcon />
            </button>
          )}
          {active && (
            <button
              type="button"
              className="of-button of-button--ghost"
              data-testid="music-stop"
              disabled={!ready}
              onClick={() => {
                write(stopMusic)
              }}
            >
              Stop
            </button>
          )}
        </div>
      )}

      {/*
       * This device's sound, never the room's. "Listen here" is the press
       * a browser needs before it will make a sound — for somebody who
       * did not start the music themselves, there is no other.
       */}
      <div className="of-music__device">
        {!joined && active ? (
          <button type="button" className="of-button" data-testid="music-listen" onClick={agree}>
            Listen here
          </button>
        ) : (
          <>
            <button
              type="button"
              className="of-button of-button--ghost"
              data-testid="music-mute"
              aria-pressed={listening.muted}
              onClick={() => {
                setListening((current) => ({ ...current, muted: !current.muted }))
              }}
            >
              Mute
            </button>
            <label className="of-music__volume">
              <span className="of-music__volume-label">Volume</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round(listening.volume * 100)}
                data-testid="music-volume"
                onChange={(event) => {
                  const volume = Number(event.target.value) / 100
                  setListening((current) => ({ ...current, volume }))
                }}
              />
            </label>
          </>
        )}
      </div>
    </>
  )
}

/** The room's time, re-read once a second while the music plays, and not at all otherwise. */
function useTick(now: () => number, ticking: boolean): number {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!ticking) return
    const id = setInterval(() => {
      setTick((tick) => tick + 1)
    }, FOLLOW_MS)
    return () => {
      clearInterval(id)
    }
  }, [ticking])
  return now()
}
