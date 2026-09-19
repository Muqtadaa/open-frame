import { useState, type FormEvent } from 'react'

import { ACCOUNTS_ENABLED, signIn, signOut, signUp } from '../app/identity.js'
import { useIdentity } from '../hooks/use-identity.js'
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
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const attempt = mode === 'in' ? signIn(email, password) : signUp(email, password, displayName)
    void attempt.then((result) => {
      setBusy(false)
      if (result.ok) onClose()
      else setError(result.message ?? 'That did not work.')
    })
  }

  return (
    <div className="of-account" role="dialog" aria-label="Account" data-testid="account-dialog">
      <form onSubmit={submit}>
        <p className="of-account__lead">
          {mode === 'in'
            ? 'Sign in to keep a list of your boards.'
            : 'An account keeps a list of your boards. It is not needed to use one.'}
        </p>

        {mode === 'up' && (
          <label className="of-account__field">
            <span>Name</span>
            <input
              type="text"
              value={displayName}
              autoComplete="name"
              placeholder="What people will see on your cursor"
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
        )}

        <label className="of-account__field">
          <span>Email</span>
          <input
            type="email"
            required
            value={email}
            autoComplete="email"
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        <label className="of-account__field">
          <span>Password</span>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {/*
          `role="alert"` so the failure is announced. A message that only
          appears visually leaves a screen reader user pressing a button that
          seems to do nothing.
        */}
        {error !== null && (
          <p className="of-account__error" role="alert">
            {error}
          </p>
        )}

        <div className="of-account__actions">
          <button type="button" className="of-account__switch" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
            {mode === 'in' ? 'Create an account' : 'I already have one'}
          </button>
          <button type="submit" className="of-account__submit" disabled={busy}>
            {busy ? 'Just a moment…' : mode === 'in' ? 'Sign in' : 'Create account'}
          </button>
        </div>
      </form>
    </div>
  )
}
