import {
  applyMark,
  applySize,
  markCovers,
  type Mark,
  type RichText,
  type SizeToken,
} from '@openframe/core'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import {
  renderSpansInto,
  selectionOffsets,
  setSelectionOffsets,
  spansFromElement,
} from './rich-text-dom.js'

interface Props {
  readonly initialText: RichText
  readonly className: string
  readonly style?: React.CSSProperties
  readonly ariaLabel: string
  /** Counter-scales the format bar so it is the same size at any zoom. */
  readonly zoom: number
  readonly onCommit: (text: RichText) => void
  readonly onCancel: () => void
}

const SHORTCUTS: Readonly<Record<string, Mark>> = { b: 'bold', i: 'italic', u: 'underline' }

/** The marks a button can show, in the order they appear on the bar. */
const MARK_LIST: readonly Mark[] = ['bold', 'italic', 'underline', 'strike']

/**
 * The inline editor for formatted text (ADR 0012).
 *
 * The division of labour is the whole design. The BROWSER handles typing,
 * because fighting it over every keystroke breaks IME composition, autocorrect,
 * spellcheck and the platform's own text gestures. The MODEL handles
 * formatting, because `applyMark` in core is pure, tested, and the only thing
 * that knows how runs split and merge.
 *
 * So: type freely, and on a formatting command the element is read back into
 * spans, transformed, re-rendered and the caret restored. `document.execCommand`
 * would have done it in one line and emitted whatever markup that browser felt
 * like — which is exactly the opaque representation ADR 0012 rejected.
 *
 * Commit semantics are unchanged from the plain editor, and they are the part
 * that matters: committed on blur, discarded on Escape, never dispatched per
 * keystroke. One command per edit, one undo entry.
 */
export function RichTextEditor({
  initialText,
  className,
  style,
  ariaLabel,
  zoom,
  onCommit,
  onCancel,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const draft = useRef<RichText>(initialText)
  const cancelled = useRef(false)
  /*
   * Which marks cover the current selection, as STATE.
   *
   * Read from the DOM in an effect rather than during render: a render that
   * reads `ref.current` is unsound in React, and the button state has to follow
   * the CARET anyway — moving into a bold word must light the bold button
   * without anything else having changed.
   */
  const [active, setActive] = useState<readonly Mark[]>([])

  /*
   * Filled imperatively, and React never renders children here.
   *
   * The browser owns this subtree while the user types — see `renderSpansInto`
   * for why that has to be true and why React cannot share it.
   */
  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) return
    renderSpansInto(element, draft.current)
  }, [])

  useEffect(() => {
    const element = ref.current
    if (element === null) return
    element.focus()
    // Select everything, matching the plain editor: a newly placed object is
    // almost always retyped rather than appended to.
    const selection = element.ownerDocument.getSelection()
    const range = element.ownerDocument.createRange()
    range.selectNodeContents(element)
    selection?.removeAllRanges()
    selection?.addRange(range)
  }, [])

  useEffect(() => {
    const element = ref.current
    if (element === null) return
    const owner = element.ownerDocument
    const sync = (): void => {
      const at = selectionOffsets(element)
      if (at === null) return
      const text = spansFromElement(element)
      setActive(MARK_LIST.filter((mark) => markCovers(text, at.from, at.to, mark)))
    }
    owner.addEventListener('selectionchange', sync)
    return () => {
      owner.removeEventListener('selectionchange', sync)
    }
  }, [])

  const reformat = (transform: (text: RichText, from: number, to: number) => RichText): void => {
    const element = ref.current
    if (element === null) return
    const range = selectionOffsets(element)
    if (range === null || range.to <= range.from) return

    const current = spansFromElement(element)
    const next = transform(current, range.from, range.to)
    draft.current = next
    renderSpansInto(element, next)
    /*
     * The caret is restored after React has written the new tree, not in the
     * same tick. Re-rendering destroys the DOM selection, so without this every
     * Cmd+B would dump the caret at the start and the user would lose their
     * place mid-sentence.
     */
    /*
     * Re-rendering destroyed the DOM selection, so the caret is put back at the
     * same plain-text offsets. Without this every Cmd+B would dump the caret at
     * the start of the note and the user would lose their place mid-sentence.
     */
    setSelectionOffsets(element, range.from, range.to)
    setActive(MARK_LIST.filter((mark) => markCovers(next, range.from, range.to, mark)))
  }

  const apply = (transform: (text: RichText, from: number, to: number) => RichText): void => {
    reformat(transform)
  }

  return (
    <>
      <FormatBar
        zoom={zoom}
        active={active}
        onToggle={(mark) =>
          apply((text, from, to) =>
            applyMark(text, from, to, mark, !markCovers(text, from, to, mark)),
          )
        }
        onResize={(size) => {
          apply((text, from, to) => applySize(text, from, to, size))
        }}
      />
      <div
      ref={ref}
      className={className}
      style={style}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label={ariaLabel}
      data-testid="rich-text-editor"
      onBlur={() => {
        if (cancelled.current) return
        const element = ref.current
        onCommit(element === null ? draft.current : spansFromElement(element))
      }}
      onPaste={(event) => {
        /*
         * Paste is intercepted and reduced to PLAIN TEXT.
         *
         * A browser's own paste inserts arbitrary markup — fonts, colours,
         * tables, scripts — into a document this product is committed to
         * accepting from other people. Keeping the characters and dropping
         * everything else is the only version of this that is safe without a
         * sanitiser, and a half-sanitised paste is worse than a plain one
         * because it looks handled.
         */
        event.preventDefault()
        const text = event.clipboardData.getData('text/plain')
        if (text !== '') event.currentTarget.ownerDocument.execCommand('insertText', false, text)
      }}
      onKeyDown={(event) => {
        // Keep board shortcuts from firing while typing: a 'v' in a note must
        // stay a 'v', not switch tools.
        event.stopPropagation()

        if (event.key === 'Escape') {
          event.preventDefault()
          cancelled.current = true
          onCancel()
          return
        }
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          const element = ref.current
          onCommit(element === null ? draft.current : spansFromElement(element))
          return
        }

        const mark = (event.metaKey || event.ctrlKey) && SHORTCUTS[event.key.toLowerCase()]
        if (mark !== undefined && mark !== false) {
          event.preventDefault()
          reformat((text, from, to) =>
            applyMark(text, from, to, mark, !markCovers(text, from, to, mark)),
          )
        }
      }}
      />
    </>
  )
}

const MARK_BUTTONS: readonly { readonly mark: Mark; readonly label: string; readonly glyph: string }[] =
  [
    { mark: 'bold', label: 'Bold', glyph: 'B' },
    { mark: 'italic', label: 'Italic', glyph: 'I' },
    { mark: 'underline', label: 'Underline', glyph: 'U' },
    { mark: 'strike', label: 'Strikethrough', glyph: 'S' },
  ]

const SIZES: readonly { readonly size: SizeToken; readonly label: string }[] = [
  { size: 'small', label: 'Small' },
  { size: 'normal', label: 'Normal' },
  { size: 'large', label: 'Large' },
  { size: 'huge', label: 'Huge' },
]

/**
 * The formatting controls, shown only while editing.
 *
 * Above the object rather than in the record panel, because the panel is hidden
 * during an edit — deliberately, since a panel that jumps around under the
 * pointer is worse than no panel — and because formatting applies to a
 * SELECTION, which only exists while the caret is in the text.
 *
 * Counter-scaled, like a frame's title: a format bar that shrank with the board
 * would be unusable at the zoom where someone is reading a note closely.
 */
function FormatBar({
  zoom,
  active,
  onToggle,
  onResize,
}: {
  readonly zoom: number
  readonly active: readonly Mark[]
  readonly onToggle: (mark: Mark) => void
  readonly onResize: (size: SizeToken | undefined) => void
}) {
  /*
   * `onMouseDown` is prevented on every control. A button that took focus would
   * blur the editor, which COMMITS — so clicking "bold" would end the edit and
   * then apply a mark to a selection that no longer existed.
   */
  const keepFocus = (event: React.MouseEvent): void => {
    event.preventDefault()
  }

  return (
    <div
      className="of-format-bar"
      data-testid="format-bar"
      role="toolbar"
      aria-label="Text formatting"
      style={{ transform: `scale(${String(1 / zoom)})`, transformOrigin: '0 100%' }}
      onMouseDown={keepFocus}
    >
      {MARK_BUTTONS.map(({ mark, label, glyph }) => (
        <button
          key={mark}
          type="button"
          className={`of-format-bar__button of-format-bar__button--${mark}`}
          aria-label={label}
          aria-pressed={active.includes(mark)}
          title={label}
          data-testid={`format-${mark}`}
          onMouseDown={keepFocus}
          onClick={() => {
            onToggle(mark)
          }}
        >
          {glyph}
        </button>
      ))}

      <span className="of-format-bar__rule" aria-hidden="true" />

      <select
        className="of-format-bar__size"
        aria-label="Text size"
        data-testid="format-size"
        defaultValue=""
        onMouseDown={keepFocus}
        onChange={(event) => {
          onResize(event.target.value === '' ? undefined : (event.target.value as SizeToken))
        }}
      >
        <option value="">Size</option>
        {SIZES.map(({ size, label }) => (
          <option key={size} value={size}>
            {label}
          </option>
        ))}
      </select>
    </div>
  )
}
