import {
  applyMark,
  applySize,
  indentBy,
  listOf,
  markCovers,
  paragraphsOf,
  DEFAULT_SIZE,
  plainTextOf,
  setList,
  SIZE_TOKENS,
  spliceText,
  updateParagraph,
  type ListKind,
  type Mark,
  type RichText,
  type SizeToken,
} from '@openframe/core'
import type { ObjectEditorProps } from './registry.js'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { BulletListIcon, NumberListIcon } from '../controls/icons.js'
import { IS_MAC } from '../scene/platform.js'
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
  Chrome,
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
  /** The list kind the caret's paragraphs share, for the two list buttons. */
  const [activeList, setActiveList] = useState<ListKind | undefined>(undefined)

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
      setActiveList(listOf(text, at.from, at.to))
    }
    owner.addEventListener('selectionchange', sync)
    return () => {
      owner.removeEventListener('selectionchange', sync)
    }
  }, [])

  const reformat = (transform: (text: RichText, from: number, to: number) => RichText): void => {
    const element = ref.current
    if (element === null) return
    const current = spansFromElement(element)

    /*
     * No selection means the WHOLE object.
     *
     * Someone who clicks into a note and presses "bigger" means the note, not
     * the empty space at the caret — and silently doing nothing is how this
     * read as broken. It applies to every formatting action, not just size, so
     * there is one rule to learn rather than one per button.
     */
    const selected = selectionOffsets(element)
    const range =
      selected === null || selected.to <= selected.from
        ? { from: 0, to: plainTextOf(current).length }
        : selected
    if (range.to <= range.from) return

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
    setActiveList(listOf(next, range.from, range.to))
  }

  /*
   * A change to PARAGRAPHS rather than to characters. Unlike marks, a caret
   * with nothing selected means the paragraph it is in, not the whole text:
   * pressing "bullet" in the middle of a note makes that line an item.
   *
   * `shift` is how far the selection moves because characters before it were
   * removed — the "- " that became a bullet.
   */
  const reshape = (
    transform: (text: RichText, from: number, to: number) => RichText,
    shift = 0,
  ): void => {
    const element = ref.current
    if (element === null) return
    const current = spansFromElement(element)
    const range = selectionOffsets(element) ?? { from: 0, to: plainTextOf(current).length }
    const next = transform(current, range.from, range.to)
    draft.current = next
    renderSpansInto(element, next)
    const from = Math.max(0, range.from - shift)
    const to = Math.max(from, range.to - shift)
    setSelectionOffsets(element, from, to)
    setActive(MARK_LIST.filter((mark) => markCovers(next, from, to, mark)))
    setActiveList(listOf(next, from, to))
  }

  const toggleList = (kind: ListKind): void => {
    reshape((text, from, to) =>
      setList(text, from, to, listOf(text, from, to) === kind ? undefined : kind),
    )
  }

  /** The paragraph a collapsed caret is in, and how far into it, or null. */
  const caretParagraph = () => {
    const element = ref.current
    if (element === null) return null
    const at = selectionOffsets(element)
    if (at === null || at.from !== at.to) return null
    const text = spansFromElement(element)
    const paragraph = paragraphsOf(text).find((p) => p.from <= at.from && at.from <= p.to)
    return paragraph === undefined ? null : { text, paragraph, at: at.from }
  }

  const apply = (transform: (text: RichText, from: number, to: number) => RichText): void => {
    reformat(transform)
  }

  return (
    <>
      <Chrome prefer={['above', 'below']}>
        <FormatBar
          active={active}
          list={activeList}
          onList={toggleList}
          onToggle={(mark) =>
            apply((text, from, to) =>
              applyMark(text, from, to, mark, !markCovers(text, from, to, mark)),
            )
          }
          onResize={(by) => {
            apply((text, from, to) => {
              const next = stepSize(sizeOfRange(text, from, to), by)
              // `md` is the object's own size, so it is stored as no size at all
              // rather than as a token meaning "the default".
              return applySize(text, from, to, next === DEFAULT_SIZE ? undefined : next)
            })
          }}
        />
      </Chrome>
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
          const html = event.clipboardData.getData('text/html')
          const element = ref.current
          if (html !== '' && element !== null) {
            /*
             * Markup is READ, never inserted. It is parsed into a document
             * that is never rendered — nothing in it loads or runs — and only
             * what the reader understands comes out: the characters, the four
             * marks, the sizes and the lists. Then that text is spliced into
             * the model and drawn from it like any other edit.
             */
            const parsed = new DOMParser().parseFromString(html, 'text/html')
            const pasted = spansFromElement(parsed.body)
            if (plainTextOf(pasted) !== '') {
              const at = selectionOffsets(element) ?? { from: 0, to: 0 }
              const current = spansFromElement(element)
              const next = spliceText(current, at.from, at.to, pasted)
              draft.current = next
              renderSpansInto(element, next)
              const caret = at.from + plainTextOf(pasted).length
              setSelectionOffsets(element, caret, caret)
              return
            }
          }
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

          // The list shortcuts every document editor shares: Mod+Shift+8 for
          // bullets, Mod+Shift+7 for numbers. By CODE, because Shift+8 is "*"
          // on one keyboard and something else on the next.
          if ((event.metaKey || event.ctrlKey) && event.shiftKey) {
            const kind =
              event.code === 'Digit8' ? 'bullet' : event.code === 'Digit7' ? 'number' : null
            if (kind !== null) {
              event.preventDefault()
              toggleList(kind)
              return
            }
          }

          if (event.key === 'Tab') {
            const element = ref.current
            const at = element === null ? null : selectionOffsets(element)
            if (element !== null && at !== null) {
              const text = spansFromElement(element)
              // Only a list nests. A Tab anywhere else leaves the editor, as
              // it leaves every other field, and that commits.
              if (listOf(text, at.from, at.to) !== undefined) {
                event.preventDefault()
                reshape((current, from, to) => indentBy(current, from, to, event.shiftKey ? -1 : 1))
                return
              }
            }
          }

          if (event.key === 'Enter' && !event.shiftKey) {
            const here = caretParagraph()
            // Enter on an EMPTY item ends the list, as it does everywhere else;
            // Enter on any other item is the browser's, which splits the block
            // and copies the item's attributes onto the new one.
            if (here?.paragraph.list !== undefined && here.paragraph.to === here.paragraph.from) {
              event.preventDefault()
              reshape((current, from, to) => setList(current, from, to, undefined))
              return
            }
          }

          if (event.key === 'Backspace') {
            const here = caretParagraph()
            // At the very start of an item, Backspace takes the bullet away
            // first and leaves the words; a second press joins the lines.
            if (here?.paragraph.list !== undefined && here.at === here.paragraph.from) {
              event.preventDefault()
              reshape((current, from, to) => setList(current, from, to, undefined))
              return
            }
          }

          if (event.key === ' ') {
            const here = caretParagraph()
            if (here !== null && here.paragraph.list === undefined) {
              const typed = plainTextOf(here.paragraph.spans).slice(
                0,
                here.at - here.paragraph.from,
              )
              // "- " or "* " starts a bulleted list and "1. " a numbered one,
              // typed at the start of a line: what people type anyway.
              const kind =
                typed === '-' || typed === '*' ? 'bullet' : typed === '1.' ? 'number' : null
              if (kind !== null) {
                event.preventDefault()
                // A change to THE PARAGRAPH, never a character edit: see
                // `updateParagraph` for the empty line it would otherwise lose.
                const index = paragraphsOf(here.text).findIndex(
                  (paragraph) => paragraph.from === here.paragraph.from,
                )
                reshape(
                  (current) =>
                    updateParagraph(current, index, (paragraph) => ({
                      spans: spliceText(paragraph.spans, 0, typed.length, [{ text: '' }]),
                      list: kind,
                    })),
                  typed.length,
                )
                return
              }
            }
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

const MARK_BUTTONS: readonly {
  readonly mark: Mark
  readonly label: string
  readonly glyph: string
}[] = [
  { mark: 'bold', label: 'Bold', glyph: 'B' },
  { mark: 'italic', label: 'Italic', glyph: 'I' },
  { mark: 'underline', label: 'Underline', glyph: 'U' },
  { mark: 'strike', label: 'Strikethrough', glyph: 'S' },
]

/**
 * The size the selection currently reads as, for stepping up and down from.
 *
 * The object's own size when the runs disagree: stepping from a mixed selection
 * has to start somewhere, and the default is the least surprising place.
 */
function sizeOfRange(text: RichText, from: number, to: number): SizeToken {
  let seen = 0
  let found: SizeToken | undefined
  for (const span of text) {
    const start = seen
    seen += span.text.length
    if (seen <= from || start >= to) continue
    const size = span.size ?? DEFAULT_SIZE
    if (found === undefined) found = size
    else if (found !== size) return DEFAULT_SIZE
  }
  return found ?? DEFAULT_SIZE
}

function stepSize(current: SizeToken, by: 1 | -1): SizeToken {
  const index = SIZE_TOKENS.indexOf(current)
  const next = Math.min(SIZE_TOKENS.length - 1, Math.max(0, index + by))
  return SIZE_TOKENS[next] ?? current
}

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
  active,
  list,
  onList,
  onToggle,
  onResize,
}: {
  readonly active: readonly Mark[]
  readonly list: ListKind | undefined
  readonly onList: (kind: ListKind) => void
  readonly onToggle: (mark: Mark) => void
  readonly onResize: (by: 1 | -1) => void
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
      className="of-format-bar of-surface"
      data-testid="format-bar"
      role="toolbar"
      aria-label="Text formatting"
      onMouseDown={keepFocus}
    >
      {MARK_BUTTONS.map(({ mark, label, glyph }) => (
        <button
          key={mark}
          type="button"
          className={`of-icon-button of-format-bar__button of-format-bar__button--${mark}`}
          aria-label={label}
          aria-pressed={active.includes(mark)}
          data-tip={label}
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

      {/*
       * Stepping buttons, not a dropdown.
       *
       * Every control here has to prevent `mousedown` or it takes focus, which
       * blurs the editor and COMMITS — and preventing mousedown on a native
       * `<select>` also stops the browser opening it, so the dropdown could
       * not be used at all. It also matches what was asked for: increasing and
       * decreasing the size, rather than naming one.
       */}
      <button
        type="button"
        className="of-icon-button of-format-bar__button of-format-bar__button--size"
        aria-label="Smaller text"
        data-tip="Smaller"
        aria-description="Smaller"
        data-testid="format-smaller"
        onMouseDown={keepFocus}
        onClick={() => {
          onResize(-1)
        }}
      >
        A−
      </button>
      <button
        type="button"
        className="of-icon-button of-format-bar__button of-format-bar__button--size of-format-bar__button--bigger"
        aria-label="Bigger text"
        data-tip="Bigger"
        aria-description="Bigger"
        data-testid="format-bigger"
        onMouseDown={keepFocus}
        onClick={() => {
          onResize(1)
        }}
      >
        A+
      </button>

      <span className="of-format-bar__rule" aria-hidden="true" />

      {LIST_BUTTONS.map(({ kind, label, keys, Icon }) => (
        <button
          key={kind}
          type="button"
          className="of-icon-button of-format-bar__button"
          aria-label={label}
          aria-pressed={list === kind}
          aria-keyshortcuts={keys}
          data-tip={`${label} ${shown(keys)}`}
          aria-description={`${label} ${shown(keys)}`}
          data-testid={`format-${kind}`}
          onMouseDown={keepFocus}
          onClick={() => {
            onList(kind)
          }}
        >
          <Icon />
        </button>
      ))}
    </div>
  )
}

const MOD = IS_MAC ? 'Meta' : 'Control'
/** A shortcut as a tip shows it: the platform's own glyphs. */
const shown = (keys: string): string =>
  IS_MAC ? keys.replace('Meta+Shift+', '⌘⇧') : keys.replace('Control', 'Ctrl')

const LIST_BUTTONS: readonly {
  readonly kind: ListKind
  readonly label: string
  readonly keys: string
  readonly Icon: typeof BulletListIcon
}[] = [
  { kind: 'bullet', label: 'Bulleted list', keys: `${MOD}+Shift+8`, Icon: BulletListIcon },
  { kind: 'number', label: 'Numbered list', keys: `${MOD}+Shift+7`, Icon: NumberListIcon },
]
