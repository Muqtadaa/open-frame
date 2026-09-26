import { useEffect, useId, useRef } from 'react'

interface Props {
  readonly heading: string
  readonly error: unknown
}

/**
 * Why, as somebody at the keyboard can act on it.
 *
 * The one cause worth naming is storage refused outright: private windows in
 * some browsers, a profile with site data blocked. Everything else is said
 * plainly as not known, rather than as a message written for a console.
 */
export function describeStartFailure(error: unknown): string {
  const name = error instanceof DOMException || error instanceof Error ? error.name : ''
  const refused =
    name === 'SecurityError' ||
    name === 'InvalidStateError' ||
    (error instanceof Error && /indexeddb/i.test(error.message)) ||
    typeof indexedDB === 'undefined'
  return refused
    ? 'This browser is not letting OpenFrame keep anything on this device. A private window does this, and so does blocking site data.'
    : 'Something went wrong while opening it, and it is not clear what.'
}

/**
 * The page when OpenFrame itself could not start: a board that would not open,
 * or the app falling over.
 *
 * Shaped like the gates, because it is one — the only thing left on the page
 * is the way forward. It was one line across the splash artwork, which read
 * as the page still loading.
 */
export function StartFailed({ heading, error }: Props) {
  const id = useId()
  const reload = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    reload.current?.focus()
  }, [])

  return (
    <div className="of-gone">
      <div
        className="of-gone__panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-body`}
        data-testid="start-failed"
      >
        <h2 className="of-gone__title" id={`${id}-title`}>
          {heading}
        </h2>
        <p className="of-gone__body" id={`${id}-body`}>
          {describeStartFailure(error)} Your boards on this device are unchanged.
        </p>
        <div className="of-gone__actions">
          <button
            ref={reload}
            type="button"
            className="of-button of-button--primary"
            onClick={() => {
              window.location.reload()
            }}
          >
            Reload
          </button>
          <a className="of-button" href="/">
            All boards
          </a>
        </div>
      </div>
    </div>
  )
}
