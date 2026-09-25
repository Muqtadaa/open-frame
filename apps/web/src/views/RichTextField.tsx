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
import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type Ref,
} from 'react'

import {
  renderSpansInto,
  selectionOffsets,
  setSelectionOffsets,
  spansFromElement,
} from './rich-text-dom.js'

/** What the formatting controls should show for where the caret is. */
export interface FormatState {
  readonly marks: readonly Mark[]
  readonly list: ListKind | undefined
  /** The size the next step starts from; undefined when the text disagrees. */
  readonly size: SizeToken | undefined
}

/** The commands a format bar sends to whichever field it is driving. */
export interface RichTextFieldHandle {
  readonly toggleMark: (mark: Mark) => void
  readonly resize: (by: 1 | -1) => void
  readonly toggleList: (kind: ListKind) => void
  /** The text as it stands, read from the element. */
  readonly read: () => RichText
  /** Takes the keyboard back, with the selection it had — Escape from the bar. */
  readonly focus: () => void
}

interface Props {
  readonly initialText: RichText
  readonly className: string
  readonly style?: CSSProperties | undefined
  readonly ariaLabel: string
  readonly testId?: string | undefined
  readonly handle?: Ref<RichTextFieldHandle> | undefined
  /** Where the caret goes when the field mounts, or nowhere. */
  readonly focusOnMount?: 'select-all' | 'end' | false | undefined
  /**
   * Which key makes a new paragraph. A note's editor takes Enter; a table cell
   * gives Enter to "finish" and makes paragraphs — list items included — with
   * Shift+Enter instead.
   */
  readonly newParagraph?: 'Enter' | 'Shift+Enter' | undefined
  /** Called with the text after every edit — typing and formatting alike. */
  readonly onChange?: ((text: RichText) => void) | undefined
  readonly onFormatState?: ((state: FormatState) => void) | undefined
  /**
   * The host's keys, seen FIRST. A host that handles one — Escape, a commit —
   * prevents its default, and the field then leaves it alone.
   */
  readonly onKeyDown?: ((event: KeyboardEvent<HTMLDivElement>) => void) | undefined
  readonly onBlur?: ((event: React.FocusEvent<HTMLDivElement>) => void) | undefined
  readonly onFocus?: (() => void) | undefined
  readonly onPointerDown?: ((event: PointerEvent<HTMLDivElement>) => void) | undefined
  /** Anything else the host needs on the element: a data attribute, a ring. */
  readonly attributes?: Readonly<Record<`data-${string}`, string | undefined>> | undefined
}

const SHORTCUTS: Readonly<Record<string, Mark>> = { b: 'bold', i: 'italic', u: 'underline' }

/** The marks a button can show. */
export const MARK_LIST: readonly Mark[] = ['bold', 'italic', 'underline', 'strike']

/**
 * An editable piece of rich text, and the one every text in the product uses:
 * notes, labels, titles and table cells (ADR 0012, ADR 0014).
 *
 * The division of labour is the whole design. The BROWSER handles typing,
 * because fighting it over every keystroke breaks IME composition, autocorrect,
 * spellcheck and the platform's own text gestures — and it splits a paragraph
 * on Enter, copying a list item's attributes onto the new one. The MODEL
 * handles formatting, because `applyMark`, `setList` and the rest in core are
 * pure, tested, and the only things that know how runs and paragraphs split
 * and merge. So: type freely, and on a formatting command the element is read
 * back, transformed, re-rendered and the caret put back.
 *
 * It does not decide when an edit ENDS — a note commits on blur, a table when
 * focus leaves the whole grid. That is the host's, through `onKeyDown`,
 * `onBlur` and `read`.
 */
export function RichTextField({
  initialText,
  className,
  style,
  ariaLabel,
  testId = 'rich-text-editor',
  handle,
  focusOnMount = false,
  newParagraph = 'Enter',
  onChange,
  onFormatState,
  onKeyDown,
  onBlur,
  onFocus,
  onPointerDown,
  attributes,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  /*
   * The latest callbacks, for the selection listener that is bound once.
   * Written in an effect, never during render.
   */
  const reportRef = useRef(onFormatState)
  useEffect(() => {
    reportRef.current = onFormatState
  })

  /*
   * Filled imperatively, and React never renders children here: the browser
   * owns this subtree while the user types — see `renderSpansInto`.
   */
  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) return
    renderSpansInto(element, initialText)
    // The text a field STARTS with is its own; later changes come from typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const element = ref.current
    if (element === null || focusOnMount === false) return
    element.focus()
    const selection = element.ownerDocument.getSelection()
    const range = element.ownerDocument.createRange()
    range.selectNodeContents(element)
    // Select everything for a note, which is almost always retyped rather than
    // appended to; the end for a cell, which is usually added to.
    if (focusOnMount === 'end') range.collapse(false)
    selection?.removeAllRanges()
    selection?.addRange(range)
    // Once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const report = (text: RichText, from: number, to: number): void => {
    // A caret with nothing selected resizes the WHOLE text (see `reformat`),
    // so that is the size the readout names.
    const sized = to > from ? { from, to } : { from: 0, to: plainTextOf(text).length }
    reportRef.current?.({
      marks: MARK_LIST.filter((mark) => markCovers(text, from, to, mark)),
      list: listOf(text, from, to),
      size: sizeOfRange(text, sized.from, sized.to),
    })
  }

  /*
   * The buttons follow the CARET: moving into a bold word lights "bold"
   * without anything else having changed. Only while this field has the
   * selection, so a table's other cells do not report over the focused one.
   */
  useEffect(() => {
    const element = ref.current
    if (element === null) return
    const owner = element.ownerDocument
    const sync = (): void => {
      const at = selectionOffsets(element)
      if (at === null) return
      report(spansFromElement(element), at.from, at.to)
    }
    owner.addEventListener('selectionchange', sync)
    return () => {
      owner.removeEventListener('selectionchange', sync)
    }
  }, [])

  /** Writes a transformed text back and puts the selection where it belongs. */
  const redraw = (next: RichText, from: number, to: number): void => {
    const element = ref.current
    if (element === null) return
    renderSpansInto(element, next)
    setSelectionOffsets(element, from, to)
    report(next, from, to)
    onChange?.(next)
  }

  /*
   * A change to CHARACTERS. No selection means the WHOLE text: someone who
   * clicks into a note and presses "bigger" means the note, not the empty
   * space at the caret, and silently doing nothing is how that read as broken.
   */
  const reformat = (transform: (text: RichText, from: number, to: number) => RichText): void => {
    const element = ref.current
    if (element === null) return
    const current = spansFromElement(element)
    const selected = selectionOffsets(element)
    const range =
      selected === null || selected.to <= selected.from
        ? { from: 0, to: plainTextOf(current).length }
        : selected
    if (range.to <= range.from) return
    redraw(transform(current, range.from, range.to), range.from, range.to)
  }

  /*
   * A change to PARAGRAPHS. Unlike marks, a caret with nothing selected means
   * the paragraph it is in: pressing "bullet" mid-note makes that line an item.
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
    const from = Math.max(0, range.from - shift)
    redraw(transform(current, range.from, range.to), from, Math.max(from, range.to - shift))
  }

  const toggleMark = (mark: Mark): void => {
    reformat((text, from, to) => applyMark(text, from, to, mark, !markCovers(text, from, to, mark)))
  }

  const resize = (by: 1 | -1): void => {
    reformat((text, from, to) => {
      const next = stepSize(sizeOfRange(text, from, to), by)
      // `md` is the object's own size, so it is stored as no size at all.
      return applySize(text, from, to, next === DEFAULT_SIZE ? undefined : next)
    })
  }

  const toggleList = (kind: ListKind): void => {
    reshape((text, from, to) =>
      setList(text, from, to, listOf(text, from, to) === kind ? undefined : kind),
    )
  }

  /*
   * Where the selection was when the field last had it. Focusing a
   * contenteditable does not reliably put a selection back, and coming home
   * from the format bar to a caret at the start of the note would lose
   * somebody's place.
   */
  const lastSelection = useRef<{ from: number; to: number } | null>(null)

  useImperativeHandle(handle, () => ({
    toggleMark,
    resize,
    toggleList,
    read: () => (ref.current === null ? initialText : spansFromElement(ref.current)),
    focus: () => {
      const element = ref.current
      if (element === null) return
      const at = selectionOffsets(element) ?? lastSelection.current
      element.focus()
      if (at !== null) setSelectionOffsets(element, at.from, at.to)
    },
  }))

  /** The paragraph a collapsed caret is in, and where in it, or null. */
  const caretParagraph = () => {
    const element = ref.current
    if (element === null) return null
    const at = selectionOffsets(element)
    if (at === null || at.from !== at.to) return null
    const text = spansFromElement(element)
    const paragraphs = paragraphsOf(text)
    const index = paragraphs.findIndex((p) => p.from <= at.from && at.from <= p.to)
    const paragraph = paragraphs[index]
    return paragraph === undefined ? null : { text, paragraph, index, at: at.from }
  }

  const keys = (event: KeyboardEvent<HTMLDivElement>): void => {
    // Keep board shortcuts from firing while typing: a 'v' in a note must stay
    // a 'v', not switch tools.
    event.stopPropagation()
    onKeyDown?.(event)
    if (event.defaultPrevented) return

    const mod = event.metaKey || event.ctrlKey

    // The list shortcuts every document editor shares: Mod+Shift+8 for
    // bullets, Mod+Shift+7 for numbers. By CODE, because Shift+8 is "*" on
    // one keyboard and something else on the next.
    if (mod && event.shiftKey) {
      const kind = event.code === 'Digit8' ? 'bullet' : event.code === 'Digit7' ? 'number' : null
      if (kind !== null) {
        event.preventDefault()
        toggleList(kind)
        return
      }
      /*
       * The rest of the bar, from the keyboard: strikethrough as the editors
       * that have one bind it, and size as a word processor steps it
       * (Mod+Shift+> and <). Every button had a shortcut but these three.
       */
      if (event.code === 'KeyX') {
        event.preventDefault()
        toggleMark('strike')
        return
      }
      if (event.code === 'Period' || event.code === 'Comma') {
        event.preventDefault()
        resize(event.code === 'Period' ? 1 : -1)
        return
      }
    }

    /*
     * Alt+F10 into the format bar — the ARIA toolbar key, as document
     * editors bind it. The bar was out of the keyboard's reach: Tab left the
     * text, which ended the edit and took the bar away with it.
     */
    if (event.altKey && event.key === 'F10') {
      const bar = ref.current?.ownerDocument.querySelector<HTMLElement>(
        '[data-testid="format-bar"] button',
      )
      if (bar !== null && bar !== undefined) {
        event.preventDefault()
        const element = ref.current
        lastSelection.current = element === null ? null : selectionOffsets(element)
        bar.focus()
        return
      }
    }

    if (event.key === 'Tab') {
      const element = ref.current
      const at = element === null ? null : selectionOffsets(element)
      // Only a list nests. A Tab anywhere else leaves the field, as it leaves
      // every other one.
      if (
        element !== null &&
        at !== null &&
        listOf(spansFromElement(element), at.from, at.to) !== undefined
      ) {
        event.preventDefault()
        reshape((current, from, to) => indentBy(current, from, to, event.shiftKey ? -1 : 1))
        return
      }
    }

    if (event.key === 'Enter') {
      const splits = newParagraph === 'Enter' ? !event.shiftKey : event.shiftKey
      if (splits) {
        const here = caretParagraph()
        // Enter on an EMPTY item ends the list, as it does everywhere else.
        if (here?.paragraph.list !== undefined && here.paragraph.to === here.paragraph.from) {
          event.preventDefault()
          reshape((current, from, to) => setList(current, from, to, undefined))
          return
        }
        // Where Shift+Enter is the paragraph key, it has to SPLIT the block —
        // the browser's own Shift+Enter is a soft break inside it.
        if (newParagraph === 'Shift+Enter') {
          event.preventDefault()
          event.currentTarget.ownerDocument.execCommand('insertParagraph')
          onChange?.(spansFromElement(event.currentTarget))
          return
        }
      }
    }

    if (event.key === 'Backspace') {
      const here = caretParagraph()
      // At the very start of an item, Backspace takes the bullet away first
      // and leaves the words; a second press joins the lines.
      if (here?.paragraph.list !== undefined && here.at === here.paragraph.from) {
        event.preventDefault()
        reshape((current, from, to) => setList(current, from, to, undefined))
        return
      }
    }

    if (event.key === ' ') {
      const here = caretParagraph()
      if (here !== null && here.paragraph.list === undefined) {
        const typed = plainTextOf(here.paragraph.spans).slice(0, here.at - here.paragraph.from)
        // "- " or "* " starts a bulleted list and "1. " a numbered one, typed
        // at the start of a line: what people type anyway.
        const kind = typed === '-' || typed === '*' ? 'bullet' : typed === '1.' ? 'number' : null
        if (kind !== null) {
          event.preventDefault()
          // A change to THE PARAGRAPH, never a character edit: see
          // `updateParagraph` for the empty line it would otherwise lose.
          reshape(
            (current) =>
              updateParagraph(current, here.index, (paragraph) => ({
                spans: spliceText(paragraph.spans, 0, typed.length, [{ text: '' }]),
                list: kind,
              })),
            typed.length,
          )
          return
        }
      }
    }

    const mark = mod ? SHORTCUTS[event.key.toLowerCase()] : undefined
    if (mark !== undefined) {
      event.preventDefault()
      toggleMark(mark)
    }
  }

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label={ariaLabel}
      data-testid={testId}
      {...attributes}
      onKeyDown={keys}
      onInput={(event) => {
        onChange?.(spansFromElement(event.currentTarget))
      }}
      onBlur={onBlur}
      onFocus={onFocus}
      onPointerDown={onPointerDown}
      onPaste={(event) => {
        /*
         * Never the browser's own paste, which inserts arbitrary markup —
         * fonts, colours, tables, scripts — into a document this product is
         * committed to accepting from other people.
         */
        event.preventDefault()
        const element = event.currentTarget
        const html = event.clipboardData.getData('text/html')
        if (html !== '') {
          /*
           * Markup is READ, never inserted. It is parsed into a document that
           * is never rendered — nothing in it loads or runs — and only what the
           * reader understands comes out: the characters, the four marks, the
           * sizes and the lists. Then it is spliced into the model and drawn
           * from it like any other edit.
           */
          const parsed = new DOMParser().parseFromString(html, 'text/html')
          const pasted = spansFromElement(parsed.body)
          if (plainTextOf(pasted) !== '') {
            const at = selectionOffsets(element) ?? { from: 0, to: 0 }
            const caret = at.from + plainTextOf(pasted).length
            redraw(spliceText(spansFromElement(element), at.from, at.to, pasted), caret, caret)
            return
          }
        }
        const text = event.clipboardData.getData('text/plain')
        if (text !== '') element.ownerDocument.execCommand('insertText', false, text)
      }}
    />
  )
}

/**
 * The size the selection currently reads as, for stepping up and down from.
 *
 * The object's own size when the runs disagree: stepping from a mixed selection
 * has to start somewhere, and the default is the least surprising place.
 */
export function sizeOfRange(text: RichText, from: number, to: number): SizeToken {
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

export function stepSize(current: SizeToken, by: 1 | -1): SizeToken {
  const index = SIZE_TOKENS.indexOf(current)
  const next = Math.min(SIZE_TOKENS.length - 1, Math.max(0, index + by))
  return SIZE_TOKENS[next] ?? current
}
