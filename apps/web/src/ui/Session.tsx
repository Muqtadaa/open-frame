import { useEffect, useId, useRef } from 'react'

import { AnchoredSurface } from '../controls/AnchoredSurface.js'
import { MusicIcon, TimerIcon } from '../controls/icons.js'
import { useAnchoredTo } from '../controls/use-anchor.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { useOpenFrame } from '../runtime/context.js'
import type { FacilitationChannel } from '../runtime/facilitation.js'
import { useServices } from '../runtime/services.js'
import { formatKeys } from '../scene/shortcuts.js'
import { ListenPrompt, MusicPanel, useCatalogue, useMusicSession } from './SessionMusic.js'
import { TimerPanel, useTimerSession } from './SessionTimer.js'
import { useSheet } from './use-sheet.js'

/**
 * The session: its timer and its music, as one pill beside the people.
 *
 * They were two icons on the bar, a clock and a note, each with a sheet of
 * its own — two controls for one thing, the session that is running on this
 * board, as opposed to the board itself. At rest the pill says "Session";
 * while anything runs it says what — "24:59 · ♪" — so the time is readable
 * from across the room without opening anything. Alt+T opens it.
 *
 * Absent for somebody who can only watch until there is something to watch.
 */
export function Session() {
  const { facilitation } = useOpenFrame()
  const asked = useInteractionStore((state) => state.sessionOpen)
  const setOpen = useInteractionStore((state) => state.setSessionOpen)
  useNotLeftAsked(facilitation === undefined && asked, setOpen)
  if (facilitation === undefined) return null
  return <SessionControl channel={facilitation} />
}

const KEYS = 'Alt+T'

function SessionControl({ channel }: { readonly channel: FacilitationChannel }) {
  const { music: library } = useServices()
  const open = useInteractionStore((state) => state.sessionOpen)
  const setOpen = useInteractionStore((state) => state.setSessionOpen)
  const { ref: button, anchor, surface } = useAnchoredTo<HTMLButtonElement>(open)
  const sheet = useRef<HTMLDivElement>(null)
  const timerHeading = useId()
  const musicHeading = useId()

  const catalogue = useCatalogue()
  const timer = useTimerSession(channel, button)
  const music = useMusicSession(channel, catalogue, library, open)

  const {
    ref: promptAnchorRef,
    anchor: promptAnchor,
    surface: promptSurface,
  } = useAnchoredTo<HTMLDivElement>(music.prompt !== null)

  useSheet({
    open,
    placed: anchor !== null,
    setOpen,
    sheet,
    button,
    first: '[data-testid="timer-start"]',
  })

  const hidden = !timer.shown && !music.shown
  useNotLeftAsked(hidden && open, setOpen)
  if (hidden) return null

  const running = timer.active || music.active
  const said = [timer.active ? `timer, ${timer.words}` : '', music.words].filter(
    (part) => part !== '',
  )
  const name = said.length === 0 ? 'Session' : `Session, ${said.join(', ')}`

  return (
    <div className="of-session" ref={promptAnchorRef}>
      <button
        ref={button}
        type="button"
        className={[
          'of-timer__button',
          'of-session__pill',
          running ? 'is-active' : '',
          timer.done ? 'is-done' : '',
        ].join(' ')}
        aria-label={name}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-keyshortcuts={KEYS}
        data-tip={`Session (${formatKeys(KEYS)})`}
        aria-description={`Session (${formatKeys(KEYS)})`}
        data-testid="session-button"
        data-timer={timer.done ? 'done' : timer.status}
        data-music={music.state}
        onClick={() => {
          setOpen(!open)
        }}
      >
        {!running && (
          <>
            <TimerIcon />
            <span className="of-session__word">Session</span>
          </>
        )}
        {timer.active && (
          <>
            <TimerIcon className="of-session__clock" />
            <span className="of-timer__time" data-testid="session-time">
              {timer.time}
            </span>
          </>
        )}
        {timer.active && music.active && (
          <span className="of-session__dot" aria-hidden="true">
            ·
          </span>
        )}
        {music.active && <MusicIcon />}
      </button>

      {music.prompt !== null && (
        <AnchoredSurface
          anchor={promptAnchor}
          surface={promptSurface}
          prefer={['below', 'above']}
          testId="music-prompt-surface"
        >
          <ListenPrompt prompt={music.prompt} />
        </AnchoredSurface>
      )}

      {open && (
        <AnchoredSurface
          anchor={anchor}
          surface={surface}
          prefer={['below', 'above']}
          testId="session-surface"
        >
          <div
            ref={sheet}
            className="of-session__sheet"
            role="dialog"
            aria-label="Session"
            tabIndex={-1}
          >
            {timer.shown && (
              <section className="of-session__section" aria-labelledby={timerHeading}>
                <h2 className="of-session__heading" id={timerHeading}>
                  Timer
                </h2>
                <TimerPanel panel={timer.panel} />
              </section>
            )}
            {music.shown && music.panel !== null && (
              <section className="of-session__section" aria-labelledby={musicHeading}>
                <h2 className="of-session__heading" id={musicHeading}>
                  Music
                </h2>
                <MusicPanel panel={music.panel} />
              </section>
            )}
          </div>
        </AnchoredSurface>
      )}
    </div>
  )
}

/**
 * Alt+T asks for the sheet whether or not there is a pill to open it from. With
 * none — a viewer with nothing running — the ask is put down at once rather
 * than left in the store, where it opened the sheet and took the keyboard the
 * moment somebody else started a timer (Codex, on #89).
 */
function useNotLeftAsked(stranded: boolean, setOpen: (open: boolean) => void): void {
  useEffect(() => {
    if (stranded) setOpen(false)
  }, [stranded, setOpen])
}
