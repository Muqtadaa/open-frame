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

import { AnchoredSurface } from '../controls/AnchoredSurface.js'
import { CloseIcon, MusicIcon, NextTrackIcon, PreviousTrackIcon } from '../controls/icons.js'
import { useAnchoredTo } from '../controls/use-anchor.js'
import { useCanEdit } from '../hooks/use-can-edit.js'
import { useMe } from '../hooks/use-me.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { useOpenFrame } from '../runtime/context.js'
import type { FacilitationChannel } from '../runtime/facilitation.js'
import { useServices, type MusicService } from '../runtime/services.js'
import { MusicPlayer, readListening, writeListening, type Listening } from './music-player.js'
import { asksToListen, readAgreed, startedText, writeAgreed } from './music-listen.js'
import { clockText, elapsedText } from './clock-text.js'
import { useSheet } from './use-sheet.js'

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
 * Session music: one playlist, at the same place on every device at the board
 * (ADR 0017). On the bar beside the timer, because it is the same kind of
 * thing — about the session, not the board.
 *
 * Absent where there is no library to play from — no room server, or nothing
 * approved in it yet. A button for music that cannot play would be a promise
 * the product does not keep.
 */
export function SessionMusic() {
  const { facilitation } = useOpenFrame()
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

  if (facilitation === undefined || catalogue === null || catalogue.tracks.length === 0) return null
  return <MusicControl channel={facilitation} catalogue={catalogue} library={music} />
}

function MusicControl({
  channel,
  catalogue,
  library,
}: {
  readonly channel: FacilitationChannel
  readonly catalogue: Catalogue
  readonly library: MusicService
}) {
  const stored = useSyncExternalStore(channel.subscribe, channel.music)
  const ready = useSyncExternalStore(channel.subscribe, channel.ready)
  const canEdit = useCanEdit()
  const me = useMe()
  const [open, setOpen] = useState(false)
  const { ref: button, anchor, surface } = useAnchoredTo<HTMLButtonElement>(open)
  const sheet = useRef<HTMLDivElement>(null)
  const [listening, setListening] = useState<Listening>(readListening)
  const [joined, setJoined] = useState(false)
  const [dismissedRun, setDismissedRun] = useState<number | null>(null)
  const agreed = useRef(readAgreed())
  const announced = useRef<number | null>(null)
  const announce = useInteractionStore((state) => state.announce)
  const player = useRef<MusicPlayer | null>(null)

  const genres = MUSIC_GENRES.filter((genre) => playlistOf(catalogue, genre).length > 0)
  const music = stored ?? stoppedMusic(genres[0] ?? 'ambient-lofi')
  const now = useTick(channel.now, music.status === 'playing')
  const position = positionOf(music, now)
  // The record says WHICH track; the catalogue only says what it is called.
  const track =
    position === null ? undefined : catalogue.tracks.find((entry) => entry.id === position.trackId)

  // One player for the life of the control, so the music outlives the sheet.
  useEffect(() => {
    const created = new MusicPlayer(() => {
      setJoined(false)
    })
    player.current = created
    return () => {
      created.destroy()
      player.current = null
    }
  }, [])

  useEffect(() => {
    player.current?.setListening(listening)
    writeListening(listening)
  }, [listening])

  // Follows the room on every tick: the right track, the right second.
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

  useSheet({ open, placed: anchor !== null, setOpen, sheet, button })

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
   * here rather than inside a sheet nobody knows to open — and a browser that
   * has said yes before joins on its own, or on the next press anywhere.
   */
  const unheard = music.status === 'playing' && !joined
  const asking = asksToListen(music, joined, dismissedRun) && !open
  const {
    ref: promptRef,
    anchor: promptAnchor,
    surface: promptSurface,
  } = useAnchoredTo<HTMLDivElement>(asking)

  useEffect(() => {
    if (!unheard || announced.current === music.run) return
    announced.current = music.run
    announce(startedText(music))
  }, [unheard, music, announce])

  useEffect(() => {
    if (!unheard || !agreed.current) return
    // A page that has been pressed already may make a sound: Chrome and
    // Firefox say so. Where the browser still refuses, the player says so and
    // the prompt comes back.
    if ('userActivation' in navigator && navigator.userActivation.hasBeenActive) {
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
  }, [unheard, join])

  const active = music.status !== 'stopped'
  if (!canEdit && !active) return null
  const write = (change: (music: Music, now: number, by: string | null) => Music): void => {
    // Pressing play is also asking to hear it, and the press that opens audio.
    agree()
    channel.writeMusic(change(music, channel.now(), me?.name ?? null))
  }
  const state = music.status
  const label =
    state === 'stopped'
      ? 'Music'
      : `Music, ${GENRE_NAMES[music.genre]}, ${state === 'playing' ? 'playing' : 'paused'}${unheard ? ', not playing here' : ''}`

  return (
    <div className="of-music" ref={promptRef}>
      <button
        ref={button}
        type="button"
        className={`of-music__button${active ? ' is-active' : ''}`}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-tip={label}
        data-testid="music-button"
        data-state={unheard ? 'unheard' : state}
        onClick={() => {
          setOpen((current) => !current)
        }}
      >
        <MusicIcon />
      </button>

      {asking && (
        <AnchoredSurface
          anchor={promptAnchor}
          surface={promptSurface}
          prefer={['below', 'above']}
          testId="music-prompt-surface"
        >
          <div className="of-notice of-music__prompt" role="group" aria-label="Music">
            <span className="of-notice__body" data-testid="music-prompt">
              {startedText(music)}
            </span>
            <button
              type="button"
              className="of-button of-button--primary"
              data-testid="music-prompt-listen"
              onClick={agree}
            >
              Listen
            </button>
            <button
              type="button"
              className="of-icon-button"
              aria-label="Dismiss"
              data-tip="Dismiss"
              data-testid="music-prompt-dismiss"
              onClick={() => {
                setDismissedRun(music.run)
              }}
            >
              <CloseIcon />
            </button>
          </div>
        </AnchoredSurface>
      )}

      {open && (
        <AnchoredSurface
          anchor={anchor}
          surface={surface}
          prefer={['below', 'above']}
          testId="music-surface"
        >
          <div
            ref={sheet}
            className="of-music__sheet"
            role="dialog"
            aria-label="Music"
            tabIndex={-1}
          >
            <div className="of-music__genres" role="radiogroup" aria-label="Genre">
              {genres.map((genre) => (
                <button
                  key={genre}
                  type="button"
                  role="radio"
                  className="of-button of-music__genre"
                  aria-checked={music.genre === genre}
                  disabled={!canEdit || !ready}
                  onClick={() => {
                    write((current, at, by) =>
                      setGenre(current, genre, at, by, playlistOf(catalogue, genre)),
                    )
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
                    onClick={() => {
                      write((current, at, by) =>
                        playMusic(current, at, by, playlistOf(catalogue, current.genre)),
                      )
                    }}
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
                <button
                  type="button"
                  className="of-button"
                  data-testid="music-listen"
                  onClick={agree}
                >
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
          </div>
        </AnchoredSurface>
      )}
    </div>
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
