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

/** Copies made so far: a write that is not the latest must not land over a newer one. */
let copies = 0

/**
 * A copy has just been written some other way (a clipboard event), so any
 * picture write still pending from an earlier one is stale (Codex, on #77).
 */
export function supersedeWrites(): void {
  copies += 1
}

function base64Of(bytes: Uint8Array): string {
  let binary = ''
  for (let at = 0; at < bytes.length; at += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
  }
  return btoa(binary)
}

/**
 * The copy's HTML with the picture in it, in place of its words: an editor
 * that prefers HTML to an image would otherwise paste the picture's name
 * with the PNG sitting unused beside it (Codex, on #77). The board's own copy
 * stays on the same element, so a board still finds it.
 */
export async function htmlWithPicture(payload: ClipboardPayload, picture: Blob): Promise<string> {
  const source = `data:image/png;base64,${base64Of(new Uint8Array(await picture.arrayBuffer()))}`
  const image = `<img src="${source}" alt="${escapeHtml(payload.text)}">`
  return payload.html.replace(/(<div [^>]*>)[\s\S]*(<\/div>)$/, `$1${image}$2`)
}

/**
 * Writes a copy to the system clipboard outside a clipboard event — the
 * menu's Copy, and a copied picture, which a clipboard event cannot carry.
 * Resolves false when the browser refuses (no permission, an insecure page,
 * no `ClipboardItem`) or a newer copy has been made since; the tab's own copy
 * still stands.
 *
 * A picture that cannot be had (it would not decode) is not worth losing the
 * rest for, so the words and the board copy are written again without it.
 */
export async function writeSystemClipboard(payload: ClipboardPayload): Promise<boolean> {
  copies += 1
  const mine = copies
  if (typeof ClipboardItem === 'undefined' || typeof navigator.clipboard?.write !== 'function') {
    return false
  }
  const write = async (item: Record<string, Blob | Promise<Blob>>): Promise<boolean> => {
    try {
      await navigator.clipboard.write([new ClipboardItem(item)])
      return true
    } catch {
      return false
    }
  }
  const text = new Blob([payload.text], { type: 'text/plain' })
  const html = new Blob([payload.html], { type: 'text/html' })
  if (payload.picture !== undefined) {
    /*
     * Handed over as promises rather than awaited first: Safari only writes
     * inside the gesture that asked, and an item made after an await is no
     * longer inside it. A copy made while this one was still encoding makes
     * it fail, so it never lands over the newer one.
     */
    const picture = payload.picture.then((blob) => {
      if (blob === null) throw new Error('no picture')
      if (mine !== copies) throw new Error('a newer copy was made')
      return blob
    })
    const withPicture = picture.then(
      async (blob) => new Blob([await htmlWithPicture(payload, blob)], { type: 'text/html' }),
    )
    if (await write({ 'text/plain': text, 'text/html': withPicture, 'image/png': picture })) {
      return true
    }
  }
  if (mine !== copies) return false
  return write({ 'text/plain': text, 'text/html': html })
}

/**
 * What the system clipboard holds, read on request — Paste special, which a
 * menu press asks for rather than a paste event delivers. The browser may ask
 * the person first, and may refuse; `null` then, so the board can say how to
 * paste instead.
 *
 * `read()` where it exists, for the HTML a document copies with its words;
 * `readText()` where only that does, or where reading the HTML was refused.
 */
export async function readSystemClipboard(): Promise<{ html: string; text: string } | null> {
  const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
  if (clipboard === undefined) return null
  if (typeof clipboard.read === 'function') {
    try {
      const items = await clipboard.read()
      let html = ''
      let text = ''
      for (const item of items) {
        if (html === '' && item.types.includes('text/html')) {
          html = await (await item.getType('text/html')).text()
        }
        if (text === '' && item.types.includes('text/plain')) {
          text = await (await item.getType('text/plain')).text()
        }
      }
      return { html, text }
    } catch {
      // Refused, or not for this content: the words alone may still be read.
    }
  }
  if (typeof clipboard.readText !== 'function') return null
  try {
    return { html: '', text: await clipboard.readText() }
  } catch {
    return null
  }
}
