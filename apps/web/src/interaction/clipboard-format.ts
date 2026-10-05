/**
 * The system clipboard's copy of a board selection.
 *
 * Browsers only carry three things between tabs and applications without a
 * permission or a flag: plain text, HTML and pictures. So a copy writes BOTH:
 * the plain text is what a document or a chat window pastes — the words on
 * what was copied — and the HTML carries the board's own copy format
 * (`ClipboardContent`) on an attribute, where another OpenFrame board finds
 * it and nothing else pays it any attention.
 *
 * Reading it back is a string search, never a parse into a live document: a
 * paste can come from anywhere, and the markup it brings is not ours. What the
 * attribute holds is checked object by object by `PasteObjects` like any board
 * loaded from storage.
 */

const ATTRIBUTE = 'data-openframe-clipboard'
const CARRIED = new RegExp(`${ATTRIBUTE}="([A-Za-z0-9+/=]*)"`)

function toBase64(text: string): string {
  let binary = ''
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(encoded: string): string {
  const binary = atob(encoded)
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)))
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export interface ClipboardPayload {
  readonly text: string
  readonly html: string
  /**
   * The picture, as a PNG, when what was copied is one image. Pending, because
   * it has to be read and encoded — so only a write that can wait for it
   * (`writeSystemClipboard`) can carry it.
   */
  readonly picture?: Promise<Blob | null>
}

/**
 * `content` as the system clipboard holds it. `lines` are the words a reader
 * of the plain text should see — one per thing copied.
 */
export function toClipboard(content: unknown, lines: readonly string[]): ClipboardPayload {
  const text = lines.join('\n')
  const paragraphs = lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')
  return {
    text,
    html: `<meta charset="utf-8"><div ${ATTRIBUTE}="${toBase64(JSON.stringify(content))}">${paragraphs}</div>`,
  }
}

/**
 * The board content in pasted HTML, or `undefined` when it carries none.
 * `undefined` rather than `null`, because `null` is a value a hostile
 * clipboard could carry, and the command must be the one to refuse it.
 */
export function fromClipboard(html: string): unknown {
  const found = CARRIED.exec(html)?.[1]
  if (found === undefined) return undefined
  try {
    return JSON.parse(fromBase64(found)) as unknown
  } catch {
    return undefined
  }
}

/**
 * Writes a copy to the system clipboard outside a clipboard event — the
 * menu's Copy, and a copied picture, which a clipboard event cannot carry.
 * Resolves false when the browser refuses (no permission, an insecure page,
 * no `ClipboardItem`); the tab's own copy still stands.
 *
 * A picture that cannot be had (not in this browser, or not decodable) is
 * not worth losing the rest for, so the words and the board copy are written
 * again without it.
 */
export async function writeSystemClipboard(payload: ClipboardPayload): Promise<boolean> {
  if (typeof ClipboardItem === 'undefined' || typeof navigator.clipboard?.write !== 'function') {
    return false
  }
  const words = {
    'text/plain': new Blob([payload.text], { type: 'text/plain' }),
    'text/html': new Blob([payload.html], { type: 'text/html' }),
  }
  const write = async (item: Record<string, Blob | Promise<Blob>>): Promise<boolean> => {
    try {
      await navigator.clipboard.write([new ClipboardItem(item)])
      return true
    } catch {
      return false
    }
  }
  if (payload.picture !== undefined) {
    /*
     * Handed over as a promise rather than awaited first: Safari only writes
     * inside the gesture that asked, and an item made after an await is no
     * longer inside it.
     */
    const picture = payload.picture.then((blob) => blob ?? Promise.reject(new Error('no picture')))
    if (await write({ ...words, 'image/png': picture })) return true
  }
  return write(words)
}
