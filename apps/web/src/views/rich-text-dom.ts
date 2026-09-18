import { MARKS, SIZE_TOKENS, normaliseText, type Mark, type RichText, type SizeToken } from '@openframe/core'

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
 * The spans currently in the element.
 *
 * `<br>` becomes a newline because that is what a contenteditable produces for
 * Enter; without it a two-line note round-trips as one line and the user's
 * layout is silently destroyed on the next edit.
 */
export function spansFromElement(root: Element): RichText {
  const spans: { text: string; marks?: readonly Mark[]; size?: SizeToken }[] = []
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      if (text === '') return
      const marks = marksOn(node, root)
      const size = sizeOn(node, root)
      spans.push({
        text,
        ...(marks.length === 0 ? {} : { marks }),
        ...(size === undefined ? {} : { size }),
      })
      return
    }
    if (node instanceof HTMLBRElement) {
      spans.push({ text: '\n' })
      return
    }
    for (const child of [...node.childNodes]) walk(child)
  }
  walk(root)
  return normaliseText(spans)
}

/** Where the selection is, in PLAIN-TEXT offsets — what `applyMark` speaks. */
export function selectionOffsets(root: Element): { from: number; to: number } | null {
  const selection = root.ownerDocument.getSelection()
  if (selection === null || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null

  const before = range.cloneRange()
  before.selectNodeContents(root)
  before.setEnd(range.startContainer, range.startOffset)
  const from = plainLengthOf(before.cloneContents())
  return { from, to: from + plainLengthOf(range.cloneContents()) }
}

/**
 * `instanceof HTMLBRElement` against the GLOBAL class is wrong in any document
 * that is not this window's — an iframe, or jsdom in a test, where the class is
 * a different object entirely. Compared by tag name, which is true everywhere.
 */
function isLineBreak(node: Node): boolean {
  return node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'BR'
}

/**
 * The plain-text length of a fragment, counting `<br>` as one character.
 *
 * `textContent` does NOT count line breaks — a two-line selection measured with
 * it is short by one character per line, so a mark applied near the end lands
 * on the wrong words. That is the bug this function exists to avoid.
 */
function plainLengthOf(fragment: DocumentFragment): number {
  let length = 0
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      length += (node.textContent ?? '').length
      return
    }
    if (isLineBreak(node)) {
      length += 1
      return
    }
    for (const child of [...node.childNodes]) walk(child)
  }
  walk(fragment)
  return length
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

  const locate = (target: number): { node: Node; offset: number } | null => {
    let seen = 0
    let found: { node: Node; offset: number } | null = null
    const walk = (node: Node): void => {
      if (found !== null) return
      if (node.nodeType === Node.TEXT_NODE) {
        const length = (node.textContent ?? '').length
        if (seen + length >= target) found = { node, offset: target - seen }
        seen += length
        return
      }
      if (isLineBreak(node)) {
        if (seen >= target) found = { node: node.parentNode ?? root, offset: 0 }
        seen += 1
        return
      }
      for (const child of [...node.childNodes]) walk(child)
    }
    walk(root)
    return found
  }

  const start = locate(from)
  const end = locate(to)
  if (start === null || end === null) return
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
  for (const span of spans) {
    // A newline is a character, not a `<br>`: the container sets `pre-wrap`, so
    // it renders as a break and round-trips through the model unchanged.
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
    root.append(node)
  }
}
