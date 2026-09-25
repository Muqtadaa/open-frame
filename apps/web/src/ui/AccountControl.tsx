import { useState } from 'react'

import { ACCOUNTS_ENABLED, signOut } from '../app/identity.js'
import { AnchoredSurface } from '../controls/AnchoredSurface.js'
import { useAnchoredTo } from '../controls/use-anchor.js'
import { useIdentity } from '../hooks/use-identity.js'
import { AccountForm } from './AccountForm.js'
import { hueVar, initialOf } from '../scene/presence.js'

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

  if (!ACCOUNTS_ENABLED) return null

  if (identity !== null) {
    return (
      <button
        type="button"
        className="of-status__share"
        aria-label={identity.displayName}
        data-testid="account"
        data-tip={`Signed in as ${identity.displayName}${identity.email === null ? '' : ` (${identity.email})`}. Click to sign out.`}
        aria-description={`Signed in as ${identity.displayName}${identity.email === null ? '' : ` (${identity.email})`}. Click to sign out.`}
        onClick={() => {
          void signOut()
        }}
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
    )
  }

  return (
    <>
      <button
        ref={ref}
        type="button"
        className="of-status__share"
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
      {open && (
        <AnchoredSurface
          anchor={anchor}
          surface={surface}
          prefer={['below', 'above']}
          testId="account-surface"
        >
          <div
            className="of-sheet"
            role="dialog"
            aria-label="Account"
            data-testid="account-dialog"
          >
            <AccountForm
              onDone={() => {
                setOpen(false)
              }}
            />
          </div>
        </AnchoredSurface>
      )}
    </>
  )
}
