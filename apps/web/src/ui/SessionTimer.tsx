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
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { AnchoredSurface } from '../controls/AnchoredSurface.js'
import { TimerIcon } from '../controls/icons.js'
import { useAnchoredTo } from '../controls/use-anchor.js'
import { useCanEdit } from '../hooks/use-can-edit.js'
import { useMe } from '../hooks/use-me.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { useOpenFrame } from '../runtime/context.js'
import type { FacilitationChannel } from '../runtime/facilitation.js'
import { chime, primeAudio } from './chime.js'
import { clockText, parseClock } from './clock-text.js'
import { useSheet } from './use-sheet.js'

/** Minutes, because that is how an exercise is planned. */
const PRESETS = [1, 3, 5, 10, 15] as const
const MINUTE = 60_000
/** Often enough that the seconds never visibly stick; the clock itself is never this. */
const TICK_MS = 250

/**
 * The session timer: one countdown for everybody at the board (ADR 0017).
 *
 * On the bar, beside the people, because it is the same kind of thing — about
 * the session rather than the board. It reads the same on every device to the
 * second: a shared board's runs on the room's clock, and "done" is worked out
 * from that clock rather than stored.
 *
 * Absent for somebody who can only watch until there is something to watch: a
 * control a viewer cannot use, for a timer nobody has started, is noise.
 */
export function SessionTimer() {
  const { facilitation } = useOpenFrame()
  if (facilitation === undefined) return null
  return <TimerControl channel={facilitation} />
}

function TimerControl({ channel }: { readonly channel: FacilitationChannel }) {
  const stored = useSyncExternalStore(channel.subscribe, channel.timer)
  const ready = useSyncExternalStore(channel.subscribe, channel.ready)
  const canEdit = useCanEdit()
  const me = useMe()
  const announce = useInteractionStore((s) => s.announce)
  const [open, setOpen] = useState(false)
  const { ref: button, anchor, surface } = useAnchoredTo<HTMLButtonElement>(open)
  const sheet = useRef<HTMLDivElement>(null)

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
      // Where the chime cannot sound, the bar flashes in its place. On the
      // element directly: it is a one-off effect, not state anything renders from.
      if (!chime()) button.current?.classList.add('is-flashing')
      return
    }
    if (lastMinute && heard.current.warned !== timer.run && timer.durationMs > MINUTE) {
      heard.current.warned = timer.run
      announce('1 minute left')
    }
    if (!done) button.current?.classList.remove('is-flashing')
  }, [timer.run, timer.durationMs, lastMinute, done, announce, button])

  // Audio may only be opened by a press; any press on the page will do.
  useEffect(() => {
    if (!active) return
    document.addEventListener('pointerdown', primeAudio, { once: true, capture: true })
    return () => {
      document.removeEventListener('pointerdown', primeAudio, { capture: true })
    }
  }, [active])

  useSheet({
    open,
    placed: anchor !== null,
    setOpen,
    sheet,
    button,
    first: '[data-testid="timer-start"]',
  })

  if (!canEdit && !active) return null

  const write = (next: Timer): void => {
    primeAudio()
    if (next !== timer || stored === null) channel.writeTimer(next)
  }
  const by = me?.name ?? null
  const time = clockText(left)
  const label = !active ? 'Timer' : done ? 'Timer, time’s up' : `Timer, ${time} left`

  return (
    <div className="of-timer">
      <button
        ref={button}
        type="button"
        className={['of-timer__button', active ? 'is-active' : '', done ? 'is-done' : ''].join(' ')}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        {...(active ? {} : { 'data-tip': label })}
        data-testid="timer-button"
        data-state={done ? 'done' : timer.status}
        onClick={() => {
          setOpen((current) => !current)
        }}
      >
        <TimerIcon />
        {active && <span className="of-timer__time">{time}</span>}
      </button>

      {open && (
        <AnchoredSurface
          anchor={anchor}
          surface={surface}
          prefer={['below', 'above']}
          testId="timer-surface"
        >
          <div
            ref={sheet}
            className="of-timer__sheet"
            role="dialog"
            aria-label="Timer"
            tabIndex={-1}
          >
            <output className="of-timer__readout" data-testid="timer-readout">
              {done ? 'Time’s up' : time}
            </output>
            {timer.by !== null && stored !== null && (
              <span className="of-timer__by" data-testid="timer-by">
                {STATUS_WORDS[timer.status]} by {timer.by}
              </span>
            )}
            {canEdit && (
              <TimerActions
                timer={timer}
                done={done}
                ready={ready}
                onWrite={(change) => {
                  write(change(timer, channel.now(), by))
                }}
              />
            )}
          </div>
        </AnchoredSurface>
      )}
    </div>
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
        {timer.status === 'idle' && (
          <button
            type="button"
            className="of-button of-button--primary"
            data-testid="timer-start"
            disabled={!ready}
            onClick={() => {
              onWrite(startTimer)
            }}
          >
            Start
          </button>
        )}
        {timer.status === 'running' && !done && (
          <button
            type="button"
            className="of-button"
            data-testid="timer-pause"
            disabled={!ready}
            onClick={() => {
              onWrite(pauseTimer)
            }}
          >
            Pause
          </button>
        )}
        {timer.status === 'paused' && (
          <button
            type="button"
            className="of-button of-button--primary"
            data-testid="timer-resume"
            disabled={!ready}
            onClick={() => {
              onWrite(resumeTimer)
            }}
          >
            Resume
          </button>
        )}
        {timer.status !== 'idle' && (
          <button
            type="button"
            className="of-button"
            data-testid="timer-add-minute"
            disabled={!ready}
            aria-label="Add a minute"
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
            }}
          >
            Reset
          </button>
        )}
      </div>
    </>
  )
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
