import { useEffect, useRef, useState } from 'react'

interface Props {
  readonly initialText: string
  readonly className: string
  readonly style?: React.CSSProperties
  readonly ariaLabel: string
  readonly onCommit: (text: string) => void
  readonly onCancel: () => void
}

/**
 * The inline text editor, shared by every type that holds text.
 *
 * The commit semantics are the part worth sharing, not the markup: text is
 * committed on blur, discarded on Escape, and never dispatched per keystroke.
 * Getting that subtly different per type is how a note silently loses what
 * someone typed — which has already happened once here.
 */
export function InlineTextEditor({
  initialText,
  className,
  style,
  ariaLabel,
  onCommit,
  onCancel,
}: Props) {
  const [draft, setDraft] = useState(initialText)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  return (
    <textarea
      ref={ref}
      className={className}
      style={style}
      value={draft}
      aria-label={ariaLabel}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onCancel()
        }
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          onCommit(draft)
        }
        // Keep board shortcuts from firing while typing: a 'v' in a note must
        // stay a 'v', not switch tools.
        event.stopPropagation()
      }}
    />
  )
}
