import { useState, type FormEvent } from 'react'

import { signIn, signUp } from '../app/identity.js'

/**
 * Signing in, without deciding where it appears.
 *
 * The same form serves a sheet under the navigation bar and the entry surface,
 * and it must: two sign-in forms would drift, and the one people see less
 * often is the one that would quietly stop reporting errors properly.
 *
 * Only the chrome differs, so only the chrome is the caller's business.
 */
export function AccountForm({
  onDone,
}: {
  readonly onDone: () => void
}) {
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
      if (result.ok) onDone()
      else setError(result.message ?? 'That did not work. Check the email and password and try again.')
    })
  }

  return (
    <form onSubmit={submit}>

      {mode === 'up' && (
        <label className="of-account__field">
          <span>Name</span>
          <input
            className="of-input of-input--large"
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
          className="of-input of-input--large"
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
          className="of-input of-input--large"
          type="password"
          required
          minLength={6}
          value={password}
          autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>

      {/*
        `role="alert"` so the failure is announced. A message that only appears
        visually leaves a screen reader user pressing a button that seems to do
        nothing.
      */}
      {error !== null && (
        <p className="of-account__error" role="alert">
          {error}
        </p>
      )}

      <div className="of-account__actions">
        <button
          type="button"
          className="of-account__switch"
          onClick={() => setMode(mode === 'in' ? 'up' : 'in')}
        >
          {mode === 'in' ? 'Create an account' : 'I already have one'}
        </button>
        <button type="submit" className="of-button of-button--primary of-button--large" disabled={busy}>
          {busy ? (mode === 'in' ? 'Signing in…' : 'Creating…') : mode === 'in' ? 'Sign in' : 'Create account'}
        </button>
      </div>
    </form>
  )
}
