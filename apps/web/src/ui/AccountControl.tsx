import { useCallback, useRef, useState, type RefObject } from 'react'

import { ACCOUNTS_ENABLED, signOut } from '../app/identity.js'
import { SOURCE_URL } from '../app/source-link.js'
import { AnchoredSurface } from '../controls/AnchoredSurface.js'
import { useAnchoredTo } from '../controls/use-anchor.js'
import { useDismiss, useFocusOnOpen } from '../controls/use-dismiss.js'
import { useIdentity } from '../hooks/use-identity.js'
import { AccountForm } from './AccountForm.js'
import { hueVar, initialOf } from '../scene/presence.js'
import type { Size } from '../scene/anchoring.js'

/**
 * Signing in, and the fact that you do not have to.
 *
 * An account is for OWNERSHIP and board lists, never for getting into a board:
 * every control here is an invitation, and nothing anywhere blocks on it. A
 * guest can open a link, edit, and be seen by everyone else, which is the whole
 * product decision this component has to keep visible.
 */
export function AccountControl() {
  const identity = useIdentity()
  const [open, setOpen] = useState(false)
  const { ref, anchor, surface } = useAnchoredTo<HTMLButtonElement>(open)
  const close = useCallback(() => {
    setOpen(false)
    ref.current?.focus()
  }, [ref])

  if (!ACCOUNTS_ENABLED) return null

  if (identity !== null) {
    return (
      <>
        {/*
         * Pressing your own name OPENS your account. It used to sign you out
         * on the spot — one click on the most natural thing on the bar to
         * press, with nothing to confirm it.
         */}
        <button
          ref={ref}
          type="button"
          className="of-status__account"
          aria-label={identity.displayName}
          aria-expanded={open}
          aria-haspopup="dialog"
          data-testid="account"
          data-tip="Your account"
          aria-description="Your account"
          onClick={() => setOpen((was) => !was)}
        >
          <span
            className="of-status__person"
            style={{ background: hueVar(identity.hue) }}
            aria-hidden="true"
          >
            {initialOf(identity.displayName)}
          </span>
          <span className="of-status__share-label">{identity.displayName}</span>
        </button>
        {open && (
          <AccountSheet
            anchor={anchor}
            surface={surface}
            name={identity.displayName}
            email={identity.email}
            trigger={ref}
            onClose={close}
            onSignOut={() => {
              setOpen(false)
              void signOut()
            }}
          />
        )}
      </>
    )
  }

  return (
    <>
      <button
        ref={ref}
        type="button"
        className="of-status__account"
        data-testid="sign-in"
        aria-label="Sign in"
        aria-expanded={open}
        data-tip="Sign in to keep a list of your boards"
        aria-description="Sign in to keep a list of your boards"
        onClick={() => setOpen((was) => !was)}
      >
        <span className="of-status__share-label">Sign in</span>
      </button>

      {/*
       * Under the button (the bar runs along the top), and clamped. It used
       * to be `bottom: calc(100% +
       * 10px); left: 0` against whichever ancestor happened to be positioned
       * — which was the BAR, not the button, so a 320px dialog was aligned to
       * the left edge of the screen rather than to the control that opened
       * it, and nothing stopped it running off the right on a narrow window.
       */}
      {open && <SignInSheet anchor={anchor} surface={surface} trigger={ref} onClose={close} />}
    </>
  )
}

/**
 * Signing in, from a board. Takes the keyboard on arrival — the email field —
 * and lets go of it like every other sheet: it ignored Escape and any press
 * elsewhere, so a sheet opened by mistake stayed over the board.
 */
function SignInSheet({
  anchor,
  surface,
  trigger,
  onClose,
}: {
  readonly anchor: DOMRect | null
  readonly surface: Size
  readonly trigger: RefObject<HTMLElement | null>
  readonly onClose: () => void
}) {
  const sheet = useRef<HTMLDivElement>(null)
  useDismiss(sheet, trigger, onClose)
  useFocusOnOpen(sheet)
  return (
    <AnchoredSurface
      anchor={anchor}
      surface={surface}
      prefer={['below', 'above']}
      testId="account-surface"
    >
      <div
        ref={sheet}
        className="of-sheet"
        role="dialog"
        aria-label="Account"
        data-testid="account-dialog"
      >
        <AccountForm onDone={onClose} />
        <SheetSource />
      </div>
    </AnchoredSurface>
  )
}

/**
 * Who you are signed in as, and the way out — behind a press, not on it.
 *
 * Closed by Escape or a press anywhere else, like every other sheet, and it
 * hands the keyboard back to the name that opened it.
 */
export function AccountSheet({
  anchor,
  surface,
  name,
  email,
  trigger,
  onClose,
  onSignOut,
}: {
  readonly anchor: DOMRect | null
  readonly surface: Size
  readonly name: string
  readonly email: string | null
  readonly trigger: RefObject<HTMLElement | null>
  readonly onClose: () => void
  readonly onSignOut: () => void
}) {
  const sheet = useRef<HTMLDivElement>(null)

  useDismiss(sheet, trigger, onClose)
  // Into the sheet: "Sign out" was 31 Tabs away, past the whole board.
  useFocusOnOpen(sheet)

  return (
    <AnchoredSurface
      anchor={anchor}
      surface={surface}
      prefer={['below', 'above']}
      testId="account-surface"
    >
      <div
        ref={sheet}
        className="of-sheet of-account-sheet"
        role="dialog"
        aria-label="Account"
        data-testid="account-sheet"
      >
        <p className="of-account-sheet__who">
          <span className="of-account-sheet__label">Signed in as</span>
          <b>{name}</b>
          {email !== null && <span className="of-account-sheet__email">{email}</span>}
        </p>
        <div className="of-account__actions">
          <button
            type="button"
            className="of-button of-button--ghost"
            onClick={() => {
              /*
               * Closed FIRST. Signing out swaps this control for "Sign in",
               * and an `open` left true opened the sign-in form in its place
               * — signing out landed somebody in a login they did not ask for.
               */
              onSignOut()
            }}
          >
            Sign out
          </button>
        </div>
        <SheetSource />
      </div>
    </AnchoredSurface>
  )
}

/**
 * The source offer, for the width where the bar has no room for it. Shown by
 * the stylesheet only there; everywhere else the bar carries it.
 */
function SheetSource() {
  return (
    <a className="of-sheet__source" href={SOURCE_URL} target="_blank" rel="noreferrer">
      Source
    </a>
  )
}
