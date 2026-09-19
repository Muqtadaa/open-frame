import { useState } from 'react'

import { ACCOUNTS_ENABLED, signOut } from '../app/identity.js'
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

  if (!ACCOUNTS_ENABLED) return null

  if (identity !== null) {
    return (
      <button
        type="button"
        className="of-status__share"
        data-testid="account"
        title={`Signed in as ${identity.displayName}${identity.email === null ? '' : ` (${identity.email})`}. Click to sign out.`}
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
        type="button"
        className="of-status__share"
        data-testid="sign-in"
        aria-expanded={open}
        title="Sign in to keep a list of your boards"
        onClick={() => setOpen((was) => !was)}
      >
        <span className="of-status__share-label">Sign in</span>
      </button>
      {open && <AccountDialog onClose={() => setOpen(false)} />}
    </>
  )
}

function AccountDialog({ onClose }: { readonly onClose: () => void }) {
  return (
    <div className="of-account" role="dialog" aria-label="Account" data-testid="account-dialog">
      <AccountForm onDone={onClose} />
    </div>
  )
}
