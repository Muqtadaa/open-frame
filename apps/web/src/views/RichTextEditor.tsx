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
  readonly onCancel: () => void
}

/**
 * The inline editor for one object's text: a `RichTextField` and the format
 * bar that drives it, with an object's commit rules.
 *
 * Committed on blur, discarded on Escape, never dispatched per keystroke. One
 * command per edit, one undo entry.
 */
export function RichTextEditor({
  initialText,
  className,
  style,
  ariaLabel,
  Chrome,
  onCommit,
  onCancel,
}: Props) {
  const field = useRef<RichTextFieldHandle>(null)
  const cancelled = useRef(false)
  const [state, setState] = useState<FormatState>({ marks: [], list: undefined })

  const commit = (): void => {
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
        onBlur={() => {
          if (cancelled.current) return
          commit()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            cancelled.current = true
            onCancel()
            return
          }
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            commit()
          }
        }}
      />
    </>
  )
}
