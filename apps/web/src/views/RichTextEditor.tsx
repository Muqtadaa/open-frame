import type { RichText } from '@openframe/core'
import { useRef, useState } from 'react'

import type { ObjectEditorProps } from './registry.js'
import { FormatBar } from './FormatBar.js'
import { RichTextField, type FormatState, type RichTextFieldHandle } from './RichTextField.js'

interface Props {
  readonly initialText: RichText
  readonly className: string
  readonly style?: React.CSSProperties
  readonly ariaLabel: string
  /**
   * Where the format bar goes.
   *
   * Handed down from the canvas by the view that owns this editor. The bar
   * used to counter-scale itself inside the object, which kept it the right
   * SIZE and left it anchored to an edge that leaves the window — the same
   * fault a table's colour bar had.
   */
  readonly Chrome: ObjectEditorProps['Chrome']
  readonly onCommit: (text: RichText) => void
}

/**
 * The inline editor for one object's text: a `RichTextField` and the format
 * bar that drives it, with an object's commit rules.
 *
 * Committed on blur AND on Escape, never dispatched per keystroke. One command
 * per edit, one undo entry — which is what takes an edit back.
 *
 * Escape used to DISCARD: a note somebody had just written went back to what
 * it said before, silently and beyond undo, from the key people press to mean
 * "done". Losing words is the one failure this product does not accept.
 */
export function RichTextEditor({
  initialText,
  className,
  style,
  ariaLabel,
  Chrome,
  onCommit,
}: Props) {
  const field = useRef<RichTextFieldHandle>(null)
  // Escape commits and the unmount that follows blurs the field: one commit.
  const done = useRef(false)
  const [state, setState] = useState<FormatState>({ marks: [], list: undefined, size: undefined })

  const commit = (): void => {
    if (done.current) return
    done.current = true
    onCommit(field.current?.read() ?? initialText)
  }

  return (
    <>
      <Chrome prefer={['above', 'below']}>
        <FormatBar
          state={state}
          onToggle={(mark) => field.current?.toggleMark(mark)}
          onResize={(by) => field.current?.resize(by)}
          onList={(kind) => field.current?.toggleList(kind)}
          onReturn={() => field.current?.focus()}
          // Out of the bar and not back to the text: the edit is over.
          onLeave={(to) => {
            if ((to?.closest('[contenteditable="true"]') ?? null) === null) commit()
          }}
        />
      </Chrome>
      <RichTextField
        handle={field}
        initialText={initialText}
        className={className}
        style={style}
        ariaLabel={ariaLabel}
        focusOnMount="select-all"
        onFormatState={setState}
        onBlur={(event) => {
          // Into the format bar (Alt+F10) is not leaving the edit.
          const to = event.relatedTarget
          if (to instanceof Element && to.closest('[data-testid="format-bar"]') !== null) return
          commit()
        }}
        onKeyDown={(event) => {
          if (
            event.key === 'Escape' ||
            (event.key === 'Enter' && (event.metaKey || event.ctrlKey))
          ) {
            event.preventDefault()
            commit()
          }
        }}
      />
    </>
  )
}
