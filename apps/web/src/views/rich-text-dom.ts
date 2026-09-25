import {
  MARKS,
  SIZE_TOKENS,
  normaliseText,
  paragraphsOf,
  textFromParagraphs,
  type Indent,
  type ListKind,
  type Mark,
  type Paragraph,
  type RichText,
  type SizeToken,
  type TextSpan,
} from '@openframe/core'

/**
 * Reading formatted text back out of a `contenteditable`, and putting a caret
 * back where it was.
 *
 * The MODEL is authoritative and the DOM is a projection of it. The browser is
 * allowed to handle plain typing — fighting it over every keystroke breaks IME
 * composition, autocorrect and the platform's own text gestures — but every
 * formatting change goes through `applyMark` in core and is rendered back.
 *
 * Which means this module has exactly one job: translate faithfully in both
 * directions. Everything else about the editor depends on it being right.
 */

const TAG_MARKS: Readonly<Record<string, Mark>> = {
  B: 'bold',
  STRONG: 'bold',
  I: 'italic',
  EM: 'italic',
  U: 'underline',
  S: 'strike',
  STRIKE: 'strike',
  DEL: 'strike',
}

function marksOn(node: Node, root: Element): Mark[] {
  const marks = new Set<Mark>()
  let current: Node | null = node
  while (current !== null && current !== root) {
    if (current instanceof HTMLElement) {
      const tag = TAG_MARKS[current.tagName]
      if (tag !== undefined) marks.add(tag)
      /*
       * Pasted markup does not use our tags. A browser copying bold text out of
       * another app hands over inline styles, and dropping them would silently
       * discard formatting the user can see on their clipboard.
       */
      const weight = current.style.fontWeight
      if (weight === 'bold' || Number(weight) >= 600) marks.add('bold')
      if (current.style.fontStyle === 'italic') marks.add('italic')
      const decoration = current.style.textDecorationLine || current.style.textDecoration
      if (decoration.includes('underline')) marks.add('underline')
      if (decoration.includes('line-through')) marks.add('strike')
    }
    current = current.parentNode
  }
  return [...marks].sort()
}

function sizeOn(node: Node, root: Element): SizeToken | undefined {
  let current: Node | null = node
  while (current !== null && current !== root) {
    if (current instanceof HTMLElement) {
      const size = current.dataset.size
      if (size !== undefined && (SIZE_TOKENS as readonly string[]).includes(size)) {
        return size as SizeToken
      }
    }
    current = current.parentNode
  }
  return undefined
}

/**
 * Elements that start a new paragraph. Everything else is inline.
 *
 * Our own markup uses `div.of-p`; the rest are what a browser's contenteditable
 * produces on Enter and what arrives from another application's markup, which
 * has to read as the paragraphs it looks like rather than as one long line.
 */
const BLOCKS = new Set([
  'DIV',
  'P',
  'LI',
  'UL',
  'OL',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'BLOCKQUOTE',
  'PRE',
  'SECTION',
  'ARTICLE',
])

function isBlock(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE && BLOCKS.has((node as Element).tagName)
}

interface SpanDraft {
  text: string
  marks?: readonly Mark[]
  size?: SizeToken
}
interface Block {
  list?: ListKind
  indent?: Indent
}

/** One paragraph as read, plus where it is so a caret can be put back in it. */
interface ReadParagraph extends Block {
  spans: SpanDraft[]
  /** The element the paragraph lives in, for placing a caret in an empty one. */
  readonly home: Node
  /** Plain-text offset of its first character. */
  start: number
}

interface Reading {
  readonly paragraphs: ReadParagraph[]
  /** Every text node read, with the plain-text offset it starts at. */
  readonly texts: { readonly node: Text; readonly start: number }[]
}

/** A block's own paragraph attributes, from our markup or from a real list. */
function blockOf(element: Element, lists: readonly ListKind[]): Block {
  const html = element as HTMLElement
  const kind = html.dataset.list
  if (kind === 'bullet' || kind === 'number') {
    const depth = Number(html.dataset.indent ?? '0')
    return depth >= 1 && depth <= 3 ? { list: kind, indent: depth as Indent } : { list: kind }
  }
  if (element.tagName === 'LI' && lists.length > 0) {
    const kindHere = lists[lists.length - 1] ?? 'bullet'
    const depth = Math.min(3, lists.length - 1)
    return depth === 0 ? { list: kindHere } : { list: kindHere, indent: depth as Indent }
  }
  return {}
}

/**
 * The element read as paragraphs (ADR 0014), recording where each character
 * came from.
 *
 * A LEAF block — one holding no other block — is one paragraph. Inline content
 * sitting directly beside blocks (what Chrome leaves when a first line was typed
 * straight into the root and the second pressed Enter) is a paragraph of its
 * own. A `<br>` inside a paragraph starts another; a `<br>` that ENDS its block
 * is the placeholder a browser puts in an empty line, and is not a second one.
 */
function read(root: Element): Reading {
  const paragraphs: ReadParagraph[] = []
  const texts: { node: Text; start: number }[] = []
  let at = 0
  let open: ReadParagraph | null = null

  const begin = (home: Node, block: Block): ReadParagraph => {
    if (paragraphs.length > 0) at += 1
    const paragraph: ReadParagraph = { spans: [], home, start: at, ...block }
    paragraphs.push(paragraph)
    open = paragraph
    return paragraph
  }

  const walkInline = (node: Node, home: Node, block: Block): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      if (text === '') return
      const marks = marksOn(node, root)
      const size = sizeOn(node, root)
      // A newline in a text node is a paragraph break — how `pre-wrap` text
      // written before paragraphs existed, and pasted plain text, spell one.
      text.split('\n').forEach((piece, index) => {
        if (index > 0) begin(home, {})
        const paragraph = open ?? begin(home, block)
        if (index === 0) texts.push({ node: node as Text, start: at })
        if (piece === '') return
        paragraph.spans.push({
          text: piece,
          ...(marks.length === 0 ? {} : { marks }),
          ...(size === undefined ? {} : { size }),
        })
        at += piece.length
      })
      return
    }
    if (isLineBreak(node)) {
      const placeholder = node.nextSibling === null && node.parentNode !== root
      if (open === null) begin(home, block)
      if (!placeholder) begin(home, {})
      return
    }
    for (const child of [...node.childNodes]) walkInline(child, home, block)
  }

  const walkBlock = (element: Element, lists: readonly ListKind[]): void => {
    const nested =
      element.tagName === 'UL' || element.tagName === 'OL'
        ? [...lists, element.tagName === 'OL' ? ('number' as const) : ('bullet' as const)]
        : lists
    const block = blockOf(element, lists)
    const children = [...element.childNodes]
    if (!children.some(isBlock)) {
      if (element.tagName === 'UL' || element.tagName === 'OL') return
      // A leaf: exactly one paragraph, even an empty one.
      begin(element, block)
      for (const child of children) walkInline(child, element, block)
      open = null
      return
    }
    // Mixed: runs of inline content between blocks are paragraphs of their own.
    for (const child of children) {
      if (isBlock(child)) {
        open = null
        walkBlock(child, nested)
        open = null
      } else if (child.nodeType !== Node.TEXT_NODE || (child.textContent ?? '').trim() !== '') {
        walkInline(child, child, block)
      }
    }
    open = null
  }

  if ([...root.childNodes].some(isBlock)) {
    for (const child of [...root.childNodes]) {
      if (isBlock(child)) {
        open = null
        walkBlock(child, [])
        open = null
      } else {
        walkInline(child, child, {})
      }
    }
  } else {
    begin(root, {})
    for (const child of [...root.childNodes]) walkInline(child, root, {})
  }
  if (paragraphs.length === 0) begin(root, {})
  return { paragraphs, texts }
}

/**
 * The text currently in the element.
 *
 * Read as paragraphs and written back in the one canonical spelling, so a list
 * the browser extended by pressing Enter comes back as a list, and a note that
 * was never touched comes back exactly as it was.
 */
export function spansFromElement(root: Element): RichText {
  return textFromParagraphs(
    read(root).paragraphs.map(({ spans, list, indent }) => ({
      spans: normaliseText(spans).filter((span) => span.text !== ''),
      ...(list === undefined ? {} : { list }),
      ...(indent === undefined ? {} : { indent }),
    })),
  )
}

/** Whether a point sits at or after another, in document order. */
function atOrAfter(
  root: Element,
  node: Node,
  offset: number,
  than: Node,
  thanOffset: number,
): boolean {
  const range = root.ownerDocument.createRange()
  range.setStart(than, thanOffset)
  return range.comparePoint(node, offset) >= 0
}

/** A DOM point as a plain-text offset, by the same reading `spansFromElement` does. */
function offsetOf(root: Element, reading: Reading, node: Node, offset: number): number {
  let result = 0
  for (const paragraph of reading.paragraphs) {
    if (atOrAfter(root, node, offset, paragraph.home, 0)) result = Math.max(result, paragraph.start)
  }
  for (const text of reading.texts) {
    if (node === text.node) return text.start + offset
    const length = text.node.textContent?.length ?? 0
    if (atOrAfter(root, node, offset, text.node, length)) {
      result = Math.max(result, text.start + length)
    }
  }
  return result
}

/** Where the selection is, in PLAIN-TEXT offsets — what `applyMark` speaks. */
export function selectionOffsets(root: Element): { from: number; to: number } | null {
  const selection = root.ownerDocument.getSelection()
  if (selection === null || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null
  const reading = read(root)
  const from = offsetOf(root, reading, range.startContainer, range.startOffset)
  const to = offsetOf(root, reading, range.endContainer, range.endOffset)
  return { from: Math.min(from, to), to: Math.max(from, to) }
}

function isLineBreak(node: Node): boolean {
  return node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'BR'
}

/**
 * Puts the caret back at a plain-text offset after the element is re-rendered.
 *
 * Re-rendering from the model destroys the DOM selection, so without this every
 * press of Cmd+B would dump the caret at the start of the note and the user
 * would lose their place mid-sentence.
 */
export function setSelectionOffsets(root: Element, from: number, to: number): void {
  const selection = root.ownerDocument.getSelection()
  if (selection === null) return
  const reading = read(root)

  const locate = (target: number): { node: Node; offset: number } => {
    for (const text of reading.texts) {
      const length = text.node.textContent?.length ?? 0
      if (target >= text.start && target <= text.start + length) {
        return { node: text.node, offset: target - text.start }
      }
    }
    // An empty paragraph has no text node: the caret goes inside its block.
    const paragraph = [...reading.paragraphs].reverse().find((p) => p.start <= target)
    return { node: paragraph?.home ?? root, offset: 0 }
  }

  const start = locate(from)
  const end = locate(to)
  const range = root.ownerDocument.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset)
  selection.removeAllRanges()
  selection.addRange(range)
}

export { MARKS }

const MARK_TAGS: Readonly<Record<Mark, string>> = {
  bold: 'strong',
  italic: 'em',
  underline: 'u',
  strike: 's',
}

/**
 * Writes spans into an element as real DOM nodes.
 *
 * Built imperatively rather than rendered by React, and that is a deliberate
 * choice rather than an oversight. The browser mutates this subtree on every
 * keystroke — which is the point, because fighting it breaks IME composition,
 * autocorrect and the platform's text gestures — and React cannot reconcile
 * against a tree that no longer matches its last render without destroying what
 * was typed. A second React root has the same problem from the other end: under
 * StrictMode the double-mount hands the same container to `createRoot` twice.
 *
 * Nodes, never an HTML string. `innerHTML` would need escaping that is correct
 * for every input, on a document format this product accepts from other people;
 * `createTextNode` cannot be made to execute anything.
 */
export function renderSpansInto(root: Element, spans: RichText): void {
  root.textContent = ''
  const owner = root.ownerDocument
  for (const paragraph of paragraphsOf(spans)) {
    root.append(paragraphElement(owner, paragraph))
  }
}

/**
 * One paragraph as a block (ADR 0014). A list item says so in data attributes
 * the stylesheet draws the bullet or number from — and that a browser COPIES
 * when Enter splits the block, which is what makes pressing Enter in a list
 * continue the list without this module having to intervene.
 */
function paragraphElement(owner: Document, paragraph: Paragraph): HTMLElement {
  const block = owner.createElement('div')
  block.className = 'of-p'
  if (paragraph.list !== undefined) block.dataset.list = paragraph.list
  if (paragraph.indent !== undefined) block.dataset.indent = String(paragraph.indent)
  for (const span of paragraph.spans) block.append(inlineNode(owner, span))
  // An empty block has no height and no place for a caret; a browser's own
  // empty line is spelled exactly like this, and it reads back as nothing.
  if (paragraph.spans.length === 0) block.append(owner.createElement('br'))
  return block
}

function inlineNode(owner: Document, span: TextSpan): Node {
  let node: Node = owner.createTextNode(span.text)
  // Applied in a fixed order, so the same formatting always produces the same
  // markup and a re-render never looks like a change that did not happen.
  for (const mark of ['strike', 'underline', 'italic', 'bold'] as const) {
    if (span.marks?.includes(mark) !== true) continue
    const wrapper = owner.createElement(MARK_TAGS[mark])
    wrapper.append(node)
    node = wrapper
  }
  if (span.size !== undefined) {
    const sized = owner.createElement('span')
    sized.className = `of-size of-size--${span.size}`
    sized.dataset.size = span.size
    sized.append(node)
    node = sized
  }
  return node
}
