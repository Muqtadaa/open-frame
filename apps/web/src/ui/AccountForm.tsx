import { useId, useRef, useState, type FormEvent } from 'react'

import { useServices } from '../runtime/services.js'

/**
 * Signing in, without deciding where it appears.
 *
 * The same form serves a sheet under the navigation bar and the entry surface,
 * and it must: two sign-in forms would drift, and the one people see less
 * often is the one that would quietly stop reporting errors properly.
 *
 * Only the chrome differs, so only the chrome is the caller's business.
 */
export function AccountForm({ onDone }: { readonly onDone: () => void }) {
  const { accounts } = useServices()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /* Which field the error is about, so it can point at that field. */
  const [wrong, setWrong] = useState<'email' | 'password' | 'both' | null>(null)
  const id = useId()
  const emailField = useRef<HTMLInputElement>(null)
  const passwordField = useRef<HTMLInputElement>(null)

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    /*
     * Checked here rather than by the browser. Its own bubble was the one
     * thing on the page in a different register, it vanished on the next
     * keystroke, and no assistive technology could find it afterwards.
     */
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setWrong('email')
      setError('That is not an email address.')
      emailField.current?.focus()
      return
    }
    if (password.length < 6) {
      setWrong('password')
      setError('A password needs at least six characters.')
      passwordField.current?.focus()
      return
    }
    setBusy(true)
    setWrong(null)
    setError(null)
    const attempt =
      mode === 'in'
        ? accounts.signIn(email, password)
        : accounts.signUp(email, password, displayName)
    void attempt.then((result) => {
      setBusy(false)
      if (result.ok) onDone()
      else {
        setWrong('both')
        setError(result.message ?? 'That email and password do not match.')
      }
    })
  }

  return (
    <form onSubmit={submit} noValidate>
      {mode === 'up' && (
        <label className="of-account__field">
          <span>Name</span>
          <input
            className="of-input of-input--large"
            type="text"
            value={displayName}
            autoComplete="name"
            aria-describedby={`${id}-name`}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          {/* Beside the field, not inside it: a placeholder went on the first keystroke. */}
          <small className="of-account__hint" id={`${id}-name`}>
            Shown on your cursor
          </small>
        </label>
      )}

      <label className="of-account__field">
        <span>Email</span>
        <input
          className="of-input of-input--large"
          ref={emailField}
          type="email"
          required
          value={email}
          aria-invalid={wrong === 'email' || wrong === 'both' ? true : undefined}
          aria-describedby={wrong === 'email' || wrong === 'both' ? `${id}-error` : undefined}
          autoComplete="email"
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>

      <label className="of-account__field">
        <span>Password</span>
        <input
          className="of-input of-input--large"
          ref={passwordField}
          type="password"
          required
          minLength={6}
          value={password}
          aria-invalid={wrong === 'password' || wrong === 'both' ? true : undefined}
          aria-describedby={wrong === 'password' || wrong === 'both' ? `${id}-error` : undefined}
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
        <p className="of-account__error" role="alert" id={`${id}-error`}>
          {error}
        </p>
      )}

      <div className="of-account__actions">
        <button
          type="button"
          className="of-account__switch"
          onClick={() => setMode(mode === 'in' ? 'up' : 'in')}
        >
          {mode === 'in' ? 'Create an account' : 'Sign in instead'}
        </button>
        <button
          type="submit"
          className="of-button of-button--primary of-button--large"
          disabled={busy}
        >
          {busy
            ? mode === 'in'
              ? 'Signing in…'
              : 'Creating…'
            : mode === 'in'
              ? 'Sign in'
              : 'Create account'}
        </button>
      </div>
    </form>
  )
}
