import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A tip a keyboard can summon (DESIGN.md: "a tooltip only a mouse can summon
 * is not a label").
 *
 * The browser's `title` never appears on focus, so forty-two controls had a
 * label only a mouse could reach. They carry `data-tip` — drawn by the
 * stylesheet on hover and on `:focus-visible` — and the same text as an
 * `aria-description`, unless the tip IS the control's name. `title` survives only where it reveals CONTENT rather
 * than naming a control, and each of those says why here.
 */
const SRC = resolve(process.cwd(), 'src')

const CONTENT: Record<string, string> = {
  'ui/RecordFields.tsx': 'a type-declared field label that ellipsises: the whole of it',
  'canvas/CommentLayer.tsx': "a comment pin's excerpt of what was said",
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return path.endsWith('.tsx') && !path.endsWith('.test.tsx') ? [path] : []
  })
}

describe('tips a keyboard can summon', () => {
  const files = sources(SRC).map((path) => ({
    path: relative(SRC, path),
    source: readFileSync(path, 'utf8'),
  }))

  it('labels no control with a title only a mouse can reach', () => {
    const titled = files
      .filter(({ source }) => /\stitle=[{"]/.test(source.replace(/<BoardTitle title=/g, '')))
      .map(({ path }) => path)
      .filter((path) => !(path in CONTENT))
    expect(titled).toEqual([])
  })

  /*
   * Per ELEMENT, not per file: a count of `data-tip` against a count of
   * `aria-description` passed a file whose descriptions sat on the wrong
   * controls. A tip reaches assistive tech as a description, or as the name
   * when it IS the name — a swatch tipped "red" and labelled "red" was read
   * out "red, red" when it carried both, which is noise, not access.
   */
  it('gives every tip to assistive tech once', () => {
    const faults = files.flatMap(({ path, source }) =>
      tipped(source).flatMap((tag) => {
        const tip = attribute(tag, 'data-tip')
        const name = attribute(tag, 'aria-label')
        const description = attribute(tag, 'aria-description')
        /*
         * A tip that is the name PLUS its shortcut — `tip(label, keys)` beside
         * `aria-label={label}` — reaches assistive tech in two halves: the
         * name, and `aria-keyshortcuts` built from the same keys. Describing
         * it as well would read the name twice.
         */
        const composed = /^\{tip\((.+?),\s*(.+)\)\}$/.exec(tip ?? '')
        if (
          description === null &&
          composed !== null &&
          [`{${composed[1] ?? ''}}`, `"${(composed[1] ?? '').replace(/^'|'$/g, '')}"`].includes(
            name ?? '',
          ) &&
          attribute(tag, 'aria-keyshortcuts') === `{ariaKeys(${composed[2] ?? ''})}`
        ) {
          return []
        }
        if (description === null && tip !== name)
          return [`${path}: ${tip ?? ''} is never announced`]
        if (description !== null && description === name)
          return [`${path}: ${description} is announced twice`]
        return []
      }),
    )
    expect(faults).toEqual([])
  })

  /*
   * A tip is drawn by `::after`, and generated content is part of how a
   * browser computes an element's accessible NAME. So a control that took its
   * name from its contents took its tip as well: the zoom readout was read out
   * "100% Reset to 100% (Ctrl0)", the board's name "Untitled board Rename this
   * board". A tipped control names itself explicitly, and the tip is only ever
   * its description.
   */
  it('names every tipped control, so its tip is never read into the name', () => {
    const unnamed = files.flatMap(({ path, source }) =>
      tipped(source)
        // Only what can be operated takes a name from its contents: a `<p>` or
        // a `<span>` carrying a tip is described, never named.
        .filter((tag) => /^<(button|a)\b/.test(tag) || /\srole=/.test(tag))
        .filter((tag) => !/\saria-label(ledby)?=/.test(tag))
        .map((tag) => `${path}: ${attribute(tag, 'data-tip') ?? tag.slice(0, 60)}`),
    )
    expect(unnamed).toEqual([])
  })
})

/** Every JSX opening tag carrying a `data-tip`, braces and arrows included. */
function tipped(source: string): string[] {
  const tags: string[] = []
  for (let at = source.indexOf('data-tip='); at !== -1; at = source.indexOf('data-tip=', at + 1)) {
    const start = source.lastIndexOf('<', at)
    let depth = 0
    let end = start
    for (; end < source.length; end++) {
      const char = source[end]
      if (char === '{') depth++
      else if (char === '}') depth--
      else if (char === '>' && depth === 0) break
    }
    tags.push(source.slice(start, end))
  }
  return tags
}

/** An attribute's value as written — `"red"` or `{token}` — or null when absent. */
function attribute(tag: string, name: string): string | null {
  const at = new RegExp(`\\s${name}=`).exec(tag)
  if (at === null) return null
  const start = at.index + at[0].length
  if (tag[start] === '"') {
    const end = tag.indexOf('"', start + 1)
    return tag.slice(start, end + 1)
  }
  if (tag[start] !== '{') return null
  /*
   * To the brace that CLOSES this expression, not the first one: a template
   * literal's `${…}` has braces of its own, and stopping at the first cut
   * "Copy a link to ${title}. They can open it" down to "Copy a link to
   * ${title" — which then read as the same text as a shorter name.
   */
  let depth = 0
  for (let end = start; end < tag.length; end++) {
    if (tag[end] === '{') depth++
    else if (tag[end] === '}') {
      depth--
      if (depth === 0) return tag.slice(start, end + 1)
    }
  }
  return null
}
