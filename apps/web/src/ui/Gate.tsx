import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from 'react'

import { wrapTab } from '../controls/wrap-tab.js'
import { abandonSplash } from '../app/splash.js'

interface Props {
  readonly heading: string
  readonly children: ReactNode
  readonly testId: string
  /** What takes the keyboard when the gate appears. Defaults to the panel. */
  readonly initialFocus?: RefObject<HTMLElement | null>
  /** `alertdialog` for news that interrupts; `dialog` for a state to read. */
  readonly role?: 'dialog' | 'alertdialog'
  readonly as?: 'div' | 'form'
  readonly onSubmit?: (event: FormEvent) => void
}

const GateBodyId = createContext<string | undefined>(undefined)

/**
 * A panel that stands in front of a board nobody can use.
 *
 * The password prompt, the deleted board and the board this build cannot read
 * are three different stories with one shape: the board behind is not there
 * to be worked on, and the panel is the only thing on the page that does
 * anything. So the rest of the app goes INERT while it shows — not just
 * covered, which still let Tab walk out of the panel into a toolbar behind a
 * scrim, and let a screen reader read a board that was not there.
 *
 * Named by its title and described by its first paragraph, which is what a
 * dialog announces on arrival; the three used to announce as "dialog" and
 * nothing else.
 */
export function Gate({
  heading,
  children,
  testId,
  initialFocus,
  role = 'alertdialog',
  as = 'div',
  onSubmit,
}: Props) {
  const id = useId()
  const gate = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const own = gate.current
    const app = own?.closest('.of-app')
    if (own === null || app === null || app === undefined) return
    const behind = [...app.children].filter(
      (child): child is HTMLElement => child instanceof HTMLElement && !child.contains(own),
    )
    for (const element of behind) element.inert = true
    /*
     * A gate is news the artwork must not hold back — and its one focus on
     * arrival lands on nothing while the root is still inert under the splash.
     * A locked board's room answers inside the brand hold, so on a first visit
     * the password field never had the keyboard. Same fix as `StartFailed`.
     */
    abandonSplash()
    ;(initialFocus?.current ?? panel.current)?.focus()
    return () => {
      for (const element of behind) element.inert = false
    }
    // Once, on arrival: a gate is not re-focused by its own re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const title = (
    <h2 className="of-gone__title" id={`${id}-title`}>
      {heading}
    </h2>
  )
  const body = <GateBodyId.Provider value={`${id}-body`}>{children}</GateBodyId.Provider>
  return (
    <div className="of-gone" ref={gate}>
      {/*
        The ROLE is on a div, and a gate that asks for something holds a form
        inside it. A form given `alertdialog` loses its own implicit role, so
        Enter still submitted but nothing told a screen reader a form was
        there (audit 2026-09-27).
      */}
      <div
        ref={panel}
        className="of-gone__panel"
        role={role}
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-body`}
        tabIndex={-1}
        data-testid={testId}
        onKeyDown={wrapTab}
      >
        {title}
        {as === 'form' ? <form onSubmit={onSubmit}>{body}</form> : body}
      </div>
    </div>
  )
}

/** The paragraph a gate is described by: what happened, in a sentence. */
export function GateBody({ children }: { readonly children: ReactNode }) {
  const id = useContext(GateBodyId)
  return (
    <p className="of-gone__body" id={id}>
      {children}
    </p>
  )
}

/** The gate's way out and whatever else it offers, in a row. */
export function GateActions({ children }: { readonly children: ReactNode }) {
  return <div className="of-gone__actions">{children}</div>
}
