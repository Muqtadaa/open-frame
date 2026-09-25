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
        if (description === null && tip !== name) return [`${path}: ${tip ?? ''} is never announced`]
        if (description !== null && description === name)
          return [`${path}: ${description} is announced twice`]
        return []
      }),
    )
    expect(faults).toEqual([])
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
  const match = new RegExp(`\\s${name}=("[^"]*"|\\{[^}]*\\})`).exec(tag)
  return match?.[1] ?? null
}
