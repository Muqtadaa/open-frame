import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'

import { useEscapeToClose } from '../controls/escape-stack.js'
import { wrapTab } from '../controls/wrap-tab.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { useServices, type AiRefusal } from '../runtime/services.js'
import { focusTheBoard } from './hand-back-focus.js'

/*
 * What every AI sheet along the top of the board shares (ADR 0018, ADR 0022):
 * say what will be sent and to whom, ask once, show what came back to look
 * over, and write nothing until Apply. Clustering and summarising differ only
 * in the request and in the form their answer is reviewed in, so those are
 * all a sheet supplies.
 */

/** Why there is nothing to review: the server's reasons, and the two the browser finds first. */
export type AiWhy = AiRefusal | 'too-few' | 'too-many'

/** What each refusal says. Facts, and the one thing that would change it. */
export function aiRefusals(
  verb: 'cluster' | 'summarise',
  least: number,
): Readonly<Record<AiWhy, string>> {
  const gerund = verb === 'cluster' ? 'Clustering' : 'Summarising'
  return {
    'signed-out': 'AI needs an account',
    unconfigured: 'AI is not set up on this server',
    'too-large': 'Too much text to send at once',
    'too-many': 'Too many notes to send at once',
    'too-few': `${gerund} takes at least ${String(least)} notes with text`,
    invalid: 'The answer did not match the notes',
    unreachable: 'The AI could not be reached',
    limit: 'No AI runs left today',
    declined: `The AI declined to ${verb} these notes`,
    failed: 'The AI did not finish',
  }
}

export type AiAnswer<Result> =
  | { readonly kind: 'answer'; readonly result: Result; readonly remaining: number }
  | { readonly kind: 'refused'; readonly why: AiRefusal }

type Stage<Result> =
  | { readonly kind: 'confirm' }
  | { readonly kind: 'asking' }
  | { readonly kind: 'review'; readonly result: Result; readonly remaining: number }
  | { readonly kind: 'refused'; readonly why: AiWhy }

export interface AiSheetProps<Result> {
  /** Names the sheet's test ids: `<name>-review`, `<name>-ask`, … */
  readonly name: string
  readonly heading: string
  /** The button that asks: "Cluster", "Summarise". */
  readonly verb: string
  /** Said while asking: "Clustering 4 notes…". */
  readonly asking: string
  /** What is sent, and to whom, said before anything is. */
  readonly confirm: string
  readonly refusals: Readonly<Record<AiWhy, string>>
  /** A refusal found before asking — too few notes — or null. */
  readonly refusedAtOpen: AiWhy | null
  readonly ask: (accessToken: string, signal: AbortSignal) => Promise<AiAnswer<Result>>
  /** Takes the sheet out of the store. */
  readonly onClose: () => void
  /** The answer, to look over; `close` hands the keyboard back to the board. */
  readonly review: (result: Result, remaining: number, close: () => void) => ReactNode
}

export function AiSheet<Result>(props: AiSheetProps<Result>) {
  const services = useServices()
  const { onClose } = props
  /*
   * Closing hands the keyboard to the board — the selection, or after Apply
   * what was made — rather than dropping it on the page with the sheet.
   */
  const close = useCallback(() => {
    onClose()
    focusTheBoard()
  }, [onClose])

  /*
   * Escape closes the sheet from ANYWHERE while it is open, and only the
   * sheet. Heard only inside it, an Escape pressed once focus had moved to the
   * board went to the keymap instead: the selection was cleared and the sheet
   * stayed open, describing notes that were no longer selected.
   *
   * But the first Escape in a FIELD only leaves the field: a title half
   * retyped was thrown away, with the whole answer, by the key people press
   * to stop typing. The sheet keeps the keyboard, and the next Escape closes.
   */
  const panel = useRef<HTMLElement>(null)
  useEscapeToClose(() => {
    const active = window.document.activeElement
    if (
      (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) &&
      panel.current?.contains(active) === true
    ) {
      panel.current.focus()
      return
    }
    close()
  })
  const headingId = useId()
  const asking = useRef<AbortController | null>(null)
  const [stage, setStage] = useState<Stage<Result>>(
    props.refusedAtOpen === null
      ? { kind: 'confirm' }
      : { kind: 'refused', why: props.refusedAtOpen },
  )

  // Each stage puts the keyboard on its first control.
  useEffect(() => {
    panel.current?.querySelector<HTMLElement>('input, textarea, button')?.focus()
  }, [stage.kind])

  // Closing while asking stops the request; nothing comes back to apply.
  useEffect(
    () => () => {
      asking.current?.abort()
    },
    [],
  )

  const ask = async (): Promise<void> => {
    /*
     * Busy, and cancellable, BEFORE the first await. The account lookup is a
     * wait during which the button was still there: a double-click asked
     * twice and spent two runs, and closing the sheet mid-lookup could not
     * stop a request whose controller did not exist yet (Codex, on #67).
     */
    if (props.refusedAtOpen !== null || asking.current !== null) return
    const controller = new AbortController()
    asking.current = controller
    setStage({ kind: 'asking' })
    try {
      const identity = services.accounts.enabled ? await services.accounts.current() : null
      if (controller.signal.aborted) return
      if (identity === null) {
        setStage({ kind: 'refused', why: 'signed-out' })
        return
      }
      const outcome = await props.ask(identity.accessToken, controller.signal)
      if (controller.signal.aborted) return
      setStage(
        outcome.kind === 'answer'
          ? { kind: 'review', result: outcome.result, remaining: outcome.remaining }
          : { kind: 'refused', why: outcome.why },
      )
    } catch {
      // Aborted: the sheet is closing, and there is nothing to say.
    } finally {
      if (asking.current === controller) asking.current = null
    }
  }

  return (
    <section
      ref={panel}
      tabIndex={-1}
      className="of-notice of-ai-sheet"
      aria-labelledby={headingId}
      data-testid={`${props.name}-review`}
      data-stage={stage.kind}
      onKeyDown={(event) => {
        wrapTab(event)
        /*
         * Enter and Space press the button the sheet put focus on. The board's
         * keymap yields them to a control only when the KEYBOARD put focus
         * there, and this sheet is usually opened with a pointer — so Enter
         * went to the board, as "edit the selection", and nothing was pressed.
         */
        if (
          (event.key === 'Enter' || event.key === ' ') &&
          event.target instanceof HTMLButtonElement
        ) {
          event.stopPropagation()
        }
      }}
    >
      <h2 className="of-ai-sheet__heading" id={headingId}>
        {props.heading}
      </h2>

      {stage.kind === 'confirm' && (
        <>
          <p className="of-ai-sheet__note">{props.confirm}</p>
          <div className="of-ai-sheet__actions">
            <button
              type="button"
              className="of-button of-button--primary"
              data-testid={`${props.name}-ask`}
              onClick={() => {
                void ask()
              }}
            >
              {props.verb}
            </button>
            <button type="button" className="of-button of-button--ghost" onClick={close}>
              Cancel
            </button>
          </div>
        </>
      )}

      {stage.kind === 'asking' && (
        <>
          <p className="of-ai-sheet__note" role="status">
            {props.asking}
          </p>
          <div className="of-ai-sheet__actions">
            <button type="button" className="of-button of-button--ghost" onClick={close}>
              Cancel
            </button>
          </div>
        </>
      )}

      {stage.kind === 'refused' && (
        <>
          <p className="of-ai-sheet__note" role="alert" data-testid={`${props.name}-refused`}>
            {props.refusals[stage.why]}
          </p>
          <div className="of-ai-sheet__actions">
            {stage.why === 'signed-out' && (
              <button
                type="button"
                className="of-button of-button--primary"
                data-testid={`${props.name}-sign-in`}
                onClick={() => {
                  // The way to an account, rather than only the news that one is needed.
                  onClose()
                  useInteractionStore.getState().setAccountOpen(true)
                }}
              >
                Sign in
              </button>
            )}
            <button type="button" className="of-button of-button--ghost" onClick={close}>
              Close
            </button>
          </div>
        </>
      )}

      {stage.kind === 'review' && props.review(stage.result, stage.remaining, close)}
    </section>
  )
}

/** Apply, Discard, and how many runs are left — the foot of every review form. */
export function ReviewActions({
  name,
  remaining,
  onDiscard,
}: {
  readonly name: string
  readonly remaining: number
  readonly onDiscard: () => void
}) {
  return (
    <div className="of-ai-sheet__actions">
      <button type="submit" className="of-button of-button--primary" data-testid={`${name}-apply`}>
        Apply
      </button>
      <button type="button" className="of-button of-button--ghost" onClick={onDiscard}>
        Discard
      </button>
      <span className="of-ai-sheet__remaining" data-testid={`${name}-remaining`}>
        {String(remaining)} {remaining === 1 ? 'run' : 'runs'} left today
      </span>
    </div>
  )
}

/** "1 note", "3 notes". */
export const notesNoun = (count: number): string =>
  `${String(count)} ${count === 1 ? 'note' : 'notes'}`
