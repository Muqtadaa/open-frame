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
  const panel = useRef<HTMLElement>(null)

  useEffect(() => {
    const own = gate.current
    const app = own?.closest('.of-app')
    if (own === null || app === null || app === undefined) return
    const behind = [...app.children].filter(
      (child): child is HTMLElement => child instanceof HTMLElement && !child.contains(own),
    )
    for (const element of behind) element.inert = true
    ;(initialFocus?.current ?? panel.current)?.focus()
    return () => {
      for (const element of behind) element.inert = false
    }
    // Once, on arrival: a gate is not re-focused by its own re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const Panel = as
  return (
    <div className="of-gone" ref={gate}>
      <Panel
        ref={panel as RefObject<HTMLDivElement & HTMLFormElement>}
        className="of-gone__panel"
        role={role}
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-body`}
        tabIndex={-1}
        data-testid={testId}
        onSubmit={onSubmit}
      >
        <h2 className="of-gone__title" id={`${id}-title`}>
          {heading}
        </h2>
        <GateBodyId.Provider value={`${id}-body`}>{children}</GateBodyId.Provider>
      </Panel>
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
