import {
  addMinute,
  idleTimer,
  isDone,
  pauseTimer,
  remainingOf,
  resetTimer,
  resumeTimer,
  setDuration,
  startTimer,
  type SessionTimer as Timer,
} from '@openframe/core/facilitation'
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'

import { useCanEdit } from '../hooks/use-can-edit.js'
import { useMe } from '../hooks/use-me.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import type { FacilitationChannel } from '../runtime/facilitation.js'
import { chime, primeAudio } from './chime.js'
import { clockText, parseClock } from './clock-text.js'

/** Minutes, because that is how an exercise is planned. */
const PRESETS = [1, 3, 5, 10, 15] as const
const MINUTE = 60_000
/** Often enough that the seconds never visibly stick; the clock itself is never this. */
const TICK_MS = 250

export interface TimerSession {
  /** Whether there is anything here for this person: an editor, or a timer to watch. */
  readonly shown: boolean
  /** Set, running or paused: something the pill should say. */
  readonly active: boolean
  readonly done: boolean
  readonly status: Timer['status']
  /** What is left, as the pill and the sheet print it. */
  readonly time: string
  /** What the pill says about the timer to a screen reader. */
  readonly words: string
  readonly panel: TimerPanelProps
}

/**
 * The session timer: one countdown for everybody at the board (ADR 0017),
 * in the Session pill (`Session`).
 *
 * It reads the same on every device to the second: a shared board's runs on
 * the room's clock, and "done" is worked out from that clock rather than
 * stored. Mounted for as long as the board is open, sheet or no sheet,
 * because it is also what says "1 minute left" and chimes at the end.
 *
 * `flash` is what flashes where the chime cannot sound.
 */
export function useTimerSession(
  channel: FacilitationChannel,
  flash: RefObject<HTMLElement | null>,
): TimerSession {
  const stored = useSyncExternalStore(channel.subscribe, channel.timer)
  const ready = useSyncExternalStore(channel.subscribe, channel.ready)
  const canEdit = useCanEdit()
  const me = useMe()
  const announce = useInteractionStore((s) => s.announce)

  const timer = stored ?? idleTimer()
  const now = useClock(channel.now, timer.status === 'running')
  const left = remainingOf(timer, now)
  const done = isDone(timer, now)
  const active = timer.status !== 'idle'

  /*
   * Said once per run, on every device, at the moment it happens — never on
   * opening a board whose timer ran out an hour ago. So the first reading is
   * taken as already heard, and only a change from it is news.
   *
   * Remembered by RUN, not by the last reading: adding a minute to a run that
   * has warned takes it back above the minute without making it a new run,
   * and a check against the reading before said it a second time on the way
   * back down (Codex, on #63).
   */
  const heard = useRef<{ warned: number | null; finished: number | null } | null>(null)
  const lastMinute = timer.status === 'running' && left <= MINUTE
  useEffect(() => {
    if (heard.current === null) {
      heard.current = {
        warned: lastMinute ? timer.run : null,
        finished: done ? timer.run : null,
      }
      return
    }
    if (done && heard.current.finished !== timer.run) {
      heard.current.finished = timer.run
      announce('Time’s up')
      // Where the chime cannot sound, the pill flashes in its place. On the
      // element directly: it is a one-off effect, not state anything renders from.
      if (!chime()) flash.current?.classList.add('is-flashing')
      return
    }
    if (lastMinute && heard.current.warned !== timer.run && timer.durationMs > MINUTE) {
      heard.current.warned = timer.run
      announce('1 minute left')
    }
    if (!done) flash.current?.classList.remove('is-flashing')
  }, [timer.run, timer.durationMs, lastMinute, done, announce, flash])

  // Audio may only be opened by a press; any press on the page will do.
  useEffect(() => {
    if (!active) return
    document.addEventListener('pointerdown', primeAudio, { once: true, capture: true })
    return () => {
      document.removeEventListener('pointerdown', primeAudio, { capture: true })
    }
  }, [active])

  const by = me?.name ?? null
  const time = clockText(left)
  return {
    shown: canEdit || active,
    active,
    done,
    status: timer.status,
    time,
    // What the pill shows is in its name: "0:00" was drawn while "time's up" was said.
    words: !active ? '' : done ? `${time}, time’s up` : `${time} left`,
    panel: {
      timer,
      stored: stored !== null,
      done,
      time,
      ready,
      canEdit,
      onWrite: (change) => {
        primeAudio()
        const next = change(timer, channel.now(), by)
        if (next !== timer || stored === null) channel.writeTimer(next)
      },
    },
  }
}

interface TimerPanelProps {
  readonly timer: Timer
  /** Whether anybody has ever set it, so there is somebody to name. */
  readonly stored: boolean
  readonly done: boolean
  readonly time: string
  readonly ready: boolean
  readonly canEdit: boolean
  readonly onWrite: (change: Change) => void
}

/** The timer's part of the Session sheet. */
export function TimerPanel({ panel }: { readonly panel: TimerPanelProps }) {
  const { timer, stored, done, time, ready, canEdit, onWrite } = panel
  return (
    <>
      <output className="of-timer__readout" data-testid="timer-readout">
        {done ? 'Time’s up' : time}
      </output>
      {timer.by !== null && stored && (
        <span className="of-timer__by" data-testid="timer-by">
          {STATUS_WORDS[timer.status]} by {timer.by}
        </span>
      )}
      {canEdit && <TimerActions timer={timer} done={done} ready={ready} onWrite={onWrite} />}
    </>
  )
}

const STATUS_WORDS: Readonly<Record<Timer['status'], string>> = {
  idle: 'Set',
  running: 'Started',
  paused: 'Paused',
}

type Change = (timer: Timer, now: number, by: string | null) => Timer

function TimerActions({
  timer,
  done,
  ready,
  onWrite,
}: {
  readonly timer: Timer
  readonly done: boolean
  /**
   * Whether the room has said what time it is. Every action below writes a
   * time, and one written on this device's clock before then stays wrong for
   * everybody (Codex, on #63) — so they wait, for the one round trip it takes.
   */
  readonly ready: boolean
  readonly onWrite: (change: Change) => void
}) {
  const minutes = timer.durationMs / MINUTE
  const step = stepFor(timer, done)
  const stepRef = useRef<HTMLButtonElement>(null)
  const focusStep = useRef(false)
  useEffect(() => {
    if (!focusStep.current || stepRef.current === null) return
    focusStep.current = false
    stepRef.current.focus()
  })
  return (
    <>
      {timer.status === 'idle' && (
        <>
          <div className="of-timer__presets" role="group" aria-label="Duration">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className="of-button of-timer__preset"
                aria-pressed={minutes === preset}
                aria-label={`${String(preset)} ${preset === 1 ? 'minute' : 'minutes'}`}
                onClick={() => {
                  onWrite((t, now, by) => setDuration(t, preset * MINUTE, now, by))
                }}
              >
                {preset}
              </button>
            ))}
          </div>
          <DurationField
            durationMs={timer.durationMs}
            onChange={(ms) => {
              onWrite((t, now, by) => setDuration(t, ms, now, by))
            }}
          />
        </>
      )}
      <div className="of-timer__actions">
        {step !== null && (
          /*
           * ONE button that says what pressing it next will do. Start, Pause
           * and Resume were three, so the one pressed left the page as it took
           * effect and the keyboard landed on nothing.
           */
          <button
            ref={stepRef}
            type="button"
            className={step.primary ? 'of-button of-button--primary' : 'of-button'}
            data-testid={step.testid}
            disabled={!ready}
            onClick={() => {
              onWrite(step.change)
            }}
          >
            {step.words}
          </button>
        )}
        {timer.status !== 'idle' && (
          <button
            type="button"
            className="of-button"
            data-testid="timer-add-minute"
            disabled={!ready}
            onClick={() => {
              onWrite(addMinute)
            }}
          >
            +1 min
          </button>
        )}
        {timer.status !== 'idle' && (
          <button
            type="button"
            className="of-button of-button--ghost"
            data-testid="timer-reset"
            disabled={!ready}
            onClick={() => {
              onWrite(resetTimer)
              // Reset takes itself away; Start is where the keyboard goes next.
              focusStep.current = true
            }}
          >
            Reset
          </button>
        )}
      </div>
    </>
  )
}

interface Step {
  readonly words: string
  readonly testid: string
  readonly primary: boolean
  readonly change: Change
}

/** What the one start/pause/resume button does now, or nothing once time is up. */
function stepFor(timer: Timer, done: boolean): Step | null {
  if (timer.status === 'idle')
    return { words: 'Start', testid: 'timer-start', primary: true, change: startTimer }
  if (timer.status === 'paused')
    return { words: 'Resume', testid: 'timer-resume', primary: true, change: resumeTimer }
  if (!done) return { words: 'Pause', testid: 'timer-pause', primary: false, change: pauseTimer }
  return null
}

/**
 * The duration as typed, committed on Enter or on leaving the field. Anything
 * unreadable is put back rather than guessed at.
 */
function DurationField({
  durationMs,
  onChange,
}: {
  readonly durationMs: number
  readonly onChange: (ms: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = (): void => {
    if (draft === null) return
    const ms = parseClock(draft)
    setDraft(null)
    if (ms !== null && ms > 0) onChange(ms)
  }
  return (
    <label className="of-timer__field">
      <span className="of-timer__field-label">Duration</span>
      <input
        className="of-input of-timer__input"
        data-testid="timer-duration"
        inputMode="numeric"
        value={draft ?? clockText(durationMs)}
        aria-description="Minutes, or m:ss"
        onChange={(event) => {
          setDraft(event.target.value)
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          commit()
        }}
      />
    </label>
  )
}

/**
 * The time to show, re-read a few times a second while the timer runs and not
 * at all while it does not — a paused or idle timer has nothing to tick.
 */
function useClock(now: () => number, ticking: boolean): number {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!ticking) return
    const id = setInterval(() => {
      setTick((tick) => tick + 1)
    }, TICK_MS)
    return () => {
      clearInterval(id)
    }
  }, [ticking])
  // Read on every render: a change to the timer re-renders, and must not show a stale time.
  return now()
}
